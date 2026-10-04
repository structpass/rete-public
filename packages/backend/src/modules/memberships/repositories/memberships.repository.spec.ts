import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { MembershipScopeType } from '@rete/shared';
import type { MembershipWithAccount } from './memberships.repository';
import { MembershipsRepository } from './memberships.repository';
import { PrismaService } from '../../../database/prisma.service';
import { makeMembershipWithAccount, makeMembershipRow } from '../../../__tests__/factories';

const mockPrisma = {
  organization: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  project: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  space: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  userGroup: {
    findMany: jest.fn(),
  },
  account: {
    findMany: jest.fn(),
  },
  membership: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  userGroupMember: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  userGroupScopeGrant: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('MembershipsRepository', () => {
  let repo: MembershipsRepository;

  beforeEach(async () => {
    // resetMocks: true のため $transaction の実装（コールバック実行）を毎回張り直す
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [MembershipsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<MembershipsRepository>(MembershipsRepository);
  });

  describe('findPermissionMatrix', () => {
    it('画面初期表示をスコープ数に依存しない固定5クエリで取得する', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.space.findMany.mockResolvedValue([]);
      mockPrisma.userGroup.findMany.mockResolvedValue([]);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([]);

      await expect(repo.findPermissionMatrix()).resolves.toEqual({
        organizations: [],
        projects: [],
        channels: [],
        groups: [],
        grants: [],
      });

      expect(mockPrisma.organization.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.project.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.space.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userGroup.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.account.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.userGroupScopeGrant.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // findMembership
  // ---------------------------------------------------------------
  describe('findMembership', () => {
    it('accountId_scopeType_scopeId 複合 unique キーで findUnique を呼び id / role だけ select する', async () => {
      const fixture = { id: 'mship-1', role: 'MEMBER' };
      mockPrisma.membership.findUnique.mockResolvedValue(fixture);

      const result = await repo.findMembership('acc-1', 'ORGANIZATION', 'org-1');

      expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
        where: {
          accountId_scopeType_scopeId: {
            accountId: 'acc-1',
            scopeType: MembershipScopeType.ORGANIZATION,
            scopeId: 'org-1',
          },
        },
        select: { id: true, role: true },
      });
      expect(result).toEqual({ id: 'mship-1', role: 'MEMBER' });
    });

    it('該当行が無い場合は null を返す', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue(null);
      const result = await repo.findMembership('acc-x', 'PROJECT', 'proj-1');
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // findByScope
  // ---------------------------------------------------------------
  describe('findByScope', () => {
    it('scopeType / scopeId で絞り込み account.name 込みの行を createdAt 昇順で返す', async () => {
      const rows = [
        makeMembershipWithAccount({
          scopeType: 'PROJECT' as MembershipScopeType,
          scopeId: 'proj-1',
        }),
      ];
      mockPrisma.membership.findMany.mockResolvedValue(rows);

      const result = await repo.findByScope('PROJECT', 'proj-1');

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { scopeType: MembershipScopeType.PROJECT, scopeId: 'proj-1' },
          orderBy: { createdAt: 'asc' },
        }),
      );
      // 戻り値は account.name を含む MembershipWithAccount の配列
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('account');
      expect(result[0].account).toHaveProperty('name');
    });
  });

  // ---------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------
  describe('findById', () => {
    it('id で findUnique を呼び基本 select 列を返す（account 名は含まない）', async () => {
      const row = makeMembershipRow({ id: 'mship-5' });
      mockPrisma.membership.findUnique.mockResolvedValue(row);

      const result = await repo.findById('mship-5');

      expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'mship-5' } }),
      );
      expect(result).toMatchObject({ id: 'mship-5' });
      // account 名は含まない（MembershipRow は account を select しない）
      expect(result).not.toHaveProperty('account');
    });

    it('存在しない id は null を返す', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue(null);
      expect(await repo.findById('non-existent')).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------
  describe('upsert', () => {
    it('unique 制約キーで upsert し account.name 込みの行を返す（冪等・重複招待を許容）', async () => {
      const returned = makeMembershipWithAccount(
        {
          accountId: 'acc-2',
          scopeType: 'PROJECT' as MembershipScopeType,
          scopeId: 'proj-1',
          role: 'ADMIN' as MembershipWithAccount['role'],
        },
        '田中 一郎',
      );
      mockPrisma.membership.upsert.mockResolvedValue(returned);

      const result = await repo.upsert({
        accountId: 'acc-2',
        scopeType: 'PROJECT',
        scopeId: 'proj-1',
        role: 'ADMIN',
      });

      expect(mockPrisma.membership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            accountId_scopeType_scopeId: {
              accountId: 'acc-2',
              scopeType: MembershipScopeType.PROJECT,
              scopeId: 'proj-1',
            },
          },
          create: expect.objectContaining({
            accountId: 'acc-2',
            scopeType: MembershipScopeType.PROJECT,
            scopeId: 'proj-1',
            role: 'ADMIN',
          }),
          update: { role: 'ADMIN' },
        }),
      );
      // 戻り値は account.name を持つ（mapper の入力型）
      expect(result.row?.account?.name).toBe('田中 一郎');
      expect(result.row?.role).toBe('ADMIN');
      expect(result.blocked).toBe(false);
    });

    it('ADMIN→MEMBER 降格が唯一の実効 ADMIN 源なら blocked=true を返し更新しない（criteria 3・role 上書き経路のガード迂回を塞ぐ）', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'mship-last',
        role: 'ADMIN',
      });
      // findEffectiveAdmins: 個別 ADMIN 0（excludeMembershipId で除外）＋ grant 源 0
      mockPrisma.membership.count.mockResolvedValue(0);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([]);

      const result = await repo.upsert({
        accountId: 'acc-2',
        scopeType: 'PROJECT',
        scopeId: 'proj-1',
        role: 'MEMBER',
      });

      expect(result.blocked).toBe(true);
      expect(result.row).toBeNull();
      expect(mockPrisma.membership.upsert).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------
  describe('delete', () => {
    it('id で membership を削除し void を返す', async () => {
      mockPrisma.membership.delete.mockResolvedValue({});

      await repo.delete('mship-del');

      expect(mockPrisma.membership.delete).toHaveBeenCalledWith({ where: { id: 'mship-del' } });
    });
  });

  // ---------------------------------------------------------------
  // findAdminScopeIds
  // ---------------------------------------------------------------
  describe('findAdminScopeIds', () => {
    it('accountId / scopeType / role=ADMIN で絞り込み scopeId のみ select する（N+1 回避）', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([{ scopeId: 'proj-10' }]);

      const result = await repo.findAdminScopeIds('acc-1', 'PROJECT');

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', scopeType: MembershipScopeType.PROJECT, role: 'ADMIN' },
        select: { scopeId: true },
      });
      expect(result).toEqual([{ scopeId: 'proj-10' }]);
    });

    it('ADMIN ロールを持たない場合は空配列を返す', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      const result = await repo.findAdminScopeIds('acc-1', 'PROJECT');
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // update（role 変更 / set-0027 membership PATCH）
  // ---------------------------------------------------------------
  describe('update', () => {
    it('id で membership を update し role を変更して account.name 込みの行を返す', async () => {
      const returned = makeMembershipWithAccount(
        { id: 'mship-1', role: 'ADMIN' as MembershipWithAccount['role'] },
        '田中 一郎',
      );
      mockPrisma.membership.update.mockResolvedValue(returned);

      const result = await repo.update('mship-1', { role: 'ADMIN' });

      expect(mockPrisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'mship-1' },
        data: { role: 'ADMIN' },
        select: expect.objectContaining({ id: true, role: true, account: expect.any(Object) }),
      });
      expect(result.role).toBe('ADMIN');
      expect(result.account?.name).toBe('田中 一郎');
    });

    it('MEMBER への降格も同じ update パスで動作する', async () => {
      const returned = makeMembershipWithAccount({
        id: 'mship-2',
        role: 'MEMBER' as MembershipWithAccount['role'],
      });
      mockPrisma.membership.update.mockResolvedValue(returned);

      const result = await repo.update('mship-2', { role: 'MEMBER' });

      expect(mockPrisma.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'mship-2' }, data: { role: 'MEMBER' } }),
      );
      expect(result.role).toBe('MEMBER');
    });
  });

  // ---------------------------------------------------------------
  // countEffectiveAdmins（set-0164 criteria 3・3 テーブル横断）
  // ---------------------------------------------------------------
  describe('countEffectiveAdmins', () => {
    it('個別 membership の ADMIN 数 + メンバー 1 人以上の ADMIN grant グループ数を合算する', async () => {
      mockPrisma.membership.count.mockResolvedValue(2);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([
        { groupId: 'grp-1' },
        { groupId: 'grp-2' },
        { groupId: 'grp-3' },
      ]);
      mockPrisma.userGroupMember.groupBy.mockResolvedValue([
        { groupId: 'grp-1', _count: { id: 3 } },
        { groupId: 'grp-2', _count: { id: 1 } },
        // grp-3 はメンバー 0 ＝ grant があっても実効 ADMIN 源にならない
      ]);

      const result = await repo.countEffectiveAdmins('ORGANIZATION', 'org-1');

      expect(result).toBe(4); // 2 (direct) + 2 (grp-1, grp-2)
      expect(mockPrisma.userGroupScopeGrant.findMany).toHaveBeenCalledWith({
        where: {
          scopeType: MembershipScopeType.ORGANIZATION,
          scopeId: 'org-1',
          role: 'ADMIN',
        },
        select: { groupId: true },
      });
    });

    it('grant ゼロ件なら個別 ADMIN 数のみ（従来挙動と同値・criteria 2）', async () => {
      mockPrisma.membership.count.mockResolvedValue(1);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([]);

      const result = await repo.countEffectiveAdmins('PROJECT', 'proj-1');

      expect(result).toBe(1);
      expect(mockPrisma.userGroupMember.groupBy).not.toHaveBeenCalled();
    });

    it('excludeGroupId で特定グループの ADMIN grant を除外して数える', async () => {
      mockPrisma.membership.count.mockResolvedValue(0);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([]);

      await repo.countEffectiveAdmins('ORGANIZATION', 'org-1', { excludeGroupId: 'grp-1' });

      expect(mockPrisma.userGroupScopeGrant.findMany).toHaveBeenCalledWith({
        where: {
          scopeType: MembershipScopeType.ORGANIZATION,
          scopeId: 'org-1',
          role: 'ADMIN',
          groupId: { not: 'grp-1' },
        },
        select: { groupId: true },
      });
    });
  });

  // ---------------------------------------------------------------
  // deleteLastAdminGuarded / demoteLastAdminGuarded（set-0164 実効 ADMIN ベース）
  // ---------------------------------------------------------------
  describe('deleteLastAdminGuarded', () => {
    it('対象を除いた実効 ADMIN が 0 なら blocked（削除しない）', async () => {
      mockPrisma.membership.count.mockResolvedValue(0);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([]);

      const result = await repo.deleteLastAdminGuarded('mship-1', 'ORGANIZATION', 'org-1');

      expect(result).toEqual({ blocked: true });
      expect(mockPrisma.membership.delete).not.toHaveBeenCalled();
    });

    it('対象を除いても実効 ADMIN が残るなら削除する', async () => {
      mockPrisma.membership.count.mockResolvedValue(1);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([]);
      mockPrisma.membership.delete.mockResolvedValue({ id: 'mship-1' });

      const result = await repo.deleteLastAdminGuarded('mship-1', 'ORGANIZATION', 'org-1');

      expect(result).toEqual({ blocked: false });
      expect(mockPrisma.membership.delete).toHaveBeenCalledWith({ where: { id: 'mship-1' } });
    });

    it('対象を除いても ADMIN grant（メンバー 1 人以上）が残るなら削除できる（実効 ADMIN ベース）', async () => {
      // 個別 ADMIN は対象の 1 人のみだが、グループ grant 経由の ADMIN が残る
      mockPrisma.membership.count.mockResolvedValue(0);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([{ groupId: 'grp-1' }]);
      mockPrisma.userGroupMember.groupBy.mockResolvedValue([
        { groupId: 'grp-1', _count: { id: 2 } },
      ]);
      mockPrisma.membership.delete.mockResolvedValue({ id: 'mship-1' });

      const result = await repo.deleteLastAdminGuarded('mship-1', 'ORGANIZATION', 'org-1');

      expect(result).toEqual({ blocked: false });
      expect(mockPrisma.membership.delete).toHaveBeenCalled();
    });
  });

  describe('demoteLastAdminGuarded', () => {
    it('対象を除いた実効 ADMIN が 0 なら blocked（降格しない）', async () => {
      mockPrisma.membership.count.mockResolvedValue(0);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([]);

      const result = await repo.demoteLastAdminGuarded('mship-1', 'ORGANIZATION', 'org-1');

      expect(result).toEqual({ blocked: true });
      expect(mockPrisma.membership.update).not.toHaveBeenCalled();
    });

    it('対象を除いても実効 ADMIN が残るなら MEMBER へ降格する', async () => {
      mockPrisma.membership.count.mockResolvedValue(1);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([]);
      mockPrisma.membership.update.mockResolvedValue(
        makeMembershipWithAccount({ id: 'mship-1', role: 'MEMBER' }),
      );

      const result = await repo.demoteLastAdminGuarded('mship-1', 'ORGANIZATION', 'org-1');

      expect(result).toEqual({ blocked: false, row: expect.objectContaining({ id: 'mship-1' }) });
      expect(mockPrisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'mship-1' },
        data: { role: 'MEMBER' },
        select: expect.objectContaining({ id: true, role: true }),
      });
    });
  });
});
