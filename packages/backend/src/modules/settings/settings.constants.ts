/**
 * テナント設定（ST-1）の固定値。Tenant は単一テナント前提（ADR 0017）のため、FileSettings と同じく
 * 固定 id の singleton 1 行で運用する。マルチテナント化は ST-3 RBAC で再評価する。
 */

/** Tenant singleton の固定 id（FileSettings の `'singleton'` と同方針）。 */
export const TENANT_SINGLETON_ID = 'singleton';

/** Tenant 行が未作成（seed 前の degraded 状態）のときに mapper が返す既定値。 */
export const DEFAULT_TENANT_NAME = '';
export const DEFAULT_TENANT_BADGE_COLOR = 'none';

/** テナントバッジ配色の値域。DTO の @IsIn と mapper のフォールバックで共有する。 */
export const TENANT_BADGE_COLORS = ['green', 'red', 'blue', 'none'] as const;
export type TenantBadgeColor = (typeof TENANT_BADGE_COLORS)[number];

/** テナント名の最大長（モック「最大 20 文字」を踏襲）。 */
export const TENANT_NAME_MAX_LENGTH = 20;
