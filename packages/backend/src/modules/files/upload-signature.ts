import * as fsPromises from 'fs/promises';
import { filetypeinfo } from 'magic-bytes.js';
import { extname } from 'path';

/**
 * magic-bytes.js@1.13.1 では検出されないが、実行形式で恒久拒否すべき追加シグネチャ（fil-0140 HIGH-2 対策）。
 *
 * - Mach-O 32-bit big-endian (FE ED FA CE): upstream の pattern-tree.js:1146 で末尾 `0xC` と typo しており
 *   magic-bytes が空配列を返す。PowerPC 期の Mac で使われていた形式で、実害は限定的だが criteria 3
 *   「Mach-O 等は常に拒否」の保証を満たすため自前で先頭 4 byte を比較する。
 */
const EXECUTABLE_HEAD_SIGNATURES: ReadonlyArray<readonly number[]> = [
  [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32-bit big-endian (PowerPC 等)
];

/**
 * 先頭バイトが BOM なら除去して本体を返す（fil-0140 HIGH-1 対策）。
 *
 * magic-bytes.js@1.13.1 は UTF-8 BOM (`EF BB BF`) / UTF-16 LE BOM (`FF FE`) / UTF-32 LE BOM (`FF FE 00 00`)
 * を全て typename='class' として報告する。これは BOM 自体は 0xEF/0xFF で始まるバイト列を Java class の
 * シグネチャと誤マッチしているためで、Windows の Notepad / Visual Studio / Excel が UTF-8 BOM 付きで
 * 保存する経路（HTML / CSV / MD 等）で text ファイルが「実行形式」として誤拒否される。
 *
 * 対処: 先頭の BOM を検出して取り除き、本体バイト列で magic-bytes を判定させる。HTML の
 * `<` 等は BOM 直後に来るので取り除いたあと text として正しく検出される。UTF-16/32 LE BOM を
 * 取り除いたあとのバイト列は UTF-16/32 符号化のままなので magic-bytes は「判定不能」を返し、
 * クライアント申告 mime を維持して通過する（criteria 2 準拠）。
 */
const BOMS: ReadonlyArray<readonly number[]> = [
  [0xef, 0xbb, 0xbf], // UTF-8
  [0xff, 0xfe], // UTF-16 LE
  [0xfe, 0xff], // UTF-16 BE
  [0xff, 0xfe, 0x00, 0x00], // UTF-32 LE
  [0x00, 0x00, 0xfe, 0xff], // UTF-32 BE
];

function stripBom(bytes: Uint8Array): Uint8Array {
  for (const bom of BOMS) {
    if (bytes.length < bom.length) continue;
    let match = true;
    for (let i = 0; i < bom.length; i++) {
      if (bytes[i] !== bom[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      return bytes.subarray(bom.length);
    }
  }
  return bytes;
}

/**
 * 先頭バイト列が EXECUTABLE_HEAD_SIGNATURES のいずれかに一致するか（fil-0140 HIGH-2 対策）。
 * magic-bytes が空を返すケースをここで補完する。
 */
function hasExecutableHeadSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return EXECUTABLE_HEAD_SIGNATURES.some((sig) => {
    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== sig[i]) return false;
    }
    return true;
  });
}

/**
 * アップロード必須経路（fil-0140）: 内容署名（magic-bytes）で拡張子偽装と実行形式の侵入を防ぐ。
 *
 * 設計の要点:
 * - multipart 層の diskStorage（fil-0121）とハードリミットは維持し、本判定はアップロード本文の先頭
 *   バイトだけを読み、RAM 全量保持はしない（criteria 6）。先頭 8192 byte を読み magic-bytes.js へ渡す。
 * - 拒否が確定した時は throw し、呼び出し側の try / finally が multer 一時ファイルを削除する。FileVersion
 *   レコードは DB 書き込み前に弾くため残らない（criteria 5）。
 * - 判定不能（detected が空）の形式はクライアント申告 mime を維持し従来どおり許可する（criteria 2）。
 * - 先頭 1 バイトだけを署名にした弱い検出（Json = `{` / `[`、mpeg = `G`）は不一致判定に使わない
 *   （WEAK_DETECTIONS）。`[section]` で始まる ini や `GitHub ...` で始まる md など、拡張子が正しい
 *   正当なテキストまで拒否されるため（v2-189）。
 * - 検出できた形式の保存 mime は検出 mime を採り、クライアント申告 mime の偽装を断つ（criteria 4）。
 * - jpg/jpeg・tif/tiff・htm/html は同一群として扱う（criteria 1）。htm/html は magic-bytes が検出できない
 *   ため、検出不能パスを通さず拡張子のみで許可する。
 * - OOXML（docx/xlsx/pptx）等の zip 系コンテナは同じ ZIP シグネチャ（PK\x03\x04）が出るため、zip
 *   コンテナ系の拡張子は zip 系検出のうちいずれかが当たれば許可する（criteria 1）。
 * - 実行形式（PE/EXE・ELF・Mach-O）はファイル名の拡張子に関わらず常に拒否する（criteria 3）。
 *
 * 外部依存方針（operational-policy.md §3）: magic-bytes.js はアップロード必須経路の
 * 「止める側」判定として追加（依存障害時はアップロードを業務エラーで止める）。
 */

