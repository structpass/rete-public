/**
 * 表示名（Account.name）と 姓/名（familyName / givenName）の相互変換（set-0096）。
 *
 * 分割: 先頭の半角/全角スペースで区切る。区切りが無ければ全体を familyName、givenName は空。
 * 組み立て: givenName が非空なら半角スペースで連結、空なら familyName のみ。
 *
 * 招待受諾・migration backfill と同一アルゴリズムを使う（コピペ禁止）。
 */

export interface SplitDisplayName {
  familyName: string;
  givenName: string;
}

/** 表示名を姓・名に分割する（先頭の空白で1回だけ分割）。 */
export function splitDisplayName(displayName: string): SplitDisplayName {
  const trimmed = displayName.trim();
  const match = /^(\S+)[\u0020\u3000]+([\s\S]*)$/u.exec(trimmed);
  if (!match) {
    return { familyName: trimmed, givenName: '' };
  }
  return {
    familyName: match[1],
    givenName: match[2].trim(),
  };
}

/** 姓・名から表示名を組み立てる（givenName が空なら familyName のみ）。 */
export function composeDisplayName(familyName: string, givenName: string): string {
  const family = familyName.trim();
  const given = givenName.trim();
  if (!given) return family;
  return `${family} ${given}`;
}
