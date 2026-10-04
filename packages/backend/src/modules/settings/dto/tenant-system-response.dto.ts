/**
 * テナント契約システム 1 行の Response DTO（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/tenant` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する（settings.mapper.ts / frontend の import パスは変えない）。
 * 一覧は sortOrder 昇順で返す（frontend は配列順で描画する）。
 */

export type { TenantSystemResponseDto } from '@rete/shared';
