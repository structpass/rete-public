import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DisplayPreferenceDto } from '@rete/shared';

// apiClient の get/put をモックして URL + body 形状 + envelope 展開を検証する。
const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  default: { get: getMock, put: putMock },
}));

import {
  applyDisplayPreference,
  fetchDisplayPreference,
  saveDisplayPreference,
} from '../display-preference-api';

const PREF: DisplayPreferenceDto = { stripeEnabled: true, stripeColor: '#FAFCFF' };

beforeEach(() => {
  getMock.mockReset();
  putMock.mockReset();
});

describe('fetchDisplayPreference', () => {
  it('GET /accounts/me/display-preference の data を返す', async () => {
    getMock.mockResolvedValue({ data: { success: true, data: PREF } });
    await expect(fetchDisplayPreference()).resolves.toEqual(PREF);
    expect(getMock).toHaveBeenCalledWith('/accounts/me/display-preference');
  });

  it('未保存（data: null）は null を返す', async () => {
    getMock.mockResolvedValue({ data: { success: true, data: null } });
    await expect(fetchDisplayPreference()).resolves.toBeNull();
  });
});

describe('saveDisplayPreference', () => {
  it('PUT へ設定をそのまま送り、保存後の data を返す', async () => {
    const saved: DisplayPreferenceDto = { stripeEnabled: false, stripeColor: '#EEF2F7' };
    putMock.mockResolvedValue({ data: { success: true, data: saved } });
    await expect(
      saveDisplayPreference({ stripeEnabled: false, stripeColor: '#EEF2F7' }),
    ).resolves.toEqual(saved);
    expect(putMock).toHaveBeenCalledWith('/accounts/me/display-preference', {
      stripeEnabled: false,
      stripeColor: '#EEF2F7',
    });
  });
});

describe('applyDisplayPreference', () => {
  // document.documentElement へ触らないよう、素の要素を root として渡す。
  const makeRoot = () => document.createElement('div');

  it('ON + カスタム色は --sp-row-stripe をその色へ上書きする', () => {
    const root = makeRoot();
    applyDisplayPreference({ stripeEnabled: true, stripeColor: '#EEF2F7' }, root);
    expect(root.style.getPropertyValue('--sp-row-stripe')).toBe('#EEF2F7');
  });

  it('OFF は --sp-row-stripe を transparent 化する（縞を使う全明細が無地になる）', () => {
    const root = makeRoot();
    applyDisplayPreference({ stripeEnabled: false, stripeColor: '#EEF2F7' }, root);
    expect(root.style.getPropertyValue('--sp-row-stripe')).toBe('transparent');
  });

  it('null（未保存 / ログアウト）は上書きを外して CSS 既定へ戻す', () => {
    const root = makeRoot();
    root.style.setProperty('--sp-row-stripe', '#EEF2F7');
    applyDisplayPreference(null, root);
    expect(root.style.getPropertyValue('--sp-row-stripe')).toBe('');
  });
});
