import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { SpaceDto } from '@rete/shared';
import { SpaceKind } from '@rete/shared';

// ── apiClient モック（cmn-0142: vi.hoisted 化）──
const { mockGet, mockPost, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch },
}));

// モック後に import する
const { fetchGroupSpaces, fetchGroupSpacesAdmin } = await import('../spaces-api');

const wrap = <T>(data: T) => ({ data: { success: true, data } });

const g1: SpaceDto = {
  id: 'g-1',
  kind: SpaceKind.GROUP,
  projectId: null,
  ownerId: null,
  peerAccountId: null,
  name: 'dev-group',
  sortOrder: 1,
  archived: false,
  peerName: null,
  canManageMembers: false,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('spaces-api', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('fetchGroupSpaces', () => {
    it('GET /spaces?kind=GROUP を呼ぶ（membership 絞り・invites-screen 用）', async () => {
      (mockGet as Mock).mockResolvedValue(wrap([g1]));
      const result = await fetchGroupSpaces();
      expect(mockGet).toHaveBeenCalledWith('/spaces', { params: { kind: SpaceKind.GROUP } });
      expect(result).toEqual([g1]);
    });
  });

  // dsk-0319: 所属管理画面は membership 非依存の fetchGroupSpacesAdmin を使う。
  // invites-screen は従来どおり fetchGroupSpaces を使う（surgical 分離・回帰なし）。
  describe('fetchGroupSpacesAdmin', () => {
    it('GET /spaces/admin?kind=GROUP を呼ぶ（system ADMIN 専用・membership 非依存）', async () => {
      (mockGet as Mock).mockResolvedValue(wrap([g1]));
      const result = await fetchGroupSpacesAdmin();
      // 既定（archived 除外）＝includeArchived を params に入れない
      expect(mockGet).toHaveBeenCalledWith('/spaces/admin', {
        params: { kind: SpaceKind.GROUP },
      });
      expect(result).toEqual([g1]);
    });

    it('includeArchived=true の時 params.includeArchived=true を渡す', async () => {
      (mockGet as Mock).mockResolvedValue(wrap([{ ...g1, archived: true }]));
      await fetchGroupSpacesAdmin(true);
      expect(mockGet).toHaveBeenCalledWith('/spaces/admin', {
        params: { kind: SpaceKind.GROUP, includeArchived: true },
      });
    });

    it('空配列のレスポンスを正しく unwrap する', async () => {
      (mockGet as Mock).mockResolvedValue(wrap([]));
      const result = await fetchGroupSpacesAdmin();
      expect(result).toEqual([]);
    });
  });
});
