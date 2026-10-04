import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { TaskCommentDto } from '../lib/api';

// fetchTaskComments / postTaskComment / toggleTaskCommentReaction をモックし
// 「taskId で読み込み・投稿後に再取得・null は GET しない・トグルは reload で最新化（dsk-0297）」を検証する。
// reload のタスク切替 race（dsk-0279）も同一 hook のテストとして本ファイルへ集約（cmn-0162・flat 配置へ統一）。
// cmn-0142: vi.hoisted 化
const {
  mockFetchTaskComments,
  mockPostTaskComment,
  mockUpdateTaskComment,
  mockDeleteTaskComment,
  mockToggleTaskCommentReaction,
  mockFlushFileIds,
} = vi.hoisted(() => ({
  mockFetchTaskComments: vi.fn(),
  mockPostTaskComment: vi.fn(),
  mockUpdateTaskComment: vi.fn(),
  mockDeleteTaskComment: vi.fn(),
  mockToggleTaskCommentReaction: vi.fn(),
  mockFlushFileIds: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchTaskComments: mockFetchTaskComments,
  postTaskComment: mockPostTaskComment,
  updateTaskComment: mockUpdateTaskComment,
  deleteTaskComment: mockDeleteTaskComment,
  toggleTaskCommentReaction: mockToggleTaskCommentReaction,
}));
// 保留添付の flush（dsk-0249）。確定コメント id へ best-effort 添付する共有ヘルパをモックする。
vi.mock('../lib/flush-file-ids', () => ({
  flushFileIds: mockFlushFileIds,
}));

import { useTaskComments } from '../hooks/use-task-comments';
import { fetchTaskComments, postTaskComment, toggleTaskCommentReaction } from '../lib/api';
import { flushFileIds } from '../lib/flush-file-ids';

const mockFetch = vi.mocked(fetchTaskComments);
const mockPost = vi.mocked(postTaskComment);
const mockToggleReaction = vi.mocked(toggleTaskCommentReaction);
const mockFlush = vi.mocked(flushFileIds);

function comment(id: string, body: string): TaskCommentDto {
  return {
    id,
    taskId: 1,
    body,
    author: { id: 'acc-1', name: '田中 太郎' },
    // 宛先（メンション先 / dsk-0203）。fixture は宛先なしを既定とする。
    mentions: [],
    attachments: [],
    // リアクション（dsk-0297）。fixture は未リアクションを既定とする。
    reactions: [],
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
  };
}

