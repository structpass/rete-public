import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, cleanup, waitFor } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { FavoriteDto } from '@rete/shared';

// 並べ替え本体（handleDragEnd = arrayMove + in-flight ガード + reorder 呼び出し）を検証する専用テスト
// （hom-0129）。jsdom は getBoundingClientRect が全て 0 を返し closestCenter の衝突判定が働かないため、
// ポインタ / キーボード経由の D&D は再現できない。tenant-settings-screen.dragend.test.tsx と同じく
// DndContext をモックして onDragEnd を捕捉し、直接呼び出す。
// cmn-0142: vi.hoisted 化（vi.mock ファクトリは hoisted されるため mutable な箱を経由する）
const { capturedOnDragEnd } = vi.hoisted(() => ({
  capturedOnDragEnd: { current: null as null | ((event: DragEndEvent) => void) },
}));

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

import { FavoritesManageOverlay } from '../favorites-manage-overlay';

const items: FavoriteDto[] = [
  { id: 'f1', kind: 'file', targetRef: 'r1', label: '資料', sortOrder: 0 } as FavoriteDto,
  { id: 'f2', kind: 'chat', targetRef: 'r2', label: '雑談', sortOrder: 1 } as FavoriteDto,
  { id: 'f3', kind: 'task', targetRef: 'r3', label: '棚卸し', sortOrder: 2 } as FavoriteDto,
];

const reorder = vi.fn();

function renderOverlay() {
  return render(
    <FavoritesManageOverlay
      open
      onClose={vi.fn()}
      items={items}
      loading={false}
      error={null}
      remove={vi.fn()}
      reorder={reorder}
    />,
  );
}

const drag = (activeId: string, overId: string) =>
  ({ active: { id: activeId }, over: { id: overId } }) as unknown as DragEndEvent;

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnDragEnd.current = null;
});
afterEach(cleanup);

describe('FavoritesManageOverlay handleDragEnd (hom-0129)', () => {
  it('掴んだ行を離した位置へ移した順序で reorder を呼ぶ', async () => {
    reorder.mockResolvedValue(undefined);
    renderOverlay();
    expect(capturedOnDragEnd.current).toBeTruthy();

    await act(async () => {
      capturedOnDragEnd.current!(drag('f1', 'f3'));
    });

    await waitFor(() => expect(reorder).toHaveBeenCalledWith(['f2', 'f3', 'f1']));
  });

  it('同じ行へ落とした / 落下先が無い時は reorder を呼ばない', async () => {
    renderOverlay();
    await act(async () => {
      capturedOnDragEnd.current!(drag('f1', 'f1'));
      capturedOnDragEnd.current!({ active: { id: 'f1' }, over: null } as unknown as DragEndEvent);
    });
    expect(reorder).not.toHaveBeenCalled();
  });

  it('保存の往復中は次のドラッグを受け付けない（in-flight ガード）', async () => {
    let release: (() => void) | null = null;
    reorder.mockImplementation(() => new Promise<void>((res) => (release = () => res())));
    renderOverlay();

    await act(async () => {
      capturedOnDragEnd.current!(drag('f1', 'f3'));
    });
    expect(reorder).toHaveBeenCalledTimes(1);

    // 1 回目が解決する前の 2 回目は無視される。
    await act(async () => {
      capturedOnDragEnd.current!(drag('f2', 'f3'));
    });
    expect(reorder).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
    });
    await act(async () => {
      capturedOnDragEnd.current!(drag('f2', 'f3'));
    });
    await waitFor(() => expect(reorder).toHaveBeenCalledTimes(2));
  });

  it('保存に失敗したらエラーメッセージを表示する', async () => {
    reorder.mockRejectedValueOnce(new Error('boom'));
    renderOverlay();

    await act(async () => {
      capturedOnDragEnd.current!(drag('f1', 'f3'));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});
