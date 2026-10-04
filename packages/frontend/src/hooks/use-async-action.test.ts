import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncAction } from './use-async-action';

// set-0052: run() の busy/error 契約を固定する回帰テスト。
// 呼び出し元（organizations/members/memberships-admin の3画面）が前提にする挙動を hook 本体で直接検証する。

describe('useAsyncAction — run() の契約（set-0052）', () => {
  it('成功時: onBusyChange(true)→action→onBusyChange(false) の順で呼ばれ、onError は呼ばれない', async () => {
    const order: string[] = [];
    const action = vi.fn(async () => {
      order.push('action');
    });
    const onBusyChange = vi.fn((busy: boolean) => order.push(`busy:${busy}`));
    const onError = vi.fn();
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(action, { onBusyChange, onError });
    });

    expect(order).toEqual(['busy:true', 'action', 'busy:false']);
    expect(onError).not.toHaveBeenCalled();
  });

  it('失敗時: onError(err) が渡したエラーで呼ばれ、finally で onBusyChange(false) が必ず呼ばれ、run() 自体は reject しない', async () => {
    const err = new Error('boom');
    const action = vi.fn(async () => {
      throw err;
    });
    const onBusyChange = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAsyncAction());

    await expect(
      act(async () => {
        await result.current.run(action, { onBusyChange, onError });
      }),
    ).resolves.not.toThrow();

    expect(onError).toHaveBeenCalledWith(err);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('options 省略時: run(action) を options 無しで呼んでも例外を投げない', async () => {
    const action = vi.fn(async () => {});
    const { result } = renderHook(() => useAsyncAction());

    await expect(
      act(async () => {
        await result.current.run(action);
      }),
    ).resolves.not.toThrow();
    expect(action).toHaveBeenCalledTimes(1);
  });
});
