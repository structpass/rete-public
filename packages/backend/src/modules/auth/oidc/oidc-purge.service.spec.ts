import { Logger } from '@nestjs/common';
import { OidcPurgeService } from './oidc-purge.service';
import type { PrismaService } from '../../../database';

const mockPrisma = {
  oidcPayload: { deleteMany: jest.fn() },
};

const NOW = new Date('2026-06-03T04:00:00.000Z');

describe('OidcPurgeService', () => {
  let service: OidcPurgeService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    service = new OidcPurgeService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('purgeExpired', () => {
    it('expiresAt 超過かつ非 null の行のみを削除し、削除件数を返すこと（無期限=null は対象外）', async () => {
      mockPrisma.oidcPayload.deleteMany.mockResolvedValue({ count: 3 });

      const count = await service.purgeExpired();

      expect(mockPrisma.oidcPayload.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { not: null, lt: NOW } },
      });
      expect(count).toBe(3);
    });

    it('削除件数を log level で出力すること（センシティブ情報なし）', async () => {
      mockPrisma.oidcPayload.deleteMany.mockResolvedValue({ count: 5 });
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      await service.purgeExpired();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Purged 5'));
    });

    it('削除が失敗しても例外を投げず（fire-and-forget）、logger.error で痕跡を残し 0 を返すこと', async () => {
      mockPrisma.oidcPayload.deleteMany.mockRejectedValue(new Error('db down'));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const count = await service.purgeExpired();

      expect(count).toBe(0);
      // 痕跡は message を文字列に含めて残す（接続情報を含みうる raw Error / stack は渡さない）。
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('db down'));
      // 第 2 引数に raw Error を渡さないこと: NestJS Logger は stack 扱いし [object Object] 化、
      // かつ Prisma 接続エラーの stack は host 情報の漏洩経路になりうる（operational-policy §2）。
      const [, secondArg] = errorSpy.mock.calls[0];
      expect(secondArg).toBeUndefined();
    });
  });

  describe('handleScheduledPurge', () => {
    it('スケジュール起動時に purge を実行すること（deleteMany を呼ぶ）', async () => {
      mockPrisma.oidcPayload.deleteMany.mockResolvedValue({ count: 0 });

      await service.handleScheduledPurge();

      expect(mockPrisma.oidcPayload.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('purge が失敗してもスケジュール起動経路で例外を伝播しないこと（unhandled rejection 防止）', async () => {
      mockPrisma.oidcPayload.deleteMany.mockRejectedValue(new Error('db down'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(service.handleScheduledPurge()).resolves.toBeUndefined();
    });
  });
});
