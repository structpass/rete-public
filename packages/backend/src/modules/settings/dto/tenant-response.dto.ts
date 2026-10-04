/**
 * テナント情報の Response DTO（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/tenant` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する（settings.mapper.ts / frontend の import パスは変えない）。
 * badgeColor の値域と updatedAt が null になる条件は shared 側のコメントを参照。
 */

export type { TenantResponseDto } from '@rete/shared';
