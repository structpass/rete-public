/**
 * フォルダ階層 D&D アップロードの再帰オーケストレーション（fil-0055）。
 *
 * ブラウザ標準の `DataTransferItem.webkitGetAsEntry()` が返す FileSystemEntry を再帰走査し、
 * ディレクトリは rete のフォルダ作成 API、ファイルは既存アップロード API へ流す（階層はフロントの
 * 走査で組み、サーバは単発 API の使い回し＝バルク API 新設より可逆・最小／設計 fil-0055 採用案）。
 *
 * - 走査は**深さ優先・逐次**（順序を単純化し backend を一度に殺到させない）。
 * - **ロールバック方針＝ベストエフォート（破壊的ロールバックはしない）**: 一部失敗しても作成済み
 *   フォルダ / アップロード済みファイルは残し、失敗パスを集計して呼び出し側へ返す。途中失敗で
 *   作成済みフォルダを消すと、同名の既存フォルダを巻き込み削除する危険があるため、安全側（消さない）を採る。
 * - フォルダ作成に失敗したら配下は辿らない（着地先フォルダが無いため）。失敗はパスで記録して継続する。
 */
import { uploadFailureReason } from './upload-failure-message';

/**
 * `webkitGetAsEntry()` が返す FileSystemEntry の構造的最小形。
 * DOM の FileSystemEntry / FileSystemDirectoryEntry に適合しつつ、テストで素のオブジェクトを渡せるよう
 * 構造的型で受ける（file() / createReader() はコールバック式なので本モジュールで Promise 化する）。
 */
export interface FsEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  /** ファイルエントリ: 実体 File を取り出す（FileSystemFileEntry.file）。 */
  file?: (success: (file: File) => void, error?: (err: unknown) => void) => void;
  /** ディレクトリエントリ: 子エントリ読み取り用 reader を作る（FileSystemDirectoryEntry.createReader）。 */
  createReader?: () => FsDirectoryReaderLike;
}

/** FileSystemDirectoryReader の構造的最小形。readEntries は空配列が返るまで繰り返し呼ぶ仕様。 */
export interface FsDirectoryReaderLike {
  readEntries: (success: (entries: FsEntryLike[]) => void, error?: (err: unknown) => void) => void;
}

/**
 * 走査の上限（fil-0056・自己 DoS 対策）。数万ファイル構造のドロップでメモリ占有＋逐次アップロードが
 * 延々続くのを防ぐ。超過は黙って切らず拒否＋通知（result.limited に理由を載せて呼び出し側が UX 表示）。
 * いずれも後日 1 改修で調整可（可逆・設計 fil-0056 採用値）。
 */
export const FOLDER_UPLOAD_LIMITS = {
  /** 作成フォルダの最大深さ（root 直下を depth 0 とし、これ以上深い階層は辿らない）。 */
  maxDepth: 20,
  /** 1 ディレクトリ直下の最大項目数（超過したフォルダは配下を諦める）。 */
  maxChildrenPerDir: 1000,
  /** アップロード総ファイル数の上限（到達で以降を中断）。 */
  maxTotalFiles: 2000,
  /**
   * 作成総フォルダ数の上限（到達で以降を中断・fil-0056 security HIGH）。
   * フォルダのみで構成されたツリー（空ディレクトリ大量・node_modules 等）では maxTotalFiles では
   * createFolder の連続発火を断てないため、フォルダ軸にも別途上限を設ける。
   */
  maxTotalFolders: 2000,
  /** failedPaths 配列の最大保持件数（大量失敗時のメモリ占有を防ぐ・count は別途全件保持）。 */
  maxFailedPaths: 100,
} as const;

/** 上限の型（値は number。as const のリテラル型だと上書き注入が弾かれるため number へ広げる）。 */
export type FolderUploadLimits = { -readonly [K in keyof typeof FOLDER_UPLOAD_LIMITS]: number };

