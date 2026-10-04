/**
 * sanitize 済 HTML からタグを除去し、空白を畳んだ先頭 max 文字を抜粋として返す（超過は「…」を付す）。
 *
 * announcement 一覧の概要（ANNOUNCEMENT_EXCERPT_MAX_LENGTH=40）と、タスク履歴のコメント抜粋
 * （TASK_COMMENT_ACTIVITY_EXCERPT_MAX_LENGTH=140 / dsk-0269）の両方から呼ばれる共通ヘルパ
 * （元は announcement.mapper.ts のローカル実装。2 箇所目の利用で §3 コピペ禁止に従いここへ抽出）。
 * 入力は sanitizeRichText 済みの HTML を前提とする（生 HTML の無害化は本関数の責務ではない）。
 */
export function toExcerpt(html: string, max: number): string {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&') // &amp; のデコードは最後（二重デコード防止）
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
