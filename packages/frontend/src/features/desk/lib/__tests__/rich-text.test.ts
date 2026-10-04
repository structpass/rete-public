import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitizeRichText, highlightRichText, richTextToPlainText } from '../rich-text';

/**
 * 描画 sanitize（ADR 0019 多層防御の client 層）の安全性テスト。
 * Tiptap 出力の正当な書式は保ち、XSS 経路（script / event handler / javascript: link）は封鎖する。
 */
describe('sanitizeRichText', () => {
  it('<script> を除去しつつ本文テキストは残す', () => {
    const out = sanitizeRichText('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain('hi');
    expect(out).not.toContain('<script');
    expect(out.toLowerCase()).not.toContain('alert');
  });

  it('許可外タグ（img）と event handler 属性を除去', () => {
    const out = sanitizeRichText('<img src=x onerror="alert(1)">text');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror');
    expect(out).toContain('text');
  });

  it('javascript: スキームのリンクを無害化', () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out).toContain('x');
  });

  it('安全なリンクは残し rel/target を硬化', () => {
    const out = sanitizeRichText('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it('Tiptap の基本書式（マーク/リスト/引用）を保持', () => {
    const html =
      '<p><strong>b</strong> <em>i</em> <s>x</s></p><ul><li>a</li></ul><blockquote>q</blockquote>';
    const out = sanitizeRichText(html);
    expect(out).toContain('<strong>');
    expect(out).toContain('<em>');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>');
    expect(out).toContain('<blockquote>');
  });

  it('ハイライト（mark data-color）/ 色 span を保持', () => {
    const out = sanitizeRichText(
      '<mark data-color="#FEF08A" style="background-color: #FEF08A">h</mark>' +
        '<span style="color: #DC2626">c</span>',
    );
    expect(out).toContain('<mark');
    expect(out).toContain('data-color="#FEF08A"');
    expect(out).toContain('<span');
    expect(out).toContain('background-color: #FEF08A');
    expect(out).toContain('color: #DC2626');
  });

  it('任意 CSS を除去し、許可された色だけを保持する', () => {
    const out = sanitizeRichText(
      '<span style="position:fixed;inset:0;background-image:url(https://attacker.example/pixel);color:#DC2626">x</span>',
    );
    expect(out).not.toContain('position');
    expect(out).not.toContain('inset');
    expect(out).not.toContain('background-image');
    expect(out).not.toContain('attacker.example');
    expect(out).toContain('color: rgb(220, 38, 38)');
  });

  it('null / undefined / 空文字は空文字を返す', () => {
    expect(sanitizeRichText(null)).toBe('');
    expect(sanitizeRichText(undefined)).toBe('');
    expect(sanitizeRichText('')).toBe('');
  });
});

/**
 * 本文（説明欄）の検索語ハイライト（rete-desk-0048・cmn-0093で共通基盤へ移設）。タイトルだけでなく
 * RTE HTML 本文の一致箇所も薄い黄色（.sp-search-hl）で包む。タグ・属性は壊さず、テキストノードだけに適用する。
 */
describe('highlightRichText', () => {
  it('プレーン本文の一致箇所を <mark class="sp-search-hl"> で包む', () => {
    const out = highlightRichText('<p>在庫の確認をお願いします</p>', '在庫');
    expect(out).toContain('<mark class="sp-search-hl">在庫</mark>');
    expect(out).toContain('の確認をお願いします');
  });

  it('大文字小文字を無視して一致させる（表示は原文のまま）', () => {
    const out = highlightRichText('<p>Hello TEST world</p>', 'test');
    expect(out).toContain('<mark class="sp-search-hl">TEST</mark>');
  });

  it('タグ名・属性にはマッチさせない（HTML を壊さない）', () => {
    // query="p" でも <p> タグや属性ではなく本文中の "p" だけを包む。
    const out = highlightRichText('<p>apple</p>', 'p');
    expect(out).toContain('<p>'); // タグ自体は無傷（属性化・破壊なし）
    expect(out).toContain(
      'a<mark class="sp-search-hl">p</mark><mark class="sp-search-hl">p</mark>le',
    );
  });

  it('書式タグ（strong / リンク）を保持したままテキストだけハイライト', () => {
    const out = highlightRichText('<p><strong>在庫</strong> と 在庫</p>', '在庫');
    expect(out).toContain('<strong>');
    // strong 内の在庫・後ろの在庫がそれぞれ別テキストノードとして包まれる。
    expect((out.match(/sp-search-hl/g) ?? []).length).toBe(2);
  });

  it('複数一致を全て包む', () => {
    const out = highlightRichText('<p>aXaXa</p>', 'a');
    expect((out.match(/sp-search-hl/g) ?? []).length).toBe(3);
  });

  it('query 空 / undefined / 一致なしは入力をそのまま返す', () => {
    expect(highlightRichText('<p>x</p>', '')).toBe('<p>x</p>');
    expect(highlightRichText('<p>x</p>', undefined)).toBe('<p>x</p>');
    expect(highlightRichText('<p>x</p>', '  ')).toBe('<p>x</p>');
    expect(highlightRichText('<p>x</p>', 'zzz')).toBe('<p>x</p>');
  });

  it('query を HTML として解釈しない（XSS を持ち込まない）', () => {
    // 一致しない HTML らしき query を渡しても生タグは挿入されない。
    const out = highlightRichText('<p>safe</p>', '<img src=x>');
    expect(out).not.toContain('<img');
    expect(out).toBe('<p>safe</p>');
  });
});

