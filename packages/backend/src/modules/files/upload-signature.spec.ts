import * as fsPromises from 'fs/promises';
import { checkUploadSignature } from './upload-signature';

/**
 * upload-signature.ts の単体テスト（fil-0140）。
 *
 * 検査ロジック自体は service 経由でも固定するが、helper 単独の境界条件
 * （htm/html が判定不能で通過すること、判定不能時に detectedMime が undefined であること等）を
 * service モックの影響なく直接固定するため本ファイルを設ける。
 */

// diskStorage 経路のバイト列注入。path テストでは fs.promises.open をモックして任意バイト列を返す。
// requireActual の型は上の名前空間 import を typeof で受ける（consistent-type-imports が
// インライン `import()` 型注釈を禁じるため）。型は実行時に消えるので factory の制約に掛からない。
jest.mock('fs/promises', () => ({
  ...jest.requireActual<typeof fsPromises>('fs/promises'),
  open: jest.fn(),
}));

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PE_SIG = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
const ELF_SIG = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
const MACHO_BE = Buffer.from([0xfe, 0xed, 0xfa, 0xcf]);
const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PDF_SIG = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const HTML_BYTES = Buffer.from('<!DOCTYPE html><html><body>hi</body></html>', 'utf8');
const PLAIN_TEXT = Buffer.from('判定不能なテキスト', 'utf8');

function mockFileBytes(bytes: Buffer): void {
  (fsPromises.open as jest.Mock).mockResolvedValue({
    read: jest.fn().mockImplementation((dest: Buffer) => {
      bytes.copy(dest, 0, 0, bytes.length);
      return Promise.resolve({ bytesRead: bytes.length, buffer: dest });
    }),
    close: jest.fn().mockResolvedValue(undefined),
  });
}

