import { Global, Module } from '@nestjs/common';
import { RequestCacheService } from './services';

/**
 * RequestCacheService をグローバル DI として公開するモジュール（cmn-0051）。
 * DatabaseModule（PrismaService）と同型のパターン。ScopeVisibilityService 等の
 * 各 feature module から import 無しで RequestCacheService を注入できるようにする。
 */
@Global()
@Module({
  providers: [RequestCacheService],
  exports: [RequestCacheService],
})
export class RequestCacheModule {}
