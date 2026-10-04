'use client';

import { useCallback, useEffect, useState } from 'react';

/** 左ペインの view（モック setLeftView の差し替え対象）。 */
export type DeskLeftView = 'list' | 'detail' | 'promote';
/** 右ペインの view（モック setRightView の差し替え対象）。 */
export type DeskRightView = 'tree' | 'thread';

/** ガード未指定時の既定（常に許可）。default 引数で都度生成すると参照が変わり useCallback メモが無効化するため定数化。 */
const ALLOW_DISCARD = () => true;

interface UseDeskViewStateArgs {
  /** D&D 昇格ドラフトが立っているか（promote view の駆動源。hook 外の useChatPromotion が権威）。 */
  hasPromoteDraft: boolean;
  /** promote を閉じる（closeAll / 排他で left を畳む時に呼ぶ）。 */
  cancelPromotion: () => void;
  /**
   * 左ペインフォーム編集の破棄ガード（C-編集・DBT-7 / モック confirmDiscardEditing 移植）。
   * 左オーバーレイ（detail/promote/creating）を畳む全経路の先頭で呼ぶ。true=続行 / false=中断。
   * 編集中かの判定と確認ダイアログは呼び出し側（desk-shell）が担い、本 hook は DOM に触れない。
   * 既定は常に許可（未配線・テスト用）。
   */
  guardDiscard?: () => boolean;
}

export interface UseDeskViewStateResult {
  leftView: DeskLeftView;
  rightView: DeskRightView;
  /** 右ペインにオーバーレイ表示中のチャットテーマ id（null = tree）。 */
  selectedThemeId: string | null;
  /** 左ペインにオーバーレイ表示中のタスク id（null かつ promote / creating 無し = list）。 */
  selectedTaskId: number | null;
  /**
   * 最後に開いたチャットテーマ id（dsk-0401）。selectedThemeId が非 null になる度に書き写され、
   * 閉じて selectedThemeId が null に戻っても保持され続ける（別テーマを開くと上書き）。
   * チャット明細のアクティブ枠（.sp-row-ring）は「今開いているか」でなく本値で描く＝閉じても枠が残る。
   */
  lastActiveThemeId: string | null;
  /** 最後に開いたタスク id（dsk-0401）。lastActiveThemeId と同型・タスクツリーのアクティブ枠に使う。 */
  lastActiveTaskId: number | null;
  /**
   * アクティブ枠だけをチャットテーマへ動かす（開かない・dsk-0410）。キーボードナビの
   * 「詳細を閉じた状態の ↑↓ / ←→」がカーソル追従のために呼ぶ。反対ペインの枠は消す（単一カーソル）。
   */
  setActiveTheme: (themeId: string) => void;
  /** setActiveTheme のタスク版（dsk-0410）。 */
  setActiveTask: (taskId: number) => void;
  /**
   * タスク新規登録モード（モック setDetailCreatingMode の直交フラグ移植）。
   * true のとき selectedTaskId 無しでも leftView='detail' を creating variant で開く。
   */
  isCreatingTask: boolean;
  /**
   * グローバル入力欄を退避（非表示）すべきか。
   * モック不変条件: 入力欄が常駐するのは「左=list ∧ 右≠thread」の時だけ。それ以外は退避。
   */
  isInputEvacuated: boolean;
  /** チャットカードを開く。同 id 再クリックでトグル閉じ。左オーバーレイは排他で畳む。 */
  openThread: (themeId: string) => void;
  /** タスク行を開く。同 id 再クリックでトグル閉じ。右オーバーレイは排他で畳む。 */
  openTaskDetail: (taskId: number) => void;
  /** タスク新規登録モードに入る（モック openNewTicket）。開いていた他オーバーレイは排他で畳む。 */
  startCreatingTask: () => void;
  /** 左オーバーレイ（detail / promote）を閉じて list に戻す。 */
  closeLeft: () => void;
  /** 右オーバーレイ（thread）を閉じて tree に戻す。 */
  closeRight: () => void;
  /** 両ペインのオーバーレイを全て閉じる（モック closeAll）。 */
  closeAll: () => void;
  /** 右ペインに直接スレッドを開く（タスク詳細の「元チャット」リンク等、トグルしない単方向オープン）。 */
  setThread: (themeId: string) => void;
}

