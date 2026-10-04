import type { MembershipDto } from '@rete/shared';
import type { MembershipScopeType } from '@rete/shared';
import type { MembershipWithAccount } from './repositories/memberships.repository';

/**
 * MembershipWithAccount（select 済エンティティ + account.name）→ MembershipDto（§1 DTO 境界・純粋関数）。
 * scopeType は Prisma enum 文字列から @rete/shared MembershipScopeType へキャスト（値が完全一致）。
 * role は Prisma Role enum 文字列を 'ADMIN' | 'MEMBER' としてそのまま返す。
 */
export function toMembershipDto(row: MembershipWithAccount): MembershipDto {
  return {
    id: row.id,
    accountId: row.accountId,
    scopeType: row.scopeType as MembershipScopeType,
    scopeId: row.scopeId,
    role: row.role as 'ADMIN' | 'MEMBER',
    accountName: row.account?.name,
  };
}
