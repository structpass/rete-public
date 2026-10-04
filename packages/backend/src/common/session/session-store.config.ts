import type session from 'express-session';
import type { Store } from 'express-session';
import connectPgSimple from 'connect-pg-simple';

/**
 * session ストア解決に必要な env のサブセット。
 * テスト容易性のため process.env を直接読まず、引数で受け取る。
 */
export interface SessionStoreEnv {
  NODE_ENV?: string;
  /** dev で永続ストアに切り替える時のみ 'pg'。未設定/その他は MemoryStore（本番では無視され常に永続）。 */
  SESSION_STORE?: string;
  DATABASE_URL?: string;
}

/**
 * 永続ストア（connect-pg-simple）を使うべきか判定する。
 * - 本番（NODE_ENV=production）: 常に true（MemoryStore 起動を構造的に禁止）
 * - dev: SESSION_STORE=pg の時のみ true。既定は false（express-session 既定の MemoryStore を許容）
 */
export function shouldUsePersistentStore(env: SessionStoreEnv): boolean {
  if (env.NODE_ENV === 'production') return true;
  return env.SESSION_STORE === 'pg';
}

/**
 * session ストアを解決する。永続ストアを使わない場合は undefined を返し、
 * 呼び出し側は express-session 既定の MemoryStore で起動する。
 *
 * テーブルは Prisma migration（model Session / `session` テーブル）が作成する前提のため
 * `createTableIfMissing: false`。本番で DATABASE_URL を欠く場合は fail-fast で throw する
 * （operational-policy §3「止める側」・§4）。
 */
export interface CreateSessionStoreOptions {
  /**
   * connect-pg-simple 内部のエラー（接続断・prune 失敗）を受けるハンドラ。
   * 未指定だとライブラリが既定の `console.error` に流すため（operational-policy §2 違反 + 接続情報漏洩リスク）、
   * 呼び出し側で NestJS Logger 等に振り向けること。
   */
  errorLog?: (...args: unknown[]) => void;
}

/**
 * session ストア（connect-pg-simple）が張る接続プールの上限（cmn-0347）。
 * 未指定だと pg ライブラリ既定の 10 に暗黙依存し、接続数の勘定（.env.example / operational-policy §4
 * の「5 + 5」）とズレる。Prisma 側（connection_limit=5）と合わせて 1 インスタンスの実消費を 5 + 5 = 10 に
 * 固定する。増やす時は インスタンス数 ×（connection_limit + 本値）が DB の max_connections を
 * 超えないかを先に検討する。
 */
export const SESSION_POOL_MAX = 5;

export function createSessionStore(
  sessionModule: typeof session,
  env: SessionStoreEnv,
  options: CreateSessionStoreOptions = {},
): Store | undefined {
  if (!shouldUsePersistentStore(env)) return undefined;

  if (!env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required to wire the persistent session store (connect-pg-simple).',
    );
  }

  const PgStore = connectPgSimple(sessionModule);
  return new PgStore({
    // cmn-0347: conString 単独（プール上限なし＝pg 既定 10 に暗黙依存）ではなく conObject で
    // max を明示する。connect-pg-simple は conObject を new pg.Pool(conObject) へ直渡しするため
    // node-postgres の PoolConfig（connectionString / max）がそのまま効く（grounding 実測）。
    conObject: {
      connectionString: env.DATABASE_URL,
      max: SESSION_POOL_MAX,
    },
    tableName: 'session',
    createTableIfMissing: false,
    ...(options.errorLog ? { errorLog: options.errorLog } : {}),
  });
}
