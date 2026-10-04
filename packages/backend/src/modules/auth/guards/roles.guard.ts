import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '@rete/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../auth.service';

/**
 * ロールベースの認可ガード（RBAC 最小核）。`@Roles(...)` で宣言された許可ロールと
 * req.user.role を照合し、不一致は ForbiddenException（AllExceptionsFilter が 403 形状へ整える）。
 *
 * - メタデータ未付与（@Roles 無し）の endpoint は role 制限なしで素通し（認証のみ）。
 *   これにより本ガードを controller 全体に掛けても、読み取り系（@Roles 無し）は影響を受けない。
 * - AuthenticatedGuard の後段で使う前提（req.user 前提）。req.user / role 不在は防御的に Forbidden。
 *   実認証境界は AuthenticatedGuard（未ログイン → 401）が担い、本ガードは認可（権限不足 → 403）のみ。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // role 宣言が無い endpoint は制限なし（認証のみで通す）。
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('この操作を行う権限がありません');
    }
    return true;
  }
}
