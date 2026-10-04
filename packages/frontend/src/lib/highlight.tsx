import type { ReactNode } from 'react';

/**
 * 検索語ハイライトの共通基盤（cmn-0093・元は Desk チャット専用実装 rete-desk-0048）。
 * plain テキスト向け highlightMatches と、sanitize 済み HTML 向け highlightRichText を提供する。
 * どちらも一致箇所を `<mark class="sp-search-hl">`（薄い黄色）で包む共通クラスを使う。
 */

/** ハイライト用の共通 mark クラス名（globals.css .sp-search-hl と対）。 */
export const SEARCH_HIGHLIGHT_CLASS = 'sp-search-hl';

/**
 * テキスト中の検索語一致箇所を `<mark class="sp-search-hl">` で包んで返す。
 * query 空/未指定ならプレーンな text を返す。大文字小文字を無視して全一致箇所を分割する。
 */
export function highlightMatches(text: string, query?: string): ReactNode {
  const q = query?.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i <= text.length) {
    const idx = lower.indexOf(lowerQ, i);
    if (idx === -1) {
      if (i < text.length) parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={key++} className={SEARCH_HIGHLIGHT_CLASS}>
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return parts;
}

/**
 * sanitize 済みリッチテキスト HTML の「テキストノードだけ」に検索語ハイライトを差し込む。
 * タグ名・属性には一切マッチさせず、一致テキストを `<mark class="sp-search-hl">` で包む。
 * query 空/未指定・一致なしは入力をそのまま返す。
 *
 * 設計上の制約: テキストノード単位で走査するため、書式タグで分断された語（例: 太字で割れた「在<strong>庫</strong>」）は
 * ハイライトしない（既知の仕様制限）。入力は **sanitize 済み HTML 前提**（呼び出し側が sanitize → 本関数の順で呼ぶ）。
 * 挿入は固定の mark 要素のみで、query は createTextNode 経由でしか扱わない（HTML として解釈しない）ため XSS を持ち込まない。
 * DOM 非対応環境（SSR）では入力をそのまま返し、クライアント側の再描画でハイライトされる。
 */
export function highlightRichText(cleanHtml: string, query?: string | null): string {
  const q = query?.trim();
  if (!q || !cleanHtml || typeof DOMParser === 'undefined') return cleanHtml;

  // 速い棄却: query を一切含まない HTML は DOMParser を回さずそのまま返す。検索は毎打鍵で可視
  // メッセージ分呼ばれるため（debounce 外）、非一致が大半のケースで parse/serialize 往復を省く。
  // タグ・属性に偶然 query が含まれると guard を通過するが、後段のテキストノード走査が空振りして
  // 元 HTML 相当を返すため結果は不変（最適化が効かないだけ）。
  const lowerQ = q.toLowerCase();
  if (!cleanHtml.toLowerCase().includes(lowerQ)) return cleanHtml;

  const doc = new DOMParser().parseFromString(cleanHtml, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue && n.nodeValue.toLowerCase().includes(lowerQ)) targets.push(n as Text);
  }
  if (targets.length === 0) return doc.body.innerHTML;

  for (const node of targets) {
    const text = node.nodeValue ?? '';
    const lower = text.toLowerCase();
    const frag = doc.createDocumentFragment();
    let i = 0;
    for (let idx = lower.indexOf(lowerQ, i); idx !== -1; idx = lower.indexOf(lowerQ, i)) {
      if (idx > i) frag.appendChild(doc.createTextNode(text.slice(i, idx)));
      const mark = doc.createElement('mark');
      mark.className = SEARCH_HIGHLIGHT_CLASS;
      mark.textContent = text.slice(idx, idx + q.length);
      frag.appendChild(mark);
      i = idx + q.length;
    }
    if (i < text.length) frag.appendChild(doc.createTextNode(text.slice(i)));
    node.parentNode?.replaceChild(frag, node);
  }

  return doc.body.innerHTML;
}
