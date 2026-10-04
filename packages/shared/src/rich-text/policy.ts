/**
 * リッチテキスト本文（Tiptap 出力 HTML）の sanitize ポリシー。
 *
 * frontend の描画 sanitize（dompurify）と backend の保存時 sanitize（isomorphic-dompurify）の
 * 双方が本ポリシーを単一ソースとして共有する（architecture-invariants §3 コピペ禁止 / §5 shared 型の使用）。
 * 許可リストは StarterKit（v3）+ Highlight / Color / TextStyle が出力するタグ・属性に対応する。
 * ADR 0019 参照。
 */

/** 許可タグ。img / iframe / script / style 要素などは一切許可しない（本文に不要かつ XSS 面）。 */
export const RICH_TEXT_ALLOWED_TAGS: string[] = [
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
];

/**
 * 許可属性。`style` は色/ハイライト（Color / Highlight）の inline style 用。DOMPurify が style 値を
 * CSS サニタイズするため危険プロパティは除去される。`data-color` は Highlight 拡張のカラー属性。
 * `data-type` / `data-id` / `data-label` は Mention 拡張（@メンション / rete-desk-0080）の round-trip 用。
 * いずれも inert な data 属性で XSS 経路を持たない。
 */
export const RICH_TEXT_ALLOWED_ATTR: string[] = [
  'href',
  'target',
  'rel',
  'class',
  'style',
  'data-color',
  'data-type',
  'data-id',
  'data-label',
];

/**
 * style 属性で許可するプロパティ。Tiptap Color / Highlight が出力する 2 種だけを許可し、
 * position / display / background-image 等による画面改変・外部 URL 読み込みを遮断する。
 */
export const RICH_TEXT_ALLOWED_STYLE_PROPERTIES = ['color', 'background-color'] as const;

/**
 * 許可する色値。backend の保存時 sanitize と frontend の描画時 sanitize が共有する。
 * CSS 関数や named color の許容範囲を広げる場合は、両 sanitize の回帰テストも同時に更新する。
 */
export const RICH_TEXT_SAFE_COLOR_VALUE_RES: RegExp[] = [
  /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
  /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
  /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/,
  /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/,
  /^[a-zA-Z]+$/,
];

/**
 * リンク href で遮断する危険スキーム。`javascript:` / `data:` / `vbscript:` は XSS 経路のため除去する。
 * frontend / backend の sanitize フックが本正規表現を共有して href を硬化する。
 */
export const RICH_TEXT_UNSAFE_URI_RE = /^\s*(javascript|data|vbscript):/i;

/** リンクに強制付与する rel（タブナビゲーション奪取・リファラ漏洩・SEO 汚染を防ぐ）。 */
export const RICH_TEXT_LINK_REL = 'noopener noreferrer nofollow';
