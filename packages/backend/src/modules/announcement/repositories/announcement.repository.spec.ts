import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AnnouncementRepository } from './announcement.repository';
import { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  announcement: {
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  announcementReadState: {
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('AnnouncementRepository', () => {
  let repo: AnnouncementRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnnouncementRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<AnnouncementRepository>(AnnouncementRepository);
    // $transaction は (a) 配列形式 = Promise.all、(b) コールバック形式(interactive) = cb(mockPrisma) の両方に対応。
    mockPrisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(mockPrisma)
        : Promise.all(arg as unknown[]),
    );
  });

  describe('countUnread（hom-0072: kind スコープ・hom-0143: 可視性フィルタ撤去で全件対象）', () => {
    it('該当 kind の全通知数 − 既読行数（可視性フィルタなし・全認証ユーザー全件）', async () => {
      mockPrisma.announcement.count.mockResolvedValue(5);
      mockPrisma.announcementReadState.count.mockResolvedValue(2);

      const result = await repo.countUnread('acc-1', 'board');

      expect(mockPrisma.announcement.count).toHaveBeenCalledWith({ where: { kind: 'board' } });
      expect(mockPrisma.announcementReadState.count).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', announcement: { kind: 'board' } },
      });
      expect(result).toBe(3);
    });

    it('faq など kind ごとに独立して数える（MEMBER / ADMIN の区別なし）', async () => {
      mockPrisma.announcement.count.mockResolvedValue(7);
      mockPrisma.announcementReadState.count.mockResolvedValue(4);

      const result = await repo.countUnread('admin-1', 'faq');

      expect(mockPrisma.announcement.count).toHaveBeenCalledWith({ where: { kind: 'faq' } });
      expect(mockPrisma.announcementReadState.count).toHaveBeenCalledWith({
        where: { accountId: 'admin-1', announcement: { kind: 'faq' } },
      });
      expect(result).toBe(3);
    });

    it('read が total を超えても 0 で下げ止まる', async () => {
      mockPrisma.announcement.count.mockResolvedValue(1);
      mockPrisma.announcementReadState.count.mockResolvedValue(3);

      expect(await repo.countUnread('acc-1', 'board')).toBe(0);
    });
  });

  describe('reorder（cmn-0050/C4: 行更新の発行順を id 昇順に固定・hom-0072: kind スコープ追加）', () => {
    it('position はリクエスト順の添字・update は id 昇順で発行する（該当kindのみ対象）', async () => {
      // 現存集合（id だけ）→ 集合検証用、その後 include 付き再読込。
      mockPrisma.announcement.findMany
        .mockResolvedValueOnce([{ id: 'a3' }, { id: 'a1' }, { id: 'a2' }])
        .mockResolvedValueOnce([]);
      mockPrisma.announcement.update.mockResolvedValue({});

      const res = await repo.reorder(['a3', 'a1', 'a2'], 'board');

      expect(res.ok).toBe(true);
      expect(mockPrisma.announcement.findMany).toHaveBeenNthCalledWith(1, {
        where: { kind: 'board' },
        select: { id: true },
      });
      // 発行順は id 昇順（a1, a2, a3）。position はリクエスト順の添字（a3=0,a1=1,a2=2）。
      const calls = mockPrisma.announcement.update.mock.calls.map((c) => c[0]);
      expect(calls).toEqual([
        { where: { id: 'a1' }, data: { position: 1 } },
        { where: { id: 'a2' }, data: { position: 2 } },
        { where: { id: 'a3' }, data: { position: 0 } },
      ]);
    });

    it('orderedIds が現存集合と一致しなければ set-mismatch を返し更新しない', async () => {
      mockPrisma.announcement.findMany.mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }]);

      const res = await repo.reorder(['a1'], 'board');

      expect(res).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(mockPrisma.announcement.update).not.toHaveBeenCalled();
    });

    it('重複 id を含むと set-mismatch を返し更新を発行しない（cmn-0344）', async () => {
      mockPrisma.announcement.findMany.mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }]);

      const res = await repo.reorder(['a1', 'a1', 'a2'], 'board');

      expect(res).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(mockPrisma.announcement.update).not.toHaveBeenCalled();
    });
  });
});
