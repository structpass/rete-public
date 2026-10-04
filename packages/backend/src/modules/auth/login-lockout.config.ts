/**
 * ログイン試行ロックアウト（H6 / brute-force 防御）の閾値設定。
 *
 * 失敗カウントとロック期限は Account 行（DB）に保持する（複数インスタンス・再起動跨ぎで一貫）が、
 * 「何回でロックするか / 何分ロックするか」の閾値は env で上書き可能な定数として一元管理する。
 * 既定値（5 回 / 15 分）を持つため未設定でも安全側で動く（operational-policy §4）。
 *
 * この lockout（Account 単位の認証失敗防御）は IP/endpoint burst 防御の throttle（@nestjs/throttler）と
 * 独立評価で併走する二層防御の片側。両者は別の軸を守るため「先に当たった方で拒否」する＝どちらも撤去しない
 * （協調仕様の単一ソース＝operational-policy §10）。
 *
 * 将来テナント別ポリシー（login-settings）へ統合する余地があるが、MVP は env/定数で完結させる。
 */
export const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
export const DEFAULT_LOGIN_LOCKOUT_MINUTES = 15;

/** AuthService 注入用 DI トークン。 */
export const LOGIN_LOCKOUT_CONFIG = Symbol('LOGIN_LOCKOUT_CONFIG');

export interface LoginLockoutConfig {
  /** 連続失敗がこの回数に到達するとロックする。 */
  maxAttempts: number;
  /** ロック継続時間（ミリ秒）。経過後は失敗カウントをリセットして再試行を許す。 */
  lockoutMs: number;
}

/** 正の整数として解釈できる時だけ採用し、それ以外（未設定・0 以下・非数）は既定へフォールバック。 */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** env からロックアウト設定を解決する（テスト容易性のため env を引数で受ける）。 */
export function resolveLoginLockoutConfig(
  env: NodeJS.ProcessEnv = process.env,
): LoginLockoutConfig {
  const maxAttempts = parsePositiveInt(env.MAX_LOGIN_ATTEMPTS, DEFAULT_MAX_LOGIN_ATTEMPTS);
  const minutes = parsePositiveInt(env.LOGIN_LOCKOUT_MINUTES, DEFAULT_LOGIN_LOCKOUT_MINUTES);
  return { maxAttempts, lockoutMs: minutes * 60_000 };
}
