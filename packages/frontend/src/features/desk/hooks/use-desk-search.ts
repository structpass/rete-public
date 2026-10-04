'use client';

import { useCallback, useMemo, useState } from 'react';
import { TaskStatus } from '@rete/shared';
import type { ChatThemeSummary, DeskTaskTree, DeskTaskNode } from '../lib/api';
import { richTextToPlainText } from '../lib/rich-text';
import { useTaskMentionFilter } from './use-task-mention-filter';

/** 統合検索のモード（表示する filter bar の切替。絞り込み自体はモード非依存で両明細に常時適用）。 */
export type DeskSearchMode = 'chat' | 'task';

/** 期日 ISO（or null）から日付部分（YYYY-MM-DD）を取り出す。ISO は辞書順で日付比較可能。 */
function dueDatePart(due: string | null): string {
  return due ? due.slice(0, 10) : '';
}

// チャット明細の絞り込み（keyword / archive / 顛末 / mention）は server 側（A案）へ統一した。
// 旧 filterChatThemes（クライアント絞り込み）は撤去し、useChatThemes が server へパラメータを送って
// 絞り込み済みの themes を受け取る。これにより「server ページング越し（21 件目以降）でもフィルタが効く」
// 不整合（旧: 1 ページ目しか効かない）を解消した。hook は受け取った themes を素通しする。

export interface TaskFilterCriteria {
  /** タスク検索キーワード。タイトル / 説明 / 顛末 本文 いずれかの部分一致（大文字小文字を無視）+ チケットNo完全一致を OR で判定。
   *  説明 / 顛末 は RTE HTML のため内部で素テキストに展開してから比較する（dsk-0339）。 */
  keyword: string;
  /** 期日範囲 From（'' or 'YYYY-MM-DD'）。 */
  dueFrom: string;
  /** 期日範囲 To（'' or 'YYYY-MM-DD'）。 */
  dueTo: string;
  /** ステータス絞り込み（複数選択 / rete-desk-0038・0056）。
   *  空配列 = 「未完了（完了以外）」の既定ビュー（DONE を除外）。選択時はその集合のみ通過（DONE も明示選択で表示）。 */
  statusFilter: TaskStatus[];
  /** 担当者絞り込み（複数選択 / rete-desk-0054）。空配列 = 絞り込みなし。値は Account.id の OR 集合。 */
  assigneeIds: string[];
  /** 分類絞り込み（複数選択 / rete-desk-0055）。空配列 = 絞り込みなし。値は Category.id の OR 集合。 */
  categoryIds: number[];
  /** 顛末絞り込み（toggle / rete-desk-0052）。true = 顛末記録済（tenmatsu 非空）のみ。 */
  tenmatsuOnly: boolean;
  /** メンション From 絞り込み（複数選択 / dsk-0203）。空配列 = 全て。値は Account.id の OR 集合。 */
  mentionFrom?: string[];
  /** メンション To 絞り込み（複数選択 / dsk-0203）。空配列 = 全て。From×To は同一メンションで AND（backend 仕様）。 */
  mentionTo?: string[];
  /**
   * メンション条件に一致するタスク id 集合（dsk-0203）。判定はサーバー（GET /tasks の mentionFrom/mentionTo）が
   * 行い、useTaskMentionFilter が集合化する。null/undefined = メンション絞り込みなし。
   * 集合あり時は「集合に含まれないノードは不可視」として他条件と AND する。
   */
  mentionTaskIds?: Set<number> | null;
}

/**
 * 明示的なタスク絞り込みが有効か（いずれかの条件がユーザーにより指定されているか）。
 *
 * 注: status 未選択の「完了除外（既定ビュー）」は明示フィルタに**数えない**（rete-desk-0056）。
 * これは task-tree の「空カテゴリ見出し / D&D 落とし先を畳むか」の判定に使う（既定ビューでは畳まない）。
 */
export function isTaskFilterActive({
  keyword,
  dueFrom,
  dueTo,
  statusFilter,
  assigneeIds,
  categoryIds,
  tenmatsuOnly,
  mentionFrom,
  mentionTo,
}: TaskFilterCriteria): boolean {
  return !!(
    keyword.trim() ||
    dueFrom ||
    dueTo ||
    statusFilter.length > 0 ||
    assigneeIds.length > 0 ||
    categoryIds.length > 0 ||
    tenmatsuOnly ||
    (mentionFrom?.length ?? 0) > 0 ||
    (mentionTo?.length ?? 0) > 0
  );
}

