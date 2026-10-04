import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  describe('isHealthy（観測性 H9 / DB readiness ping）', () => {
    it('SELECT 1 が成功すれば true', async () => {
      const service = new PrismaService();
      jest
        .spyOn(service as unknown as { $queryRaw: jest.Mock }, '$queryRaw')
        .mockResolvedValue([{ ok: 1 }] as never);

      await expect(service.isHealthy()).resolves.toBe(true);
    });

    it('クエリが失敗すれば false（例外を握り潰し up/down 判定に倒す）', async () => {
      const service = new PrismaService();
      jest
        .spyOn(service as unknown as { $queryRaw: jest.Mock }, '$queryRaw')
        .mockRejectedValue(new Error('connection refused') as never);

      await expect(service.isHealthy()).resolves.toBe(false);
    });

    it('クエリが stall したら timeout で false（readiness が無限待ちしない）', async () => {
      jest.useFakeTimers();
      try {
        const service = new PrismaService();
        jest
          .spyOn(service as unknown as { $queryRaw: jest.Mock }, '$queryRaw')
          // 永遠に resolve しない（DB 飽和を模擬）。
          .mockReturnValue(new Promise(() => undefined) as never);

        const pending = service.isHealthy();
        await jest.advanceTimersByTimeAsync(2000);

        await expect(pending).resolves.toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
