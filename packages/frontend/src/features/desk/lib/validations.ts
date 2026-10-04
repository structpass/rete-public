// backend DTO（create-chat-theme / create-chat-message）と同じ上限値。
export const THEME_TITLE_MAX = 500;
export const CHAT_BODY_MAX = 5000;

/**
 * リッチテキスト（HTML）の可視テキスト長。本文が HTML 化（RTE）したため、文字数上限は
 * タグを除いた見た目の文字数で測る（ユーザ体感の「N 文字」と一致させる）。タグ除去 + 代表的な
 * entity の復元 + 連続空白の畳み込みで概算する（厳密な DOM パースは不要・MVP）。
 */
export function richTextLength(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length;
}

/** リッチテキストが実質空（タグのみ・空白のみ）か。送信ボタンの活性判定にも使う（検証ロジックと単一ソース）。 */
export function isRichTextEmpty(html: string | undefined): boolean {
  return !html || richTextLength(html) === 0;
}

/** チャット明細の投稿欄バリデーション。問題なければ null、あればエラーメッセージ。 */
export function validateThemeInput(input: { title: string; description?: string }): string | null {
  const title = input.title.trim();
  if (!title) return 'タイトルを入力してください';
  if (title.length > THEME_TITLE_MAX) {
    return `タイトルは${THEME_TITLE_MAX}文字以内で入力してください`;
  }
  if (
    input.description &&
    !isRichTextEmpty(input.description) &&
    richTextLength(input.description) > CHAT_BODY_MAX
  ) {
    return `説明は${CHAT_BODY_MAX}文字以内で入力してください`;
  }
  return null;
}

/** スレッド返信のバリデーション。問題なければ null。 */
export function validateMessageInput(body: string): string | null {
  if (isRichTextEmpty(body)) return 'メッセージを入力してください';
  if (richTextLength(body) > CHAT_BODY_MAX) {
    return `メッセージは${CHAT_BODY_MAX}文字以内で入力してください`;
  }
  return null;
}
