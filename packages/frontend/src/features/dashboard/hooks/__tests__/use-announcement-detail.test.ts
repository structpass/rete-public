import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { AnnouncementDetail } from '../../lib/api';

// cmn-0142: vi.hoisted 化
const { mockFetchAnnouncementDetail } = vi.hoisted(() => ({
  mockFetchAnnouncementDetail: vi.fn(),
}));

// fetchAnnouncementDetail をモックし「id で取得・null は GET しない・切替 race ガード」を検証する。
vi.mock('../../lib/api', () => ({
  fetchAnnouncementDetail: mockFetchAnnouncementDetail,
}));

import { useAnnouncementDetail } from '../use-announcement-detail';
import { fetchAnnouncementDetail } from '../../lib/api';

const mockFetch = vi.mocked(fetchAnnouncementDetail);

function detail(id: string, title: string): AnnouncementDetail {
  return {
    id,
    title,
    publishedAt: '2026-07-01T00:00:00.000Z',
    author: '田中 太郎',
    body: `${title} の本文`,
    attachments: [],
    tags: [],
  };
}

describe('useAnnouncementDetail', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('id 指定で詳細を取得し detail に格納する', async () => {
    mockFetch.mockResolvedValue(detail('n1', 'お知らせ1'));
    const { result } = renderHook(() => useAnnouncementDetail('n1'));

    await waitFor(() => expect(result.current.detail?.id).toBe('n1'));
    expect(mockFetch).toHaveBeenCalledWith('n1');
  });

  it('id=null は GET せず detail は null のまま', async () => {
    const { result } = renderHook(() => useAnnouncementDetail(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.detail).toBeNull();
  });

  it('取得失敗時は error を立て detail は null のまま', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useAnnouncementDetail('n1'));

    await waitFor(() => expect(result.current.error).toBe('通知の取得に失敗しました'));
    expect(result.current.detail).toBeNull();
  });

  it('選択切替後に解決した旧 id の応答は捨てる（use-task-comments と同方針の race ガード）', async () => {
    // n1 の応答を遅延させ、n2 へ切替→n2 反映後に n1 が解決する状況を再現。
    let resolveOld!: (v: AnnouncementDetail) => void;
    mockFetch.mockImplementation((id: string) => {
      if (id === 'n1') return new Promise<AnnouncementDetail>((r) => (resolveOld = r));
      return Promise.resolve(detail('n2', 'お知らせ2'));
    });
    const { result, rerender } = renderHook(({ id }) => useAnnouncementDetail(id), {
      initialProps: { id: 'n1' as string | null },
    });
    rerender({ id: 'n2' });
    await waitFor(() => expect(result.current.detail?.id).toBe('n2'));

    // 旧 id（n1）の応答が遅れて解決しても、表示中の選択（n2）の detail を上書きしない。
    resolveOld(detail('n1', 'お知らせ1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.detail?.id).toBe('n2');
  });

  it('選択切替後に解決した旧 id の失敗は error に出さない（catch 側の race ガード）', async () => {
    let rejectOld!: (e: Error) => void;
    mockFetch.mockImplementation((id: string) => {
      if (id === 'n1') return new Promise<AnnouncementDetail>((_, rej) => (rejectOld = rej));
      return Promise.resolve(detail('n2', 'お知らせ2'));
    });
    const { result, rerender } = renderHook(({ id }) => useAnnouncementDetail(id), {
      initialProps: { id: 'n1' as string | null },
    });
    rerender({ id: 'n2' });
    await waitFor(() => expect(result.current.detail?.id).toBe('n2'));

    // 旧 id（n1）の失敗が遅れて解決しても、表示中の選択（n2）へ error を出さない。
    rejectOld(new Error('boom'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.detail?.id).toBe('n2');
  });
});