/** readAllChildren が per-dir 上限を超えたことを示す内部エラー（呼び出し側で理由を出し分けるため）。 */
class ChildrenLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`children exceeded ${limit}`);
  }
}

/** 走査が使う API 群（既存 createFolder / uploadFile を注入＝テスト容易・lib 非依存）。 */
export interface UploadEntriesDeps {
  /** 親フォルダ配下にフォルダを作成し、作成された id を返す。 */
  createFolder: (parentFolderId: string, name: string) => Promise<{ id: string }>;
  /** フォルダへファイルを 1 件アップロードする。 */
  uploadFile: (folderId: string, file: File) => Promise<unknown>;
  /** 進捗通知（大量ファイル時の「処理中」表示用・任意）。各成功/失敗の度に呼ばれる。 */
  onProgress?: (progress: UploadEntriesProgress) => void;
  /** 上限の上書き（任意・既定は FOLDER_UPLOAD_LIMITS）。テストで小さな値を注入するためにも使う。 */
  limits?: Partial<FolderUploadLimits>;
}

export interface UploadEntriesProgress {
  /** 作成したフォルダ数（累計）。 */
  folders: number;
  /** アップロード成功ファイル数（累計）。 */
  files: number;
  /** 失敗件数（累計）。 */
  failed: number;
}

export interface UploadEntriesResult extends UploadEntriesProgress {
  /** 失敗したパス一覧（"親/子/ファイル.txt" 形式・フォルダ作成失敗は末尾 "/"）。maxFailedPaths で truncate。 */
  failedPaths: string[];
  /**
   * 失敗したパス → サーバーが返した拒否理由（v2-191）。上限やブラウザ API 由来の失敗（階層・項目数の
   * 上限、エントリ読み取り失敗など）は理由を持たないため載らない。failedPaths と同じ上限で truncate する。
   */
  failedReasons: Record<string, string>;
  /** 上限超過で処理を打ち切った場合の理由（UX 通知用）。未超過なら undefined。 */
  limited?: string;
}

/** FileSystemFileEntry.file をコールバック → Promise 化。 */
function readFile(entry: FsEntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!entry.file) {
      reject(new Error('not a file entry'));
      return;
    }
    entry.file(resolve, reject);
  });
}

/**
 * ディレクトリの子エントリを全件読む。readEntries は 1 回で最大 100 件程度しか返さない実装があるため、
 * 空配列が返るまで繰り返し呼んで連結する（仕様準拠・取りこぼし防止）。
 */
