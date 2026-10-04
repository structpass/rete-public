import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { OrganizationsRepository } from './organizations.repository';
import { PrismaService } from '../../../database/prisma.service';
import { makeOrganizationRow } from '../../../__tests__/factories';
import { installTxPassthrough } from '../../../__tests__/tx-passthrough';

// tx 内で使う Prisma client モック（$transaction のコールバックに渡す）。
const txMock = {
  organization: {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  membership: {
    create: jest.fn(),
  },
  project: {
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  space: {
    updateMany: jest.fn(),
  },
};

const mockPrisma = {
  organization: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  membership: {
    findMany: jest.fn(),
  },
  userGroupMember: {
    findMany: jest.fn(),
  },
  // コールバックに txMock を渡し、tx 内の呼び出しを検証可能にする（実装は beforeEach で毎回再設定）。
  $transaction: jest.fn(),
};

describe('OrganizationsRepository', () => {
  let repo: OrganizationsRepository;

  // cmn-0335: $transaction の通し設定を共通ヘルパへ委譲（見張り込みで beforeEach/afterEach を自前登録）。
  installTxPassthrough(mockPrisma, txMock);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrganizationsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<OrganizationsRepository>(OrganizationsRepository);
  });

  describe('createWithMembership', () => {
    it('$transaction 内で organization.create と ADMIN membership.create を発行し OrganizationRow を返すこと（ADR 0037 §5）', async () => {
      const orgRow = makeOrganizationRow({ name: 'テスト組織' });
      txMock.organization.count.mockResolvedValue(0);
      txMock.organization.create.mockResolvedValue(orgRow);
      txMock.membership.create.mockResolvedValue({});

      const result = await repo.createWithMembership('テスト組織', 'acc-1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'テスト組織' }),
          select: expect.any(Object),
        }),
      );
      expect(txMock.membership.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc-1',
          scopeType: 'ORGANIZATION',
          scopeId: orgRow.id,
          role: 'ADMIN',
        },
      });
      expect(result).toBe(orgRow);
    });

    it('membership は role=ADMIN・scopeType=ORGANIZATION で作成する（作成者自動昇格）', async () => {
      const orgRow = makeOrganizationRow();
      txMock.organization.count.mockResolvedValue(2);
      txMock.organization.create.mockResolvedValue(orgRow);
      txMock.membership.create.mockResolvedValue({});

      await repo.createWithMembership('組織B', 'acc-9');

      const membershipCall = txMock.membership.create.mock.calls[0][0];
      expect(membershipCall.data.role).toBe('ADMIN');
      expect(membershipCall.data.scopeType).toBe('ORGANIZATION');
      expect(membershipCall.data.accountId).toBe('acc-9');
    });

    it('sortOrder は organization.count の結果（既存行数）を採番する（nextSortOrder）', async () => {
      txMock.organization.count.mockResolvedValue(3);
      const orgRow = makeOrganizationRow({ sortOrder: 3 });
      txMock.organization.create.mockResolvedValue(orgRow);
      txMock.membership.create.mockResolvedValue({});

      await repo.createWithMembership('組織C', 'acc-1');

      expect(txMock.organization.count).toHaveBeenCalledTimes(1);
      expect(txMock.organization.create.mock.calls[0][0].data.sortOrder).toBe(3);
    });
  });

  describe('findVisibleForUser', () => {
    it('membership が 0 件なら organization を検索せず空配列を返すこと（二段クエリの早期リターン）', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      mockPrisma.userGroupMember.findMany.mockResolvedValue([]);

      const result = await repo.findVisibleForUser('acc-1');

      expect(result).toEqual([]);
      expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
    });

    it('membership.findMany は accountId と scopeType=ORGANIZATION でフィルタし scopeId のみ select すること', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      mockPrisma.userGroupMember.findMany.mockResolvedValue([]);

      await repo.findVisibleForUser('acc-99');

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-99', scopeType: 'ORGANIZATION' },
        select: { scopeId: true },
      });
    });

    it('membership の scopeId 群で organization を id IN・archivedAt=null・sortOrder 昇順で絞り込むこと', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([
        { scopeId: 'org-1' },
        { scopeId: 'org-2' },
      ]);
      mockPrisma.userGroupMember.findMany.mockResolvedValue([]);
      const rows = [
        makeOrganizationRow({ id: 'org-1', sortOrder: 0 }),
        makeOrganizationRow({ id: 'org-2', sortOrder: 1 }),
      ];
      mockPrisma.organization.findMany.mockResolvedValue(rows);

      const result = await repo.findVisibleForUser('acc-1');

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['org-1', 'org-2'] }, archivedAt: null },
        select: expect.any(Object),
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      expect(result).toBe(rows);
    });
  });

  describe('findById', () => {
    it('id 指定で organization.findUnique を organizationSelect で呼び OrganizationRow を返すこと', async () => {
      const row = makeOrganizationRow();
      mockPrisma.organization.findUnique.mockResolvedValue(row);

      const result = await repo.findById('org-1');

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        select: expect.objectContaining({
          id: true,
          name: true,
          sortOrder: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        }),
      });
      expect(result).toBe(row);
    });

    it('存在しない id の場合 null を返すこと', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('update', () => {
    it('id と data を渡し organizationSelect で organization.update を呼び OrganizationRow を返すこと', async () => {
      const row = makeOrganizationRow({ name: '改名後' });
      mockPrisma.organization.update.mockResolvedValue(row);

      const result = await repo.update('org-1', { name: '改名後' });

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: '改名後' },
        select: expect.objectContaining({
          id: true,
          name: true,
          sortOrder: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        }),
      });
      expect(result).toBe(row);
    });

    it('archivedAt を含む data も正しく渡せること（archive トグル）', async () => {
      const archivedAt = new Date('2026-06-01T00:00:00.000Z');
      const row = makeOrganizationRow({ archivedAt });
      mockPrisma.organization.update.mockResolvedValue(row);

      const result = await repo.update('org-1', { archivedAt });

      expect(mockPrisma.organization.update.mock.calls[0][0].data).toEqual({ archivedAt });
      expect(result).toBe(row);
    });
  });

  // ============================================================
  // findAllAdmin（set-0027 テナント管理 ADMIN 向け一覧）
  // ============================================================
  describe('findAllAdmin', () => {
    it('includeArchived 未指定: archivedAt=null のみで findMany を呼ぶ（既定は archived 除外）', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([]);

      await repo.findAllAdmin();

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { archivedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('includeArchived=false: archivedAt=null フィルタが付く（archived 除外）', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([]);

      await repo.findAllAdmin(false);

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { archivedAt: null } }),
      );
    });

    it('includeArchived=true: where が {} で全件取得（archived 含む）', async () => {
      const rows = [
        makeOrganizationRow(),
        makeOrganizationRow({ id: 'org-2', archivedAt: new Date() }),
      ];
      mockPrisma.organization.findMany.mockResolvedValue(rows);

      const result = await repo.findAllAdmin(true);

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(result).toBe(rows);
    });
  });

  // ============================================================
  // adminUpdateWithCascade（set-0027 cascade archive/restore）
  // ============================================================
  describe('adminUpdateWithCascade', () => {
    it('archived 未指定（name のみ）: $transaction を呼ばず単純 update を呼ぶ', async () => {
      const row = makeOrganizationRow({ name: '改名' });
      mockPrisma.organization.update.mockResolvedValue(row);

      const result = await repo.adminUpdateWithCascade('org-1', { name: '改名' }, undefined);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'org-1' }, data: { name: '改名' } }),
      );
      expect(result).toBe(row);
    });

    it('archived=true: $transaction 内で organization.update / project.updateMany / space.updateMany を順に呼ぶ', async () => {
      const archivedAt = new Date();
      const orgRow = makeOrganizationRow({ archivedAt });
      txMock.organization.update.mockResolvedValue(orgRow);
      txMock.project.updateMany.mockResolvedValue({ count: 2 });
      txMock.project.findMany.mockResolvedValue([{ id: 'proj-1' }, { id: 'proj-2' }]);
      txMock.space.updateMany.mockResolvedValue({ count: 3 });

      const result = await repo.adminUpdateWithCascade('org-1', { archivedAt }, true);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // 配下 project を連鎖 archive
      expect(txMock.project.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          data: { archivedAt: expect.any(Date) },
        }),
      );
      // 配下 space を連鎖 archive（cascadeArchiveSpacesByProjectIds）
      expect(txMock.space.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: { in: ['proj-1', 'proj-2'] }, kind: 'CHANNEL' },
          data: { archivedAt: expect.any(Date) },
        }),
      );
      expect(result).toBe(orgRow);
    });

    it('archived=false（復元）: $transaction 内で archivedAt=null を project / space に連鎖セットする', async () => {
      const orgRow = makeOrganizationRow();
      txMock.organization.update.mockResolvedValue(orgRow);
      txMock.project.updateMany.mockResolvedValue({ count: 1 });
      txMock.project.findMany.mockResolvedValue([{ id: 'proj-1' }]);
      txMock.space.updateMany.mockResolvedValue({ count: 1 });

      await repo.adminUpdateWithCascade('org-1', { archivedAt: null }, false);

      // 復元: archivedAt=null をセット
      expect(txMock.project.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archivedAt: null } }),
      );
      expect(txMock.space.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archivedAt: null } }),
      );
    });

    it('配下 project が 0 件のとき space.updateMany は呼ばない（cascadeArchiveSpacesByProjectIds の早期リターン）', async () => {
      const orgRow = makeOrganizationRow({ archivedAt: new Date() });
      txMock.organization.update.mockResolvedValue(orgRow);
      txMock.project.updateMany.mockResolvedValue({ count: 0 });
      txMock.project.findMany.mockResolvedValue([]);
      txMock.space.updateMany.mockResolvedValue({ count: 0 });

      await repo.adminUpdateWithCascade('org-1', { archivedAt: new Date() }, true);

      expect(txMock.space.updateMany).not.toHaveBeenCalled();
    });
  });
});
