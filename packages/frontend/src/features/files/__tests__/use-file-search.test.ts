import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// apiClient（axios インスタンス）をモック化し、検索フックが GET /files/search を正しく叩くか検証する。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
  },
}));

import { useFileSearch } from '../hooks/use-file-search';
import { toSearchResultItem, type SearchResultItemDto } from '../lib/api';

function envelope(items: SearchResultItemDto[], query = 'q') {
  return { data: { success: true, data: { query, items } } };
}

const folderHit: SearchResultItemDto = {
  kind: 'folder',
  id: 'f1',
  name: '入荷フォルダ',
  parentFolderId: null,
};
const fileHit: SearchResultItemDto = {
  kind: 'file',
  id: 'file1',
  name: '入荷表.xlsx',
  parentFolderId: 'f9',
};

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  get.mockResolvedValue(envelope([folderHit, fileHit]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toSearchResultItem（DTO → view 変換）', () => {
  it('kind / id / name / parentFolderId をそのまま写す', () => {
    expect(toSearchResultItem(folderHit)).toEqual({
      kind: 'folder',
      id: 'f1',
      name: '入荷フォルダ',
      parentFolderId: null,
    });
    expect(toSearchResultItem(fileHit)).toEqual({
      kind: 'file',
      id: 'file1',
      name: '入荷表.xlsx',
      parentFolderId: 'f9',
    });
  });
});

describe('useFileSearch', () => {
  it('空文字（trim 後）は active=false で API を叩かない', () => {
    const { result } = renderHook(() => useFileSearch('   '));
    expect(result.current.active).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('非空クエリを debounce して GET /files/search を q 付きで叩き、結果を返す', async () => {
    const { result } = renderHook(() => useFileSearch('入荷'));
    expect(result.current.active).toBe(true);
    // debounce 前は未発火。
    expect(get).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(get).toHaveBeenCalledWith('/files/search', { params: { q: '入荷' } });
    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0]).toMatchObject({ kind: 'folder', id: 'f1' });
    expect(result.current.error).toBe(false);
  });

  it('連続入力では最後のクエリのみ確定する（stale 応答を無視）', async () => {
    const { result, rerender } = renderHook(({ q }) => useFileSearch(q), {
      initialProps: { q: '入' },
    });
    // 1 文字目の debounce が満了する前に入力が伸びる → タイマーは貼り替えられ最後のクエリのみ走る。
    rerender({ q: '入荷' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/files/search', { params: { q: '入荷' } });
    expect(result.current.results).toHaveLength(2);
  });

  it('入力が空に戻ると結果を破棄し active=false に戻す', async () => {
    const { result, rerender } = renderHook(({ q }) => useFileSearch(q), {
      initialProps: { q: '入荷' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.results).toHaveLength(2);

    rerender({ q: '' });
    expect(result.current.active).toBe(false);
    expect(result.current.results).toHaveLength(0);
  });

  it('API 失敗時は error=true・results 空', async () => {
    get.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useFileSearch('入荷'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.error).toBe(true);
    expect(result.current.results).toHaveLength(0);
  });
});
