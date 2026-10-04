import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Readable } from 'stream';
import { LocalFsStorageService } from './local-fs-storage.service';

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('LocalFsStorageService', () => {
  const root = join(tmpdir(), `rete-storage-test-${process.pid}`);
  let storage: LocalFsStorageService;

  beforeEach(() => {
    process.env.FILE_STORAGE_ROOT = root;
    storage = new LocalFsStorageService();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('write → createReadStream で同じバイト列を読み戻せる（中間ディレクトリ自動作成）', async () => {
    const payload = Buffer.from('在庫アラート閾値メモ', 'utf-8');
    await storage.write('folder-1/version-1', payload);

    const read = await streamToBuffer(storage.createReadStream('folder-1/version-1'));

    expect(read.equals(payload)).toBe(true);
  });

  it('write は Readable ストリームも最後まで流し込んで保存できる（fil-0121・ストリーム受け）', async () => {
    const payload = Buffer.from('ストリーム書き込みテスト', 'utf-8');
    await storage.write('folder-1/version-1', Readable.from([payload]));

    const read = await streamToBuffer(storage.createReadStream('folder-1/version-1'));

    expect(read.equals(payload)).toBe(true);
  });

  it('delete で実体が消える（存在しない key の delete は冪等で throw しない）', async () => {
    await storage.write('f/v', Buffer.from('x'));
    expect(existsSync(join(root, 'f/v'))).toBe(true);

    await storage.delete('f/v');
    expect(existsSync(join(root, 'f/v'))).toBe(false);

    await expect(storage.delete('f/v')).resolves.toBeUndefined();
  });

  it('root を脱出する key は write / createReadStream / delete いずれも BadRequest で弾く', async () => {
    await expect(storage.write('../evil', Buffer.from('x'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(() => storage.createReadStream('../evil')).toThrow(BadRequestException);
    await expect(storage.delete('../../etc/passwd')).rejects.toBeInstanceOf(BadRequestException);
    expect(existsSync(join(root, '../evil'))).toBe(false);
  });

  describe('onModuleInit（起動時掃除・fil-0121 criteria 5）', () => {
    it('一時フォルダ配下の残骸を全消しし、保存ルート（.tmp 以外）は掃除しない', async () => {
      // multer が不意に落ちた時に残る形を再現: .tmp 直下と下層にファイルを置く。
      const tempDir = join(root, '.tmp');
      mkdirSync(join(tempDir, 'nested'), { recursive: true });
      writeFileSync(join(tempDir, 'a.bin'), 'x');
      writeFileSync(join(tempDir, 'nested', 'b.bin'), 'y');

      await storage.onModuleInit();

      expect(existsSync(tempDir)).toBe(false);
      // 保存実体（UPLOAD_TEMP_DIR_NAME 以外の key）は掃除に巻き込まれない。
      await storage.write('f/v', Buffer.from('x'));
      expect(existsSync(join(root, 'f/v'))).toBe(true);
    });

    it('一時フォルダが無くてもエラーにしない', async () => {
      await expect(storage.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
