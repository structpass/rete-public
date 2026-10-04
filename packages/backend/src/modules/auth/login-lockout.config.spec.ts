import {
  DEFAULT_LOGIN_LOCKOUT_MINUTES,
  DEFAULT_MAX_LOGIN_ATTEMPTS,
  resolveLoginLockoutConfig,
} from './login-lockout.config';

describe('resolveLoginLockoutConfig', () => {
  it('未設定なら既定値（5 回 / 15 分）を返す', () => {
    expect(resolveLoginLockoutConfig({})).toEqual({
      maxAttempts: DEFAULT_MAX_LOGIN_ATTEMPTS,
      lockoutMs: DEFAULT_LOGIN_LOCKOUT_MINUTES * 60_000,
    });
  });

  it('正の整数 env を採用する', () => {
    expect(
      resolveLoginLockoutConfig({ MAX_LOGIN_ATTEMPTS: '3', LOGIN_LOCKOUT_MINUTES: '30' }),
    ).toEqual({ maxAttempts: 3, lockoutMs: 30 * 60_000 });
  });

  it('0 以下・非数・空文字は既定へフォールバックする', () => {
    expect(resolveLoginLockoutConfig({ MAX_LOGIN_ATTEMPTS: '0' }).maxAttempts).toBe(
      DEFAULT_MAX_LOGIN_ATTEMPTS,
    );
    expect(resolveLoginLockoutConfig({ MAX_LOGIN_ATTEMPTS: '-1' }).maxAttempts).toBe(
      DEFAULT_MAX_LOGIN_ATTEMPTS,
    );
    expect(resolveLoginLockoutConfig({ LOGIN_LOCKOUT_MINUTES: 'abc' }).lockoutMs).toBe(
      DEFAULT_LOGIN_LOCKOUT_MINUTES * 60_000,
    );
    expect(resolveLoginLockoutConfig({ LOGIN_LOCKOUT_MINUTES: '' }).lockoutMs).toBe(
      DEFAULT_LOGIN_LOCKOUT_MINUTES * 60_000,
    );
  });
});
