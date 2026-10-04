import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DeskGroupsRepository } from './desk-groups.repository';
import { PrismaService } from '../../../database/prisma.service';
import { installTxPassthrough } from '../../../__tests__/tx-passthrough';

// tx 内で使う Prisma client モック（$transaction のコールバックに渡す）。
const txMock = {
  deskGroupClassification: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  deskGroup: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  deskGroupMember: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockPrisma = {
  deskGroupClassification: {
    findUnique: jest.fn(),
  },
  deskGroup: {
    findUnique: jest.fn(),
  },
  // runInSerializableTransaction は prisma.$transaction(fn, { isolationLevel }) を呼ぶ。
  // コールバックに txMock を渡し、tx 内の呼び出しを検証可能にする（実装は beforeEach で毎回再設定）。
  $transaction: jest.fn(),
};

const ACCOUNT = 'acc-1';

describe('DeskGroupsRepository', () => {
  let repo: DeskGroupsRepository;

  // cmn-0335: $transaction の通し設定を共通ヘルパへ委譲（見張り込みで beforeEach/afterEach を自前登録）。
  installTxPassthrough(mockPrisma, txMock);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeskGroupsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<DeskGroupsRepository>(DeskGroupsRepository);
  });

  // ============================================================
  // 所有検証の service 委譲（dsk-0330 の意図的な accountId フィルタ無し）を固定
  // ============================================================
  describe('findClassificationById', () => {
    it('findUnique を { where: { id } } で呼ぶ（accountId フィルタ無し＝所有検証は service 委譲）', async () => {
      mockPrisma.deskGroupClassification.findUnique.mockResolvedValue(null);

      await repo.findClassificationById('c1');

      expect(mockPrisma.deskGroupClassification.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });
  });

  describe('findGroupById', () => {
    it('findUnique を { where: { id } } で呼ぶ（accountId フィルタ無し＝所有検証は service 委譲）', async () => {
      mockPrisma.deskGroup.findUnique.mockResolvedValue(null);

      await repo.findGroupById('g1');

      expect(mockPrisma.deskGroup.findUnique).toHaveBeenCalledWith({ where: { id: 'g1' } });
    });
  });

  // ============================================================
  // reorderClassifications（tx 内の権威検証＝TOCTOU race 防止）
  // ============================================================
  describe('reorderClassifications', () => {
    it('orderedIds と現存集合が一致すれば index 順に sortOrder=i の updateMany を発行し {ok:true} を返す', async () => {
      txMock.deskGroupClassification.findMany.mockResolvedValue([{ id: 'c2' }, { id: 'c1' }]);
      txMock.deskGroupClassification.updateMany.mockResolvedValue({ count: 1 });

      const result = await repo.reorderClassifications(ACCOUNT, ['c1', 'c2']);

      expect(result).toEqual({ ok: true });
      expect(txMock.deskGroupClassification.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'c1', accountId: ACCOUNT },
        data: { sortOrder: 0 },
      });
      expect(txMock.deskGroupClassification.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'c2', accountId: ACCOUNT },
        data: { sortOrder: 1 },
      });
    });

    it('現存に無い id を含むと {ok:false, reason:"set-mismatch"} を返し write を発行しない', async () => {
      txMock.deskGroupClassification.findMany.mockResolvedValue([{ id: 'c1' }]);

      const result = await repo.reorderClassifications(ACCOUNT, ['c1', 'c-ghost']);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.deskGroupClassification.updateMany).not.toHaveBeenCalled();
    });

    it('現存の一部しか含まない（欠落）場合も set-mismatch で write を発行しない', async () => {
      txMock.deskGroupClassification.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      const result = await repo.reorderClassifications(ACCOUNT, ['c1']);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.deskGroupClassification.updateMany).not.toHaveBeenCalled();
    });

    it('現存集合は accountId で絞って読む（他人の行を検証対象にしない）', async () => {
      txMock.deskGroupClassification.findMany.mockResolvedValue([]);

      await repo.reorderClassifications(ACCOUNT, []);

      expect(txMock.deskGroupClassification.findMany).toHaveBeenCalledWith({
        where: { accountId: ACCOUNT },
        select: { id: true },
      });
    });

    it('重複 id を含むと set-mismatch を返し write を発行しない（cmn-0344）', async () => {
      txMock.deskGroupClassification.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      const result = await repo.reorderClassifications(ACCOUNT, ['c1', 'c1', 'c2']);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.deskGroupClassification.updateMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // reorderGroups（同一グループ分類バケット内・reorderClassifications と同方針）
  // ============================================================
  describe('reorderGroups', () => {
    it('バケット（accountId + classificationId）の現存集合と一致すれば sortOrder=i を発行し {ok:true}', async () => {
      txMock.deskGroup.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
      txMock.deskGroup.updateMany.mockResolvedValue({ count: 1 });

      const result = await repo.reorderGroups(ACCOUNT, 'c1', ['g2', 'g1']);

      expect(result).toEqual({ ok: true });
      expect(txMock.deskGroup.findMany).toHaveBeenCalledWith({
        where: { accountId: ACCOUNT, classificationId: 'c1' },
        select: { id: true },
      });
      expect(txMock.deskGroup.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'g2', accountId: ACCOUNT },
        data: { sortOrder: 0 },
      });
      expect(txMock.deskGroup.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'g1', accountId: ACCOUNT },
        data: { sortOrder: 1 },
      });
    });

    it('classificationId=null（未分類バケット）もそのまま where 条件に渡す', async () => {
      txMock.deskGroup.findMany.mockResolvedValue([{ id: 'g1' }]);
      txMock.deskGroup.updateMany.mockResolvedValue({ count: 1 });

      await repo.reorderGroups(ACCOUNT, null, ['g1']);

      expect(txMock.deskGroup.findMany).toHaveBeenCalledWith({
        where: { accountId: ACCOUNT, classificationId: null },
        select: { id: true },
      });
    });

    it('集合がズレたら {ok:false, reason:"set-mismatch"} を返し write を発行しない', async () => {
      txMock.deskGroup.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);

      const result = await repo.reorderGroups(ACCOUNT, 'c1', ['g1', 'g-other']);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.deskGroup.updateMany).not.toHaveBeenCalled();
    });

    it('重複 id を含むと set-mismatch を返し write を発行しない（cmn-0344）', async () => {
      txMock.deskGroup.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);

      const result = await repo.reorderGroups(ACCOUNT, 'c1', ['g1', 'g2', 'g2']);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.deskGroup.updateMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // moveMemberAndReorder（set 検証は write より前＝ミスマッチ時に upsert を残さない）
  // ============================================================
  describe('moveMemberAndReorder', () => {
    it('現存メンバー＋移動対象の集合と orderedRefs が一致すれば upsert → sortOrder=i を発行し {ok:true}', async () => {
      txMock.deskGroupMember.findMany.mockResolvedValue([{ targetRef: 'space-1' }]);
      txMock.deskGroupMember.upsert.mockResolvedValue({});
      txMock.deskGroupMember.updateMany.mockResolvedValue({ count: 1 });

      const result = await repo.moveMemberAndReorder(ACCOUNT, 'g1', 'space-2', [
        'space-2',
        'space-1',
      ]);

      expect(result).toEqual({ ok: true });
      expect(txMock.deskGroupMember.upsert).toHaveBeenCalledWith({
        where: { accountId_targetRef: { accountId: ACCOUNT, targetRef: 'space-2' } },
        update: { groupId: 'g1' },
        create: { accountId: ACCOUNT, groupId: 'g1', targetRef: 'space-2', sortOrder: 0 },
      });
      expect(txMock.deskGroupMember.updateMany).toHaveBeenNthCalledWith(1, {
        where: { accountId: ACCOUNT, groupId: 'g1', targetRef: 'space-2' },
        data: { sortOrder: 0 },
      });
      expect(txMock.deskGroupMember.updateMany).toHaveBeenNthCalledWith(2, {
        where: { accountId: ACCOUNT, groupId: 'g1', targetRef: 'space-1' },
        data: { sortOrder: 1 },
      });
    });

    it('orderedRefs が移動後集合とズレたら set-mismatch を返し upsert も updateMany も発行しない', async () => {
      txMock.deskGroupMember.findMany.mockResolvedValue([{ targetRef: 'space-1' }]);

      const result = await repo.moveMemberAndReorder(ACCOUNT, 'g1', 'space-2', ['space-2']);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.deskGroupMember.upsert).not.toHaveBeenCalled();
      expect(txMock.deskGroupMember.updateMany).not.toHaveBeenCalled();
    });

    it('移動対象が既にグループ所属でも仮加算は Set なので二重計上しない（既所属の同一 ref で一致判定が通る）', async () => {
      txMock.deskGroupMember.findMany.mockResolvedValue([
        { targetRef: 'space-1' },
        { targetRef: 'space-2' },
      ]);
      txMock.deskGroupMember.upsert.mockResolvedValue({});
      txMock.deskGroupMember.updateMany.mockResolvedValue({ count: 1 });

      // 'space-2' は既にこのグループ所属（グループ内並び替え相当）
      const result = await repo.moveMemberAndReorder(ACCOUNT, 'g1', 'space-2', [
        'space-1',
        'space-2',
      ]);

      expect(result).toEqual({ ok: true });
    });

    it('重複 ref を含むと set-mismatch を返し upsert も updateMany も発行しない（cmn-0344）', async () => {
      txMock.deskGroupMember.findMany.mockResolvedValue([{ targetRef: 'space-1' }]);

      const result = await repo.moveMemberAndReorder(ACCOUNT, 'g1', 'space-2', [
        'space-2',
        'space-2',
        'space-1',
      ]);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.deskGroupMember.upsert).not.toHaveBeenCalled();
      expect(txMock.deskGroupMember.updateMany).not.toHaveBeenCalled();
    });
  });
});
