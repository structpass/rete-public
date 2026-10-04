import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_REJECTED_EXTENSIONS } from '../files.constants';
import { UpdateFileSettingsDto } from './files-settings.dto';

/**
 * UpdateFileSettingsDto の検証境界テスト（v2-197）。
 *
 * 拒否拡張子は管理者が画面から入れる値で、そのままアップロードの判定に使う。上限・形式を DTO で閉じ、
 * 弾いた理由を画面へ出せるよう文言を日本語で固定する（レビュー指摘 F3。class-validator の既定文言は英語で、
 * 「どの項目がどう悪いか」を利用者へ返せない）。
 */
async function errorsFor(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateFileSettingsDto, body);
  return validate(dto);
}

/** 指定プロパティの検証メッセージ一覧を返す。 */
async function messagesFor(property: string, body: Record<string, unknown>) {
  const errors = await errorsFor(body);
  return errors
    .filter((e) => e.property === property)
    .flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('UpdateFileSettingsDto（v2-197）', () => {
  it('拒否拡張子を省略できる（部分更新・据え置き）', async () => {
    expect(await errorsFor({ maxSizeBytes: 1024 })).toHaveLength(0);
  });

  it('".pdf" 形式の配列と空配列を受理する', async () => {
    expect(await errorsFor({ rejectedExtensions: ['.exe', '.ps1'] })).toHaveLength(0);
    expect(await errorsFor({ rejectedExtensions: [] })).toHaveLength(0);
  });

  it(`拒否拡張子 ${MAX_REJECTED_EXTENSIONS} 件までを受理する`, async () => {
    const rejectedExtensions = Array.from({ length: MAX_REJECTED_EXTENSIONS }, (_, i) => `.e${i}`);
    expect(await errorsFor({ rejectedExtensions })).toHaveLength(0);
  });

  it('件数上限を超えたら日本語で弾く', async () => {
    const rejectedExtensions = Array.from(
      { length: MAX_REJECTED_EXTENSIONS + 1 },
      (_, i) => `.e${i}`,
    );
    expect(await messagesFor('rejectedExtensions', { rejectedExtensions })).toContain(
      `拡張子は ${MAX_REJECTED_EXTENSIONS} 件までです`,
    );
  });

  it('配列でなければ日本語で弾く', async () => {
    expect(await messagesFor('rejectedExtensions', { rejectedExtensions: '.exe' })).toContain(
      '拡張子は配列で指定してください',
    );
  });

  it('要素が文字列でなければ日本語で弾く', async () => {
    expect(await messagesFor('rejectedExtensions', { rejectedExtensions: [1] })).toContain(
      '拡張子は文字列で指定してください',
    );
  });

  it('20 文字を超える要素は日本語で弾く', async () => {
    // '.' + 'a'×20 = 21 文字。形式は合っているので長さの検証だけが落ちる。
    const tooLong = `.${'a'.repeat(20)}`;
    expect(await messagesFor('rejectedExtensions', { rejectedExtensions: [tooLong] })).toContain(
      '拡張子は 20 文字までです',
    );
  });

  it.each(['pdf', '*', '.p df', '.ps1;rm', ''])('".pdf" 形式でない %p を弾く', async (value) => {
    expect(await messagesFor('rejectedExtensions', { rejectedExtensions: [value] })).toContain(
      '拡張子は ".pdf" の形式で指定してください',
    );
  });
});
