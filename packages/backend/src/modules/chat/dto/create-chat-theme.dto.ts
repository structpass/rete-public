import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { MAX_MENTION_IDS } from '../../../common/mentions';

/** チャット明細の投稿欄（タイトル + 説明）からテーマを作成する。 */
export class CreateChatThemeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  // 説明（description）の宛先（メンション先）アカウント id 群（任意・複数可 / rete-desk-0116）。
  // 本文中の @ メンションノードから frontend が抽出する。ChatMessageMention と同じ上限 + UUID 形式で
  // 巨大配列 / 不正値の流入を入力境界で遮断する。重複排除・存在検証は service が行う。
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  descriptionMentionAccountIds?: string[];

  // 投稿先の器（Space）ID（CM-2 スライスB / ADR 0037 §7）。未指定時は DEFAULT_CHANNEL_ID を
  // repository が刻印する（孤児化防止 = 器なしテーマがチャネル絞り込みで消えるのを防ぐ）。
  // frontend がチャネル選択中ならその spaceId を渡す。
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
