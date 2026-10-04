import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { TaskTree } from '../components/task-tree';
import { applyMove } from '../lib/drop-projection';
import type { DeskTaskTree, DeskTaskNode } from '../lib/api';
import type { Category } from '@/features/tasks/lib/api';
import type { ProvisionalRow } from '../hooks/use-chat-promotion';
import { TaskStatus } from '@rete/shared';

// useDroppable / useDraggable は DndContext 配下を要求する。D&D 構造を見るテストはこのラッパで包む
// （描画のみのテストは standalone でも default context で落ちないため従来通り）。
const withDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>);

const base = {
  description: null,
  categoryId: 1,
  parentTaskId: null as number | null,
  assigneeName: '山田',
  startDate: null,
  dueDate: '2026-06-12T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
  sourceThemeId: null,
  sourceTheme: null,
};

const node = (over: Partial<DeskTaskNode>): DeskTaskNode =>
  ({
    ...base,
    id: 1,
    title: 'タスク',
    status: TaskStatus.TODO,
    children: [],
    ...over,
  }) as DeskTaskNode;

const tree: DeskTaskTree = {
  categories: [
    {
      id: 1,
      name: '入荷管理',
      sortOrder: 0,
      tasks: [
        node({
          id: 1,
          title: '親タスク',
          status: TaskStatus.IN_PROGRESS,
          children: [node({ id: 2, title: '子タスク', parentTaskId: 1 })],
        }),
      ],
    },
    {
      id: 2,
      name: '出荷管理',
      sortOrder: 1,
      tasks: [node({ id: 3, title: '出荷タスク', categoryId: 2, status: TaskStatus.DONE })],
    },
  ],
};

describe('TaskTree', () => {
  it('カテゴリ見出しを描画すること', () => {
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('入荷管理')).toBeInTheDocument();
    expect(screen.getByText('出荷管理')).toBeInTheDocument();
  });

  it('親・子・別カテゴリのタスクを全て描画すること', () => {
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('親タスク')).toBeInTheDocument();
    expect(screen.getByText('子タスク')).toBeInTheDocument();
    expect(screen.getByText('出荷タスク')).toBeInTheDocument();
  });

  it('子タスクを 1 段インデント（data-depth=1）で描画すること', () => {
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    const childRow = screen.getByText('子タスク').closest('button');
    expect(childRow).toHaveAttribute('data-depth', '1');
    const parentRow = screen.getByText('親タスク').closest('button');
    expect(parentRow).toHaveAttribute('data-depth', '0');
  });

  it('ステータスバッジ（ラベル）を表示すること', () => {
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('対応中')).toBeInTheDocument();
    expect(screen.getByText('完了')).toBeInTheDocument();
  });

  it('行クリックで onSelect に id を渡すこと', () => {
    const onSelect = vi.fn();
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('親タスク').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('タスクが無い時は空状態を表示すること', () => {
    render(
      <TaskTree
        tree={{ categories: [] }}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('タスクがありません')).toBeInTheDocument();
  });

  it('エラー時はエラーメッセージを表示すること', () => {
    render(
      <TaskTree
        tree={null}
        loading={false}
        error="取得失敗"
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('取得失敗')).toBeInTheDocument();
  });

  it('taskKeyword 指定時はタスク名の一致箇所を sp-search-hl でハイライトすること（cmn-0092）', () => {
    const { container } = render(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        taskKeyword="タスク"
      />,
    );
    const row = container.querySelector('[data-task-id="1"] .desk-task-title')!;
    const marks = row.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveClass('sp-search-hl');
    expect(marks[0]).toHaveTextContent('タスク');
    expect(row).toHaveTextContent('親タスク');
  });

  it('taskKeyword 未指定時はハイライトしないこと', () => {
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    const title = screen.getByText('親タスク').closest('.desk-task-title')!;
    expect(title.querySelectorAll('mark')).toHaveLength(0);
  });
});

