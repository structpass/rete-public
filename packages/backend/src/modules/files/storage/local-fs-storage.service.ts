import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, unlink, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { resolveStorageRoot, resolveUploadTempDir } from '../files.constants';
import { StorageService } from './storage.service';

const pipelineAsync = promisify(pipeline);

/**
 * ローカル FS への実体保存実装（operational-policy §3・FB-0 確定）。保存ルートは `FILE_STORAGE_ROOT`
 * （既定 `./storage/files`）。譲渡先 1 台運用に素直な相対パスを既定とし、後で S3 等へ差し替える場合は
 * 本クラスを別ドライバへ置き換える（StorageService 抽象が境界）。
 *
 * multer の一時受け先（`UPLOAD_TEMP_DIR_NAME`）も本ルート配下に置く（fil-0121）。起動時に一時
 * フォルダを丸ごと掃除し、プロセスが不意に落ちた時に残った残骸を回収する（正常系・業務エラー系の
 * 一時ファイル削除は multer と service が担う＝3 層の最下層）。
 */
@Injectable()
export class LocalFsStorageService extends StorageService implements OnModuleInit {
  private readonly logger = new Logger(LocalFsStorageService.name);
  private readonly root = resolveStorageRoot();
  private readonly tempDir = resolveUploadTempDir();

  /** 起動時掃除（criteria 5・fil-0121）: 一時フォルダを全消しする。無ければ何もしない。 */
  async onModuleInit(): Promise<void> {
    try {
      await rm(this.tempDir, { recursive: true, force: true });
      this.logger.log(`アップロード一時フォルダを掃除しました: ${this.tempDir}`);
    } catch (err) {
      // 掃除失敗は起動を止めない（残骸は次回起動時の掃除・手動 rm で回収できる）。
      this.logger.warn(
        `アップロード一時フォルダの掃除に失敗: ${this.tempDir} (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
  }

  /**
   * 相対 key を保存ルート配下の絶対パスへ解決する。ルート外を指す key（`../` 等）は拒否する
   * （パストラバーサル防御・防御的多層化。key は app 発行の `<id>/<id>` 前提だが念のため検証する）。
   */
  private resolveKey(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) {
      throw new BadRequestException('Invalid storage key');
    }
    return full;
  }

  async write(key: string, data: Buffer | Readable): Promise<void> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    if (data instanceof Buffer) {
      await writeFile(full, data);
      return;
    }
    // ストリームは最後まで流し込む（source の error は pipeline が reject に変換し、部分書き込みの
    // 途中で止めず後始末まで終えてから投げる）。
    await pipelineAsync(data, createWriteStream(full));
  }

  createReadStream(key: string): Readable {
    return createReadStream(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    const full = this.resolveKey(key);
    // 既に無ければ無視（DB 書き込み失敗時の補償削除を冪等にする）。ただし ENOENT 以外
    // （EPERM/EACCES/ENOSPC 等）は握り潰さず再 throw し、上流の補償削除 warn ログを生かす。
    await unlink(full).catch((err: NodeJS.ErrnoException) => {
      if (err?.code !== 'ENOENT') throw err;
    });
  }
}
