'use client';

import { sanitizeRichText, highlightRichText } from '../lib/rich-text';

interface RichTextViewProps {
  /** 保存済みリッチテキスト HTML（plain text も可）。null/空は何も描画しない。 */
  html: string | null | undefined;
  className?: string;
  /**
   * 検索語ハイライト（rete-desk-0048）。指定時、本文中の一致箇所を `<mark class="sp-search-hl">`（薄い黄色）で包む。
   * **sanitize 後**に適用するため XSS 多層防御は維持される（空/未指定でハイライトなし）。
   */
  highlight?: string;
}

/**
 * 保存済みリッチテキスト HTML を sanitize して描画する（ADR 0019 多層防御の client 描画層）。
 * `dangerouslySetInnerHTML` を使う唯一の経路に sanitize を強制集約し、本文表示箇所はすべて本コンポーネント
 * を経由させる（タスク説明 / チャットテーマ説明 / メッセージ本文）。highlight 指定時は sanitize 済み HTML の
 * テキストノードだけに検索語ハイライトを差し込む（タグ・属性は壊さない / rete-desk-0048）。
 */
export function RichTextView({ html, className, highlight }: RichTextViewProps) {
  const clean = sanitizeRichText(html);
  if (!clean) return null;
  const rendered = highlightRichText(clean, highlight);
  return <div className={className} dangerouslySetInnerHTML={{ __html: rendered }} />;
}
