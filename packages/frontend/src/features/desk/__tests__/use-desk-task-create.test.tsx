import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// createTask（POST /tasks ラッパ）をモックして、フックの成功/失敗フローを検証する。
// cmn-0146: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { createTask } = vi.hoisted(() => ({
  createTask: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  createTask: (...args: unknown[]) => createTask(...args),
}));

import { useDeskTaskCreate } from '../hooks/use-desk-task-create';

beforeEach(() => {
  createTask.mockReset();
});

describe('useDeskTaskCreate — タスク新規作成フロー（C-新規 / ADR 0002）', () => {
  it('成功時: createTask に payload を渡し、refetchTree を呼び、作成 Task を返す', async () => {
    createTask.mockResolvedValue({ id: 42 });
    const refetchTree = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeskTaskCreate({ refetchTree }));

    const payload = { title: '新規タスク', categoryId: 1 };
    let ret: unknown;
    await act(async () => {
      ret = await result.current.create(payload);
    });

    expect(createTask).toHaveBeenCalledWith(payload);
    expect(refetchTree).toHaveBeenCalledTimes(1);
    // 戻り値は作成 Task（id は overlay の添付 flush 先に使う）。
    expect(ret).toEqual({ id: 42 });
    expect(result.current.saveError).toBeNull();
    expect(result.current.saving).toBe(false);
  });

  it('失敗時: error をセットし null を返す。refetchTree は呼ばない', async () => {
    createTask.mockRejectedValue(new Error('boom'));
    const refetchTree = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeskTaskCreate({ refetchTree }));

    let ret: unknown;
    await act(async () => {
      ret = await result.current.create({ title: 'x', categoryId: 1 });
    });

    expect(ret).toBeNull();
    expect(refetchTree).not.toHaveBeenCalled();
    expect(result.current.saveError).toBe('タスクの作成に失敗しました');
    expect(result.current.saving).toBe(false);
  });
});
