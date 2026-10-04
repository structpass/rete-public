'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useEscapeConsume } from './use-escape-consume';

/**
 * 浮遊 popover の「外側 click / Esc で閉じる」共通ロジック（dsk-0358 で抽出）。
 *
 * 背景: useFilterPopover（hom-0080）／ToggleFilter（portal 使用）／DeskMemberPicker の floating 版
 * （dsk-0308）の 3 箇所が同じ「open 中だけ document の click と keydown を監視し、ref 配列のいずれかの
 * 内側以外なら onClose を呼ぶ」パターンを重複実装していた。DeskMemberPicker だけ outside-click
 * 閉じが抜け落ちており Desk 内の挙動一貫性が崩れていた（criteria: 「＋」再クリックと同じ閉じ経路を
 * 共通化する）。本 hook で 3 箇所を単一の正規実装へ寄せる（architecture-invariants §3: 2 モジュール目
 * 相当の複製を 3 モジュール目追加前に共通化）。
 *
 * dsk-0310 ガード継承: 別ウィンドウへフォーカスが移った後、自ウィンドウへフォーカスが戻った際に
 * document.body への click が synthesize される既知の経路では、focus 移動由来とみなして早期 return
 * する（popup が意図せず閉じる回帰を防ぐ）。ページ内の別要素（button 等）は body 直下ではないので
 * contains 判定で従来通り閉じる。
 *
 * 複数 ref 対応: ToggleFilter は trigger と portal 描画 popup の 2 つの DOM 内側領域を持つ。
 * useFilterPopover / DeskMemberPicker は 1 つ。`refs` を配列で受けることで両方の形状に対応する。
 *
 * Esc 閉じは useEscapeConsume へ委譲（dsk-0371）: stopPropagation + isComposing ガード付きの
 * ローカル消費で、「picker だけ閉じるつもりがオーバーレイごと閉じる」二重閉じと IME 変換取消 Esc
 * での誤閉じを防ぐ。本 hook は outside-click 監視のみを自前で持つ。
 *
 * eventType オプション（brd-0227）: Desk の各種メニュー 6 箇所は手書きで `pointerdown` を購読して
 * いた（押した瞬間に閉じる）。click 固定のままでは寄せると閉じるタイミングが変わるため、購読する
 * イベント種別を選べるようにして 6 箇所を本 hook へ統合する。既定は `click` で既存 3 箇所は不変。
 *
 * トレードオフ（cmn-0217）: `eventType: 'pointerdown'` を選ぶと上記 dsk-0310 ガードは適用外になる
 * （synthesize されるのは click だけで pointerdown には対応するイベントが無く、body 直押しでも閉じる）。
 * pointerdown を選ぶ側は「押した瞬間に閉じる」即応性を取り、フォーカス復帰時の誤閉じリスクを受け入れる
 * 契約になる。ガードの on/off スイッチは設けない（それを要する呼び出し元が無く、選択肢を増やすと誤用面
 * だけが増えるため）。
 */
export function useOutsideClose({
  active,
  refs,
  onClose,
  eventType = 'click',
}: {
  /** popover 開閉状態。true の間だけ listener を attach。 */
  active: boolean;
  /** 「内側」とみなす DOM の ref 配列。target がこれらのいずれか contains なら閉じない。 */
  refs: RefObject<HTMLElement | null>[];
  /** 外側 click / Esc を検知した時に呼ぶコールバック。 */
  onClose: () => void;
  /**
   * 外側判定に使う document イベント。既定 `click`（離した瞬間）。`pointerdown` は押した瞬間に
   * 閉じる Desk 系メニュー向けで、その場合 dsk-0310 ガードは適用外（上記トレードオフ参照）。
   * 引数名は `event`（グローバル `window.event`）との shadow を避けて `eventType`（cmn-0217）。
   */
  eventType?: 'click' | 'pointerdown';
}): void {
  // Esc はローカル消費フックへ委譲（dsk-0371）: stopPropagation で desk-shell の window 段
  // 一括クローズへの伝播を遮断し、IME 変換中（isComposing）の Esc も無視する。
  useEscapeConsume(onClose, { enabled: active });

  // dsk-0397: onClose / refs の最新参照を ref で保持（latest-ref パターン・use-escape-consume と同型）。
  // 呼び出し元はいずれも inline arrow と inline 配列を渡すため、これらを deps に入れると
  // 親の再レンダーごとに listener の解除・再登録が走る。deps は active のみにして churn を止める。
  const onCloseRef = useRef(onClose);
  const refsRef = useRef(refs);
  useEffect(() => {
    onCloseRef.current = onClose;
    refsRef.current = refs;
  });

  useEffect(() => {
    if (!active) return;
    const onDocEvent = (e: Event) => {
      const t = e.target as Node;
      // dsk-0310: focus 移動由来の synthesize click を除外（コメントは hook 内に集約）。
      // synthesize は click 固有の経路なので pointerdown 購読時は素通しする（body 直押しでも閉じる）。
      if (eventType === 'click' && (t === document.body || t === document.documentElement)) return;
      const inside = refsRef.current.some((r) => r.current && r.current.contains(t));
      if (!inside) onCloseRef.current();
    };
    document.addEventListener(eventType, onDocEvent);
    return () => {
      document.removeEventListener(eventType, onDocEvent);
    };
  }, [active, eventType]);
}
