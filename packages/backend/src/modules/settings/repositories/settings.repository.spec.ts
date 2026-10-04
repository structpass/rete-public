import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { SettingsRepository } from './settings.repository';
import { PrismaService } from '../../../database/prisma.service';
import { INTERACTIVE_SAVE_TX_OPTIONS } from '../../../common/database/serializable-tx';
import { installTxPassthrough } from '../../../__tests__/tx-passthrough';

/**
 * SettingsRepository の unit test（set-0022）。findSystemIdsByIds が enabled:true を
 * フィルタに含み、findSystemById（削除確認用）はフィルタしないことを固定する。
 * reorderSystems は共通ヘルパ（runInSerializableTransaction）経由であることを固定する（cmn-0251）。
 */

// tx 内で使う Prisma client モック（$transaction のコールバックに渡す）。
const txMock = {
  tenantSystem: {
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockPrisma = {
  tenantSystem: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  // runInSerializableTransaction は prisma.$transaction(fn, { isolationLevel, timeout, maxWait }) を呼ぶ。
  $transaction: jest.fn(),
};

describe('SettingsRepository', () => {
  let repo: SettingsRepository;

  // cmn-0335: $transaction の通し設定を共通ヘルパへ委譲（見張り込みで beforeEach/afterEach を自前登録）。
  installTxPassthrough(mockPrisma, txMock);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<SettingsRepository>(SettingsRepository);
  });

  describe('findSystemIdsByIds', () => {
    it('enabled:true をフィルタに含めて findMany を呼ぶ', async () => {
      mockPrisma.tenantSystem.findMany.mockResolvedValue([{ id: 'SYS-001' }]);

      const result = await repo.findSystemIdsByIds(['SYS-001', 'SYS-002']);

      expect(mockPrisma.tenantSystem.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['SYS-001', 'SYS-002'] }, enabled: true },
        select: { id: true },
      });
      expect(result).toEqual(new Set(['SYS-001']));
    });

    it('無効化されたシステムの id は Set に含まれない（DB 側フィルタで除外される想定）', async () => {
      mockPrisma.tenantSystem.findMany.mockResolvedValue([{ id: 'SYS-001' }]);

      const result = await repo.findSystemIdsByIds(['SYS-001', 'SYS-DISABLED']);

      expect(result.has('SYS-DISABLED')).toBe(false);
    });

    it('空配列は DB にアクセスせず空 Set を返す', async () => {
      const result = await repo.findSystemIdsByIds([]);

      expect(mockPrisma.tenantSystem.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(new Set());
    });
  });

  describe('findSystemById', () => {
    it('enabled フィルタを付けず id のみで findUnique を呼ぶ（削除確認用途のため現状維持）', async () => {
      mockPrisma.tenantSystem.findUnique.mockResolvedValue({ id: 'SYS-001' });

      await repo.findSystemById('SYS-001');

      expect(mockPrisma.tenantSystem.findUnique).toHaveBeenCalledWith({
        where: { id: 'SYS-001' },
        select: { id: true },
      });
    });
  });

  describe('reorderSystems', () => {
    it('共通ヘルパ経由の Serializable tx 1 本で検証→全件更新→tx 内再読込し、反映後の一覧を返す', async () => {
      // 1 回目=集合検証用の current 読み（id のみ）、2 回目=反映後の再読込（全フィールド）。
      txMock.tenantSystem.findMany
        .mockResolvedValueOnce([{ id: 'SYS-002' }, { id: 'SYS-001' }])
        .mockResolvedValueOnce([{ id: 'SYS-001' }, { id: 'SYS-002' }]);

      const result = await repo.reorderSystems(['SYS-002', 'SYS-001']);

      expect(result).toEqual({ ok: true, items: [{ id: 'SYS-001' }, { id: 'SYS-002' }] });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // 直に $transaction を呼ぶ実装（配列形 / isolationLevel だけ指定）へ戻すと timeout / maxWait が
      // 落ちてここで落ちる＝リトライ・時間予算が効かない経路の復活を防ぐ（cmn-0251）。
      // cmn-0347: 実体が 4 件（TENANT_SYSTEM_DEFS）の人が待つ操作なので対話保存セット
      // （INTERACTIVE_SAVE_TX_OPTIONS・5s/2s/10s）を使う。既定セット（15s/5s/30s）へ戻すとここで落ちる。
      expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: INTERACTIVE_SAVE_TX_OPTIONS.timeout,
        maxWait: INTERACTIVE_SAVE_TX_OPTIONS.maxWait,
      });
      // 集合検証は tx 内で現存 id を読んで行う（service 層の tx 外検証へ戻すと TOCTOU・cmn-0345）。
      expect(txMock.tenantSystem.findMany).toHaveBeenNthCalledWith(1, {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      // 発行順は id 昇順（ロック取得順の一定化・cmn-0050(C4)）。sortOrder はリクエスト順の添字。
      expect(txMock.tenantSystem.update.mock.calls.map((c) => c[0])).toEqual([
        { where: { id: 'SYS-001' }, data: { sortOrder: 1 } },
        { where: { id: 'SYS-002' }, data: { sortOrder: 0 } },
      ]);
      expect(mockPrisma.tenantSystem.update).not.toHaveBeenCalled();
      // 再読込は tx 内の findMany（commit 後の tx 外読取へ戻すと並行 reorder の確定結果を返しうる）。
      expect(txMock.tenantSystem.findMany).toHaveBeenNthCalledWith(2, {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      expect(mockPrisma.tenantSystem.findMany).not.toHaveBeenCalled();
    });

    it('重複 id を含むと set-mismatch を返し update も再読込も発行しない（cmn-0345）', async () => {
      txMock.tenantSystem.findMany.mockResolvedValueOnce([{ id: 'SYS-001' }, { id: 'SYS-002' }]);

      const result = await repo.reorderSystems(['SYS-001', 'SYS-001', 'SYS-002']);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.tenantSystem.update).not.toHaveBeenCalled();
      expect(txMock.tenantSystem.findMany).toHaveBeenCalledTimes(1);
    });

    it('現存に無い id を含むと set-mismatch を返し update も再読込も発行しない', async () => {
      txMock.tenantSystem.findMany.mockResolvedValueOnce([{ id: 'SYS-001' }, { id: 'SYS-002' }]);

      const result = await repo.reorderSystems(['SYS-001', 'SYS-GHOST']);

      expect(result).toEqual({ ok: false, reason: 'set-mismatch' });
      expect(txMock.tenantSystem.update).not.toHaveBeenCalled();
      expect(txMock.tenantSystem.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
