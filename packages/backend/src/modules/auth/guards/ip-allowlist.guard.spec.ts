import type { ExecutionContext } from '@nestjs/common';
import { HttpException, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { IpAllowlistGuard } from './ip-allowlist.guard';
import type { LoginSettingsService } from '../../login-settings/login-settings.service';

/**
 * IP 許可リスト遮断ガード（set-0025 P1）の分岐単体テスト。
 * - 空リスト = 全許可（自己ロックアウト防止）／除外 path（/health）は常に素通し
 * - リスト非空かつリスト内 IP は素通し・リスト外は 403 IP_NOT_ALLOWED
 * - IP 取得不能（空文字）はリスト非空なら拒否側へ倒す（fail-secure）
 * - 除外判定が部分文字列一致でなく厳密な base / base/... 照合であること（/healthz はバイパスしない）
 * - グローバル prefix（/api/v1）剥がし後に除外 path を照合する
 */
describe('IpAllowlistGuard', () => {
  let loginSettings: { getIpWhitelistCidrs: jest.Mock };
  let guard: IpAllowlistGuard;

  beforeEach(() => {
    loginSettings = { getIpWhitelistCidrs: jest.fn().mockResolvedValue([]) };
    guard = new IpAllowlistGuard(loginSettings as unknown as LoginSettingsService);
  });

  const ctx = (req: Partial<Request>): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

  const req = (path: string, ip = '203.0.113.10'): Partial<Request> => ({ path, ip }) as never;

  it('空リストは全許可（制限なし・自己ロックアウト防止）', async () => {
    expect(await guard.canActivate(ctx(req('/desk', '8.8.8.8')))).toBe(true);
  });

  it('除外 path（/health）はリスト非空でも常に素通し', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    expect(await guard.canActivate(ctx(req('/health', '8.8.8.8')))).toBe(true);
    expect(loginSettings.getIpWhitelistCidrs).not.toHaveBeenCalled();
  });

  it('グローバル prefix(/api/v1) 込み path でも /health を除外できる', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    expect(await guard.canActivate(ctx(req('/api/v1/health', '8.8.8.8')))).toBe(true);
    expect(loginSettings.getIpWhitelistCidrs).not.toHaveBeenCalled();
  });

  it('除外判定は厳密 base 照合（/healthz は除外しない＝バイパス防止）', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    await expect(guard.canActivate(ctx(req('/healthz', '8.8.8.8')))).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('リスト内 IP は素通し', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    expect(await guard.canActivate(ctx(req('/desk', '203.0.113.42')))).toBe(true);
  });

  it('IPv4-mapped IPv6（dual-stack 接続）でも IPv4 CIDR にマッチし素通し（HIGH 修正）', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    expect(await guard.canActivate(ctx(req('/desk', '::ffff:203.0.113.42')))).toBe(true);
  });

  it('リスト外 IP は 403 IP_NOT_ALLOWED で遮断', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    await expect(guard.canActivate(ctx(req('/desk', '198.51.100.1')))).rejects.toMatchObject({
      response: { code: 'IP_NOT_ALLOWED' },
    });
  });

  it('IP 取得不能（空文字）かつリスト非空は拒否（fail-secure）', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    await expect(guard.canActivate(ctx(req('/desk', '')))).rejects.toMatchObject({
      response: { code: 'IP_NOT_ALLOWED' },
    });
  });

  // ---- set-0034 hardening ----

  it('OIDC バックチャネル（token/jwks/me/.well-known）はリスト非空でも素通し（server-to-server 除外）', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    const exempt = [
      '/api/v1/oidc/token',
      '/api/v1/oidc/token/introspection',
      '/api/v1/oidc/jwks',
      '/api/v1/oidc/me',
      '/api/v1/oidc/.well-known/openid-configuration',
    ];
    for (const p of exempt) {
      expect(await guard.canActivate(ctx(req(p, '8.8.8.8')))).toBe(true);
    }
  });

  it('OIDC フロントチャネル（/oidc/auth＝利用者ブラウザ）は除外せず IP 制限を適用', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    await expect(guard.canActivate(ctx(req('/api/v1/oidc/auth', '8.8.8.8')))).rejects.toMatchObject(
      { response: { code: 'IP_NOT_ALLOWED' } },
    );
  });

  it('厳密 base 照合: /oidc/metoo のような前方部分一致は除外しない（バイパス防止）', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    await expect(
      guard.canActivate(ctx(req('/api/v1/oidc/metoo', '8.8.8.8'))),
    ).rejects.toMatchObject({ response: { code: 'IP_NOT_ALLOWED' } });
  });

  it('許可リストは TTL キャッシュ越しに取得し連続リクエストで DB を1回だけ引く', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    await guard.canActivate(ctx(req('/desk', '203.0.113.42')));
    await guard.canActivate(ctx(req('/desk', '203.0.113.43')));
    await guard.canActivate(ctx(req('/desk', '203.0.113.44')));
    expect(loginSettings.getIpWhitelistCidrs).toHaveBeenCalledTimes(1);
  });

  // ---- set-0037 cache stampede 抑制（inflight dedup） ----

  it('TTL 失効時に同時 cache miss が来ても DB 取得は1回に集約（cache stampede 抑制）', async () => {
    // resolve を保留して全 miss を inflight に相乗りさせる
    let resolveFn!: (v: string[]) => void;
    loginSettings.getIpWhitelistCidrs.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const p1 = guard.canActivate(ctx(req('/desk', '203.0.113.42')));
    const p2 = guard.canActivate(ctx(req('/desk', '203.0.113.43')));
    const p3 = guard.canActivate(ctx(req('/desk', '203.0.113.44')));
    resolveFn(['203.0.113.0/24']);
    expect(await p1).toBe(true);
    expect(await p2).toBe(true);
    expect(await p3).toBe(true);
    expect(loginSettings.getIpWhitelistCidrs).toHaveBeenCalledTimes(1);
  });

  it('DB 取得例外時は inflight をクリアし次回 miss で再取得（例外はキャッシュしない・fail-secure 維持）', async () => {
    loginSettings.getIpWhitelistCidrs
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(['203.0.113.0/24']);
    await expect(guard.canActivate(ctx(req('/desk', '203.0.113.42')))).rejects.toThrow('db down');
    // 次回 miss は inflight がクリアされ再取得 → リスト内 IP は素通し（例外がキャッシュされていない）
    expect(await guard.canActivate(ctx(req('/desk', '203.0.113.42')))).toBe(true);
    expect(loginSettings.getIpWhitelistCidrs).toHaveBeenCalledTimes(2);
  });

  it('遮断時に warn ログ（IP・endpoint）を出す', async () => {
    loginSettings.getIpWhitelistCidrs.mockResolvedValue(['203.0.113.0/24']);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(guard.canActivate(ctx(req('/desk', '198.51.100.1')))).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('IP_NOT_ALLOWED'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('198.51.100.1'));
    warn.mockRestore();
  });
});
