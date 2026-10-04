'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SmilePlus } from 'lucide-react';
import { type ReactionEmoji, type ReactionSummary } from '@rete/shared';
import { useOutsideClose } from '@/hooks/use-outside-close';
import { useRecentEmojis } from '../hooks/use-recent-emojis';
import { computeFlipPosition } from '../lib/compute-flip-position';
import { ReactionPicker } from './reaction-picker';

/**
 * リアクションバー（モック .desk-reaction-bar 移植）。既存リアクションを {emoji,count} チップで表示し、
 * 「リアクションを追加」ボタンで絵文字ピッカー（REACTION_EMOJIS 固定セット）を開く。チップ / ピッカー
 * 選択はいずれも onToggle を呼ぶ（付与・解除を backend が判定）。reactedByMe のチップは視覚ハイライト。
 * チャット起点テーマカード・各返信メッセージ・タスクコメント（dsk-0297）で共有（§6 同型 UI ロジックの
 * hook/コンポーネント抽出）。元は chat-thread.tsx にローカル定義されていたものを共有コンポーネント化した。
 */
export function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: ReactionSummary[];
  onToggle: (emoji: ReactionEmoji) => Promise<unknown>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  // ピッカーの fixed 配置座標（rete-desk-0136）。従来はスクロール容器（.desk-pane-body）内の絶対配置で、
  // overflow:auto にクリップされ「スレッド最上部メッセージでバー（候補）が見切れる」差し戻しが繰り返した
  // （上下フリップでは短いスレッドで両側とも収まらない）。body 直下 portal + fixed でビューポート基準に配置し
  // クリップを根本回避する（メンション候補 rete-desk-0135 と同方式）。null の間は未計測（画面外へ退避）。
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { recent, push: pushRecent } = useRecentEmojis();

  // anchor（＋ボタン）の現在位置からピッカーの fixed 座標を算出する。上を優先し、上に収まらなければ下へ
  // フリップ、どちらも無理なら viewport 内へクランプ（算法は computeFlipPosition へ集約・dsk-0369）。
  // 実寸が測れない初回はフォールバック寸法で見積もる。
  const computePosition = () => {
    const btn = addBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const ph = pickerRef.current?.offsetHeight || 290;
    const pw = pickerRef.current?.offsetWidth || 240;
    setPos(
      computeFlipPosition(r, { width: pw, height: ph }, { preferAbove: true, margin: 8, gap: 6 }),
    );
  };

  const handleTogglePicker = () => setPickerOpen((o) => !o);

  // 開いている間: 初回計測（+次フレームで実寸再計測）、スクロール/リサイズ追従。
  // 外側クリック / Escape 閉じは useOutsideClose へ統合（brd-0227）。
  useEffect(() => {
    if (!pickerOpen) {
      setPos(null);
      return;
    }
    computePosition();
    const raf = requestAnimationFrame(computePosition);
    const onReposition = () => computePosition();
    // スクロールは capture で拾い、内側スクロール容器の移動にも追従させる。
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
    // computePosition は毎 render 生成だが内部で最新 ref を読むため依存は pickerOpen のみで足りる。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen]);

  // ピッカーは portal で body 直下へ出るため、内側判定は root（＋ボタン側）と picker の 2 つ。
  useOutsideClose({
    active: pickerOpen,
    refs: [rootRef, pickerRef],
    onClose: () => setPickerOpen(false),
    eventType: 'pointerdown',
  });

  const handleToggle = async (emoji: ReactionEmoji) => {
    if (busy) return;
    setBusy(true);
    setPickerOpen(false);
    try {
      await onToggle(emoji);
      // 成功した付与/解除のみ「最近使った」へ反映（失敗時は汚さない・rete-desk-0094）。
      pushRecent(emoji);
    } finally {
      setBusy(false);
    }
  };

  // count 0 は表示しない（空リアクションは描画しない）。
  const visible = reactions.filter((r) => r.count > 0);

  return (
    <div className="desk-reaction-bar" ref={rootRef}>
      {visible.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`desk-reaction-chip${r.reactedByMe ? ' is-reacted' : ''}`}
          aria-pressed={r.reactedByMe}
          aria-label={`${r.emoji} ${r.count}件${r.reactedByMe ? '（自分が押した）' : ''}`}
          disabled={busy}
          onClick={() => void handleToggle(r.emoji as ReactionEmoji)}
        >
          <span className="desk-reaction-chip-emoji" aria-hidden="true">
            {r.emoji}
          </span>
          <span className="desk-reaction-chip-count">{r.count}</span>
        </button>
      ))}

      <div className="desk-reaction-picker-anchor">
        <button
          ref={addBtnRef}
          type="button"
          className="desk-reaction-add"
          title="リアクションを追加"
          aria-label="リアクションを追加"
          aria-haspopup="true"
          aria-expanded={pickerOpen}
          disabled={busy}
          onClick={handleTogglePicker}
        >
          <SmilePlus aria-hidden="true" className="h-4 w-4" />
        </button>
        {/* ピッカーは body 直下 portal + fixed（rete-desk-0136）。スクロール容器の overflow クリップを
            回避するためアンカーの DOM 階層からは切り離し、computePosition の算出座標へ固定配置する。
            pos 未計測（初回 1 フレーム）は visibility:hidden で画面外チラ見せを防ぐ。 */}
        {pickerOpen &&
          createPortal(
            <div
              ref={pickerRef}
              style={{
                position: 'fixed',
                left: pos?.left ?? -9999,
                top: pos?.top ?? -9999,
                zIndex: 10060,
                visibility: pos ? 'visible' : 'hidden',
              }}
            >
              <ReactionPicker
                recent={recent}
                busy={busy}
                floating
                onSelect={(emoji) => void handleToggle(emoji)}
              />
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
