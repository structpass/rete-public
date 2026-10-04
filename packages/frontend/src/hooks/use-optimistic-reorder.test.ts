import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import { useOptimisticReorder } from './use-optimistic-reorder';

// cmn-0357: 4 サイト（掲示板 / お気に入りの管理 / テナント設定 / 分類設定）が共通で頼る境界を
// フック本体で固定する。掲示板と分類設定はドロップ確定を直接検査する既存テストが無いため、
// ここが実質のカバレッジになる（criteria 2 / 5）。
// cmn-0409: 生 reorderingRef 公開を isReordering() / resetReordering() API へ置き換えた。

interface Row {
  id: string;
}
const rows: Row[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

const drag = (activeId: string, overId: string | null) =>
  ({
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  }) as unknown as DragEndEvent;

function setup(opts: { isBlocked?: () => boolean; onReorder: (r: Row[]) => Promise<unknown> }) {
  return renderHook(() =>
    useOptimisticReorder<Row>({
      items: rows,
      isBlocked: opts.isBlocked,
      onReorder: opts.onReorder,
    }),
  );
}

describe('useOptimisticReorder — ドロップ確定の共通判定（cmn-0357）', () => {
  it('掴んだ行を離した位置へ移した順序で onReorder を呼ぶ', async () => {
    const onReorder = vi.fn(async () => {});
    const { result } = setup({ onReorder });

    await act(async () => {
      result.current.handleDragEnd(drag('a', 'c'));
    });

    expect(onReorder).toHaveBeenCalledWith([{ id: 'b' }, { id: 'c' }, { id: 'a' }]);
  });

  it('一覧の外で離した / 同じ位置へ戻した / 一覧に無い id では onReorder を呼ばない', async () => {
    const onReorder = vi.fn(async () => {});
    const { result } = setup({ onReorder });

    await act(async () => {
      result.current.handleDragEnd(drag('a', null));
      result.current.handleDragEnd(drag('a', 'a'));
      result.current.handleDragEnd(drag('zzz', 'b'));
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('保存の往復中は次のドロップ確定を無視する（施錠）', async () => {
    let release: (() => void) | null = null;
    const onReorder = vi.fn(() => new Promise<void>((res) => (release = () => res())));
    const { result } = setup({ onReorder });

    await act(async () => {
      result.current.handleDragEnd(drag('a', 'c'));
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(result.current.isReordering()).toBe(true);

    await act(async () => {
      result.current.handleDragEnd(drag('b', 'c'));
    });
    expect(onReorder).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
    });
    expect(result.current.isReordering()).toBe(false);
  });

  it('保存が成功しても失敗しても施錠が解け、次のドロップ確定が通る', async () => {
    const onReorder = vi
      .fn<(r: Row[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const { result } = setup({ onReorder });

    await act(async () => {
      result.current.handleDragEnd(drag('a', 'c'));
    });
    expect(result.current.isReordering()).toBe(false);

    await act(async () => {
      result.current.handleDragEnd(drag('a', 'b'));
    });
    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(result.current.isReordering()).toBe(false);
  });

  it('onReorder が同期で throw しても施錠は解ける', async () => {
    const onReorder = vi.fn(() => {
      throw new Error('sync boom');
    });
    const { result } = setup({ onReorder });

    await act(async () => {
      result.current.handleDragEnd(drag('a', 'c'));
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(result.current.isReordering()).toBe(false);
  });

  it('isBlocked が true を返す間はドロップ確定を無視し、false へ戻れば通る', async () => {
    const onReorder = vi.fn(async () => {});
    let blocked = true;
    const { result } = setup({ isBlocked: () => blocked, onReorder });

    await act(async () => {
      result.current.handleDragEnd(drag('a', 'c'));
    });
    expect(onReorder).not.toHaveBeenCalled();

    blocked = false;
    await act(async () => {
      result.current.handleDragEnd(drag('a', 'c'));
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it('施錠の状態が呼び出し側から読める（分類設定の横断ガードが参照する）', async () => {
    let release: (() => void) | null = null;
    const onReorder = vi.fn(() => new Promise<void>((res) => (release = () => res())));
    const { result } = setup({ onReorder });

    expect(result.current.isReordering()).toBe(false);
    await act(async () => {
      result.current.handleDragEnd(drag('a', 'c'));
    });
    expect(result.current.isReordering()).toBe(true);
    await act(async () => {
      release?.();
    });
    expect(result.current.isReordering()).toBe(false);
  });

  it('resetReordering は往復中を無視し finally に解錠を委ねる（早期解除しない）', async () => {
    let release: (() => void) | null = null;
    const onReorder = vi.fn(() => new Promise<void>((res) => (release = () => res())));
    const { result } = setup({ onReorder });

    await act(async () => {
      result.current.handleDragEnd(drag('a', 'c'));
    });
    expect(result.current.isReordering()).toBe(true);

    // 往復中の resetReordering は施錠を解かない（再オープン直後の load() との交錯を防ぐ）。
    act(() => {
      result.current.resetReordering();
    });
    expect(result.current.isReordering()).toBe(true);

    await act(async () => {
      release?.();
    });
    expect(result.current.isReordering()).toBe(false);

    // 施錠が解けた状態の resetReordering は何も壊さない。
    act(() => {
      result.current.resetReordering();
    });
    expect(result.current.isReordering()).toBe(false);
  });
});