/**
 * Desk 2ペインの view 状態機械（モック setLeftView / setRightView の派生モデル移植 / A1）。
 *
 * source of truth は selectedThemeId / selectedTaskId / promoteDraft の有無の3つだけ。
 * leftView / rightView / isInputEvacuated はそこから一意に派生する（モックが2関数で別計算していた
 * is-evacuated を単一派生に統一し dual-codepath を避ける）。
 *
 * 排他（二重オーバーレイ禁止）: 片側のオーバーレイを開くアクションが反対側を必ず畳む。
 */
export function useDeskViewState({
  hasPromoteDraft,
  cancelPromotion,
  guardDiscard = ALLOW_DISCARD,
}: UseDeskViewStateArgs): UseDeskViewStateResult {
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // dsk-0401: アクティブ枠用の「最後に開いた id」。selectedThemeId/selectedTaskId（開閉そのものの
  // 状態＝A1 の source of truth）には一切触れず、非 null になった値を別 state へ書き写すだけの
  // 派生。閉じる経路（closeRight/closeLeft/closeAll 等）を通っても本 state は書き換わらないため、
  // 明細行のアクティブ枠は「今開いているか」でなく「最後に開いたのはどれか」で描かれ続ける。
  // dsk-0410: 枠は「Space で開閉する対象＝今アクティブな行」を示す単一カーソル。両ペイン合わせて
  // 常に最大1つだけ表示するため、片方をセットしたら必ずもう片方を null にする（相互排他）。
  const [lastActiveThemeId, setLastActiveThemeId] = useState<string | null>(null);
  const [lastActiveTaskId, setLastActiveTaskId] = useState<number | null>(null);

  // dsk-0410: 開かずに枠（カーソル）だけ動かす。詳細を閉じた状態の ↑↓ 行移動・←→ ペイン跨ぎが呼ぶ。
  // A1 の source of truth（selectedThemeId/selectedTaskId）には触れない＝開閉状態は変わらない。
  // 相互排他の実装はこの 2 関数だけに置き、開閉由来の追従（下の effect）もここへ寄せる（重複定義しない）。
  const setActiveTheme = useCallback((themeId: string) => {
    setLastActiveThemeId(themeId);
    setLastActiveTaskId(null);
  }, []);
  const setActiveTask = useCallback((taskId: number) => {
    setLastActiveTaskId(taskId);
    setLastActiveThemeId(null);
  }, []);

  useEffect(() => {
    if (selectedThemeId != null) setActiveTheme(selectedThemeId);
  }, [selectedThemeId, setActiveTheme]);
  useEffect(() => {
    if (selectedTaskId != null) setActiveTask(selectedTaskId);
  }, [selectedTaskId, setActiveTask]);

  // D&D ドロップで promoteDraft が立ったら、開いていた thread / detail / creating を畳む（単一オーバーレイ原則）。
  // promote は最前面に出るため、裏で thread/detail/creating が残ると二重オーバーレイになる。
  // 既知の制限（C-編集・DBT-7 のスコープ外）: 編集中の detail/creating があっても、D&D ドロップ（明示操作）
  // による昇格はここで破棄ガードを通さず畳む。ガードは onDragEnd 側に挟む必要があり、D&D フローを跨ぐため別途。
  useEffect(() => {
    if (hasPromoteDraft) {
      setSelectedThemeId(null);
      setSelectedTaskId(null);
      setIsCreatingTask(false);
    }
  }, [hasPromoteDraft]);

  // promote が detail より優先（D&D 直後は昇格フォームを最前面に）。creating も detail スロットを使う
  // （selectedTaskId 無しでも開く）。実描画の edit/creating 出し分けは isCreatingTask を見て呼び出し側が行う。
  const leftView: DeskLeftView = hasPromoteDraft
    ? 'promote'
    : selectedTaskId != null || isCreatingTask
      ? 'detail'
      : 'list';
  const rightView: DeskRightView = selectedThemeId != null ? 'thread' : 'tree';
  const isInputEvacuated = !(leftView === 'list' && rightView !== 'thread');

  // 左オーバーレイ（detail/promote/creating）が表示中か。表示中の畳み込みだけ破棄ガードの対象。
  const isLeftOverlayOpen = hasPromoteDraft || selectedTaskId != null || isCreatingTask;

  // 右ペインのみ閉じる（チャット詳細）。左フォームに関与しないため破棄ガード対象外。
  const closeRight = useCallback(() => setSelectedThemeId(null), []);

  const closeLeft = useCallback(() => {
    if (isLeftOverlayOpen && !guardDiscard()) return; // 編集中なら破棄確認（Cancel で中断）。
    setSelectedTaskId(null);
    setIsCreatingTask(false);
    if (hasPromoteDraft) cancelPromotion();
  }, [isLeftOverlayOpen, guardDiscard, hasPromoteDraft, cancelPromotion]);

  const openThread = useCallback(
    (themeId: string) => {
      // 左オーバーレイを畳んでスレッドを開く経路。畳む時だけ破棄ガード（list 起点のオープンは対象外）。
      if (isLeftOverlayOpen && !guardDiscard()) return;
      const willClose = selectedThemeId === themeId; // 同カード再クリック → トグル閉じ。
      setSelectedThemeId(willClose ? null : themeId);
      setSelectedTaskId(null);
      setIsCreatingTask(false);
      // 排他で左オーバーレイ（detail / promote）を畳むのは「開く」時だけ。
      // 閉じ操作で promote を巻き込まない（開いていた promote は閉じ操作の対象外）。
      if (!willClose && hasPromoteDraft) cancelPromotion();
    },
    [isLeftOverlayOpen, guardDiscard, selectedThemeId, hasPromoteDraft, cancelPromotion],
  );

  const setThread = useCallback(
    (themeId: string) => {
      // 単方向オープン（トグルしない）。promote 中なら排他で畳む（二重オーバーレイ禁止）。
      if (isLeftOverlayOpen && !guardDiscard()) return;
      if (hasPromoteDraft) cancelPromotion();
      setSelectedThemeId(themeId);
      setSelectedTaskId(null);
      setIsCreatingTask(false);
    },
    [isLeftOverlayOpen, guardDiscard, hasPromoteDraft, cancelPromotion],
  );

  const openTaskDetail = useCallback(
    (taskId: number) => {
      if (isLeftOverlayOpen && !guardDiscard()) return;
      const willClose = selectedTaskId === taskId; // 同行再クリック → トグル閉じ。
      if (!willClose && hasPromoteDraft) cancelPromotion();
      setSelectedTaskId(willClose ? null : taskId);
      setIsCreatingTask(false);
      // 排他: 右オーバーレイ（thread）を畳む。
      setSelectedThemeId(null);
    },
    [isLeftOverlayOpen, guardDiscard, selectedTaskId, hasPromoteDraft, cancelPromotion],
  );

  const startCreatingTask = useCallback(() => {
    if (isLeftOverlayOpen && !guardDiscard()) return;
    // モック openNewTicket: 既存タスク選択 / スレッドを解除し、新規登録モードで detail を開く。
    setIsCreatingTask(true);
    setSelectedTaskId(null);
    setSelectedThemeId(null); // mock の closeRight 相当（タスク明細を可視に戻す）
    if (hasPromoteDraft) cancelPromotion();
  }, [isLeftOverlayOpen, guardDiscard, hasPromoteDraft, cancelPromotion]);

  const closeAll = useCallback(() => {
    if (isLeftOverlayOpen && !guardDiscard()) return;
    setSelectedThemeId(null);
    setSelectedTaskId(null);
    setIsCreatingTask(false);
    if (hasPromoteDraft) cancelPromotion();
  }, [isLeftOverlayOpen, guardDiscard, hasPromoteDraft, cancelPromotion]);

  return {
    leftView,
    rightView,
    selectedThemeId,
    selectedTaskId,
    lastActiveThemeId,
    lastActiveTaskId,
    setActiveTheme,
    setActiveTask,
    isCreatingTask,
    isInputEvacuated,
    openThread,
    openTaskDetail,
    startCreatingTask,
    closeLeft,
    closeRight,
    closeAll,
    setThread,
  };
}