describe('TaskTree — アクティブ枠は activeId で描く・詳細を閉じても残る（dsk-0401）', () => {
  const rowEl = (title: string) => screen.getByText(title).closest('button')!;

  it('activeId 未指定時は selectedId で枠を描く（後方互換）', () => {
    render(<TaskTree tree={tree} loading={false} error={null} selectedId={1} onSelect={vi.fn()} />);
    expect(rowEl('親タスク').classList.contains('sp-row-ring')).toBe(true);
    expect(rowEl('子タスク').classList.contains('sp-row-ring')).toBe(false);
  });

  it('selectedId=null（詳細を閉じた状態）でも activeId が残っていれば枠が付く', () => {
    render(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        activeId={1}
        onSelect={vi.fn()}
      />,
    );
    expect(rowEl('親タスク').classList.contains('sp-row-ring')).toBe(true);
  });

  it('selectedId=null かつ activeId=null なら枠は付かない（初期状態）', () => {
    render(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        activeId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowEl('親タスク').classList.contains('sp-row-ring')).toBe(false);
  });
});

describe('TaskTree — 顛末アイコンは実データ（task.tenmatsu）で判定する', () => {
  // 顛末アイコン = .desk-thread-tenmatsu。サンプルハッシュ（sampleTaskMeta）ではなく
  // task.tenmatsu の非空で出し分ける。id=4 はハッシュ上は顛末ありだが tenmatsu=null なら出さない
  // （開発統括報告のバグ「顛末がないのに顛末アイコンが付く」を捕捉する）。id=1 はハッシュ上は顛末なしだが
  // tenmatsu に本文があれば出す。
  const tenmatsuTree: DeskTaskTree = {
    categories: [
      {
        id: 1,
        name: '入荷管理',
        sortOrder: 0,
        tasks: [
          node({ id: 1, title: '顛末ありタスク', tenmatsu: '対応済の結論' }),
          node({ id: 4, title: '顛末なしタスク', tenmatsu: null }),
          node({ id: 5, title: '空白のみタスク', tenmatsu: '   ' }),
        ],
      },
    ],
  };

  const rowTenmatsuIcon = (title: string) =>
    screen.getByText(title).closest('button')!.querySelector('.desk-thread-tenmatsu');

  it('tenmatsu が非空のタスクにのみ顛末アイコンを描画すること', () => {
    render(
      <TaskTree
        tree={tenmatsuTree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowTenmatsuIcon('顛末ありタスク')).not.toBeNull();
  });

  it('tenmatsu が null のタスクには顛末アイコンを描画しないこと（ハッシュ上は顛末ありの id でも）', () => {
    render(
      <TaskTree
        tree={tenmatsuTree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowTenmatsuIcon('顛末なしタスク')).toBeNull();
  });

  it('tenmatsu が空白のみのタスクは未記録扱いで顛末アイコンを描画しないこと', () => {
    render(
      <TaskTree
        tree={tenmatsuTree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowTenmatsuIcon('空白のみタスク')).toBeNull();
  });
});

describe('TaskTree — 絞り込み連動 0件グループ見出し非表示（rete-desk-0037）', () => {
  it('絞り込み無効（visibleTaskIds=null）なら全カテゴリ見出しを表示する', () => {
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('入荷管理')).toBeInTheDocument();
    expect(screen.getByText('出荷管理')).toBeInTheDocument();
  });

  it('明示フィルタ中、可視0のグループ見出しは隠し、可視ありのグループ見出しは残す', () => {
    // 可視集合 = {1,2}（入荷管理配下のみ）。出荷管理(#3)は可視0 → 見出し非表示。
    // 既定の完了除外ではなく明示フィルタ中のみ畳むため taskFiltered を渡す（rete-desk-0056）。
    render(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        visibleTaskIds={new Set<number>([1, 2])}
        taskFiltered
      />,
    );
    expect(screen.getByText('入荷管理')).toBeInTheDocument();
    expect(screen.queryByText('出荷管理')).toBeNull();
  });

  it('明示フィルタ中で全グループ可視0なら全見出しを隠す', () => {
    render(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        visibleTaskIds={new Set<number>()}
        taskFiltered
      />,
    );
    expect(screen.queryByText('入荷管理')).toBeNull();
    expect(screen.queryByText('出荷管理')).toBeNull();
  });

  it('既定ビュー（明示フィルタなし）では可視0でもグループ見出しを残す（D&D 落とし先維持 / rete-desk-0056）', () => {
    // visibleTaskIds は集合だが taskFiltered=false（完了除外のみの既定ビュー）→ 見出しは畳まない。
    render(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        visibleTaskIds={new Set<number>([1, 2])}
      />,
    );
    expect(screen.getByText('入荷管理')).toBeInTheDocument();
    expect(screen.getByText('出荷管理')).toBeInTheDocument();
  });
});

describe('TaskTree — グループ折り畳み（rete-desk-0081 アコーディオン）', () => {
  it('見出しクリックで配下の行を畳み（is-hidden）、再クリックで戻すこと', () => {
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    // 初期は展開（行ボタンは is-hidden を持たない）。行・gap は常時 DOM に残す（D&D 落とし先維持）。
    expect(screen.getByText('親タスク').closest('button')).not.toHaveClass('is-hidden');

    // 「入荷管理」見出しをクリック → 配下行ボタンが is-hidden（display:none）になる。
    fireEvent.click(screen.getByRole('button', { name: '入荷管理' }));
    expect(screen.getByText('親タスク').closest('button')).toHaveClass('is-hidden');
    expect(screen.getByText('子タスク').closest('button')).toHaveClass('is-hidden');
    // 別カテゴリ（出荷管理）は影響を受けない。
    expect(screen.getByText('出荷タスク').closest('button')).not.toHaveClass('is-hidden');

    // 再クリックで戻る。
    fireEvent.click(screen.getByRole('button', { name: '入荷管理' }));
    expect(screen.getByText('親タスク').closest('button')).not.toHaveClass('is-hidden');
  });

  it('折り畳んだ見出しは aria-expanded=false / is-collapsed を持つこと', () => {
    render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    const head = screen.getByRole('button', { name: '入荷管理' });
    expect(head).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(head.className).toContain('is-collapsed');
  });
});

describe('TaskTree — 絞り込みで可視0グループは全体を畳む（rete-desk-0055 残余余白解消）', () => {
  it('可視0グループは .desk-task-group.is-hidden で畳み、可視ありは畳まないこと', () => {
    const { container } = render(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        visibleTaskIds={new Set<number>([1, 2])}
        taskFiltered
      />,
    );
    // 可視0の「出荷管理」グループは is-hidden（display:none で残余余白を出さない）。
    const hidden = container.querySelectorAll('.desk-task-group.is-hidden');
    expect(hidden.length).toBe(1);
    // 可視ありの「入荷管理」グループは is-hidden を持たない。
    const visibleGroup = screen.getByText('入荷管理').closest('.desk-task-group');
    expect(visibleGroup?.className).not.toContain('is-hidden');
  });

  it('絞り込み無効（null）ならどのグループも is-hidden にしないこと', () => {
    const { container } = render(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(container.querySelectorAll('.desk-task-group.is-hidden').length).toBe(0);
  });
});

describe('TaskTree — 空カテゴリ非表示 + 空チャネルの落とし先（rete-desk-0171/0172/0173）', () => {
  const cats = [
    {
      id: 1,
      name: '入荷管理',
      sortOrder: 0,
      archived: false,
      spaceId: 's1',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 5,
      name: '検品',
      sortOrder: 1,
      archived: false,
      spaceId: 's1',
      createdAt: '',
      updatedAt: '',
    },
  ];

  it('タスク0件のカテゴリは見出しも append ゾーンも描画しないこと（0171: 所属タスクがある分類のみ表示）', () => {
    // カテゴリ1 のみタスクあり。カテゴリ5 は空 → 見出し / append とも描かない。
    const { container } = withDnd(
      <TaskTree
        tree={{
          categories: [
            { id: 1, name: '入荷管理', sortOrder: 0, tasks: [node({ id: 1, title: '在庫確認' })] },
          ],
        }}
        categories={cats}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('入荷管理')).toBeInTheDocument();
    expect(screen.queryByText('検品')).toBeNull();
    expect(container.querySelector('[data-drop-id="cat-5-append"]')).toBeNull();
  });

  it('全カテゴリが空（=空チャネル）なら空状態と単一ドロップゾーン（empty-tree-drop）を描くこと（0172: 新チャネルでも D&D 昇格できる）', () => {
    const { container } = withDnd(
      <TaskTree
        tree={{ categories: [] }}
        categories={cats}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    // 空カテゴリの見出し / append は描かない（0171）。
    expect(screen.queryByText('入荷管理')).toBeNull();
    expect(screen.queryByText('検品')).toBeNull();
    expect(container.querySelector('[data-drop-id="cat-1-append"]')).toBeNull();
    expect(container.querySelector('[data-drop-id="cat-5-append"]')).toBeNull();
    // 代わりに空チャネル用の単一ドロップゾーンを敷く。
    expect(screen.getByText('タスクがありません')).toBeInTheDocument();
    expect(container.querySelector('[data-drop-id="empty-tree-drop"]')).not.toBeNull();
  });

  it('空チャネルのドロップ箱は indicator.gapIndex=0 のとき 1 個だけ描くこと（0173: シャドウ二重表示の解消）', () => {
    const { container } = withDnd(
      <TaskTree
        tree={{ categories: [] }}
        categories={cats}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        dropIndicator={{ gapIndex: 0, depth: 0 }}
      />,
    );
    expect(container.querySelectorAll('[data-drop-indicator="true"]').length).toBe(1);
  });

  it('categories が空配列でも空状態 + 単一ドロップゾーンを描くこと', () => {
    const { container } = withDnd(
      <TaskTree
        tree={{ categories: [] }}
        categories={[]}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('タスクがありません')).toBeInTheDocument();
    expect(container.querySelector('[data-drop-id="empty-tree-drop"]')).not.toBeNull();
  });
});

describe('TaskTree — 未分類バケット（categoryId=null / rete-desk-0158）', () => {
  const cats = [
    {
      id: 1,
      name: '入荷管理',
      sortOrder: 0,
      archived: false,
      spaceId: 's1',
      createdAt: '',
      updatedAt: '',
    },
  ];
  // backend が返す未分類バケット（id=null・末尾の大きい sortOrder・未分類タスクを集約）。
  const treeWithUnassigned: DeskTaskTree = {
    categories: [
      { id: 1, name: '入荷管理', sortOrder: 0, tasks: [node({ id: 1, title: '分類済みタスク' })] },
      {
        id: null,
        name: '未分類',
        sortOrder: 9999,
        tasks: [node({ id: 9, title: '未分類タスク', categoryId: null })],
      },
    ],
  };

  it('未分類バケットを「未分類」見出し + タスクで描画すること', () => {
    withDnd(
      <TaskTree
        tree={treeWithUnassigned}
        categories={cats}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('未分類')).toBeInTheDocument();
    expect(screen.getByText('未分類タスク')).toBeInTheDocument();
    expect(screen.getByText('分類済みタスク')).toBeInTheDocument();
  });

  it('未分類バケットに append ドロップゾーン（cat-null-append）を敷くこと（移動の落とし先）', () => {
    const { container } = withDnd(
      <TaskTree
        tree={treeWithUnassigned}
        categories={cats}
        draggableTasks
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-drop-id="cat-null-append"]')).not.toBeNull();
  });

  it('未分類バケットにタスクが無ければ見出しを描かないこと（空ツリーは分類見出しが落とし先を担う）', () => {
    withDnd(
      <TaskTree
        tree={{
          categories: [{ id: 1, name: '入荷管理', sortOrder: 0, tasks: [node({ id: 1 })] }],
        }}
        categories={cats}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText('未分類')).toBeNull();
    expect(screen.getByText('入荷管理')).toBeInTheDocument();
  });
});

describe('TaskTree — D&D ドロップゾーン（行間 + 緑枠 一本化）', () => {
  it('全行間に gap droppable（task-gap）を敷くこと', () => {
    const { container } = withDnd(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    // 行は #1 #2 #3 の 3 つ。各行の直前 gap = gap-0..gap-2。末尾 gap はカテゴリ append ゾーンが兼ねる。
    expect(container.querySelector('[data-drop-id="gap-0"]')).not.toBeNull();
    expect(container.querySelector('[data-drop-id="gap-1"]')).not.toBeNull();
    expect(container.querySelector('[data-drop-id="gap-2"]')).not.toBeNull();
    // 末尾の落とし先（最終カテゴリ append）も task-gap として存在する。
    expect(container.querySelector('[data-drop-id="cat-2-append"]')).not.toBeNull();
  });

  it('行被りの child dropp（row-N-child）を一切描画しないこと（一本化）', () => {
    const { container } = withDnd(
      <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(container.querySelector('[data-drop-id="row-1-child"]')).toBeNull();
    expect(container.querySelector('[data-drop-id="row-2-child"]')).toBeNull();
    expect(container.querySelector('[data-drop-id="sib-1"]')).toBeNull();
  });

  it('タスク行が draggable（task-move）であること', () => {
    const { container } = withDnd(
      <TaskTree
        tree={tree}
        draggableTasks
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    // draggable 化された行は data-task-drag 属性を持つ。
    expect(container.querySelector('[data-task-drag="1"]')).not.toBeNull();
    expect(container.querySelector('[data-task-drag="2"]')).not.toBeNull();
  });

  it('dropIndicator の gap に緑枠（採用 depth のインデント位置）を描くこと', () => {
    const { container } = withDnd(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        dropIndicator={{ gapIndex: 1, depth: 1 }}
      />,
    );
    const box = container.querySelector('[data-drop-indicator="true"]');
    expect(box).not.toBeNull();
    // 採用 depth=1 が data 属性で読める（緑枠の左インデント位置）。
    expect(box?.getAttribute('data-indicator-depth')).toBe('1');
  });

  it('カテゴリ境界の gap でドロップ箱を二重に描かないこと（グループN末尾 append と N+1先頭行の gapIndex 衝突）', () => {
    // fixture: 入荷管理[#1>#2] / 出荷管理[#3]。flatten 順 #1(0) #2(1) #3(2)。
    // グループ1 の append gapIndex = 2、グループ2 先頭行 #3 の gapIndex も 2 で衝突する。
    // ここに indicator が来ても描かれる箱は 1 個でなければならない。
    const { container } = withDnd(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        dropIndicator={{ gapIndex: 2, depth: 0 }}
      />,
    );
    const boxes = container.querySelectorAll('[data-drop-indicator="true"]');
    expect(boxes.length).toBe(1);
  });

  it('dsk-0237: 分類境界の箱は当該分類の末尾（cat-N-append＝視覚的下端）に描き、次分類先頭行 gap には描かないこと', () => {
    // fixture: 入荷管理[#1>#2] / 出荷管理[#3]。境界 gapIndex=2 は cat-1 末尾 append と
    // cat-2 先頭行 #3 の gap-2 が衝突する。箱は cat-1 の末尾（視覚的下端）に出るのが正解で、
    // 次分類見出しの下（gap-2）に出ると最下部へフォーカスできない（本チケットの不具合）。
    const { container } = withDnd(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        dropIndicator={{ gapIndex: 2, depth: 0 }}
      />,
    );
    // 箱は cat-1-append（入荷管理の末尾）に出る。
    expect(
      container.querySelector('[data-drop-id="cat-1-append"] [data-drop-indicator="true"]'),
    ).not.toBeNull();
    // 次分類先頭行 gap-2（出荷管理の見出しの下）には出ない。
    expect(
      container.querySelector('[data-drop-id="gap-2"] [data-drop-indicator="true"]'),
    ).toBeNull();
  });

  it('dsk-0256: 境界 gap を実際にホバー中（boundaryPrependCategoryId 付き indicator）なら箱は gap-2 側（次分類の先頭）に出て cat-1-append 側には出ないこと', () => {
    // 同じ gapIndex=2 でも「境界ゾーンを実際にホバーしている」ことを示す boundaryPrependCategoryId
    // 付き indicator が来た場合は、箱の描画権が cat-1-append（末尾 append）から gap-2（次分類先頭への
    // prepend）へ切り替わる。二重描画にはならない（排他）。
    const { container } = withDnd(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        dropIndicator={{ gapIndex: 2, depth: 0, boundaryPrependCategoryId: 2 }}
      />,
    );
    const boxes = container.querySelectorAll('[data-drop-indicator="true"]');
    expect(boxes.length).toBe(1);
    expect(
      container.querySelector('[data-drop-id="gap-2"] [data-drop-indicator="true"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-drop-id="cat-1-append"] [data-drop-indicator="true"]'),
    ).toBeNull();
  });

  it('カテゴリ境界の gap で仮挿入行（ghost）も二重に描かないこと', () => {
    // box と同じく gapIndex=2 はグループ1 append と グループ2先頭行で衝突する。
    const provisional: ProvisionalRow = { title: '昇格タスク', gapIndex: 2, depth: 0 };
    const { container } = withDnd(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        provisionalRow={provisional}
      />,
    );
    const ghosts = container.querySelectorAll('[data-provisional="true"]');
    expect(ghosts.length).toBe(1);
  });

  it('dsk-0256: boundaryPrependCategoryId 付き provisional は gap-2 側（次分類先頭）に ghost を出すこと', () => {
    const provisional: ProvisionalRow = {
      title: '昇格タスク',
      gapIndex: 2,
      depth: 0,
      boundaryPrependCategoryId: 2,
    };
    const { container } = withDnd(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        provisionalRow={provisional}
      />,
    );
    const ghosts = container.querySelectorAll('[data-provisional="true"]');
    expect(ghosts.length).toBe(1);
    expect(
      container.querySelector('[data-drop-id="gap-2"] [data-provisional="true"]'),
    ).not.toBeNull();
  });

  it('仮挿入行（未保存バッジつき）を gap 位置に描画すること', () => {
    // gapIndex 3 = 末尾（#1 #2 #3 の後ろ）。
    const provisional: ProvisionalRow = {
      title: '新しいタスク',
      gapIndex: 3,
      depth: 0,
    };
    const { container } = withDnd(
      <TaskTree
        tree={tree}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
        provisionalRow={provisional}
      />,
    );
    const ghost = container.querySelector('[data-provisional="true"]');
    expect(ghost).not.toBeNull();
    expect(ghost?.textContent).toContain('新しいタスク');
    expect(ghost?.textContent).toContain('未保存');
  });
});

describe('TaskTree — 表示行の派生値（dsk-0332）', () => {
  const category = (id: number, name: string, sortOrder: number): Category =>
    ({
      id,
      name,
      spaceId: 'space-1',
      sortOrder,
      archived: false,
      createdAt: '',
      updatedAt: '',
    }) as Category;

  const renderTree = (t: DeskTaskTree, categories?: Category[]) =>
    withDnd(
      <TaskTree
        tree={t}
        categories={categories}
        loading={false}
        error={null}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

  const renderedIds = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-task-id]')].map((el) => el.getAttribute('data-task-id'));

  it('tree 更新（楽観移動と同じ純関数）で行順と gap index を作り直すこと', () => {
    const { container, rerender } = renderTree(tree);
    expect(renderedIds(container)).toEqual(['1', '2', '3']);
    // カテゴリ1末尾の append gap = 最終行 index(1) + 1 = 2。
    expect(
      container.querySelector('[data-drop-id="cat-1-append"]')?.getAttribute('data-gap-index'),
    ).toBe('2');

    // #3 をカテゴリ1の #1 の先頭の子へ移す（楽観更新と同じ純関数・新しい tree 実体）。
    const moved = applyMove(tree, {
      taskId: 3,
      target: { parentTaskId: 1, afterTaskId: null, categoryId: 1 },
    });
    rerender(
      <DndContext>
        <TaskTree tree={moved} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />
      </DndContext>,
    );

    expect(renderedIds(container)).toEqual(['1', '3', '2']);
    expect(
      container.querySelector('[data-drop-id="cat-1-append"]')?.getAttribute('data-gap-index'),
    ).toBe('3');
  });

  it('rolledback（元 tree へ戻す）でも行順と gap index が元に戻ること', () => {
    const moved = applyMove(tree, {
      taskId: 3,
      target: { parentTaskId: 1, afterTaskId: null, categoryId: 1 },
    });
    const { container, rerender } = renderTree(moved);
    expect(renderedIds(container)).toEqual(['1', '3', '2']);

    rerender(
      <DndContext>
        <TaskTree tree={tree} loading={false} error={null} selectedId={null} onSelect={vi.fn()} />
      </DndContext>,
    );
    expect(renderedIds(container)).toEqual(['1', '2', '3']);
    expect(
      container.querySelector('[data-drop-id="cat-1-append"]')?.getAttribute('data-gap-index'),
    ).toBe('2');
  });

  it('分類マスタの変更（並び替え）でグループ順と行順を作り直すこと', () => {
    const { container, rerender } = renderTree(tree, [
      category(1, '入荷管理', 0),
      category(2, '出荷管理', 1),
    ]);
    const groupNames = () =>
      [...container.querySelectorAll('.desk-task-group-head')].map((el) => el.textContent?.trim());
    expect(renderedIds(container)).toEqual(['1', '2', '3']);
    expect(groupNames()[0]).toContain('入荷管理');

    // マスタの sortOrder を入れ替える（表示順の正本はマスタ）。
    rerender(
      <DndContext>
        <TaskTree
          tree={tree}
          categories={[category(1, '入荷管理', 1), category(2, '出荷管理', 0)]}
          loading={false}
          error={null}
          selectedId={null}
          onSelect={vi.fn()}
        />
      </DndContext>,
    );
    expect(renderedIds(container)).toEqual(['3', '1', '2']);
    expect(groupNames()[0]).toContain('出荷管理');
  });
});
