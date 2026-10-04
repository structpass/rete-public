import type { Readable } from 'stream';

/**
 * ファイル実体ストレージの抽象（DI トークン兼基底）。
 * 実体アクセスは本抽象越しに行い、後で S3 等のドライバへ差し替えられる境界を保つ
 * （operational-policy §3・FB-0 確定）。key は app が発行する相対キー（`<fileId>/<versionId>`）で、
 * 実装は `FILE_STORAGE_ROOT` 配下に解決する。外部入力を直接 key にしない（パストラバーサル防御は実装側）。
 *
 * write はアップロード経路の「全量メモリ保持」を避けるためストリーム（Readable）を受けられる
 * （fil-0121）。Buffer も受け付けるのは、実体が小さく明示的に buffer で持つ呼び出し元を残すため。
 * 型は Node 標準の Readable に限り、ドライバ固有型（WriteStream 等）は抽象へ漏らさない。
 */
export abstract class StorageService {
  /** key にバイト列またはストリームを保存する（中間ディレクトリは自動作成・ストリームは最後まで流し込む）。 */
  abstract write(key: string, data: Buffer | Readable): Promise<void>;

  /** key の実体を読み出すストリームを返す（ダウンロード用）。 */
  abstract createReadStream(key: string): Readable;

  /** key の実体を削除する。存在しなくてもエラーにしない（補償削除の冪等性）。 */
  abstract delete(key: string): Promise<void>;
}
