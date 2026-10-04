import { BadRequestException } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

const mockRepo = {
  search: jest.fn(),
  findForExport: jest.fn(),
};

const row = {
  id: 'a1',
  actorAccountId: 'acc-1',
  actorName: '田中 太郎',
  actorEmail: 'tanaka@struct-pass.io',
  systemId: 'SYS-001',
  systemName: 'system-A 商品管理',
  actionType: 'update',
  feature: '在庫管理',
  summary: 'SKU-1024 在庫数 120 → 170',
  details: null,
  ipAddress: '203.0.113.42',
  userAgent: null,
  createdAt: new Date('2026-05-08T00:42:08.000Z'),
};

/** 既定値（page/limit）を埋めた QueryAuditLogsDto を作る。 */
function query(over: Partial<QueryAuditLogsDto> = {}): QueryAuditLogsDto {
  return Object.assign(new QueryAuditLogsDto(), { page: 1, limit: 20 }, over);
}

describe('AuditLogsService', () => {
  let service: AuditLogsService;

  beforeEach(() => {
    service = new AuditLogsService(mockRepo as never);
  });

  describe('search', () => {
    it('フィルタ + keyset opts で repo を呼び、写像済み DTO と meta/cursors を返す', async () => {
      mockRepo.search.mockResolvedValue({
        data: [row],
        total: 1,
        cursors: { next: 'CURSOR_NEXT', prev: null },
      });
      const res = await service.search(query({ search: ' 田中 ', actionType: 'update' }));

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).not.toHaveProperty('userAgent'); // DTO 境界
      expect(res.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
      expect(res.cursors).toEqual({ next: 'CURSOR_NEXT', prev: null });
      // search は trim 済みで渡る。opts は OFFSET(page) でなく limit/direction/cursor のみ。
      const [filter, opts] = mockRepo.search.mock.calls[0];
      expect(filter.search).toBe('田中');
      expect(filter.actionType).toBe('update');
      expect(opts).toEqual({ limit: 20, direction: undefined, cursor: undefined });
    });

    it('cursor/direction を repo opts へそのまま渡す（keyset 移動）', async () => {
      mockRepo.search.mockResolvedValue({
        data: [],
        total: 0,
        cursors: { next: null, prev: null },
      });
      await service.search(query({ direction: 'next', cursor: 'CURSOR_A' }));
      const [, opts] = mockRepo.search.mock.calls[0];
      expect(opts).toEqual({ limit: 20, direction: 'next', cursor: 'CURSOR_A' });
    });

    it('期間（from/to・日付のみ）を日初 / 日末の Date 境界へ正規化して渡す', async () => {
      mockRepo.search.mockResolvedValue({
        data: [],
        total: 0,
        cursors: { next: null, prev: null },
      });
      await service.search(query({ from: '2026-05-01', to: '2026-05-08' }));
      const filter = mockRepo.search.mock.calls[0][0];
      expect((filter.from as Date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
      expect((filter.to as Date).toISOString()).toBe('2026-05-08T23:59:59.999Z');
    });
  });

  describe('exportCsv', () => {
    it('期間（from / to）未指定は BadRequest（DB を読まない）', async () => {
      await expect(service.exportCsv(query({ from: '2026-05-01' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepo.findForExport).not.toHaveBeenCalled();
    });

    it('期間が 92 日を超えると BadRequest', async () => {
      await expect(
        service.exportCsv(query({ from: '2026-01-01', to: '2026-12-31' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.findForExport).not.toHaveBeenCalled();
    });

    it('ちょうど 92 暦日（含む両端）は受理する（境界・off-by-one 検証）', async () => {
      mockRepo.findForExport.mockResolvedValue([]);
      // 2026-01-01 〜 2026-04-02 = 92 暦日（含む）。
      await expect(
        service.exportCsv(query({ from: '2026-01-01', to: '2026-04-02' })),
      ).resolves.toContain('﻿');
      // 1 日多い 93 暦日（〜04-03）は拒否。
      await expect(
        service.exportCsv(query({ from: '2026-01-01', to: '2026-04-03' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('日付として不正な from（@IsDateString 通過後の Invalid Date）は BadRequest で弾く（NaN 素通り防止）', async () => {
      await expect(
        service.exportCsv(query({ from: '2026-13-40', to: '2026-05-08' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.findForExport).not.toHaveBeenCalled();
    });

    it('開始日が終了日より後なら BadRequest', async () => {
      await expect(
        service.exportCsv(query({ from: '2026-05-08', to: '2026-05-01' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('期間が妥当なら該当行を取得し UTF-8 BOM 付き CSV を返す', async () => {
      mockRepo.findForExport.mockResolvedValue([row]);
      const csv = await service.exportCsv(query({ from: '2026-05-01', to: '2026-05-08' }));
      expect(csv.startsWith('﻿')).toBe(true);
      expect(csv).toContain('田中 太郎');
      expect(mockRepo.findForExport).toHaveBeenCalledTimes(1);
    });
  });
});
