import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ScopeVisibilityRepository } from './scope-visibility.repository';
import { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  membership: { findMany: jest.fn() },
  userGroupMember: { findMany: jest.fn() },
  userGroupScopeGrant: { findMany: jest.fn() },
  project: { findMany: jest.fn() },
  space: { findMany: jest.fn() },
};

describe('ScopeVisibilityRepository', () => {
  let repo: ScopeVisibilityRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScopeVisibilityRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<ScopeVisibilityRepository>(ScopeVisibilityRepository);
    // jest.resetAllMocks: 呼び出し履歴と resolved value の両方をクリア（mockPrisma は module 共有のため）
    jest.resetAllMocks();
  });

  // ---------------------------------------------------------------
  // findMembershipScopes
  // ---------------------------------------------------------------
  describe('findMembershipScopes', () => {
    it('accountId だけで絞り、scopeId と scopeType を1回の findMany で返す（種別ごとに繰り返さない）', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([
        { scopeId: 'org-1', scopeType: 'ORGANIZATION' },
        { scopeId: 'proj-1', scopeType: 'PROJECT' },
        { scopeId: 'group-1', scopeType: 'GROUP' },
        { scopeId: 'ch-1', scopeType: 'CHANNEL' },
      ]);

      const result = await repo.findMembershipScopes('acc-1');

      expect(mockPrisma.membership.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        select: { scopeId: true, scopeType: true },
      });
      expect(result).toEqual([
        { scopeId: 'org-1', scopeType: 'ORGANIZATION' },
        { scopeId: 'proj-1', scopeType: 'PROJECT' },
        { scopeId: 'group-1', scopeType: 'GROUP' },
        { scopeId: 'ch-1', scopeType: 'CHANNEL' },
      ]);
    });

    it('該当行が無い場合は空配列を返す', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      expect(await repo.findMembershipScopes('acc-x')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // findGrantScopes
  // ---------------------------------------------------------------
  describe('findGrantScopes', () => {
    it('所属グループの取得は1回、grant の取得も scopeType で絞らず1回で返す', async () => {
      mockPrisma.userGroupMember.findMany.mockResolvedValue([
        { groupId: 'g-1' },
        { groupId: 'g-2' },
      ]);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeId: 'org-g', scopeType: 'ORGANIZATION' },
        { scopeId: 'proj-g', scopeType: 'PROJECT' },
        { scopeId: 'ch-g', scopeType: 'CHANNEL' },
      ]);

      const result = await repo.findGrantScopes('acc-1');

      expect(mockPrisma.userGroupMember.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userGroupMember.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        select: { groupId: true },
      });
      expect(mockPrisma.userGroupScopeGrant.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userGroupScopeGrant.findMany).toHaveBeenCalledWith({
        where: { groupId: { in: ['g-1', 'g-2'] } },
        select: { scopeId: true, scopeType: true },
      });
      expect(result).toEqual([
        { scopeId: 'org-g', scopeType: 'ORGANIZATION' },
        { scopeId: 'proj-g', scopeType: 'PROJECT' },
        { scopeId: 'ch-g', scopeType: 'CHANNEL' },
      ]);
    });

    it('管理グループ所属が0件なら grant を問い合わせない（where in [] を発行しない）', async () => {
      mockPrisma.userGroupMember.findMany.mockResolvedValue([]);

      const result = await repo.findGrantScopes('acc-none');

      expect(result).toEqual([]);
      expect(mockPrisma.userGroupScopeGrant.findMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // findPersonalSpaces
  // ---------------------------------------------------------------
  describe('findPersonalSpaces', () => {
    it('PERSONAL_MEMO（ownerId一致）と PERSONAL_DM（owner/peer 両一致）を OR で拾う', async () => {
      mockPrisma.space.findMany.mockResolvedValue([{ id: 'memo-1' }, { id: 'dm-1' }]);

      const result = await repo.findPersonalSpaces('acc-1');

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { kind: 'PERSONAL_MEMO', ownerId: 'acc-1' },
            {
              kind: 'PERSONAL_DM',
              OR: [{ ownerId: 'acc-1' }, { peerAccountId: 'acc-1' }],
            },
          ],
        },
        select: { id: true },
      });
      expect(result).toEqual([{ id: 'memo-1' }, { id: 'dm-1' }]);
    });

    it('該当行が無い場合は空配列を返す', async () => {
      mockPrisma.space.findMany.mockResolvedValue([]);
      expect(await repo.findPersonalSpaces('acc-x')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // findActiveProjectsByOrgIds
  // ---------------------------------------------------------------
  describe('findActiveProjectsByOrgIds', () => {
    it('organizationId: { in: orgIds } + archivedAt: null のみで project を絞り id だけ select する', async () => {
      mockPrisma.project.findMany.mockResolvedValue([{ id: 'proj-1' }, { id: 'proj-2' }]);

      const result = await repo.findActiveProjectsByOrgIds(['org-1', 'org-2']);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { organizationId: { in: ['org-1', 'org-2'] }, archivedAt: null },
        select: { id: true },
      });
      expect(result).toEqual([{ id: 'proj-1' }, { id: 'proj-2' }]);
    });

    it('空配列でも where 句は維持する（Service 側の呼び出し要否判断責務＝orgIds 空のときは Service 側で skip する）', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      const result = await repo.findActiveProjectsByOrgIds([]);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { organizationId: { in: [] }, archivedAt: null },
        select: { id: true },
      });
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // findGroupSpaces
  // ---------------------------------------------------------------
  describe('findGroupSpaces', () => {
    it('kind=GROUP + id: { in } + archivedAt: null で space を絞り id だけ select する', async () => {
      mockPrisma.space.findMany.mockResolvedValue([{ id: 'group-1' }]);

      const result = await repo.findGroupSpaces(['group-1', 'group-2']);

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith({
        where: { kind: 'GROUP', id: { in: ['group-1', 'group-2'] }, archivedAt: null },
        select: { id: true },
      });
      expect(result).toEqual([{ id: 'group-1' }]);
    });

    it('空配列でも where 句は維持する（Service 側は常に呼ぶ契約＝skip しない）', async () => {
      mockPrisma.space.findMany.mockResolvedValue([]);

      const result = await repo.findGroupSpaces([]);

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith({
        where: { kind: 'GROUP', id: { in: [] }, archivedAt: null },
        select: { id: true },
      });
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // findChannelSpacesByProjectIds
  // ---------------------------------------------------------------
  describe('findChannelSpacesByProjectIds', () => {
    it('kind=CHANNEL + projectId: { in } + archivedAt: null で space を絞り id だけ select する', async () => {
      mockPrisma.space.findMany.mockResolvedValue([{ id: 'ch-1' }, { id: 'ch-2' }]);

      const result = await repo.findChannelSpacesByProjectIds(['proj-1']);

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith({
        where: { kind: 'CHANNEL', projectId: { in: ['proj-1'] }, archivedAt: null },
        select: { id: true },
      });
      expect(result).toEqual([{ id: 'ch-1' }, { id: 'ch-2' }]);
    });

    it('空配列でも where 句は維持する（Service 側は常に呼ぶ契約＝skip しない）', async () => {
      mockPrisma.space.findMany.mockResolvedValue([]);

      const result = await repo.findChannelSpacesByProjectIds([]);

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith({
        where: { kind: 'CHANNEL', projectId: { in: [] }, archivedAt: null },
        select: { id: true },
      });
      expect(result).toEqual([]);
    });
  });

  describe('findActiveChannelSpacesByIds', () => {
    it('直接 scopeId 群から非アーカイブ CHANNEL だけを取得する', async () => {
      mockPrisma.space.findMany.mockResolvedValue([{ id: 'ch-1' }]);

      const result = await repo.findActiveChannelSpacesByIds(['ch-1', 'group-1']);

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith({
        where: { kind: 'CHANNEL', id: { in: ['ch-1', 'group-1'] }, archivedAt: null },
        select: { id: true },
      });
      expect(result).toEqual([{ id: 'ch-1' }]);
    });
  });
});
