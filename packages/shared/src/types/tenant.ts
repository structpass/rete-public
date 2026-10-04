/**
 * テナント設定（settings モジュール）の応答形の SSOT（v2-245 で集約）。
 * backend の tenant-response.dto.ts / tenant-system-response.dto.ts と frontend settings の
 * ローカル型が同形を別々に宣言していたため、形の正本をここへ一本化した
 * （backend の dto は再公開のみ・frontend は本型を参照する）。
 */

/**
 * テナント情報の Response DTO（§1 DTO 境界）。
 * badgeColor は 'green' | 'red' | 'blue' | 'none'（値域は app 層で制約）。
 * updatedAt は Tenant 行が未作成のとき null（seed 前の degraded 状態）。
 */
export interface TenantResponseDto {
  name: string;
  badgeColor: string;
  updatedAt: string | null;
}

/**
 * テナント契約システム 1 行の Response DTO（§1 DTO 境界）。
 * 一覧は sortOrder 昇順で返す（frontend は配列順で描画する）。
 */
export interface TenantSystemResponseDto {
  id: string;
  name: string;
  isRete: boolean;
  enabled: boolean;
  sortOrder: number;
}
