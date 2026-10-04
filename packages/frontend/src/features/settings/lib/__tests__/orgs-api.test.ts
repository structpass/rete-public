import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { OrganizationDto, ProjectDto } from '@rete/shared';

// ── apiClient モック（cmn-0142: vi.hoisted 化）──
const { mockGet, mockPost, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch },
}));

// モック後に import する（dynamic import で解決タイミング合わせ）
const {
  fetchOrganizationsAdmin,
  createOrganization,
  adminUpdateOrganization,
  fetchProjectsAdmin,
  adminUpdateProject,
} = await import('../orgs-api');

const wrap = <T>(data: T) => ({ data: { success: true, data } });

const org1: OrganizationDto = {
  id: 'org-1',
  name: 'Acme',
  sortOrder: 1,
  archived: false,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};
const proj1: ProjectDto = {
  id: 'proj-1',
  organizationId: 'org-1',
  name: 'Alpha',
  sortOrder: 1,
  archived: false,
  canManageChannels: false,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('orgs-api', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('fetchOrganizationsAdmin', () => {
    it('includeArchived=false の時 params を渡さない（既定）', async () => {
      (mockGet as Mock).mockResolvedValue(wrap([org1]));
      const result = await fetchOrganizationsAdmin();
      expect(mockGet).toHaveBeenCalledWith('/organizations/admin', { params: {} });
      expect(result).toEqual([org1]);
    });

    it('includeArchived=true の時 params.includeArchived=true を渡す', async () => {
      (mockGet as Mock).mockResolvedValue(wrap([org1]));
      await fetchOrganizationsAdmin(true);
      expect(mockGet).toHaveBeenCalledWith('/organizations/admin', {
        params: { includeArchived: true },
      });
    });
  });

  describe('createOrganization', () => {
    it('POST /organizations を正しいボディで呼ぶ', async () => {
      (mockPost as Mock).mockResolvedValue(wrap(org1));
      const result = await createOrganization({ name: 'Acme' });
      expect(mockPost).toHaveBeenCalledWith('/organizations', { name: 'Acme' });
      expect(result).toEqual(org1);
    });
  });

  describe('adminUpdateOrganization', () => {
    it('PATCH /organizations/admin/:id を正しいボディで呼ぶ', async () => {
      (mockPatch as Mock).mockResolvedValue(wrap({ ...org1, archived: true }));
      const result = await adminUpdateOrganization('org-1', { archived: true });
      expect(mockPatch).toHaveBeenCalledWith('/organizations/admin/org-1', { archived: true });
      expect(result.archived).toBe(true);
    });
  });

  describe('fetchProjectsAdmin', () => {
    it('organizationId フィルタを params に含める', async () => {
      (mockGet as Mock).mockResolvedValue(wrap([proj1]));
      await fetchProjectsAdmin('org-1', false);
      expect(mockGet).toHaveBeenCalledWith('/projects/admin', {
        params: { organizationId: 'org-1' },
      });
    });

    it('includeArchived=true の時 params に含める', async () => {
      (mockGet as Mock).mockResolvedValue(wrap([proj1]));
      await fetchProjectsAdmin('org-1', true);
      expect(mockGet).toHaveBeenCalledWith('/projects/admin', {
        params: { organizationId: 'org-1', includeArchived: true },
      });
    });
  });

  describe('adminUpdateProject', () => {
    it('PATCH /projects/admin/:id を正しいボディで呼ぶ', async () => {
      (mockPatch as Mock).mockResolvedValue(wrap({ ...proj1, name: 'Renamed' }));
      const result = await adminUpdateProject('proj-1', { name: 'Renamed' });
      expect(mockPatch).toHaveBeenCalledWith('/projects/admin/proj-1', { name: 'Renamed' });
      expect(result.name).toBe('Renamed');
    });
  });
});
