import { Logger } from '@nestjs/common';
import { AuditLogsPurgeService } from './audit-logs-purge.service';

const mockRepo = {
  deleteOlderThan: jest.fn(),
};

describe('AuditLogsPurgeService', () => {
  let service: AuditLogsPurgeService;
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new AuditLogsPurgeService(mockRepo as never);
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  describe('purgeExpired', () => {
    it('12ヶ月超過の行を repo.deleteOlderThan に委譲し件数を返すこと', async () => {
      mockRepo.deleteOlderThan.mockResolvedValue(5);

      const beforeCall = new Date();
      const count = await service.purgeExpired();

      expect(count).toBe(5);
      expect(mockRepo.deleteOlderThan).toHaveBeenCalledTimes(1);

      // cutoff は 現在 − 12ヶ月（UTC ベース）。テスト実行時刻との差が 1 秒以内であることを確認。
      const cutoff: Date = mockRepo.deleteOlderThan.mock.calls[0][0] as Date;
      const expected = new Date(beforeCall);
      expected.setUTCMonth(expected.getUTCMonth() - 12);
      // 1000ms の許容（テスト実行時刻の微小なズレ）。
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it('cutoff は現在より過去（12ヶ月前）であること', async () => {
      mockRepo.deleteOlderThan.mockResolvedValue(0);
      await service.purgeExpired();
      const cutoff: Date = mockRepo.deleteOlderThan.mock.calls[0][0] as Date;
      expect(cutoff.getTime()).toBeLessThan(Date.now());
    });

    it('削除件数 0 件でも logger.log を呼びエラーにしないこと', async () => {
      mockRepo.deleteOlderThan.mockResolvedValue(0);
      const count = await service.purgeExpired();
      expect(count).toBe(0);
      expect(loggerLogSpy).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('deleteOlderThan が throw しても purgeExpired は例外を投げず logger.error のみ（best-effort）', async () => {
      mockRepo.deleteOlderThan.mockRejectedValue(new Error('DB connection lost'));
      const count = await expect(service.purgeExpired()).resolves.toBe(0);
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('DB connection lost'));
      return count;
    });
  });

  describe('handleScheduledPurge', () => {
    it('purgeExpired を呼ぶこと（Cron ラッパー）', async () => {
      mockRepo.deleteOlderThan.mockResolvedValue(3);
      await service.handleScheduledPurge();
      expect(mockRepo.deleteOlderThan).toHaveBeenCalledTimes(1);
    });
  });
});
