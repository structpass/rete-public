import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import { useFileDnd, type FileDragData } from '../hooks/use-file-dnd';

/** active/over の data.current だけを持つ最小の DragEndEvent を組む（dnd-kit の他フィールドは未使用）。 */
function dragEnd(active: FileDragData, over: FileDragData | null): DragEndEvent {
  return {
    active: { data: { current: active } },
    over: over ? { data: { current: over } } : null,
  } as unknown as DragEndEvent;
}

function setup() {
  const onReparent = vi.fn();
  const onMoveRow = vi.fn();
  const onMoveFromSearch = vi.fn();
  const { result } = renderHook(() => useFileDnd({ onReparent, onMoveRow, onMoveFromSearch }));
  return { result, onReparent, onMoveRow, onMoveFromSearch };
}

describe('useFileDnd — kind 別ディスパッチ', () => {
  it('tree → tree は onReparent(nodeFid, targetFid)', () => {
    const { result, onReparent, onMoveFromSearch } = setup();
    result.current.onDragEnd(
      dragEnd({ kind: 'tree', fid: 'a', label: 'A' }, { kind: 'tree', fid: 'b', label: 'B' }),
    );
    expect(onReparent).toHaveBeenCalledWith('a', 'b');
    expect(onMoveFromSearch).not.toHaveBeenCalled();
  });

  it('row → row は onMoveRow(fromIndex, targetIndex)', () => {
    const { result, onMoveRow } = setup();
    result.current.onDragEnd(
      dragEnd({ kind: 'row', index: 0, label: 'x' }, { kind: 'row', index: 2, label: 'y' }),
    );
    expect(onMoveRow).toHaveBeenCalledWith(0, 2);
  });

  it('search(folder) → tree は onMoveFromSearch("folder", id, targetFid, parentFolderId)', () => {
    const { result, onMoveFromSearch } = setup();
    result.current.onDragEnd(
      dragEnd(
        {
          kind: 'search',
          searchKind: 'folder',
          searchId: 'f1',
          searchParentFolderId: 'p1',
          label: 'F',
        },
        { kind: 'tree', fid: 'dest', label: 'Dest' },
      ),
    );
    expect(onMoveFromSearch).toHaveBeenCalledWith('folder', 'f1', 'dest', 'p1');
  });

  it('search(file) → tree は onMoveFromSearch("file", id, targetFid, parentFolderId)', () => {
    const { result, onMoveFromSearch } = setup();
    result.current.onDragEnd(
      dragEnd(
        {
          kind: 'search',
          searchKind: 'file',
          searchId: 'file9',
          searchParentFolderId: 'f9',
          label: 'doc',
        },
        { kind: 'tree', fid: 'dest', label: 'Dest' },
      ),
    );
    expect(onMoveFromSearch).toHaveBeenCalledWith('file', 'file9', 'dest', 'f9');
  });

  it('search の parentFolderId 未指定（root 由来）は null として渡る', () => {
    const { result, onMoveFromSearch } = setup();
    result.current.onDragEnd(
      dragEnd(
        { kind: 'search', searchKind: 'folder', searchId: 'r1', label: 'R' },
        { kind: 'tree', fid: 'dest', label: 'Dest' },
      ),
    );
    expect(onMoveFromSearch).toHaveBeenCalledWith('folder', 'r1', 'dest', null);
  });

  it('search を tree 以外（row）へ落としても何も起きない', () => {
    const { result, onMoveFromSearch, onMoveRow } = setup();
    result.current.onDragEnd(
      dragEnd(
        { kind: 'search', searchKind: 'file', searchId: 'file9', label: 'doc' },
        { kind: 'row', index: 1, label: 'r' },
      ),
    );
    expect(onMoveFromSearch).not.toHaveBeenCalled();
    expect(onMoveRow).not.toHaveBeenCalled();
  });

  it('over が無い（ドロップ先なし）なら何も起きない', () => {
    const { result, onReparent, onMoveRow, onMoveFromSearch } = setup();
    result.current.onDragEnd(dragEnd({ kind: 'tree', fid: 'a', label: 'A' }, null));
    expect(onReparent).not.toHaveBeenCalled();
    expect(onMoveRow).not.toHaveBeenCalled();
    expect(onMoveFromSearch).not.toHaveBeenCalled();
  });
});
