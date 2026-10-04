import type { Request } from 'express';
import { clientUserAgent, normalizeIp } from './client-ip';

describe('normalizeIp', () => {
  it('IPv4-mapped IPv6 を素の IPv4 へ畳む', () => {
    expect(normalizeIp('::ffff:203.0.113.42')).toBe('203.0.113.42');
    expect(normalizeIp('::FFFF:192.0.2.1')).toBe('192.0.2.1');
  });

  it('素の IPv4 / IPv6 はそのまま返す', () => {
    expect(normalizeIp('203.0.113.42')).toBe('203.0.113.42');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeIp('::1')).toBe('::1');
  });

  it('空文字はそのまま（fail-secure 判定は呼び出し側）', () => {
    expect(normalizeIp('')).toBe('');
  });
});

describe('clientUserAgent（fil-0106 項目3）', () => {
  const req = (headers: Record<string, string | undefined>) => ({ headers }) as unknown as Request;

  it('User-Agent ヘッダをそのまま返す（切り詰めは記録側 AuditRecorderService が担う）', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    expect(clientUserAgent(req({ 'user-agent': ua }))).toBe(ua);
  });

  it('ヘッダ未送出は null（記録側で null 列に落ちる）', () => {
    expect(clientUserAgent(req({}))).toBeNull();
  });
});
