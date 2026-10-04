import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnouncements } from './use-announcements';
import type { AnnouncementSummary } from '../lib/api';

// hom-0073: useAnnouncements に kind 引数を追加。fetch/create/reorder へ kind が渡ることを検証する
// （update/remove は id 単位の操作で kind を必要としない・backend 未受理のため対象外）。
// cmn-0142: vi.hoisted 化
const {
  mockFetchAnnouncements,
  mockCreateAnnouncement,
  mockUpdateAnnouncement,
  mockDeleteAnnouncement,
  mockReorderAnnouncements,
} = vi.hoisted(() => ({
  mockFetchAnnouncements: vi.fn(),
  mockCreateAnnouncement: vi.fn(),
  mockUpdateAnnouncement: vi.fn(),
  mockDeleteAnnouncement: vi.fn(),
  mockReorderAnnouncements: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAnnouncements: mockFetchAnnouncements,
  createAnnouncement: mockCreateAnnouncement,
  updateAnnouncement: mockUpdateAnnouncement,
  deleteAnnouncement: mockDeleteAnnouncement,
  reorderAnnouncements: mockReorderAnnouncements,
}));

import * as api from '../lib/api';

const items: AnnouncementSummary[] = [
  {
    id: 'a1',
    title: 'お知らせ1',
    publishedAt: '2026-06-01T00:00:00.000Z',
    author: '田中 太郎',
    excerpt: '',
    unread: false,
    tags: [],
  },
];

describe('useAnnouncements — kind スコープ（hom-0073）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchAnnouncements).mockResolvedValue({
      success: true,
      data: items,
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('kind 省略時は既定の board を fetch に渡す', async () => {
    renderHook(() => useAnnouncements());
    await act(async () => {});
    expect(api.fetchAnnouncements).toHaveBeenCalledWith({ page: 1, limit: 20, kind: 'board' });
  });

  it('kind を明示すると fetch/create/reorder にそのまま渡す', async () => {
    const { result } = renderHook(() => useAnnouncements('faq'));
    await act(async () => {});
    expect(api.fetchAnnouncements).toHaveBeenCalledWith({ page: 1, limit: 20, kind: 'faq' });

    vi.mocked(api.createAnnouncement).mockResolvedValue({
      id: 'a2',
      title: '新規',
      publishedAt: '2026-06-02T00:00:00.000Z',
      author: '田中 太郎',
      body: '',
      attachments: [],
      tags: [],
    });
    await act(async () => {
      await result.current.create({ title: '新規' });
    });
    expect(api.createAnnouncement).toHaveBeenCalledWith({ title: '新規' }, 'faq');

    vi.mocked(api.reorderAnnouncements).mockResolvedValue(items);
    await act(async () => {
      await result.current.reorder(['a1']);
    });
    expect(api.reorderAnnouncements).toHaveBeenCalledWith(['a1'], 'faq');
  });

  it('同一 kind での再レンダーは load の identity を維持し再フェッチしない', async () => {
    const { rerender } = renderHook(() => useAnnouncements('board'));
    await act(async () => {});
    const callsAfterMount = vi.mocked(api.fetchAnnouncements).mock.calls.length;
    rerender();
    await act(async () => {});
    expect(vi.mocked(api.fetchAnnouncements).mock.calls.length).toBe(callsAfterMount);
  });
});
