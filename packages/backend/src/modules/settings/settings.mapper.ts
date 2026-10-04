import type { Tenant, TenantSystem } from '@prisma/client';
import type { TenantResponseDto, TenantSystemResponseDto } from './dto';
import { DEFAULT_TENANT_BADGE_COLOR, DEFAULT_TENANT_NAME } from './settings.constants';

/**
 * Tenant Entity → TenantResponseDto（§1 DTO 境界）。
 * 行が未作成（seed 前の degraded 状態）なら app 既定値で補完する（FileSettings の null フォールバックと同方針）。
 */
export function toTenantResponse(entity: Tenant | null): TenantResponseDto {
  if (!entity) {
    return {
      name: DEFAULT_TENANT_NAME,
      badgeColor: DEFAULT_TENANT_BADGE_COLOR,
      updatedAt: null,
    };
  }
  return {
    name: entity.name,
    badgeColor: entity.badgeColor,
    updatedAt: entity.updatedAt.toISOString(),
  };
}

/** TenantSystem Entity → TenantSystemResponseDto（§1 DTO 境界）。 */
export function toTenantSystemResponse(entity: TenantSystem): TenantSystemResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    isRete: entity.isRete,
    enabled: entity.enabled,
    sortOrder: entity.sortOrder,
  };
}