/**
 * タスク明細の可視 task id 集合を計算する（モック applyDueFilter + keyword の React 移植）。
 *
 * **単一ソース原則**: 行の可視判定はこの関数のみが持つ（task-tree 側で別途 DONE 除外などを書かない /
 * §4 後追い修正の非対称の回避）。tree が null のときだけ null（= ツリー未取得）、それ以外は常に集合を返す。
 *
 * - 各ノードが「全条件に自己一致」したときだけ可視（祖先の引き込みはしない = **厳密一致** / rete-desk-0057）。
 *   親が status 不一致でも子だけが残る挙動（旧: 祖先可視化）が「未着手のみ選択で対応中の親が混ざる」
 *   バグの原因だったため撤去した。
 * - ステータス未選択は「未完了（完了以外）」の既定ビュー（DONE を除外 / rete-desk-0056）。選択時はその集合のみ。
 * - チケットNo検索（rete-desk-0052）: 「#番号」または「純粋数字」を id の**完全一致**として扱う
 *   （部分一致は誤発火するため不可）。タイトル / 説明 / 顛末 部分一致との OR（dsk-0339 で対象拡張）。
 * - 説明 / 顛末 は Tiptap の RTE HTML 保存値。`richTextToPlainText` で本文テキストに展開してから比較する
 *   ため、太字等で割れた語でもヒットし、HTML タグ名・属性値には誤マッチしない。
 * - 集合は full tree 基準（配列は間引かない）。TaskTree は is-hidden で隠すため D&D の gap index を壊さない。
 */
export function computeVisibleTaskIds(
  tree: DeskTaskTree | null,
  criteria: TaskFilterCriteria,
): Set<number> | null {
  if (!tree) return null;
  const kw = criteria.keyword.trim().toLowerCase();
  // チケットNo検索: 「#番号」or「純粋数字」を id 完全一致のクエリとする（rete-desk-0052）。
  // それ以外（英字混じり等）はタイトル検索のみ。完全一致のみ＝部分一致の誤発火（"20" が 200 に当たる）を防ぐ。
  const idQuery = kw.startsWith('#') ? kw.slice(1) : /^\d+$/.test(kw) ? kw : '';
  const idMatch = /^\d+$/.test(idQuery) ? Number(idQuery) : null;
  const { dueFrom, dueTo, statusFilter, assigneeIds, categoryIds, tenmatsuOnly, mentionTaskIds } =
    criteria;
  const statusSet = statusFilter.length > 0 ? new Set<string>(statusFilter) : null;
  const assigneeSet = assigneeIds.length > 0 ? new Set<string>(assigneeIds) : null;
  const categorySet = categoryIds.length > 0 ? new Set<number>(categoryIds) : null;
  const visible = new Set<number>();

  // 説明 / 顛末 は RTE HTML のため plain text 抽出が重い（DOMParser + 文字列整形）。
  // 1 ノード当たり最大 2 回（description / tenmatsu）の抽出で済むよう、同一 compute 内で node.id をキーに
  // キャッシュする（dsk-0339: 子が親スコープを巻き戻す walk でも重複抽出を回避・毎打鍵の体感を保つ）。
  const plainCache = new Map<number, { description: string; tenmatsu: string }>();
  const plainFor = (n: DeskTaskNode): { description: string; tenmatsu: string } => {
    const cached = plainCache.get(n.id);
    if (cached) return cached;
    const fresh = {
      description: richTextToPlainText(n.description).toLowerCase(),
      tenmatsu: richTextToPlainText(n.tenmatsu).toLowerCase(),
    };
    plainCache.set(n.id, fresh);
    return fresh;
  };

  const selfMatches = (node: DeskTaskNode): boolean => {
    // keyword: タイトル部分一致 / チケットNo完全一致 / 説明 / 顛末 本文 のいずれか（OR / dsk-0339）。
    // 説明 / 顛末 は RTE HTML のため richTextToPlainText で本文に展開してから比較する。
    if (kw) {
      const byTitle = node.title.toLowerCase().includes(kw);
      const byId = idMatch !== null && node.id === idMatch;
      const { description, tenmatsu } = plainFor(node);
      const byDescription = description.includes(kw);
      const byTenmatsu = tenmatsu.includes(kw);
      if (!byTitle && !byId && !byDescription && !byTenmatsu) return false;
    }
    // 期日範囲: 範囲指定中は期日無しを除外。範囲内のみ通す（モック applyDueFilter 準拠）。
    if (dueFrom || dueTo) {
      const d = dueDatePart(node.dueDate);
      if (!d) return false;
      if (dueFrom && d < dueFrom) return false;
      if (dueTo && d > dueTo) return false;
    }
    // ステータス（複数選択 / rete-desk-0038・0056）:
    //   選択あり → その集合のみ通過（DONE も明示選択時のみ可視）
    //   選択なし → 既定ビュー = 完了（DONE）を除外
    if (statusSet) {
      if (!statusSet.has(node.status)) return false;
    } else if (node.status === TaskStatus.DONE) {
      return false;
    }
    // 担当者（複数選択 / rete-desk-0054）: 指定時は assignee.id が集合に含まれるノードのみ（未割当は不一致）。
    if (assigneeSet && (node.assignee == null || !assigneeSet.has(node.assignee.id))) return false;
    // 分類（複数選択 / rete-desk-0055）: 指定時は categoryId が集合に含まれるノードのみ。
    // 未分類（categoryId=null / rete-desk-0158）は分類フィルタ選択時は常に不一致（フィルタ対象は実分類のみ）。
    if (categorySet && (node.categoryId == null || !categorySet.has(node.categoryId))) return false;
    // 顛末（toggle / rete-desk-0052）: 記録済（tenmatsu 非空）のみ。task.tenmatsu は実フィールド。
    if (tenmatsuOnly && !(node.tenmatsu && node.tenmatsu.trim() !== '')) return false;
    // メンション From/To（dsk-0203）: サーバー判定済みの一致 id 集合に含まれるノードのみ通す（他条件と AND）。
    if (mentionTaskIds && !mentionTaskIds.has(node.id)) return false;
    return true;
  };

  // 厳密一致: 自己一致したノードのみ可視に追加（祖先は引き込まない / rete-desk-0057）。
  const walk = (node: DeskTaskNode): void => {
    if (selfMatches(node)) visible.add(node.id);
    node.children.forEach(walk);
  };
  tree.categories.forEach((cat) => cat.tasks.forEach(walk));
  return visible;
}

