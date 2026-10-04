import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TaskStatus, ChatThemeStatus } from '@rete/shared';
import type { ChatThemeSummary, DeskTaskTree, DeskTaskNode } from '../lib/api';
import { fetchTasks } from '../lib/api';

// タスク側メンション（dsk-0203）: useDeskSearch 内の useTaskMentionFilter が GET /tasks へ一致 id を
// 問い合わせるため、lib/api をモックして実 HTTP を封じる（本テストは型 import 以外に lib/api を使わない）。
// 既定は「101 と 200 がメンション一致」を返す（fixture tree の子タスクと別件）。
// cmn-0142: vi.hoisted 化（既定値は hook から個別に mockResolvedValue する）
const { mockFetchTasks } = vi.hoisted(() => ({
  mockFetchTasks: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchTasks: mockFetchTasks,
}));

// cmn-0225: vi.hoisted で生成した mockFetchTasks の戻り値は beforeEach で毎回設定する
// （設定側で mockReset/restoreMocks が効くため、module scope 直書きだと初回 1 回しか効かない）。
beforeEach(() => {
  mockFetchTasks.mockReset();
  mockFetchTasks.mockResolvedValue({
    success: true,
    data: [{ id: 101 }, { id: 200 }],
    meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
  });
});
import {
  computeVisibleTaskIds,
  isTaskFilterActive,
  countVisibleTasksInGroup,
  shouldHideGroupHead,
  useDeskSearch,
} from '../hooks/use-desk-search';

/** TaskFilterCriteria のデフォルト（全条件なし）を補う test helper。 */
function crit(over: Partial<Parameters<typeof isTaskFilterActive>[0]> = {}) {
  return {
    keyword: '',
    dueFrom: '',
    dueTo: '',
    statusFilter: [],
    assigneeIds: [],
    categoryIds: [],
    tenmatsuOnly: false,
    ...over,
  };
}

// ---- fixtures ----
function theme(id: string, title: string, archived = false, hasTenmatsu = false): ChatThemeSummary {
  return {
    id,
    title,
    status: ChatThemeStatus.OPEN,
    archived,
    hasTenmatsu,
    hasMentionToMe: false,
    hasUnread: false,
    author: { id: 'u1', name: '山田' },
    messageCount: 0,
    lastMessageAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
  };
}

function node(
  id: number,
  title: string,
  dueDate: string | null,
  children: DeskTaskNode[] = [],
  over: Partial<DeskTaskNode> = {},
): DeskTaskNode {
  return {
    id,
    title,
    description: null,
    status: TaskStatus.TODO,
    tenmatsu: null,
    categoryId: 1,
    parentTaskId: null,
    sortOrder: 0,
    sourceThemeId: null,
    sourceTheme: null,
    assignee: null,
    ownerId: null,
    owner: null,
    assigneeName: null,
    startDate: null,
    dueDate,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    hasMentionToMe: false,
    reactions: [],
    children,
    ...over,
  };
}

const themes = [theme('t1', '入荷の話'), theme('t2', '出荷の確認'), theme('t3', 'INVOICE 整理')];

const tree: DeskTaskTree = {
  categories: [
    {
      id: 1,
      name: '入荷管理',
      sortOrder: 0,
      tasks: [
        node(100, '親タスク', null, [node(101, '子タスク 入荷', '2026-06-15T00:00:00.000Z')]),
        node(200, '別件 検収', '2026-07-01T00:00:00.000Z'),
      ],
    },
  ],
};

// 注: チャット明細の絞り込み（keyword / archive / 顛末 / mention）は server 側（A案）へ統一したため、
// 旧 filterChatThemes（クライアント絞り込み）は撤去した。絞り込みロジックの検証は backend
// chat.repository.spec（where 構築）と use-chat-themes.test（server パラメータ送出）が担う。

