import { IsString, Matches, MaxLength } from 'class-validator';
import { REACTION_EMOJI_RE, REACTION_EMOJI_MAX_LEN } from '@rete/shared';

/**
 * リアクションのトグル付与（テーマ／メッセージ共通）。emoji は任意の Unicode 絵文字を許可するが
 * （rete-desk-0094）、任意テキスト混入・過大入力を防ぐため @rete/shared の REACTION_EMOJI_RE
 * （絵文字構成文字のみ）と最大長で硬化する（§5 shared 型整合：両側 import）。
 */
export class CreateReactionDto {
  @IsString()
  @MaxLength(REACTION_EMOJI_MAX_LEN)
  // 絵文字以外（任意テキスト / 制御文字 / HTML）を弾く。許可形式は shared を SSOT とする。
  @Matches(REACTION_EMOJI_RE, { message: 'emoji must be a valid emoji' })
  emoji!: string;
}
