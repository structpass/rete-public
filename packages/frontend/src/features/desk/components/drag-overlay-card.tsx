'use client';

import type { DragTheme } from '../hooks/use-chat-promotion';

/**
 * DragOverlay 内に表示するドラッグ中カードの見た目（§4.2 drag-overlay-card）。
 * 元のチャット明細カードは .is-dragging でゴースト化（opacity 0.5）し、ポインタに追従する
 * このカードが実体を担う。明細行 .desk-chat-card と同意匠（行レイアウト / タイトル省略）にしつつ、
 * フロート中とわかるよう teal ボーダー + 影 + カード背景だけを上掛けする。
 */
export function DragOverlayCard({
  theme,
  leftOffsetRem = 0,
}: {
  theme: DragTheme;
  /**
   * dsk-0236: タスク明細の行移動プレビューをドロップ指標（シャドウ）基準へ右寄せする補正量(rem)。
   * DragOverlay はカード左をドラッグ元行の左端へ合わせるが、タスク行のタイトル列は
   * 行左端から 5.25rem（padding 0.5 + checkbox 1.25 + gap 0.25 + #列 3 + gap 0.25）右にある一方、
   * カードのタイトルは card-padding 0.75rem 右にしかないため、補正なしだと 4.5rem 左へ突出する。
   * 4.5rem 右へ寄せると depth0 でシャドウと一致し、ネスト行は depth インデント分だけ「わずかに左」に収まる。
   * 既定 0（昇格＝チャットカードのプレビューは従来どおり補正なし）。
   */
  leftOffsetRem?: number;
}) {
  return (
    <div
      className="desk-chat-card pointer-events-none w-[min(20rem,80vw)]"
      style={{
        backgroundColor: 'var(--sp-card)',
        border: '1px solid var(--sp-accent-teal)',
        borderRadius: '0.375rem',
        boxShadow: '4px 6px 12px -4px rgba(0,0,0,0.35)',
        cursor: 'grabbing',
        opacity: 0.7,
        marginLeft: leftOffsetRem ? `${leftOffsetRem}rem` : undefined,
      }}
    >
      <div className="desk-chat-card-title-row">
        <span className="desk-chat-card-title">{theme.title}</span>
      </div>
    </div>
  );
}
