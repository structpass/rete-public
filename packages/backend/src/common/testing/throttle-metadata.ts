/**
 * @nestjs/throttler のメタデータ読み出しヘルパ（cmn-0219）。
 *
 * `@nestjs/throttler` v6 は `THROTTLER_LIMIT` / `THROTTLER_TTL` を public barrel に公開していないため、
 * 各 spec がメタデータキーを直書きしていた（本ファイル集約前は 4 spec に散在）。
 *
 * 内部実装は `<BASE><name>` 形式で `Reflect.defineMetadata` するため、`@Throttle({ default: {...} })` の
 * limit はキー `'THROTTLER:LIMITdefault'` に保存される。`name` 既定は `'default'`。
 *
 * NestJS の内部キー名やフォーマットが変わった場合の影響はこの 1 ファイルに閉じる。
 */
const THROTTLER_LIMIT_BASE = 'THROTTLER:LIMIT';
const THROTTLER_TTL_BASE = 'THROTTLER:TTL';

/**
 * ハンドラの per-route Throttle limit を読み出す。
 * `name` 既定は `'default'`（`@Throttle({ default: {...} })` 形式）。
 * 任意 named throttle（`@Throttle({ short: {...} })` 等）は第 2 引数で name を渡す。
 */
export function throttleLimitOf(handler: object, name: string = 'default'): number | undefined {
  return Reflect.getMetadata(`${THROTTLER_LIMIT_BASE}${name}`, handler) as number | undefined;
}

/**
 * ハンドラの per-route Throttle ttl（ms）を読み出す。`name` 既定・任意の扱いは throttleLimitOf と同じ。
 */
export function throttleTtlOf(handler: object, name: string = 'default'): number | undefined {
  return Reflect.getMetadata(`${THROTTLER_TTL_BASE}${name}`, handler) as number | undefined;
}
