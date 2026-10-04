import type { File, FileSettings, Folder } from '@prisma/client';
import type {
  FolderTreeResponseDto,
  FolderTreeNodeDto,
  FolderContentResponseDto,
  FileRowDto,
  SearchResultItemDto,
  MovedFolderResponseDto,
  MovedFileResponseDto,
  CreatedFolderResponseDto,
  FileMetaResponseDto,
} from './dto/files-response.dto';
import type { FileSettingsResponseDto } from './dto/files-settings.dto';
import {
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_MAX_SIZE_BYTES,
  DEFAULT_REJECTED_EXTENSIONS,
  FIXED_REJECTED_EXTENSIONS,
} from './files.constants';
import { toTagDto } from '../tags/tags.mapper';
import type {
  FileVersionWithUploader,
  FileWithLatestVersion,
  FolderWithTags,
} from './repositories/files.repository';

/**
 * フラットなフォルダ配列 → ネストツリー（§1 DTO 境界・純粋関数）。
 * 2 パス: 先に全ノード生成 → parentFolderId で子を親 children へ接続。親が集合外（防御的）または
 * null の場合は root とする。兄弟順は入力配列の順序を保持する（呼び出し側で sortOrder 昇順整列済の前提）。
 */
export function toFolderTree(folders: Folder[]): FolderTreeResponseDto {
  const nodeById = new Map<string, FolderTreeNodeDto>();
  for (const f of folders) {
    nodeById.set(f.id, { id: f.id, name: f.name, children: [] });
  }

  const roots: FolderTreeNodeDto[] = [];
  for (const f of folders) {
    const node = nodeById.get(f.id)!;
    const parent = f.parentFolderId != null ? nodeById.get(f.parentFolderId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { roots };
}

/**
 * Folder Entity（付与タグ include 済）→ フォルダ行 DTO（ver / updatedBy / byteSize は folder なので null）。
 * tags は付与タグ（FolderTag→Tag include 済）を TagDto へ変換する（rete-files-0033・file と同じ tag mapper を共有・§3）。
 *
 * 更新日時の由来（cmn-0295）: フォルダ行は folder.updatedAt をそのまま載せる（folder レコード自身の最終
 * 更新時刻＝Prisma の @updatedAt 自動更新。移動やリネームで bump される）。対してファイル行は最新版
 * の createdAt を載せる（§toFileRow の docstring）。この非対称は「フォルダ＝場所、ファイル＝中身」
 * というモデル上の意味的な分離を反映した**意図的な設計**で、移動は場所を動かす操作に過ぎず
 * 中身の版を新しくする操作ではない、という立場を取る。移動の事実はアクティビティ履歴側で残す。
 */
export function toFolderRow(folder: FolderWithTags): FileRowDto {
  return {
    kind: 'folder',
    id: folder.id,
    name: folder.name,
    versionNo: null,
    updatedBy: null,
    updatedAt: folder.updatedAt.toISOString(),
    byteSize: null,
    tags: folder.tags.map((ft) => toTagDto(ft.tag)),
  };
}

/**
 * File Entity（最新版 include 済）→ ファイル行 DTO。
 * 最新版（versions[0]）から版番号・アップロード者名・サイズ・更新日時を載せる。
 * 版が無い異常データ（実体未保存の File）は防御的に null / file.updatedAt にフォールバックする。
 * tags は付与タグ（FileTag→Tag include 済）を TagDto へ変換する（tag マスタの mapper を共有・§3）。
 *
 * 更新日時の由来（cmn-0295）: ファイル行は最新版（versions[0]）の createdAt を載せる。版が無い
 * 異常データの場合のみ file.updatedAt へフォールバックする。フォルダ行が folder.updatedAt を
 * 載せるのとは**意図的な非対称**で（§toFolderRow の docstring）、ファイル一覧での「いつ中身が
 * 差し替わったか」を最新版の作成時刻で表現する立場を採る。DTO は `file.updatedAt` を読まない
 * ため、移動で Prisma の @updatedAt が `file.updatedAt` を bump しても DTO 出力には現れない
 * （移動の事実はアクティビティ履歴側で残す）。移動ペイロードは moveFileAtomic の data に
 * folderId しか含めず、updatedAt の明示指定はしない（spec の完全一致アサートで構造的に pin）。
 */
export function toFileRow(file: FileWithLatestVersion): FileRowDto {
  const latest = file.versions[0] ?? null;
  return {
    kind: 'file',
    id: file.id,
    name: file.name,
    versionNo: latest?.versionNo ?? null,
    updatedBy: latest?.uploadedBy.name ?? null,
    updatedAt: (latest?.createdAt ?? file.updatedAt).toISOString(),
    // byteSize は schema 上 BigInt。JSON 化できる number へ変換する（ファイルサイズは 2^53 に十分収まる）。
    byteSize: latest ? Number(latest.byteSize) : null,
    tags: file.tags.map((ft) => toTagDto(ft.tag)),
  };
}

/**
 * フォルダ内容 → FolderContentResponseDto（§1 DTO 境界・純粋関数）。
 * items はサブフォルダ → ファイルの順（フォルダ優先）。crumb は呼び出し元が組んだ root→対象の順をそのまま使う。
 * 段階権限は ADR 0063 で撤廃済み＝本 Response を返せている時点で「可視 space ＝全操作可」が確定する。
 */
export function toFolderContent(
  folder: Folder,
  subfolders: FolderWithTags[],
  files: FileWithLatestVersion[],
  ancestors: { id: string; name: string }[],
): FolderContentResponseDto {
  return {
    id: folder.id,
    name: folder.name,
    crumb: ancestors.map((a) => ({ id: a.id, name: a.name })),
    items: [...subfolders.map(toFolderRow), ...files.map(toFileRow)],
  };
}

/**
 * アップロード結果（File id/name + 確定した新版 + アップロード者名）→ ファイル行 DTO（§1 DTO 境界）。
 * 一覧の toFileRow と同形の行を返し、frontend がアップロード後に一覧へそのまま反映できるようにする。
 */
export function toUploadedFileRow(
  fileId: string,
  name: string,
  version: FileVersionWithUploader,
): FileRowDto {
  return {
    kind: 'file',
    id: fileId,
    name,
    versionNo: version.versionNo,
    updatedBy: version.uploadedBy.name,
    updatedAt: version.createdAt.toISOString(),
    // byteSize は schema 上 BigInt。JSON 化できる number へ変換する（toFileRow と同方針）。
    byteSize: Number(version.byteSize),
    // アップロード応答はタグを伴わない（新規=未付与・再アップ=版追加のみ）。タグ表示は一覧再取得で反映する。
    tags: [],
  };
}

/**
 * 横断検索ヒット（Folder / File）→ SearchResultItemDto（§1 DTO 境界・純粋関数 / rete-files-0004）。
 * parentFolderId は D&D 移動の「移動元の親」。folder=自身の親（ルート直下は null）、file=所属フォルダ id。
 *
 * 親が可視集合に含まれないフォルダの parentFolderId は null にする（fil-0107）。ヒット自体は
 * そのフォルダが可視だから返るが、親の id をそのまま載せると非可視な親の id が検索経由で
 * 回収できてしまう（同じ制御を経路ごとに割らない）。Space 単位の可視性（ADR 0063）では
 * 同 space 内の親は本来すべて可視のため、この判定は防御的残置。移動元の親として使えないぶんは
 * frontend 側の null 分岐に倒れる＝可視集合外の親へは D&D で戻せない、で挙動としても筋が通る。
 */
export function toSearchFolderItem(
  folder: Folder,
  visibleFolderIds: ReadonlySet<string>,
): SearchResultItemDto {
  const parentVisible =
    folder.parentFolderId !== null && visibleFolderIds.has(folder.parentFolderId);
  return {
    kind: 'folder',
    id: folder.id,
    name: folder.name,
    parentFolderId: parentVisible ? folder.parentFolderId : null,
  };
}

export function toSearchFileItem(file: File): SearchResultItemDto {
  return { kind: 'file', id: file.id, name: file.name, parentFolderId: file.folderId };
}

/** Folder Entity → フォルダ移動結果 DTO（§1 DTO 境界・純粋関数）。 */
export function toMovedFolder(folder: Folder): MovedFolderResponseDto {
  return {
    id: folder.id,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
  };
}

/** File Entity → ファイル移動結果 DTO（§1 DTO 境界・純粋関数）。 */
export function toMovedFile(file: File): MovedFileResponseDto {
  return {
    id: file.id,
    name: file.name,
    folderId: file.folderId,
  };
}

/** Folder Entity → フォルダ作成結果 DTO（§1 DTO 境界・純粋関数）。 */
export function toCreatedFolder(folder: Folder): CreatedFolderResponseDto {
  return {
    id: folder.id,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
  };
}

/**
 * File Entity + 最新版番号 → ファイルメタ DTO（§1 DTO 境界・純粋関数 / FF お気に入り編集）。
 * versionNo は getMaxVersionNo の戻り（版なし=0）を受け、0 以下は版未保存とみなし null へ写す。
 */
export function toFileMeta(file: File, versionNo: number): FileMetaResponseDto {
  return {
    id: file.id,
    name: file.name,
    folderId: file.folderId,
    versionNo: versionNo > 0 ? versionNo : null,
  };
}

/**
 * FileSettings Entity → 設定 DTO（§1 DTO 境界・純粋関数）。
 * 設定行が無い（null）場合は app 既定（hard cap / 全許可 / 固定の拒否拡張子 / 既定の追加拒否拡張子）へ
 * フォールバックする。fixedRejectedExtensions はコード定数（DB に持たない）をそのまま載せる＝要求版2 で
 * 常時拒否の層を設定から分離したため、保存値ではなくコードが正本になる。
 * maxSizeBytes は schema 上 BigInt のため JSON 化できる number へ変換する（上限は hard cap = 100MiB で 2^53 内）。
 */
export function toFileSettings(settings: FileSettings | null): FileSettingsResponseDto {
  const fixed = [...FIXED_REJECTED_EXTENSIONS];
  if (!settings) {
    return {
      maxSizeBytes: DEFAULT_MAX_SIZE_BYTES,
      allowedExtensions: [...DEFAULT_ALLOWED_EXTENSIONS],
      fixedRejectedExtensions: fixed,
      rejectedExtensions: [...DEFAULT_REJECTED_EXTENSIONS],
    };
  }
  return {
    maxSizeBytes: Number(settings.maxSizeBytes),
    allowedExtensions: settings.allowedExtensions,
    fixedRejectedExtensions: fixed,
    rejectedExtensions: settings.rejectedExtensions,
  };
}
