'use client';

// モック .desk-thread-comment-avatar / .desk-thread-head-author の配色。投稿者ごとに固定の 1 色を
// 割り当てる（name/id ハッシュ → パレット選択）。チャット詳細（投稿者）とタスク詳細（担当者）で
// 共有する単一ソース（architecture-invariants §3 コピペ回避）。
const AVATAR_PALETTE = ['var(--sp-accent-teal)', '#5b6bd6', '#8d5cf6', '#d97757'];

export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function avatarInitial(name: string): string {
  const t = name.trim();
  // Array.from で先頭 1 文字（日本語のサロゲートペアも 1 文字として扱う）。
  return t ? Array.from(t)[0].toUpperCase() : '?';
}

/** 起点カードのメタ行アバター（mock .desk-thread-head-author 相当 / 丸・配色は name ハッシュ）。 */
export function Avatar({
  author,
  size,
  dataTestid,
}: {
  author: { id: string; name: string };
  size: number;
  dataTestid?: string;
}) {
  // dataTestid は optional。詳細画面のように 1 画面に 1 つの Avatar があり exact match
  // 安定性が欲しいテストでは呼び出し側で prefix 込みの識別子（例: 'dashboard-detail-avatar'）
  // を指定する。チャットスレッドのように 1 画面に複数 Avatar がある場合は未指定で OK
  // （一覧側は head 等別要素で識別する方針・cmn-0284 LOW 3 対応）。
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: `${size}rem`,
        height: `${size}rem`,
        fontSize: '0.6875rem',
        color: 'white',
        background: avatarColor(author.id),
      }}
      aria-hidden="true"
      data-testid={dataTestid}
    >
      {avatarInitial(author.name)}
    </span>
  );
}
