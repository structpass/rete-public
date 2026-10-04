import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SpaceKind, type SpaceDto } from '@rete/shared';

// fetchSpaces をモックして「展開時 lazy 取得 / 二重発火抑止 / 失敗後リトライ」を検証する。
// cmn-0142: vi.hoisted 化
const { mockFetchSpaces } = vi.hoisted(() => ({
  mockFetchSpaces: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchSpaces: mockFetchSpaces,
}));

import { useProjectChannels } from '../use-project-channels';
import { fetchSpaces } from '../../lib/api';

const mockFetch = vi.mocked(fetchSpaces);

function channel(id: string, projectId: string): SpaceDto {
  return {
    id,
    kind: SpaceKind.CHANNEL,
    projectId,
    ownerId: null,
    peerAccountId: null,
    name: id,
    sortOrder: 0,
    archived: false,
    canManageMembers: false,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  };
}

describe('useProjectChannels', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('loadChannels で kind=CHANNEL + projectId 指定の取得をし channelsByProject に格納する', async () => {
    mockFetch.mockResolvedValue([channel('c1', 'p1')]);
    const { result } = renderHook(() => useProjectChannels());

    act(() => result.current.loadChannels('p1'));
    await waitFor(() => expect(result.current.channelsByProject.p1).toHaveLength(1));

    expect(mockFetch).toHaveBeenCalledWith({ kind: SpaceKind.CHANNEL, projectId: 'p1' });
    expect(result.current.channelsByProject.p1[0].id).toBe('c1');
  });

  it('同一 projectId の連続呼び出しは 1 回に収める（二重発火抑止）', async () => {
    mockFetch.mockResolvedValue([channel('c1', 'p1')]);
    const { result } = renderHook(() => useProjectChannels());

    act(() => {
      result.current.loadChannels('p1');
      result.current.loadChannels('p1');
    });
    await waitFor(() => expect(result.current.channelsByProject.p1).toBeDefined());
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('取得失敗時はキャッシュせず、次回展開で再試行できる', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([channel('c1', 'p1')]);
    const { result } = renderHook(() => useProjectChannels());

    act(() => result.current.loadChannels('p1'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // 失敗後は channelsByProject に p1 が無い（キャッシュしない）。
    expect(result.current.channelsByProject.p1).toBeUndefined();

    // 再試行が通る（requested から外れている）。
    act(() => result.current.loadChannels('p1'));
    await waitFor(() => expect(result.current.channelsByProject.p1).toHaveLength(1));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
