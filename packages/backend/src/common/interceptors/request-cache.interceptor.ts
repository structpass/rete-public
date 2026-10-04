import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestCacheService } from '../services';

/**
 * リクエストスコープキャッシュ用 APP_INTERCEPTOR（cmn-0051）。
 *
 * リクエスト毎に RequestCacheService の AsyncLocalStorage store を新規生成し、
 * その中でハンドラ（Controller → Service）を実行する。ScopeVisibilityService.resolveVisibleSpaceIds
 * 等はこのスコープ内で `getOrSet` を使うことで同一リクエスト・同一 key の再計算を避けられる。
 *
 * RxJS の `next.handle()` は購読（subscribe）されるまで実行されないため、`als.run()` の
 * 同期実行区間内で `next.handle().subscribe()` 自体を呼び出す必要がある（そうしないと
 * AsyncLocalStorage のコンテキストが Controller/Service の非同期実行チェーンへ伝播しない）。
 */
@Injectable()
export class RequestCacheInterceptor implements NestInterceptor {
  constructor(private readonly requestCache: RequestCacheService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return new Observable((subscriber) => {
      this.requestCache.run(() => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