/**
 * グループ（カテゴリ）配下の可視タスク数を数える（rete-desk-0037 / 0件グループ見出し非表示の判定）。
 *
 * visibleTaskIds が null（= ツリー未取得。0056 以降は既定ビューでも集合を返すため null は loading のみ）の
 * ときは全件可視とみなし、サブツリーの総ノード数を返す。集合指定時はその集合に含まれるノードのみ
 * カウント（is-hidden で隠れる行を除外）。子孫まで再帰。
 */
export function countVisibleTasksInGroup(
  tasks: DeskTaskNode[],
  visibleTaskIds: Set<number> | null,
): number {
  let count = 0;
  const walk = (node: DeskTaskNode) => {
    if (visibleTaskIds == null || visibleTaskIds.has(node.id)) count += 1;
    node.children.forEach(walk);
  };
  tasks.forEach(walk);
  return count;
}

/**
 * 絞り込み連動でグループ見出しを隠すか（rete-desk-0037）。
 *
 * 「集合あり（visibleTaskIds != null） かつ そのグループの可視タスク数が 0」のときだけ true。
 * 注: 0056 以降、可視0でも畳むかは呼び出し側（task-tree）が taskFiltered（明示フィルタ中か）で gate する。
 * この関数自体は「可視0か」の純粋判定のみを担い、既定ビューで畳まない判断は持たない。
 * null（ツリー未取得）時は常に false。
 */
export function shouldHideGroupHead(
  tasks: DeskTaskNode[],
  visibleTaskIds: Set<number> | null,
): boolean {
  if (visibleTaskIds == null) return false;
  return countVisibleTasksInGroup(tasks, visibleTaskIds) === 0;
}

export interface UseDeskSearchArgs {
  themes: ChatThemeSummary[];
  tree: DeskTaskTree | null;
}

