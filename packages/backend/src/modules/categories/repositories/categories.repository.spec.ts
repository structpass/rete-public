import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CategoriesRepository } from './categories.repository';
import { PrismaService } from '../../../database/prisma.service';
import { DEFAULT_MAX_WAIT_MS, DEFAULT_TIMEOUT_MS } from '../../../common/database/serializable-tx';

/**
 * CategoriesRepository のユニットテスト。Prisma はモックし、DB アクセス層の境界だけを固定する。
 *
 * ここで検証すること:
 * - findAll が Space スコープで絞り、存在秘匿（ADR 0042）の可視 Space 絞り込みを必須 AND 句で載せること
 *   （cmn-0221 で visibleSpaceIds を required 化：fail-open 経路を撤廃）。
 * - reorder が共通ヘルパ経由の Serializable interactive transaction 1 本で走り、集合検証（過剰 / 欠落 /
 *   重複 / 別 Space の id 混入）を tx 内で行い、不一致時は write を発行しないこと（cmn-0221 §2）。
 * - createWithAutoSortOrder が max+1 採番と create を同一 tx に閉じ、explicitSortOrder 指定時は
 *   採番せずその値を使うこと（cmn-0221 §3）。
 * - maxSortOrder が空 Space で 0 を返すこと（採番起点）。
 *
 * E2E / 実 DB へ委譲すること:
 * - 実 PostgreSQL の行ロック取得順と実デッドロック回避の成否、実 DB での並び順、
 *   onDelete: Restrict による削除の最終防衛。
 * - top-level の scalar 等価（spaceId）と AND 句の同一キー重複が、上書きではなく AND として効くこと
 *   （＝可視集合外の要求が実際に空配列になること）。where の形までが本 spec の担当。
 */

// tx 内で使う Prisma client モック（$transaction のコールバックに渡す）。
const txMock = {
  category: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
  },
};

const mockPrisma = {
  category: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    // reorder は tx 内の updateMany を使うため mockPrisma 側には不要。それ以外の単票系
    // （service.update 経路の repo.update）は素通しで prisma.category.update を呼ぶので残す。
    update: jest.fn(),
    delete: jest.fn(),
  },
  task: { count: jest.fn() },
  // runInSerializableTransaction は prisma.$transaction(fn, { isolationLevel }) を呼ぶ。
  // コールバックに txMock を渡し、tx 内の呼び出しを検証可能にする（実装は beforeEach で毎回再設定）。
  $transaction: jest.fn(),
};

const SPACE = 's1';

