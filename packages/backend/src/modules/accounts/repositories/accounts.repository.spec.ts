import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AccountsRepository } from './accounts.repository';
import { PrismaService } from '../../../database';

/**
 * dsk-0408: 候補一覧の org 境界化クエリ（findOrgScopeIds / findActiveByOrgs / findSummaryById）の
 * 単体テスト。prisma はモックし、where 条件の形（scopeType / isActive / in 句）と dedup を検証する。
 */
const mockPrisma = {
  membership: { findMany: jest.fn() },
  account: { findUnique: jest.fn() },
};

describe('AccountsRepository（dsk-0408: org 境界化クエリ）', () => {
  let repo: AccountsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    repo = module.get<AccountsRepository>(AccountsRepository);
  });

  describe('findOrgScopeIds', () => {
    it('caller の ORGANIZATION membership のみ scopeId で引く（PROJECT 等の他スコープを混ぜない）', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([
        { scopeId: 'org-1' },
        { scopeId: 'org-2' },
      ]);

      const result = await repo.findOrgScopeIds('acc-1');

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', scopeType: 'ORGANIZATION' },
        select: { scopeId: true },
      });
      expect(result).toEqual(['org-1', 'org-2']);
    });

    it('org membership 0 件なら空配列を返す', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      expect(await repo.findOrgScopeIds('acc-solo')).toEqual([]);
    });
  });

  describe('findActiveByOrgs', () => {
    it('指定組織群の ORGANIZATION membership × isActive=true で絞る（他組織アカウントは where で除外）', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([
        { account: { id: 'acc-1', name: '田中 太郎' } },
        { account: { id: 'acc-2', name: '山田 太郎' } },
      ]);

      const result = await repo.findActiveByOrgs(['org-1', 'org-2']);

      // dsk-0414 criteria ③: distinct:['accountId'] を渡して DB 側で 1 行へ縮約する
      // （旧 JS Map dedup を撤去）。
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          scopeType: 'ORGANIZATION',
          scopeId: { in: ['org-1', 'org-2'] },
          account: { isActive: true },
        },
        distinct: ['accountId'],
        select: { account: { select: { id: true, name: true } } },
        orderBy: { account: { name: 'asc' } },
      });
      expect(result).toEqual([
        { id: 'acc-1', name: '田中 太郎' },
        { id: 'acc-2', name: '山田 太郎' },
      ]);
    });

    it('distinct は DB 側に委譲され JS 側では重複排除しない（criteria 4）', async () => {
      // DB の DISTINCT 適用後を模擬し、distinct accountId の row のみが返る前提。
      // JS 側 dedup が無いことを担保するため、モックに重複を混ぜても結果へ反映されることを確認する
      // （万一 JS Map dedup が再混入したら acc-1 が重複出力される＝回帰検知になる）。
      mockPrisma.membership.findMany.mockResolvedValue([
        { account: { id: 'acc-1', name: '田中 太郎' } },
        { account: { id: 'acc-1', name: '田中 太郎' } },
        { account: { id: 'acc-2', name: '山田 太郎' } },
      ]);

      const result = await repo.findActiveByOrgs(['org-1', 'org-2']);

      expect(result).toEqual([
        { id: 'acc-1', name: '田中 太郎' },
        { id: 'acc-1', name: '田中 太郎' },
        { id: 'acc-2', name: '山田 太郎' },
      ]);
    });

    it('orgIds が空なら DB へ問い合わせず空配列を返す', async () => {
      expect(await repo.findActiveByOrgs([])).toEqual([]);
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findSummaryById', () => {
    it('本人 summary（id + name のみ）を返す（caller 常時含めの保険・criteria 3）', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc-1', name: '田中 太郎' });

      const result = await repo.findSummaryById('acc-1');

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        select: { id: true, name: true },
      });
      expect(result).toEqual({ id: 'acc-1', name: '田中 太郎' });
    });

    it('存在しない id は null（防御経路）', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);
      expect(await repo.findSummaryById('gone')).toBeNull();
    });
  });
});
