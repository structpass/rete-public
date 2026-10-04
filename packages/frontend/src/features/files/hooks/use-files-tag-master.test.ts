import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { TagDto } from '@rete/shared';

// fil-0094: useFilesTagMaster は '../lib/api' の関数を useTagMaster にバインドしたラッパー
// （HOME の useAnnouncementTagMaster と同型）。テストではネットワーク呼び出しを抑止し、
// API 関数の挙動は useTagMaster 本体のテスト（@/hooks/use-tag-master.test.ts）で検証する。
// cmn-0142: vi.hoisted 化
const { fnFetchTags, fnCreateTag, fnUpdateTag, fnDeleteTag } = vi.hoisted(() => ({
  fnFetchTags: vi.fn(),
  fnCreateTag: vi.fn(),
  fnUpdateTag: vi.fn(),
  fnDeleteTag: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchTags: fnFetchTags,
  createTag: fnCreateTag,
  updateTag: fnUpdateTag,
  deleteTag: fnDeleteTag,
}));

import * as api from '../lib/api';
import { useFilesTagMaster } from './use-tag-master';

const mockTags: TagDto[] = [
  { id: 't1', name: '重要', icon: 'Star', color: 'red', archived: false },
];

describe('useFilesTagMaster — File タグマスタ hook（fil-0094）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchTags).mockResolvedValue(mockTags);
  });

  it('マウント時にタグを取得する（includeArchived 省略時は false）', async () => {
    const { result } = renderHook(() => useFilesTagMaster());
    expect(result.current.loading).toBe(true);
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.tags).toEqual(mockTags);
    expect(api.fetchTags).toHaveBeenCalledWith(false);
  });

  it('includeArchived:true を fetch にそのまま渡す（タグ管理オーバーレイのアーカイブ表示切替）', async () => {
    renderHook(() => useFilesTagMaster(true));
    await act(async () => {});
    expect(api.fetchTags).toHaveBeenCalledWith(true);
  });

  it('includeArchived の切替で再フェッチする（fetch identity 変化 → mount useEffect 再発火）', async () => {
    const { rerender } = renderHook(({ archiveOnly }) => useFilesTagMaster(archiveOnly), {
      initialProps: { archiveOnly: false },
    });
    await act(async () => {});
    expect(api.fetchTags).toHaveBeenCalledTimes(1);

    rerender({ archiveOnly: true });
    await act(async () => {});
    expect(api.fetchTags).toHaveBeenCalledTimes(2);
    expect(api.fetchTags).toHaveBeenLastCalledWith(true);
  });

  it('同一 includeArchived での再レンダーは fetch の identity を維持し再フェッチしない（cmn-0044）', async () => {
    const { rerender } = renderHook(() => useFilesTagMaster(false));
    await act(async () => {});
    const callsAfterMount = vi.mocked(api.fetchTags).mock.calls.length;
    rerender();
    await act(async () => {});
    expect(vi.mocked(api.fetchTags).mock.calls.length).toBe(callsAfterMount);
  });

  it('update に archived を渡すと updateTag へそのまま委譲される（アーカイブトグル）', async () => {
    vi.mocked(api.updateTag).mockResolvedValue({ ...mockTags[0], archived: true });
    const { result } = renderHook(() => useFilesTagMaster());
    await act(async () => {});
    await act(async () => {
      await result.current.update('t1', { archived: true });
    });
    expect(api.updateTag).toHaveBeenCalledWith('t1', { archived: true });
  });
});
