'use client';

import { useEffect, useRef } from 'react';

/**
 * Escape を document 段階で「消費」してローカル UI（メニュー / モーダル）だけを閉じる共通フック。
 * desk の Escape は 2 層構造（window 段 = desk-shell の closeAllGuarded によるオーバーレイ一括クローズ ／
 * document 段 = ローカル消費）を持ち、本フックは後者専用。stopPropagation で window 段への伝播を
 * 遮断してから onEscape を呼ぶため、「メニューだけ閉じるつもりが詳細画面ごと閉じる」二重発火を防ぐ。
 * 閉じ起動のみ（遮断なし）が要る場合は、desk 内なら window 段（desk-shell の closeAllGuarded）、
 * desk 外なら共通 primitive の OverlayDialog が担う（closeAllGuarded は desk-shell 専用）。かつて
 * 対になる「遮断なしの Esc 閉じ」フックがあったが参照ゼロのまま残っていたため撤去した
 * （cmn-0186・役割が正反対のため統合しないと決めた経緯は cmn-0106）。
 *
 * - IME 変換確定の Esc（isComposing）は無視する（誤閉じ防止）。
 * - enabled=false の間はリスナー未登録。ネスト確認ダイアログ表示中に親モーダルを閉じさせない
 *   ガード（AlertDialog 側の ESC を優先）は enabled 条件で表現する。
 * - capture=true で capture 段購読（document body へ portal するモーダル等、bubble 段では
 *   遮断が間に合わない配置向け）。
 * - guardSelector 指定時、keydown 時点で document.querySelector(selector) がマッチしたら
 *   何もせず early return（stopPropagation も onEscape も呼ばない）。ネスト確認ダイアログ
 *   (AlertDialog = role="alertdialog") 表示中に親編集モードを閉じない用途（cmn-0113）。
 * - onEscape は latest-ref パターン（useRef で保持）で参照を捕捉するため、呼び出し側が
 *   インライン arrow 関数を渡しても親の再レンダーでリスナーが再購読されない（cmn-0113）。
 *
 * スタック意味論（cmn-0280）: 複数の enabled インスタンスが同時に存在する場合、最後に enabled に
 * なった層（スタック末尾）だけが Escape を消費する。先に有効だった層は stopPropagation せず
 * return し、window 段（desk-shell 一括クローズ）にも到達させない。スタックは Escape 押下では
 * 進まない（push / splice は mount / unmount / 依存変化時のみ走る）ので、末尾層の onEscape が
 * 自分自身の enabled を切るか自身を unmount する副作用を起こさない限り、同じ末尾層が何度も
 * 発火する。同一描画タイミングで複数層が同時に有効化された場合の順序は React の実行順（≒ 登録順）
 * に依存する。実運用は「ある層を開いてから次を開く」シーケンス＋各 onEscape が自身を閉じる
 * 副作用を担うため問題ない。
 *
 * onEscape の責務: 末尾層の onEscape は、自分自身を閉じる（enabled を false にする、または
 * 自身を unmount する）副作用を必ず起こすこと。これを満たさないと Esc を連打しても同じ層が
 * 連続発火する。既存呼び出し元 14 箇所はいずれも state を閉じるコードを持つため契約を満たす。
 */
// スタック末尾一致判定は token のみで行う（cmn-0280 で capture 差は捨てた設計）。
// capture は listener 登録位置（addEventListener の第三引数）にだけ使い、判定には持ち込まない。
const stack: { token: object; guardSelector?: string; onEscape: () => void }[] = [];

export function useEscapeConsume(
  onEscape: () => void,
  {
    enabled = true,
    capture = false,
    guardSelector,
  }: { enabled?: boolean; capture?: boolean; guardSelector?: string } = {},
): void {
  // onEscape の最新参照を保持（latest-ref パターン）。deps に入れないことで親再レンダー時の
  // リスナー再購読 churn を防ぐ。コールバックの同期着脱は StrictMode でもクリーンアップで成立する。
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!enabled) return;
    // 一意トークン（オブジェクト参照）で自インスタンスを識別する。末尾追加→cleanup で splice 除去。
    // 離脱は常に末尾とは限らない（後から有効化された層が中段に残る）。
    const token = {};
    stack.push({ token, guardSelector, onEscape: () => onEscapeRef.current() });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      // 自分がスタック末尾か判定する。非末尾は stopPropagation せず return（window 段へも流さない＝
      // 下の層だけを残す挙動を安定化させるため）。
      const top = stack[stack.length - 1];
      if (!top || top.token !== token) return;
      // ガードセレクタにマッチする要素があれば消費しない（stopPropagation もしない＝
      // 下位の AlertDialog などの既存ハンドラへバブラーへ流す。下層インスタンスへの代行もしない）。
      if (top.guardSelector && document.querySelector(top.guardSelector)) return;
      e.stopPropagation();
      top.onEscape();
    };
    document.addEventListener('keydown', onKey, capture);
    return () => {
      document.removeEventListener('keydown', onKey, capture);
      const idx = stack.findIndex((e) => e.token === token);
      if (idx >= 0) stack.splice(idx, 1);
    };
  }, [enabled, capture, guardSelector]);
}
