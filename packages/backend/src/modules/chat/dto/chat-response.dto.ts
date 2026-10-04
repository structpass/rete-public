/**
 * チャットの Response DTO（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/chat` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する（chat.mapper.ts / frontend desk の import パスは変えない）。
 *
 * 発話の添付（FL-3b）・メンション（rete-desk-0049）・リアクション（dsk-0297）と、明細カードの
 * 導出フラグ（archived / hasTenmatsu / hasMentionToMe / hasUnread）の意味づけは shared 側の
 * コメントを参照。集計形は shared の ReactionSummary を単一ソースとし、同形の型を複製しない。
 */

export type {
  ChatAuthorDto,
  ChatMessageResponseDto,
  ChatThemeSummaryDto,
  ChatThemeDetailDto,
} from '@rete/shared';

/** 集計形の正本は shared の ReactionSummary。backend 内の既存参照名を変えないための別名。 */
export type { ReactionSummary as ReactionSummaryDto } from '@rete/shared';

/** トグル応答（{ reacted }）の形の正本も shared。backend は同名のまま再公開し、形を書き写さない（v2-251）。 */
export type { ReactionToggleResponseDto } from '@rete/shared';
