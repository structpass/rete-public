import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { MembershipScopeType } from '@rete/shared';
import { UserGroupsRepository } from './user-groups.repository';
import { PrismaService } from '../../../database/prisma.service';
import { MembershipsRepository } from '../../memberships/repositories/memberships.repository';

/** $transaction はコールバックをそのまま実行し tx を渡す（ガードの count→write 原子化を検証）。 */
const mockTx = {
  userGroupMember: {
    findUnique: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  userGroupScopeGrant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userGroup: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  membership: { count: jest.fn() },
  organization: { findUnique: jest.fn() },
  project: { findUnique: jest.fn() },
  space: { findUnique: jest.fn() },
};

const mockPrisma = {
  userGroup: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  userGroupMember: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  userGroupScopeGrant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
};

describe('UserGroupsRepository', () => {
  let repo: UserGroupsRepository;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    // resetMocks: true のため $transaction の実装（コールバック実行）を毎回張り直す
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    );
    moduleRef = await Test.createTestingModule({
      providers: [
        UserGroupsRepository,
        { provide: PrismaService, useValue: mockPrisma },
        // countEffectiveAdmins は memberships 側へ委譲（tx 協調の実体をこの spec で検証）
        {
          provide: MembershipsRepository,
          useValue: { countEffectiveAdmins: jest.fn().mockResolvedValue(0) },
        },
      ],
    }).compile();

    repo = moduleRef.get<UserGroupsRepository>(UserGroupsRepository);
  });

  describe('findAll', () => {
    it('アーカイブ絞り込みを持たずに全件を返す（includeArchived の撤去固定）', async () => {
      mockPrisma.userGroup.findMany.mockResolvedValue([]);

      await repo.findAll();

      const arg = mockPrisma.userGroup.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(arg).not.toHaveProperty('where');
      expect(mockPrisma.userGroup.findMany).toHaveBeenCalledWith({
        select: expect.any(Object),
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('deleteWithDependents', () => {
    it('所属設定 → メンバー → グループ行の順に削除し、削除件数を返す', async () => {
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([]);
      mockTx.userGroupScopeGrant.deleteMany.mockResolvedValue({ count: 2 });
      mockTx.userGroupMember.deleteMany.mockResolvedValue({ count: 3 });
      mockTx.userGroup.delete.mockResolvedValue({ id: 'grp-1' });

      await expect(repo.deleteWithDependents('grp-1')).resolves.toEqual({
        blocked: false,
        deletedGrantCount: 2,
        deletedMemberCount: 3,
      });

      expect(mockTx.userGroupScopeGrant.deleteMany).toHaveBeenCalledWith({
        where: { groupId: 'grp-1' },
      });
      expect(mockTx.userGroupMember.deleteMany).toHaveBeenCalledWith({
        where: { groupId: 'grp-1' },
      });
      expect(mockTx.userGroup.delete).toHaveBeenCalledWith({ where: { id: 'grp-1' } });
      // 連鎖削除は残骸を残さない順序であること（所属設定 → メンバー → グループ行）
      const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
        fn.mock.invocationCallOrder[0];
      expect(order(mockTx.userGroupScopeGrant.deleteMany)).toBeLessThan(
        order(mockTx.userGroupMember.deleteMany),
      );
      expect(order(mockTx.userGroupMember.deleteMany)).toBeLessThan(order(mockTx.userGroup.delete));
    });

    it('ADMIN grantを除外すると実効 ADMIN がゼロになる場合は blocked で削除しない', async () => {
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'ORGANIZATION', scopeId: 'org-1' },
      ]);
      mockTx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      mockTx.userGroupMember.count.mockResolvedValue(1);
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(0);

      await expect(repo.deleteWithDependents('grp-1')).resolves.toEqual({
        blocked: true,
        deletedGrantCount: 0,
        deletedMemberCount: 0,
      });

      expect(membershipsRepo.countEffectiveAdmins).toHaveBeenCalledWith('ORGANIZATION', 'org-1', {
        excludeGroupId: 'grp-1',
        tx: mockTx,
      });
      expect(mockTx.userGroupScopeGrant.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.userGroupMember.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.userGroup.delete).not.toHaveBeenCalled();
    });

    it('複数のADMIN grantをすべて確認し、他の実効 ADMIN が残れば削除する', async () => {
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'ORGANIZATION', scopeId: 'org-1' },
        { scopeType: 'PROJECT', scopeId: 'project-1' },
      ]);
      mockTx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      mockTx.project.findUnique.mockResolvedValue({ id: 'project-1' });
      mockTx.userGroupMember.count.mockResolvedValue(1);
      mockTx.userGroupScopeGrant.deleteMany.mockResolvedValue({ count: 2 });
      mockTx.userGroupMember.deleteMany.mockResolvedValue({ count: 1 });
      mockTx.userGroup.delete.mockResolvedValue({ id: 'grp-1' });
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(1);

      await expect(repo.deleteWithDependents('grp-1')).resolves.toEqual({
        blocked: false,
        deletedGrantCount: 2,
        deletedMemberCount: 1,
      });

      expect(membershipsRepo.countEffectiveAdmins).toHaveBeenNthCalledWith(
        1,
        'ORGANIZATION',
        'org-1',
        { excludeGroupId: 'grp-1', tx: mockTx },
      );
      expect(membershipsRepo.countEffectiveAdmins).toHaveBeenNthCalledWith(
        2,
        'PROJECT',
        'project-1',
        { excludeGroupId: 'grp-1', tx: mockTx },
      );
    });

    it('メンバーがいないグループのADMIN grantは実効権限を消さないため削除できる', async () => {
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'ORGANIZATION', scopeId: 'org-1' },
      ]);
      mockTx.userGroupMember.count.mockResolvedValue(0);
      mockTx.userGroupScopeGrant.deleteMany.mockResolvedValue({ count: 1 });
      mockTx.userGroupMember.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.userGroup.delete.mockResolvedValue({ id: 'grp-1' });
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };

      await expect(repo.deleteWithDependents('grp-1')).resolves.toEqual({
        blocked: false,
        deletedGrantCount: 1,
        deletedMemberCount: 0,
      });

      expect(membershipsRepo.countEffectiveAdmins).not.toHaveBeenCalled();
    });

    it('スコープが物理削除済みの ADMIN grant は判定から外し、削除できる', async () => {
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'ORGANIZATION', scopeId: 'org-gone' },
      ]);
      mockTx.userGroupMember.count.mockResolvedValue(1);
      mockTx.organization.findUnique.mockResolvedValue(null);
      mockTx.userGroupScopeGrant.deleteMany.mockResolvedValue({ count: 1 });
      mockTx.userGroupMember.deleteMany.mockResolvedValue({ count: 1 });
      mockTx.userGroup.delete.mockResolvedValue({ id: 'grp-1' });
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };

      await expect(repo.deleteWithDependents('grp-1')).resolves.toEqual({
        blocked: false,
        deletedGrantCount: 1,
        deletedMemberCount: 1,
      });

      expect(membershipsRepo.countEffectiveAdmins).not.toHaveBeenCalled();
    });

    it('CHANNEL grant は space が実在する時に判定へ含める', async () => {
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'CHANNEL', scopeId: 'ch-1' },
      ]);
      mockTx.userGroupMember.count.mockResolvedValue(1);
      mockTx.space.findUnique.mockResolvedValue({ kind: 'CHANNEL' });
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(0);

      await expect(repo.deleteWithDependents('grp-1')).resolves.toEqual({
        blocked: true,
        deletedGrantCount: 0,
        deletedMemberCount: 0,
      });

      expect(mockTx.space.findUnique).toHaveBeenCalledWith({
        where: { id: 'ch-1' },
        select: { kind: true },
      });
      expect(membershipsRepo.countEffectiveAdmins).toHaveBeenCalledWith('CHANNEL', 'ch-1', {
        excludeGroupId: 'grp-1',
        tx: mockTx,
      });
    });

    it('グループ行の削除が失敗したら例外を伝播する（成功扱いにしない）', async () => {
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([]);
      mockTx.userGroupScopeGrant.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.userGroupMember.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.userGroup.delete.mockRejectedValue(new Error('Record to delete does not exist.'));

      await expect(repo.deleteWithDependents('grp-x')).rejects.toThrow(
        'Record to delete does not exist.',
      );
    });
  });

  describe('アーカイブ API の不在（撤去の固定）', () => {
    it('repository にアーカイブ/復元のメソッドが無い', () => {
      const methods = Object.getOwnPropertyNames(UserGroupsRepository.prototype);
      expect(methods.filter((name) => /archive|restore|includeArchived/i.test(name))).toEqual([]);
    });
  });

  describe('removeMemberGuarded', () => {
    it('メンバー不在なら { blocked: false, deleted: false }（削除しない）', async () => {
      mockTx.userGroupMember.findUnique.mockResolvedValue(null);
      const result = await repo.removeMemberGuarded('grp-1', 'acc-1');
      expect(result).toEqual({ blocked: false, deleted: false });
      expect(mockTx.userGroupMember.delete).not.toHaveBeenCalled();
    });

    it('ADMIN grant が無ければ通常削除（grant 無し＝ガード対象外）', async () => {
      mockTx.userGroupMember.findUnique.mockResolvedValue({ id: 'm-1' });
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([]);
      const result = await repo.removeMemberGuarded('grp-1', 'acc-1');
      expect(result).toEqual({ blocked: false, deleted: true });
      expect(mockTx.userGroupMember.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } });
    });

    it('他メンバーが残る ADMIN grant スコープはガード対象外（grant は有効なまま）', async () => {
      mockTx.userGroupMember.findUnique.mockResolvedValue({ id: 'm-1' });
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'ORGANIZATION', scopeId: 'org-1' },
      ]);
      // 対象メンバー以外が 1 人残る
      mockTx.userGroupMember.count.mockResolvedValue(1);
      const result = await repo.removeMemberGuarded('grp-1', 'acc-1');
      expect(result).toEqual({ blocked: false, deleted: true });
      expect(mockTx.userGroupMember.delete).toHaveBeenCalled();
    });

    it('唯一メンバー＋実効 ADMIN が他にゼロなら blocked（全消失ガード）', async () => {
      mockTx.userGroupMember.findUnique.mockResolvedValue({ id: 'm-1' });
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'ORGANIZATION', scopeId: 'org-1' },
      ]);
      mockTx.userGroupMember.count.mockResolvedValue(0); // 他メンバー無し
      // memberships 側の実効 ADMIN カウント: 0（他に ADMIN 源なし）
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(0);
      const result = await repo.removeMemberGuarded('grp-1', 'acc-1');
      expect(result).toEqual({ blocked: true, deleted: false });
      expect(mockTx.userGroupMember.delete).not.toHaveBeenCalled();
    });

    it('唯一メンバーでも他に実効 ADMIN が居れば削除できる', async () => {
      mockTx.userGroupMember.findUnique.mockResolvedValue({ id: 'm-1' });
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'ORGANIZATION', scopeId: 'org-1' },
      ]);
      mockTx.userGroupMember.count.mockResolvedValue(0);
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(1);
      const result = await repo.removeMemberGuarded('grp-1', 'acc-1');
      expect(result).toEqual({ blocked: false, deleted: true });
    });

    // v2-231: スコープが物理削除されると grant 行は残る（外部キーが無い）。実体の無い grant を
    // 実効 ADMIN 源として数えると、そのグループからメンバーも grant も外せなくなる（グループごと
    // 削除するしか逃げ道が無い）。deleteWithDependents と同じく判定から外す。
    it('実体の消えたスコープの ADMIN grant は判定から外し、唯一メンバーでも削除できる', async () => {
      mockTx.userGroupMember.findUnique.mockResolvedValue({ id: 'm-1' });
      mockTx.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeType: 'ORGANIZATION', scopeId: 'org-gone' },
      ]);
      mockTx.userGroupMember.count.mockResolvedValue(0); // 唯一メンバー
      mockTx.organization.findUnique.mockResolvedValue(null); // スコープは物理削除済み
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(0); // 数えてしまうと blocked になる値

      const result = await repo.removeMemberGuarded('grp-1', 'acc-1');

      expect(result).toEqual({ blocked: false, deleted: true });
      expect(membershipsRepo.countEffectiveAdmins).not.toHaveBeenCalled();
      expect(mockTx.userGroupMember.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } });
    });
  });

  describe('removeGrantGuarded', () => {
    it('grant 不在なら { blocked: false, deleted: false }', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue(null);
      const result = await repo.removeGrantGuarded(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
      );
      expect(result).toEqual({ blocked: false, deleted: false, role: null });
    });

    it('MEMBER grant の剥奪はガード対象外（ADMIN のみ）', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue({ id: 'g-1', role: 'MEMBER' });
      const result = await repo.removeGrantGuarded(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
      );
      expect(result).toEqual({ blocked: false, deleted: true, role: 'MEMBER' });
    });

    it('ADMIN grant 剥奪で実効 ADMIN がゼロになるなら blocked', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue({ id: 'g-1', role: 'ADMIN' });
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(0);
      const result = await repo.removeGrantGuarded(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
      );
      expect(result).toEqual({ blocked: true, deleted: false, role: 'ADMIN' });
      expect(membershipsRepo.countEffectiveAdmins).toHaveBeenCalledWith('ORGANIZATION', 'org-1', {
        excludeGroupId: 'grp-1',
        tx: mockTx,
      });
    });

    it('ADMIN grant 剥奪でも他に実効 ADMIN が居れば剥奪できる', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue({ id: 'g-1', role: 'ADMIN' });
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(1);
      const result = await repo.removeGrantGuarded(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
      );
      expect(result).toEqual({ blocked: false, deleted: true, role: 'ADMIN' });
    });

    // v2-231: 剥奪だけが永久に 409 で塞がる非対称を作らない（deleteWithDependents は既に除外している）。
    it('実体の消えたスコープの ADMIN grant は判定から外し、剥奪できる', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue({ id: 'g-1', role: 'ADMIN' });
      mockTx.organization.findUnique.mockResolvedValue(null); // スコープは物理削除済み
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(0);

      const result = await repo.removeGrantGuarded(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
      );

      expect(result).toEqual({ blocked: false, deleted: true, role: 'ADMIN' });
      expect(membershipsRepo.countEffectiveAdmins).not.toHaveBeenCalled();
      expect(mockTx.userGroupScopeGrant.delete).toHaveBeenCalledWith({ where: { id: 'g-1' } });
    });
  });

  describe('upsertGrant', () => {
    it('新規 grant は create して { created: true, blocked: false }', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue(null);
      const result = await repo.upsertGrant(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
        'MEMBER',
      );
      expect(result).toEqual({ created: true, blocked: false });
      expect(mockTx.userGroupScopeGrant.create).toHaveBeenCalledWith({
        data: { groupId: 'grp-1', scopeType: 'ORGANIZATION', scopeId: 'org-1', role: 'MEMBER' },
      });
    });

    it('既存 MEMBER → ADMIN 昇格はガード対象外（作成/昇格は許可）', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue({ id: 'g-1', role: 'MEMBER' });
      const result = await repo.upsertGrant(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
        'ADMIN',
      );
      expect(result).toEqual({ created: false, blocked: false });
      expect(mockTx.userGroupScopeGrant.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { role: 'ADMIN' },
      });
    });

    it('ADMIN → MEMBER 降格で実効 ADMIN がゼロになるなら blocked（全消失ガード）', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue({ id: 'g-1', role: 'ADMIN' });
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(0);
      const result = await repo.upsertGrant(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
        'MEMBER',
      );
      expect(result).toEqual({ created: false, blocked: true });
      expect(mockTx.userGroupScopeGrant.update).not.toHaveBeenCalled();
      expect(membershipsRepo.countEffectiveAdmins).toHaveBeenCalledWith('ORGANIZATION', 'org-1', {
        excludeGroupId: 'grp-1',
        tx: mockTx,
      });
    });

    it('ADMIN → MEMBER 降格でも他に実効 ADMIN が居れば降格できる', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue({ id: 'g-1', role: 'ADMIN' });
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(1);
      const result = await repo.upsertGrant(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
        'MEMBER',
      );
      expect(result).toEqual({ created: false, blocked: false });
      expect(mockTx.userGroupScopeGrant.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { role: 'MEMBER' },
      });
    });

    // v2-231: 判定の規則を1つに揃える（実体の無いスコープは実効権限を生まない＝判定しない）。
    it('実体の消えたスコープの降格はガード対象外（判定から外して更新する）', async () => {
      mockTx.userGroupScopeGrant.findUnique.mockResolvedValue({ id: 'g-1', role: 'ADMIN' });
      mockTx.organization.findUnique.mockResolvedValue(null);
      const membershipsRepo = moduleRef.get(MembershipsRepository) as unknown as {
        countEffectiveAdmins: jest.Mock;
      };
      membershipsRepo.countEffectiveAdmins.mockResolvedValue(0);

      const result = await repo.upsertGrant(
        'grp-1',
        MembershipScopeType.ORGANIZATION,
        'org-1',
        'MEMBER',
      );

      expect(result).toEqual({ created: false, blocked: false });
      expect(membershipsRepo.countEffectiveAdmins).not.toHaveBeenCalled();
      expect(mockTx.userGroupScopeGrant.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { role: 'MEMBER' },
      });
    });
  });
});
