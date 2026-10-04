import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * express-session ベースのログイン済み判定。passport が付与する req.isAuthenticated() を見る。
 * 未ログインは UnauthorizedException（AllExceptionsFilter が UNAUTHORIZED 形状に整える）。
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // cmn-0232 MEDIUM1: 真偽値そのもの（!== true）で判定する。isAuthenticated が将来
    // 非同期化（Promise を返す）へ書き換わると truthy 判定（!val）は resolve 値が false
    // でも Promise インスタンスが truthy で常時 fail-open になる。型注釈は passport の
    // Request#isAuthenticated が () => boolean だが、要件上ここではこの一段を疑って掛かる。
    if (typeof request.isAuthenticated !== 'function' || request.isAuthenticated() !== true) {
      throw new UnauthorizedException('認証が必要です');
    }
    return true;
  }
}