describe('isTaskFilterActive（明示フィルタの有無）', () => {
  it('全条件空なら false（完了除外の既定ベースラインは「明示フィルタ」に数えない）', () => {
    expect(isTaskFilterActive(crit())).toBe(false);
    expect(isTaskFilterActive(crit({ keyword: '  ' }))).toBe(false);
  });
  it('いずれか指定で true', () => {
    expect(isTaskFilterActive(crit({ keyword: 'a' }))).toBe(true);
    expect(isTaskFilterActive(crit({ dueFrom: '2026-01-01' }))).toBe(true);
    expect(isTaskFilterActive(crit({ dueTo: '2026-12-31' }))).toBe(true);
    expect(isTaskFilterActive(crit({ statusFilter: [TaskStatus.DONE] }))).toBe(true);
    expect(isTaskFilterActive(crit({ assigneeIds: ['u1'] }))).toBe(true);
    expect(isTaskFilterActive(crit({ categoryIds: [1] }))).toBe(true);
    expect(isTaskFilterActive(crit({ tenmatsuOnly: true }))).toBe(true);
  });
  it('メンション From/To 指定も明示フィルタに数える（dsk-0203）', () => {
    expect(isTaskFilterActive(crit({ mentionFrom: ['u1'] }))).toBe(true);
    expect(isTaskFilterActive(crit({ mentionTo: ['u2'] }))).toBe(true);
    expect(isTaskFilterActive(crit({ mentionFrom: [], mentionTo: [] }))).toBe(false);
  });
});

