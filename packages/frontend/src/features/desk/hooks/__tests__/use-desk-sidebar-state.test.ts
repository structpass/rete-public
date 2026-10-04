import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeskSidebarState, STORAGE_KEY } from '../use-desk-sidebar-state';

// Desk サイドバーの純 UI 状態（スコープタブ / プロジェクト折り畳み）の localStorage 永続化検証。
// 「どの器を開いているか」は desk-space-context が保持するため本 hook の関心外（CM-2 スライスB）。
describe('useDeskSidebarState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('既定値は組織タブ・全展開', () => {
    const { result } = renderHook(() => useDeskSidebarState());
    expect(result.current.activeTab).toBe('organization');
    expect(result.current.collapsed).toEqual({});
  });

  it('setTab で 3 タブ（組織/グループ/個人）を切り替えられる', () => {
    const { result } = renderHook(() => useDeskSidebarState());
    act(() => result.current.setTab('group'));
    expect(result.current.activeTab).toBe('group');
    act(() => result.current.setTab('personal'));
    expect(result.current.activeTab).toBe('personal');
    act(() => result.current.setTab('organization'));
    expect(result.current.activeTab).toBe('organization');
  });

  it('toggleProject で折り畳みがトグルする', () => {
    const { result } = renderHook(() => useDeskSidebarState());
    act(() => result.current.toggleProject('p1'));
    expect(result.current.collapsed.p1).toBe(true);
    act(() => result.current.toggleProject('p1'));
    expect(result.current.collapsed.p1).toBe(false);
  });

  it('変更が localStorage（v2 キー）に永続化される', () => {
    const { result } = renderHook(() => useDeskSidebarState());
    act(() => result.current.setTab('group'));
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(saved.activeTab).toBe('group');
  });

  it('localStorage の保存値をマウント時に復元する', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeTab: 'personal', collapsed: { p1: true } }),
    );
    const { result } = renderHook(() => useDeskSidebarState());
    expect(result.current.activeTab).toBe('personal');
    expect(result.current.collapsed.p1).toBe(true);
  });

  it('壊れた JSON でもクラッシュせず既定値を使う', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json{');
    const { result } = renderHook(() => useDeskSidebarState());
    expect(result.current.activeTab).toBe('organization');
  });

  it('不正なタブ値は捨て既定値、collapsed は正常値を復元する', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeTab: 'member', collapsed: { p2: true } }),
    );
    const { result } = renderHook(() => useDeskSidebarState());
    expect(result.current.activeTab).toBe('organization'); // 旧/不正値は無視 → 既定値
    expect(result.current.collapsed.p2).toBe(true);
  });
});
