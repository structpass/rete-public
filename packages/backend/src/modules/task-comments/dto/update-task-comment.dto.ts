import { CreateTaskCommentDto } from './create-task-comment.dto';

/**
 * タスクコメントの本文編集（dsk-0241）。編集できるのは投稿者本人のみ（service が 403）。
 * 本文制約は投稿（CreateTaskCommentDto）と同一。mentionAccountIds は編集後の本文から再抽出した宛先で、
 * 指定時は当該コメントの宛先を全置換する（未指定 = 宛先据え置き / dsk-0203・UpdateChatMessageDto と同型）。
 *
 * Update は PartialType にせず Create を素で継承する（cmn-0281）：chat と同じ理由で本文必須のまま据え置く。
 * 検証規則の実体は共通基底 MessageBodyInputBase（cmn-0289）にあり、本クラスは Create を介してそれを引き継ぐ。
 */
export class UpdateTaskCommentDto extends CreateTaskCommentDto {}
