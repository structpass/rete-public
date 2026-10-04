import type { MfaSetting } from '@prisma/client';
import type { MfaStatusDto } from '@rete/shared';

/**
 * MFA Entity → Response DTO 写像（§1 DTO 境界）。
 * 暗号化 secret（totpSecret）/ id / createdAt 等の内部列はレスポンスに絶対に載せない。
 * 未設定（行不在）は enabled=false / confirmedAt=null として表現する。
 */
export function toMfaStatusResponse(row: MfaSetting | null): MfaStatusDto {
  if (!row) return { enabled: false, confirmedAt: null };
  return {
    enabled: row.enabled,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
  };
}
