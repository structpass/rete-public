import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnouncementForm } from '../announcement-form';

// cmn-0142: vi.hoisted 化（vi.fn は無いが JSX スタブを hoist し grep ゲートを通す）
const { RichTextEditor } = vi.hoisted(() => ({
  // RichTextEditor は Tiptap（jsdom 非対応の measure 系）を含むため最小スタブへ差し替える。
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (html: string) => void;
    ariaLabel?: string;
  }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock('@/features/desk/components/rich-text-editor', () => ({
  RichTextEditor,
}));

describe('AnnouncementForm — Esc / 破棄確認（rete-home-0016/0017）', () => {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未編集（pristine）で Esc を押すと確認なしでキャンセルされる', () => {
    render(
      <AnnouncementForm mode="create" saving={false} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('変更を破棄しますか？')).not.toBeInTheDocument();
  });

  it('編集中（dirty）で Esc を押すと破棄確認ダイアログが出て即キャンセルしない', () => {
    render(
      <AnnouncementForm mode="create" saving={false} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByPlaceholderText('通知のタイトル'), {
      target: { value: '入力中' },
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByText('編集中の内容を破棄しますか？保存していない変更は失われます。'),
    ).toBeInTheDocument();
  });

  it('破棄確認で OK を押すとキャンセルが確定する', () => {
    render(
      <AnnouncementForm mode="create" saving={false} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByPlaceholderText('通知のタイトル'), {
      target: { value: '入力中' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(
      screen.getByText('編集中の内容を破棄しますか？保存していない変更は失われます。'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('編集中のキャンセルボタンで確認を出し、ダイアログのキャンセルでフォームを維持する', () => {
    render(
      <AnnouncementForm mode="create" saving={false} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByPlaceholderText('通知のタイトル'), {
      target: { value: '入力中' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    // ダイアログ内のキャンセル（data-autofocus 付き）で破棄を取りやめる。
    const dialogCancels = screen.getAllByRole('button', { name: 'キャンセル' });
    fireEvent.click(dialogCancels[dialogCancels.length - 1]);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('AnnouncementForm — 添付ファイル（H0022）', () => {
  const onCancel = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create モードは「ファイル添付」ボタンを出す（保留添付）', () => {
    render(
      <AnnouncementForm mode="create" saving={false} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    // rete-home-0029/0030: 「添付ファイル」ラベル節は撤去し、本文直下の「ファイル添付」ボタンへ一本化した。
    expect(screen.getByRole('button', { name: 'ファイル添付' })).toBeInTheDocument();
  });

  it('edit モードは初期添付をチップで表示し解除ボタンを出す（即時 add/remove）', () => {
    render(
      <AnnouncementForm
        mode="edit"
        announcementId="ann-1"
        initial={{ title: '既存', body: '<p>x</p>' }}
        initialAttachments={[
          {
            id: 'att-1',
            fileId: 'f1',
            fileName: '仕様書.pdf',
            versionNo: 2,
            byteSize: 2048,
            mimeType: 'application/pdf',
            attachedBy: '田中 太郎',
            createdAt: '2026-06-01T00:00:00.000Z',
          },
        ]}
        saving={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText('仕様書.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '仕様書.pdf を解除' })).toBeInTheDocument();
  });

  it('submit は pendingFileIds（create 既定は空配列）を第2引数で渡す', async () => {
    render(
      <AnnouncementForm mode="create" saving={false} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByPlaceholderText('通知のタイトル'), { target: { value: '新規' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: '新規' }), []),
    );
  });
});
