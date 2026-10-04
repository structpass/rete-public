import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DragEvent } from 'react';
import { useFileDrop } from '../hooks/use-file-drop';

/**
 * native DragEvent の最小モック。types に 'Files' を含めると OS ファイル D&D 扱い。
 * preventDefault / stopPropagation は spy で記録、relatedTarget / currentTarget は dragleave 判定に使う。
 */
function dragEvent(opts: {
  types?: string[];
  files?: File[];
  relatedTarget?: Node | null;
  contains?: boolean;
}): DragEvent {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const dt = {
    types: opts.types ?? [],
    files: opts.files ?? [],
    dropEffect: 'none',
  };
  return {
    preventDefault,
    stopPropagation,
    dataTransfer: dt,
    relatedTarget: opts.relatedTarget ?? null,
    currentTarget: { contains: () => opts.contains ?? false },
  } as unknown as DragEvent;
}

function fakeFile(name: string): File {
  return new File(['x'], name, { type: 'text/plain' });
}

/**
 * フォルダ階層 D&D 用の DragEvent モック（fil-0055）。items に webkitGetAsEntry を生やし、
 * isDirectory フラグでフォルダ/ファイルのエントリを表現する。
 */
function dragEventWithEntries(entries: { isDirectory: boolean }[], files: File[] = []): DragEvent {
  const items = entries.map((en) => ({ webkitGetAsEntry: () => en }));
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { types: ['Files'], files, items, dropEffect: 'none' },
    relatedTarget: null,
    currentTarget: { contains: () => false },
  } as unknown as DragEvent;
}

describe('useFileDrop — OS ファイル D&D の受け口', () => {
  it('Files を含む dragover で activeZone がそのゾーンになり preventDefault する', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const props = result.current.getZoneProps('tree:a', 'a');
    const e = dragEvent({ types: ['Files'] });
    act(() => props.onDragOver(e));
    expect(result.current.activeZone).toBe('tree:a');
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.dataTransfer!.dropEffect).toBe('copy');
  });

  it('Files を含まない dragover（内部ドラッグ等）は無視し activeZone を変えない', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const props = result.current.getZoneProps('tree:a', 'a');
    const e = dragEvent({ types: ['text/plain'] });
    act(() => props.onDragOver(e));
    expect(result.current.activeZone).toBeNull();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('drop で onDropFiles(folderId, files) を呼び activeZone をクリアする', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const props = result.current.getZoneProps('tree:a', 'a');
    act(() => props.onDragOver(dragEvent({ types: ['Files'] })));
    const files = [fakeFile('1.txt'), fakeFile('2.txt')];
    const e = dragEvent({ types: ['Files'], files });
    act(() => props.onDrop(e));
    expect(onDrop).toHaveBeenCalledWith('a', files);
    expect(result.current.activeZone).toBeNull();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('ファイル 0 件の drop では onDropFiles を呼ばない', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const props = result.current.getZoneProps('pane', 'cur');
    act(() => props.onDrop(dragEvent({ types: ['Files'], files: [] })));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('folderId=null のゾーン（検索中の右ペイン等）は no-op＝ハイライトもアップロードもしない', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const props = result.current.getZoneProps('pane', null);
    act(() => props.onDragOver(dragEvent({ types: ['Files'] })));
    expect(result.current.activeZone).toBeNull();
    act(() => props.onDrop(dragEvent({ types: ['Files'], files: [fakeFile('x.txt')] })));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('dragleave で currentTarget の外へ出たら activeZone をクリアする', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const props = result.current.getZoneProps('tree:a', 'a');
    act(() => props.onDragOver(dragEvent({ types: ['Files'] })));
    expect(result.current.activeZone).toBe('tree:a');
    // 外へ抜ける（contains=false）→ クリア。
    act(() => props.onDragLeave(dragEvent({ types: ['Files'], contains: false })));
    expect(result.current.activeZone).toBeNull();
  });

  it('dragleave でも子要素内（contains=true）への移動なら activeZone を保つ', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const props = result.current.getZoneProps('tree:a', 'a');
    act(() => props.onDragOver(dragEvent({ types: ['Files'] })));
    act(() =>
      props.onDragLeave(dragEvent({ types: ['Files'], relatedTarget: {} as Node, contains: true })),
    );
    expect(result.current.activeZone).toBe('tree:a');
  });

  it('ディレクトリを含む drop は onDropEntries(folderId, entries) を呼び onDropFiles は呼ばない（fil-0055）', () => {
    const onDropFiles = vi.fn();
    const onDropEntries = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDropFiles, onDropEntries));
    const props = result.current.getZoneProps('pane', 'cur');
    const e = dragEventWithEntries([{ isDirectory: true }, { isDirectory: false }]);
    act(() => props.onDrop(e));
    expect(onDropEntries).toHaveBeenCalledTimes(1);
    expect(onDropEntries.mock.calls[0][0]).toBe('cur');
    expect(onDropEntries.mock.calls[0][1]).toHaveLength(2);
    expect(onDropFiles).not.toHaveBeenCalled();
  });

  it('ディレクトリを含まない（ファイルのみ）drop は onDropEntries を呼ばず onDropFiles へフォールバックする', () => {
    const onDropFiles = vi.fn();
    const onDropEntries = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDropFiles, onDropEntries));
    const props = result.current.getZoneProps('pane', 'cur');
    const files = [fakeFile('a.txt')];
    const e = dragEventWithEntries([{ isDirectory: false }], files);
    act(() => props.onDrop(e));
    expect(onDropEntries).not.toHaveBeenCalled();
    expect(onDropFiles).toHaveBeenCalledWith('cur', files);
  });

  it('onDropEntries 未指定なら従来通り onDropFiles のみで動く（後方互換）', () => {
    const onDropFiles = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDropFiles));
    const props = result.current.getZoneProps('pane', 'cur');
    const files = [fakeFile('a.txt')];
    act(() => props.onDrop(dragEventWithEntries([{ isDirectory: true }], files)));
    // onDropEntries が無いのでディレクトリ判定に入らず、files があれば onDropFiles を呼ぶ。
    expect(onDropFiles).toHaveBeenCalledWith('cur', files);
  });

  it('マウント中はゾーン外への OS ファイル dragover/drop を document レベルで既定抑止する（タブで開いて離脱を防止）', () => {
    const onDrop = vi.fn();
    const added: Record<string, (e: globalThis.DragEvent) => void> = {};
    const addSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, handler) => {
      added[type] = handler as (e: globalThis.DragEvent) => void;
    });
    const removeSpy = vi.spyOn(document, 'removeEventListener').mockImplementation(() => {});
    const { unmount } = renderHook(() => useFileDrop(onDrop));

    expect(typeof added.dragover).toBe('function');
    expect(typeof added.drop).toBe('function');

    // Files を含む drop → preventDefault（ブラウザがファイルを開くのを防ぐ）。
    const filesEvt = dragEvent({ types: ['Files'] }) as unknown as globalThis.DragEvent;
    added.drop(filesEvt);
    expect(filesEvt.preventDefault).toHaveBeenCalled();

    // Files を含まない（内部ドラッグ等）→ 抑止しない。
    const plainEvt = dragEvent({ types: ['text/plain'] }) as unknown as globalThis.DragEvent;
    added.dragover(plainEvt);
    expect(plainEvt.preventDefault).not.toHaveBeenCalled();

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('dragover', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('drop', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
