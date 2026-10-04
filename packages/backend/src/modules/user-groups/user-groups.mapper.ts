import type {
  MembershipScopeType,
  UserGroupDto,
  UserGroupMemberDto,
  UserGroupScopeGrantDto,
} from '@rete/shared';
import type {
  UserGroupRow,
  UserGroupMemberRow,
  UserGroupScopeGrantRow,
} from './repositories/user-groups.repository';

/**
 * user-groups の Repository 行 → Response DTO 変換（ADR 0002 §1 DTO 境界）。
 * Repository は Entity を返し、Service が本 mapper を通して DTO へ変換する。
 */

/** UserGroupRow → UserGroupDto。 */
export function toUserGroupDto(row: UserGroupRow): UserGroupDto {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** UserGroupMemberRow → UserGroupMemberDto（accountName は account relation の name）。 */
export function toUserGroupMemberDto(row: UserGroupMemberRow): UserGroupMemberDto {
  return {
    id: row.id,
    groupId: row.groupId,
    accountId: row.accountId,
    accountName: row.account?.name,
  };
}

/** UserGroupScopeGrantRow → UserGroupScopeGrantDto。 */
export function toGrantDto(row: UserGroupScopeGrantRow): UserGroupScopeGrantDto {
  return {
    id: row.id,
    groupId: row.groupId,
    scopeType: row.scopeType as MembershipScopeType,
    scopeId: row.scopeId,
    role: row.role as 'ADMIN' | 'MEMBER',
    createdAt: row.createdAt.toISOString(),
  };
}
