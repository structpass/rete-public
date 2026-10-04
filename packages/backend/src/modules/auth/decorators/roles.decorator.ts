import { SetMetadata } from '@nestjs/common';
import type { Role } from '@rete/shared';

/** RolesGuard が必要ロールを読むためのメタデータキー。 */
export const ROLES_KEY = 'roles';

/**
 * ハンドラ（またはコントローラ）に許可ロールを宣言するデコレータ。
 * `@Roles(Role.ADMIN)` を付けた endpoint は、RolesGuard が req.user.role を照合して
 * 許可ロール以外を ForbiddenException で弾く。未付与の endpoint は role 制限なし（認証のみ）。
 *
 * 必ず AuthenticatedGuard と併用する（req.user を前提とするため、UseGuards の順序で
 * AuthenticatedGuard を先に置く）。
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
