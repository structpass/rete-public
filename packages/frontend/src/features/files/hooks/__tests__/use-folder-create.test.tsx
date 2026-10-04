import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// 作成 API ラッパ・toast をモックし、インライン作成 state（begin/changeName/cancel/commit）を検証する。
// cmn-0147: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { createFolder, toastSuccess, toastError } = vi.hoisted(() => ({
  createFolder: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  createFolder: (...a: unknown[]) => createFolder(...a),
}));
vi.mock('react-hot-toast', () => ({
  default: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { useFolderCreate } from '../use-folder-create';

beforeEach(() => {
  createFolder.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe('useFolderCreate — draft 操作', () => {
  it('begin で指定親の空 draft を開始し、changeName で名前を更新する', () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useFolderCreate(onCreated));

    expect(result.current.draft).toBeNull();

    act(() => result.current.begin('parent-1'));
    expect(result.current.draft).toEqual({ parentFolderId: 'parent-1', name: '' });

    act(() => result.current.changeName('議事録'));
    expect(result.current.draft).toEqual({ parentFolderId: 'parent-1', name: '議事録' });
  });

  it('cancel で draft を破棄する', () => {
    const { result } = renderHook(() => useFolderCreate(vi.fn().mockResolvedValue(undefined)));
    act(() => result.current.begin(null));
    act(() => result.current.cancel());
    expect(result.current.draft).toBeNull();
  });
});

describe('useFolderCreate — commit', () => {
  it('空白のみの名前は作成 API を呼ばず draft を保持する', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useFolderCreate(onCreated));

    act(() => result.current.begin('parent-1'));
    act(() => result.current.changeName('   '));
    await act(async () => {
      await result.current.commit();
    });

    expect(createFolder).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(result.current.draft).not.toBeNull();
  });

  it('成功時: 前後空白を詰めた名前で作成し、draft を閉じ onCreated を呼ぶ', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    createFolder.mockResolvedValue({ id: 'n', name: '議事録', parentFolderId: 'parent-1' });
    const { result } = renderHook(() => useFolderCreate(onCreated));

    act(() => result.current.begin('parent-1'));
    act(() => result.current.changeName('  議事録  '));
    await act(async () => {
      await result.current.commit();
    });

    expect(createFolder).toHaveBeenCalledWith('parent-1', '議事録', undefined);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalled();
    expect(result.current.draft).toBeNull();
  });

  it('ルート直下（parentFolderId=null）は現在の器（spaceId）を付けて作成する（ADR 0063・fil-0137）', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    createFolder.mockResolvedValue({ id: 'r', name: 'ルート', parentFolderId: null });
    const { result } = renderHook(() => useFolderCreate(onCreated, 'space-1'));

    act(() => result.current.begin(null));
    act(() => result.current.changeName('ルート'));
    await act(async () => {
      await result.current.commit();
    });

    expect(createFolder).toHaveBeenCalledWith(null, 'ルート', 'space-1');
    expect(result.current.draft).toBeNull();
  });

  it('失敗時: toast.error を出し draft を保持する（利用者が名前を直せる）', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    createFolder.mockRejectedValue(new Error('conflict'));
    const { result } = renderHook(() => useFolderCreate(onCreated));

    act(() => result.current.begin('parent-1'));
    act(() => result.current.changeName('議事録'));
    await act(async () => {
      await result.current.commit();
    });

    expect(toastError).toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(result.current.draft).toEqual({ parentFolderId: 'parent-1', name: '議事録' });
  });
});
