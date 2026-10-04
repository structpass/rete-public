import sanitizeHtml from 'sanitize-html';
import {
  RICH_TEXT_ALLOWED_ATTR,
  RICH_TEXT_ALLOWED_STYLE_PROPERTIES,
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_LINK_REL,
  RICH_TEXT_SAFE_COLOR_VALUE_RES,
} from '@rete/shared';

/**
 * リッチテキスト（HTML）保存時の sanitize（ADR 0019 / 多層防御の保存側）。
 * 描画側（frontend rich-text.ts = DOMPurify）と同一の共有ポリシー（@rete/shared の
 * 許可タグ/属性）を用いる。エンジンは環境別: ブラウザ描画は DOMPurify、サーバ保存は
 * 純JS の sanitize-html（jsdom を引き込まず軽量・単体テスト容易）。信頼境界は
 * 「保存時に毒を入れない」こと。
 *
 * - 許可タグ/属性外は除去（共有ポリシー）
 * - リンクは安全スキーム（http/https/mailto）のみ残し、rel/target を強制
 *   （javascript:/data:/vbscript: は allowedSchemes 外として href ごと落ちる）
 * - style 属性は値もホワイトリストする（allowedStyles）。Tiptap Color/Highlight が出力する
 *   color / background-color のみ・かつ安全な値形式（hex / rgb(a) / hsl(a) / 名前色）に限定し、
 *   `background:url(javascript:…)` や `expression()` 等を値レベルで遮断する（backend 単独でも安全に）。
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...RICH_TEXT_ALLOWED_TAGS],
  // DOMPurify の flat な ALLOWED_ATTR に合わせ、全タグ共通で許可する。
  allowedAttributes: { '*': [...RICH_TEXT_ALLOWED_ATTR] },
  // style の値はプロパティ単位でホワイトリスト。許可外プロパティ（background / behavior 等）は値ごと除去。
  allowedStyles: {
    '*': Object.fromEntries(
      RICH_TEXT_ALLOWED_STYLE_PROPERTIES.map((property) => [
        property,
        RICH_TEXT_SAFE_COLOR_VALUE_RES,
      ]),
    ),
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // 危険スキームを href に持つリンクは属性ごと除去（タグ・テキストは保持）。
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: RICH_TEXT_LINK_REL }, true),
  },
};

/**
 * 保存対象の HTML を sanitize する。null/undefined/空はそのまま素通し
 * （未入力を保持・正規化はフロント側で済む）。
 */
export function sanitizeRichText<T extends string | null | undefined>(dirty: T): T {
  if (dirty == null || dirty === '') return dirty;
  return sanitizeHtml(dirty, SANITIZE_OPTIONS) as T;
}
