import { MessageBodyInputBase } from '../../../common/mentions';

/**
 * チャット詳細スレッドの返信入力欄からメッセージを投稿する。
 * 本文（body）と宛先（mentionAccountIds）の検証規則は共通基底 MessageBodyInputBase が持つ（cmn-0289）。
 */
export class CreateChatMessageDto extends MessageBodyInputBase {}
