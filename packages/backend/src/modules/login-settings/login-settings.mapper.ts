import type { IpWhitelistEntry, PasswordPolicy } from '@prisma/client';
import type { IpWhitelistEntryDto, PasswordPolicyDto } from '@rete/shared';
import { DEFAULT_TENANT_PASSWORD_POLICY } from './login-settings.constants';

/**
 * ログイン設定の Entity → Response DTO 写像（§1 DTO 境界）。Prisma 固有列（id / updatedAt / sortOrder /
 * createdAt）はレスポンスに載せない。パスワードポリシーは行不在なら既定値を返す（singleton 未初期化時）。
 */

/** PasswordPolicy 行（無ければ既定）→ Response。 */
export function toPasswordPolicyResponse(row: PasswordPolicy | null): PasswordPolicyDto {
  if (!row) return { ...DEFAULT_TENANT_PASSWORD_POLICY };
  return {
    requireLowercase: row.requireLowercase,
    requireUppercase: row.requireUppercase,
    requireNumber: row.requireNumber,
    requireSymbol: row.requireSymbol,
    minLength: row.minLength,
    mfaEnforced: row.mfaEnforced,
  };
}

/** IpWhitelistEntry 行 → Response（id / cidr / note のみ）。 */
export function toIpWhitelistEntryResponse(row: IpWhitelistEntry): IpWhitelistEntryDto {
  return { id: row.id, cidr: row.cidr, note: row.note };
}
