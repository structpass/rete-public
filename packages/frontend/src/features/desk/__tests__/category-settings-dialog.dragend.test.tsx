import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import { CategorySettingsDialog } from '../components/category-settings-dialog';
import type { Category } from '@/features/tasks/lib/api';

// 並べ替え確定（handleDragEnd）を DndContext モックで捕捉して直接呼び出す専用テスト（cmn-0357）。
// jsdom は getBoundingClientRect が全て 0 を返し closestCenter の衝突判定が働かないため、
// favorites-manage-overlay.dragend.test.tsx / tenant-settings-screen.dragend.test.tsx と同じ方式を採る。
// cmn-0142: vi.hoisted 化（vi.mock ファクトリは hoisted されるため mutable な箱を経由する）
const { capturedOnDragEnd, fnFetchCategories, fnReorderCategories, fnCreateCategory } = vi.hoisted(
  () => ({
    capturedOnDragEnd: { current: null as null | ((event: DragEndEvent) => void) },
    fnFetchCategories: vi.fn(),
    fnReorderCategories: vi.fn(),
    fnCreateCategory: vi.fn(),
  }),
);

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: {
      onDragEnd?: (event: DragEndEvent) => void;
      children?: React.ReactNode;
    }) => {
      capturedOnDragEnd.current = props.onDragEnd ?? null;
      return props.children;
    },
  };
});

vi.mock('@/features/tasks/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/tasks/lib/api')>();
  return {
    ...actual,
    fetchCategories: fnFetchCategories,
    reorderCategories: fnReorderCategories,
    createCategory: fnCreateCategory,
  };
});

import { fetchCategories, reorderCategories, createCategory } from '@/features/tasks/lib/api';

const mockFetchCategories = vi.mocked(fetchCategories);
const mockReorderCategories = vi.mocked(reorderCategories);
const mockCreateCategory = vi.mocked(createCategory);

const SPACE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const cat = (id: number, name: string, archived = false): Category => ({
  id,
  name,
  sortOrder: id,
  archived,
  spaceId: SPACE_ID,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
});

const drag = (activeId: number, overId: number) =>
  ({ active: { id: activeId }, over: { id: overId } }) as unknown as DragEndEvent;

function renderDialog() {
  return render(
    <CategorySettingsDialog open onClose={vi.fn()} spaceId={SPACE_ID} onChanged={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnDragEnd.current = null;
  mockFetchCategories.mockResolvedValue([cat(1, '入荷'), cat(2, '出荷'), cat(3, '旧分類', true)]);
});
afterEach(cleanup);

describe('CategorySettingsDialog handleDragEnd（cmn-0357 共通フック乗せ替え）', () => {
  it('確定で送信する id 列はアーカイブ済を含む当該 Space の完全列である（rete-desk-0197 と同一）', async () => {
    mockReorderCategories.mockResolvedValue(undefined);
    renderDialog();
    await screen.findByText('入荷');
    expect(capturedOnDragEnd.current).toBeTruthy();

    // 有効 2 行（入荷→出荷）を入れ替え → 完全列は [2, 1, 3]（3 はアーカイブ済・末尾）。
    await act(async () => {
      capturedOnDragEnd.current!(drag(1, 2));
    });

    await waitFor(() => expect(mockReorderCategories).toHaveBeenCalledWith(SPACE_ID, [2, 1, 3]));
  });

  it('保存の往復中は次のドラッグ確定を無視し、解決後は通る（in-flight ガード）', async () => {
    let release: (() => void) | null = null;
    mockReorderCategories.mockImplementation(
      () => new Promise<void>((res) => (release = () => res())),
    );
    renderDialog();
    await screen.findByText('入荷');

    await act(async () => {
      capturedOnDragEnd.current!(drag(1, 2));
    });
    expect(mockReorderCategories).toHaveBeenCalledTimes(1);

    // 1 回目が解決する前の 2 回目は無視される。
    await act(async () => {
      capturedOnDragEnd.current!(drag(2, 1));
    });
    expect(mockReorderCategories).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
    });
    await act(async () => {
      capturedOnDragEnd.current!(drag(2, 1));
    });
    await waitFor(() => expect(mockReorderCategories).toHaveBeenCalledTimes(2));
  });

  it('保存の往復中は変更系（追加）も止まる（run の isReordering ガード）', async () => {
    let release: (() => void) | null = null;
    mockReorderCategories.mockImplementation(
      () => new Promise<void>((res) => (release = () => res())),
    );
    renderDialog();
    await screen.findByText('入荷');

    await act(async () => {
      capturedOnDragEnd.current!(drag(1, 2));
    });
    expect(mockReorderCategories).toHaveBeenCalledTimes(1);

    // 往復中に追加を試みる → 追加 API は呼ばれない。
    fireEvent.change(screen.getByLabelText('新しい分類名'), { target: { value: '検品' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
    });
    expect(mockCreateCategory).not.toHaveBeenCalled();

    // 解決後は追加が通る。
    await act(async () => {
      release?.();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
    });
    await waitFor(() => expect(mockCreateCategory).toHaveBeenCalled());
  });

  it('保存失敗時は画面内エラーを出してサーバー順へ再取得する', async () => {
    mockReorderCategories.mockRejectedValue(new Error('boom'));
    renderDialog();
    await screen.findByText('入荷');

    await act(async () => {
      capturedOnDragEnd.current!(drag(1, 2));
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('並び替えの保存に失敗しました'),
    );
    expect(mockFetchCategories).toHaveBeenCalledTimes(2); // 初回 + 失敗時の復元再取得
  });
});