describe('computeVisibleTaskIds', () => {
  it('tree が null なら null', () => {
    expect(computeVisibleTaskIds(null, crit({ keyword: 'x' }))).toBeNull();
  });

  it('フィルタ未指定でも完了を除外した可視集合を返す（完了が無ければ全件 / rete-desk-0056）', () => {
    // 既定ビューは「未完了のみ」。fixture は全 TODO のため全件可視（集合を返す。null ではない）。
    const v = computeVisibleTaskIds(tree, crit());
    expect(v).not.toBeNull();
    expect(v!.has(100)).toBe(true);
    expect(v!.has(101)).toBe(true);
    expect(v!.has(200)).toBe(true);
  });

  it('既定（status 未選択）で完了タスクを除外する（rete-desk-0056）', () => {
    const mixed: DeskTaskTree = {
      categories: [
        {
          id: 1,
          name: 'c',
          sortOrder: 0,
          tasks: [
            node(800, 'やること', null),
            { ...node(801, '済んだこと', null), status: TaskStatus.DONE },
          ],
        },
      ],
    };
    const v = computeVisibleTaskIds(mixed, crit());
    expect(v!.has(800)).toBe(true);
    expect(v!.has(801)).toBe(false); // 完了は既定で除外
  });

  it('「完了」を明示選択すると完了タスクが見える（rete-desk-0056）', () => {
    const mixed: DeskTaskTree = {
      categories: [
        {
          id: 1,
          name: 'c',
          sortOrder: 0,
          tasks: [
            node(800, 'やること', null),
            { ...node(801, '済んだこと', null), status: TaskStatus.DONE },
          ],
        },
      ],
    };
    const v = computeVisibleTaskIds(mixed, crit({ statusFilter: [TaskStatus.DONE] }));
    expect(v!.has(801)).toBe(true);
    expect(v!.has(800)).toBe(false);
  });

  it('キーワード一致は当該ノードのみ可視化する（祖先は含めない / rete-desk-0057）', () => {
    const v = computeVisibleTaskIds(tree, crit({ keyword: '入荷' }));
    // 子(101)のみ一致。親(100)・別件(200)は不可視（厳密一致）。
    expect(v!.has(101)).toBe(true);
    expect(v!.has(100)).toBe(false);
    expect(v!.has(200)).toBe(false);
  });

  it('# 番号でチケットNo検索できる（rete-desk-0052）', () => {
    const v = computeVisibleTaskIds(tree, crit({ keyword: '#200' }));
    expect(v!.has(200)).toBe(true);
    expect(v!.has(100)).toBe(false);
  });

  it('# 無しの純粋数字でもチケットNo（完全一致）で検索できる（rete-desk-0052）', () => {
    const v = computeVisibleTaskIds(tree, crit({ keyword: '200' }));
    expect(v!.has(200)).toBe(true);
    expect(v!.has(100)).toBe(false);
  });

  it('数値検索は完全一致のみで id 部分一致は誤発火しない（rete-desk-0052）', () => {
    // 「20」は id 200 の部分文字列だが完全一致しない → 可視なし（タイトルにも 20 を含まない）。
    const v = computeVisibleTaskIds(tree, crit({ keyword: '20' }));
    expect(v!.size).toBe(0);
  });

  it('期日範囲で絞り込み、範囲外と期日なしを除外する（祖先も含めない / rete-desk-0057）', () => {
    // 6月のみ: 101(6/15)が範囲内, 200(7/1)範囲外, 100(期日なし)除外。祖先100も含めない。
    const v = computeVisibleTaskIds(tree, crit({ dueFrom: '2026-06-01', dueTo: '2026-06-30' }));
    expect(v!.has(101)).toBe(true);
    expect(v!.has(100)).toBe(false);
    expect(v!.has(200)).toBe(false);
  });

  it('キーワード ∧ 期日 の AND 条件', () => {
    // keyword「検収」は200のみ一致だが、期日6月だと200(7/1)は範囲外 → 可視なし
    const v = computeVisibleTaskIds(
      tree,
      crit({ keyword: '検収', dueFrom: '2026-06-01', dueTo: '2026-06-30' }),
    );
    expect(v!.size).toBe(0);
  });

  it('ステータスフィルタ（単一）で当該ステータスのみ可視化する（厳密一致）', () => {
    // fixture は全ノード TODO。DONE 指定なら可視なし、TODO 指定なら全件可視。
    expect(computeVisibleTaskIds(tree, crit({ statusFilter: [TaskStatus.DONE] }))!.size).toBe(0);
    const v = computeVisibleTaskIds(tree, crit({ statusFilter: [TaskStatus.TODO] }));
    expect(v!.has(100)).toBe(true);
    expect(v!.has(101)).toBe(true);
    expect(v!.has(200)).toBe(true);
  });

  it('ステータスフィルタ（複数）は OR 集合（いずれか一致で可視）', () => {
    const mixed: DeskTaskTree = {
      categories: [
        {
          id: 1,
          name: 'c',
          sortOrder: 0,
          tasks: [
            { ...node(300, 'doing', null), status: TaskStatus.IN_PROGRESS },
            { ...node(301, 'review', null), status: TaskStatus.IN_REVIEW },
            { ...node(302, 'done', null), status: TaskStatus.DONE },
          ],
        },
      ],
    };
    const v = computeVisibleTaskIds(
      mixed,
      crit({ statusFilter: [TaskStatus.IN_PROGRESS, TaskStatus.DONE] }),
    );
    expect(v!.has(300)).toBe(true);
    expect(v!.has(301)).toBe(false);
    expect(v!.has(302)).toBe(true);
  });

  it('未着手のみ選択時に対応中の親が混ざらない（rete-desk-0057）', () => {
    // 親=対応中(IN_PROGRESS) > 子=未着手(TODO)。未着手のみ選択 → 子のみ可視・親は不可視。
    const t: DeskTaskTree = {
      categories: [
        {
          id: 1,
          name: 'c',
          sortOrder: 0,
          tasks: [
            {
              ...node(900, '対応中の親', null, [node(901, '未着手の子', null)]),
              status: TaskStatus.IN_PROGRESS,
            },
          ],
        },
      ],
    };
    const v = computeVisibleTaskIds(t, crit({ statusFilter: [TaskStatus.TODO] }));
    expect(v!.has(901)).toBe(true);
    expect(v!.has(900)).toBe(false);
  });

  it('ステータス ∧ キーワード の AND 合成', () => {
    const v = computeVisibleTaskIds(
      tree,
      crit({ keyword: '検収', statusFilter: [TaskStatus.DONE] }),
    );
    // 200(検収)は TODO のため status 不一致 → 可視なし。
    expect(v!.size).toBe(0);
  });

  it('担当者フィルタ（複数選択）で一致ノードのみ可視化する（祖先は含めない / rete-desk-0054）', () => {
    const t: DeskTaskTree = {
      categories: [
        {
          id: 1,
          name: 'c',
          sortOrder: 0,
          tasks: [
            node(400, '親', null, [
              node(401, '子A', null, [], { assignee: { id: 'u9', name: '佐久間' } }),
            ]),
            node(402, '別件', null, [], { assignee: { id: 'u8', name: '中島' } }),
            node(403, '三件目', null, [], { assignee: { id: 'u7', name: '田中' } }),
          ],
        },
      ],
    };
    // 単一指定: u9 の 401 のみ（親 400 は含めない）。
    const single = computeVisibleTaskIds(t, crit({ assigneeIds: ['u9'] }));
    expect(single!.has(401)).toBe(true);
    expect(single!.has(400)).toBe(false);
    expect(single!.has(402)).toBe(false);
    // 複数指定: u9 ∨ u8 → 401, 402。403(u7) は不可視。
    const multi = computeVisibleTaskIds(t, crit({ assigneeIds: ['u9', 'u8'] }));
    expect(multi!.has(401)).toBe(true);
    expect(multi!.has(402)).toBe(true);
    expect(multi!.has(403)).toBe(false);
  });

  it('分類フィルタ（複数選択）で当該分類のノードのみ可視化する（rete-desk-0055）', () => {
    const t: DeskTaskTree = {
      categories: [
        {
          id: 1,
          name: '入荷',
          sortOrder: 0,
          tasks: [node(500, '入荷タスク', null, [], { categoryId: 1 })],
        },
        {
          id: 2,
          name: '出荷',
          sortOrder: 1,
          tasks: [node(600, '出荷タスク', null, [], { categoryId: 2 })],
        },
        {
          id: 3,
          name: '検品',
          sortOrder: 2,
          tasks: [node(700, '検品タスク', null, [], { categoryId: 3 })],
        },
      ],
    };
    // 単一指定: 分類2 のみ。
    const single = computeVisibleTaskIds(t, crit({ categoryIds: [2] }));
    expect(single!.has(600)).toBe(true);
    expect(single!.has(500)).toBe(false);
    // 複数指定: 分類1 ∨ 分類3。
    const multi = computeVisibleTaskIds(t, crit({ categoryIds: [1, 3] }));
    expect(multi!.has(500)).toBe(true);
    expect(multi!.has(700)).toBe(true);
    expect(multi!.has(600)).toBe(false);
  });

  it('顛末フィルタ（toggle）で tenmatsu 非空ノードのみ可視化する（rete-desk-0052相当）', () => {
    const t: DeskTaskTree = {
      categories: [
        {
          id: 1,
          name: 'c',
          sortOrder: 0,
          tasks: [
            node(710, '記録済', null, [], { tenmatsu: '完了報告' }),
            node(711, '空白のみ', null, [], { tenmatsu: '   ' }),
            node(712, '未記録', null, [], { tenmatsu: null }),
          ],
        },
      ],
    };
    const v = computeVisibleTaskIds(t, crit({ tenmatsuOnly: true }));
    expect(v!.has(710)).toBe(true);
    expect(v!.has(711)).toBe(false); // 空白のみは未記録扱い
    expect(v!.has(712)).toBe(false);
  });

  it('mentionTaskIds（サーバー判定済み集合）に含まれるノードのみ可視化し他条件と AND する（dsk-0203）', () => {
    // 集合 {101} のみメンション一致 → 101 だけ可視（100・200 は除外）。
    const only = computeVisibleTaskIds(tree, crit({ mentionTaskIds: new Set([101]) }));
    expect(only!.has(101)).toBe(true);
    expect(only!.has(100)).toBe(false);
    expect(only!.has(200)).toBe(false);
    // AND 合成: keyword「検収」（200 のみ一致）∧ 集合 {101} → 可視なし。
    const and = computeVisibleTaskIds(
      tree,
      crit({ keyword: '検収', mentionTaskIds: new Set([101]) }),
    );
    expect(and!.size).toBe(0);
    // null / 未指定はメンション絞り込みなし（既定集合のまま）。
    const off = computeVisibleTaskIds(tree, crit({ mentionTaskIds: null }));
    expect(off!.size).toBe(3);
  });

  // タスク検索のキーワード対象拡張（dsk-0339）: 説明 / 顛末 本文 にも一致する。説明は Tiptap の
  // RTE HTML 保存値で、要素で分断された語でも本文抽出後に一致させる（HTML タグ名・属性値には
  // 誤マッチしない）。
  describe('タスク検索のキーワード拡張（dsk-0339: 説明 / 顛末本文も対象）', () => {
    function treeWithBody(over: { description: string | null; tenmatsu?: string | null }) {
      return {
        categories: [
          {
            id: 1,
            name: 'c',
            sortOrder: 0,
            tasks: [
              node(501, 'タイトルのみ', null, [], {
                description: over.description,
                tenmatsu: over.tenmatsu ?? null,
              }),
              node(502, '別件', null, [], { description: null, tenmatsu: null }),
            ],
          },
        ],
      };
    }

    it('説明 本文に含まれる語がヒットする（HTML タグは剥がして比較）', () => {
      // 説明が HTML 太字で「在庫」が割れていても「在庫」で 501 を引く。
      const t = treeWithBody({
        description: '<p>本日分の<strong>在庫</strong>を確認してください</p>',
      });
      const v = computeVisibleTaskIds(t, crit({ keyword: '在庫' }));
      expect(v!.has(501)).toBe(true);
      expect(v!.has(502)).toBe(false);
    });

    it('顛末 本文に含まれる語がヒットする', () => {
      const t = treeWithBody({ description: null, tenmatsu: '<p>出荷完了報告</p>' });
      const v = computeVisibleTaskIds(t, crit({ keyword: '出荷完了' }));
      expect(v!.has(501)).toBe(true);
      expect(v!.has(502)).toBe(false);
    });

    it('HTML タグ名・属性値には誤マッチしない', () => {
      // "class" はタグ属性にも現れるが、本文テキストに含まれていないのでヒットしない。
      // "color" も属性値で本文にない。
      const t = treeWithBody({
        description: '<p class="note" style="color:red">入荷予定</p>',
      });
      const vClass = computeVisibleTaskIds(t, crit({ keyword: 'class' }));
      expect(vClass!.has(501)).toBe(false);
      const vColor = computeVisibleTaskIds(t, crit({ keyword: 'color' }));
      expect(vColor!.has(501)).toBe(false);
      const vReal = computeVisibleTaskIds(t, crit({ keyword: '入荷' }));
      expect(vReal!.has(501)).toBe(true);
    });

    it('説明 / 顛末 が null のときは description/tenmatsu 経路で落ちない', () => {
      const t = treeWithBody({ description: null, tenmatsu: null });
      // title だけが "タイトルのみ" のため、何もヒットしないクエリでも 502 も 501 も条件次第。
      // ここでは「タイトル部分一致」「説明／顛末不一致」の回帰がないことを確認。
      const v = computeVisibleTaskIds(t, crit({ keyword: '存在する語' }));
      expect(v!.size).toBe(0);
      // タイトル一致は生きること。
      const v2 = computeVisibleTaskIds(t, crit({ keyword: 'タイトルのみ' }));
      expect(v2!.has(501)).toBe(true);
    });

    it('kw 空のときは従来どおり（＝説明 / 顛末 は判定に使わない）', () => {
      // kw 空なら selfMatches のキーワード分岐自体を飛ばす（既存挙動の回帰防止）。
      const t = treeWithBody({
        description: '<p>在庫</p>',
        tenmatsu: '<p>出荷</p>',
      });
      const v = computeVisibleTaskIds(t, crit());
      // 既定 = 完了除外の集合。fixture は全 TODO なので 501/502 とも可視。
      expect(v!.has(501)).toBe(true);
      expect(v!.has(502)).toBe(true);
    });

    it('タイトル・説明・顛末 横断で部分一致（大文字小文字無視）', () => {
      const t = treeWithBody({
        description: '<p>Report on TOKUTEI</p>',
        tenmatsu: null,
      });
      // 小文字クエリで大文字本文を引く。
      expect(computeVisibleTaskIds(t, crit({ keyword: 'tokutei' }))!.has(501)).toBe(true);
      expect(computeVisibleTaskIds(t, crit({ keyword: 'REPORT' }))!.has(501)).toBe(true);
    });
  });
});

