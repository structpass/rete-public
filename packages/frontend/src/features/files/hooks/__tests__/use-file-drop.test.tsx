import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * useFileDrop の OS ファイル D&D 経路。
 * - OS drop すると onDropFiles 経由で upload 経路に渡る（fil-0052 で確立）。
 * - folderId=null は受口にしない（fil-0103 で確立した「未選択 / 検索中」は no-op）。
 * 権限（canEdit）による drop 拒否は ADR 0063（fil-0139）で機構ごと撤去した。
 */
const { onDropFiles, onDropEntries } = vi.hoisted(() => ({
  onDropFiles: vi.fn(),
  onDropEntries: vi.fn(),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}));

import { useFileDrop } from '../use-file-drop';

beforeEach(() => {
  onDropFiles.mockReset();
  onDropEntries.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

/**
 * useFileDrop を描画する最小テストホスト。zoneId と folderId を渡すとネイティブハンドラ群を
 * 持つ div が出るので、fireEvent.drop で受け側の onDrop が走る（RTL は SyntheticEvent 経由で
 * dataTransfer を渡すため、実 hook 内の hasOsFiles ガードが types=['Files'] を観測できる）。
 */
function makeHost(folderId: string | null) {
  function Probe() {
    const { getZoneProps } = useFileDrop(onDropFiles);
    const props = getZoneProps('pane', folderId);
    return <div data-testid="zone" {...props} />;
  }
  render(<Probe />);
  return screen.getByTestId('zone');
}

describe('useFileDrop — OS ファイル D&D', () => {
  it('OS drop すると onDropFiles が folderId と files で呼ばれる', () => {
    const zone = makeHost('folder-1');
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });

    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files'], files: [file], items: [] },
    });

    expect(onDropFiles).toHaveBeenCalledWith('folder-1', [file]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('folderId=null では OS drop で何も起こらない（fil-0103 経路の維持）', () => {
    const zone = makeHost(null);
    const file = new File(['content'], 'a.txt', { type: 'text/plain' });

    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files'], files: [file], items: [] },
    });

    expect(onDropFiles).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('types に Files を含まない drop は早期 return（テキスト D&D 等を OS drop 扱いしない）', () => {
    const zone = makeHost('folder-1');

    fireEvent.drop(zone, {
      dataTransfer: { types: ['text/plain'], files: [], items: [] },
    });

    expect(onDropFiles).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
