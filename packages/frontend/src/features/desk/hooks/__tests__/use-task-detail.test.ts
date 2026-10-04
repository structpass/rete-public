import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Task } from '@/features/tasks/lib/api';

// cmn-0142: vi.hoisted 化
const { mockFetchTaskDetail, mockUpdateTask, mockToggleTaskReaction } = vi.hoisted(() => ({
  mockFetchTaskDetail: vi.fn(),
  mockUpdateTask: vi.fn(),
  mockToggleTaskReaction: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchTaskDetail: mockFetchTaskDetail,
  updateTask: mockUpdateTask,
  toggleTaskReaction: mockToggleTaskReaction,
}));

import { useTaskDetail } from '../use-task-detail';
import {
  fetchTaskDetail,
  updateTask,
  toggleTaskReaction,
  type ReactionToggleResult,
} from '../../lib/api';

const mockFetch = vi.mocked(fetchTaskDetail);
const mockUpdate = vi.mocked(updateTask);
const mockToggle = vi.mocked(toggleTaskReaction);

/** 解決を手動制御できる pending promise を作る（GET の並走を再現するため）。dsk-0432 L1: モジュールスコープへ集約。 */
function deferred() {
  let resolve!: (t: Task) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Task>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'テストタスク',
    description: null,
    status: 'open' as Task['status'],
    tenmatsu: null,
    categoryId: null,
    parentTaskId: null,
    sortOrder: 0,
    sourceThemeId: null,
    sourceTheme: null,
    assignee: { id: 'a1', name: '担当A' },
    ownerId: null,
    owner: null,
    assigneeName: null,
    startDate: null,
    dueDate: null,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    hasMentionToMe: false,
    reactions: [{ emoji: '👍', count: 1, reactedByMe: true }],
    ...overrides,
  };
}

/**
 * トグル API（toggleTaskReaction）の応答。形の正本は desk api の ReactionToggleResult
 * （@rete/shared の ReactionToggleResponseDto）で、値の生成をここ 1 箇所へ集約する（v2-252。
 * 旧実装は resolver の型注釈が応答形を直書きしていた）。
 */
function reactionToggle(reacted: boolean): ReactionToggleResult {
  return { reacted };
}

