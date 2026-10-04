import { describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { DeskSpaceProvider, useDeskSpace, DESK_SPACE_STORAGE_KEY } from '../desk-space-context';

// 器スコープ Context（CM-2 スライスB / 論点1）。初期値 null（全件）/ 選択の localStorage 永続化 /
// ?spaceId= deep-link 優先 / Provider 不在フォールバックを検証する。
function wrapper(initialSpaceId?: string | null) {
  function SpaceWrapper({ children }: { children: ReactNode }) {
    return <DeskSpaceProvider initialSpaceId={initialSpaceId}>{children}</DeskSpaceProvider>;
  }
  return SpaceWrapper;
}

// 検証用の有効な UUID（spaceId は UUID 形式に限定されるため非 UUID は復元/deep-link で弾かれる）。
const SP_A = '00000000-0000-4000-b000-000000000011';
const SP_SAVED = '00000000-0000-4000-b000-000000000012';
const SP_DEEPLINK = '00000000-0000-4000-b000-000000000013';

describe('useDeskSpace / DeskSpaceProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('初期値は null（未選択 = 全件 = 安全な中断点）', () => {
    const { result } = renderHook(() => useDeskSpace(), { wrapper: wrapper() });
    expect(result.current.selectedSpaceId).toBeNull();
  });

  it('setSelectedSpaceId で選択され localStorage に永続化される', () => {
    const { result } = renderHook(() => useDeskSpace(), { wrapper: wrapper() });
    act(() => result.current.setSelectedSpaceId(SP_A));
    expect(result.current.selectedSpaceId).toBe(SP_A);
    expect(JSON.parse(window.localStorage.getItem(DESK_SPACE_STORAGE_KEY)!)).toBe(SP_A);
  });

  it('null で解除すると localStorage からも消える', () => {
    const { result } = renderHook(() => useDeskSpace(), { wrapper: wrapper() });
    act(() => result.current.setSelectedSpaceId(SP_A));
    act(() => result.current.setSelectedSpaceId(null));
    expect(result.current.selectedSpaceId).toBeNull();
    expect(window.localStorage.getItem(DESK_SPACE_STORAGE_KEY)).toBeNull();
  });

  it('保存値（有効 UUID）をマウント時に復元する', () => {
    window.localStorage.setItem(DESK_SPACE_STORAGE_KEY, JSON.stringify(SP_SAVED));
    const { result } = renderHook(() => useDeskSpace(), { wrapper: wrapper() });
    expect(result.current.selectedSpaceId).toBe(SP_SAVED);
  });

  it('?spaceId= deep-link（有効 UUID）は localStorage 復元より優先される', () => {
    window.localStorage.setItem(DESK_SPACE_STORAGE_KEY, JSON.stringify(SP_SAVED));
    const { result } = renderHook(() => useDeskSpace(), { wrapper: wrapper(SP_DEEPLINK) });
    expect(result.current.selectedSpaceId).toBe(SP_DEEPLINK);
  });

  it('前回の場所が復元済みの後にお気に入り deep-link が届くと指定場所へ更新される（hom-0116）', () => {
    window.localStorage.setItem(DESK_SPACE_STORAGE_KEY, JSON.stringify(SP_SAVED));
    // wrapper が受け取る id を外側で差し替え、rerender で Provider の initialSpaceId を変える。
    let deepLink: string | null = null;
    function DynamicWrapper({ children }: { children: ReactNode }) {
      return <DeskSpaceProvider initialSpaceId={deepLink}>{children}</DeskSpaceProvider>;
    }
    const { result, rerender } = renderHook(() => useDeskSpace(), { wrapper: DynamicWrapper });
    expect(result.current.selectedSpaceId).toBe(SP_SAVED);

    deepLink = SP_DEEPLINK;
    rerender();
    expect(result.current.selectedSpaceId).toBe(SP_DEEPLINK);
  });

  it('不正な deep-link（非 UUID）は null にフォールバックし、localStorage 復元に委ねる', () => {
    window.localStorage.setItem(DESK_SPACE_STORAGE_KEY, JSON.stringify(SP_SAVED));
    const { result } = renderHook(() => useDeskSpace(), {
      wrapper: wrapper('javascript:alert(1)'),
    });
    // deep-link が無効なので保存値（有効 UUID）が復元される。
    expect(result.current.selectedSpaceId).toBe(SP_SAVED);
  });

  it('改ざんされた localStorage 値（非 UUID）は復元せず null（全件）のまま', () => {
    window.localStorage.setItem(DESK_SPACE_STORAGE_KEY, JSON.stringify('not-a-uuid'));
    const { result } = renderHook(() => useDeskSpace(), { wrapper: wrapper() });
    expect(result.current.selectedSpaceId).toBeNull();
  });

  it('Provider 不在では { null, no-op } を返す（全件・安全な中断点・throw しない）', () => {
    const { result } = renderHook(() => useDeskSpace());
    expect(result.current.selectedSpaceId).toBeNull();
    expect(() => act(() => result.current.setSelectedSpaceId(SP_A))).not.toThrow();
  });
});
