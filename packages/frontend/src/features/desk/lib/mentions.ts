/**
 * @ メンション共有ユーティリティ（rete-desk-0080 → dsk-0203 でチャット/タスク共有化）。
 * 旧実装は reply-composer.tsx に置かれチャット側 3 箇所が import していたが、タスク側
 * （説明/顛末/コメント）でも同一抽出が必要になったため lib へ抽出した（§3 コピペ禁止）。
 */

/**
 * 本文 HTML から Tiptap Mention ノード（data-type="mention"）の account id を重複排除で抽出する。
 * 抽出値は宛先（mentionAccountIds / descriptionMentionAccountIds / tenmatsuMentionAccountIds）として
 * 各 payload へ渡り、backend の From/To フィルタ（rete-desk-0049 / dsk-0203）を駆動する。
 * SSR（window 不在）や空 HTML は空配列を返す。
 */
export function extractMentionAccountIds(html: string): string[] {
  if (typeof window === 'undefined' || !html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ids: string[] = [];
  doc.querySelectorAll('[data-type="mention"]').forEach((el) => {
    const id = el.getAttribute('data-id');
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}
