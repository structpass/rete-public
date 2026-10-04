/**
 * タスクコメント（task-comments モジュール）の応答形の SSOT（v2-245 で集約）。
 * backend の task-comment-response.dto.ts と frontend desk のローカル型が同形を別々に宣言していたため、
 * 形の正本をここへ一本化した（backend の dto は再公開のみ・frontend は本型を参照する）。
 */
import type { AttachmentDto } from './attachment';
import type { ReactionSummary } from './chat';

/** 投稿者は Account へ正規化済。レスポンスでは id + 表示名のみ公開（email 等は出さない・§1 DTO 境界）。 */
export interface TaskCommentAuthorDto {
  id: string;
  name: string;
}

/** タスクへのコメント 1 件（dsk-0216）。Entity 直返しせず mapper を経由する（§1 DTO 境界）。 */
export interface TaskCommentResponseDto {
  id: string;
  /** 親タスク id（Task.id は autoincrement int）。 */
  taskId: number;
  body: string;
  author: TaskCommentAuthorDto;
  /** コメント＝スレッド投稿物にぶら下がる添付（dsk-0249・チャット発話と対称）。include 無しの経路は空配列。 */
  attachments: AttachmentDto[];
  /**
   * このコメントのメンション先（@誰宛て / dsk-0203・ChatMessageResponseDto.mentions と対称）。
   * account を id+name のみへ畳む（§1 DTO 境界）。
   */
  mentions: TaskCommentAuthorDto[];
  /**
   * emoji 別に集計したリアクション（dsk-0297・ChatMessageResponseDto.reactions と対称）。
   * 集計形は shared の ReactionSummary を単一ソースとして再利用し、同形の型を複製しない（§3 コピペ禁止）。
   */
  reactions: ReactionSummary[];
  createdAt: string;
  updatedAt: string;
}
