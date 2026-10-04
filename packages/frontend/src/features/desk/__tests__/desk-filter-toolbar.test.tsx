import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TaskStatus } from '@rete/shared';
import { DeskFilterToolbar } from '../components/desk-filter-toolbar';
import type { DeskSearchMode } from '../hooks/use-desk-search';
import type { Account, Category } from '@/features/tasks/lib/api';

const accounts: Account[] = [
  { id: 'u-sk', name: '佐久間 健' },
  { id: 'u-yn', name: '中島 結' },
];
const categories: Category[] = [
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
    id: 2,
    name: '出荷管理',
    sortOrder: 1,
    archived: false,
    spaceId: 's1',
    createdAt: '',
    updatedAt: '',
  },
];

// controlled トールバー（C-検索 / Batch5 + 検索フィルタ刷新 0052-0057）。状態を持つ Harness で配線を検証する。
// 担当者・分類は複数選択（0054/0055）。ステータス・担当者・分類とも「全て」項目を撤去し
// 既定=空配列=全て表示に統一（0056/0058/0059。全解除は外部クリアボタン）。
// メンションはチャット側（rete-desk-0049）・タスク側（dsk-0203）とも配線済み。
function Harness() {
  const [mode, setMode] = useState<DeskSearchMode>('chat');
  const [chatKeyword, setChatKeyword] = useState('');
  const [archiveOnly, setArchiveOnly] = useState(false);
  const [taskKeyword, setTaskKeyword] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number[]>([]);
  const [tenmatsuOnly, setTenmatsuOnly] = useState(false);
  const [chatTenmatsuOnly, setChatTenmatsuOnly] = useState(false);
  const [mentionFrom, setMentionFrom] = useState<string[]>([]);
  const [mentionTo, setMentionTo] = useState<string[]>([]);
  const [taskMentionFrom, setTaskMentionFrom] = useState<string[]>([]);
  const [taskMentionTo, setTaskMentionTo] = useState<string[]>([]);
  const toggle =
    <T,>(set: React.Dispatch<React.SetStateAction<T[]>>) =>
    (v: T) =>
      set((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  return (
    <DeskFilterToolbar
      mode={mode}
      onModeChange={setMode}
      chatKeyword={chatKeyword}
      onChatKeywordChange={setChatKeyword}
      archiveOnly={archiveOnly}
      onArchiveToggle={() => setArchiveOnly((v) => !v)}
      chatTenmatsuOnly={chatTenmatsuOnly}
      onChatTenmatsuToggle={() => setChatTenmatsuOnly((v) => !v)}
      mentionFrom={mentionFrom}
      onMentionFromToggle={toggle(setMentionFrom)}
      mentionTo={mentionTo}
      onMentionToToggle={toggle(setMentionTo)}
      taskKeyword={taskKeyword}
      onTaskKeywordChange={setTaskKeyword}
      dueFrom={dueFrom}
      dueTo={dueTo}
      onDueChange={({ from, to }) => {
        setDueFrom(from);
        setDueTo(to);
      }}
      statusFilter={statusFilter}
      onStatusToggle={toggle(setStatusFilter)}
      assigneeFilter={assigneeFilter}
      onAssigneeToggle={toggle(setAssigneeFilter)}
      categoryFilter={categoryFilter}
      onCategoryToggle={toggle(setCategoryFilter)}
      tenmatsuOnly={tenmatsuOnly}
      onTenmatsuToggle={() => setTenmatsuOnly((v) => !v)}
      taskMentionFrom={taskMentionFrom}
      onTaskMentionFromToggle={toggle(setTaskMentionFrom)}
      taskMentionTo={taskMentionTo}
      onTaskMentionToToggle={toggle(setTaskMentionTo)}
      accounts={accounts}
      categories={categories}
      onClearChat={() => {
        setChatKeyword('');
        setArchiveOnly(false);
        setChatTenmatsuOnly(false);
      }}
      onClearTask={() => {
        setTaskKeyword('');
        setDueFrom('');
        setDueTo('');
        setStatusFilter([]);
        setAssigneeFilter([]);
        setCategoryFilter([]);
        setTenmatsuOnly(false);
        setTaskMentionFrom([]);
        setTaskMentionTo([]);
      }}
    />
  );
}

const chipOf = (name: string) =>
  screen.getByRole('button', { name }).closest('.desk-filter-icon') as HTMLElement;

describe('DeskFilterToolbar', () => {
  it('チャット既定でモードトグルとチャット用フィルタを描画する', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'チャット' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('group', { name: '検索モード' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'アーカイブ' })).toBeInTheDocument();
  });

  it('モードトグルで data-search-mode を切替える', () => {
    render(<Harness />);
    const area = screen
      .getByRole('group', { name: '検索モード' })
      .parentElement?.querySelector('.desk-search-area');
    expect(area).toHaveAttribute('data-search-mode', 'chat');

    fireEvent.click(screen.getByRole('button', { name: 'タスク' }));
    expect(screen.getByRole('button', { name: 'タスク' })).toHaveAttribute('aria-pressed', 'true');
    expect(area).toHaveAttribute('data-search-mode', 'task');
  });

  it('タスク側フィルタにステータス/担当者/分類/顛末/期日を含む', () => {
    const { container } = render(<Harness />);
    const taskBar = container.querySelector('[data-mode="task"]') as HTMLElement;
    expect(screen.getByRole('button', { name: 'ステータス' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '担当者' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '分類' })).toBeInTheDocument();
    // dsk-0403: 顛末チップは flash 化で role=switch（ popover 型 button ではない）
    expect(within(taskBar).getByRole('switch', { name: '顛末' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '期日範囲' })).toBeInTheDocument();
  });

  it('チャット検索の入力が反映される', () => {
    render(<Harness />);
    const input = screen.getByLabelText('チャットを検索') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '入荷' } });
    expect(input.value).toBe('入荷');
  });

  it('クリアボタンはチャット/タスクで分かれている', () => {
    render(<Harness />);
    expect(screen.getByLabelText('チャットフィルタをクリア')).toBeInTheDocument();
    expect(screen.getByLabelText('タスクフィルタをクリア')).toBeInTheDocument();
  });

  it('期日ボタンで popover を開閉でき、From/To を入力できる', () => {
    render(<Harness />);
    const dueBtn = screen.getByRole('button', { name: '期日範囲' });
    expect(dueBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(dueBtn);
    expect(dueBtn).toHaveAttribute('aria-expanded', 'true');

    const from = screen.getByLabelText('From 日付') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-06-01' } });
    expect(from.value).toBe('2026-06-01');
  });

  it('タスククリアで期日範囲もリセットされる', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '期日範囲' }));
    const from = screen.getByLabelText('From 日付') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-06-01' } });
    expect(from.value).toBe('2026-06-01');

    fireEvent.click(screen.getByLabelText('タスクフィルタをクリア'));
    expect((screen.getByLabelText('From 日付') as HTMLInputElement).value).toBe('');
  });

  it('ステータスチップで listbox を開閉でき、複数 option をトグルできる（rete-desk-0038）', () => {
    render(<Harness />);
    const statusBtn = screen.getByRole('button', { name: 'ステータス' });
    expect(statusBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(statusBtn);
    expect(statusBtn).toHaveAttribute('aria-expanded', 'true');

    const listbox = screen.getByRole('listbox', { name: 'ステータス' });
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');

    const todo = screen.getByRole('option', { name: '未着手' });
    const done = screen.getByRole('option', { name: '完了' });
    expect(todo).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(todo);
    fireEvent.click(done);
    expect(screen.getByRole('option', { name: '未着手' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: '完了' })).toHaveAttribute('aria-selected', 'true');

    // 再クリックで解除（トグル）。
    fireEvent.click(screen.getByRole('option', { name: '未着手' }));
    expect(screen.getByRole('option', { name: '未着手' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('ステータスメニューに「全て」項目は無い（既定=未完了 / rete-desk-0056）', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'ステータス' }));
    expect(screen.queryByRole('option', { name: 'ステータス: 全て' })).toBeNull();
    // 4 ステータスのみが option として並ぶ。
    expect(screen.getByRole('option', { name: '未着手' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '完了' })).toBeInTheDocument();
  });

  it('ステータス選択で chip が is-active になり、タスククリアで解除される', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'ステータス' }));
    fireEvent.click(screen.getByRole('option', { name: '対応中' }));
    expect(chipOf('ステータス')).toHaveClass('is-active');

    fireEvent.click(screen.getByLabelText('タスクフィルタをクリア'));
    expect(chipOf('ステータス')).not.toHaveClass('is-active');
  });

  it('アーカイブトグルで chip が is-active になる（rete-desk-0061）', () => {
    render(<Harness />);
    const archiveBtn = screen.getByRole('button', { name: 'アーカイブ' });
    fireEvent.click(archiveBtn); // popover を開く
    fireEvent.click(screen.getByRole('switch', { name: 'アーカイブ済のみ表示' }));
    expect(archiveBtn.closest('.desk-filter-icon')).toHaveClass('is-active');
    expect(archiveBtn.closest('.desk-filter-icon')).toHaveAttribute('data-value', 'on');
  });

  it('担当者を実データ候補から複数選択でき、is-active になる（rete-desk-0054）', () => {
    render(<Harness />);
    const btn = screen.getByRole('button', { name: '担当者' });
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('option', { name: '中島 結' }));
    fireEvent.click(screen.getByRole('option', { name: '佐久間 健' }));
    // 複数選択（menu は開いたまま）: 両方が選択中。
    expect(screen.getByRole('option', { name: '中島 結' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: '佐久間 健' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(chipOf('担当者')).toHaveClass('is-active');
  });

  it('担当者メニューに「全て」項目は無く、クリアボタンで全解除できる（rete-desk-0059）', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '担当者' }));
    // 「全て」項目は撤去（既定=空配列=全て表示。ステータスと統一 / rete-desk-0059）。
    expect(screen.queryByRole('option', { name: '担当者: 全て' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: '中島 結' }));
    expect(chipOf('担当者')).toHaveClass('is-active');

    // 全解除はタスクフィルタのクリアボタンに委ねる（個別解除は option 再クリック）。
    fireEvent.click(screen.getByLabelText('タスクフィルタをクリア'));
    expect(chipOf('担当者')).not.toHaveClass('is-active');
  });

  it('分類を実データ候補から複数選択でき、is-active になる（rete-desk-0055）', () => {
    render(<Harness />);
    const btn = screen.getByRole('button', { name: '分類' });
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('option', { name: '入荷管理' }));
    fireEvent.click(screen.getByRole('option', { name: '出荷管理' }));
    expect(screen.getByRole('option', { name: '入荷管理' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: '出荷管理' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(chipOf('分類')).toHaveClass('is-active');
  });

  it('分類メニューに「全て」項目は無く、クリアボタンで全解除できる（rete-desk-0058）', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '分類' }));
    // 「全て」項目は撤去（既定=空配列=全て表示。担当者・ステータスと統一 / rete-desk-0058）。
    expect(screen.queryByRole('option', { name: '分類: 全て' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: '入荷管理' }));
    expect(chipOf('分類')).toHaveClass('is-active');

    fireEvent.click(screen.getByLabelText('タスクフィルタをクリア'));
    expect(chipOf('分類')).not.toHaveClass('is-active');
  });

  it('マウスが枠外へ出ると一覧 dropdown（ステータス/担当者/分類）は閉じる（rete-desk-0053・0054・0055）', () => {
    render(<Harness />);
    for (const name of ['ステータス', '担当者', '分類']) {
      const btn = screen.getByRole('button', { name });
      fireEvent.click(btn);
      expect(btn).toHaveAttribute('aria-expanded', 'true');
      fireEvent.mouseLeave(chipOf(name));
      expect(btn).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('期日範囲は mouseleave で閉じない（native date picker 誤閉じ回避 / rete-desk-0053）', () => {
    render(<Harness />);
    const dueBtn = screen.getByRole('button', { name: '期日範囲' });
    fireEvent.click(dueBtn);
    expect(dueBtn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseLeave(dueBtn.closest('.desk-filter-icon') as HTMLElement);
    expect(dueBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('メンション popover はホバー枠外で閉じない（dsk-0310・onMouseLeave 再導入の回帰ガード）', () => {
    const { container } = render(<Harness />);
    const chatBar = container.querySelector('[data-mode="chat"]') as HTMLElement;
    const btn = within(chatBar).getByRole('button', { name: 'メンション' });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseLeave(btn.closest('.desk-filter-icon') as HTMLElement);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('メンション popover は Esc / outside-click で閉じる（dsk-0310）', () => {
    const { container } = render(<Harness />);
    const chatBar = container.querySelector('[data-mode="chat"]') as HTMLElement;
    const btn = within(chatBar).getByRole('button', { name: 'メンション' });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    // body 直 click は focus 復帰由来として無視される仕様のため、枠外の実要素をクリックして閉じを検証する
    //（他フィルタの trigger は stopPropagation で document へ届かないため、素のモードトグル群を使う）。
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('group', { name: '検索モード' }));
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('顛末トグルで chip が is-active になる（rete-desk-0052 / dsk-0403 flash 1クリック）', () => {
    const { container } = render(<Harness />);
    const taskBar = container.querySelector('[data-mode="task"]') as HTMLElement;
    // dsk-0403: 顛末チップは flash（role=switch・1クリックで onToggle 直接呼出・dialog popover 非描画）。
    // 旧2段階（trigger click → popover 内 switch click）は廃止。一過性 flash popup は装飾専用。
    const btn = within(taskBar).getByRole('switch', { name: '顛末' });
    expect(btn).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-checked', 'true');
    expect(btn.closest('.desk-filter-icon')).toHaveClass('is-active');
  });

  it('ステータス option は Enter/Space でキーボード操作できる（a11y）', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'ステータス' }));
    const todo = screen.getByRole('option', { name: '未着手' });
    expect(todo).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(todo, { key: 'Enter' });
    expect(screen.getByRole('option', { name: '未着手' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(screen.getByRole('option', { name: '未着手' }), { key: ' ' });
    expect(screen.getByRole('option', { name: '未着手' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('チャット側メンションは配線済（From/To popover を開ける / rete-desk-0049）', () => {
    const { container } = render(<Harness />);
    const chatBar = container.querySelector('[data-mode="chat"]') as HTMLElement;
    const btn = within(chatBar).getByRole('button', { name: 'メンション' });
    expect(btn).not.toHaveAttribute('aria-disabled');
    fireEvent.click(btn);
    const dialog = screen.getByRole('dialog', { name: 'メンション From/To' });
    expect(within(dialog).getByRole('listbox', { name: 'From（発信者）' })).toBeInTheDocument();
    expect(within(dialog).getByRole('listbox', { name: 'To（宛先）' })).toBeInTheDocument();
  });

  it('チャット側メンションは From/To を複数選択でき chip が is-active になる（rete-desk-0049）', () => {
    const { container } = render(<Harness />);
    const chatBar = container.querySelector('[data-mode="chat"]') as HTMLElement;
    const btn = within(chatBar).getByRole('button', { name: 'メンション' });
    fireEvent.click(btn);
    const dialog = screen.getByRole('dialog', { name: 'メンション From/To' });
    const fromList = within(dialog).getByRole('listbox', { name: 'From（発信者）' });
    const toList = within(dialog).getByRole('listbox', { name: 'To（宛先）' });
    fireEvent.click(within(fromList).getByRole('option', { name: '佐久間 健' }));
    fireEvent.click(within(toList).getByRole('option', { name: '中島 結' }));
    expect(within(fromList).getByRole('option', { name: '佐久間 健' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(toList).getByRole('option', { name: '中島 結' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(btn.closest('.desk-filter-icon')).toHaveClass('is-active');
  });

  it('タスク側メンションも配線済（From/To popover を開ける / dsk-0203）', () => {
    const { container } = render(<Harness />);
    const taskBar = container.querySelector('[data-mode="task"]') as HTMLElement;
    const btn = within(taskBar).getByRole('button', { name: 'メンション' });
    expect(btn).not.toHaveAttribute('aria-disabled');
    fireEvent.click(btn);
    const dialog = within(taskBar).getByRole('dialog', { name: 'メンション From/To' });
    expect(within(dialog).getByRole('listbox', { name: 'From（発信者）' })).toBeInTheDocument();
    expect(within(dialog).getByRole('listbox', { name: 'To（宛先）' })).toBeInTheDocument();
  });

  it('タスク側メンションは From/To を複数選択でき chip が is-active になり、クリアで解除される（dsk-0203）', () => {
    const { container } = render(<Harness />);
    const taskBar = container.querySelector('[data-mode="task"]') as HTMLElement;
    const btn = within(taskBar).getByRole('button', { name: 'メンション' });
    fireEvent.click(btn);
    const dialog = within(taskBar).getByRole('dialog', { name: 'メンション From/To' });
    const fromList = within(dialog).getByRole('listbox', { name: 'From（発信者）' });
    const toList = within(dialog).getByRole('listbox', { name: 'To（宛先）' });
    fireEvent.click(within(fromList).getByRole('option', { name: '佐久間 健' }));
    fireEvent.click(within(toList).getByRole('option', { name: '中島 結' }));
    expect(within(fromList).getByRole('option', { name: '佐久間 健' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(toList).getByRole('option', { name: '中島 結' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(btn.closest('.desk-filter-icon')).toHaveClass('is-active');

    // タスク側クリアで From/To も全解除される。
    fireEvent.click(screen.getByLabelText('タスクフィルタをクリア'));
    expect(btn.closest('.desk-filter-icon')).not.toHaveClass('is-active');
  });
});

describe('DeskFilterToolbar — 担当者コンボボックス（rete-desk-0054）', () => {
  const openAssignee = () => fireEvent.click(screen.getByRole('button', { name: '担当者' }));

  it('担当者ポップアップに絞り込み入力欄（combobox）がある', () => {
    render(<Harness />);
    openAssignee();
    expect(screen.getByRole('combobox', { name: '担当者を絞り込み' })).toBeInTheDocument();
  });

  it('入力で候補を絞り込む（部分一致・該当外は隠す）', () => {
    render(<Harness />);
    openAssignee();
    const input = screen.getByRole('combobox', { name: '担当者を絞り込み' });
    fireEvent.change(input, { target: { value: '中' } });
    expect(screen.getByRole('option', { name: '中島 結' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '佐久間 健' })).toBeNull();
  });

  it('絞り込み中も複数選択でき、入力クリアで選択は保持される', () => {
    render(<Harness />);
    openAssignee();
    const input = screen.getByRole('combobox', { name: '担当者を絞り込み' });
    fireEvent.change(input, { target: { value: '中' } });
    fireEvent.click(screen.getByRole('option', { name: '中島 結' }));
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('option', { name: '中島 結' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(screen.getByRole('option', { name: '佐久間 健' }));
    expect(screen.getByRole('option', { name: '佐久間 健' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(chipOf('担当者')).toHaveClass('is-active');
  });

  it('入力フォーカス中は枠外（mouseleave）で閉じない / フォーカスが無ければ閉じる', () => {
    render(<Harness />);
    const btn = screen.getByRole('button', { name: '担当者' });
    fireEvent.click(btn);
    const input = screen.getByRole('combobox', { name: '担当者を絞り込み' });
    fireEvent.focus(input);
    fireEvent.mouseLeave(chipOf('担当者'));
    expect(btn).toHaveAttribute('aria-expanded', 'true'); // 入力中は閉じない

    fireEvent.blur(input);
    fireEvent.mouseLeave(chipOf('担当者'));
    expect(btn).toHaveAttribute('aria-expanded', 'false'); // フォーカス無し → 閉じる
  });

  it('ステータス・分類には絞り込み入力欄を出さない（担当者のみ combobox）', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'ステータス' }));
    expect(screen.queryByRole('combobox', { name: 'ステータスを絞り込み' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '分類' }));
    expect(screen.queryByRole('combobox', { name: '分類を絞り込み' })).toBeNull();
  });
});
