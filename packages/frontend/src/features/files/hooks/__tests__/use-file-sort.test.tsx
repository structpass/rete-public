import { StrictMode } from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useFileSort } from '../use-file-sort';

// StrictMode は setState updater を 2 回呼んで純粋性を検査する。
// updater 内に副作用（方向トグル）があると 1 クリックで 2 回トグルし症状が出るため、
// StrictMode ラッパで「同一列再クリックの昇降トグル」を実機相当で検証する（fil-0058 真因）。
const strict = { wrapper: StrictMode };

describe('useFileSort — toggleSort（StrictMode 二重実行下）', () => {
  it('初期状態は未ソート・昇順', () => {
    const { result } = renderHook(() => useFileSort(), strict);
    expect(result.current.sortKey).toBeNull();
    expect(result.current.sortDir).toBe('asc');
  });

  it('同一列を再クリックするたびに昇順↔降順が切り替わる', () => {
    const { result } = renderHook(() => useFileSort(), strict);

    act(() => result.current.toggleSort('name'));
    expect(result.current.sortKey).toBe('name');
    expect(result.current.sortDir).toBe('asc');

    act(() => result.current.toggleSort('name'));
    expect(result.current.sortDir).toBe('desc');

    act(() => result.current.toggleSort('name'));
    expect(result.current.sortDir).toBe('asc');
  });

  it('別の列をクリックしたら sortDir が asc にリセットされる', () => {
    const { result } = renderHook(() => useFileSort(), strict);

    // name を降順にしておく
    act(() => result.current.toggleSort('name'));
    act(() => result.current.toggleSort('name'));
    expect(result.current.sortDir).toBe('desc');

    // 別列へ → 昇順から
    act(() => result.current.toggleSort('updatedAt'));
    expect(result.current.sortKey).toBe('updatedAt');
    expect(result.current.sortDir).toBe('asc');
  });

  it('resetSort で未ソート・昇順へ戻る', () => {
    const { result } = renderHook(() => useFileSort(), strict);
    act(() => result.current.toggleSort('kind'));
    act(() => result.current.resetSort());
    expect(result.current.sortKey).toBeNull();
    expect(result.current.sortDir).toBe('asc');
  });
});