export interface UseDeskSearchResult {
  mode: DeskSearchMode;
  setMode: (m: DeskSearchMode) => void;
  chatKeyword: string;
  setChatKeyword: (v: string) => void;
  /** アーカイブ絞り込み（チャット / rete-desk-0061）。true = アーカイブ済のみ表示。 */
  archiveOnly: boolean;
  /** アーカイブ絞り込みトグル。 */
  toggleArchiveOnly: () => void;
  /** 顛末絞り込み（チャット / rete-desk-0050）。true = 顛末記録済のみ。 */
  chatTenmatsuOnly: boolean;
  /** チャット顛末絞り込みトグル。 */
  toggleChatTenmatsuOnly: () => void;
  /** メンション発信者（From）絞り込み（複数選択 / rete-desk-0049）。空配列 = 全て。値は Account.id の OR 集合。
   *  絞り込みはサーバー側（§5.3 A案）。この状態を useChatThemes へ push して再取得する。 */
  mentionFrom: string[];
  /** メンション From を 1 件トグル（選択 ⇄ 解除）。 */
  toggleMentionFrom: (id: string) => void;
  /** メンション先（To）絞り込み（複数選択 / rete-desk-0049）。空配列 = 全て。From×To は同一メッセージで AND。 */
  mentionTo: string[];
  /** メンション To を 1 件トグル（選択 ⇄ 解除）。 */
  toggleMentionTo: (id: string) => void;
  taskKeyword: string;
  setTaskKeyword: (v: string) => void;
  dueFrom: string;
  dueTo: string;
  setDueRange: (range: { from: string; to: string }) => void;
  /** ステータス絞り込み（複数選択 / rete-desk-0038）。 */
  statusFilter: TaskStatus[];
  /** ステータスフィルタの 1 値をトグル（選択 ⇄ 解除）。 */
  toggleStatus: (status: TaskStatus) => void;
  /** 担当者絞り込み（複数選択 / rete-desk-0054）。空配列 = 全て。 */
  assigneeFilter: string[];
  /** 担当者を 1 件トグル（選択 ⇄ 解除）。 */
  toggleAssignee: (id: string) => void;
  /** 分類絞り込み（複数選択 / rete-desk-0055）。空配列 = 全て。 */
  categoryFilter: number[];
  /** 分類を 1 件トグル（選択 ⇄ 解除）。 */
  toggleCategory: (id: number) => void;
  /** 顛末絞り込み（toggle / rete-desk-0052）。true = 記録済のみ。 */
  tenmatsuOnly: boolean;
  /** 顛末絞り込みトグル。 */
  toggleTenmatsuOnly: () => void;
  /** タスク側メンション From 絞り込み（複数選択 / dsk-0203）。空配列 = 全て。値は Account.id の OR 集合。
   *  一致判定はサーバー（GET /tasks）で行い、可視 id 集合へ積集合として合流する（useTaskMentionFilter）。 */
  taskMentionFrom: string[];
  /** タスク側メンション From を 1 件トグル（選択 ⇄ 解除）。 */
  toggleTaskMentionFrom: (id: string) => void;
  /** タスク側メンション To 絞り込み（複数選択 / dsk-0203）。From×To は同一メンションで AND（backend 仕様）。 */
  taskMentionTo: string[];
  /** タスク側メンション To を 1 件トグル（選択 ⇄ 解除）。 */
  toggleTaskMentionTo: (id: string) => void;
  /** チャットフィルタをクリア（キーワード + アーカイブ + 顛末）。 */
  clearChat: () => void;
  /** タスクフィルタをクリア（キーワード + 期日範囲 + ステータス + 担当者 + 分類 + 顛末 + メンション）。 */
  clearTask: () => void;
  /** キーワード適用済みのチャット明細。 */
  filteredThemes: ChatThemeSummary[];
  /** 可視 task id 集合（tree 未取得時のみ null）。TaskTree が is-hidden 判定に使う。 */
  visibleTaskIds: Set<number> | null;
  /** チャット明細が絞り込み中か（空結果メッセージの出し分け用）。 */
  chatFiltered: boolean;
  /** タスク明細が明示フィルタ中か（既定の完了除外は数えない / rete-desk-0056・0057）。
   *  TaskTree の「空カテゴリ見出し・D&D 落とし先を畳むか」の判定に使う。 */
  taskFiltered: boolean;
}

/**
 * Desk 統合検索/フィルタの状態と派生（C-検索）。
 *
 * フィルタ状態（mode / keyword × 2 / 期日範囲）を集約し、チャット明細は配列絞り込み、
 * タスク明細は可視 id 集合（is-hidden 用）として派生する。モードは表示 bar の切替のみで、
 * 絞り込み適用はモードに依存しない（モック同様、両明細へ常時適用）。
 */
