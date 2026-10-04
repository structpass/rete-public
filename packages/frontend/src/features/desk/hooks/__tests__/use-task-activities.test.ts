import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { TaskActivityDto, TaskActivityField, TaskActivityListDto } from '../../lib/api';

// fetchTaskActivities をモックし「taskId で取得・null は GET しない・失敗時 error・truncated 露出」を検証する。
// cmn-0142: vi.hoisted 化
const { mockFetchTaskActivities } = vi.hoisted(() => ({
  mockFetchTaskActivities: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchTaskActivities: mockFetchTaskActivities,
}));

import { useTaskActivities } from '../use-task-activities';
import { fetchTaskActivities } from '../../lib/api';

const mockFetch = vi.mocked(fetchTaskActivities);

function activity(
  id: string,
  // cmn-0211: field は shared の TaskActivityField union（backend と同一）。ここを string へ緩めると
  // 集約の意味が消える（未知のキーを渡すテストを書けてしまう）。
  field: TaskActivityField,
  fromLabel: string | null,
  toLabel: string | null,
): TaskActivityDto {
  return {
    id,
    taskId: 1,
    field,
    fromLabel,
    toLabel,
    actor: { id: 'acc-1', name: '田中 太郎' },
    createdAt: '2026-06-23T00:00:00.000Z',
  };
}

/** dsk-0228: API は { activities, truncated } の包みを返す。 */
function list(activities: TaskActivityDto[], truncated = false): TaskActivityListDto {
  return { activities, truncated };
}

describe('useTaskActivities (dsk-0223)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('taskId 指定で履歴を取得し activities に格納する', async () => {
    mockFetch.mockResolvedValue(
      list([
        activity('a1', 'status', '未着手', '対応中'),
        activity('a2', 'assignee', '未割当', '佐藤'),
      ]),
    );
    const { result } = renderHook(() => useTaskActivities(1));

    await waitFor(() => expect(result.current.activities).toHaveLength(2));
    expect(mockFetch).toHaveBeenCalledWith(1);
    expect(result.current.activities[0].field).toBe('status');
    // 上限未満なら truncated は立たない（dsk-0228）。
    expect(result.current.truncated).toBe(false);
  });

  it('API の truncated=true を露出する（履歴タブの「最新200件まで表示」注記用・dsk-0228）', async () => {
    mockFetch.mockResolvedValue(list([activity('a1', 'status', '未着手', '対応中')], true));
    const { result } = renderHook(() => useTaskActivities(1));

    await waitFor(() => expect(result.current.truncated).toBe(true));
    expect(result.current.activities).toHaveLength(1);
  });

  it('taskId=null は GET せず空のまま（無効 id への取得を避ける）', async () => {
    const { result } = renderHook(() => useTaskActivities(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.activities).toHaveLength(0);
    expect(result.current.truncated).toBe(false);
  });

  it('取得失敗時は error を立て activities は空のまま', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useTaskActivities(1));

    await waitFor(() => expect(result.current.error).toBe('変更履歴の取得に失敗しました'));
    expect(result.current.activities).toHaveLength(0);
  });

  it('タスク切替後に解決した旧タスクの応答は捨てる（use-task-comments と同方針の race ガード）', async () => {
    // taskId=1 の応答を遅延させ、taskId=2 へ切替→2 の応答が反映された後で 1 が解決する状況を再現。
    let resolveOld!: (v: TaskActivityListDto) => void;
    mockFetch.mockImplementation((taskId: number) => {
      if (taskId === 1) return new Promise<TaskActivityListDto>((r) => (resolveOld = r));
      return Promise.resolve(list([activity('b1', 'status', '対応中', '完了')], true));
    });
    const { result, rerender } = renderHook(({ taskId }) => useTaskActivities(taskId), {
      initialProps: { taskId: 1 },
    });
    rerender({ taskId: 2 });
    await waitFor(() => expect(result.current.activities).toHaveLength(1));

    // 旧タスク（taskId=1）の応答が遅れて解決しても、表示中タスク（2）の状態を上書きしない。
    resolveOld(
      list([
        activity('a1', 'status', '未着手', '対応中'),
        activity('a2', 'assignee', null, '佐藤'),
      ]),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].id).toBe('b1');
    expect(result.current.truncated).toBe(true);
  });

  it('タスク切替後に解決した旧タスクの失敗は error に出さない（catch 側の race ガード）', async () => {
    let rejectOld!: (e: Error) => void;
    mockFetch.mockImplementation((taskId: number) => {
      if (taskId === 1) return new Promise<TaskActivityListDto>((_, rej) => (rejectOld = rej));
      return Promise.resolve(list([activity('b1', 'status', '対応中', '完了')]));
    });
    const { result, rerender } = renderHook(({ taskId }) => useTaskActivities(taskId), {
      initialProps: { taskId: 1 },
    });
    rerender({ taskId: 2 });
    await waitFor(() => expect(result.current.activities).toHaveLength(1));

    // 旧タスク（taskId=1）の失敗が遅れて解決しても、表示中タスク（2）へ error を出さない。
    rejectOld(new Error('boom'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.activities[0].id).toBe('b1');
  });
});
