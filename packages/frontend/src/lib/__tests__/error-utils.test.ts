import { describe, it, expect } from 'vitest';
import { extractValidationErrorMessage } from '../error-utils';

/**
 * backend の AllExceptionsFilter は class-validator の失敗で message を generic な 'Validation failed' にし、
 * どの項目がどう悪いかを details.validationErrors[] へ入れる。この詳細を優先して取り出せることを固定する
 * （v2-198: 保存失敗時に固定文言だけを出して理由を捨てていた）。
 */
describe('extractValidationErrorMessage', () => {
  it('validationErrors が 1 件なら、その日本語の理由を返す', () => {
    const err = {
      response: {
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: { validationErrors: ['拡張子は ".pdf" の形式で指定してください'] },
          },
        },
      },
    };
    expect(extractValidationErrorMessage(err, '設定の保存に失敗しました')).toBe(
      '拡張子は ".pdf" の形式で指定してください',
    );
  });

  it('validationErrors が複数なら、全部を並べて返す（どの項目がどう悪いか分かる）', () => {
    const err = {
      response: {
        data: {
          error: {
            message: 'Validation failed',
            details: {
              validationErrors: [
                '拡張子は 50 件までです',
                '拡張子は ".pdf" の形式で指定してください',
              ],
            },
          },
        },
      },
    };
    expect(extractValidationErrorMessage(err, '設定の保存に失敗しました')).toBe(
      '拡張子は 50 件までです / 拡張子は ".pdf" の形式で指定してください',
    );
  });

  it('詳細が無い generic な Validation failed は英語のまま出さず fallback へ倒す', () => {
    const err = { response: { data: { error: { message: 'Validation failed' } } } };
    expect(extractValidationErrorMessage(err, '設定の保存に失敗しました')).toBe(
      '設定の保存に失敗しました',
    );
  });

  it('validationErrors が空配列でも fallback へ倒す', () => {
    const err = {
      response: {
        data: { error: { message: 'Validation failed', details: { validationErrors: [] } } },
      },
    };
    expect(extractValidationErrorMessage(err, '設定の保存に失敗しました')).toBe(
      '設定の保存に失敗しました',
    );
  });

  it('検証以外の業務メッセージはそのまま返す（BadRequest の日本語等）', () => {
    const err = {
      response: { data: { error: { code: 'BAD_REQUEST', message: '上限を超えています' } } },
    };
    expect(extractValidationErrorMessage(err, '設定の保存に失敗しました')).toBe(
      '上限を超えています',
    );
  });

  it('想定外の形（レスポンス無し・文字列以外の要素）は fallback へ倒す', () => {
    expect(extractValidationErrorMessage(new Error('network'), '設定の保存に失敗しました')).toBe(
      '設定の保存に失敗しました',
    );
    expect(
      extractValidationErrorMessage(
        { response: { data: { error: { details: { validationErrors: [123, null] } } } } },
        '設定の保存に失敗しました',
      ),
    ).toBe('設定の保存に失敗しました');
  });
});
