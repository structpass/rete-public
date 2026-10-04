import apiClient from '@/lib/api-client';
import type { ApiResponse, TenantResponseDto, TenantSystemResponseDto } from '@rete/shared';
import type { TenantBadgeColor, TenantInfo, TenantSystemRow } from './sample/tenant-settings';

/**
 * 設定タブ（ST-1 テナント設定）の API クライアント。
 * backend `api/v1/settings/tenant*` に接続し、DTO ⇄ 画面 ViewModel を変換する。
 */

// ===== backend Response DTO（形の正本は @rete/shared・v2-245 で集約）=====

/** 画面側の既存参照名を保つための別名（形の正本は shared の TenantResponseDto）。 */
type TenantDto = TenantResponseDto;
/** 画面側の既存参照名を保つための別名（形の正本は shared の TenantSystemResponseDto）。 */
type TenantSystemDto = TenantSystemResponseDto;

// ===== 純関数アダプタ（DTO → view 型）=====

/** バッジ配色の値域を画面の union に正規化する（未知値は 'none' へフォールバック）。 */
function toBadgeColor(value: string): TenantBadgeColor {
  return value === 'green' || value === 'red' || value === 'blue' ? value : 'none';
}

/** TenantDto → 画面の TenantInfo。 */
export function toTenantInfo(dto: TenantDto): TenantInfo {
  return { name: dto.name, badgeColor: toBadgeColor(dto.badgeColor) };
}

/** TenantSystemDto → 画面の TenantSystemRow（sortOrder は配列順で表現するため落とす）。 */
export function toTenantSystemRow(dto: TenantSystemDto): TenantSystemRow {
  return { id: dto.id, name: dto.name, isRete: dto.isRete, enabled: dto.enabled };
}

// ===== API 呼び出し =====

/** テナント情報取得（GET /settings/tenant）→ 画面 ViewModel。 */
export async function fetchTenantInfo(): Promise<TenantInfo> {
  const res = await apiClient.get<ApiResponse<TenantDto>>('/settings/tenant');
  return toTenantInfo(res.data.data);
}

/** テナント情報更新（PATCH /settings/tenant）→ 反映後の ViewModel。 */
export async function updateTenantInfo(info: TenantInfo): Promise<TenantInfo> {
  const res = await apiClient.patch<ApiResponse<TenantDto>>('/settings/tenant', {
    name: info.name,
    badgeColor: info.badgeColor,
  });
  return toTenantInfo(res.data.data);
}

/** 契約システム一覧取得（GET /settings/tenant/systems）→ sortOrder 昇順の ViewModel 配列。 */
export async function fetchTenantSystems(): Promise<TenantSystemRow[]> {
  const res = await apiClient.get<ApiResponse<TenantSystemDto[]>>('/settings/tenant/systems');
  return res.data.data.map(toTenantSystemRow);
}
