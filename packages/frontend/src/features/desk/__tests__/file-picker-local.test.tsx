import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// cmn-0146: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { uploadFile } = vi.hoisted(() => ({
  uploadFile: vi.fn(),
}));
vi.mock('@/features/files/lib/api', () => ({
  uploadFile: (folderId: string, file: File) => uploadFile(folderId, file),
}));

import { FilePickerLocal } from '../components/file-picker-local';
import { DUPLICATE_ATTACHMENT_NAME_MESSAGE } from '../lib/attachment-duplicate';

afterEach(() => {
  cleanup();
  uploadFile.mockReset();
});

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('FilePickerLocal 事前重複チェック（dsk-0290）', () => {
  it('isDuplicateName が true を返す名前は uploadFile を呼ばずブロックする', async () => {
    const onPick = vi.fn();
    const isDuplicateName = vi.fn().mockReturnValue(true);
    render(<FilePickerLocal destFolderId="f1" onPick={onPick} isDuplicateName={isDuplicateName} />);
    const file = new File(['x'], '出荷ラベルレイアウト.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(DUPLICATE_ATTACHMENT_NAME_MESSAGE);
    });
    expect(isDuplicateName).toHaveBeenCalledWith('出荷ラベルレイアウト.pdf');
    expect(uploadFile).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('isDuplicateName が false を返す名前は従来どおり uploadFile して onPick する', async () => {
    uploadFile.mockResolvedValue({ id: 'file9', name: '新規.pdf' });
    const onPick = vi.fn();
    const isDuplicateName = vi.fn().mockReturnValue(false);
    render(<FilePickerLocal destFolderId="f1" onPick={onPick} isDuplicateName={isDuplicateName} />);
    const file = new File(['x'], '新規.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    await waitFor(() => {
      expect(onPick).toHaveBeenCalledWith('file9', '新規.pdf');
    });
    expect(uploadFile).toHaveBeenCalledWith('f1', file);
  });

  it('isDuplicateName 未指定なら従来どおり事前チェック無しで uploadFile する', async () => {
    uploadFile.mockResolvedValue({ id: 'file9', name: '新規.pdf' });
    const onPick = vi.fn();
    render(<FilePickerLocal destFolderId="f1" onPick={onPick} />);
    const file = new File(['x'], '新規.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    await waitFor(() => {
      expect(onPick).toHaveBeenCalledWith('file9', '新規.pdf');
    });
    expect(uploadFile).toHaveBeenCalledWith('f1', file);
  });
});
