import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskDetailOverlay, formatActivityText } from '../components/task-detail-overlay';
import type { Category, Task } from '@/features/tasks/lib/api';
import { TaskStatus, type TaskActivityField } from '@rete/shared';
import { formatDateTime } from '@/lib/utils';

// RichTextEditor は Tiptap（jsdom 非対応の measure 系）を含むため、顛末・起点カード編集の RTE 化
// （rete-desk-0190/0189）後はテキストエリアの最小スタブへ差し替える（onChange だけ通せば dirty/save を検証可能）。
vi.mock('../components/rich-text-editor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
    placeholder,
  }: {
    value: string;
    onChange: (html: string) => void;
    ariaLabel?: string;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// 保留方式の添付 hook（dsk-0272 で overlay 本体が useDeferredAttachments へ移行。旧 useDeskAttachments
// 直接利用＝dsk-0238 のモックは撤去）をモックし、dirty / mutating / commit をテストから駆動する。
// isPendingAttachment は task-attachments.tsx が同モジュールから import するため、実体と同じ判定
// （versionNo=0 かつ pending- 接頭辞）を提供する。
// cmn-0225: vi.fn() インスタンスのみ hoisted で保持。mockResolvedValue はファイル直下の beforeEach で再設定する。
const deferredMock = vi.hoisted(() => ({
  attachments: [] as Array<{ id: string }>,
  loading: false,
  dirty: false,
  mutating: false,
  add: vi.fn(),
  remove: vi.fn(),
  reload: vi.fn(),
  commit: vi.fn(),
  discard: vi.fn(),
}));
vi.mock('../hooks/use-deferred-attachments', () => ({
  isPendingAttachment: (att: { id: string; versionNo: number }) =>
    att.versionNo === 0 && att.id.startsWith('pending-'),
  useDeferredAttachments: () => ({
    attachments: deferredMock.attachments,
    loading: deferredMock.loading,
    error: null,
    mutating: deferredMock.mutating,
    add: deferredMock.add,
    remove: deferredMock.remove,
    reload: deferredMock.reload,
    dirty: deferredMock.dirty,
    commit: deferredMock.commit,
    discard: deferredMock.discard,
  }),
}));

// タスクコメント hook をモックし、コメント一覧をテストから駆動する（dsk-0243 のコメント日時表記を検証）。
// 既定は空一覧（既存テストはコメントを触らないため無影響）。
const commentsMock = vi.hoisted(() => ({
  comments: [] as Array<{
    id: string;
    body: string;
    author: { id: string; name: string };
    attachments: Array<{
      id: string;
      fileId?: string;
      fileName?: string;
      versionNo?: number;
      attachedBy?: string;
    }>;
    // リアクション（dsk-0297・チャット発話 ReactionBar と共有コンポーネント）。fixture は未リアクションを既定とする。
    reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
    createdAt: string;
  }>,
  // dsk-0298: 投稿成功後に履歴タブの reload が呼ばれることを検証するため spy を公開する。
  // cmn-0225: mockResolvedValue はファイル直下の beforeEach で再設定する（mockReset 剥がれ対策）。
  submit: vi.fn(),
  // dsk-0267: その他メニューの削除確定 / 編集保存が hook を呼ぶことを検証するため spy を公開する。
  remove: vi.fn(),
  update: vi.fn(),
  // dsk-0279: 添付 commit 後の一覧再取得を検証するため spy を公開する。
  reload: vi.fn(),
  // dsk-0297: リアクショントグルが hook を呼ぶことを検証するため spy を公開する。
  toggleReaction: vi.fn(),
}));
vi.mock('../hooks/use-task-comments', () => ({
  useTaskComments: () => ({
    comments: commentsMock.comments,
    loading: false,
    submitting: false,
    error: null,
    submit: commentsMock.submit,
    update: commentsMock.update,
    remove: commentsMock.remove,
    reload: commentsMock.reload,
    toggleReaction: commentsMock.toggleReaction,
  }),
}));

// タスク変更履歴 hook をモックし、コメント投稿・編集直後の即時 reload（dsk-0298）を検証する。
// dsk-0286: error 表示テスト用に activitiesError を可変で公開する（既定は null）。
// cmn-0225: vi.fn() インスタンスのみ保持。mockResolvedValue は beforeEach で再設定する。
const activitiesMock = vi.hoisted(() => ({
  reload: vi.fn(),
  error: null as string | null,
}));
vi.mock('../hooks/use-task-activities', () => ({
  useTaskActivities: () => ({
    activities: [],
    truncated: false,
    loading: false,
    error: activitiesMock.error,
    reload: activitiesMock.reload,
  }),
}));

const categories: Category[] = [
  {
    id: 1,
    name: '入荷',
    sortOrder: 0,
    archived: false,
    spaceId: 's1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

// cmn-0225: ファイル直下の beforeEach で deferredMock / commentsMock / activitiesMock の vi.fn()
// 戻り値を毎テスト再設定（mockReset 後の実装復元）。設定側で mockReset/restoreMocks が効くため、
// hoisted 内に mockResolvedValue を直書きすると初回しか効かない。
beforeEach(() => {
  deferredMock.attachments = [];
  deferredMock.loading = false;
  deferredMock.dirty = false;
  deferredMock.mutating = false;
  deferredMock.add.mockReset().mockResolvedValue(true);
  deferredMock.remove.mockReset().mockResolvedValue(undefined);
  deferredMock.reload.mockReset().mockResolvedValue(undefined);
  deferredMock.commit.mockReset().mockResolvedValue(true);
  deferredMock.discard.mockReset();

  commentsMock.comments = [];
  commentsMock.submit.mockReset().mockResolvedValue(true);
  commentsMock.remove.mockReset().mockResolvedValue(true);
  commentsMock.update.mockReset().mockResolvedValue(true);
  commentsMock.reload.mockReset().mockResolvedValue(undefined);
  commentsMock.toggleReaction.mockReset().mockResolvedValue(undefined);

  activitiesMock.reload.mockReset().mockResolvedValue(undefined);
  activitiesMock.error = null;
});

const task: Task = {
  id: 1,
  title: '親タスク',
  description: '説明文',
  status: TaskStatus.IN_PROGRESS,
  tenmatsu: null,
  categoryId: 1,
  parentTaskId: null,
  sortOrder: 0,
  sourceThemeId: null,
  sourceTheme: null,
  assignee: null,
  ownerId: null,
  owner: null,
  assigneeName: '山田',
  startDate: null,
  dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  hasMentionToMe: false,
  reactions: [],
};

describe('TaskDetailOverlay — 保存ボタン dirty ガード（dsk-0210）', () => {
  function renderOverlaySimple(props: Partial<Parameters<typeof TaskDetailOverlay>[0]> = {}) {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        {...props}
      />,
    );
  }

  it('フォーム変更なし（dirty=false）の初期状態では保存ボタンが非活性であること', () => {
    renderOverlaySimple();
    expect(screen.getByRole('button', { name: /保存/ })).toBeDisabled();
  });

  it('フォームのステータスを変更すると保存ボタンが活性化すること', async () => {
    renderOverlaySimple();
    // 初期は非活性
    expect(screen.getByRole('button', { name: /保存/ })).toBeDisabled();
    // ステータスを変更（isDirty=true → formDirty=true → ボタン活性）。
    // 共通 Select（mdl-0030: native <select> → Select 移行）の操作系に置換。
    await userEvent.click(screen.getByLabelText('ステータス'));
    await userEvent.click(screen.getByRole('option', { name: '完了' }));
    expect(screen.getByRole('button', { name: /保存/ })).not.toBeDisabled();
  });

  // dsk-0258: メッセージ（コメント）入力欄に書きかけがある時、leftDirty を立てて Esc/× の破棄確認に乗せる。
  // 書きかけ判定は ReplyComposer（チャット詳細の返信欄）と対称＝空 HTML は未編集、本文ありで dirty。
  it('コメント入力欄に文字を入力すると leftDirty（onDirtyChange=true）を報告すること（dsk-0258）', () => {
    const onDirtyChange = vi.fn();
    renderOverlaySimple({ onDirtyChange });
    onDirtyChange.mockClear(); // マウント時の初期 false 報告を無視
    fireEvent.change(screen.getByLabelText('コメント'), { target: { value: '<p>書きかけ</p>' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('コメントを空に戻すと dirty=false を報告すること（dsk-0258・空入力時の Esc は従来どおり確認なし）', () => {
    const onDirtyChange = vi.fn();
    renderOverlaySimple({ onDirtyChange });
    fireEvent.change(screen.getByLabelText('コメント'), { target: { value: '<p>書きかけ</p>' } });
    onDirtyChange.mockClear();
    fireEvent.change(screen.getByLabelText('コメント'), { target: { value: '' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  // dsk-0258 回帰ガード: activeTab='thread' のまま task が差し替わると DetailCommentComposer は
  // アンマウントされないため、key=task.id で remount しないと前タスクの書きかけ body / dirty が残り
  // leftDirty が新タスクで誤再活性化する（破棄確認の誤発火）。remount で dirty=false + 入力欄クリアを検証。
  it('コメント書きかけのまま別タスクへ切替えると dirty=false へリセットし入力欄も空になること（dsk-0258・key remount）', () => {
    const onDirtyChange = vi.fn();
    const sharedProps = {
      categories,
      parentTasks: [],
      onReparent: vi.fn().mockResolvedValue({}),
      error: null,
      saving: false,
      onClose: vi.fn(),
      onSave: vi.fn(),
      onDirtyChange,
    };
    const { rerender } = render(<TaskDetailOverlay task={task} {...sharedProps} />);
    fireEvent.change(screen.getByLabelText('コメント'), { target: { value: '<p>書きかけ</p>' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    onDirtyChange.mockClear();
    // 別タスク（id 差し替え）へ切替 → composer remount → cleanup+新マウントで dirty=false へ。
    rerender(<TaskDetailOverlay task={{ ...task, id: 2, title: '別タスク' }} {...sharedProps} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    // 新タスクのコメント欄は空（前タスクの書きかけが残らない）。
    expect((screen.getByLabelText('コメント') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('TaskDetailOverlay', () => {
  it('タスクタイトルをヘッダに表示すること', () => {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '親タスク' })).toBeInTheDocument();
  });

  it('taskKeyword 指定時はタイトルの一致箇所を sp-search-hl でハイライトすること（cmn-0092）', () => {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        taskKeyword="タスク"
      />,
    );
    const heading = screen.getByRole('heading', { name: /タスク/ });
    const marks = heading.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveClass('sp-search-hl');
  });

  it('taskKeyword が説明本文にだけあるとき説明の一致箇所を sp-search-hl でハイライトすること（dsk-0339）', () => {
    render(
      <TaskDetailOverlay
        task={{ ...task, title: '別件', description: '<p>在庫の確認を実施</p>' }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        taskKeyword="在庫"
      />,
    );
    const body = document.querySelector('.desk-thread-head-body');
    expect(body).not.toBeNull();
    const mark = body!.querySelector('mark.sp-search-hl');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('在庫');
  });

  it('taskKeyword が顛末本文にだけあるとき顛末面で sp-search-hl になること（dsk-0339）', () => {
    render(
      <TaskDetailOverlay
        task={{
          ...task,
          title: '別件',
          description: null,
          tenmatsu: '<p>顛末として納品完了を記録</p>',
        }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        taskKeyword="納品"
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: '顛末' }));
    const panel = document.querySelector('[data-detail-tabpanel="tenmatsu"]') as HTMLElement;
    const mark = panel.querySelector('mark.sp-search-hl');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('納品');
    // ハイライト表示中は RTE ではなく編集ボタン
    expect(within(panel).queryByLabelText('顛末')).toBeNull();
    expect(within(panel).getByRole('button', { name: '編集' })).toBeInTheDocument();
  });

  it('taskKeyword 空なら説明に mark を挿入しないこと（dsk-0339）', () => {
    render(
      <TaskDetailOverlay
        task={{ ...task, description: '<p>在庫の確認</p>' }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(document.querySelector('.desk-thread-head-body mark.sp-search-hl')).toBeNull();
  });

  it('編集フォーム（TaskForm 再利用）へ現在値を流し込むこと', () => {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('親タスク')).toBeInTheDocument();
  });

  it('閉じるボタンで onClose を呼ぶこと', () => {
    const onClose = vi.fn();
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('閉じる'));
    expect(onClose).toHaveBeenCalled();
  });

  it('task が無い時はフォームを描画しないこと（dsk-0234 スピナー撤去後・null は何も出さない）', () => {
    render(
      <TaskDetailOverlay
        task={null}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByDisplayValue('親タスク')).not.toBeInTheDocument();
  });

  it('task があれば内容を保持する（dsk-0219 stale-while-revalidate・dsk-0234 でスピナー分岐撤去後は構造的に常時保持）', () => {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    // dsk-0234 でスピナー分岐を撤去したため、task があれば（親の再取得中でも）内容を出し続けるのは構造上の保証。
    expect(screen.getByRole('heading', { name: '親タスク' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('親タスク')).toBeInTheDocument();
  });

  it('sourceTheme を持つタスクでも「元チャット」表示は出さない（dsk-0217 削除・裏のリレーションは保持）', () => {
    render(
      <TaskDetailOverlay
        task={{
          ...task,
          sourceThemeId: 'theme-9',
          sourceTheme: { id: 'theme-9', title: '元の会話' },
        }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    // sourceTheme データを渡しても画面には出さない（表示のみ削除・データは受理して破綻しない）。
    expect(screen.queryByText('元チャット')).not.toBeInTheDocument();
    expect(screen.queryByText('元の会話')).not.toBeInTheDocument();
  });
});

describe('TaskDetailOverlay — 顛末配線 / 完了ゲート（C-顛末）', () => {
  function renderOverlay(props: Partial<Parameters<typeof TaskDetailOverlay>[0]> = {}) {
    const onSave = vi.fn().mockResolvedValue({});
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={onSave}
        {...props}
      />,
    );
    return { onSave };
  }

  it('顛末タブを開くと task.tenmatsu をプリフィルした編集欄を表示すること', () => {
    renderOverlay({ task: { ...task, tenmatsu: '前回の結論' } });
    fireEvent.click(screen.getByRole('tab', { name: '顛末' }));
    expect((screen.getByLabelText('顛末') as HTMLTextAreaElement).value).toBe('前回の結論');
  });

  it('顛末を入力して更新すると onSave のペイロードに顛末が含まれること', async () => {
    const { onSave } = renderOverlay();
    fireEvent.click(screen.getByRole('tab', { name: '顛末' }));
    fireEvent.change(screen.getByLabelText('顛末'), { target: { value: '対応済み・完了' } });
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tenmatsu: '対応済み・完了' })),
    );
  });

  it('ステータス完了かつ顛末未入力で更新すると保存をブロックし顛末タブへ誘導＋エラー表示すること', async () => {
    const { onSave } = renderOverlay();
    // 共通 Select（mdl-0030）の操作系に置換。
    await userEvent.click(screen.getByLabelText('ステータス'));
    await userEvent.click(screen.getByRole('option', { name: '完了' }));
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: '顛末' })).toHaveAttribute('aria-selected', 'true');
  });

  it('顛末を入力済みなら完了での更新が通ること', async () => {
    const { onSave } = renderOverlay({ task: { ...task, tenmatsu: '結論あり' } });
    // 共通 Select（mdl-0030）の操作系に置換。
    await userEvent.click(screen.getByLabelText('ステータス'));
    await userEvent.click(screen.getByRole('option', { name: '完了' }));
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.DONE, tenmatsu: '結論あり' }),
      ),
    );
  });

  it('顛末タブの専用「保存」ボタンで tenmatsu のみを部分保存すること（rete-desk-0190/0192）', async () => {
    const { onSave } = renderOverlay();
    fireEvent.click(screen.getByRole('tab', { name: '顛末' }));
    // mdl-0035 で info-head の確定も「保存」になったため、顛末タブパネル内に限定して専用ボタンを押す。
    fireEvent.change(screen.getByLabelText('顛末'), { target: { value: '<p>独立保存テスト</p>' } });
    const tenmatsuPanel = document.querySelector(
      '[data-detail-tabpanel="tenmatsu"]',
    ) as HTMLElement;
    fireEvent.click(within(tenmatsuPanel).getByRole('button', { name: '保存' }));
    // 顛末面の宛先（dsk-0203）も同時に送る。メンション無し本文のため空配列（全クリア相当）。
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        tenmatsu: '<p>独立保存テスト</p>',
        tenmatsuMentionAccountIds: [],
      }),
    );
  });
});

describe('TaskDetailOverlay — 親付け替え（rete-desk-0071）', () => {
  // task(id=1, categoryId=1, 親なし)に対し、別カテゴリの親候補を 1 件用意する。
  const parentOptions = [{ id: 5, title: '別の親', categoryId: 2 }];

  function renderOverlay(props: Partial<Parameters<typeof TaskDetailOverlay>[0]> = {}) {
    const onSave = vi.fn().mockResolvedValue({});
    const onReparent = vi.fn().mockResolvedValue({});
    render(
      <TaskDetailOverlay
        task={task}
        categories={[
          ...categories,
          {
            id: 2,
            name: '出荷',
            sortOrder: 1,
            archived: false,
            spaceId: 's1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        parentTasks={parentOptions}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={onSave}
        onReparent={onReparent}
        {...props}
      />,
    );
    return { onSave, onReparent };
  }

  it('親 No 手入力で一致する親の題名ラベルが枠外に出ること（rete-desk-0179）', () => {
    renderOverlay();
    const parent = screen.getByLabelText('親タスクのチケットNo') as HTMLInputElement;
    expect(parent).toBeInTheDocument();
    // 未入力時は題名ラベルなし → No を入れると一致親の題名が出る。
    expect(screen.queryByText('別の親')).not.toBeInTheDocument();
    fireEvent.change(parent, { target: { value: '5' } });
    expect(screen.getByText('別の親')).toBeInTheDocument();
  });

  it('親を変更して更新すると onReparent が（親id・親の分類）で呼ばれること', async () => {
    const { onReparent, onSave } = renderOverlay();
    fireEvent.change(screen.getByLabelText('親タスク'), { target: { value: '5' } });
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() => expect(onReparent).toHaveBeenCalledWith(5, 2));
    // 属性更新（onSave）も併せて呼ばれる。
    expect(onSave).toHaveBeenCalled();
  });

  it('親を変更しなければ onReparent は呼ばれないこと', async () => {
    const { onReparent, onSave } = renderOverlay();
    fireEvent.change(screen.getByLabelText('担当者'), { target: { value: '別担当' } });
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onReparent).not.toHaveBeenCalled();
  });

  it('reparent（move）が失敗したら属性更新（onSave）へ進まずエラーを表示すること', async () => {
    const onReparent = vi.fn().mockRejectedValue(new Error('move failed'));
    const { onSave } = renderOverlay({ onReparent });
    fireEvent.change(screen.getByLabelText('親タスク'), { target: { value: '5' } });
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onReparent).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('TaskDetailOverlay — 担当者 Account 割当（rete-desk-0062）', () => {
  const accounts = [
    { id: 'acc-1', name: '田中 太郎' },
    { id: 'acc-2', name: '山田 太郎' },
  ];

  function renderOverlay(props: Partial<Parameters<typeof TaskDetailOverlay>[0]> = {}) {
    const onSave = vi.fn().mockResolvedValue({});
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        accounts={accounts}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={onSave}
        {...props}
      />,
    );
    return { onSave };
  }

  it('accounts 指定時は担当者を select で描画し候補を出すこと', async () => {
    renderOverlay();
    // 共通 Select（mdl-0030）: trigger（button）+ SelectItem（option role）で構成される。
    const trigger = screen.getByLabelText('担当者');
    expect(trigger.tagName).toBe('BUTTON');
    // trigger クリックで選択肢を開き、option role で候補と空 option（割当解除）を確認。
    await userEvent.click(trigger);
    expect(screen.getByRole('option', { name: '田中 太郎' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '山田 太郎' })).toBeInTheDocument();
    // 割当解除の空 option はラベル無し（rete-desk-0178）。共通 Select の SelectItem は内部 value を
    // data 属性で公開しないため、option 全体のテキスト空で検出する。
    const options = screen.getAllByRole('option');
    const blank = options.find((o) => o.textContent === '');
    expect(blank).toBeDefined();
  });

  it('FK 割当済みタスクは assignee.name を初期選択し、付替え更新で onSave payload に assigneeId を載せること', async () => {
    const { onSave } = renderOverlay({
      task: { ...task, assignee: { id: 'acc-1', name: '田中 太郎' }, assigneeName: '旧名' },
    });
    // 共通 Select（mdl-0030）: 選択中ラベル（田中 太郎）で初期選択を検証。
    const trigger = screen.getByLabelText('担当者');
    expect(trigger).toHaveTextContent('田中 太郎');

    // 付替え: trigger クリック → 山田 太郎 option クリック。
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: '山田 太郎' }));
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 'acc-2' })),
    );
  });

  it('未割当（空選択）で更新すると assigneeId=null を送ること（割当解除）', async () => {
    const { onSave } = renderOverlay({
      task: { ...task, assignee: { id: 'acc-1', name: '田中 太郎' } },
    });
    // 共通 Select（mdl-0030）: 空 option をクリックして割当解除。
    const trigger = screen.getByLabelText('担当者');
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: '' }));
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: null })),
    );
  });
});

