import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { MembershipScopeType } from '@rete/shared';
import type { MembershipDto } from '@rete/shared';

// ── apiClient モック（cmn-0142: vi.hoisted 化）──
const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch, delete: mockDelete },
}));

const {
  fetchPermissionMatrix,
  fetchMemberships,
  addMembership,
  updateMembershipRole,
  removeMembership,
} = await import('../memberships-api');

const wrap = <T>(data: T) => ({ data: { success: true, data } });

const ms1: MembershipDto = {
  id: 'ms-1',
  accountId: 'acc-1',
  scopeType: MembershipScopeType.ORGANIZATION,
  scopeId: 'org-1',
  role: 'MEMBER',
  accountName: '田中 太郎',
};

describe('memberships-api', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetchPermissionMatrix: GET /memberships/admin/matrix を呼ぶ', async () => {
    const matrix = { scopes: [], groups: [], accounts: [], memberships: [], grants: [] };
    (mockGet as Mock).mockResolvedValue(wrap(matrix));

    await expect(fetchPermissionMatrix()).resolves.toEqual(matrix);
    expect(mockGet).toHaveBeenCalledWith('/memberships/admin/matrix');
  });

  it('fetchMemberships: GET /memberships?scopeType=&scopeId= を呼ぶ', async () => {
    (mockGet as Mock).mockResolvedValue(wrap([ms1]));
    const result = await fetchMemberships(MembershipScopeType.ORGANIZATION, 'org-1');
    expect(mockGet).toHaveBeenCalledWith('/memberships', {
      params: { scopeType: 'ORGANIZATION', scopeId: 'org-1' },
    });
    expect(result).toEqual([ms1]);
  });

  it('addMembership: POST /memberships を正しいボディで呼ぶ', async () => {
    (mockPost as Mock).mockResolvedValue(wrap(ms1));
    const result = await addMembership({
      accountId: 'acc-1',
      scopeType: MembershipScopeType.ORGANIZATION,
      scopeId: 'org-1',
      role: 'MEMBER',
    });
    expect(mockPost).toHaveBeenCalledWith('/memberships', {
      accountId: 'acc-1',
      scopeType: 'ORGANIZATION',
      scopeId: 'org-1',
      role: 'MEMBER',
    });
    expect(result).toEqual(ms1);
  });

  it('updateMembershipRole: PATCH /memberships/:id に { role } を送る', async () => {
    (mockPatch as Mock).mockResolvedValue(wrap({ ...ms1, role: 'ADMIN' }));
    const result = await updateMembershipRole('ms-1', 'ADMIN');
    expect(mockPatch).toHaveBeenCalledWith('/memberships/ms-1', { role: 'ADMIN' });
    expect(result.role).toBe('ADMIN');
  });

  it('removeMembership: DELETE /memberships/:id を呼ぶ', async () => {
    (mockDelete as Mock).mockResolvedValue({});
    await removeMembership('ms-1');
    expect(mockDelete).toHaveBeenCalledWith('/memberships/ms-1');
  });
});
