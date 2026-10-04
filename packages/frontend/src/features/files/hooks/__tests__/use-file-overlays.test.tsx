import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileOverlays } from '../use-file-overlays';
import type { FileEditTarget } from '../../lib/types';

const editTarget: FileEditTarget = { id: 'file-1', name: 'report.docx', versionNo: 2 };

describe('useFileOverlays — 編集オーバーレイ（FF）', () => {
  it('初期状態は overlay=null・editTarget=null', () => {
    const { result } = renderHook(() => useFileOverlays());
    expect(result.current.overlay).toBeNull();
    expect(result.current.editTarget).toBeNull();
  });

  it('openEdit で overlay=edit・対象を保持する', () => {
    const { result } = renderHook(() => useFileOverlays());
    act(() => result.current.openEdit(editTarget));
    expect(result.current.overlay).toBe('edit');
    expect(result.current.editTarget).toEqual(editTarget);
  });

  it('close で overlay を閉じる', () => {
    const { result } = renderHook(() => useFileOverlays());
    act(() => result.current.openEdit(editTarget));
    act(() => result.current.close());
    expect(result.current.overlay).toBeNull();
  });

  it('排他表示: 編集を開いた後に別オーバーレイを開くと差し替わる（二重オーバーレイ禁止）', () => {
    const { result } = renderHook(() => useFileOverlays());
    act(() => result.current.openEdit(editTarget));
    act(() => result.current.openSettings());
    expect(result.current.overlay).toBe('settings');
  });
});