/** 読み取る先頭バイト数。magic-bytes.js は ~4100 byte まで参照するため余裕を持って 8192。 */
const SIGNATURE_HEAD_BYTES = 8192;

/**
 * 同一視する拡張子ペア（criteria 1: jpg=jpeg, tif=tiff, htm=html）。
 *
 * magic-bytes.js は拡張子 1 つに対し 1 つの canonical typename を返すため、jpg 拡張子には
 * 「jpg」typename を当て、jpeg 拡張子も同じ「jpg」typename へ正規化する。tif/tiff は
 * magic-bytes がバイト順（LE/BE）で異なる canonical 名を出すため 'tif' に寄せず両対応する
 * （tif/tiff 両方ともマジックバイトが一致すれば通過させる＝後段の OR 比較で吸収）。
 */
const EXTENSION_ALIASES: Record<string, string> = {
  jpg: 'jpg',
  jpeg: 'jpg',
  // tif / tiff は下記 tif/tiff-both フラグで両方許容する（正規化名に依存しない）。
  tif: 'tif',
  tiff: 'tiff',
  // htm / html は magic-bytes が検出できないため alias は実質到達しない（dead branch）。
  htm: 'html',
  html: 'html',
};

/** tif と tiff は両方とも同じ image/tiff バイト列に付くため、両方の正規化名を受け入れる。 */
const TIFF_ALIASES = new Set(['tif', 'tiff']);

/**
 * 不一致判定に使わない「弱い検出」の正規化名（v2-189）。
 *
 * magic-bytes.js@1.13.1 には署名が先頭 1 バイトだけの typename がある。1 バイトは内容の証拠にならず、
 * 正当なテキストの先頭文字と衝突する。衝突するのは印字可能な文字を署名にした次の 2 種:
 * - Json … `{` = 0x7B / `[` = 0x5B（`[section]` で始まる ini / toml / cfg / conf、`{` 始まりのテキスト全般）
 * - mpeg … `G` = 0x47（`GitHub ...` で始まる md、`Group,...` で始まる csv 等）
 * これらを不一致として扱うと、拡張子が正しい正当なテキストが保存前に 400「ファイルの内容と拡張子が
 * 一致しません」で拒否される（v2-189: DiskInfo3.ini が実際に弾かれた）。
 *
 * 同じ 1 バイト署名でも pic / pif / sea / ytr（いずれも 0x00）は除外しない。正当なテキストの先頭が 0x00 に
 * なるのは BOM 無しの UTF-16BE だけで、BOM 付きは stripBom 済み・BOM 無しは極めて稀なため、衝突による
 * 誤拒否が実測されない範囲へ除外を閉じる（security review の指摘を反映）。
 *
 * 除外するのは「拡張子自身が弱い検出と同じ系統でない時」だけ。拡張子が json の時は従来どおり一致判定に
 * 使い、検出 mime（application/json）も採用する。
 *
 * 拡張子ごとの許可リスト方式（テキスト系拡張子では弱い検出を使わない、という一覧で持つ形）は採らない。
 * 一覧に無い拡張子が来るたびに同じ誤拒否（v2-189 の形）が再発するため。代わりに「1 バイト署名は内容の
 * 証拠にしない」を一般則として置く。この一般則により `{` / `[` 始まりのテキストで拡張子だけ偽装した
 * ファイルは不一致判定にならないが、ダウンロードは常に attachment で mime 依存の描画もなく実害が
 * 限定的であることを確認のうえ許容する（security review の指摘。許容は確認済み）。
 */