describe('countVisibleTasksInGroup / shouldHideGroupHead（rete-desk-0037）', () => {
  const groupTasks = tree.categories[0].tasks; // [100(>101), 200]

  it('絞り込み無効（null）は全ノード数を返し、見出しは隠さない', () => {
    expect(countVisibleTasksInGroup(groupTasks, null)).toBe(3); // 100,101,200
    expect(shouldHideGroupHead(groupTasks, null)).toBe(false);
  });

  it('可視集合に含まれるノードのみ数える（子孫まで再帰）', () => {
    const visible = new Set<number>([100, 101]);
    expect(countVisibleTasksInGroup(groupTasks, visible)).toBe(2);
    expect(shouldHideGroupHead(groupTasks, visible)).toBe(false);
  });

  it('絞り込み中で可視0なら見出しを隠す', () => {
    expect(shouldHideGroupHead(groupTasks, new Set<number>())).toBe(true);
  });
});

describe('useDeskSearch', () => {
  it('chatKeyword 変更で chatFiltered が立つ（絞り込みは server / filteredThemes は passthrough・A案）', () => {
    const { result } = renderHook(() => useDeskSearch({ themes, tree }));
    expect(result.current.filteredThemes).toHaveLength(3);
    expect(result.current.chatFiltered).toBe(false);

    act(() => result.current.setChatKeyword('出荷'));
    // 絞り込みは useChatThemes 経由で server が行うため、hook の filteredThemes は themes を素通しする。
    expect(result.current.filteredThemes).toHaveLength(3);
    expect(result.current.chatKeyword).toBe('出荷');
    expect(result.current.chatFiltered).toBe(true);
  });

  it('既定で visibleTaskIds は完了除外の集合を返し、taskKeyword で絞り込まれる（rete-desk-0056）', () => {
    const { result } = renderHook(() => useDeskSearch({ themes, tree }));
    // 既定（明示フィルタなし）でも完了除外ベースラインの集合を返す（null ではない）。fixture 全 TODO → 全件可視。
    expect(result.current.visibleTaskIds!.has(100)).toBe(true);
    expect(result.current.visibleTaskIds!.has(200)).toBe(true);

    act(() => result.current.setTaskKeyword('検収'));
    expect(result.current.visibleTaskIds!.has(200)).toBe(true);
    expect(result.current.visibleTaskIds!.has(101)).toBe(false);
  });

  it('toggleStatus で statusFilter が選択 ⇄ 解除し visibleTaskIds に反映される', () => {
    const { result } = renderHook(() => useDeskSearch({ themes, tree }));
    expect(result.current.statusFilter).toEqual([]);

    act(() => result.current.toggleStatus(TaskStatus.DONE));
    expect(result.current.statusFilter).toEqual([TaskStatus.DONE]);
    // fixture は全 TODO のため DONE 指定で可視なし。
    expect(result.current.visibleTaskIds!.size).toBe(0);

    act(() => result.current.toggleStatus(TaskStatus.DONE));
    expect(result.current.statusFilter).toEqual([]);
    // 解除後は既定（完了除外）の集合に戻る。fixture 全 TODO → 全件可視。
    expect(result.current.visibleTaskIds!.size).toBe(3);
  });

  it('taskFiltered は明示フィルタ時のみ true（既定の完了除外は明示フィルタに数えない / rete-desk-0056・0057）', () => {
    const { result } = renderHook(() => useDeskSearch({ themes, tree }));
    expect(result.current.taskFiltered).toBe(false);

    act(() => result.current.toggleStatus(TaskStatus.TODO));
    expect(result.current.taskFiltered).toBe(true);

    act(() => result.current.clearTask());
    expect(result.current.taskFiltered).toBe(false);
  });

  it('toggleAssignee / toggleCategory は複数選択をトグルする（rete-desk-0054・0055）', () => {
    const { result } = renderHook(() => useDeskSearch({ themes, tree }));
    act(() => {
      result.current.toggleAssignee('u1');
      result.current.toggleAssignee('u2');
    });
    expect(result.current.assigneeFilter).toEqual(['u1', 'u2']);
    act(() => result.current.toggleAssignee('u1'));
    expect(result.current.assigneeFilter).toEqual(['u2']);

    act(() => {
      result.current.toggleCategory(1);
      result.current.toggleCategory(3);
    });
    expect(result.current.categoryFilter).toEqual([1, 3]);
    act(() => result.current.toggleCategory(1));
    expect(result.current.categoryFilter).toEqual([3]);
  });

  it('clearTask でキーワード + 期日範囲 + ステータス + 担当者 + 分類 + 顛末がリセットされる', () => {
    const { result } = renderHook(() => useDeskSearch({ themes, tree }));
    act(() => {
      result.current.setTaskKeyword('検収');
      result.current.setDueRange({ from: '2026-06-01', to: '2026-06-30' });
      result.current.toggleStatus(TaskStatus.TODO);
      result.current.toggleAssignee('u1');
      result.current.toggleCategory(2);
      result.current.toggleTenmatsuOnly();
    });
    expect(result.current.taskFiltered).toBe(true);

    act(() => result.current.clearTask());
    expect(result.current.taskKeyword).toBe('');
    expect(result.current.dueFrom).toBe('');
    expect(result.current.dueTo).toBe('');
    expect(result.current.statusFilter).toEqual([]);
    expect(result.current.assigneeFilter).toEqual([]);
    expect(result.current.categoryFilter).toEqual([]);
    expect(result.current.tenmatsuOnly).toBe(false);
    // クリア後は既定（完了除外）の集合に戻る（null ではない）。
    expect(result.current.taskFiltered).toBe(false);
  });

  it('archiveOnly トグルで状態と chatFiltered が反転する（絞り込みは server / rete-desk-0061）', () => {
    const mixed = [theme('t1', '通常'), theme('t2', 'アーカイブ済', true)];
    const { result } = renderHook(() => useDeskSearch({ themes: mixed, tree }));
    // filteredThemes は passthrough（server が除外済みの集合を返す前提）。hook では間引かない。
    expect(result.current.filteredThemes.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(result.current.archiveOnly).toBe(false);
    expect(result.current.chatFiltered).toBe(false);

    act(() => result.current.toggleArchiveOnly());
    expect(result.current.archiveOnly).toBe(true);
    expect(result.current.chatFiltered).toBe(true);
  });

  it('toggleStatus の再トグルでステータスが解除される（rete-desk-0050）', () => {
    const { result } = renderHook(() => useDeskSearch({ themes, tree }));
    act(() => {
      result.current.toggleStatus(TaskStatus.TODO);
      result.current.toggleStatus(TaskStatus.DONE);
    });
    expect(result.current.statusFilter).toHaveLength(2);

    // 全解除手段は外部クリアボタン（clearTask）。個別解除は再トグル。
    act(() => {
      result.current.toggleStatus(TaskStatus.TODO);
      result.current.toggleStatus(TaskStatus.DONE);
    });
    expect(result.current.statusFilter).toEqual([]);
  });

  it('toggleChatTenmatsuOnly で状態と chatFiltered が立つ（絞り込みは server / rete-desk-0050）', () => {
    const mixed = [theme('t1', '記録済', false, true), theme('t2', '未記録', false, false)];
    const { result } = renderHook(() => useDeskSearch({ themes: mixed, tree }));
    // filteredThemes は passthrough。記録済のみへの絞り込みは server が行う。
    expect(result.current.filteredThemes).toHaveLength(2);
    expect(result.current.chatTenmatsuOnly).toBe(false);
    expect(result.current.chatFiltered).toBe(false);

    act(() => result.current.toggleChatTenmatsuOnly());
    expect(result.current.chatTenmatsuOnly).toBe(true);
    expect(result.current.chatFiltered).toBe(true);
  });

  it('clearChat でキーワードとアーカイブと顛末がリセットされる', () => {
    const mixed = [theme('t1', '通常', false, true), theme('t2', 'アーカイブ済', true)];
    const { result } = renderHook(() => useDeskSearch({ themes: mixed, tree }));
    act(() => {
      result.current.setChatKeyword('通常');
      result.current.toggleArchiveOnly();
      result.current.toggleChatTenmatsuOnly();
    });
    act(() => result.current.clearChat());
    expect(result.current.chatKeyword).toBe('');
    expect(result.current.archiveOnly).toBe(false);
    expect(result.current.chatTenmatsuOnly).toBe(false);
  });

  // メンション From/To（rete-desk-0049）。From/To とも複数選択・「全て」項目なし・クリアで一括解除・
  // chatFiltered への反映を検証する。絞り込み自体はサーバー側（§5.3 A案）のため filteredThemes は mention で
  // 間引かない（ここでは状態と派生フラグのみを対象とする）。
  describe('メンション From/To 状態', () => {
    it('初期状態の mentionFrom / mentionTo は空配列', () => {
      const { result } = renderHook(() => useDeskSearch({ themes, tree }));
      expect(result.current.mentionFrom).toEqual([]);
      expect(result.current.mentionTo).toEqual([]);
    });

    it('toggleMentionFrom で id を選択 ⇄ 解除（複数選択 OR 集合）', () => {
      const { result } = renderHook(() => useDeskSearch({ themes, tree }));
      act(() => result.current.toggleMentionFrom('acc-1'));
      act(() => result.current.toggleMentionFrom('acc-2'));
      expect(result.current.mentionFrom).toEqual(['acc-1', 'acc-2']);
      act(() => result.current.toggleMentionFrom('acc-1'));
      expect(result.current.mentionFrom).toEqual(['acc-2']);
    });

    it('toggleMentionTo で id を選択 ⇄ 解除', () => {
      const { result } = renderHook(() => useDeskSearch({ themes, tree }));
      act(() => result.current.toggleMentionTo('acc-9'));
      expect(result.current.mentionTo).toEqual(['acc-9']);
      act(() => result.current.toggleMentionTo('acc-9'));
      expect(result.current.mentionTo).toEqual([]);
    });

    it('mentionFrom / mentionTo は独立した軸（互いに干渉しない）', () => {
      const { result } = renderHook(() => useDeskSearch({ themes, tree }));
      act(() => result.current.toggleMentionFrom('from-1'));
      act(() => result.current.toggleMentionTo('to-1'));
      expect(result.current.mentionFrom).toEqual(['from-1']);
      expect(result.current.mentionTo).toEqual(['to-1']);
    });

    it('mentionFrom か mentionTo が非空なら chatFiltered = true', () => {
      const { result } = renderHook(() => useDeskSearch({ themes, tree }));
      expect(result.current.chatFiltered).toBe(false);
      act(() => result.current.toggleMentionFrom('acc-1'));
      expect(result.current.chatFiltered).toBe(true);
    });

    it('clearChat で mentionFrom / mentionTo を含むチャットフィルタを一括解除', () => {
      const { result } = renderHook(() => useDeskSearch({ themes, tree }));
      act(() => {
        result.current.setChatKeyword('入荷');
        result.current.toggleArchiveOnly();
        result.current.toggleMentionFrom('acc-1');
        result.current.toggleMentionTo('acc-2');
      });
      act(() => result.current.clearChat());
      expect(result.current.chatKeyword).toBe('');
      expect(result.current.archiveOnly).toBe(false);
      expect(result.current.mentionFrom).toEqual([]);
      expect(result.current.mentionTo).toEqual([]);
      expect(result.current.chatFiltered).toBe(false);
    });
  });

  // タスク側メンション From/To（dsk-0203）。判定はサーバー（GET /tasks・モック）で行い、
  // 一致 id 集合が visibleTaskIds へ AND 合流することを検証する。
  describe('タスク側メンション From/To 状態', () => {
    it('toggleTaskMentionFrom で GET /tasks へ問い合わせ、一致集合が visibleTaskIds に反映される', async () => {
      const { result } = renderHook(() => useDeskSearch({ themes, tree }));
      expect(result.current.taskMentionFrom).toEqual([]);
      // 未選択時は fetch しない（フィルタ不適用）。
      expect(fetchTasks).not.toHaveBeenCalled();
      expect(result.current.visibleTaskIds!.size).toBe(3);

      act(() => result.current.toggleTaskMentionFrom('acc-1'));
      expect(result.current.taskMentionFrom).toEqual(['acc-1']);
      expect(result.current.taskFiltered).toBe(true);
      // モックは {101, 200} を一致として返す → 100 が集合から落ちる。
      await waitFor(() => expect(result.current.visibleTaskIds!.has(100)).toBe(false));
      expect(result.current.visibleTaskIds!.has(101)).toBe(true);
      expect(result.current.visibleTaskIds!.has(200)).toBe(true);
      expect(fetchTasks).toHaveBeenCalledWith(
        expect.objectContaining({ mentionFrom: ['acc-1'], page: 1, limit: 100 }),
      );
    });

    it('clearTask でタスク側メンション From/To も一括解除される', async () => {
      const { result } = renderHook(() => useDeskSearch({ themes, tree }));
      act(() => {
        result.current.toggleTaskMentionFrom('acc-1');
        result.current.toggleTaskMentionTo('acc-2');
      });
      expect(result.current.taskMentionFrom).toEqual(['acc-1']);
      expect(result.current.taskMentionTo).toEqual(['acc-2']);
      await waitFor(() => expect(result.current.visibleTaskIds!.has(100)).toBe(false));

      act(() => result.current.clearTask());
      expect(result.current.taskMentionFrom).toEqual([]);
      expect(result.current.taskMentionTo).toEqual([]);
      expect(result.current.taskFiltered).toBe(false);
      // 解除で既定（完了除外）の集合へ戻る。
      expect(result.current.visibleTaskIds!.size).toBe(3);
    });
  });
});
