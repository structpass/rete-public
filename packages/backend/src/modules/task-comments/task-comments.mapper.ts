import type { TaskComment, Account } from '@prisma/client';
import { toAttachment } from '../attachments/attachments.mapper';
import type { AttachmentWithDisplay } from '../attachments/repositories/attachments.repository';
import { aggregateReactions } from '../chat/chat.mapper';
import type { TaskCommentAuthorDto, TaskCommentResponseDto } from './dto/task-comment-response.dto';

// 投稿者は表示名 + id のみ取得・露出する（email 等の個人情報をクエリ／レスポンスに乗せない）。
type AuthorPick = Pick<Account, 'id' | 'name'>;
// メンション先は account を id+name に絞って include する（DTO 境界・dsk-0203・chat.mapper と同方針）。
type MentionPick = { account: AuthorPick };
// リアクションは集計に使う emoji / authorId のみ（chat.mapper.aggregateReactions が消費・dsk-0297）。
type ReactionPick = { emoji: string; authorId: string };
// 添付（dsk-0249）/ 宛先（dsk-0203）/ リアクション（dsk-0297）は経路により include しない場合があるため
// optional 受け（chat.mapper と同方針・型崩れ回避）。
type CommentWithAuthor = TaskComment & {
  author: AuthorPick;
  attachments?: AttachmentWithDisplay[];
  mentions?: MentionPick[];
  reactions?: ReactionPick[];
};

function toAuthor(author: AuthorPick): TaskCommentAuthorDto {
  return { id: author.id, name: author.name };
}

/**
 * TaskComment Entity（author + 添付 + リアクション同梱）を Response DTO へ写す（§1 DTO 境界・
 * Decimal/Date は ISO 文字列化）。添付（dsk-0249）はチャット発話と対称に createdAt 昇順で配列化する
 * （include 無しの経路は空配列）。currentUserId は reactedByMe の判定に使う（chat.mapper と同方針）。
 */
export function toTaskCommentResponse(
  comment: CommentWithAuthor,
  currentUserId?: string,
): TaskCommentResponseDto {
  return {
    id: comment.id,
    taskId: comment.taskId,
    body: comment.body,
    author: toAuthor(comment.author),
    attachments: (comment.attachments ?? []).map(toAttachment),
    // メンション先 account を id+name のみへ畳む（生フィールド非露出・§1 DTO 境界 / dsk-0203）。
    mentions: (comment.mentions ?? []).map((m) => toAuthor(m.account)),
    // emoji 別に集計したリアクション（chat.mapper の共有関数を再利用・§3 コピペ禁止・dsk-0297）。
    reactions: aggregateReactions(comment.reactions, currentUserId),
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}
