'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useChatThemes } from '../hooks/use-chat-themes';
import { useChatThread } from '../hooks/use-chat-thread';
import { useTaskTree } from '../hooks/use-task-tree';
import { useDeskSpace } from '../hooks/desk-space-context';
import { useTaskDetail } from '../hooks/use-task-detail';
import { useChatPromotion, targetInsertLabel } from '../hooks/use-chat-promotion';
import { useTaskMove } from '../hooks/use-task-move';
import { useDeskViewState } from '../hooks/use-desk-view-state';
import { useDeskKeyboardNav } from '../hooks/use-desk-keyboard-nav';
import { useDeskTaskCreate } from '../hooks/use-desk-task-create';
import { useDeskSearch } from '../hooks/use-desk-search';
import { applyQuietFocus } from '../utils/quiet-focus';
import { useDiscardConfirm } from '@/hooks/use-discard-confirm';
import { useDeskPaneRatio } from '../hooks/use-desk-pane-ratio';
import { moveTask, type DeskTaskTree, type DeskTaskNode } from '../lib/api';
import { subtreeIds, findTaskNode } from '../lib/drop-projection';
import { buildDeskTreeRows } from '../lib/desk-tree-rows';
import { useCategories } from '@/features/tasks/hooks/use-categories';
import { useAccounts } from '@/features/tasks/hooks/use-accounts';
import { useSession } from '@/features/auth';
import { toCreatePayload, type ParentTaskOption } from '@/features/tasks/lib/api';
import type { TaskFormData } from '@/features/tasks/lib/validations';
import { ChatList } from './chat-list';
import { ChatThread } from './chat-thread';
import { DeskFilterToolbar } from './desk-filter-toolbar';
import { DeskTaskToolbar } from './desk-task-toolbar';
import { ThemeComposer } from './theme-composer';
import { TaskTree } from './task-tree';
import { TaskDetailOverlay } from './task-detail-overlay';
import { TaskCreateOverlay } from './task-create-overlay';
import { DragOverlayCard } from './drag-overlay-card';
import { DiscardConfirmDialog } from '@/components/ui/discard-confirm-dialog';
import { CategorySettingsDialog } from './category-settings-dialog';

/**
 * Desk タブの 2 ペインシェル（モック setLeftView / setRightView の差し替えモデル移植 / A1）。
 *
 * 左ペイン = チャット明細（data-left-view="list"・常時）。タスク選択でタスク詳細（"detail"）、
 * チャット D&D で昇格フォーム（"promote"）を同一ペイン内のビューとして差し替え表示（排他）。
 * 右ペイン = タスク明細ツリー（data-right-view="tree"・常時）。チャットテーマ選択でチャット詳細
 * スレッド（"thread"）に差し替え。左右どちらか一方しかオーバーレイしない（二重オーバーレイ禁止）。
 *
 * view の出典は selectedThemeId / selectedTaskId / promoteDraft の3つで、leftView / rightView /
 * 入力欄退避（is-evacuated）は useDeskViewState が一意に派生する。
 */
/** ツリーから task id のタイトルを引く（DragOverlay の単一行ゴースト用）。 */
function findTaskTitle(tree: DeskTaskTree | null, taskId: number | null): string | null {
  if (!tree || taskId == null) return null;
  const walk = (nodes: DeskTaskNode[]): string | null => {
    for (const n of nodes) {
      if (n.id === taskId) return n.title;
      const found = walk(n.children);
      if (found) return found;
    }
    return null;
  };
  for (const cat of tree.categories) {
    const found = walk(cat.tasks);
    if (found) return found;
  }
  return null;
}

/** ツリー全タスクを親 picker の候補（id / title / categoryId）へ平坦化する（表示順 DFS）。 */
function flattenParentOptions(tree: DeskTaskTree | null): ParentTaskOption[] {
  const opts: ParentTaskOption[] = [];
  if (!tree) return opts;
  const walk = (nodes: DeskTaskNode[]) => {
    for (const n of nodes) {
      opts.push({ id: n.id, title: n.title, categoryId: n.categoryId });
      walk(n.children);
    }
  };
  for (const cat of tree.categories) walk(cat.tasks);
  return opts;
}

