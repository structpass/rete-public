import { RequestCacheService } from './request-cache.service';

/**
 * RequestCacheService のユニットテスト（cmn-0051）。
 * AsyncLocalStorage ベースのリクエストスコープキャッシュが
 * - 同一 run() 内で key を再利用する
 * - run() を跨ぐと持ち越されない（リーク無し）
 * - run() 外（store 無し）ではキャッシュせず毎回 factory() を実行する
 * ことを検証する。
 */
describe('RequestCacheService', () => {
  let service: RequestCacheService;

  beforeEach(() => {
    service = new RequestCacheService();
  });

  it('同一 run() スコープ内では factory が1回しか呼ばれない', async () => {
    const factory = jest.fn().mockReturnValue(Promise.resolve('value'));

    await service.run(async () => {
      const a = await service.getOrSet('key-1', factory);
      const b = await service.getOrSet('key-1', factory);
      expect(a).toBe('value');
      expect(b).toBe('value');
    });

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('異なる key は別々にキャッシュされる', async () => {
    const factoryA = jest.fn().mockReturnValue(Promise.resolve('a'));
    const factoryB = jest.fn().mockReturnValue(Promise.resolve('b'));

    await service.run(async () => {
      await service.getOrSet('key-a', factoryA);
      await service.getOrSet('key-b', factoryB);
    });

    expect(factoryA).toHaveBeenCalledTimes(1);
    expect(factoryB).toHaveBeenCalledTimes(1);
  });

  it('run() を跨ぐとキャッシュは持ち越されない（リクエスト間の漏れ無し）', async () => {
    const factory = jest.fn().mockReturnValue(Promise.resolve('value'));

    await service.run(() => service.getOrSet('key-1', factory));
    await service.run(() => service.getOrSet('key-1', factory));

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('run() の外（store 無し）では毎回 factory を実行する（安全側フォールバック）', async () => {
    const factory = jest.fn().mockReturnValue(Promise.resolve('value'));

    await service.getOrSet('key-1', factory);
    await service.getOrSet('key-1', factory);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('同時（並行）呼び出しでも同じ Promise を共有する（二重解決の排除）', async () => {
    let resolveCount = 0;
    const factory = jest.fn(() => {
      resolveCount += 1;
      return Promise.resolve(resolveCount);
    });

    await service.run(async () => {
      const [a, b] = await Promise.all([
        service.getOrSet('key-1', factory),
        service.getOrSet('key-1', factory),
      ]);
      expect(a).toBe(b);
    });

    expect(factory).toHaveBeenCalledTimes(1);
  });
});
