import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { PasswordPolicyDto } from '@rete/shared';
import { usePasswordPolicy } from '../use-password-policy';

// cmn-0142: vi.hoisted 化
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('@/features/settings/lib/login-settings-api', () => ({
  fetchPasswordPolicy: () => mockFetch(),
}));

const dto = (over: Partial<PasswordPolicyDto> = {}): PasswordPolicyDto => ({
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: false,
  minLength: 8,
  mfaEnforced: false,
  ...over,
});

describe('usePasswordPolicy', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('取得したポリシーで入力を評価し、未達ルールは satisfied=false', async () => {
    mockFetch.mockResolvedValue(dto());
    const { result } = renderHook(() => usePasswordPolicy('abcdefgh'));

    await waitFor(() => expect(result.current.policyLoaded).toBe(true));
    const byId = Object.fromEntries(result.current.rules.map((r) => [r.id, r.satisfied]));
    expect(byId.minLength).toBe(true);
    expect(byId.lowercase).toBe(true);
    expect(byId.uppercase).toBe(false);
    expect(byId.number).toBe(false);
    expect(result.current.allSatisfied).toBe(false);
  });

  it('全項目を満たすと allSatisfied=true', async () => {
    mockFetch.mockResolvedValue(dto());
    const { result } = renderHook(() => usePasswordPolicy('Abcdef12'));

    await waitFor(() => expect(result.current.policyLoaded).toBe(true));
    expect(result.current.allSatisfied).toBe(true);
  });

  it('取得失敗時はフォールバック（最小桁数のみ）で評価を継続する', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => usePasswordPolicy('abcdefgh'));

    // フォールバック確定（policyLoaded は false のまま＝アクティブポリシー未取得）。
    await waitFor(() => expect(result.current.rules.length).toBeGreaterThan(0));
    expect(result.current.policyLoaded).toBe(false);
    // 最小桁数のみ → 8 文字の小文字列で全満たし。
    expect(result.current.rules.map((r) => r.id)).toEqual(['minLength']);
    expect(result.current.allSatisfied).toBe(true);
  });
});