export function DeskShell() {
  // 現在開いている器（Space）のスコープ（CM-2 / ADR 0037・サイドバー選択 → チャット明細 / タスク明細を絞る）。
  // A1 状態機械（use-desk-view-state）とは直交した別状態。未選択（null）＝全件＝従来どおり＝安全な中断点。
  const { selectedSpaceId } = useDeskSpace();

  const {
    themes,
    loading,
    error,
    refetch: refetchThemes,
    createTheme,
    setServerFilter: setChatServerFilter,
    markThemeReadLocal,
  } = useChatThemes();
  const {
    tree,
    loading: treeLoading,
    error: treeError,
    refetch: refetchTree,
    setTree,
  } = useTaskTree(selectedSpaceId ?? undefined);
  // 分類は選択中チャネル（Space）単位スコープ（rete-desk-0158）。spaceId 未確定の間は空配列。
  const { categories, reload: reloadCategories } = useCategories(selectedSpaceId);
  // 表示行の正本（dsk-0332）: 分類マスタと取得ツリーから、表示順の行・行 index・サブツリー最大深さを
  // ツリー更新時に1回だけ作る。D&D（移動 / 昇格）と親候補の除外集合がこの派生値を共有する。
  const treeRows = useMemo(() => buildDeskTreeRows(tree, categories), [tree, categories]);
  // 担当者候補は選択中チャネル（Space）のメンバーに絞る（dsk-0211 criteria 1）。useCategories と同じ
  // Space スコープ方針。spaceId 未確定の間は undefined＝全有効アカウントへフォールバック（詰み回避）。
  const { accounts } = useAccounts(undefined, selectedSpaceId ?? undefined);

  const promotion = useChatPromotion({
    rows: treeRows,
    refetchTree,
    refetchThemes,
    // 昇格タスクを選択中チャネルの器へ作成する（rete-desk-0175）。未選択（全件）時は undefined。
    spaceId: selectedSpaceId ?? undefined,
  });
  const {
    activeTheme,
    promoteDraft,
    provisionalRow,
    indicator: promoteIndicator,
    saving: promoteSaving,
    saveError: promoteError,
    savePromotion,
    cancelPromotion,
  } = promotion;

  // 統合検索/フィルタ（C-検索）。チャット明細は絞り込み配列、タスク明細は可視 id 集合として派生。
  const search = useDeskSearch({ themes, tree });

  // 左右ペイン幅のドラッグ変更 + 個人設定への永続化（rete-desk-0142）。
  const paneRatio = useDeskPaneRatio();

  // 分類マスタ設定モーダル（rete-desk-0140）。A1 状態機械（左右ペインのビュー差し替え）には載せない
  // 独立モーダル。変更後は分類 select / フィルタとタスクツリー（アーカイブで非表示が変わる）を取り直す。
  const [categorySettingsOpen, setCategorySettingsOpen] = useState(false);
  const openCategorySettings = useCallback(() => setCategorySettingsOpen(true), []);
  const closeCategorySettings = useCallback(() => setCategorySettingsOpen(false), []);
  const handleCategoriesChanged = useCallback(() => {
    void reloadCategories();
    void refetchTree();
  }, [reloadCategories, refetchTree]);

  // チャット明細のフィルタは全て server 絞り込みへ統一（A案）。状態は useDeskSearch が一元保持し、
  // 変更を useChatThemes へ push して再取得する。値が等価なら setServerFilter 側が再取得を抑止する。
  // keyword は連続入力でリクエストが多発しないよう 250ms デバウンスする（toggle 系も同遅延で許容）。
  useEffect(() => {
    const t = setTimeout(() => {
      setChatServerFilter({
        search: search.chatKeyword.trim() || undefined,
        archiveOnly: search.archiveOnly,
        tenmatsuOnly: search.chatTenmatsuOnly,
        mentionFrom: search.mentionFrom,
        mentionTo: search.mentionTo,
        // 器スコープ（CM-2）。検索フィルタと違い空判定（chatFiltered）には数えない＝スコープであってフィルタではない。
        spaceId: selectedSpaceId ?? undefined,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [
    search.chatKeyword,
    search.archiveOnly,
    search.chatTenmatsuOnly,
    search.mentionFrom,
    search.mentionTo,
    selectedSpaceId,
    setChatServerFilter,
  ]);

  const move = useTaskMove({ rows: treeRows, setTree, refetchTree });
  const { activeTaskId, indicator: moveIndicator } = move;

  // 昇格・移動どちらか進行中の方の緑枠を表示（同時には起きない）。
  const dropIndicator = activeTaskId != null ? moveIndicator : promoteIndicator;

  // DragOverlay に浮かす「ドラッグ中タスク 1 行」のタイトル（子は浮かさない）。
  // render 毎の DFS を避け tree / activeTaskId 変化時のみ再計算する（指摘[10]）。
  const activeMoveTitle = useMemo(() => findTaskTitle(tree, activeTaskId), [tree, activeTaskId]);

  // drag の種別（テーマ昇格 / タスク移動）を data.kind で分岐して各 hook に委譲する。
  // deps はメモ化オブジェクト全体（promotion / move）ではなく各 hook の安定な関数参照を渡す。
  // promotion.* / move.* は各 hook 内で useCallback 安定のため、内部 state 変化で再生成されない（指摘[6]）。
  // exhaustive-deps は member access を静的に追えずオブジェクト全体（promotion/move）を要求するが、
  // ここは意図的に関数参照のみを依存に取る（オブジェクト全体だと内部 state 変化で毎回再生成される）。
  /* eslint-disable react-hooks/exhaustive-deps */
  const handleDragStart = useCallback(
    (e: Parameters<typeof promotion.onDragStart>[0]) => {
      promotion.onDragStart(e);
      move.onDragStart(e);
    },
    [promotion.onDragStart, move.onDragStart],
  );
  const handleDragMove = useCallback(
    (e: Parameters<typeof promotion.onDragMove>[0]) => {
      promotion.onDragMove(e);
      move.onDragMove(e);
    },
    [promotion.onDragMove, move.onDragMove],
  );
  const handleDragEnd = useCallback(
    (e: Parameters<typeof promotion.onDragEnd>[0]) => {
      promotion.onDragEnd(e);
      move.onDragEnd(e);
    },
    [promotion.onDragEnd, move.onDragEnd],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // 左ペインフォーム（detail/create/promote）の編集中フラグ。各オーバーレイが onDirtyChange で報告する。
  // ref に持つことで guardDiscard を安定参照（deps 無し）に保ちつつ常に最新の dirty を読む（C-編集・DBT-7）。
  const leftDirtyRef = useRef(false);
  const reportLeftDirty = useCallback((dirty: boolean) => {
    leftDirtyRef.current = dirty;
  }, []);
  // 左フォームを畳む全経路の先頭ガード（モック confirmDiscardEditing 移植）。A1 状態機械が同期消費する
  // 純 dirty チェック。破棄確認ダイアログ（非同期）はエントリラッパ（下記 guardLeft）が担い、
  // 確認後は dirty を落としてから遷移を呼ぶため、ここを通る時点では常に true になる（rete-desk-0102）。
  const guardDiscard = useCallback(() => !leftDirtyRef.current, []);

  // 右ペイン（チャット詳細）のテーマ編集 dirty。左の leftDirtyRef / guardDiscard と対称（H3）。
  // ChatThread の onDirtyChange が報告する。× ボタンは ChatThread 内 handleClose が自前で破棄確認するが、
  // backdrop 余白クリック / ESC は desk-shell の閉じハンドラ経由のため、ここで対称にガードを足す。
  const rightDirtyRef = useRef(false);
  const reportRightDirty = useCallback((dirty: boolean) => {
    rightDirtyRef.current = dirty;
  }, []);

  // 破棄確認の Rete デザインダイアログ（rete-desk-0102・旧 window.confirm の置換）。左右共通で 1 インスタンス
  // （同時に開くオーバーレイは 1 枚なので保留アクションも 1 件）。各遷移はラッパ経由でこの request を通す。
  const discard = useDiscardConfirm();
  const { request: requestDiscard } = discard;

  const {
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
    closeRight,
    closeLeft,
    closeAll,
  } = useDeskViewState({ hasPromoteDraft: promoteDraft != null, cancelPromotion, guardDiscard });

  // 左オーバーレイ（detail/promote/creating）を畳む遷移の破棄ガード共通ラッパ（rete-desk-0102）。
  // dirty なら Rete ダイアログで破棄確認し、確認後に leftDirtyRef を落としてから遷移を実行する
  // （A1 状態機械は同期 guardDiscard を消費し続けるが、その時点では dirty=false で必ず通過する）。
  const guardLeft = useCallback(
    (proceed: () => void) =>
      requestDiscard(leftDirtyRef.current, () => {
        leftDirtyRef.current = false;
        proceed();
      }),
    [requestDiscard],
  );
  const guardedOpenThread = useCallback(
    (themeId: string) =>
      guardLeft(() => {
        // スレッドを開いた瞬間に楽観的既読化（題名太字を即時に落とす / rete-desk-0075）。
        // backend は detail GET の副作用で既読化するため、次回 refetch でサーバー値と整合する。
        markThemeReadLocal(themeId);
        openThread(themeId);
      }),
    [guardLeft, openThread, markThemeReadLocal],
  );
  const guardedOpenTaskDetail = useCallback(
    (taskId: number) => guardLeft(() => openTaskDetail(taskId)),
    [guardLeft, openTaskDetail],
  );
  const guardedStartCreatingTask = useCallback(
    () => guardLeft(() => startCreatingTask()),
    [guardLeft, startCreatingTask],
  );
  const guardedCloseLeft = useCallback(() => guardLeft(() => closeLeft()), [guardLeft, closeLeft]);

  // 親タスク picker（rete-desk-0068/0071/0072）の候補。新規作成は全タスクから選べる。
  // 詳細編集は自身＋子孫を除外（循環防止 / move endpoint と同じ subtreeIds ロジックを共有）。
  // 行は表示順の派生値（treeRows）を使い回す（dsk-0332: flattenTree の二重計算をやめる）。
  const allParentOptions = useMemo(() => flattenParentOptions(tree), [tree]);
  const detailParentOptions = useMemo(() => {
    if (selectedTaskId == null) return allParentOptions;
    const exclude = subtreeIds(treeRows.rows, selectedTaskId, treeRows);
    return allParentOptions.filter((o) => !exclude.has(o.id));
  }, [allParentOptions, treeRows, selectedTaskId]);

  // backdrop 余白クリック / ESC からの全閉じ。両ペインを畳むため左右いずれかが dirty なら破棄確認
  // （Rete ダイアログ / rete-desk-0102）。確認後は左右 dirty を落としてから closeAll（内部 guardDiscard は
  // 左 dirty=false で通過する / 左右対称ガード・H3）。
  const closeAllGuarded = useCallback(() => {
    requestDiscard(leftDirtyRef.current || rightDirtyRef.current, () => {
      leftDirtyRef.current = false;
      rightDirtyRef.current = false;
      closeAll();
    });
  }, [requestDiscard, closeAll]);

  // × ボタン経路（ChatThread 内 handleClose が自前で破棄確認済）。閉じる際に右 dirty を落として
  // 次に別スレッドを開く前の残骸（stale dirty）を防ぐ。確認は ChatThread 側で済むためここでは出さない。
  const handleCloseThread = useCallback(() => {
    rightDirtyRef.current = false;
    closeRight();
  }, [closeRight]);

  // 素のタスク新規作成（C-新規 / D&D 昇格と別経路）。作成 → ツリー再取得まで（ADR 0002: 詳細自動オープンなし）。
  const {
    saving: creatingSaving,
    saveError: createError,
    create,
  } = useDeskTaskCreate({ refetchTree });

  // クリック / ドラッグの両立: 8px 動かすまでは click 扱い（小距離移動でスレッドを開ける）。
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // thread / detail オブジェクト全体を依存に入れると毎レンダー参照が変わり useCallback のメモ化が
  // 無効化されるため、使うメンバだけ分割代入して安定参照を依存に渡す。
  const {
    theme: threadTheme,
    loading: threadLoading,
    error: threadError,
    refetch: refetchThread,
    postMessage: postThreadMessage,
    updateMessage: updateThreadMessage,
    updateTheme: updateThreadTheme,
    archive: archiveThreadTheme,
    deleteTheme: deleteThreadTheme,
    deleteMessage: deleteThreadMessage,
    toggleMessageReaction: toggleThreadMessageReaction,
    toggleThemeReaction: toggleThreadThemeReaction,
    // dsk-0393: 一覧の lastMessageAt を鮮度キーとして渡す。他者の新着が入ったテーマの開き直しでは
    // キャッシュを使わず取り直す（既読化の副作用もそこで走る）。
  } = useChatThread(
    selectedThemeId,
    themes.find((t) => t.id === selectedThemeId)?.lastMessageAt ?? null,
  );

  // 現在ログインユーザー（起点カードの編集・その他アクションの所有判定 / rete-desk-0083）。
  const { user: sessionUser } = useSession();

  // dsk-0219: 一覧（tree）が既に持つ当該タスクを種として詳細 hook へ渡し、オープン直後の
  // スピナーちらつきを消す。詳細 GET 完了でサーバ確定値へ自然に差し替わる。
  const detailSeedTask = useMemo(
    () => (selectedTaskId == null ? null : findTaskNode(tree, selectedTaskId)),
    [tree, selectedTaskId],
  );
  const {
    task: detailTask,
    error: detailError,
    save: saveTask,
    toggleReaction: toggleTaskDetailReaction,
  } = useTaskDetail(selectedTaskId, detailSeedTask);
  const [savingTask, setSavingTask] = useState(false);

  // dsk-0242: 起点カード編集中（タスク詳細）の Esc を横取りする interceptor。overlay が編集中だけ登録し、
  // 「編集モードのみ解除」して true（消費）を返す。Esc の close 所有権は desk-shell 側に集約したまま、
  // 編集中の判定だけを overlay に委ねる（二重 window リスナーを避ける / Esc-close ロジックは1箇所）。
  const escapeInterceptorRef = useRef<(() => boolean) | null>(null);

  // ESC: 開いているオーバーレイを閉じる（排他で常に 1 枚なので closeAll ≡ その 1 枚を閉じる）。
  // rete-desk-0120 / 0113: 旧「入力欄フォーカス時は blur 先行（1 回目は閉じず 2 回目で閉じる）」を廃止し、
  // 入力中でも 1 回の ESC で閉じ要求を通す。差分があれば closeAllGuarded の破棄確認ダイアログが緩衝に
  // なるため、誤操作でいきなり内容が消えることはない（解除＝閉じる を ESC 1 回に統一）。
  // 検索ボックス(type=search)だけは従来どおり自身の onKeyDown でキーワードをクリアする方を優先し、
  // オーバーレイは閉じない（フィルタ解除が先で、閉じる対象ではない）。
  // IME 変換確定中の ESC は OS/IME の変換取消に委ねる（isComposing 時は no-op = 変換中の 1 回目は消費される）。
  useEffect(() => {
    if (leftView === 'list' && rightView === 'tree') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      // 破棄確認ダイアログ表示中の ESC はダイアログ側（キャンセル扱い）が消費する。ここで closeAllGuarded を
      // 重ねると「閉じた直後に再び確認が開く」二重発火になる（rete-desk-0124）。
      if (document.querySelector('[role="alertdialog"]')) return;
      const active = document.activeElement as HTMLElement | null;
      const field = active?.closest(
        'input, textarea, select, [contenteditable="true"]',
      ) as HTMLElement | null;
      // 検索ボックスは自身でキーワードをクリアするため閉じ処理を抑止（オーバーレイは残す）。
      if (field?.getAttribute('type') === 'search') return;
      // dsk-0242: タスク詳細の起点カード編集中は、overlay が Esc を消費して編集モードのみ解除する
      // （詳細画面は閉じない）。消費した（true）なら closeAllGuarded を呼ばない。
      if (escapeInterceptorRef.current?.()) return;
      // dsk-0389/0390: Esc というキーボード操作が focus 中の行を :focus-visible に昇格させ
      // teal 枠が残留するため、目印属性で枠のみ CSS 抑止する（詳細は quiet-focus.ts）。
      applyQuietFocus(active?.closest('.desk-chat-card, .desk-task-row') ?? null);
      closeAllGuarded();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leftView, rightView, closeAllGuarded]);

  // ↑↓ 行移動 / ←→ 反対ペイン最近傍 / Tab パネル移動（モック desk/index.html のキーボードナビ移植）。
  useDeskKeyboardNav({
    leftView,
    rightView,
    openThread: guardedOpenThread,
    openTaskDetail: guardedOpenTaskDetail,
    closeLeft: guardedCloseLeft,
    closeRight,
    // アクティブ枠（単一カーソル）の移動のみ＝開閉・編集破棄に関与しないためガード不要（dsk-0410）。
    setActiveTheme,
    setActiveTask,
  });

  const handleCreate = useCallback(
    async (input: {
      title: string;
      description?: string;
      descriptionMentionAccountIds?: string[];
    }) => {
      // 作成後はチャット明細に追加されるのみ（createTheme が一覧を再取得）。自動で詳細を
      // 開かず、どこにもフォーカスしない（ticket rete-desk-0002）。
      // 戻り値（作成テーマ）は ThemeComposer の deferred-flush 添付（FL-3b）の紐付け先に使う。
      return await createTheme(input);
    },
    [createTheme],
  );

  const handleReply = useCallback(
    async (body: string, fileIds: string[], mentionAccountIds: string[]) => {
      // fileIds は deferred-flush 添付（FL-3b）。mentionAccountIds は宛先（rete-desk-0049）。
      // postMessage が post（宛先永続化込み）→attach→reload を一括処理する。
      await postThreadMessage(body, fileIds, mentionAccountIds);
      // 返信で一覧側の messageCount / 最新順も変わるため明細を取り直す。
      await refetchThemes();
    },
    [postThreadMessage, refetchThemes],
  );

  // 自分の発話の本文編集（rete-desk-0146）。本文変更で一覧側の検索ヒット・メンション印が変わりうるため
  // 明細も取り直す（handleReply / handleUpdateTheme と同方針）。
  const handleUpdateMessage = useCallback(
    async (messageId: string, body: string, mentionAccountIds: string[]) => {
      await updateThreadMessage(messageId, body, mentionAccountIds);
      // 更新成功の揮発性トースト（rete-desk-0204）は本文 PATCH の後に保留添付の commit が続くようになった
      // （dsk-0265）ため、ここでは出さない。全体（本文＋添付）の成功を見届けられる ChatThread 側
      // （handleSaveMessage）が出す——添付 commit 失敗時に「更新しました」と inline エラーが同時に出る
      // 誤シグナルを防ぐ。
      // 保存は成功済み。一覧再取得の失敗を throw すると子（ChatThread）の catch に届き「保存失敗」誤表示と
      // 成功トーストが二重に出るため、handleDeleteTheme と同じく握って toast.error で通知する。
      try {
        await refetchThemes();
      } catch {
        toast.error('チャット明細の更新に失敗しました。再読み込みしてください。');
      }
    },
    [updateThreadMessage, refetchThemes],
  );

  // テーマ編集（title / description / tenmatsu）。title はチャット明細カードにも出るため一覧も取り直す
  // （tenmatsu は一覧カードには出ないが、再取得は title 変更時の整合のため共通化している / rete-desk-0092）。
  const handleUpdateTheme = useCallback(
    async (payload: {
      title?: string;
      description?: string;
      tenmatsu?: string | null;
      descriptionMentionAccountIds?: string[];
      tenmatsuMentionAccountIds?: string[];
    }) => {
      await updateThreadTheme(payload);
      // 更新成功の揮発性トースト（rete-desk-0204）。テーマ編集・チャット顛末保存はいずれも本経路。
      toast.success('チャットを更新しました');
      // 保存成功後の一覧再取得失敗は握る（子の catch への伝播＝成功トースト＋保存失敗誤表示の二重化を防ぐ）。
      try {
        await refetchThemes();
      } catch {
        toast.error('チャット明細の更新に失敗しました。再読み込みしてください。');
      }
    },
    [updateThreadTheme, refetchThemes],
  );

  // アーカイブ／解除（rete-desk-0077）。明細カードのアーカイブ印にも反映するため一覧も取り直す。
  const handleArchiveTheme = useCallback(
    async (archived: boolean) => {
      await archiveThreadTheme(archived);
      await refetchThemes();
    },
    [archiveThreadTheme, refetchThemes],
  );

  // 発話（返信メッセージ）削除（dsk-0316）。本文編集と同様、削除した発話の検索ヒット・メンション印が
  // 一覧側から消えるため明細も取り直す（handleUpdateMessage と同方針）。テーマ本体は残るため詳細は開いたまま。
  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      await deleteThreadMessage(messageId);
      try {
        await refetchThemes();
      } catch {
        toast.error('チャット明細の更新に失敗しました。再読み込みしてください。');
      }
    },
    [deleteThreadMessage, refetchThemes],
  );

  // メッセージ削除（rete-desk-0095）。テーマ＝起点メッセージごと物理削除 → 消えた詳細は残せないため
  // 閉じてから一覧を取り直す。閉じる際は stale dirty を防ぐため handleCloseThread と同じく右 dirty を落とす。
  const handleDeleteTheme = useCallback(async () => {
    await deleteThreadTheme();
    rightDirtyRef.current = false;
    closeRight();
    // 削除自体は成功済み。一覧再取得の失敗を throw すると、すでにアンマウントされた ChatThread の
    // catch（setDeleteError）へ届いて no-op になりサイレント消失するため、ここで握って toast で通知する。
    try {
      await refetchThemes();
    } catch {
      toast.error('チャット明細の更新に失敗しました。再読み込みしてください。');
    }
  }, [deleteThreadTheme, closeRight, refetchThemes]);

  const handleSaveTask = useCallback(
    async (payload: Record<string, unknown>) => {
      setSavingTask(true);
      try {
        await saveTask(payload);
        // 更新成功の揮発性トースト（rete-desk-0204）。題名/説明・属性・顛末はいずれも onSave 経由で本経路に集約。
        toast.success('タスクを更新しました');
        // ツリー側のタイトル / ステータス / 期日などの表示も更新するため取り直す。保存は成功済みのため、
        // 再取得の失敗を throw すると overlay の catch で「保存失敗」誤表示＋成功トースト二重化になる。握って通知。
        try {
          await refetchTree();
        } catch {
          toast.error('タスクツリーの更新に失敗しました。再読み込みしてください。');
        }
      } finally {
        setSavingTask(false);
      }
    },
    [saveTask, refetchTree],
  );

  // 親付け替え（rete-desk-0071）。picker での親変更は構造変更なので属性更新ではなく move endpoint に流す
  // （sortOrder / 循環 / カテゴリ波及を一元処理）。afterTaskId=null で新しい兄弟群の末尾へ。
  // saving 表示は直後に走る handleSaveTask（onSave）が一括して担うため、ここでは二重トグルしない。
  // move 成功後のツリー再取得が失敗しても move 自体は確定済みなので、その失敗は飲み込み（呼び出し側へ
  // 投げない）保存失敗の誤表示を避ける。古いツリーは次の操作で取り直される。
  const handleReparentTask = useCallback(
    async (parentTaskId: number | null, categoryId: number | null) => {
      if (selectedTaskId == null) return;
      await moveTask(selectedTaskId, { parentTaskId, categoryId, afterTaskId: null });
      try {
        await refetchTree();
      } catch {
        // move は確定済み。ツリー再取得の失敗は致命的でないため握り潰す。
      }
    },
    [selectedTaskId, refetchTree],
  );

  // 新規登録モード確定 → POST /tasks → 成功なら閉じて list に戻す（ADR 0002: 作成後に詳細を自動オープンしない）。
  // 戻り値の作成タスク id は overlay 側で保留中添付（FL-3b deferred-flush）の紐づけ先に使う。
  const handleCreateTask = useCallback(
    async (
      data: TaskFormData,
      mention: { descriptionMentionAccountIds: string[] },
    ): Promise<number | null> => {
      // spaceId を現在選択中チャネルへ貫通させる（rete-desk-0187: 未貫通だとデフォルトチャネル＝全体共通に作られていた）。
      // 説明面の宛先（dsk-0203）は overlay が説明 HTML から抽出済み。空なら送らない（宛先なし）。
      const created = await create({
        ...toCreatePayload(data, selectedSpaceId ?? undefined),
        ...(mention.descriptionMentionAccountIds.length > 0
          ? { descriptionMentionAccountIds: mention.descriptionMentionAccountIds }
          : {}),
      });
      // 保存成功時の closeLeft は破棄ではない。dirty を落としてから閉じ、破棄確認の誤発火を防ぐ。
      // 添付 flush は overlay が close 後も継続実行する（React 19・id を返してから閉じる）。
      if (created) {
        leftDirtyRef.current = false;
        closeLeft();
        // 登録成功の揮発性トースト（rete-desk-0183）。作成後は詳細を自動オープンしない（ADR 0002）ため、
        // フィードバックが無く分かりづらかったのをトーストで補う。
        toast.success('タスクを登録しました');
        return created.id;
      }
      return null;
    },
    [create, closeLeft, selectedSpaceId],
  );

  // 昇格フォーム確定 → フォーム値を PromoteFormValues に詰めて savePromotion へ（target→payload 変換は hook 側）。
  // 戻り値の昇格タスク id は overlay 側の添付 flush（FL-3b）に使う。
  const handlePromote = useCallback(
    async (
      data: TaskFormData,
      mention: { descriptionMentionAccountIds: string[] },
    ): Promise<number | null> => {
      const created = await savePromotion({
        title: data.title,
        description: data.description || undefined,
        // 説明面の宛先（dsk-0203）。overlay が説明 HTML から抽出済み（buildPromotePayload が空を省略する）。
        descriptionMentionAccountIds: mention.descriptionMentionAccountIds,
        status: data.status,
        assigneeName: data.assigneeName || undefined,
        startDate: data.startDate || undefined,
        dueDate: data.dueDate || undefined,
      });
      return created ? created.id : null;
    },
    [savePromotion],
  );

  const leftOverlaid = leftView !== 'list';
  const leftPaneClass = `desk-pane${leftOverlaid ? ' is-overlaid-left is-overlaid-wide' : ''}`;
  const rightPaneClass = `desk-pane relative${rightView === 'thread' ? ' is-overlaid-right' : ''}`;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <main className="sp-page flex flex-col overflow-hidden">
        {/* 明細上部の統合検索/フィルタトールバー（C-検索: キーワード + 期日範囲を実配線） */}
        <DeskFilterToolbar
          mode={search.mode}
          onModeChange={search.setMode}
          chatKeyword={search.chatKeyword}
          onChatKeywordChange={search.setChatKeyword}
          archiveOnly={search.archiveOnly}
          onArchiveToggle={search.toggleArchiveOnly}
          chatTenmatsuOnly={search.chatTenmatsuOnly}
          onChatTenmatsuToggle={search.toggleChatTenmatsuOnly}
          mentionFrom={search.mentionFrom}
          onMentionFromToggle={search.toggleMentionFrom}
          mentionTo={search.mentionTo}
          onMentionToToggle={search.toggleMentionTo}
          taskKeyword={search.taskKeyword}
          onTaskKeywordChange={search.setTaskKeyword}
          dueFrom={search.dueFrom}
          dueTo={search.dueTo}
          onDueChange={search.setDueRange}
          statusFilter={search.statusFilter}
          onStatusToggle={search.toggleStatus}
          assigneeFilter={search.assigneeFilter}
          onAssigneeToggle={search.toggleAssignee}
          categoryFilter={search.categoryFilter}
          onCategoryToggle={search.toggleCategory}
          tenmatsuOnly={search.tenmatsuOnly}
          onTenmatsuToggle={search.toggleTenmatsuOnly}
          taskMentionFrom={search.taskMentionFrom}
          onTaskMentionFromToggle={search.toggleTaskMentionFrom}
          taskMentionTo={search.taskMentionTo}
          onTaskMentionToToggle={search.toggleTaskMentionTo}
          accounts={accounts}
          categories={categories}
          onClearChat={search.clearChat}
          onClearTask={search.clearTask}
        />
        {/* タスク明細の新規登録ツールバー（右寄せ）。押下でタスク新規登録モードを開く（C-新規）。 */}
        <DeskTaskToolbar
          onCreate={guardedStartCreatingTask}
          onOpenCategorySettings={openCategorySettings}
        />
        <div
          className="desk-shell"
          ref={paneRatio.shellRef}
          style={{ gridTemplateColumns: paneRatio.gridTemplateColumns }}
        >
          {/* 左ペイン: チャット明細（list）⇄ タスク詳細（detail）/ 昇格フォーム（promote）を差し替え */}
          <section className={leftPaneClass} data-pane="left">
            <div
              className={`desk-view${leftView === 'list' ? ' is-active' : ''}`}
              data-left-view="list"
            >
              <ChatList
                themes={search.filteredThemes}
                selectedId={selectedThemeId}
                activeId={lastActiveThemeId}
                loading={loading}
                error={error}
                onSelect={guardedOpenThread}
                highlight={search.chatKeyword}
              />
              <ThemeComposer
                onCreate={handleCreate}
                evacuated={isInputEvacuated}
                accounts={accounts}
              />
            </div>
            {/* detail スロット: 新規登録モード（is-creating）と既存タスク編集を排他で出し分ける。 */}
            {leftView === 'detail' && isCreatingTask && (
              <TaskCreateOverlay
                variant="create"
                categories={categories}
                parentTasks={allParentOptions}
                accounts={accounts}
                saving={creatingSaving}
                error={createError}
                onClose={guardedCloseLeft}
                onSubmit={handleCreateTask}
                onDirtyChange={reportLeftDirty}
              />
            )}
            {leftView === 'detail' && !isCreatingTask && (
              <TaskDetailOverlay
                task={detailTask}
                categories={categories}
                parentTasks={detailParentOptions}
                accounts={accounts}
                currentUserId={sessionUser?.id}
                error={detailError}
                saving={savingTask}
                onClose={guardedCloseLeft}
                onSave={handleSaveTask}
                onReparent={handleReparentTask}
                onDirtyChange={reportLeftDirty}
                escapeInterceptorRef={escapeInterceptorRef}
                taskKeyword={search.taskKeyword}
                onToggleReaction={toggleTaskDetailReaction}
              />
            )}
            {/* 昇格フォームもタスク詳細 編集モードと同じ二段組へ統一（開発統括指示 2026-06-03 / TaskCreateOverlay 共有）。
                description は D&D 後に遅延取得されるため、id+description有無を key にして到着時のみ再マウントしプリフィルする。 */}
            {leftView === 'promote' && promoteDraft != null && (
              <TaskCreateOverlay
                key={`promote-${promoteDraft.theme.id}-${promoteDraft.theme.description != null}`}
                variant="promote"
                categories={categories}
                accounts={accounts}
                saving={promoteSaving}
                error={promoteError}
                defaultValues={{
                  title: promoteDraft.theme.title,
                  description: promoteDraft.theme.description ?? '',
                  categoryId:
                    promoteDraft.target.categoryId != null
                      ? String(promoteDraft.target.categoryId)
                      : '',
                }}
                parentLabel={targetInsertLabel(promoteDraft.target)}
                sourceThemeTitle={promoteDraft.theme.title}
                onClose={guardedCloseLeft}
                onSubmit={handlePromote}
                onDirtyChange={reportLeftDirty}
              />
            )}
          </section>

          <div
            className={`desk-divider${paneRatio.dragging ? ' is-dragging' : ''}`}
            onPointerDown={paneRatio.onDividerPointerDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="ペイン幅の調整"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={Math.round(paneRatio.ratio * 100)}
          />

          {/* 右ペイン: タスク明細ツリー（tree）⇄ チャット詳細スレッド（thread）を差し替え */}
          <section className={rightPaneClass} data-pane="right" data-right-pane>
            <div
              className={`desk-view${rightView === 'tree' ? ' is-active' : ''}`}
              data-right-view="tree"
            >
              <TaskTree
                tree={tree}
                categories={categories}
                isDragActive={activeTheme != null}
                draggableTasks
                loading={treeLoading}
                error={treeError}
                selectedId={selectedTaskId}
                activeId={lastActiveTaskId}
                onSelect={guardedOpenTaskDetail}
                dropIndicator={dropIndicator}
                provisionalRow={provisionalRow}
                visibleTaskIds={search.visibleTaskIds}
                taskFiltered={search.taskFiltered}
                taskKeyword={search.taskKeyword}
              />
            </div>
            {rightView === 'thread' && (
              <ChatThread
                theme={threadTheme}
                loading={threadLoading}
                error={threadError}
                onClose={handleCloseThread}
                onReply={handleReply}
                onUpdateMessage={handleUpdateMessage}
                onRefetchTheme={refetchThread}
                accounts={accounts}
                onUpdateTheme={handleUpdateTheme}
                onArchive={handleArchiveTheme}
                onDeleteTheme={handleDeleteTheme}
                onDeleteMessage={handleDeleteMessage}
                onToggleMessageReaction={toggleThreadMessageReaction}
                onToggleThemeReaction={toggleThreadThemeReaction}
                onDirtyChange={reportRightDirty}
                currentUserId={sessionUser?.id}
                highlight={search.chatKeyword}
              />
            )}
          </section>

          {/* 明細外クリック捕捉レイヤー（左右オーバーレイ表示時に :has() で出現・透明）。余白クリックで全閉じ。
              左右両ペインの編集 dirty を確認してから閉じる（closeAllGuarded → 右確認 → closeAll で左確認）。
              dsk-0384: data-baton-passthrough は Element Inspector（baton）専用の目印。実クリック挙動
              （pointer-events / onClick）には一切影響しない。baton はこの属性を見た時だけ本レイヤーを
              素通りしてその下の実要素を拾う（受け皿の z-index・実際の余白クリック閉じは変更しない）。 */}
          <div
            className="desk-modal-backdrop"
            aria-hidden="true"
            onClick={closeAllGuarded}
            data-baton-passthrough="1"
          />
        </div>

        {/* 破棄確認の Rete デザインダイアログ（rete-desk-0102）。左オーバーレイ遷移 / 全閉じの破棄確認を担う。 */}
        <DiscardConfirmDialog
          open={discard.open}
          onConfirm={discard.onConfirm}
          onCancel={discard.onCancel}
        />

        {/* 分類マスタ設定モーダル（rete-desk-0140）。ツールバー「分類設定」から開く独立モーダル。 */}
        <CategorySettingsDialog
          open={categorySettingsOpen}
          spaceId={selectedSpaceId}
          onClose={closeCategorySettings}
          onChanged={handleCategoriesChanged}
        />
      </main>

      {/* ドラッグ中ゴースト: 昇格はテーマカード、移動はドラッグ行 1 行のみ（子は浮かさない / §4.1）。 */}
      <DragOverlay>
        {activeTheme ? (
          <DragOverlayCard theme={activeTheme} />
        ) : activeMoveTitle != null ? (
          <DragOverlayCard
            theme={{ id: 'move', title: activeMoveTitle, description: null }}
            leftOffsetRem={4.5}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