describe('useTaskComments', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockPost.mockReset();
    mockToggleReaction.mockReset();
    mockFlush.mockReset();
    mockFlush.mockResolvedValue(undefined);
  });

  it('taskId 指定で一覧を取得し comments に格納する', async () => {
    mockFetch.mockResolvedValue([comment('c1', '<p>初回</p>')]);
    const { result } = renderHook(() => useTaskComments(1));

    await waitFor(() => expect(result.current.comments).toHaveLength(1));
    expect(mockFetch).toHaveBeenCalledWith(1);
    expect(result.current.comments[0].body).toBe('<p>初回</p>');
  });

  it('taskId=null は GET せず空のまま（無効 id への取得を避ける）', async () => {
    const { result } = renderHook(() => useTaskComments(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.comments).toHaveLength(0);
  });

  it('submit は投稿し、返却コメントを末尾へ追記する（再取得しない＝初コメントのスピナーちらつき防止・dsk-0219）', async () => {
    mockFetch.mockResolvedValueOnce([comment('c1', '<p>既存</p>')]);
    mockPost.mockResolvedValue(comment('c2', '<p>追記</p>'));
    const { result } = renderHook(() => useTaskComments(1));
    await waitFor(() => expect(result.current.comments).toHaveLength(1));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit('<p>追記</p>');
    });

    expect(ok).toBe(true);
    // 第3引数は宛先（mentionAccountIds / dsk-0203）。未指定 submit は空配列で素通しする。
    expect(mockPost).toHaveBeenCalledWith(1, '<p>追記</p>', []);
    // 再取得（fetch 2回目）せず、返却 DTO を末尾へ append して時系列を保つ。
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.comments).toHaveLength(2);
    expect(result.current.comments[1].id).toBe('c2');
  });

  it('タスク切替後に解決した投稿は別タスクへ混入させない（created.taskId 不一致で append しない・dsk-0219 race ガード）', async () => {
    // taskId=1 を表示、空一覧。POST は taskId=2 のコメントを返す（=切替後に解決した想定）。
    mockFetch.mockResolvedValue([]);
    mockPost.mockResolvedValue({ ...comment('cX', '<p>遅延</p>'), taskId: 2 });
    const { result } = renderHook(() => useTaskComments(1));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit('<p>遅延</p>');
    });

    // 投稿自体は成功（true）だが、現在表示中(taskId=1)と不一致のため append されない。
    expect(ok).toBe(true);
    expect(result.current.comments).toHaveLength(0);
  });

  it('保留添付ありの submit は確定コメントへ flush し一覧を再取得して添付を反映する（dsk-0249）', async () => {
    // 初回ロード=空 → POST で c2 確定（taskId=1 一致）→ flush 後に再取得（2回目 fetch）で添付付き一覧へ差し替え。
    mockFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...comment('c2', '<p>添付付</p>'), attachments: [{ id: 'att-1' } as never] },
      ]);
    mockPost.mockResolvedValue(comment('c2', '<p>添付付</p>'));
    const { result } = renderHook(() => useTaskComments(1));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit('<p>添付付</p>', ['file-1']);
    });

    expect(ok).toBe(true);
    // 確定コメント id（c2）へ taskComment 対象で flush する（チャット返信の post→attach→reload と同型）。
    expect(mockFlush).toHaveBeenCalledWith(['file-1'], 'taskComment', 'c2');
    // flush 後に当該タスクの一覧を再取得（fetch 2回目）して添付を反映する。
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.comments[0]?.attachments).toHaveLength(1));
  });

  it('保留添付ありでもタスク切替後に解決した投稿は flush せず別タスクへ再取得しない（dsk-0249 race ガード）', async () => {
    // 表示=taskId=1。POST は taskId=2 のコメントを返す（切替後に解決）。created.taskId 不一致で append/再取得しない。
    mockFetch.mockResolvedValue([]);
    mockPost.mockResolvedValue({ ...comment('cX', '<p>遅延添付</p>'), taskId: 2 });
    const { result } = renderHook(() => useTaskComments(1));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit('<p>遅延添付</p>', ['file-1']);
    });

    expect(ok).toBe(true);
    // flush 自体は best-effort で呼ぶ（添付は確定コメントに紐づく）が、再取得は現タスク不一致でスキップ。
    expect(mockFlush).toHaveBeenCalledWith(['file-1'], 'taskComment', 'cX');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.comments).toHaveLength(0);
  });

  it('submit は taskId=null なら投稿せず false（無効 id への POST を避ける）', async () => {
    const { result } = renderHook(() => useTaskComments(null));

    let ok = true;
    await act(async () => {
      ok = await result.current.submit('<p>x</p>');
    });

    expect(ok).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('投稿失敗時は false を返す（一覧は再取得しない・表示は composer 側に委ね hook.error は load 専用で汚さない）', async () => {
    mockFetch.mockResolvedValueOnce([]);
    mockPost.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useTaskComments(1));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    let ok = true;
    await act(async () => {
      ok = await result.current.submit('<p>失敗</p>');
    });

    expect(ok).toBe(false);
    // 投稿失敗では load 専用の error を立てない（投稿エラーは composer のローカル error が表示する）。
    expect(result.current.error).toBeNull();
    // 失敗時は再取得しないので fetch は初回ロードの 1 回のみ。
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe('toggleReaction（dsk-0297）', () => {
    it('トグル API を呼び、成功後に一覧を再取得する（use-chat-thread.handleToggleMessageReaction と同型）', async () => {
      mockFetch.mockResolvedValueOnce([comment('c1', '<p>本文</p>')]).mockResolvedValueOnce([
        {
          ...comment('c1', '<p>本文</p>'),
          reactions: [{ emoji: '👍', count: 1, reactedByMe: true }],
        },
      ]);
      mockToggleReaction.mockResolvedValue({ reacted: true });
      const { result } = renderHook(() => useTaskComments(1));
      await waitFor(() => expect(result.current.comments).toHaveLength(1));

      await act(async () => {
        await result.current.toggleReaction('c1', '👍');
      });

      expect(mockToggleReaction).toHaveBeenCalledWith(1, 'c1', '👍');
      // トグル API は {reacted} のみ返すため、count/reactedByMe の最新化は一覧の再取得（fetch 2回目）に委ねる。
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.current.comments[0].reactions).toEqual([
        { emoji: '👍', count: 1, reactedByMe: true },
      ]);
    });

    it('taskId=null ならトグル API を呼ばない（無効 id への POST を避ける）', async () => {
      const { result } = renderHook(() => useTaskComments(null));

      await act(async () => {
        await result.current.toggleReaction('c1', '👍');
      });

      expect(mockToggleReaction).not.toHaveBeenCalled();
    });
  });

  describe('reload のタスク切替 race ガード（dsk-0279）', () => {
    it('reload が別タスクへの切替後に解決しても、新タスクの一覧を stale データで上書きしないこと', async () => {
      // 1回目（task1 初回 load）・3回目（task2 初回 load）は即時解決、2回目（task1 の reload）は保留にする。
      let resolveStaleReload: (v: TaskCommentDto[]) => void = () => {};
      mockFetch.mockImplementation((taskId: number) => {
        if (mockFetch.mock.calls.length === 2) {
          return new Promise((resolve) => {
            resolveStaleReload = resolve;
          });
        }
        return Promise.resolve([
          { ...comment(`c-task${taskId}`, `<p>c-task${taskId}</p>`), taskId },
        ]);
      });

      const { result, rerender } = renderHook(({ taskId }) => useTaskComments(taskId), {
        initialProps: { taskId: 1 as number | null },
      });
      await waitFor(() => expect(result.current.comments.map((c) => c.id)).toEqual(['c-task1']));

      // task1 表示中に reload を開始（保留のまま）→ 完了前に task2 へ切替
      let pendingReload: Promise<void>;
      act(() => {
        pendingReload = result.current.reload();
      });
      rerender({ taskId: 2 });
      await waitFor(() => expect(result.current.comments.map((c) => c.id)).toEqual(['c-task2']));

      // 保留していた task1 の reload が遅れて解決 → taskIdRef 不一致でガードされ task2 一覧が保たれる
      await act(async () => {
        resolveStaleReload([{ ...comment('c-task1-stale', '<p>c-task1-stale</p>'), taskId: 1 }]);
        await pendingReload!;
      });
      expect(result.current.comments.map((c) => c.id)).toEqual(['c-task2']);
    });
  });
});
