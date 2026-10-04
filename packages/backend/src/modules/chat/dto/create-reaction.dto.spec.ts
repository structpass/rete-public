import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReactionDto } from './create-reaction.dto';

/**
 * CreateReactionDto の検証境界テスト（rete-desk-0094）。
 * 任意 Unicode 絵文字（ZWJ 合字・肌色トーン・異体字セレクタ・国旗）を受理しつつ、
 * 任意テキスト / HTML / 制御文字 / 過大入力を拒否する（REACTION_EMOJI_RE + MaxLength を SSOT 共有）。
 */
async function errorsFor(emoji: unknown) {
  const dto = plainToInstance(CreateReactionDto, { emoji });
  return validate(dto);
}

describe('CreateReactionDto', () => {
  it.each(['👍', '❤️', '😄', '🎉', '🥹', '🫶', '👍🏽', '👩‍💻', '🇯🇵'])(
    '絵文字 %s を受理すること（合字・肌色・国旗含む）',
    async (emoji) => {
      expect(await errorsFor(emoji)).toHaveLength(0);
    },
  );

  it.each(['', 'a', 'あ', 'hello', '1', '<b>x</b>', '👍 ', ' 👍', '👍x'])(
    '非絵文字 %p を拒否すること',
    async (emoji) => {
      const errors = await errorsFor(emoji);
      expect(errors.some((e) => e.property === 'emoji')).toBe(true);
    },
  );

  it('過大入力（64 code point 超）を拒否すること', async () => {
    // validator.js isLength / 正規表現 {1,64} はいずれも code point 単位。👍×65 = 65 code point で上限超過。
    const errors = await errorsFor('👍'.repeat(65));
    expect(errors.some((e) => e.property === 'emoji')).toBe(true);
  });

  it('emoji が文字列でなければ拒否すること', async () => {
    expect((await errorsFor(123)).some((e) => e.property === 'emoji')).toBe(true);
  });
});
