/**
 * 担当者選択用の Account サマリ DTO（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/account` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する（呼び出し側の import パスは変えない）。
 *
 * Prisma Account を直返しせず本 DTO を経由する。email / role / passwordHash 等の
 * 機密・内部列は載せず、選択 UI に必要な id + 表示名のみ公開する。
 *
 * 自己プロフィール用の AccountResponseDto（auth モジュール・role 等を含む）とは別物。
 * 本 DTO は「誰に割り当てるか」の候補一覧専用で、最小情報に絞る。
 */

export type { AccountSummaryDto } from '@rete/shared';
