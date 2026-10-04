import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// api をモックして fetchChatThemes 呼び出し（サーバー絞り込みパラメータ）を検証する。
// cmn-0142: vi.hoisted 化
const { mockFetchChatThemes, mockCreateChatTheme } = vi.hoisted(() => ({
  mockFetchChatThemes: vi.fn(),
  mockCreateChatTheme: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchChatThemes: mockFetchChatThemes,
  createChatTheme: mockCreateChatTheme,
}));

import { useChatThemes } from '../hooks/use-chat-themes';
import { fetchChatThemes } from '../lib/api';

const mockFetch = vi.mocked(fetchChatThemes);

function envelope() {
  return {
    success: true as const,
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  };
}

describe('useChatThemes サーバー絞り込み（mention From/To / rete-desk-0049）', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(envelope());
  });

  it('マウント時に 1 度だけ取得する（初期パラメータは空 / falsy フィルタは送らない）', async () => {
    renderHook(() => useChatThemes());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith({ mentionFrom: [], mentionTo: [] });
  });

  it('search/archiveOnly/tenmatsuOnly を server パラメータとして送る（client→server 統一 / A案）', async () => {
    const { result } = renderHook(() => useChatThemes());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    act(() =>
      result.current.setServerFilter({
        search: '在庫',
        archiveOnly: true,
        tenmatsuOnly: true,
        mentionFrom: [],
        mentionTo: [],
      }),
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch).toHaveBeenLastCalledWith({
      search: '在庫',
      archiveOnly: true,
      tenmatsuOnly: true,
      mentionFrom: [],
      mentionTo: [],
    });
  });

  it('falsy な search/archiveOnly/tenmatsuOnly はパラメータから省く（URL を汚さない）', async () => {
    const { result } = renderHook(() => useChatThemes());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // mention だけ変えて再取得させ、falsy スカラーが省かれることを確認する。
    act(() =>
      result.current.setServerFilter({
        search: '',
        archiveOnly: false,
        tenmatsuOnly: false,
        mentionFrom: ['acc-1'],
        mentionTo: [],
      }),
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch).toHaveBeenLastCalledWith({ mentionFrom: ['acc-1'], mentionTo: [] });
  });

  it('setServerFilter で mention が変わるとそのパラメータで再取得する', async () => {
    const { result } = renderHook(() => useChatThemes());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    act(() => result.current.setServerFilter({ mentionFrom: ['acc-1'], mentionTo: [] }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch).toHaveBeenLastCalledWith({ mentionFrom: ['acc-1'], mentionTo: [] });
  });

  it('値が等しい setServerFilter では再取得しない（マウント直後の二重取得を防ぐ）', async () => {
    const { result } = renderHook(() => useChatThemes());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    act(() => result.current.setServerFilter({ mentionFrom: [], mentionTo: [] }));
    // 値が初期と等価なので追加取得は走らない。
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refetch は現在のサーバー絞り込みパラメータを維持して再取得する', async () => {
    const { result } = renderHook(() => useChatThemes());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    act(() => result.current.setServerFilter({ mentionFrom: ['x'], mentionTo: ['y'] }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await act(async () => {
      await result.current.refetch();
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenLastCalledWith({ mentionFrom: ['x'], mentionTo: ['y'] });
  });

  it('markThemeReadLocal は該当テーマの hasUnread を再取得せずローカルで落とす（楽観的既読化 / rete-desk-0075）', async () => {
    const unreadTheme = {
      id: 't1',
      title: '未読',
      hasUnread: true,
      hasMentionToMe: false,
      hasTenmatsu: false,
      archived: false,
      status: 'OPEN',
      author: { id: 'u1', name: '山田' },
      messageCount: 1,
      lastMessageAt: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    mockFetch.mockResolvedValue({
      success: true as const,
      data: [unreadTheme] as never,
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const { result } = renderHook(() => useChatThemes());
    await waitFor(() => expect(result.current.themes).toHaveLength(1));
    expect(result.current.themes[0].hasUnread).toBe(true);

    act(() => result.current.markThemeReadLocal('t1'));

    expect(result.current.themes[0].hasUnread).toBe(false);
    // 楽観更新はローカル state のみ。再取得（fetchChatThemes）は走らせない。
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