describe('checkUploadSignature (fil-0140)', () => {
  describe('buffer 経路', () => {
    it('JPEG バイト列 + .jpg 拡張子 → 検出 mime = image/jpeg、不整合なし', async () => {
      const result = await checkUploadSignature(
        { buffer: JPEG_SIG, mimetype: 'application/octet-stream' },
        'photo.jpg',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBe('image/jpeg');
    });

    it('JPEG バイト列 + .jpeg 拡張子 → 検出 mime = image/jpeg（jpg/jpeg を同義として扱う）', async () => {
      const result = await checkUploadSignature(
        { buffer: JPEG_SIG, mimetype: 'application/octet-stream' },
        'photo.jpeg',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBe('image/jpeg');
    });

    it('JPEG バイト列 + .pdf 拡張子 → 不整合', async () => {
      const result = await checkUploadSignature(
        { buffer: JPEG_SIG, mimetype: 'application/octet-stream' },
        'fake.pdf',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(true);
    });

    it('PE/MZ バイト列 + .pdf 拡張子 → 実行形式（拡張子に関わらず拒否）', async () => {
      const result = await checkUploadSignature(
        { buffer: PE_SIG, mimetype: 'application/octet-stream' },
        'malware.pdf',
      );
      expect(result.isExecutable).toBe(true);
      expect(result.isMismatch).toBe(false);
    });

    it('PE/MZ バイト列 + .exe 拡張子 → 実行形式', async () => {
      const result = await checkUploadSignature(
        { buffer: PE_SIG, mimetype: 'application/octet-stream' },
        'a.exe',
      );
      expect(result.isExecutable).toBe(true);
    });

    it('ELF バイト列 → 実行形式', async () => {
      const result = await checkUploadSignature(
        { buffer: ELF_SIG, mimetype: 'application/octet-stream' },
        'a.bin',
      );
      expect(result.isExecutable).toBe(true);
    });

    it('Mach-O バイト列 → 実行形式', async () => {
      const result = await checkUploadSignature(
        { buffer: MACHO_BE, mimetype: 'application/octet-stream' },
        'a.bin',
      );
      expect(result.isExecutable).toBe(true);
    });

    it('OOXML (.docx) + zip シグネチャ → 検出 mime が docx 固有のもの（wordprocessingml）になる', async () => {
      const result = await checkUploadSignature(
        { buffer: ZIP_SIG, mimetype: 'application/octet-stream' },
        'report.docx',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toContain('openxmlformats-officedocument.wordprocessingml');
    });

    it('OOXML (.xlsx) + zip シグネチャ → 検出 mime が xlsx 固有のもの（spreadsheetml）になる', async () => {
      const result = await checkUploadSignature(
        { buffer: ZIP_SIG, mimetype: 'application/octet-stream' },
        'sheet.xlsx',
      );
      expect(result.detectedMime).toContain('spreadsheetml.sheet');
    });

    it('.zip 拡張子 + zip シグネチャ → 不整合なしで通過', async () => {
      const result = await checkUploadSignature(
        { buffer: ZIP_SIG, mimetype: 'application/octet-stream' },
        'a.zip',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBe('application/zip');
    });

    it('.docx 拡張子だが中身が PNG → 不整合', async () => {
      const result = await checkUploadSignature(
        { buffer: PNG_SIG, mimetype: 'image/png' },
        'trick.docx',
      );
      expect(result.isMismatch).toBe(true);
      expect(result.isExecutable).toBe(false);
    });

    it('HTML バイト列 + .html 拡張子 → 判定不能として通過し detectedMime は undefined', async () => {
      const result = await checkUploadSignature(
        { buffer: HTML_BYTES, mimetype: 'text/html' },
        'page.html',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it('HTML バイト列 + .htm 拡張子 → 同様に通過', async () => {
      const result = await checkUploadSignature(
        { buffer: HTML_BYTES, mimetype: 'text/html' },
        'page.htm',
      );
      expect(result.isMismatch).toBe(false);
    });

    it('判定不能な plain text → 通過し detectedMime は undefined（クライアント mime を維持する経路）', async () => {
      const result = await checkUploadSignature(
        { buffer: PLAIN_TEXT, mimetype: 'text/plain' },
        'memo.txt',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it('PDF バイト列 + .pdf 拡張子 → 検出 mime = application/pdf', async () => {
      const result = await checkUploadSignature(
        { buffer: PDF_SIG, mimetype: 'application/octet-stream' },
        'doc.pdf',
      );
      expect(result.detectedMime).toBe('application/pdf');
      expect(result.isMismatch).toBe(false);
    });

    it('JSON バイト列 + .json 拡張子 → 正規 JSON として許可（typename 大小混在＋extension 先頭ドットの差異を吸収・fil-0140 HIGH-1 回帰）', async () => {
      const jsonBytes = Buffer.from('{"hello":"world","n":42}');
      const result = await checkUploadSignature(
        { buffer: jsonBytes, mimetype: 'application/octet-stream' },
        'config.json',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBe('application/json');
    });

    it('INI テキスト（`[section]` 始まり）+ .ini 拡張子 → 許可（Json は先頭1バイトだけの弱い検出・v2-189 回帰）', async () => {
      const iniBytes = Buffer.from('[DiskInfo]\nVersion=3.0.0\nName=TestDisk\n');
      const result = await checkUploadSignature(
        { buffer: iniBytes, mimetype: 'text/plain' },
        'DiskInfo3.ini',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it('`{` 始まりのテキスト + .toml 拡張子 → 許可（弱い検出を不一致判定に使わない）', async () => {
      const result = await checkUploadSignature(
        { buffer: Buffer.from('{ not json'), mimetype: 'text/plain' },
        'config.toml',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it('`G` 始まりのテキスト + .md 拡張子 → 許可（mpeg も先頭1バイトだけの弱い検出・v2-189）', async () => {
      const result = await checkUploadSignature(
        { buffer: Buffer.from('GitHub Actions の設定メモ\n\n本文\n'), mimetype: 'text/markdown' },
        'README.md',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it('`G` 始まりの CSV + .csv 拡張子 → 許可（mpeg の弱い検出を不一致に使わない）', async () => {
      const result = await checkUploadSignature(
        { buffer: Buffer.from('Group,Name,Age\nA,1,2\n'), mimetype: 'text/csv' },
        'group.csv',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it('MPEG の実シグネチャ（0x00 0x00 0x01 0xB3）+ .mpeg 拡張子 → 検出 mime = video/mpeg（拡張子自身が系統内なら一致判定に使う）', async () => {
      const mpegPs = Buffer.from([0x00, 0x00, 0x01, 0xb3, 0x00, 0x00, 0x01, 0xba]);
      const result = await checkUploadSignature(
        { buffer: mpegPs, mimetype: 'application/octet-stream' },
        'movie.mpeg',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBe('video/mpeg');
    });

    it('MPEG の実シグネチャ + .mpg 拡張子 → 不整合なし（判定不能として申告 mime を維持）', async () => {
      const mpegPs = Buffer.from([0x00, 0x00, 0x01, 0xb3, 0x00, 0x00, 0x01, 0xba]);
      const result = await checkUploadSignature(
        { buffer: mpegPs, mimetype: 'video/mpeg' },
        'movie.mpg',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it('PNG バイト列 + .ini 拡張子 → 不整合（弱い検出の除外は実体の偽装を見逃さない）', async () => {
      const result = await checkUploadSignature(
        { buffer: PNG_SIG, mimetype: 'application/octet-stream' },
        'fake.ini',
      );
      expect(result.isMismatch).toBe(true);
    });

    it('RTF バイト列 + .rtf 拡張子 → 許可（magic-bytes は RTF シグネチャを `rtf` typename で返す）', async () => {
      const rtfBytes = Buffer.from('{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1041}');
      const result = await checkUploadSignature(
        { buffer: rtfBytes, mimetype: 'application/octet-stream' },
        'doc.rtf',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(false);
    });

    it('TIFF BE バイト列 + .tiff 拡張子 → 許可（tif/tiff 別名・fil-0140 criteria 1）', async () => {
      const tiffBe = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
      const result = await checkUploadSignature(
        { buffer: tiffBe, mimetype: 'image/tiff' },
        'photo.tiff',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toBe('image/tiff');
    });

    it('UTF-8 BOM 付き HTML + .html 拡張子 → BOM を剥がして text として許可（fil-0140 HIGH-1 回帰）', async () => {
      // Windows Notepad の UTF-8 BOM (EF BB BF) + HTML。先頭 3 byte を剥いで magic-bytes に渡す。
      const utf8BomHtml = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('<!DOCTYPE html><html><body>hi</body></html>'),
      ]);
      const result = await checkUploadSignature(
        { buffer: utf8BomHtml, mimetype: 'text/html' },
        'page.html',
      );
      expect(result.isExecutable).toBe(false);
      expect(result.isMismatch).toBe(false);
    });

    it('UTF-8 BOM 付きテキスト + .md 拡張子 → BOM を剥がして許可（Excel/VS 由来の CSV 等でも実害なし）', async () => {
      const utf8BomMd = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('# Hello\nMarkdown 本文', 'utf8'),
      ]);
      const result = await checkUploadSignature(
        { buffer: utf8BomMd, mimetype: 'text/markdown' },
        'memo.md',
      );
      expect(result.isExecutable).toBe(false);
      // BOM 剥がし後の本体バイト列は magic-bytes が text 系として検出、または判定不能のいずれか。
      // どちらも許可パスを通る。
      expect(result.isMismatch).toBe(false);
    });

    it('Mach-O 32-bit big-endian (FE ED FA CE) + .pdf 拡張子 → 実行形式として拒否（upstream typo 対策・fil-0140 HIGH-2）', async () => {
      const machoBe32 = Buffer.from([0xfe, 0xed, 0xfa, 0xce, 0x00, 0x00, 0x00, 0x07]);
      const result = await checkUploadSignature(
        { buffer: machoBe32, mimetype: 'application/pdf' },
        'evil.pdf',
      );
      expect(result.isExecutable).toBe(true);
    });
  });

  describe('path (diskStorage) 経路', () => {
    // 実 fs は触らない（open をモック）。パス文字列はダミーで diskStorage 経路のコード分岐だけを踏む。
    const DUMMY_TEMP_PATH = '/dummy/upload-temp.bin';

    it('path からの先頭バイト読み出しが buffer 経路と同じ結果を返す', async () => {
      mockFileBytes(JPEG_SIG);
      const result = await checkUploadSignature(
        { path: DUMMY_TEMP_PATH, mimetype: 'application/octet-stream' },
        'photo.jpg',
      );
      expect(result.detectedMime).toBe('image/jpeg');
      expect(result.isMismatch).toBe(false);
    });

    it('path 経路でも PE/MZ を実行形式として検出する', async () => {
      mockFileBytes(PE_SIG);
      const result = await checkUploadSignature(
        { path: DUMMY_TEMP_PATH, mimetype: 'application/octet-stream' },
        'evil.pdf',
      );
      expect(result.isExecutable).toBe(true);
    });

    it('path 経路でも zip コンテナ系 (.docx) を zip 系検出で許可する', async () => {
      mockFileBytes(ZIP_SIG);
      const result = await checkUploadSignature(
        { path: DUMMY_TEMP_PATH, mimetype: 'application/octet-stream' },
        'doc.docx',
      );
      expect(result.isMismatch).toBe(false);
      expect(result.detectedMime).toContain('wordprocessingml');
    });
  });
});
