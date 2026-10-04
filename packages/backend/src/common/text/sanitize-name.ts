import { BadRequestException } from '@nestjs/common';

/**
 * マスタ名（タグ名 / 権限名 等）の保存・表示に安全な正規化（§3 共通化: 2 モジュール目の法則）。
 *
 * 除去対象:
 *   C0 制御文字 + DEL（U+0000-U+001F, U+007F）/ C1 制御文字（U+0080-U+009F）/
 *   ゼロ幅・BiDi 制御（U+200B-U+200F, U+202A-U+202E, U+2060-U+206F, U+FEFF）。
 * BiDi override 等は UI 上の表示文字列を反転させ別マスタへの偽装に使えるため、保存前に落とす。
 * U+2060-U+206F は word joiner / 不可視演算子 / isolate に加え非推奨の書式制御（U+206A-U+206F）まで含める。
 *
 * 旧 tags.service.ts の private sanitizeName を抽出し、roles（権限名・説明）と共有する。
 * 不可視文字をソースに直書きしないよう、文字クラスは `\\u` エスケープ文字列から RegExp を構成する。
 */
const INVISIBLE_CHARS = new RegExp(
  '[' +
    '\\u0000-\\u001f\\u007f' + // C0 制御文字 + DEL
    '\\u0080-\\u009f' + // C1 制御文字
    '\\u200b-\\u200f' + // ゼロ幅スペース 〜 LRM/RLM
    '\\u202a-\\u202e' + // BiDi 埋め込み / override
    '\\u2060-\\u206f' + // word joiner / 不可視演算子 / isolate / 非推奨書式制御
    '\\ufeff' + // BOM / ZWNBSP
    ']',
  'g',
);

/**
 * 不可視・制御文字を除去して前後空白を詰める（空文字を許容・長さ検証なし）。
 * 任意入力の説明文（description 等）向け。必須・長さ確定が要る名前は sanitizeDisplayName を使う。
 */
export function stripInvisibleChars(raw: string): string {
  return raw.replace(INVISIBLE_CHARS, '').trim();
}

/**
 * 必須マスタ名（タグ名 / 権限名）の正規化。不可視除去 + trim 後に非空・上限長を再検証する
 * （DTO の Length は raw 文字列に対する粗検証で、trim 後の実効長はここで最終確定する）。
 */
export function sanitizeDisplayName(raw: string, opts: { maxLen: number; label: string }): string {
  const name = stripInvisibleChars(raw);
  if (!name) {
    throw new BadRequestException(`${opts.label}が不正です`);
  }
  if (name.length > opts.maxLen) {
    throw new BadRequestException(`${opts.label}は ${opts.maxLen} 文字以内で入力してください`);
  }
  return name;
}
