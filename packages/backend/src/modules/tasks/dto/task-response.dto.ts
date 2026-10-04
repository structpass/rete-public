/**
 * Task の Response DTO（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/task` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する（tasks.mapper.ts / frontend tasks の import パスは変えない）。
 *
 * Prisma Entity を直返しせず、本 DTO を経由する。Date 系フィールド（startDate / dueDate /
 * createdAt / updatedAt）は mapper で ISO 8601 文字列に変換し、null 許容フィールドは null を
 * そのまま保持する。担当者・作成者の要約（TaskAssigneeDto）と昇格元テーマ（TaskSourceThemeDto）は
 * 同じく shared 側で定義する。
 */

export type { TaskSourceThemeDto, TaskAssigneeDto, TaskResponseDto } from '@rete/shared';
