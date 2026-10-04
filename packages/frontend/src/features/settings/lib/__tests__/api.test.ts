import { describe, it, expect, vi, beforeEach } from 'vitest';

// apiClient の get/patch をモックして URL + body 形状 + DTO→ViewModel 変換を検証する。
const { getMock, patchMock } = vi.hoisted(() => ({ getMock: vi.fn(), patchMock: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ default: { get: getMock, patch: patchMock } }));

import {
  toTenantInfo,
  toTenantSystemRow,
  fetchTenantInfo,
  fetchTenantSystems,
  updateTenantInfo,
} from '../api';

describe('toTenantInfo', () => {
  it('既知のバッジ色はそのまま、未知値は none にフォールバックする', () => {
    expect(toTenantInfo({ name: 'A社', badgeColor: 'blue', updatedAt: null })).toEqual({
      name: 'A社',
      badgeColor: 'blue',
    });
    expect(toTenantInfo({ name: 'B社', badgeColor: 'purple', updatedAt: null }).badgeColor).toBe(
      'none',
    );
  });
});

describe('toTenantSystemRow', () => {
  it('sortOrder を落とし、画面 ViewModel の形にする', () => {
    expect(
      toTenantSystemRow({
        id: 'SYS-001',
        name: '商品管理',
        isRete: false,
        enabled: true,
        sortOrder: 3,
      }),
    ).toEqual({ id: 'SYS-001', name: '商品管理', isRete: false, enabled: true });
  });
});

describe('fetchTenantInfo', () => {
  it('GET /settings/tenant を呼び ViewModel を返す', async () => {
    getMock.mockReset().mockResolvedValue({
      data: {
        success: true,
        data: { name: '開発法人', badgeColor: 'green', updatedAt: '2026-06-04T00:00:00.000Z' },
      },
    });
    const info = await fetchTenantInfo();
    expect(getMock).toHaveBeenCalledWith('/settings/tenant');
    expect(info).toEqual({ name: '開発法人', badgeColor: 'green' });
  });
});

describe('fetchTenantSystems', () => {
  it('GET /settings/tenant/systems を呼び ViewModel 配列を返す', async () => {
    getMock.mockReset().mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 'SYS-001', name: 'A', isRete: false, enabled: true, sortOrder: 0 },
          { id: 'RETE-DESK', name: 'デスク', isRete: true, enabled: false, sortOrder: 1 },
        ],
      },
    });
    const rows = await fetchTenantSystems();
    expect(getMock).toHaveBeenCalledWith('/settings/tenant/systems');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ id: 'RETE-DESK', name: 'デスク', isRete: true, enabled: false });
  });
});

describe('updateTenantInfo', () => {
  it('PATCH /settings/tenant に name/badgeColor を送る', async () => {
    patchMock.mockReset().mockResolvedValue({
      data: { success: true, data: { name: '新法人', badgeColor: 'red', updatedAt: null } },
    });
    const info = await updateTenantInfo({ name: '新法人', badgeColor: 'red' });
    expect(patchMock).toHaveBeenCalledWith('/settings/tenant', {
      name: '新法人',
      badgeColor: 'red',
    });
    expect(info).toEqual({ name: '新法人', badgeColor: 'red' });
  });
});

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
});
