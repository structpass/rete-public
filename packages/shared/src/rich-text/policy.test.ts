import { describe, it, expect } from 'vitest';
import {
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_ALLOWED_ATTR,
  RICH_TEXT_UNSAFE_URI_RE,
  RICH_TEXT_LINK_REL,
  RICH_TEXT_ALLOWED_STYLE_PROPERTIES,
  RICH_TEXT_SAFE_COLOR_VALUE_RES,
} from './policy';
// barrel 契約（criteria 16）: frontend/backend の sanitize フックは @rete/shared 直 import で
// これらを共有するため re-export 切れは XSS 面の即事故。src 相対で top-level index を叩く。
import * as sharedRoot from '../index';

describe('RICH_TEXT_ALLOWED_TAGS (criteria 12)', () => {
  it('①現在の20タグを凍結する', () => {
    expect(RICH_TEXT_ALLOWED_TAGS).toEqual([
      'p',
      'br',
      'strong',
      'em',
      's',
      'u',
      'del',
      'code',
      'pre',
      'h1',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'hr',
      'a',
      'mark',
      'span',
    ]);
    expect(RICH_TEXT_ALLOWED_TAGS).toHaveLength(20);
  });

  it('②危険タグを一切含まない（明示アサート）', () => {
    for (const forbidden of [
      'script',
      'img',
      'iframe',
      'style',
      'object',
      'embed',
      'form',
      'input',
      'svg',
      'link',
      'meta',
      'base',
    ]) {
      expect(RICH_TEXT_ALLOWED_TAGS).not.toContain(forbidden);
    }
  });
});

describe('RICH_TEXT_ALLOWED_ATTR (criteria 13)', () => {
  it('①現在の9属性を凍結する', () => {
    expect(RICH_TEXT_ALLOWED_ATTR).toEqual([
      'href',
      'target',
      'rel',
      'class',
      'style',
      'data-color',
      'data-type',
      'data-id',
      'data-label',
    ]);
    expect(RICH_TEXT_ALLOWED_ATTR).toHaveLength(9);
  });

  it('②on で始まる属性（イベントハンドラ）が1件も無い', () => {
    expect(RICH_TEXT_ALLOWED_ATTR.some((a) => a.toLowerCase().startsWith('on'))).toBe(false);
  });

  it('③src / srcdoc / formaction を含まない', () => {
    for (const forbidden of ['src', 'srcdoc', 'formaction']) {
      expect(RICH_TEXT_ALLOWED_ATTR).not.toContain(forbidden);
    }
  });
});

describe('RICH_TEXT_UNSAFE_URI_RE (criteria 14)', () => {
  it('①危険スキームにマッチする', () => {
    expect(RICH_TEXT_UNSAFE_URI_RE.test('javascript:alert(1)')).toBe(true);
    expect(RICH_TEXT_UNSAFE_URI_RE.test('  \tjavascript:alert(1)')).toBe(true); // 先頭空白・タブ
    expect(RICH_TEXT_UNSAFE_URI_RE.test('JavaScript:alert(1)')).toBe(true); // 大文字混在
    expect(RICH_TEXT_UNSAFE_URI_RE.test('data:text/html;base64,PHN2Zz4=')).toBe(true);
    expect(RICH_TEXT_UNSAFE_URI_RE.test('vbscript:msgbox(1)')).toBe(true);
  });

  it('②安全な URI にはマッチしない', () => {
    expect(RICH_TEXT_UNSAFE_URI_RE.test('https://example.com')).toBe(false);
    expect(RICH_TEXT_UNSAFE_URI_RE.test('http://example.com')).toBe(false);
    expect(RICH_TEXT_UNSAFE_URI_RE.test('mailto:a@example.com')).toBe(false);
    expect(RICH_TEXT_UNSAFE_URI_RE.test('/foo/bar')).toBe(false); // 相対
    expect(RICH_TEXT_UNSAFE_URI_RE.test('javascriptfoo')).toBe(false); // コロン無し
  });

  it('③.global === false（g 付きだと lastIndex で1回おきに false を返し sanitize フックの穴になる）', () => {
    expect(RICH_TEXT_UNSAFE_URI_RE.global).toBe(false);
  });

  it('④同一文字列に2回連続 .test() して両方 true（lastIndex 副作用が無い）', () => {
    const uri = 'javascript:alert(1)';
    expect(RICH_TEXT_UNSAFE_URI_RE.test(uri)).toBe(true);
    expect(RICH_TEXT_UNSAFE_URI_RE.test(uri)).toBe(true);
  });
});

describe('style 値ポリシー', () => {
  it('Tiptap が使う 2 プロパティだけを許可する', () => {
    expect(RICH_TEXT_ALLOWED_STYLE_PROPERTIES).toEqual(['color', 'background-color']);
  });

  it('正規の色値を許可し、URL・expression を許可しない', () => {
    const isSafe = (value: string) => RICH_TEXT_SAFE_COLOR_VALUE_RES.some((re) => re.test(value));
    expect(isSafe('#1a9c8b')).toBe(true);
    expect(isSafe('rgb(255, 235, 0)')).toBe(true);
    expect(isSafe('red')).toBe(true);
    expect(isSafe('url(https://attacker.example/pixel)')).toBe(false);
    expect(isSafe('expression(alert(1))')).toBe(false);
  });
});

describe('RICH_TEXT_LINK_REL (criteria 15)', () => {
  it('noopener noreferrer nofollow に厳密一致する', () => {
    expect(RICH_TEXT_LINK_REL).toBe('noopener noreferrer nofollow');
  });

  it('noopener と noreferrer を含む', () => {
    expect(RICH_TEXT_LINK_REL).toContain('noopener');
    expect(RICH_TEXT_LINK_REL).toContain('noreferrer');
  });
});

describe('barrel 契約 (criteria 16)', () => {
  it('top-level index が sanitize 定数4本を re-export している', () => {
    expect(sharedRoot.RICH_TEXT_ALLOWED_TAGS).toBe(RICH_TEXT_ALLOWED_TAGS);
    expect(sharedRoot.RICH_TEXT_ALLOWED_ATTR).toBe(RICH_TEXT_ALLOWED_ATTR);
    expect(sharedRoot.RICH_TEXT_UNSAFE_URI_RE).toBe(RICH_TEXT_UNSAFE_URI_RE);
    expect(sharedRoot.RICH_TEXT_LINK_REL).toBe(RICH_TEXT_LINK_REL);
    expect(sharedRoot.RICH_TEXT_ALLOWED_STYLE_PROPERTIES).toBe(RICH_TEXT_ALLOWED_STYLE_PROPERTIES);
    expect(sharedRoot.RICH_TEXT_SAFE_COLOR_VALUE_RES).toBe(RICH_TEXT_SAFE_COLOR_VALUE_RES);
  });
});
