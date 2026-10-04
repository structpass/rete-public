/**
 * タスクコメントの Response DTO（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/task-comment` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する（task-comments.mapper.ts / frontend の import パスは変えない）。
 *
 * 添付（dsk-0249）・メンション（dsk-0203）・リアクション（dsk-0297）の意味づけは shared 側の
 * コメントを参照。集計形は shared の ReactionSummary を単一ソースとし、同形の型を複製しない。
 */

export type { TaskCommentAuthorDto, TaskCommentResponseDto } from '@rete/shared';
