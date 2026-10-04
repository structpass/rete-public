import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ProjectsRepository } from './projects.repository';
import { PrismaService } from '../../../database/prisma.service';
import { makeProjectRow } from '../../../__tests__/factories';
import { installTxPassthrough } from '../../../__tests__/tx-passthrough';

// $transaction コールバックに渡すトランザクションモック
const txMock = {
  project: {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  membership: {
    upsert: jest.fn(),
  },
  space: {
    updateMany: jest.fn(),
  },
};

const mockPrisma = {
  project: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userGroupMember: {
    findMany: jest.fn(),
  },
  userGroupScopeGrant: {
    findMany: jest.fn(),
  },
  membership: {
    upsert: jest.fn(),
  },
  // 実装（txMock パススルー）は beforeEach で毎回再設定する。
  $transaction: jest.fn(),
};

describe('ProjectsRepository', () => {
  let repo: ProjectsRepository;

  // cmn-0335: $transaction の通し設定を共通ヘルパへ委譲（見張り込みで beforeEach/afterEach を自前登録）。
  installTxPassthrough(mockPrisma, txMock);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProjectsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<ProjectsRepository>(ProjectsRepository);
  });

  describe('createWithMemberships', () => {
    it('project と ADMIN membership 群を同一 $transaction 内で作成する', async () => {
      const projectRow = makeProjectRow({
        id: 'proj-new',
        organizationId: 'org-1',
        name: '新規PJ',
      });
      txMock.project.count.mockResolvedValue(0);
      txMock.project.create.mockResolvedValue(projectRow);
      txMock.membership.upsert.mockResolvedValue({});

      const result = await repo.createWithMemberships({ organizationId: 'org-1', name: '新規PJ' }, [
        'acc-1',
        'acc-2',
      ]);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-1', name: '新規PJ' }),
        }),
      );
      // adminAccountIds（2件）分の upsert が呼ばれる
      expect(txMock.membership.upsert).toHaveBeenCalledTimes(2);
      // 戻り値は ProjectRow 形状（id/organizationId/name/sortOrder/archivedAt/createdAt/updatedAt）
      expect(result.id).toBe('proj-new');
      expect(result.organizationId).toBe('org-1');
      expect(result.name).toBe('新規PJ');
    });

    it('sortOrder は nextSortOrder（組織内 count）で採番される', async () => {
      // 組織に既存 2 件 → nextSortOrder=2
      txMock.project.count.mockResolvedValue(2);
      const projectRow = makeProjectRow({ sortOrder: 2 });
      txMock.project.create.mockResolvedValue(projectRow);
      txMock.membership.upsert.mockResolvedValue({});

      await repo.createWithMemberships({ organizationId: 'org-1', name: 'PJ' }, ['acc-1']);

      expect(txMock.project.create.mock.calls[0][0].data.sortOrder).toBe(2);
    });

    it('membership の upsert は accountId_scopeType_scopeId を複合 where キーとして呼ぶ', async () => {
      const projectRow = makeProjectRow({ id: 'proj-x' });
      txMock.project.count.mockResolvedValue(0);
      txMock.project.create.mockResolvedValue(projectRow);
      txMock.membership.upsert.mockResolvedValue({});

      await repo.createWithMemberships({ organizationId: 'org-1', name: 'PJ' }, ['acc-1']);

      expect(txMock.membership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            accountId_scopeType_scopeId: {
              accountId: 'acc-1',
              scopeType: 'PROJECT',
              scopeId: 'proj-x',
            },
          },
          create: expect.objectContaining({
            accountId: 'acc-1',
            scopeType: 'PROJECT',
            role: 'ADMIN',
          }),
          update: { role: 'ADMIN' },
        }),
      );
    });
  });

  describe('findVisibleForUser', () => {
    it('可視組織 ID 群を in フィルタとして archivedAt=null の project.findMany を呼ぶ', async () => {
      mockPrisma.project.findMany.mockResolvedValue([makeProjectRow()]);

      const result = await repo.findVisibleForUser(['org-1', 'org-2']);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ archivedAt: null }),
          orderBy: [{ organizationId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        }),
      );
      // 戻り値は ProjectRow 配列（Date のまま・ISO 変換はせず mapper に委ねる）
      expect(result).toHaveLength(1);
      expect(result[0].createdAt).toBeInstanceOf(Date);
    });

    it('organizationId 指定時は where に organizationId フィルタを乗せる', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      await repo.findVisibleForUser(['org-1', 'org-2'], 'org-1');

      const call = mockPrisma.project.findMany.mock.calls[0][0];
      expect(call.where.organizationId).toBe('org-1');
    });

    it('非可視組織を organizationId 指定しても grant 経由があれば grant のプロジェクトだけ返す（criteria 9・存在秘匿は org 経由のみ）', async () => {
      mockPrisma.userGroupMember.findMany.mockResolvedValue([{ groupId: 'grp-1' }]);
      mockPrisma.userGroupScopeGrant.findMany.mockResolvedValue([
        { scopeId: 'proj-99' }, // 非可視組織 org-999 配下の grant プロジェクト
      ]);
      // org 経由: 可視集合外なので in:[] で空
      mockPrisma.project.findMany
        .mockResolvedValueOnce([]) // org 経由
        .mockResolvedValueOnce([makeProjectRow({ id: 'proj-99', organizationId: 'org-999' })]); // grant 経由

      const result = await repo.findVisibleForUser(['org-1'], 'org-999', 'user-1');

      // org 経由は空（存在秘匿）・grant 経由は organizationId で絞って union される
      const firstCall = mockPrisma.project.findMany.mock.calls[0][0];
      expect(firstCall.where.organizationId).toEqual({ in: [] });
      expect(result.map((p) => p.id)).toEqual(['proj-99']);
    });

    it('organizationId が可視集合外なら org 経由は空配列を返す（存在ごと見せない ADR 0037 §4.2）', async () => {
      // grant 経由は無し（userId 未指定）→ org 経由のみ・可視集合外は in:[] で空
      mockPrisma.project.findMany.mockResolvedValue([]);
      const result = await repo.findVisibleForUser(['org-1'], 'org-999');

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: { in: [] }, archivedAt: null } }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('id 指定で project.findUnique を呼び ProjectRow を返す', async () => {
      const row = makeProjectRow({ id: 'proj-1' });
      mockPrisma.project.findUnique.mockResolvedValue(row);

      const result = await repo.findById('proj-1');

      expect(mockPrisma.project.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'proj-1' } }),
      );
      expect(result).toBe(row);
    });

    it('存在しない場合は null を返す', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findOrganizationId', () => {
    it('projectId 指定で organizationId のみ select して findUnique を呼ぶ（存在確認専用）', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ organizationId: 'org-1' });

      const result = await repo.findOrganizationId('proj-1');

      expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        select: { organizationId: true },
      });
      expect(result).toEqual({ organizationId: 'org-1' });
    });

    it('存在しない場合は null を返す', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      expect(await repo.findOrganizationId('missing')).toBeNull();
    });
  });

  describe('update', () => {
    it('id と data を渡して project.update を呼び、更新後の ProjectRow を返す', async () => {
      const updated = makeProjectRow({ name: '改名後' });
      mockPrisma.project.update.mockResolvedValue(updated);

      const result = await repo.update('proj-1', { name: '改名後' });

      expect(mockPrisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proj-1' },
          data: { name: '改名後' },
        }),
      );
      expect(result.name).toBe('改名後');
    });

    it('archivedAt を渡した場合も data にそのまま含める（archive トグル）', async () => {
      const archivedAt = new Date('2026-06-01T00:00:00.000Z');
      const updated = makeProjectRow({ archivedAt });
      mockPrisma.project.update.mockResolvedValue(updated);

      const result = await repo.update('proj-1', { archivedAt });

      expect(mockPrisma.project.update.mock.calls[0][0].data.archivedAt).toEqual(archivedAt);
      expect(result.archivedAt).toEqual(archivedAt);
    });
  });

  // ============================================================
  // findAllAdmin（set-0027 テナント管理 ADMIN 向け一覧）
  // ============================================================
  describe('findAllAdmin', () => {
    it('includeArchived 未指定: archivedAt=null フィルタで全 project を取得する', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      await repo.findAllAdmin();

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ archivedAt: null }),
          orderBy: [{ organizationId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('includeArchived=true: archivedAt フィルタなし（where に archivedAt キーが含まれない）', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      await repo.findAllAdmin(true);

      const call = mockPrisma.project.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('archivedAt');
    });

    it('organizationId 指定時は where.organizationId でフィルタする', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      await repo.findAllAdmin(false, 'org-1');

      const call = mockPrisma.project.findMany.mock.calls[0][0];
      expect(call.where.organizationId).toBe('org-1');
    });
  });

  // ============================================================
  // adminUpdateWithCascade（set-0027 cascade archive/restore）
  // ============================================================
  describe('adminUpdateWithCascade', () => {
    it('archived 未指定（name のみ）: $transaction を呼ばず単純 update を呼ぶ', async () => {
      const row = makeProjectRow({ name: '改名' });
      mockPrisma.project.update.mockResolvedValue(row);

      const result = await repo.adminUpdateWithCascade('proj-1', { name: '改名' }, undefined);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'proj-1' }, data: { name: '改名' } }),
      );
      expect(result).toBe(row);
    });

    it('archived=true: $transaction 内で project.update と space.updateMany（CHANNEL・kind）を呼ぶ', async () => {
      const archivedAt = new Date();
      const projRow = makeProjectRow({ archivedAt });
      txMock.project.update.mockResolvedValue(projRow);
      txMock.space.updateMany.mockResolvedValue({ count: 2 });

      const result = await repo.adminUpdateWithCascade('proj-1', { archivedAt }, true);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.space.updateMany).toHaveBeenCalledWith({
        where: { projectId: { in: ['proj-1'] }, kind: 'CHANNEL' },
        data: { archivedAt: expect.any(Date) },
      });
      expect(result).toBe(projRow);
    });

    it('archived=false（復元）: $transaction 内で space.updateMany に archivedAt=null を渡す', async () => {
      const projRow = makeProjectRow();
      txMock.project.update.mockResolvedValue(projRow);
      txMock.space.updateMany.mockResolvedValue({ count: 1 });

      await repo.adminUpdateWithCascade('proj-1', { archivedAt: null }, false);

      expect(txMock.space.updateMany).toHaveBeenCalledWith({
        where: { projectId: { in: ['proj-1'] }, kind: 'CHANNEL' },
        data: { archivedAt: null },
      });
    });
  });
});
