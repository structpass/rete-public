import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

type RequestCacheStore = Map<string, unknown>;

/**
 * リクエストスコープのメモ化キャッシュ（cmn-0051）。
 *
 * NestJS の Request スコープ化（DI チェーン全体がリクエスト毎インスタンス生成の道連れになる）
 * を避けるため、シングルトンのまま AsyncLocalStorage でリクエスト単位のキャッシュ領域を提供する。
 * store は RequestCacheInterceptor（APP_INTERCEPTOR）がリクエスト毎に `run()` で新規生成するため、
 * リクエストを跨いだ値の持ち越し（漏れ）は発生しない。
 *
 * `run()` を経由しない呼び出し（Guard 内など interceptor 到達前の経路・テスト等）では
 * store が存在せず、`getOrSet` は毎回 factory() を実行する安全側フォールバックになる。
 */
@Injectable()
export class RequestCacheService {
  private readonly als = new AsyncLocalStorage<RequestCacheStore>();

  /** 新しいリクエストスコープ（空の Map）を開始し、その中で fn を実行する。 */
  run<T>(fn: () => T): T {
    return this.als.run(new Map<string, unknown>(), fn);
  }

  /**
   * key に対応するキャッシュ済み値があれば返す。無ければ factory() の戻り値（Promise を含む）を
   * キャッシュしてから返す。factory() の戻り値をそのままキャッシュするため、Promise を返す
   * factory であれば同時（並行）呼び出しも同じ Promise を共有し二重解決を防げる。
   */
  getOrSet<T>(key: string, factory: () => T): T {
    const store = this.als.getStore();
    if (!store) return factory();
    if (store.has(key)) return store.get(key) as T;
    const value = factory();
    store.set(key, value);
    return value;
  }
}
