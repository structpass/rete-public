import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskStatus } from '@rete/shared';
import { DeskTaskForm } from '../components/desk-task-form';
import type { Category } from '@/features/tasks/lib/api';

const categories: Category[] = [
  {
    id: 1,
    name: '入荷',
    sortOrder: 0,
    archived: false,
    spaceId: 's1',
    createdAt: '',
    updatedAt: '',
  },
];

// Desk オーバーレイ用フォーム（mock .desk-ticket-* 意匠 / native input・select）。
// 状態ロジックは useTaskForm を汎用 TaskForm と共有する（見た目のみ分岐）。
describe('DeskTaskForm', () => {
  it('edit モードでは defaultValues を反映し「保存」ボタンを出すこと', () => {
    render(
      <DeskTaskForm
        mode="edit"
        categories={categories}
        onSubmit={vi.fn()}
        defaultValues={{ title: '既存タスク', categoryId: '1', status: TaskStatus.DONE }}
      />,
    );
    expect(screen.getByLabelText('タイトル')).toHaveValue('既存タスク');
    // 共通 Select（mdl-0030: native <select> → Select 移行）が defaultValues.status を初期選択していること。
    // ネイティブ select と違い共通 Select のトリガーは button ベースなので value 属性で判定せず、
    // 選択中ラベル（オプションのテキスト＝TaskStatus 表示ラベル）が出ているかで初期値を検証する。
    const statusTrigger = screen.getByLabelText('ステータス');
    expect(statusTrigger).toHaveTextContent('完了');
    // mdl-0043: 保存ボタン文言は create/edit 問わず「保存」に統一。
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
  });

  it('edit モードで変更なし（dirty=false）は保存ボタンが非活性で、変更後は活性化すること（dsk-0210）', async () => {
    render(
      <DeskTaskForm
        mode="edit"
        categories={categories}
        onSubmit={vi.fn()}
        defaultValues={{ title: '既存タスク', categoryId: '1', status: TaskStatus.TODO }}
      />,
    );
    // 変更前: isDirty=false → 非活性
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    // 変更後: isDirty=true → 活性化
    await userEvent.clear(screen.getByLabelText('タイトル'));
    await userEvent.type(screen.getByLabelText('タイトル'), '変更後タスク');
    expect(screen.getByRole('button', { name: '保存' })).not.toBeDisabled();
  });

  it('create モードでは dirty に関係なく保存ボタンが活性であること（dsk-0210 スコープ外確認）', () => {
    render(<DeskTaskForm mode="create" categories={categories} onSubmit={vi.fn()} />);
    // 新規作成は isDirty 条件を適用しない（スコープ外）
    expect(screen.getByRole('button', { name: '保存' })).not.toBeDisabled();
  });

  it('タイトル未入力では検証エラーを表示し onSubmit を呼ばないこと', async () => {
    const onSubmit = vi.fn();
    render(<DeskTaskForm mode="create" categories={categories} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('タイトルは必須です')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('必須項目を満たした作成 submit で onSubmit に正規化値が渡ること', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<DeskTaskForm mode="create" categories={categories} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('タイトル'), '新規チケット');
    // 共通 Select（mdl-0030: native <select> → Select 移行）の操作系に置換。
    // トリガー（aria-label=分類）をクリック → 選択肢（option role）をクリックで選択。
    await userEvent.click(screen.getByLabelText('分類'));
    await userEvent.click(screen.getByRole('option', { name: '入荷' }));

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.title).toBe('新規チケット');
    expect(submitted.categoryId).toBe('1');
    expect(submitted.status).toBe(TaskStatus.TODO);
  });

  it('dsk-0239: 親コード該当なし状態で更新すると onSubmit を呼ばずインラインエラーを表示すること', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <DeskTaskForm
        mode="create"
        categories={categories}
        parentTasks={[{ id: 10, title: '親A', categoryId: 1 }]}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('タイトル'), 'チケット');
    // 候補に存在しない親 No（画面上は「該当なし」）。
    await userEvent.type(screen.getByLabelText('親タスクのチケットNo'), '999');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('親タスクが存在しません')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dsk-0239: 正しい親コードなら従来通り onSubmit が呼ばれること', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <DeskTaskForm
        mode="create"
        categories={categories}
        parentTasks={[{ id: 10, title: '親A', categoryId: 1 }]}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('タイトル'), 'チケット');
    await userEvent.type(screen.getByLabelText('親タスクのチケットNo'), '10');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('dsk-0239: 親コード空（親なし）なら parentTasks 供給時も従来通り onSubmit が呼ばれること', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <DeskTaskForm
        mode="create"
        categories={categories}
        parentTasks={[{ id: 10, title: '親A', categoryId: 1 }]}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('タイトル'), 'チケット');
    // 親 No 未入力（親なし＝トップレベル）はバリデーション対象外。
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