const WEAK_DETECTIONS = new Set(['json', 'mpeg']);

/**
 * 拡張子で許可する zip コンテナ系。magic-bytes は同じ PK\x03\x04 を複数の typename で返すため、
 * これらの拡張子は「zip 系検出のうち 1 件でも typename が ZIP_CONTAINER_TYPES に当たれば」許可する。
 */
const ZIP_CONTAINER_EXTENSIONS = new Set([
  'zip',
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'vsdx',
  'jar',
  'apk',
  'aar',
]);

/** zip 系として検出される typename の集合（magic-bytes.js 1.13.1 の出力に基づく）。 */
const ZIP_CONTAINER_TYPES = new Set([
  'zip',
  'jar',
  'odt',
  'ods',
  'odp',
  'docx',
  'xlsx',
  'pptx',
  'vsdx',
  'apk',
  'aar',
]);

/**
 * 実行形式として常に拒否する typename の集合（criteria 3）。
 *
 * - exe: PE/MZ（Windows 実行ファイル・DLL）
 * - ELF: Linux 実行ファイル
 * - Mach-O: macOS 実行ファイル
 * - class: Java バイトコード（classpath 経由で実行される実行形式と同等の脅威）
 *
 * magic-bytes.js 1.13.1 では PE/MZ・Java class は mime を返さないが typename で識別できる。
 */
const EXECUTABLE_TYPES = new Set(['exe', 'ELF', 'Mach-O', 'class']);

/**
 * 拡張子＋mimetype の取り出し素材。
 * - buffer: memoryStorage 経路（テスト・後方互換）
 * - path: diskStorage 経路（fil-0121・本番本線）
 * - mimetype: クライアント申告（multipart の Content-Type）
 */
export interface SignatureSource {
  buffer?: Buffer;
  path?: string;
  mimetype: string;
}

/** 検査結果（service 層が分岐に使う）。 */
export interface SignatureCheckResult {
  /** 検出 mime（保存時にクライアント申告より優先）。判定不能時は undefined。 */
  detectedMime?: string;
  /** 実行形式を検出した（常に拒否）。 */
  isExecutable: boolean;
  /** 拡張子と検出内容の不一致（保存拒否）。 */
  isMismatch: boolean;
}

/**
 * アップロード元（diskStorage or memoryStorage）から先頭バイトを読み、magic-bytes で
 * 拡張子との整合と実行形式混入を検査する。
 *
 * throw しない（呼び出し側が BadRequestException へ翻訳する）。検査失敗時は呼び出し側で
 * 一時ファイル削除と業務エラーを担当する。
 */
