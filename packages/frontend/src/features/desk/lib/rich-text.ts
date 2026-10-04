import DOMPurify from 'dompurify';
import {
  RICH_TEXT_ALLOWED_ATTR,
  RICH_TEXT_ALLOWED_STYLE_PROPERTIES,
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_LINK_REL,
  RICH_TEXT_SAFE_COLOR_VALUE_RES,
  RICH_TEXT_UNSAFE_URI_RE,
} from '@rete/shared';

/** 検索ハイライト（cmn-0093 で共通基盤 `@/lib/highlight` へ移設・re-export で既存 import 元を維持）。 */
export { highlightRichText } from '@/lib/highlight';

/**
 * リッチテキスト本文（Tiptap 出力 HTML）の描画 sanitize（ADR 0019 多層防御の client 層）。
 * 保存済み HTML を `dangerouslySetInnerHTML` で描画する直前に必ず通す。許可リストは `@rete/shared` の
 * sanitize ポリシーを単一ソースとして共有する（backend 保存時 sanitize と同一）。
 */

let linkHookRegistered = false;

/** リンク硬化フック（javascript: 等の遮断 + rel/target 強制）を一度だけ登録する。 */
function ensureLinkHook(): void {
  if (linkHookRegistered) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (RICH_TEXT_UNSAFE_URI_RE.test(href)) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', RICH_TEXT_LINK_REL);
    }
    if (node instanceof HTMLElement && node.hasAttribute('style')) {
      const allowedProperties = new Set<string>(RICH_TEXT_ALLOWED_STYLE_PROPERTIES);
      for (let i = node.style.length - 1; i >= 0; i -= 1) {
        const property = node.style.item(i).toLowerCase();
        const value = node.style.getPropertyValue(property).trim();
        const valueIsSafe = RICH_TEXT_SAFE_COLOR_VALUE_RES.some((re) => re.test(value));
        if (!allowedProperties.has(property) || !valueIsSafe) node.style.removeProperty(property);
      }
      if (node.style.length === 0) node.removeAttribute('style');
    }
  });
  linkHookRegistered = true;
}

/** HTML を共有ポリシーで sanitize する。nullish は空文字を返す。 */
export function sanitizeRichText(dirty: string | null | undefined): string {
  if (!dirty) return '';
  ensureLinkHook();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
    ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR,
  });
}

/**
 * リッチテキスト HTML を「素の本文テキスト」へ落とし込む（dsk-0339: タスク検索の対象拡張 / dsk-0342: SSR fallback 整合）。
 *
 * 検索の keyword 一致判定など、**タグや属性には反応せず**本文ノードのテキストだけを見たい用途に使う。
 * DOMParser があれば body.textContent（属性値は無視・エンティティは自動デコード）で取り、無ければ簡易
 * タグ剥がし＋最低限のエンティティ復元へフォールバックする（SSR/初期描画など DOM 不在時の保険）。
 * &nbsp; と連続 whitespace は 1 つの半角スペースへ畳み、前後の空白も trim する（call 側で
 * `.includes(kw)` に流しやすい形に正規化）。
 *
 * DOMParser 経路はタグ／属性値を本文に混ぜない。fallback は正規表現ベースのため、属性値内に
 * 生の `>` を含む病的入力などでは完全ではない（sanitize 済み Tiptap HTML を前提とした保険）。
 */
export function richTextToPlainText(rich: string | null | undefined): string {
  if (!rich) return '';
  let text: string;
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(rich, 'text/html');
    text = doc.body.textContent ?? '';
  } else {
    // SSR/Node など DOMParser 不在時のフォールバック（dsk-0342）。
    // タグを機械的に剥がしたうえで、ブラウザ textContent と揃えるため最低限のエンティティを復元する。
    // &amp; は最後にデコードし、&amp;lt; が < へ二重展開されないようにする。
    text = decodeBasicHtmlEntities(rich.replace(/<[^>]*>/g, ''));
  }
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** fallback 用: 検索 plain 化に必要な最低限の HTML エンティティを対応文字へ戻す（&amp; は最後）。 */
function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&');
}