describe('useTaskDetail', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUpdate.mockReset();
    mockToggle.mockReset();
  });

  it('taskId 指定で詳細 GET し task に格納する', async () => {
    mockFetch.mockResolvedValue(task({ title: '詳細' }));
    const { result } = renderHook(() => useTaskDetail(1));

    await waitFor(() => expect(result.current.task?.title).toBe('詳細'));
    expect(mockFetch).toHaveBeenCalledWith(1);
  });

  it('taskId=null は GET せず task は null', async () => {
    const { result } = renderHook(() => useTaskDetail(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.task).toBeNull();
  });

  /**
   * dsk-0378: update は reactions 未集約で [] を返しうる。save が update 結果をそのまま
   * setTask すると起点カードのリアクションが消える。save 成功後は詳細 GET で差し替える。
   */
  it('save は update 後に詳細 GET し、update が reactions:[] でも直前の reactions を保つ（dsk-0378）', async () => {
    const withReactions = task({
      reactions: [{ emoji: '🎉', count: 2, reactedByMe: false }],
      assignee: { id: 'a1', name: '担当A' },
    });
    mockFetch.mockResolvedValue(withReactions);
    const { result } = renderHook(() => useTaskDetail(1));
    await waitFor(() => expect(result.current.task?.reactions).toHaveLength(1));

    // update レスポンスは reactions 無し経路 → mapper が空配列
    mockUpdate.mockResolvedValue(
      task({
        assignee: { id: 'a2', name: '担当B' },
        reactions: [],
      }),
    );
    // save 後の詳細 GET は reactions 付き
    const afterDetail = task({
      assignee: { id: 'a2', name: '担当B' },
      reactions: [{ emoji: '🎉', count: 2, reactedByMe: false }],
    });
    mockFetch.mockResolvedValueOnce(afterDetail);

    await act(async () => {
      await result.current.save({ assigneeId: 'a2' });
    });

    expect(mockUpdate).toHaveBeenCalledWith(1, { assigneeId: 'a2' });
    // 初回 load + save 後の詳細 GET
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith(1);
    // dsk-0432 M1: save の戻り値は型として返さない（Promise<void>）。約束は「save 後に表示が
    // 詳細 GET の内容へ差し替わる」ことで、task の中身で検証する。
    expect(result.current.task?.assignee?.id).toBe('a2');
    expect(result.current.task?.reactions).toEqual([{ emoji: '🎉', count: 2, reactedByMe: false }]);
    // save 経路では load の loading フラグを立てない（スピナー抑止）
    expect(result.current.loading).toBe(false);
  });

  it('save 成功後の詳細 GET が失敗しても、save は reject せず取得エラーを表示する（dsk-0432 M2）', async () => {
    mockFetch.mockResolvedValue(task());
    const { result } = renderHook(() => useTaskDetail(1));
    await waitFor(() => expect(result.current.task).not.toBeNull());

    mockUpdate.mockResolvedValue(task({ title: '保存後' }));
    // save 経路の詳細 GET（2 回目の fetchTaskDetail）だけを失敗させる。
    mockFetch.mockRejectedValueOnce(new Error('detail fetch boom'));

    await act(async () => {
      await result.current.save({ title: '保存後' });
    });

    // save 自体は解決している（保存の失敗として呼び出し側へ伝わらない）。
    expect(result.current.error).toBe('タスク詳細の取得に失敗しました');
    // 保存の失敗として reject しない＝呼び出し側は保存成功扱いのまま進める。
    // task は旧値のままでも、error が立つことで表示はエラー側へ倒れる（loading=false で止まらない）。
    expect(result.current.loading).toBe(false);
  });

  it('toggleReaction はトグル API 後に詳細を引き直す', async () => {
    mockFetch.mockResolvedValue(task());
    mockToggle.mockResolvedValue(reactionToggle(true));
    const { result } = renderHook(() => useTaskDetail(1));
    await waitFor(() => expect(result.current.task).not.toBeNull());

    mockFetch.mockResolvedValueOnce(
      task({ reactions: [{ emoji: '👍', count: 2, reactedByMe: true }] }),
    );

    await act(async () => {
      await result.current.toggleReaction('👍');
    });

    expect(mockToggle).toHaveBeenCalledWith(1, '👍');
    expect(result.current.task?.reactions?.[0].count).toBe(2);
  });
});

/**
 * dsk-0397: ↑↓ の連続移動でタスク A→B と素早く切り替えると詳細 GET が並走し、先発（A）が
 * 後着すると B 選択中へ A の内容が入る。load / save が共有する連番で最新要求か照合し、
 * 追い越された古い応答は表示へ反映しない（use-chat-thread の requestSeqRef と同型）。
 */
