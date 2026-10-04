import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { SpacesRepository } from './spaces.repository';
import { PrismaService } from '../../../database/prisma.service';
import { makeSpaceRow } from '../../../__tests__/factories';

const mockPrisma = {
  space: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  membership: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('SpacesRepository', () => {
  let repo: SpacesRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpacesRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<SpacesRepository>(SpacesRepository);
    // $transaction はコールバック形式（interactive tx）= cb(mockPrisma) で即実行。
    mockPrisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(mockPrisma)
        : Promise.all(arg as unknown[]),
    );
  });

  // ---- CHANNEL ----

  describe('createChannel', () => {
    it('sortOrder を count で算出し space.create を呼ぶ', async () => {
      const row = makeSpaceRow({
        kind: 'CHANNEL',
        projectId: 'proj-1',
        name: 'general',
        sortOrder: 0,
      });
      mockPrisma.space.count.mockResolvedValue(0);
      mockPrisma.space.create.mockResolvedValue(row);

      const result = await repo.createChannel('proj-1', 'general');

      expect(mockPrisma.space.count).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', kind: 'CHANNEL' },
      });
      expect(mockPrisma.space.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'CHANNEL', projectId: 'proj-1', name: 'general' }),
        }),
      );
      expect(result.id).toBe(row.id);
      expect(result.kind).toBe('CHANNEL');
    });
  });

  describe('findChannelsByProject', () => {
    it('kind=CHANNEL・projectId・archivedAt=null で絞り込み sortOrder 昇順で返す', async () => {
      const rows = [makeSpaceRow({ sortOrder: 0 }), makeSpaceRow({ id: 'space-2', sortOrder: 1 })];
      mockPrisma.space.findMany.mockResolvedValue(rows);

      const result = await repo.findChannelsByProject('proj-1');

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kind: 'CHANNEL', projectId: 'proj-1', archivedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('includeArchived=true: where に archivedAt キーを含めない（archived も返す）', async () => {
      mockPrisma.space.findMany.mockResolvedValue([]);

      await repo.findChannelsByProject('proj-1', true);

      const call = mockPrisma.space.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('archivedAt');
      expect(call.where).toEqual(expect.objectContaining({ kind: 'CHANNEL', projectId: 'proj-1' }));
      expect(call.orderBy).toEqual([{ sortOrder: 'asc' }, { id: 'asc' }]);
    });
  });

  // ---- GROUP ----

  describe('createGroupWithMembership', () => {
    it('$transaction 内で space.create と membership.create を呼ぶ', async () => {
      const row = makeSpaceRow({
        kind: 'GROUP',
        projectId: null,
        ownerId: null,
        name: 'dev-group',
      });
      mockPrisma.space.count.mockResolvedValue(2);
      mockPrisma.space.create.mockResolvedValue(row);
      mockPrisma.membership.create.mockResolvedValue({});

      const result = await repo.createGroupWithMembership('dev-group', 'user-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.space.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'GROUP', name: 'dev-group' }),
        }),
      );
      expect(mockPrisma.membership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'user-1',
          scopeType: 'GROUP',
          scopeId: row.id,
          role: 'ADMIN',
        }),
      });
      expect(result.kind).toBe('GROUP');
    });
  });

  describe('findGroupsForUser', () => {
    it('membership を取得し scopeId を IN 句で space 取得する', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([
        { scopeId: 'grp-1' },
        { scopeId: 'grp-2' },
      ]);
      const rows = [
        makeSpaceRow({ id: 'grp-1', kind: 'GROUP', projectId: null }),
        makeSpaceRow({ id: 'grp-2', kind: 'GROUP', projectId: null }),
      ];
      mockPrisma.space.findMany.mockResolvedValue(rows);

      const result = await repo.findGroupsForUser('user-1');

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { accountId: 'user-1', scopeType: 'GROUP' },
        select: { scopeId: true },
      });
      expect(mockPrisma.space.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ kind: 'GROUP', id: { in: ['grp-1', 'grp-2'] } }),
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('membership が 0 件のとき space.findMany を呼ばず空配列を返す', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);

      const result = await repo.findGroupsForUser('user-x');

      expect(mockPrisma.space.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('findAllGroupsAdmin（dsk-0319）', () => {
    it('kind=GROUP・archivedAt=null（既定）で絞り込み sortOrder 昇順で返す', async () => {
      const rows = [
        makeSpaceRow({ id: 'grp-1', kind: 'GROUP', projectId: null }),
        makeSpaceRow({ id: 'grp-2', kind: 'GROUP', projectId: null, sortOrder: 1 }),
      ];
      mockPrisma.space.findMany.mockResolvedValue(rows);

      const result = await repo.findAllGroupsAdmin();

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kind: 'GROUP', archivedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('includeArchived=true のとき archivedAt フィルタを掛けない', async () => {
      mockPrisma.space.findMany.mockResolvedValue([]);

      await repo.findAllGroupsAdmin(true);

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kind: 'GROUP' },
        }),
      );
      // archivedAt フィルタが付いていないことを確認
      const callArg = mockPrisma.space.findMany.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty('archivedAt');
    });

    it('membership 絞りゼロ（admin 一覧の意図・自分の所属に限定しない）', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      mockPrisma.space.findMany.mockResolvedValue([
        makeSpaceRow({ id: 'unrelated', kind: 'GROUP', projectId: null }),
      ]);

      const result = await repo.findAllGroupsAdmin();

      // membership.findMany が呼ばれていないこと（membership 非依存）。
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('unrelated');
    });
  });

  // ---- PERSONAL_MEMO ----

  describe('createPersonalMemo', () => {
    it('kind=PERSONAL_MEMO・ownerId・name で space.create を呼ぶ', async () => {
      const row = makeSpaceRow({
        kind: 'PERSONAL_MEMO',
        ownerId: 'user-1',
        projectId: null,
        name: '個人メモ',
      });
      mockPrisma.space.create.mockResolvedValue(row);

      const result = await repo.createPersonalMemo('user-1', '個人メモ');

      expect(mockPrisma.space.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { kind: 'PERSONAL_MEMO', ownerId: 'user-1', name: '個人メモ' },
        }),
      );
      expect(result.kind).toBe('PERSONAL_MEMO');
      expect(result.ownerId).toBe('user-1');
    });
  });

  describe('findPersonalMemosForUser', () => {
    it('ownerId・kind・archivedAt=null で絞り込む', async () => {
      mockPrisma.space.findMany.mockResolvedValue([]);

      await repo.findPersonalMemosForUser('user-1');

      expect(mockPrisma.space.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kind: 'PERSONAL_MEMO', ownerId: 'user-1', archivedAt: null },
        }),
      );
    });
  });

  // ---- PERSONAL_DM ----

  describe('findExistingDm', () => {
    it('無向ペア（ownerA/ownerB と ownerB/ownerA）の OR 検索を発行する', async () => {
      mockPrisma.space.findFirst.mockResolvedValue(null);

      await repo.findExistingDm('user-1', 'user-2');

      expect(mockPrisma.space.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            kind: 'PERSONAL_DM',
            OR: [
              { ownerId: 'user-1', peerAccountId: 'user-2' },
              { ownerId: 'user-2', peerAccountId: 'user-1' },
            ],
          },
        }),
      );
    });

    it('既存 DM が在れば SpaceRow を返す', async () => {
      const row = makeSpaceRow({
        kind: 'PERSONAL_DM',
        ownerId: 'user-1',
        peerAccountId: 'user-2',
        projectId: null,
      });
      mockPrisma.space.findFirst.mockResolvedValue(row);

      const result = await repo.findExistingDm('user-1', 'user-2');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('PERSONAL_DM');
    });
  });

  describe('createPersonalDm', () => {
    it('kind=PERSONAL_DM・ownerId・peerAccountId・name=DM で space.create を呼ぶ', async () => {
      const row = makeSpaceRow({
        kind: 'PERSONAL_DM',
        ownerId: 'user-1',
        peerAccountId: 'user-2',
        projectId: null,
        name: 'DM',
      });
      mockPrisma.space.create.mockResolvedValue(row);

      const result = await repo.createPersonalDm('user-1', 'user-2');

      expect(mockPrisma.space.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { kind: 'PERSONAL_DM', ownerId: 'user-1', peerAccountId: 'user-2', name: 'DM' },
        }),
      );
      expect(result.peerAccountId).toBe('user-2');
    });
  });

  describe('findPersonalDmsForUserWithPeer（dsk-0325）', () => {
    it('DM 一覧を peer / owner Account 双方結合で取得する（select に peer/owner を含む）', async () => {
      mockPrisma.space.findMany.mockResolvedValue([]);

      await repo.findPersonalDmsForUserWithPeer('user-1');

      const callArg = mockPrisma.space.findMany.mock.calls[0][0];
      expect(callArg).toMatchObject({
        where: {
          kind: 'PERSONAL_DM',
          archivedAt: null,
          OR: [{ ownerId: 'user-1' }, { peerAccountId: 'user-1' }],
        },
      });
      // viewer 視点で「相手」が ownerId 側か peerAccountId 側かを service が判定するため、
      // 双方の Account を結合しておく（peer のみだと viewer=peer ケースで誤判定・code-review 指摘）。
      expect(callArg.select).toHaveProperty('peer');
      expect(callArg.select.peer).toEqual({ select: { id: true, name: true } });
      expect(callArg.select).toHaveProperty('owner');
      expect(callArg.select.owner).toEqual({ select: { id: true, name: true } });
    });

    it('SpaceDmRow を返し peer / owner が null の row もそのまま返す（Cascade 削除済ケース）', async () => {
      const row = {
        ...makeSpaceRow({ kind: 'PERSONAL_DM', ownerId: 'user-1', peerAccountId: 'user-2' }),
        peer: null,
        owner: null,
      };
      mockPrisma.space.findMany.mockResolvedValue([row]);

      const result = await repo.findPersonalDmsForUserWithPeer('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].peer).toBeNull();
      expect(result[0].owner).toBeNull();
    });
  });

  // ---- 共通 ----

  describe('findById', () => {
    it('id で space.findUnique を呼び SpaceRow を返す', async () => {
      const row = makeSpaceRow({ id: 'space-abc' });
      mockPrisma.space.findUnique.mockResolvedValue(row);

      const result = await repo.findById('space-abc');

      expect(mockPrisma.space.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'space-abc' } }),
      );
      expect(result!.id).toBe('space-abc');
    });

    it('存在しない id のとき null を返す', async () => {
      mockPrisma.space.findUnique.mockResolvedValue(null);
      expect(await repo.findById('no-such-id')).toBeNull();
    });
  });

  describe('update', () => {
    it('id と data を space.update へ渡し更新後の SpaceRow を返す（DTO shape 検証）', async () => {
      const fixed = new Date('2026-06-01T00:00:00.000Z');
      const row = makeSpaceRow({
        id: 'space-1',
        name: '新名称',
        archivedAt: null,
        updatedAt: fixed,
      });
      mockPrisma.space.update.mockResolvedValue(row);

      const result = await repo.update('space-1', { name: '新名称' });

      expect(mockPrisma.space.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'space-1' }, data: { name: '新名称' } }),
      );
      // SpaceRow の shape 確認（mapper 入力となるフィールドが揃っていること）
      expect(result).toHaveProperty('id', 'space-1');
      expect(result).toHaveProperty('name', '新名称');
      expect(result).toHaveProperty('archivedAt');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });
  });
});
