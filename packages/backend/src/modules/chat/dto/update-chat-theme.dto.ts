import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { MAX_MENTION_IDS } from '../../../common/mentions';

/**
 * チャットテーマ（タイトル付きスレッド）の編集。title / description / tenmatsu / archived を部分更新する。
 * description / tenmatsu は RTE HTML のため service 側で createTheme と同じ sanitize 経路を通す。
 * いずれも optional（指定された項目だけ更新）。title は指定時のみ非空・上限を強制（create と同条件）。
 * archived は boolean 契約（true=アーカイブ / false=解除）。service が archivedAt（時刻 or NULL）へ畳む。
 */
export class UpdateChatThemeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  // 顛末（スレッドの結論ノート / rete-desk-0092）。0091 で RTE HTML 化したため service が description と
  // 同じ sanitize 経路を通す。@IsOptional は null も許容するため、空入力で null を送ると顛末をクリアできる。
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  tenmatsu?: string | null;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  // 説明（description）の宛先（メンション先）アカウント id 群（任意・複数可 / rete-desk-0116）。
  // description を指定した保存でのみ、説明面（field=DESCRIPTION）の宛先を差し替える。未指定なら据え置き
  // （顛末面 TENMATSU の宛先は本キーでは触らない＝面別の独立保存）。重複排除・存在検証は service が行う。
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  descriptionMentionAccountIds?: string[];

  // 顛末（tenmatsu）の宛先（メンション先）アカウント id 群（任意・複数可 / rete-desk-0116 Phase B）。
  // tenmatsu を指定した保存でのみ、顛末面（field=TENMATSU）の宛先を差し替える。未指定なら据え置き
  // （説明面 DESCRIPTION の宛先は本キーでは触らない＝面別の独立保存）。重複排除・存在検証は service が行う。
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  tenmatsuMentionAccountIds?: string[];
}
