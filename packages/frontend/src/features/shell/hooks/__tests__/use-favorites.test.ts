import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { FavoriteDto } from '@rete/shared';

// favorites-api をモックし、フックの取得/追加/削除/楽観並び替えの挙動を検証する。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchFavorites, addFavorite, removeFavorite, reorderFavorites } = vi.hoisted(() => ({
  fetchFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  reorderFavorites: vi.fn(),
}));

vi.mock('../../lib/favorites-api', () => ({
  fetchFavorites: (...a: unknown[]) => fetchFavorites(...a),
  addFavorite: (...a: unknown[]) => addFavorite(...a),
  removeFavorite: (...a: unknown[]) => removeFavorite(...a),
  reorderFavorites: (...a: unknown[]) => reorderFavorites(...a),
}));

import { useFavorites } from '../use-favorites';

function fav(id: string, label = id): FavoriteDto {
  return { id, kind: 'chat', targetRef: `ref-${id}`, label };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchFavorites.mockResolvedValue([fav('a'), fav('b')]);
});

describe('useFavorites', () => {
  it('マウント時に一覧を取得し loading を解除する', async () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((f) => f.id)).toEqual(['a', 'b']);
    expect(result.current.error).toBeNull();
  });

  it('取得失敗時は error をセットする', async () => {
    fetchFavorites.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.error).toBe('お気に入りの取得に失敗しました'));
  });

  it('add は API 呼び出し後に一覧を再取得する', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    addFavorite.mockResolvedValue(fav('c'));
    fetchFavorites.mockResolvedValueOnce([fav('a'), fav('b'), fav('c')]);
    await act(async () => {
      await result.current.add({ kind: 'chat', label: '新規' });
    });

    expect(addFavorite).toHaveBeenCalledWith({ kind: 'chat', label: '新規' });
    expect(result.current.items.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('remove は API 呼び出し後に一覧を再取得する', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    removeFavorite.mockResolvedValue(undefined);
    fetchFavorites.mockResolvedValueOnce([fav('b')]);
    await act(async () => {
      await result.current.remove('a');
    });

    expect(removeFavorite).toHaveBeenCalledWith('a');
    expect(result.current.items.map((f) => f.id)).toEqual(['b']);
  });

  it('addMany は各件を add した後、再取得を 1 回だけ行い件数を集計して返す', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    addFavorite.mockResolvedValue(undefined);
    fetchFavorites.mockClear();
    fetchFavorites.mockResolvedValueOnce([fav('a'), fav('b'), fav('c'), fav('d')]);

    let summary: { ok: number; failed: string[] } | undefined;
    await act(async () => {
      summary = await result.current.addMany([
        { kind: 'folder', targetRef: 'F1', label: 'フォルダ' },
        { kind: 'file', targetRef: 'X1', label: 'ファイル' },
      ]);
    });

    expect(addFavorite).toHaveBeenCalledTimes(2);
    // N 件登録でも再取得は 1 回だけ（add 毎の N+1 refetch を避ける）。
    expect(fetchFavorites).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ ok: 2, failed: [] });
    expect(result.current.items.map((f) => f.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('addMany は失敗件の label を集計し、1 件以上成功時のみ再取得する', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    addFavorite.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('409'));
    fetchFavorites.mockClear();
    fetchFavorites.mockResolvedValueOnce([fav('a'), fav('b'), fav('c')]);

    let summary: { ok: number; failed: string[] } | undefined;
    await act(async () => {
      summary = await result.current.addMany([
        { kind: 'folder', targetRef: 'F1', label: 'OK フォルダ' },
        { kind: 'folder', targetRef: 'F2', label: 'NG フォルダ' },
      ]);
    });

    expect(summary).toEqual({ ok: 1, failed: ['NG フォルダ'] });
    expect(fetchFavorites).toHaveBeenCalledTimes(1);
  });

  it('addMany は全件失敗なら再取得しない', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    addFavorite.mockRejectedValue(new Error('409'));
    fetchFavorites.mockClear();

    let summary: { ok: number; failed: string[] } | undefined;
    await act(async () => {
      summary = await result.current.addMany([{ kind: 'folder', targetRef: 'F1', label: 'NG' }]);
    });

    expect(summary).toEqual({ ok: 0, failed: ['NG'] });
    expect(fetchFavorites).not.toHaveBeenCalled();
  });

  it('reorder は楽観的に即並び替え、確定データで上書きする', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    reorderFavorites.mockResolvedValue([fav('b'), fav('a')]);
    await act(async () => {
      await result.current.reorder(['b', 'a']);
    });

    expect(reorderFavorites).toHaveBeenCalledWith(['b', 'a']);
    expect(result.current.items.map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('reorder 失敗時は元の並びへロールバックし error をセットする', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    reorderFavorites.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.reorder(['b', 'a']);
    });

    expect(result.current.items.map((f) => f.id)).toEqual(['a', 'b']);
    expect(result.current.error).toBe('並び替えに失敗しました');
  });
});
