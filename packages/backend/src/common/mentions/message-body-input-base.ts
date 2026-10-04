import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { MAX_MENTION_IDS } from './max-mention-ids';

/**
 * チャットメッセージ / タスクコメントの投稿・編集入力に共通する「本文 + 宛先」の検証基底（cmn-0289）。
 * body（必須・5000 字上限）と mentionAccountIds（任意・件数上限・UUID 形式）の検証規則をこの 1 箇所だけが持つ。
 * cmn-0281 で試行時に「TS 5.9.3 の module 解決制限」と誤断定されたが、真因は 2 階層の相対パス誤りであり、
 * 3 階層パス（./src/common/mentions）で継承は機能する（Update 系 2 DTO が Create 素継承で本番検証済み）。
 *
 * - body: 必須・空文字不可・5000 字上限（RTE HTML の sanitize は service 側 / ADR 0019）。
 * - mentionAccountIds: 任意・配列・件数上限 MAX_MENTION_IDS・全要素 UUID 形式（rete-desk-0049）。
 *   0 件 = メンションなし投稿。重複排除・存在検証は service が行う（validateMentionAccountIds）。
 */
export abstract class MessageBodyInputBase {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  // 宛先（メンション先）アカウント id 群（任意・複数可 / rete-desk-0049）。
  // 上限 + UUID 形式を入力境界で縛り、巨大配列 / 不正値の流入を遮断する。
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  mentionAccountIds?: string[];
}
