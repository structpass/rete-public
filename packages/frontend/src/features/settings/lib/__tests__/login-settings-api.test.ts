import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PasswordPolicyDto, IpWhitelistDto } from '@rete/shared';

// apiClient の get/put をモックして URL + body 形状 + envelope 展開を検証する。
const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  default: { get: getMock, put: putMock },
}));

import {
  fetchPasswordPolicy,
  savePasswordPolicy,
  fetchIpWhitelist,
  saveIpWhitelist,
} from '../login-settings-api';

const POLICY: PasswordPolicyDto = {
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: false,
  minLength: 8,
  mfaEnforced: false,
};

const WHITELIST: IpWhitelistDto = {
  entries: [
    { id: 'e1', cidr: '203.0.113.0/24', note: '本社' },
    { id: 'e2', cidr: '2001:db8::/48', note: 'IPv6' },
  ],
  currentIp: '203.0.113.42',
};

beforeEach(() => {
  getMock.mockReset();
  putMock.mockReset();
});

describe('fetchPasswordPolicy', () => {
  it('GET /settings/login/password-policy を呼び PasswordPolicyDto を返す', async () => {
    getMock.mockResolvedValue({ data: { success: true, data: POLICY } });
    const policy = await fetchPasswordPolicy();
    expect(getMock).toHaveBeenCalledWith('/settings/login/password-policy');
    expect(policy).toEqual(POLICY);
  });
});

describe('savePasswordPolicy', () => {
  it('PUT /settings/login/password-policy に input を送り反映後の値を返す', async () => {
    putMock.mockResolvedValue({ data: { success: true, data: POLICY } });
    const saved = await savePasswordPolicy(POLICY);
    expect(putMock).toHaveBeenCalledWith('/settings/login/password-policy', POLICY);
    expect(saved).toEqual(POLICY);
  });
});

describe('fetchIpWhitelist', () => {
  it('GET /settings/login/ip-whitelist を呼び IpWhitelistDto（currentIp 同梱）を返す', async () => {
    getMock.mockResolvedValue({ data: { success: true, data: WHITELIST } });
    const wl = await fetchIpWhitelist();
    expect(getMock).toHaveBeenCalledWith('/settings/login/ip-whitelist');
    expect(wl).toEqual(WHITELIST);
  });
});

describe('saveIpWhitelist', () => {
  it('PUT /settings/login/ip-whitelist に entries を送り反映後の一覧を返す', async () => {
    putMock.mockResolvedValue({ data: { success: true, data: WHITELIST } });
    const input = { entries: [{ cidr: '203.0.113.0/24', note: '本社' }] };
    const saved = await saveIpWhitelist(input);
    expect(putMock).toHaveBeenCalledWith('/settings/login/ip-whitelist', input);
    expect(saved).toEqual(WHITELIST);
  });
});