export function useDeskSearch({ themes, tree }: UseDeskSearchArgs): UseDeskSearchResult {
  const [mode, setMode] = useState<DeskSearchMode>('chat');
  const [chatKeyword, setChatKeyword] = useState('');
  const [archiveOnly, setArchiveOnly] = useState(false);
  const [chatTenmatsuOnly, setChatTenmatsuOnly] = useState(false);
  const [mentionFrom, setMentionFrom] = useState<string[]>([]);
  const [mentionTo, setMentionTo] = useState<string[]>([]);
  const [taskKeyword, setTaskKeyword] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number[]>([]);
  const [tenmatsuOnly, setTenmatsuOnly] = useState(false);
  const [taskMentionFrom, setTaskMentionFrom] = useState<string[]>([]);
  const [taskMentionTo, setTaskMentionTo] = useState<string[]>([]);

  // メンション条件に一致するタスク id 集合（dsk-0203）。判定はサーバー（GET /tasks）が担い、
  // 可視 id 集合の計算（computeVisibleTaskIds）へ他条件と AND で合流させる。未選択時は null（不適用）。
  const mentionTaskIds = useTaskMentionFilter(taskMentionFrom, taskMentionTo);

  const setDueRange = useCallback((range: { from: string; to: string }) => {
    setDueFrom(range.from);
    setDueTo(range.to);
  }, []);
  const toggleStatus = useCallback((status: TaskStatus) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }, []);
  const toggleAssignee = useCallback((id: string) => {
    setAssigneeFilter((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }, []);
  const toggleCategory = useCallback((id: number) => {
    setCategoryFilter((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }, []);
  const toggleArchiveOnly = useCallback(() => setArchiveOnly((v) => !v), []);
  const toggleTenmatsuOnly = useCallback(() => setTenmatsuOnly((v) => !v), []);
  const toggleChatTenmatsuOnly = useCallback(() => setChatTenmatsuOnly((v) => !v), []);
  const toggleMentionFrom = useCallback((id: string) => {
    setMentionFrom((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }, []);
  const toggleMentionTo = useCallback((id: string) => {
    setMentionTo((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }, []);
  const toggleTaskMentionFrom = useCallback((id: string) => {
    setTaskMentionFrom((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }, []);
  const toggleTaskMentionTo = useCallback((id: string) => {
    setTaskMentionTo((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }, []);
  const clearChat = useCallback(() => {
    setChatKeyword('');
    setArchiveOnly(false);
    setChatTenmatsuOnly(false);
    setMentionFrom([]);
    setMentionTo([]);
  }, []);
  const clearTask = useCallback(() => {
    setTaskKeyword('');
    setDueFrom('');
    setDueTo('');
    setStatusFilter([]);
    setAssigneeFilter([]);
    setCategoryFilter([]);
    setTenmatsuOnly(false);
    setTaskMentionFrom([]);
    setTaskMentionTo([]);
  }, []);

  // チャット絞り込みは server（useChatThemes 経由）で行うため、ここでは受け取った themes を素通しする。
  // 絞り込み状態（chatKeyword / archiveOnly / chatTenmatsuOnly / mention）は chatFiltered と
  // server パラメータ送出（desk-shell の effect）に使う。
  const filteredThemes = themes;
  const taskCriteria = useMemo(
    () => ({
      keyword: taskKeyword,
      dueFrom,
      dueTo,
      statusFilter,
      assigneeIds: assigneeFilter,
      categoryIds: categoryFilter,
      tenmatsuOnly,
      mentionFrom: taskMentionFrom,
      mentionTo: taskMentionTo,
      mentionTaskIds,
    }),
    [
      taskKeyword,
      dueFrom,
      dueTo,
      statusFilter,
      assigneeFilter,
      categoryFilter,
      tenmatsuOnly,
      taskMentionFrom,
      taskMentionTo,
      mentionTaskIds,
    ],
  );
  const visibleTaskIds = useMemo(
    () => computeVisibleTaskIds(tree, taskCriteria),
    [tree, taskCriteria],
  );
  const taskFiltered = useMemo(() => isTaskFilterActive(taskCriteria), [taskCriteria]);

  return {
    mode,
    setMode,
    chatKeyword,
    setChatKeyword,
    archiveOnly,
    toggleArchiveOnly,
    chatTenmatsuOnly,
    toggleChatTenmatsuOnly,
    mentionFrom,
    toggleMentionFrom,
    mentionTo,
    toggleMentionTo,
    taskKeyword,
    setTaskKeyword,
    dueFrom,
    dueTo,
    setDueRange,
    statusFilter,
    toggleStatus,
    assigneeFilter,
    toggleAssignee,
    categoryFilter,
    toggleCategory,
    tenmatsuOnly,
    toggleTenmatsuOnly,
    taskMentionFrom,
    toggleTaskMentionFrom,
    taskMentionTo,
    toggleTaskMentionTo,
    clearChat,
    clearTask,
    filteredThemes,
    visibleTaskIds,
    // 空結果メッセージの出し分け: キーワード or アーカイブ or 顛末 or メンション From/To 絞り込み中は
    // 「条件に一致なし」を出す（mention はサーバー絞り込みだが空結果の文言判定は同じ扱い）。
    chatFiltered:
      chatKeyword.trim() !== '' ||
      archiveOnly ||
      chatTenmatsuOnly ||
      mentionFrom.length > 0 ||
      mentionTo.length > 0,
    taskFiltered,
  };
}
