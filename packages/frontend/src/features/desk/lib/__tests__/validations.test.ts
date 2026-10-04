import { describe, it, expect } from 'vitest';
import {
  validateThemeInput,
  validateMessageInput,
  richTextLength,
  THEME_TITLE_MAX,
  CHAT_BODY_MAX,
} from '../validations';

describe('richTextLength', () => {
  it('HTML タグを除いた可視テキスト長を返す', () => {
    expect(richTextLength('<p>あいう</p>')).toBe(3);
    expect(richTextLength('<p><strong>太字</strong>と<em>斜体</em></p>')).toBe(5);
  });

  it('空タグ・空白のみは 0', () => {
    expect(richTextLength('<p></p>')).toBe(0);
    expect(richTextLength('<p>   </p>')).toBe(0);
    expect(richTextLength('')).toBe(0);
  });

  it('entity を復元してから数える', () => {
    expect(richTextLength('<p>a&amp;b</p>')).toBe(3);
  });
});

describe('validateThemeInput', () => {
  it('タイトルがあれば null（説明は任意）', () => {
    expect(validateThemeInput({ title: '在庫の相談' })).toBeNull();
    expect(validateThemeInput({ title: '在庫の相談', description: '本文' })).toBeNull();
  });

  it('空白のみのタイトルはエラー', () => {
    expect(validateThemeInput({ title: '   ' })).toBe('タイトルを入力してください');
    expect(validateThemeInput({ title: '' })).toBe('タイトルを入力してください');
  });

  it('タイトルが上限超過でエラー', () => {
    expect(validateThemeInput({ title: 'あ'.repeat(THEME_TITLE_MAX + 1) })).toContain(
      `${THEME_TITLE_MAX}文字以内`,
    );
  });

  it('説明が上限超過でエラー', () => {
    expect(
      validateThemeInput({ title: 'ok', description: 'あ'.repeat(CHAT_BODY_MAX + 1) }),
    ).toContain(`${CHAT_BODY_MAX}文字以内`);
  });
});

describe('validateMessageInput', () => {
  it('本文があれば null', () => {
    expect(validateMessageInput('返信します')).toBeNull();
  });

  it('空白のみはエラー', () => {
    expect(validateMessageInput('   ')).toBe('メッセージを入力してください');
  });

  it('上限超過でエラー', () => {
    expect(validateMessageInput('あ'.repeat(CHAT_BODY_MAX + 1))).toContain(
      `${CHAT_BODY_MAX}文字以内`,
    );
  });
});
