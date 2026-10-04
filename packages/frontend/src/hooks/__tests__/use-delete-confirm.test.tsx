import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeleteConfirm } from '../use-delete-confirm';

describe('useDeleteConfirm', () => {
  it('確定直後にダイアログを閉じ、remove 成功時は onSuccess へ id と確定時点の対象実体を渡すこと（close-first・cmn-0352）', async () => {
    let resolveRemove!: (v: boolean) => void;
    const remove = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRemove = resolve;
        }),
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDeleteConfirm<{ id: number }>({ remove, onSuccess }));

    act(() => result.current.setDeleteTarget({ id: 5 }));
    expect(result.current.deleteTarget).toEqual({ id: 5 });

    let deletePromise!: Promise<void>;
    act(() => {
      deletePromise = result.current.handleDelete();
    });
    // remove が未解決の間も、確定直後にダイアログは閉じている（close-first・criteria 1）。
    expect(result.current.deleteTarget).toBeNull();
    expect(remove).toHaveBeenCalledWith(5, { id: 5 });

    await act(async () => {
      resolveRemove(true);
      await deletePromise;
    });

    expect(onSuccess).toHaveBeenCalledWith(5, { id: 5 });
    expect(result.current.deleteTarget).toBeNull();
  });

  it('remove 失敗時は onSuccess を呼ばず、それでもダイアログは閉じたままであること', async () => {
    // cmn-0384: 成功パスと同じ未解決 Promise 方式で「確定直後に閉じる」を失敗パスでも弁別する。
    // mockResolvedValue(false) ＋完了後 assert だけでは旧実装（close-last＝await remove 後に
    // setDeleteTarget(null)）でも緑になり、close-first 契約の回帰を検出できない。
    let resolveRemove!: (v: boolean) => void;
    const remove = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRemove = resolve;
        }),
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDeleteConfirm<{ id: number }>({ remove, onSuccess }));

    act(() => result.current.setDeleteTarget({ id: 9 }));

    let deletePromise!: Promise<void>;
    act(() => {
      deletePromise = result.current.handleDelete();
    });
    // remove が未解決の間も、確定直後にダイアログは閉じている（close-first・旧 close-last では赤くなる）。
    expect(result.current.deleteTarget).toBeNull();
    expect(remove).toHaveBeenCalledWith(9, { id: 9 });

    await act(async () => {
      resolveRemove(false);
      await deletePromise;
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.deleteTarget).toBeNull();
  });

  it('対象未選択の状態で確定経路を呼んでも削除処理が実行されないこと（criteria 4）', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useDeleteConfirm<{ id: number }>({ remove }));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(remove).not.toHaveBeenCalled();
  });
});