/**
 * 本文（説明欄/顛末）の素テキスト抽出（dsk-0339: タスク検索のキーワード拡張 / dsk-0342: SSR fallback）。
 *
 * 検索 keyword 比較のための plain text 化で、HTML タグ・属性を結果に含めない（= "class" 等に
 * 誤マッチしない）ことが要件。DOMParser 経路は textContent で属性値を拾わない。fallback は
 * 正規表現ベースで属性値内の病的入力までは完全ではない。
 */
describe('richTextToPlainText', () => {
  it('タグとエンティティを展開して本文だけ返す', () => {
    expect(richTextToPlainText('<p>在庫の<strong>確認</strong>お願いします</p>')).toBe(
      '在庫の確認お願いします',
    );
  });

  it('タグ名・属性値は本文扱いしない（誤マッチ防止）', () => {
    // "class" や "color" は本文に含まれない文字列。タグ属性として存在しても拾われない。
    const html = '<p class="note" style="color:red">本文</p>';
    expect(richTextToPlainText(html)).toBe('本文');
  });

  it('&nbsp; と連続 whitespace を 1 つの半角スペースに畳む', () => {
    expect(richTextToPlainText('<p>在庫&nbsp;&nbsp;の   確認</p>')).toBe('在庫 の 確認');
  });

  it('null / undefined / 空文字は空文字を返す', () => {
    expect(richTextToPlainText(null)).toBe('');
    expect(richTextToPlainText(undefined)).toBe('');
    expect(richTextToPlainText('')).toBe('');
  });

  it('ネスト／複数タグ／リスト要素も本文だけを残す', () => {
    const html =
      '<ul><li>入荷確認</li><li><em>出荷</em>の段取り</li></ul><blockquote>顛末</blockquote>';
    const out = richTextToPlainText(html);
    expect(out).toContain('入荷確認');
    expect(out).toContain('出荷の段取り');
    expect(out).toContain('顛末');
    expect(out).not.toContain('<');
  });

  it('本文中の HTML エンティティを対応文字へデコードする（DOMParser 経路）', () => {
    expect(richTextToPlainText('<p>A &amp; B &lt;C&gt; &quot;x&quot; &apos;y&apos;</p>')).toBe(
      'A & B <C> "x" \'y\'',
    );
  });
});

/**
 * SSR / DOMParser 不在時の fallback 分岐（dsk-0342）。
 * vitest は jsdom 固定のため vi.stubGlobal で DOMParser を無効化し分岐を強制する。
 */
describe('richTextToPlainText fallback (DOMParser absent)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('最低限の HTML エンティティをデコードして返す', () => {
    vi.stubGlobal('DOMParser', undefined);
    expect(richTextToPlainText('<p>A &amp; B &lt;C&gt; &quot;x&quot; &apos;y&apos;</p>')).toBe(
      'A & B <C> "x" \'y\'',
    );
    // 数値実体 &#39; も &apos; と同様にアポストロフィへ
    expect(richTextToPlainText('<p>it&#39;s</p>')).toBe("it's");
  });

  it('&amp; を最後にデコードし二重展開しない（&amp;lt; → &lt; のまま）', () => {
    vi.stubGlobal('DOMParser', undefined);
    expect(richTextToPlainText('<p>&amp;lt;not-a-tag&amp;gt;</p>')).toBe('&lt;not-a-tag&gt;');
  });

  it('&nbsp; と連続 whitespace を 1 つの半角スペースに畳む', () => {
    vi.stubGlobal('DOMParser', undefined);
    expect(richTextToPlainText('<p>在庫&nbsp;&nbsp;の   確認</p>')).toBe('在庫 の 確認');
  });

  it('タグを剥がして本文だけ返す', () => {
    vi.stubGlobal('DOMParser', undefined);
    expect(richTextToPlainText('<p>在庫の<strong>確認</strong>お願いします</p>')).toBe(
      '在庫の確認お願いします',
    );
  });

  it('DOMParser 有無で同一入力の素テキストが一致する', () => {
    const html = '<p class="note">在庫 &amp; 確認&nbsp;済</p>';
    const withDom = richTextToPlainText(html);
    vi.stubGlobal('DOMParser', undefined);
    const withoutDom = richTextToPlainText(html);
    expect(withoutDom).toBe(withDom);
    expect(withDom).toBe('在庫 & 確認 済');
  });
});