describe('CategoriesRepository', () => {
  let repo: CategoriesRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoriesRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<CategoriesRepository>(CategoriesRepository);
    // resetMocks により実装は毎テストで剥がれるため、パススルーをここで張り直す。
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof txMock) => unknown, _options?: unknown): Promise<unknown> =>
        cb(txMock),
    );
  });

  // ============================================================
  // findAll（Space スコープ・アーカイブ除外・可視 Space 必須・fail-open 撤廃）
  // ============================================================
  describe('findAll', () => {
    it('includeArchived=false + visibleSpaceIds 指定で where に archivedAt:null と AND 句の両方が載る', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);

      await repo.findAll(SPACE, false, ['s1', 's2']);

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { spaceId: SPACE, archivedAt: null, AND: [{ spaceId: { in: ['s1', 's2'] } }] },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
    });

    it('includeArchived=true では where から archivedAt が消える（可視 AND は維持）', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);

      await repo.findAll(SPACE, true, ['s1']);

      expect(mockPrisma.category.findMany.mock.calls[0][0].where).toEqual({
        spaceId: SPACE,
        AND: [{ spaceId: { in: ['s1'] } }],
      });
    });

    it('visibleSpaceIds を空配列で渡すと AND 句の in:[] がそのまま載る（可視ゼロ＝必ず空配列）', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);

      await repo.findAll(SPACE, false, []);

      expect(mockPrisma.category.findMany.mock.calls[0][0].where).toEqual({
        spaceId: SPACE,
        archivedAt: null,
        AND: [{ spaceId: { in: [] } }],
      });
    });

    // cmn-0221: visibleSpaceIds を required 化した。可視フィルタの fail-open（undefined で AND 句を
    // 外す経路）は型エラーにして潰してある。spec でも undefined を渡すとコンパイル時エラーになる
    // ことを期待するため、ここでは「必須化」事実の記録だけをコメントで残し赤テストは置かない。
  });

  describe('findIdsBySpace', () => {
    it('spaceId だけで絞って id を引き（アーカイブ済も含む）、id の配列へ写像する', async () => {
      mockPrisma.category.findMany.mockResolvedValue([{ id: 2 }, { id: 5 }]);

      const result = await repo.findIdsBySpace(SPACE);

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { spaceId: SPACE },
        select: { id: true },
      });
      expect(result).toEqual([2, 5]);
    });
  });

  describe('maxSortOrder', () => {
    it('空 Space（_max.sortOrder が null）では 0 を返す（採番起点）', async () => {
      mockPrisma.category.aggregate.mockResolvedValue({ _max: { sortOrder: null } });

      const result = await repo.maxSortOrder(SPACE);

      expect(mockPrisma.category.aggregate).toHaveBeenCalledWith({
        where: { spaceId: SPACE },
        _max: { sortOrder: true },
      });
      expect(result).toBe(0);
    });

    it('既存があればその最大値を返す', async () => {
      mockPrisma.category.aggregate.mockResolvedValue({ _max: { sortOrder: 7 } });

      await expect(repo.maxSortOrder(SPACE)).resolves.toBe(7);
    });
  });

  describe('create', () => {
    it('渡された data をそのまま create({data}) へ委譲する', async () => {
      mockPrisma.category.create.mockResolvedValue({ id: 1 });
      const data = { name: '分類A', space: { connect: { id: SPACE } } };

      await repo.create(data);

      expect(mockPrisma.category.create).toHaveBeenCalledWith({ data });
    });
  });

  // ============================================================
  // createWithAutoSortOrder（cmn-0221 §3: 採番と create を同一 tx）
  // ============================================================
  describe('createWithAutoSortOrder', () => {
    it('explicitSortOrder 未指定: tx 内で max+1 を採番して create する', async () => {
      txMock.category.aggregate.mockResolvedValue({ _max: { sortOrder: 3 } });
      txMock.category.create.mockResolvedValue({ id: 99 });

      const result = await repo.createWithAutoSortOrder(SPACE, {
        name: '出荷',
        space: { connect: { id: SPACE } },
      });

      // aggregate（max）と create が同一 tx 内で順に呼ばれる（採番〜作成が同じ snapshot）
      expect(txMock.category.aggregate).toHaveBeenCalledTimes(1);
      expect(txMock.category.aggregate).toHaveBeenCalledWith({
        where: { spaceId: SPACE },
        _max: { sortOrder: true },
      });
      expect(txMock.category.create).toHaveBeenCalledTimes(1);
      expect(txMock.category.create).toHaveBeenCalledWith({
        data: { name: '出荷', space: { connect: { id: SPACE } }, sortOrder: 4 },
      });
      expect(result).toEqual({ id: 99 });
    });

    it('explicitSortOrder 指定: aggregate を呼ばず create は渡された sortOrder を使う', async () => {
      txMock.category.create.mockResolvedValue({ id: 100 });

      await repo.createWithAutoSortOrder(
        SPACE,
        { name: '出荷', space: { connect: { id: SPACE } } },
        7,
      );

      expect(txMock.category.aggregate).not.toHaveBeenCalled();
      expect(txMock.category.create).toHaveBeenCalledWith({
        data: { name: '出荷', space: { connect: { id: SPACE } }, sortOrder: 7 },
      });
    });

    it('空 Space（max=null）で explicitSortOrder 未指定 → 採番起点 0 から +1 = 1 を振る', async () => {
      txMock.category.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      txMock.category.create.mockResolvedValue({ id: 1 });

      await repo.createWithAutoSortOrder(SPACE, {
        name: '受入',
        space: { connect: { id: SPACE } },
      });

      expect(txMock.category.create).toHaveBeenCalledWith({
        data: { name: '受入', space: { connect: { id: SPACE } }, sortOrder: 1 },
      });
    });

    it('common ヘルパの $transaction を Serializable 指定つきで 1 回だけ呼ぶ', async () => {
      txMock.category.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      txMock.category.create.mockResolvedValue({ id: 1 });

      await repo.createWithAutoSortOrder(SPACE, {
        name: 'x',
        space: { connect: { id: SPACE } },
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: DEFAULT_TIMEOUT_MS,
        maxWait: DEFAULT_MAX_WAIT_MS,
      });
    });
  });

  // ============================================================
  // reorder（cmn-0221 §2: tx 内の集合検証・Serializable 直列化・IDOR スコープ）
  // ============================================================
  describe('reorder', () => {
    it('集合一致なら index+1 を sortOrder とし、id 昇順の updateMany を spaceId スコープで撃ち、tx 内再読込を返す', async () => {
      const items = [
        { id: 10, sortOrder: 1 },
        { id: 20, sortOrder: 2 },
        { id: 30, sortOrder: 3 },
      ];
      txMock.category.findMany
        .mockResolvedValueOnce([{ id: 30 }, { id: 10 }, { id: 20 }])
        .mockResolvedValueOnce(items);
      txMock.category.updateMany.mockResolvedValue({ count: 1 });

      const result = await repo.reorder(SPACE, [10, 20, 30]);

      // 現存 id の取得（集合検証用・id のみ）
      expect(txMock.category.findMany).toHaveBeenNthCalledWith(1, {
        where: { spaceId: SPACE },
        select: { id: true },
      });
      // 発行順は id 昇順（10→20→30）。値はリクエスト順の添字+1（10→1 / 20→2 / 30→3）。
      expect(txMock.category.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 10, spaceId: SPACE },
        data: { sortOrder: 1 },
      });
      expect(txMock.category.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 20, spaceId: SPACE },
        data: { sortOrder: 2 },
      });
      expect(txMock.category.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 30, spaceId: SPACE },
        data: { sortOrder: 3 },
      });
      // 反映後の再読込（tx 内・sortOrder→id 昇順）
      expect(txMock.category.findMany).toHaveBeenNthCalledWith(2, {
        where: { spaceId: SPACE },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      // 回数まで固定する（Nth だけだと二重ループ等で余計な write / read を撃つ実装でも緑のまま通る）。
      expect(txMock.category.updateMany).toHaveBeenCalledTimes(3);
      expect(txMock.category.findMany).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true, items });
    });

    it('$transaction が Serializable 指定つきで 1 回だけ呼ばれる（共通ヘルパ経由の直列化）', async () => {
      txMock.category.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await repo.reorder(SPACE, []);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: DEFAULT_TIMEOUT_MS,
        maxWait: DEFAULT_MAX_WAIT_MS,
      });
    });

    it('現存に無い id を含む（過剰）と set-mismatch を返し write も再読込もしない', async () => {
      txMock.category.findMany.mockResolvedValueOnce([{ id: 10 }]);

      const result = await repo.reorder(SPACE, [10, 999]);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.category.updateMany).not.toHaveBeenCalled();
      expect(txMock.category.findMany).toHaveBeenCalledTimes(1);
    });

    it('現存の一部しか含まない（欠落）場合も set-mismatch で write も再読込もしない', async () => {
      txMock.category.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 20 }, { id: 30 }]);

      const result = await repo.reorder(SPACE, [10]);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.category.updateMany).not.toHaveBeenCalled();
      expect(txMock.category.findMany).toHaveBeenCalledTimes(1);
    });

    it('件数は同じでも別 Space の id にすり替わっていれば set-mismatch（IDOR 経路の事前封じ）', async () => {
      txMock.category.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 20 }]);

      const result = await repo.reorder(SPACE, [10, 999]);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.category.updateMany).not.toHaveBeenCalled();
    });

    it('同じ id が重複していれば set-mismatch で write を発行しない（Set 化で潰れる穴を塞ぐ）', async () => {
      txMock.category.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 20 }]);

      const result = await repo.reorder(SPACE, [10, 10, 20]);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.category.updateMany).not.toHaveBeenCalled();
      expect(txMock.category.findMany).toHaveBeenCalledTimes(1);
    });

    it('sortOrder はリクエスト順の添字+1 だが、更新の発行順は id 昇順に固定される（cmn-0050(C4) ロック取得順の一定化）', async () => {
      txMock.category.findMany
        .mockResolvedValueOnce([{ id: 10 }, { id: 20 }, { id: 30 }])
        .mockResolvedValueOnce([]);
      txMock.category.updateMany.mockResolvedValue({ count: 1 });

      await repo.reorder(SPACE, [30, 10, 20]);

      // 発行順は id 昇順（10→20→30）。値はリクエスト順の添字+1（30→1 / 10→2 / 20→3）。
      expect(txMock.category.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 10, spaceId: SPACE },
        data: { sortOrder: 2 },
      });
      expect(txMock.category.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 20, spaceId: SPACE },
        data: { sortOrder: 3 },
      });
      expect(txMock.category.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 30, spaceId: SPACE },
        data: { sortOrder: 1 },
      });
    });

    it('空配列 × 現存 0 件は {ok:true, items:[]} で write を発行しない', async () => {
      txMock.category.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await repo.reorder(SPACE, []);

      expect(result).toEqual({ ok: true, items: [] });
      expect(txMock.category.updateMany).not.toHaveBeenCalled();
    });

    it('競合 abort（P2034）は共通ヘルパが自動リトライし、2 回目で解決する', async () => {
      mockPrisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('write conflict', {
          code: 'P2034',
          clientVersion: '6.2.0',
        }),
      );
      txMock.category.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await repo.reorder(SPACE, []);

      expect(result).toEqual({ ok: true, items: [] });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('P2034 以外（P2002）はリトライせずそのまま投げる', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.2.0',
      });
      mockPrisma.$transaction.mockRejectedValueOnce(error);

      await expect(repo.reorder(SPACE, [])).rejects.toBe(error);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('updateMany は { id, spaceId } スコープで撃ち、別 Space id の混入は where 不一致で 0 件更新に留まる（IDOR 防御）', async () => {
      // 集合検証が通った場合の updateMany 引数 where に spaceId が必ず乗ることを直接固定する。
      txMock.category.findMany
        .mockResolvedValueOnce([{ id: 10 }, { id: 20 }])
        .mockResolvedValueOnce([]);
      txMock.category.updateMany.mockResolvedValue({ count: 1 });

      await repo.reorder(SPACE, [10, 20]);

      // すべての updateMany で where に spaceId が含まれる（IDOR 経路の事前封じ）
      for (const call of txMock.category.updateMany.mock.calls) {
        expect(call[0].where).toMatchObject({ spaceId: SPACE });
      }
    });
  });

  // ============================================================
  // 素通し系
  // ============================================================
  describe('単票 CRUD / 集計', () => {
    it('findById は findUnique({where:{id}})', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await repo.findById(1);

      expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('update は update({where:{id},data}) へ委譲する', async () => {
      const data = { name: '分類B' };

      await repo.update(1, data);

      expect(mockPrisma.category.update).toHaveBeenCalledWith({ where: { id: 1 }, data });
    });

    it('delete は delete({where:{id}})', async () => {
      mockPrisma.category.delete.mockResolvedValue({ id: 1 });

      await repo.delete(1);

      expect(mockPrisma.category.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('countTasks は category ではなく task を数える', async () => {
      mockPrisma.task.count.mockResolvedValue(3);

      const result = await repo.countTasks(1);

      expect(mockPrisma.task.count).toHaveBeenCalledWith({ where: { categoryId: 1 } });
      expect(result).toBe(3);
    });
  });
});
