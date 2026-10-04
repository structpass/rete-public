import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscardConfirm } from '../use-discard-confirm';

describe('useDiscardConfirm', () => {
  it('未編集（isDirty=false）なら proceed を即実行しダイアログを開かない', () => {
    const proceed = vi.fn();
    const { result } = renderHook(() => useDiscardConfirm());
    act(() => result.current.request(false, proceed));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(false);
  });

  it('編集中（isDirty=true）なら proceed を保留しダイアログを開く', () => {
    const proceed = vi.fn();
    const { result } = renderHook(() => useDiscardConfirm());
    act(() => result.current.request(true, proceed));
    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.open).toBe(true);
  });

  it('onConfirm で保留 proceed を実行しダイアログを閉じる', () => {
    const proceed = vi.fn();
    const { result } = renderHook(() => useDiscardConfirm());
    act(() => result.current.request(true, proceed));
    act(() => result.current.onConfirm());
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(false);
  });

  it('onCancel で保留 proceed を捨ててダイアログを閉じる', () => {
    const proceed = vi.fn();
    const { result } = renderHook(() => useDiscardConfirm());
    act(() => result.current.request(true, proceed));
    act(() => result.current.onCancel());
    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  it('onCancel 後に onConfirm しても二重実行されない（保留は消費済み）', () => {
    const proceed = vi.fn();
    const { result } = renderHook(() => useDiscardConfirm());
    act(() => result.current.request(true, proceed));
    act(() => result.current.onCancel());
    act(() => result.current.onConfirm());
    expect(proceed).not.toHaveBeenCalled();
  });
});