describe('TaskDetailOverlay — 作成履歴の actor は作成者(owner)で担当者変更に追従しない（dsk-0235）', () => {
  function renderOverlay(taskOverride: Partial<Task>) {
    return render(
      <TaskDetailOverlay
        task={{ ...task, ...taskOverride }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
  }

  // 「このチケットを作成」行の実行者セル（.desk-ticket-history-actor）のテキストを返す。
  function creatorActorText(): string | null {
    const row = screen.getByText('このチケットを作成').closest('.desk-ticket-history-item');
    return row?.querySelector('.desk-ticket-history-actor')?.textContent ?? null;
  }

  it('作成行の実行者は owner.name を表示する（担当者名ではない）', () => {
    renderOverlay({
      owner: { id: 'acc-creator', name: '作成 太郎' },
      assignee: { id: 'acc-1', name: '担当 花子' },
      assigneeName: null,
    });
    fireEvent.click(screen.getByRole('tab', { name: '履歴' }));
    expect(creatorActorText()).toBe('作成 太郎');
    expect(creatorActorText()).not.toBe('担当 花子');
  });

  it('担当者を変更（再描画）しても作成行の実行者は作成者のまま不変（dsk-0235 中核）', () => {
    const owner = { id: 'acc-creator', name: '作成 太郎' };
    const { rerender } = renderOverlay({
      owner,
      assignee: { id: 'acc-1', name: '担当 花子' },
      assigneeName: null,
    });
    fireEvent.click(screen.getByRole('tab', { name: '履歴' }));
    expect(creatorActorText()).toBe('作成 太郎');

    // 担当者だけ別人に差し替えて再描画（＝担当者変更後の状態）。作成行 actor は owner のまま追従しない。
    rerender(
      <TaskDetailOverlay
        task={{
          ...task,
          owner,
          assignee: { id: 'acc-2', name: '別担当 次郎' },
          assigneeName: null,
        }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(creatorActorText()).toBe('作成 太郎');
    expect(creatorActorText()).not.toBe('別担当 次郎');
  });

  it('owner 未設定（未所有/失効）の作成行は — を表示し担当者名にフォールバックしない', () => {
    renderOverlay({
      owner: null,
      assignee: { id: 'acc-1', name: '担当 花子' },
      assigneeName: '山田',
    });
    fireEvent.click(screen.getByRole('tab', { name: '履歴' }));
    expect(creatorActorText()).toBe('—');
  });
});

describe('TaskDetailOverlay — 履歴明細の2段組表示とヘッダ「変更履歴」（dsk-0270）', () => {
  function renderHistoryTab() {
    const utils = render(
      <TaskDetailOverlay
        task={{ ...task, owner: { id: 'acc-creator', name: '作成 太郎' } }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: '履歴' }));
    return utils;
  }

  it('ヘッダは「変更履歴」の単一ラベルで、3列見出し（日時/実行者/変更内容）は表示されない', () => {
    const { container } = renderHistoryTab();
    const header = container.querySelector('.desk-ticket-history-header');
    expect(header?.textContent).toBe('変更履歴');
    expect(container.querySelector('.desk-ticket-history-h-time')).toBeNull();
    expect(container.querySelector('.desk-ticket-history-h-actor')).toBeNull();
    expect(container.querySelector('.desk-ticket-history-h-text')).toBeNull();
  });

  it('各履歴行は2段構成: 上段（.desk-ticket-history-meta）に日時と実行者が横並び、下段に変更内容', () => {
    const { container } = renderHistoryTab();
    const row = screen.getByText('このチケットを作成').closest('.desk-ticket-history-item');
    expect(row).not.toBeNull();
    // 上段: meta 内に time → actor の順で並ぶ（実行者がタイムスタンプの右）。
    const meta = row!.querySelector('.desk-ticket-history-meta');
    expect(meta).not.toBeNull();
    const metaChildren = Array.from(meta!.children).map((el) => el.className);
    expect(metaChildren).toEqual(['desk-ticket-history-time', 'desk-ticket-history-actor']);
    expect(meta!.querySelector('.desk-ticket-history-actor')?.textContent).toBe('作成 太郎');
    // 下段: 変更内容は meta の外（li 直下）に置かれる。
    const text = row!.querySelector(':scope > .desk-ticket-history-text');
    expect(text?.textContent).toBe('このチケットを作成');
    expect(
      container.querySelector('.desk-ticket-history-meta .desk-ticket-history-text'),
    ).toBeNull();
  });
});

describe('TaskDetailOverlay — 添付の保留方式（保存ボタンで一括確定・dsk-0272）', () => {
  // cmn-0225: deferredMock の状態リセットはファイル直下の beforeEach で実施済み。

  function renderOverlayAttach(
    propsOverride: Partial<Parameters<typeof TaskDetailOverlay>[0]> = {},
  ) {
    const onSave = vi.fn().mockResolvedValue({});
    const onDirtyChange = vi.fn();
    const props = {
      task,
      categories,
      parentTasks: [],
      onReparent: vi.fn().mockResolvedValue({}),
      loading: false,
      error: null,
      saving: false,
      onClose: vi.fn(),
      onSave,
      onDirtyChange,
      ...propsOverride,
    };
    const utils = render(<TaskDetailOverlay {...props} />);
    const rerender = () => utils.rerender(<TaskDetailOverlay {...props} />);
    return { ...utils, rerender, onSave, onDirtyChange };
  }

  const updateBtn = () => screen.getByRole('button', { name: /保存/ });

  it('保留中の添付変更（dirty）だけで保存ボタンが活性化し、保留なしでは非活性のままなこと', () => {
    const { rerender } = renderOverlayAttach();
    // フォーム未変更 + 保留なし → 非活性。
    expect(updateBtn()).toBeDisabled();
    // 添付を保留に積む（hook が dirty=true を返す）→ 活性。
    deferredMock.dirty = true;
    rerender();
    expect(updateBtn()).not.toBeDisabled();
    // 保留を取り消して元へ戻す（dirty=false）→ 非活性へ戻る。
    deferredMock.dirty = false;
    rerender();
    expect(updateBtn()).toBeDisabled();
  });

  it('更新（submit）で属性保存に続けて commit() が呼ばれ、保留添付が確定すること', async () => {
    deferredMock.dirty = true;
    const { onSave } = renderOverlayAttach();
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() => expect(deferredMock.commit).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalled();
  });

  it('commit() が失敗（false）したら失敗としてエラー表示し、編集画面に留まること', async () => {
    deferredMock.dirty = true;
    deferredMock.commit = vi.fn(async () => false);
    const onClose = vi.fn();
    renderOverlayAttach({ onClose });
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('添付の確定に失敗しました'),
    );
    // 画面は閉じず（編集画面に留まる）、保留は hook 側が保持したまま再試行できる。
    expect(onClose).not.toHaveBeenCalled();
  });

  it('属性保存（onSave）が失敗したら commit() は呼ばれないこと（保留温存・全体失敗扱い）', async () => {
    deferredMock.dirty = true;
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    renderOverlayAttach({ onSave });
    fireEvent.submit(screen.getByRole('form', { name: 'タスクフォーム' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('保存に失敗しました'));
    expect(deferredMock.commit).not.toHaveBeenCalled();
  });

  it('添付 commit 実行中（mutating）は保存ボタンが非活性で二重送信できないこと', () => {
    // saving（onSave 中）は commit 完了前に false へ戻るため、mutating を無効化条件へ含めないと
    // onSave 完了〜commit 完了の窓で再度押せて属性 PATCH が二重発火する（dsk-0272 code-review HIGH）。
    deferredMock.dirty = true;
    deferredMock.mutating = true;
    renderOverlayAttach();
    expect(updateBtn()).toBeDisabled();
  });

  it('保留添付の dirty は破棄ガード（onDirtyChange）へ合流すること（dsk-0272・破棄確認の対象化）', () => {
    deferredMock.dirty = true;
    const { onDirtyChange } = renderOverlayAttach();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('タスクを開いた直後のロード遷移や確定添付の出現では誤って活性化しないこと（dsk-0282 再発防止）', () => {
    // 旧 baseline 方式はロード settled タイミング依存で誤 dirty が出た（dsk-0282）。保留方式では
    // dirty は保留（ユーザー操作）からのみ生まれ、ロード遷移・確定一覧の変化では立たない。
    deferredMock.loading = true;
    const { rerender } = renderOverlayAttach();
    deferredMock.loading = false;
    deferredMock.attachments = [{ id: 'att-1' }];
    rerender();
    expect(updateBtn()).toBeDisabled();
  });
});

describe('TaskDetailOverlay — 起点カード編集中の Esc / キャンセルは編集モードのみ解除（dsk-0242）', () => {
  function renderEditable(props: Partial<Parameters<typeof TaskDetailOverlay>[0]> = {}) {
    const onClose = vi.fn();
    const escapeInterceptorRef: { current: (() => boolean) | null } = { current: null };
    render(
      <TaskDetailOverlay
        // dsk-0244: 編集ボタンは作成者本人のみ表示するため、編集モード系テストは owner==currentUser で描画する。
        task={{ ...task, owner: { id: 'acc-self', name: '自分' } }}
        currentUserId="acc-self"
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={onClose}
        onSave={vi.fn().mockResolvedValue({})}
        escapeInterceptorRef={escapeInterceptorRef}
        {...props}
      />,
    );
    return { onClose, escapeInterceptorRef };
  }

  // 編集モード中だけ「タスク題名」input が描画される（非編集時は起点カードの読み取り表示）。
  const inEditMode = () => screen.queryByLabelText('タスク題名') !== null;

  it('編集ボタンで起点カード編集モードへ入ること（題名 input が出る）', () => {
    renderEditable();
    expect(inEditMode()).toBe(false);
    fireEvent.click(screen.getByLabelText('編集'));
    expect(inEditMode()).toBe(true);
  });

  // dsk-0349: 説明欄コンポーザフッタにファイル添付（右列 AttachmentPanel と同一 attachmentsCtl）。
  it('起点カード編集モードの説明欄フッタに「ファイル添付」ボタンが出ること（dsk-0349）', () => {
    const { container } = render(
      <TaskDetailOverlay
        task={{ ...task, owner: { id: 'acc-self', name: '自分' } }}
        currentUserId="acc-self"
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({})}
      />,
    );
    fireEvent.click(screen.getByLabelText('編集'));
    const composer = container.querySelector('.desk-thread-head-edit .desk-global-input-composer');
    expect(composer).not.toBeNull();
    expect(
      Array.from(composer!.querySelectorAll('button')).some((b) =>
        (b.textContent ?? '').includes('ファイル添付'),
      ),
    ).toBe(true);
  });

  it('編集中の Esc（desk-shell が consult する interceptor）は編集モードのみ解除し、画面を閉じない', () => {
    const { onClose, escapeInterceptorRef } = renderEditable();
    fireEvent.click(screen.getByLabelText('編集'));
    expect(inEditMode()).toBe(true);

    // desk-shell の window Esc ハンドラが closeAllGuarded の前に呼ぶ interceptor を直接実行する。
    let consumed: boolean | undefined;
    act(() => {
      consumed = escapeInterceptorRef.current?.();
    });
    expect(consumed).toBe(true); // Esc を消費（= 閉じない）
    expect(inEditMode()).toBe(false); // 編集モードのみ解除
    expect(onClose).not.toHaveBeenCalled(); // 詳細画面は開いたまま
  });

  it('非編集時の interceptor は false を返し、従来どおり desk-shell が閉じられること', () => {
    const { escapeInterceptorRef } = renderEditable();
    expect(escapeInterceptorRef.current?.()).toBe(false);
  });

  it('編集中のキャンセルボタンも編集モードのみ解除し、画面を閉じないこと', () => {
    const { onClose } = renderEditable();
    fireEvent.click(screen.getByLabelText('編集'));
    expect(inEditMode()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(inEditMode()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('TaskDetailOverlay — コメント編集中の Esc も編集モードのみ解除（dsk-0285）', () => {
  function renderWithEditableComment() {
    commentsMock.comments = [
      {
        id: 'c1',
        body: '<p>コメント本文</p>',
        author: { id: 'acc-self', name: '投稿者' },
        attachments: [],
        reactions: [],
        createdAt: '2026-03-05T07:09:00.000Z',
      },
    ];
    const onClose = vi.fn();
    const escapeInterceptorRef: { current: (() => boolean) | null } = { current: null };
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={onClose}
        onSave={vi.fn()}
        currentUserId="acc-self"
        escapeInterceptorRef={escapeInterceptorRef}
      />,
    );
    return { onClose, escapeInterceptorRef };
  }

  afterEach(() => {
    commentsMock.comments = [];
  });

  it('コメント編集中の Esc は編集モードのみ解除し、詳細画面は閉じない（従来は素通りしてオーバーレイごと閉じていた）', () => {
    const { onClose, escapeInterceptorRef } = renderWithEditableComment();
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    // 編集モードの成立は編集フォーム（RTE aria-label「コメント本文」）の有無で判定する
    // （mdl-0035 で info-head の確定も「保存」になり、ボタン名だけでは一意でないため）。
    expect(screen.queryByLabelText('コメント本文')).not.toBeNull();

    let consumed: boolean | undefined;
    act(() => {
      consumed = escapeInterceptorRef.current?.();
    });
    expect(consumed).toBe(true); // Esc を消費（= 閉じない）
    expect(screen.queryByLabelText('コメント本文')).toBeNull(); // 編集モードのみ解除
    expect(onClose).not.toHaveBeenCalled(); // 詳細画面は開いたまま
  });

  it('コメント編集中でない時の interceptor は false を返し、従来どおり desk-shell が閉じられること', () => {
    const { escapeInterceptorRef } = renderWithEditableComment();
    expect(escapeInterceptorRef.current?.()).toBe(false);
  });
});

describe('TaskDetailOverlay — タスクコメント日時は年を含む yyyy/mm/dd hh:mm（dsk-0243）', () => {
  function renderOverlaySimple() {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
  }

  afterEach(() => {
    commentsMock.comments = [];
  });

  it('コメント時刻を yyyy/mm/dd hh:mm で表示する（旧 MM/DD HH:mm から年付きへ）', () => {
    const createdAt = '2026-03-05T07:09:00.000Z';
    commentsMock.comments = [
      {
        id: 'c1',
        body: '<p>こんにちは</p>',
        author: { id: 'a1', name: '佐藤' },
        attachments: [],
        reactions: [],
        createdAt,
      },
    ];
    renderOverlaySimple();
    // ローカルタイムゾーン依存を避けるため、表示の期待値は同一フォーマッタ（formatDateTime）で構築する。
    const expected = formatDateTime(createdAt); // 例: 2026/03/05 16:09（JST）
    expect(screen.getByText(expected)).toBeInTheDocument();
    // 年を含む（4桁/2桁/2桁 + 時刻）形式であること。旧 MM/DD HH:mm（年なし）への回帰を防ぐ。
    expect(expected).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});

describe('TaskDetailOverlay — コメントのリアクション（dsk-0297・チャット発話 ReactionBar と共有）', () => {
  function renderOverlaySimple() {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
  }

  afterEach(() => {
    commentsMock.comments = [];
    commentsMock.toggleReaction.mockClear();
  });

  it('コメントの reactions を絵文字チップで表示する', () => {
    commentsMock.comments = [
      {
        id: 'c1',
        body: '<p>本文</p>',
        author: { id: 'a1', name: '佐藤' },
        attachments: [],
        reactions: [{ emoji: '👍', count: 2, reactedByMe: true }],
        createdAt: '2026-03-05T07:09:00.000Z',
      },
    ];
    renderOverlaySimple();
    expect(screen.getByRole('button', { name: '👍 2件（自分が押した）' })).toBeInTheDocument();
  });

  it('チップクリックで taskComments.toggleReaction(commentId, emoji) を呼ぶ', async () => {
    commentsMock.comments = [
      {
        id: 'c1',
        body: '<p>本文</p>',
        author: { id: 'a1', name: '佐藤' },
        attachments: [],
        reactions: [{ emoji: '👍', count: 1, reactedByMe: false }],
        createdAt: '2026-03-05T07:09:00.000Z',
      },
    ];
    renderOverlaySimple();
    fireEvent.click(screen.getByRole('button', { name: '👍 1件' }));
    expect(commentsMock.toggleReaction).toHaveBeenCalledWith('c1', '👍');
    // ReactionBar 内部の busy state 更新（handleToggle の非同期解決）を act で flush する（chat-thread.test.tsx と同型）。
    await act(async () => {
      await Promise.resolve();
    });
  });
});

describe('TaskDetailOverlay — 起点カード編集/その他ボタンは作成者本人のみ表示（dsk-0244 / dsk-0343）', () => {
  function renderWith(props: Partial<Parameters<typeof TaskDetailOverlay>[0]>) {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        {...props}
      />,
    );
  }

  /** 起点カードの見た目のみ「その他」（InertBtn）。コメント行メニューは aria-haspopup=menu を持つ。 */
  function headSonotaBtn() {
    return screen
      .queryAllByLabelText('その他')
      .find((el) => el.getAttribute('aria-haspopup') !== 'menu');
  }

  it('自分が作成したタスク（owner==currentUser）では編集ボタンを表示する', () => {
    renderWith({
      task: { ...task, owner: { id: 'acc-self', name: '自分' } },
      currentUserId: 'acc-self',
    });
    expect(screen.getByLabelText('編集')).toBeInTheDocument();
  });

  it('自分が作成したタスクでは起点カードの「その他」も表示する（dsk-0343）', () => {
    renderWith({
      task: { ...task, owner: { id: 'acc-self', name: '自分' } },
      currentUserId: 'acc-self',
    });
    expect(headSonotaBtn()).toBeTruthy();
  });

  it('他人が作成したタスク（owner!=currentUser）では編集ボタンを表示しない', () => {
    renderWith({
      task: { ...task, owner: { id: 'acc-other', name: '他人' } },
      currentUserId: 'acc-self',
    });
    expect(screen.queryByLabelText('編集')).not.toBeInTheDocument();
  });

  it('他人が作成したタスクでは起点カードの「その他」も表示しない（dsk-0343）', () => {
    renderWith({
      task: { ...task, owner: { id: 'acc-other', name: '他人' } },
      currentUserId: 'acc-self',
    });
    expect(headSonotaBtn()).toBeUndefined();
  });

  it('owner 未取得 / 未ログイン時は編集ボタンを表示しない（安全側）', () => {
    renderWith({ task: { ...task, owner: null }, currentUserId: 'acc-self' });
    expect(screen.queryByLabelText('編集')).not.toBeInTheDocument();
    renderWith({ task: { ...task, owner: { id: 'acc-self', name: '自分' } } });
    expect(screen.queryByLabelText('編集')).not.toBeInTheDocument();
  });

  it('編集モード中は起点カードの「その他」も隠れる（編集ボタンと同条件・dsk-0343）', () => {
    renderWith({
      task: { ...task, owner: { id: 'acc-self', name: '自分' } },
      currentUserId: 'acc-self',
    });
    fireEvent.click(screen.getByLabelText('編集'));
    expect(screen.queryByLabelText('編集')).not.toBeInTheDocument();
    expect(headSonotaBtn()).toBeUndefined();
  });
});

describe('formatActivityText — 全 11 種の表示文が維持されること（cmn-0211 / cmn-0234）', () => {
  // 種別 union を @rete/shared へ集約した際（cmn-0211）に表示文が回帰しないことを担保する。
  // 内訳: 親変更の専用形式(dsk-0240) 4種 / ラベル表既定形式 6種 / 固定文 5種 / 抜粋付き固定文 4種 = 11 種。

  it('なし→No: トップレベルから親付けは「親チケットNoを変更（なし→12）」', () => {
    expect(formatActivityText('parent', 'なし', '12')).toBe('親チケットNoを変更（なし→12）');
  });

  it('No→なし: 親外しは「親チケットNoを変更（12→なし）」', () => {
    expect(formatActivityText('parent', '12', 'なし')).toBe('親チケットNoを変更（12→なし）');
  });

  it('No→No: 親付け替えは「親チケットNoを変更（32→12）」', () => {
    expect(formatActivityText('parent', '32', '12')).toBe('親チケットNoを変更（32→12）');
  });

  it('null フォールバックでも「なし」へ畳む（防御的・backend は通常 No か なし を送る）', () => {
    expect(formatActivityText('parent', null, '12')).toBe('親チケットNoを変更（なし→12）');
  });

  it('他フィールド（status / category）は従来の「項目名（before→after）を変更」形式を維持する', () => {
    expect(formatActivityText('status', '未着手', '完了')).toBe('ステータス（未着手→完了）を変更');
    expect(formatActivityText('category', '入荷', '出荷')).toBe('分類（入荷→出荷）を変更');
  });

  it('outcome は toLabel ありなら抜粋付き・null/空なら固定文、thread は固定文のまま（dsk-0345）', () => {
    expect(formatActivityText('outcome', null, '対応の顛末')).toBe('顛末の更新：対応の顛末');
    expect(formatActivityText('outcome', null, null)).toBe('顛末の更新');
    expect(formatActivityText('outcome', null, '')).toBe('顛末の更新');
    expect(formatActivityText('thread', null, null)).toBe('スレッドの更新');
  });

  it('commentAdd / commentEdit は toLabel の本文抜粋を付けて返す（dsk-0269）', () => {
    expect(formatActivityText('commentAdd', null, 'できました')).toBe(
      'メッセージを追加：できました',
    );
    expect(formatActivityText('commentEdit', null, 'なおしました')).toBe(
      'メッセージを編集：なおしました',
    );
  });

  it('commentAdd / commentEdit は toLabel 欠損でも崩れない（空フォールバック）', () => {
    expect(formatActivityText('commentAdd', null, null)).toBe('メッセージを追加：');
    expect(formatActivityText('commentEdit', null, null)).toBe('メッセージを編集：');
  });

  it.each<[TaskActivityField, string | null, string | null, string]>([
    ['assignee', '未割当', '佐藤', '担当者（未割当→佐藤）を変更'],
    ['startDate', null, '2026-07-01', '開始日（未設定→2026-07-01）を変更'],
    ['dueDate', null, '2026-07-01', '期日（未設定→2026-07-01）を変更'],
    ['space', null, '営業部', 'Space（未設定→営業部）を変更'],
  ])('%s は項目名ラベルつきの既定形式を維持する', (field, from, to, expected) => {
    expect(formatActivityText(field, from, to)).toBe(expected);
  });

  // cmn-0234: 型上は Exclude<TaskActivityField, 5分岐> で lookup が必ず成功し `?? field` は到達不能だが、
  // 古い frontend を新しい backend に当てた瞬間（ロールアウト逆転）に backend 側追加の field 名が来た時に
  // 「undefined（未設定→未設定）を変更」と表示される事故を防ぐランタイム安全網として残してある。
  // この it は保険が効いていることの実証（`?? field` を外して空文字へ落とすと落ちる＝守っている）。
  it('ACTIVITY_FIELD_LABELS に無い field でも生 field 名で「項目名（before→after）を変更」形式へ整形すること（古い画面 × 新しいサーバーの期間の保険）', () => {
    expect(
      formatActivityText('unknownField' as unknown as TaskActivityField, 'before', 'after'),
    ).toBe('unknownField（before→after）を変更');
  });
});

describe('TaskDetailOverlay — コメントのその他メニュー（dsk-0267）', () => {
  function renderWithComment({
    authorId = 'acc-self',
    body = '<p>コメント本文</p>',
  }: { authorId?: string; body?: string } = {}) {
    commentsMock.comments = [
      {
        id: 'c1',
        body,
        author: { id: authorId, name: '投稿者' },
        attachments: [],
        reactions: [],
        createdAt: '2026-03-05T07:09:00.000Z',
      },
    ];
    const onClose = vi.fn();
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={onClose}
        onSave={vi.fn()}
        currentUserId="acc-self"
      />,
    );
    return { onClose };
  }

  // 起点カードの「その他」（InertBtn）は dsk-0343 で isHeadOwner ゲート済み。
  // コメント行のトリガは aria-haspopup="menu" を持つ方で特定する（fixture task に owner 無し＝起点はその他非表示）。
  function commentMenuBtn() {
    return screen
      .queryAllByLabelText('その他')
      .find((el) => el.getAttribute('aria-haspopup') === 'menu');
  }

  afterEach(() => {
    commentsMock.comments = [];
    commentsMock.remove.mockClear();
    commentsMock.update.mockClear();
  });

  it('自分のコメントに「その他」トリガを表示し、旧・独立削除ボタンは存在しないこと（削除導線の一本化）', () => {
    renderWithComment();
    expect(commentMenuBtn()).toBeTruthy();
    expect(screen.queryByLabelText('コメントを削除')).not.toBeInTheDocument();
  });

  it('他人のコメントには「その他」トリガを出さないこと（isOwnComment ガード）', () => {
    renderWithComment({ authorId: 'acc-other' });
    expect(commentMenuBtn()).toBeUndefined();
    expect(screen.queryByLabelText('コメントを編集')).not.toBeInTheDocument();
  });

  it('その他クリックでメニューが開き「メッセージを顛末へコピー」「メッセージの削除」の2項目が出ること', () => {
    renderWithComment();
    fireEvent.click(commentMenuBtn()!);
    const menu = screen.getByRole('menu', { name: 'その他メニュー' });
    expect(menu).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'メッセージを顛末へコピー',
      'メッセージの削除',
    ]);
  });

  it('トリガの aria-controls が展開時メニューの id と一致すること（dsk-0288）', () => {
    renderWithComment();
    const btn = commentMenuBtn()!;
    fireEvent.click(btn);
    const menu = screen.getByRole('menu', { name: 'その他メニュー' });
    expect(btn.getAttribute('aria-controls')).toBe(menu.id);
    expect(menu.id).toBeTruthy();
  });

  it('下端付近（可視域をはみ出す）で開くと is-flip-up が付き上向きに開くこと（dsk-0288）', () => {
    // jsdom は実レイアウトを持たないため getBoundingClientRect をはみ出し状態に差し替えて計測を再現する
    // （新しく生成される menu 要素にも効くよう prototype レベルで class 判定して差し替える）。
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('desk-thread-head-menu')) {
          return {
            bottom: 900,
            top: 800,
            left: 0,
            right: 0,
            height: 100,
            width: 100,
            x: 0,
            y: 800,
          } as DOMRect;
        }
        if (this.classList.contains('desk-pane-body')) {
          return {
            bottom: 600,
            top: 0,
            left: 0,
            right: 0,
            height: 600,
            width: 100,
            x: 0,
            y: 0,
          } as DOMRect;
        }
        return { bottom: 0, top: 0, left: 0, right: 0, height: 0, width: 0, x: 0, y: 0 } as DOMRect;
      });
    try {
      renderWithComment();
      fireEvent.click(commentMenuBtn()!);
      const menu = screen.getByRole('menu', { name: 'その他メニュー' });
      expect(menu.className).toContain('is-flip-up');
    } finally {
      spy.mockRestore();
    }
  });

  it('可視域内（はみ出さない）で開くと is-flip-up が付かないこと（dsk-0288）', () => {
    renderWithComment();
    const btn = commentMenuBtn()!;
    fireEvent.click(btn);
    const menu = screen.getByRole('menu', { name: 'その他メニュー' });
    expect(menu.className).not.toContain('is-flip-up');
  });

  it('「メッセージの削除」→確認ダイアログ OK で taskComments.remove が呼ばれること', async () => {
    renderWithComment();
    fireEvent.click(commentMenuBtn()!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'メッセージの削除' }));
    // メニューは閉じ、既存の削除確認ダイアログ（dsk-0241 共用）が開く
    expect(screen.queryByRole('menu', { name: 'その他メニュー' })).not.toBeInTheDocument();
    expect(screen.getByText('このコメントを削除しますか？元に戻せません。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(commentsMock.remove).toHaveBeenCalledWith('c1'));
  });

  it('削除確認をキャンセルすると remove を呼ばないこと', () => {
    renderWithComment();
    fireEvent.click(commentMenuBtn()!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'メッセージの削除' }));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(commentsMock.remove).not.toHaveBeenCalled();
  });

  it('「メッセージを顛末へコピー」で顛末タブへ切替わり、本文が顛末ドラフトへ入ること', () => {
    renderWithComment({ body: '<p>顛末へ写す本文</p>' });
    fireEvent.click(commentMenuBtn()!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'メッセージを顛末へコピー' }));
    // 顛末タブが選択され、RTE スタブ（textarea aria-label="顛末"）に本文が反映される
    expect(screen.getByRole('tab', { name: '顛末' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('顛末')).toHaveValue('<p>顛末へ写す本文</p>');
  });

  it('顛末に既存ドラフトがある場合は置換せず末尾へ追記すること', () => {
    renderWithComment({ body: '<p>追記分</p>' });
    // 先に顛末タブでドラフトを入力
    fireEvent.click(screen.getByRole('tab', { name: '顛末' }));
    fireEvent.change(screen.getByLabelText('顛末'), { target: { value: '<p>既存</p>' } });
    // スレッドへ戻ってコピー
    fireEvent.click(screen.getByRole('tab', { name: 'スレッド' }));
    fireEvent.click(commentMenuBtn()!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'メッセージを顛末へコピー' }));
    expect(screen.getByLabelText('顛末')).toHaveValue('<p>既存</p><p>追記分</p>');
  });

  it('空本文のコメントではコピーしてもタブ切替・顛末反映が起きないこと（空ガード）', () => {
    renderWithComment({ body: '<p></p>' });
    fireEvent.click(commentMenuBtn()!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'メッセージを顛末へコピー' }));
    expect(screen.getByRole('tab', { name: 'スレッド' })).toHaveAttribute('aria-selected', 'true');
  });

  // 注: desk-shell（window リスナー側）は本ユニットテストに居ないため、ここで証明できるのは
  // 「ESC でローカルの menu state が閉じる」ことまで（伝播抑止の統合検証は実ブラウザ側）。
  it('ESC キーでメニューが閉じること（ローカル state のクローズ）', () => {
    renderWithComment();
    fireEvent.click(commentMenuBtn()!);
    expect(screen.getByRole('menu', { name: 'その他メニュー' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'その他メニュー' })).not.toBeInTheDocument();
  });

  it('メニューを開いたまま編集へ入り、編集をキャンセルしてもメニューが再出現しないこと（state 残留ガード）', () => {
    renderWithComment();
    fireEvent.click(commentMenuBtn()!);
    expect(screen.getByRole('menu', { name: 'その他メニュー' })).toBeInTheDocument();
    // 編集開始（commentMenuId をクリアしないと編集キャンセル後にメニューが復活する）
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('menu', { name: 'その他メニュー' })).not.toBeInTheDocument();
  });

  it('メニュー外のクリック（pointerdown）でメニューが閉じること', () => {
    renderWithComment();
    fireEvent.click(commentMenuBtn()!);
    expect(screen.getByRole('menu', { name: 'その他メニュー' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu', { name: 'その他メニュー' })).not.toBeInTheDocument();
  });
});

describe('TaskDetailOverlay — コメント編集の添付（dsk-0279）', () => {
  function renderEditingSetup({
    attachments = [] as Array<{
      id: string;
      fileId: string;
      fileName: string;
      versionNo: number;
      attachedBy: string;
    }>,
  } = {}) {
    commentsMock.comments = [
      {
        id: 'c1',
        body: '<p>コメント本文</p>',
        author: { id: 'acc-self', name: '投稿者' },
        attachments,
        reactions: [],
        createdAt: '2026-03-05T07:09:00.000Z',
      },
    ];
    const { container } = render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        currentUserId="acc-self"
      />,
    );
    return { container };
  }

  afterEach(() => {
    commentsMock.comments = [];
    commentsMock.update.mockClear();
    commentsMock.reload.mockClear();
    activitiesMock.reload.mockClear();
    deferredMock.dirty = false;
    deferredMock.commit.mockClear();
    deferredMock.commit.mockResolvedValue(true);
    deferredMock.discard.mockClear();
  });

  // mdl-0035 で info-head の確定も「保存」になったため、コメント編集フォーム内に限定して押す。
  function clickCommentEditSave() {
    const editForm = document.querySelector('.desk-thread-comment-edit') as HTMLElement;
    fireEvent.click(within(editForm).getByRole('button', { name: '保存' }));
  }

  it('編集モードで読み取り専用一覧が消え、編集フォーム内に添付欄（ファイル添付）が出ること（二重表示回避）', () => {
    const { container } = renderEditingSetup({
      attachments: [
        { id: 'a1', fileId: 'f1', fileName: '仕様書.pdf', versionNo: 1, attachedBy: '投稿者' },
      ],
    });
    // 非編集時は読み取り専用一覧（AttachmentList）が出る
    expect(container.querySelector('.desk-ticket-files-readonly')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    // 編集中は読み取り専用一覧を隠し、編集フォーム内の添付トリガだけが出る
    expect(container.querySelector('.desk-ticket-files-readonly')).toBeNull();
    const editForm = container.querySelector('.desk-thread-comment-edit');
    expect(editForm).not.toBeNull();
    expect(
      Array.from(editForm!.querySelectorAll('button')).some(
        (b) => b.textContent === 'ファイル添付',
      ),
    ).toBe(true);
  });

  it('保留変更あり（dirty）の保存で本文更新→commit→一覧再取得の順に確定し、編集モードが閉じること', async () => {
    renderEditingSetup();
    deferredMock.dirty = true;
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    clickCommentEditSave();
    await waitFor(() =>
      expect(commentsMock.update).toHaveBeenCalledWith('c1', '<p>コメント本文</p>', []),
    );
    await waitFor(() => expect(deferredMock.commit).toHaveBeenCalled());
    await waitFor(() => expect(commentsMock.reload).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('コメント本文')).not.toBeInTheDocument());
  });

  it('commit 失敗（部分失敗=全体失敗）では編集モードに留まりエラーを表示すること', async () => {
    renderEditingSetup();
    deferredMock.dirty = true;
    deferredMock.commit.mockResolvedValue(false);
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    // 失敗ケースは本文を空にする前＝保存ボタンが活性化している状態で行う（dsk-0350 で空=disabled）。
    fireEvent.change(screen.getByLabelText('コメント本文'), {
      target: { value: '<p>修正版</p>' },
    });
    clickCommentEditSave();
    await waitFor(() => expect(deferredMock.commit).toHaveBeenCalled());
    expect(await screen.findByText('コメントの更新に失敗しました')).toBeInTheDocument();
    expect(screen.getByLabelText('コメント本文')).toBeInTheDocument();
    expect(commentsMock.reload).not.toHaveBeenCalled();
  });

  it('保留変更なし（dirty=false）の保存では commit も再取得も呼ばないこと', async () => {
    renderEditingSetup();
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    clickCommentEditSave();
    await waitFor(() => expect(screen.queryByLabelText('コメント本文')).not.toBeInTheDocument());
    expect(deferredMock.commit).not.toHaveBeenCalled();
    expect(commentsMock.reload).not.toHaveBeenCalled();
  });

  it('コメント編集成功で履歴タブの reload が呼ばれること（dsk-0298・編集は task.updatedAt を進めず revalidateKey に乗らないため明示 reload で拾う）', async () => {
    renderEditingSetup();
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    clickCommentEditSave();
    await waitFor(() => expect(commentsMock.update).toHaveBeenCalled());
    await waitFor(() => expect(activitiesMock.reload).toHaveBeenCalled());
  });

  it('コメント編集が失敗したら履歴タブの reload を呼ばないこと', async () => {
    renderEditingSetup();
    commentsMock.update.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    clickCommentEditSave();
    await waitFor(() => expect(commentsMock.update).toHaveBeenCalled());
    expect(activitiesMock.reload).not.toHaveBeenCalled();
  });

  it('キャンセルで保留変更を破棄（discard）して編集モードを閉じること', () => {
    renderEditingSetup();
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(deferredMock.discard).toHaveBeenCalled();
    expect(screen.queryByLabelText('コメント本文')).not.toBeInTheDocument();
  });

  it('編集差分（本文変更）が leftDirty（onDirtyChange）へ合流し、キャンセルで解消されること', () => {
    const onDirtyChange = vi.fn();
    commentsMock.comments = [
      {
        id: 'c1',
        body: '<p>コメント本文</p>',
        author: { id: 'acc-self', name: '投稿者' },
        attachments: [],
        reactions: [],
        createdAt: '2026-03-05T07:09:00.000Z',
      },
    ];
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        currentUserId="acc-self"
        onDirtyChange={onDirtyChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('コメントを編集'));
    fireEvent.change(screen.getByLabelText('コメント本文'), {
      target: { value: '<p>書きかけ</p>' },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    // 変更ありのキャンセルは即破棄せず破棄確認を挟む（mdl-0034 規約②）。
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    // OK（破棄）でアンマウントされ dirty=false が報告され、破棄確認の誤発火が残らない
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByLabelText('コメント本文')).not.toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

describe('TaskDetailOverlay — 起点カードの投稿者名は作成者（owner）固定（dsk-0271/dsk-0268）', () => {
  function renderWith(overrides: Partial<Task>) {
    const { container, rerender } = render(
      <TaskDetailOverlay
        task={{ ...task, ...overrides }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const headName = () => container.querySelector('.desk-thread-head-name')?.textContent;
    return { container, rerender, headName };
  }

  it('起点カードの投稿者名が担当者（assignee）でなく作成者（owner）名で表示されること', () => {
    const { headName } = renderWith({
      owner: { id: 'acc-owner', name: '作成者A' },
      assigneeName: '担当者B',
    });
    expect(headName()).toBe('作成者A');
  });

  it('担当者（assignee）を変更しても起点カードの投稿者名が変わらないこと', () => {
    const { rerender, headName } = renderWith({
      owner: { id: 'acc-owner', name: '作成者A' },
      assigneeName: '担当者B',
    });
    expect(headName()).toBe('作成者A');
    rerender(
      <TaskDetailOverlay
        task={{ ...task, owner: { id: 'acc-owner', name: '作成者A' }, assigneeName: '担当者C' }}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(headName()).toBe('作成者A');
  });

  it('owner が null のときは中立ラベル「—」で表示が破綻しないこと', () => {
    const { headName } = renderWith({ owner: null, assigneeName: '担当者B' });
    expect(headName()).toBe('—');
  });
});

describe('TaskDetailOverlay — コメント投稿直後の履歴タブ即時反映（dsk-0298）', () => {
  function renderOverlaySimple() {
    render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
  }

  afterEach(() => {
    commentsMock.submit.mockClear();
    commentsMock.submit.mockResolvedValue(true);
    activitiesMock.reload.mockClear();
  });

  it('投稿成功で taskComments.submit と履歴タブの reload が呼ばれること（Task 本体の updatedAt を進めない投稿は revalidateKey に乗らないため明示 reload で拾う）', async () => {
    renderOverlaySimple();
    fireEvent.change(screen.getByLabelText('コメント'), { target: { value: '本文' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    await waitFor(() => expect(commentsMock.submit).toHaveBeenCalledWith('本文', [], []));
    await waitFor(() => expect(activitiesMock.reload).toHaveBeenCalled());
  });

  it('投稿失敗（submit=false）では履歴タブの reload を呼ばないこと', async () => {
    commentsMock.submit.mockResolvedValueOnce(false);
    renderOverlaySimple();
    fireEvent.change(screen.getByLabelText('コメント'), { target: { value: '本文' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    await waitFor(() => expect(commentsMock.submit).toHaveBeenCalled());
    expect(activitiesMock.reload).not.toHaveBeenCalled();
  });
});

describe('TaskDetailOverlay — 履歴タブの取得失敗 error 注記（dsk-0286）', () => {
  function renderHistoryTab() {
    return render(
      <TaskDetailOverlay
        task={task}
        categories={categories}
        parentTasks={[]}
        onReparent={vi.fn().mockResolvedValue({})}
        error={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
  }

  afterEach(() => {
    activitiesMock.error = null;
  });

  it('useTaskActivities.error が null のとき履歴タブに role="alert" の注記が表示されないこと', () => {
    activitiesMock.error = null;
    const { container } = renderHistoryTab();
    fireEvent.click(screen.getByRole('tab', { name: '履歴' }));
    expect(container.querySelector('.desk-ticket-history-error')).toBeNull();
  });

  it('useTaskActivities.error が非 null のとき履歴タブに role="alert" で「変更履歴の取得に失敗しました」が表示されること', () => {
    activitiesMock.error = '変更履歴の取得に失敗しました';
    const { container } = renderHistoryTab();
    fireEvent.click(screen.getByRole('tab', { name: '履歴' }));
    const alert = container.querySelector('.desk-ticket-history-error');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('変更履歴の取得に失敗しました');
  });
});
