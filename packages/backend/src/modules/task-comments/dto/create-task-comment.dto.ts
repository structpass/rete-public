import { MessageBodyInputBase } from '../../../common/mentions';

/**
 * タスク詳細のコメント入力欄からコメントを投稿する（dsk-0216・メンションは dsk-0203 で対応済み）。
 * 本文（body）と宛先（mentionAccountIds）の検証規則は共通基底 MessageBodyInputBase が持つ（cmn-0289）。
 */
export class CreateTaskCommentDto extends MessageBodyInputBase {}