function readAllChildren(dir: FsEntryLike, maxChildren: number): Promise<FsEntryLike[]> {
  return new Promise((resolve, reject) => {
    if (!dir.createReader) {
      resolve([]);
      return;
    }
    const reader = dir.createReader();
    const all: FsEntryLike[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        // per-dir 上限（fil-0056）。全件バッファ前に打ち切り、上位で「拒否＋通知」に変換する。
        if (all.length > maxChildren) {
          reject(new ChildrenLimitError(maxChildren));
          return;
        }
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

/**
 * ドロップされた FileSystemEntry 群を rootFolderId 配下へ階層ごと再帰アップロードする。
 * トップレベルにファイルとフォルダが混在しても両方処理する（ファイルは root へ、フォルダは作成して配下を辿る）。
 */
export async function uploadEntries(
  rootFolderId: string,
  entries: FsEntryLike[],
  deps: UploadEntriesDeps,
): Promise<UploadEntriesResult> {
  const limits: FolderUploadLimits = { ...FOLDER_UPLOAD_LIMITS, ...deps.limits };
  const result: UploadEntriesResult = {
    folders: 0,
    files: 0,
    failed: 0,
    failedPaths: [],
    failedReasons: {},
  };
  // 総ファイル上限に到達したら以降の走査を止める（"延々継続" を断つ・fil-0056）。
  let aborted = false;

  const notify = () =>
    deps.onProgress?.({ folders: result.folders, files: result.files, failed: result.failed });
  // failed は全件カウント・failedPaths は maxFailedPaths で truncate（大量失敗時のメモリ占有を防ぐ・fil-0056）。
  // 理由も同じ上限に揃える（パスを出せない失敗の理由だけを溜めても通知に使えない）。
  const pushFailed = (p: string, reason?: string) => {
    result.failed += 1;
    if (result.failedPaths.length < limits.maxFailedPaths) {
      result.failedPaths.push(p);
      if (reason) result.failedReasons[p] = reason;
    }
  };
  const markLimited = (reason: string) => {
    if (!result.limited) result.limited = reason;
  };

  const walk = async (
    parentFolderId: string,
    entry: FsEntryLike,
    prefix: string,
    depth: number,
  ): Promise<void> => {
    if (aborted) return;
    const path = prefix + entry.name;
    if (entry.isFile) {
      // 総ファイル上限に到達したら、以降を黙って切らず中断して理由を通知する。
      if (result.files >= limits.maxTotalFiles) {
        aborted = true;
        markLimited(
          `ファイル数が上限(${limits.maxTotalFiles}件)に達したため、以降のアップロードを中断しました`,
        );
        return;
      }
      try {
        const file = await readFile(entry);
        await deps.uploadFile(parentFolderId, file);
        result.files += 1;
      } catch (err) {
        // サーバーの拒否理由（実行形式・サイズ・拡張子）を残す（v2-191）。読めない応答は汎用文言に倒す。
        pushFailed(path, uploadFailureReason(err));
      }
      notify();
      return;
    }
    if (entry.isDirectory) {
      // 深さ上限（fil-0056）。これ以上深い階層は着地フォルダを作らず配下を諦める。
      if (depth >= limits.maxDepth) {
        pushFailed(`${path}/`);
        markLimited(
          `フォルダ階層が上限(${limits.maxDepth}段)を超えたため、深い階層の一部を中断しました`,
        );
        notify();
        return;
      }
      let createdId: string;
      try {
        const created = await deps.createFolder(parentFolderId, entry.name);
        createdId = created.id;
        result.folders += 1;
      } catch {
        // フォルダ作成失敗＝着地先が無いので配下は辿らない（安全側）。
        pushFailed(`${path}/`);
        notify();
        return;
      }
      notify();
      // 総フォルダ上限（fil-0056・security HIGH）。フォルダのみのツリーで createFolder が
      // 無制限に走るのを断つ（maxTotalFiles では止められない軸）。
      if (result.folders >= limits.maxTotalFolders) {
        aborted = true;
        markLimited(
          `フォルダ数が上限(${limits.maxTotalFolders}件)に達したため、以降の作成を中断しました`,
        );
        return;
      }
      // 子エントリ読み取りは createFolder 成功後に行う。readEntries が reject しても（権限エラー /
      // per-dir 上限超過・ブラウザの読み取り上限など）上位へ伝播させず、作成済みフォルダは残して配下を諦め
      // 失敗記録のみ継続する（try/catch の外だと rejection が uploadEntries まで素通りしベストエフォートが破綻する）。
      let children: FsEntryLike[];
      try {
        children = await readAllChildren(entry, limits.maxChildrenPerDir);
      } catch (err) {
        pushFailed(`${path}/`);
        if (err instanceof ChildrenLimitError) {
          markLimited(
            `1フォルダ内の項目数が上限(${limits.maxChildrenPerDir}件)を超えたため、一部を中断しました`,
          );
        }
        notify();
        return;
      }
      for (const child of children) {
        await walk(createdId, child, `${path}/`, depth + 1);
        if (aborted) return;
      }
      return;
    }
    // ファイルでもディレクトリでもない（シンボリックリンク相当など・標準 API では通常発生しない）。
    // best-effort の一貫性として黙殺せず失敗に記録する（code-review LOW）。
    pushFailed(path);
    notify();
  };

  for (const entry of entries) {
    await walk(rootFolderId, entry, '', 0);
    if (aborted) break;
  }
  return result;
}
