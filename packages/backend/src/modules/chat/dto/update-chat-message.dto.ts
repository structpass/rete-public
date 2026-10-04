import { CreateChatMessageDto } from './create-chat-message.dto';

/**
 * 自分の発話（スレッドのメッセージ）の本文編集（rete-desk-0146）。
 * body は RTE HTML のため service が postMessage と同じ sanitize 経路を通す（ADR 0019・保存側防御）。
 * mentionAccountIds は編集後の本文から再抽出した宛先で、指定時は当該発話の宛先を全置換する
 * （未指定 = 宛先据え置き）。create と同条件で body 非空・上限・UUID 形式を入力境界で縛る。
 *
 * Update は PartialType にせず Create を素で継承する（cmn-0281）：本文必須なので任意化せず
 * create と同一の検証規則を継承し、検証挙動を回帰させない。検証規則の実体は共通基底
 * MessageBodyInputBase（cmn-0289）にあり、本クラスは Create を介してそれを引き継ぐ。
 */
export class UpdateChatMessageDto extends CreateChatMessageDto {}