describe('useTaskDetail — 追い越しレース（dsk-0397）', () => {
  it('先発（旧タスク）の応答が後着しても、選択中の新タスクの表示を上書きしない', async () => {
    const a = deferred();
    const b = deferred();
    mockFetch.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result, rerender } = renderHook(({ id }) => useTaskDetail(id), {
      initialProps: { id: 1 as number | null },
    });
    // 1 の GET が未解決のまま ↑↓ で 2 へ移動（GET が並走する）。
    rerender({ id: 2 });

    await act(async () => {
      b.resolve(task({ id: 2, title: 'タスク2' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.task?.id).toBe(2));

    // 追い越された 1 の応答が後から届いても表示は 2 のまま。
    await act(async () => {
      a.resolve(task({ id: 1, title: 'タスク1' }));
      await Promise.resolve();
    });
    expect(result.current.task?.id).toBe(2);
    expect(result.current.task?.title).toBe('タスク2');
  });

  it('追い越された応答の失敗はエラー表示にしない（新タスクは正常取得できている）', async () => {
    const a = deferred();
    const b = deferred();
    mockFetch.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result, rerender } = renderHook(({ id }) => useTaskDetail(id), {
      initialProps: { id: 1 as number | null },
    });
    rerender({ id: 2 });

    await act(async () => {
      b.resolve(task({ id: 2, title: 'タスク2' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.task?.id).toBe(2));

    await act(async () => {
      a.reject(new Error('後着した先発の失敗'));
      await Promise.resolve();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.task?.id).toBe(2);
  });

  it('追い越された save の詳細 GET が失敗しても、エラー表示にせず新タスクを表示する（dsk-0432 M2）', async () => {
    mockFetch.mockResolvedValue(task({ id: 1, title: 'タスク1' }));
    const { result, rerender } = renderHook(({ id }) => useTaskDetail(id), {
      initialProps: { id: 1 as number | null },
    });
    await waitFor(() => expect(result.current.task?.id).toBe(1));

    // save の詳細 GET（2 段目）を pending にし、切替（load 2）で seq を進めてから失敗させる。
    const saveDetail = deferred();
    mockUpdate.mockResolvedValue(task({ id: 1, title: '保存後' }));
    mockFetch.mockReturnValueOnce(saveDetail.promise);

    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = result.current.save({ title: '保存後' });
      await Promise.resolve();
    });

    // 切替（= 新しい load が seq を進める）。以降 save の応答は追い越された側。
    const next = deferred();
    mockFetch.mockReturnValueOnce(next.promise);
    rerender({ id: 2 });

    await act(async () => {
      next.resolve(task({ id: 2, title: 'タスク2' }));
      saveDetail.reject(new Error('追い越された save GET の失敗'));
      await Promise.resolve();
    });
    await savePromise;

    // 追い越された save の失敗は最新要求の表示に被せない（error は null のまま・task は 2 のまま）。
    expect(result.current.error).toBeNull();
    expect(result.current.task?.id).toBe(2);
  });

  it('追い越された応答は loading を降ろさない（最新要求の完了時点で false）', async () => {
    const a = deferred();
    const b = deferred();
    mockFetch.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result, rerender } = renderHook(({ id }) => useTaskDetail(id), {
      initialProps: { id: 1 as number | null },
    });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.loading).toBe(true));

    // 先発（1）が先に解決しても、後発（2）が取得中なので loading は立ったまま。
    await act(async () => {
      a.resolve(task({ id: 1, title: 'タスク1' }));
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      b.resolve(task({ id: 2, title: 'タスク2' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('save 中に taskId が変わると画面 state は更新しないが、保存自体は解決する', async () => {
    mockFetch.mockResolvedValue(task({ id: 1, title: 'タスク1' }));
    const { result, rerender } = renderHook(({ id }) => useTaskDetail(id), {
      initialProps: { id: 1 as number | null },
    });
    await waitFor(() => expect(result.current.task?.id).toBe(1));

    // save の 2 段 await（updateTask → fetchTaskDetail）の間に別タスクへ切り替わる状況を作る。
    const savedDetail = deferred();
    mockUpdate.mockResolvedValue(task({ id: 1, title: '保存後' }));
    mockFetch.mockReturnValueOnce(savedDetail.promise);

    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = result.current.save({ title: '保存後' });
      await Promise.resolve();
    });

    // 切替（= 新しい load が連番を進める）。以降 save の応答は追い越された側になる。
    const next = deferred();
    mockFetch.mockReturnValueOnce(next.promise);
    rerender({ id: 2 });

    await act(async () => {
      next.resolve(task({ id: 2, title: 'タスク2' }));
      savedDetail.resolve(task({ id: 1, title: '保存後' }));
      await Promise.resolve();
    });

    // dsk-0432 M1: 戻り値は返さない（Promise<void>）。save は呼び出し側をエラー扱いにしない。
    await savePromise;
    // 画面は切替先のまま（保存結果で上書きされない）。
    await waitFor(() => expect(result.current.task?.id).toBe(2));
  });

  it('取得中に taskId が null になっても loading が残らない（早期 return 経路で降ろす）', async () => {
    const a = deferred();
    mockFetch.mockReturnValueOnce(a.promise);

    const { result, rerender } = renderHook(({ id }) => useTaskDetail(id), {
      initialProps: { id: 1 as number | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    // 取得中に選択解除。以降 1 の応答は seq 不一致で finally をスキップするため、
    // 早期 return 側で降ろさないと spinner が残り続ける。
    rerender({ id: null });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      a.resolve(task({ id: 1 }));
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.task).toBeNull();
  });

  it('リアクショントグル中に taskId が変わると、旧タスクの再取得で表示を上書きしない', async () => {
    mockFetch.mockResolvedValue(task({ id: 1, title: 'タスク1' }));
    const { result, rerender } = renderHook(({ id }) => useTaskDetail(id), {
      initialProps: { id: 1 as number | null },
    });
    await waitFor(() => expect(result.current.task?.id).toBe(1));

    // トグル API の解決前に別タスクへ切り替える。
    let resolveToggle!: (v: ReactionToggleResult) => void;
    mockToggle.mockReturnValueOnce(
      new Promise<ReactionToggleResult>((res) => {
        resolveToggle = res;
      }),
    );

    let togglePromise!: Promise<void>;
    await act(async () => {
      togglePromise = result.current.toggleReaction('👍');
      await Promise.resolve();
    });

    mockFetch.mockResolvedValue(task({ id: 2, title: 'タスク2' }));
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.task?.id).toBe(2));

    const fetchCallsBefore = mockFetch.mock.calls.length;
    await act(async () => {
      resolveToggle(reactionToggle(true));
      await togglePromise;
    });

    // 切替済みなので旧タスクの再取得自体を行わない＝表示は 2 のまま。
    expect(mockFetch.mock.calls.length).toBe(fetchCallsBefore);
    expect(result.current.task?.id).toBe(2);
  });
});

describe('useTaskDetail — save × リアクション同一タスク並走（dsk-0404）', () => {
  // 本ファイルの beforeEach は先頭 describe 内のみ有効のため、本 describe でも reset する。
  beforeEach(() => {
    mockFetch.mockReset();
    mockUpdate.mockReset();
    mockToggle.mockReset();
  });

  // toggleReaction は load/save と共有する requestSeqRef で切替を検出していたため、
  // save の seq++ が後着トグルの再取得を偽陽性で落としていた（use-chat-thread の
  // dsk-0399/dsk-0404 と同根）。修正は起点 taskId（activeTaskIdRef）との比較へ置換。
  // save の seq++（in-flight の古い GET 無効化）は現状維持。

  it('順列①（dsk-0409）: トグルが先に走り保存が後から確定する時、保存した内容が勝つ', async () => {
    mockFetch.mockResolvedValueOnce(task({ id: 1, title: '初期' }));
    const { result } = renderHook(() => useTaskDetail(1));
    await waitFor(() => expect(result.current.task?.title).toBe('初期'));

    mockUpdate.mockResolvedValue(task({ id: 1, title: '保存後' }));
    mockToggle.mockResolvedValue(reactionToggle(true));
    // トグルの再取得（GET A）はトグル前の古い値・保存の詳細 GET（GET B）は保存後の新しい値。
    const toggleGet = deferred();
    const saveGet = deferred();
    mockFetch.mockReturnValueOnce(toggleGet.promise).mockReturnValueOnce(saveGet.promise);

    await act(async () => {
      const pToggle = result.current.toggleReaction('👍'); // トグル API → load → GET A 発行
      const pSave = result.current.save({ title: '保存後' }); // updateTask → bump → GET B 発行
      // 保存の GET（最新 seq）を先に解決 → 保存後の値が表示される。
      saveGet.resolve(
        task({
          id: 1,
          title: '保存後',
          reactions: [{ emoji: '👍', count: 2, reactedByMe: true }],
        }),
      );
      await Promise.resolve();
      // トグルの GET は後着・古い値 → seq 不一致で捨てられる（保存の結果が消えない）。
      toggleGet.resolve(
        task({
          id: 1,
          title: '初期',
          reactions: [{ emoji: '👍', count: 1, reactedByMe: false }],
        }),
      );
      await pToggle;
      await pSave;
    });

    expect(mockToggle).toHaveBeenCalledWith(1, '👍');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 初回 + トグル再取得 + 保存 GET
    expect(result.current.task?.title).toBe('保存後');
    expect(result.current.task?.reactions?.[0].count).toBe(2);
  });

  it('順列②（dsk-0409）: 保存が先に取得を出し、その後トグルが押された時、トグル後の値が勝つ', async () => {
    // dsk-0432 L3: 本検証は mockReturnValueOnce の消費順＝「save の GET がトグルの GET より先に
    // 発行される」実装のマイクロタスク順に依存する（save → toggle の呼び出し順が逆だと assertion が落ちる）。
    mockFetch.mockResolvedValueOnce(task({ id: 1, title: '初期' }));
    const { result } = renderHook(() => useTaskDetail(1));
    await waitFor(() => expect(result.current.task?.title).toBe('初期'));

    mockUpdate.mockResolvedValue(task({ id: 1, title: '保存後' }));
    mockToggle.mockResolvedValue(reactionToggle(true));
    // 保存の詳細 GET（B）: 保存後の値（トグル前）・トグルの再取得（C）: トグル後の値。
    const saveGet = deferred();
    const toggleGet = deferred();
    mockFetch.mockReturnValueOnce(saveGet.promise).mockReturnValueOnce(toggleGet.promise);

    await act(async () => {
      const pSave = result.current.save({ title: '保存後' }); // updateTask → bump → GET B 発行
      const pToggle = result.current.toggleReaction('👍'); // トグル API → load → bump → GET C 発行
      // トグルの GET（最新 seq）を先に解決 → トグル後の値が表示される。
      toggleGet.resolve(
        task({
          id: 1,
          title: '保存後',
          reactions: [{ emoji: '👍', count: 2, reactedByMe: true }],
        }),
      );
      await Promise.resolve();
      // 保存の GET は後着 → seq 不一致で捨てられ、保存後の値で上書きしない。
      saveGet.resolve(
        task({
          id: 1,
          title: '保存後',
          reactions: [{ emoji: '👍', count: 1, reactedByMe: false }],
        }),
      );
      await pSave;
      await pToggle;
    });

    expect(mockFetch).toHaveBeenCalledTimes(3); // 初回 + 保存 GET + トグル再取得
    expect(result.current.task?.title).toBe('保存後');
    expect(result.current.task?.reactions?.[0].count).toBe(2); // トグル後の値が勝つ
  });

  it('順列③（dsk-0409）: 別タスクへ切り替えている最中に保存が確定しても、切替先の詳細が表示され読み込み表示が残らない', async () => {
    mockFetch.mockResolvedValueOnce(task({ id: 1, title: 'タスク1' }));
    const { result, rerender } = renderHook(({ id }) => useTaskDetail(id), {
      initialProps: { id: 1 as number | null },
    });
    await waitFor(() => expect(result.current.task?.id).toBe(1));

    // updateTask を deferred にし、切替と load(2) の GET 発行を先に済ませてから解決する
    // （既存の save 中切替テストは mock 消費順から save の GET が rerender より先に発行される
    // 別順序で、この退行＝切替先の GET 無効化を検出できない）。
    const update = deferred();
    mockUpdate.mockReturnValueOnce(update.promise);
    const nextGet = deferred();
    mockFetch.mockReturnValueOnce(nextGet.promise);

    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = result.current.save({ title: '保存後' }); // updateTask 発行・未解決
      await Promise.resolve();
    });

    // 切替（load(2) が GET 発行・loading を立てる）。
    await act(async () => {
      rerender({ id: 2 });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    // 保存が確定（updateTask 解決）→ identity 不一致で seq に触れず離脱 → 切替先の GET は無効化されない。
    await act(async () => {
      update.resolve(task({ id: 1, title: '保存後' }));
      nextGet.resolve(task({ id: 2, title: 'タスク2' }));
      await Promise.resolve();
    });

    await savePromise;
    // dsk-0432 M1: 戻り値は返さない（Promise<void>）。切替先の詳細が表示され、読み込み表示が残らない。
    await waitFor(() => expect(result.current.task?.id).toBe(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 保存は再取得しない（identity 不一致 → bump しない = 切替先の GET を無効化しない）。
    expect(mockFetch).toHaveBeenCalledTimes(2); // 初回 + load(2)
  });
});
