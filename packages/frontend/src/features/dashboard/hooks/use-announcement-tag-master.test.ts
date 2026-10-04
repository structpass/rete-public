import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnouncementTagMaster } from './use-announcement-tag-master';
import type { AnnouncementTagDto } from '../lib/api';

// rete-home-0043: useAnnouncementTagMaster は '../lib/api' の関数を useTagMaster にバインドしたラッパー。
// テストではネットワーク呼び出しを抑止し、API 関数の挙動は useTagMaster 本体のテストで検証する。
// cmn-0142: vi.hoisted 化（vi.mock ファクトリは hoisted されるため外側変数を参照しない）。
const {
  mockFetchAnnouncementTags,
  mockCreateAnnouncementTag,
  mockUpdateAnnouncementTag,
  mockDeleteAnnouncementTag,
} = vi.hoisted(() => ({
  mockFetchAnnouncementTags: vi.fn(),
  mockCreateAnnouncementTag: vi.fn(),
  mockUpdateAnnouncementTag: vi.fn(),
  mockDeleteAnnouncementTag: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAnnouncementTags: mockFetchAnnouncementTags,
  createAnnouncementTag: mockCreateAnnouncementTag,
  updateAnnouncementTag: mockUpdateAnnouncementTag,
  deleteAnnouncementTag: mockDeleteAnnouncementTag,
}));

// mock 設定後にインポート（hoisting の影響を受けない）。
import * as api from '../lib/api';

const mockTags: AnnouncementTagDto[] = [
  { id: 'at1', name: 'お知らせタグA', icon: 'Bell', color: 'blue', archived: false },
];

describe('useAnnouncementTagMaster — お知らせタグマスタ hook（rete-home-0043）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchAnnouncementTags).mockResolvedValue(mockTags);
  });

  it('マウント時にお知らせタグを取得する', async () => {
    const { result } = renderHook(() => useAnnouncementTagMaster());
    expect(result.current.loading).toBe(true);
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.tags).toEqual(mockTags);
    expect(result.current.error).toBe(false);
  });

  it('UseTagMasterResult の全メソッド・フィールドを持つ', async () => {
    const { result } = renderHook(() => useAnnouncementTagMaster());
    await act(async () => {});
    // インターフェース契約の確認（機能テストは use-tag-master.test.ts が担う）。
    expect(typeof result.current.create).toBe('function');
    expect(typeof result.current.update).toBe('function');
    expect(typeof result.current.remove).toBe('function');
    expect(typeof result.current.reload).toBe('function');
    expect(typeof result.current.loading).toBe('boolean');
    expect(typeof result.current.error).toBe('boolean');
    expect(typeof result.current.mutating).toBe('boolean');
    expect(Array.isArray(result.current.tags)).toBe(true);
  });

  it('kind 省略時は既定の board を fetch に渡す（hom-0074）', async () => {
    renderHook(() => useAnnouncementTagMaster());
    await act(async () => {});
    expect(api.fetchAnnouncementTags).toHaveBeenCalledWith('board', false);
  });

  it('kind を明示すると fetch/create にそのまま渡す（hom-0074）', async () => {
    const { result } = renderHook(() => useAnnouncementTagMaster('faq'));
    await act(async () => {});
    expect(api.fetchAnnouncementTags).toHaveBeenCalledWith('faq', false);

    vi.mocked(api.createAnnouncementTag).mockResolvedValue({
      id: 'at2',
      name: 'x',
      icon: 'Bell',
      color: 'blue',
      archived: false,
    });
    await act(async () => {
      await result.current.create('x', 'Bell', 'blue');
    });
    expect(api.createAnnouncementTag).toHaveBeenCalledWith('faq', 'x', 'Bell', 'blue');
  });

  it('includeArchived を明示すると fetch にそのまま渡す（hom-0084）', async () => {
    renderHook(() => useAnnouncementTagMaster('board', true));
    await act(async () => {});
    expect(api.fetchAnnouncementTags).toHaveBeenCalledWith('board', true);
  });

  it('同一 kind での再レンダーは fetchApi の identity を維持し再フェッチしない（cmn-0044）', async () => {
    const { result, rerender } = renderHook(() => useAnnouncementTagMaster('board'));
    await act(async () => {});
    const callsAfterMount = vi.mocked(api.fetchAnnouncementTags).mock.calls.length;
    rerender();
    await act(async () => {});
    expect(vi.mocked(api.fetchAnnouncementTags).mock.calls.length).toBe(callsAfterMount);
    expect(result.current.loading).toBe(false);
  });
});