export async function checkUploadSignature(
  source: SignatureSource,
  filename: string,
): Promise<SignatureCheckResult> {
  const ext = extname(filename).toLowerCase().replace(/^\./, '');
  const rawBytes = await readHeadBytes(source);

  // HIGH-2 対策: magic-bytes が検出しない実行形式シグネチャ（先頭 4 byte 直比較）を先にチェック。
  // BOM を剥がす前に見る必要がある（FE ED FA CE は BOM と被らないが、安全のため rawBytes で判定）。
  if (hasExecutableHeadSignature(rawBytes)) {
    return { isExecutable: true, isMismatch: false };
  }

  // HIGH-1 対策: BOM を先頭から除去してから magic-bytes へ渡す（Windows の UTF-8 BOM 付き
  // テキストファイルが class 誤検出されないように）。
  const bytes = stripBom(rawBytes);
  const detected = filetypeinfo(bytes);

  if (detected.length === 0) {
    // 判定不能。htm/html（magic-bytes が検出できない）は拡張子のみで許可（criteria 1）。
    // その他の未知形式は detected=空で通過＝クライアント申告 mime を維持（criteria 2）。
    return { isExecutable: false, isMismatch: false };
  }

  // 実行形式が検出されたら拡張子に関わらず常に拒否（criteria 3）。
  if (detected.some((d) => EXECUTABLE_TYPES.has(d.typename))) {
    return { isExecutable: true, isMismatch: false };
  }

  // zip コンテナ系は特殊扱い: zip 系 typename のうち 1 件でも当たれば OK（OOXML 等・criteria 1）。
  if (ZIP_CONTAINER_EXTENSIONS.has(ext)) {
    const matchesZip = detected.some((d) => ZIP_CONTAINER_TYPES.has(d.typename));
    // 拡張子固有の mime を優先採用（docx には wordprocessingml、xlsx には spreadsheetml 等）。
    // magic-bytes は同じ zip シグネチャに対し複数 typename を返し先頭は汎用 "application/zip" のため、
    // 拡張子と一致する typename の mime があればそちらを採用する。
    // extension は先頭ドット付きのことがあるので normalizeExt で揃える（fil-0140 HIGH-1 と同根）。
    const matchedByExt = detected.find(
      (d) =>
        ZIP_CONTAINER_TYPES.has(d.typename) &&
        d.extension !== undefined &&
        normalizeExt(d.extension) === ext,
    );
    const detectedMime = matchedByExt?.mime ?? detected.find((d) => d.mime)?.mime;
    if (matchesZip) {
      return { detectedMime, isExecutable: false, isMismatch: false };
    }
    // zip 拡張子だが zip 系検出なし → 不一致として拒否。
    return { detectedMime, isExecutable: false, isMismatch: true };
  }

  // 通常の整合検査: 拡張子の正規化名と typename または extension が一致するか。
  // magic-bytes.js 1.13.1 は JSON を typename='Json'（大小混在）/ extension='.json'（先頭ドット）で返すため、
  // 比較対象を全部小文字化＋先頭ドット除去で正規化する。これがないと .json や .rtf が正規ユーザーで
  // 拒否される（fil-0140 HIGH-1）。
  const normalizedExt = normalizeExt(EXTENSION_ALIASES[ext] ?? ext);
  // 弱い検出（先頭1バイトの JSON 等）は、拡張子自身がその系統の時だけ一致判定に使う（WEAK_DETECTIONS 参照）。
  const usable = WEAK_DETECTIONS.has(normalizedExt)
    ? detected
    : detected.filter((d) => !WEAK_DETECTIONS.has(normalizeExt(d.typename)));
  if (usable.length === 0) {
    // 弱い検出しか無い＝実質判定不能。クライアント申告 mime を維持して通す（criteria 2 と同じ扱い）。
    return { isExecutable: false, isMismatch: false };
  }
  // tif/tiff だけは両方の canonical 名を許容する（LE は 'tif', BE は 'tiff' が typename になる）。
  const acceptedNames = TIFF_ALIASES.has(normalizedExt) ? ['tif', 'tiff'] : [normalizedExt];
  const matches = usable.some((d) => {
    const dName = normalizeExt(d.typename);
    if (acceptedNames.includes(dName)) return true;
    if (d.extension !== undefined && acceptedNames.includes(normalizeExt(d.extension))) return true;
    return false;
  });
  const detectedMime = usable.find((d) => d.mime)?.mime;
  if (!matches) {
    return { detectedMime, isExecutable: false, isMismatch: true };
  }
  return { detectedMime, isExecutable: false, isMismatch: false };
}

/**
 * diskStorage（fil-0121）の path 優先で先頭バイトを読み出す。path が無い（memoryStorage 経路）
 * なら buffer を使う。本線は controller の diskStorage で path が入るのが前提（criteria 6）。
 */
async function readHeadBytes(source: SignatureSource): Promise<Uint8Array> {
  if (source.path) {
    const handle = await fsPromises.open(source.path, 'r');
    try {
      const buffer = Buffer.alloc(SIGNATURE_HEAD_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, SIGNATURE_HEAD_BYTES, 0);
      // 読み出した有効範囲だけを返す（末尾の未初期化領域を含めない）。
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close().catch(() => undefined);
    }
  }
  if (source.buffer && source.buffer.length > 0) {
    return source.buffer.subarray(0, Math.min(source.buffer.length, SIGNATURE_HEAD_BYTES));
  }
  // 両方無いのは呼び出し側の契約違反。判定不能として返す（後段の buffer 短絡で throw させない）。
  return new Uint8Array(0);
}

/**
 * 拡張子比較用の正規化: 小文字化＋先頭ドット除去。
 * - magic-bytes.js の typename は大小混在（例 'Json'）・extension は先頭にドット付き（例 '.json'）で返る。
 * - 一方 extname() の出力は ".jpg" のように先頭ドット付きで取り出されるため、normalizeExt(ext) で
 *   「先頭ドット無し＋小文字」に揃える。
 */
function normalizeExt(value: string): string {
  return value.toLowerCase().replace(/^\./, '');
}
