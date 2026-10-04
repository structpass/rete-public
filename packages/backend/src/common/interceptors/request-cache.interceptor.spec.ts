import type { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError, Observable } from 'rxjs';
import { RequestCacheInterceptor } from './request-cache.interceptor';
import { RequestCacheService } from '../services';

/**
 * RequestCacheInterceptor のユニットテスト（cmn-0051）。
 * ハンドラ実行が RequestCacheService.run() のスコープ内で行われ、
 * 同一リクエスト内で ALS store 経由のキャッシュが機能することを検証する。
 * また、正常値/エラーいずれも購読者へ正しく中継されることを確認する。
 */
describe('RequestCacheInterceptor', () => {
  let requestCache: RequestCacheService;
  let interceptor: RequestCacheInterceptor;

  beforeEach(() => {
    requestCache = new RequestCacheService();
    interceptor = new RequestCacheInterceptor(requestCache);
  });

  function makeContext(): ExecutionContext {
    return {} as ExecutionContext;
  }

  /** ハンドラ内で非同期に getOrSet を呼ぶ CallHandler を模倣する。 */
  function makeAsyncCacheHandler(factory: () => Promise<unknown>) {
    return {
      handle: () =>
        new Observable((subscriber) => {
          void (async () => {
            await requestCache.getOrSet('key-1', factory);
            await requestCache.getOrSet('key-1', factory);
            subscriber.next('done');
            subscriber.complete();
          })();
        }),
    };
  }

  it('next.handle() の値をそのまま購読者へ中継する', async () => {
    const handler = { handle: () => of({ success: true }) };

    const result = await lastValueFrom(interceptor.intercept(makeContext(), handler));

    expect(result).toEqual({ success: true });
  });

  it('next.handle() のエラーをそのまま購読者へ中継する', async () => {
    const err = new Error('boom');
    const handler = { handle: () => throwError(() => err) };

    await expect(lastValueFrom(interceptor.intercept(makeContext(), handler))).rejects.toBe(err);
  });

  it('ハンドラ実行中は RequestCacheService の store が有効（getOrSet がキャッシュされる）', async () => {
    const factory = jest.fn().mockReturnValue(Promise.resolve('value'));

    await lastValueFrom(interceptor.intercept(makeContext(), makeAsyncCacheHandler(factory)));

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('2回のリクエスト（2回の intercept 呼び出し）でキャッシュは持ち越されない', async () => {
    const factory = jest.fn().mockReturnValue(Promise.resolve('value'));

    await lastValueFrom(interceptor.intercept(makeContext(), makeAsyncCacheHandler(factory)));
    await lastValueFrom(interceptor.intercept(makeContext(), makeAsyncCacheHandler(factory)));

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
