import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { flush } from '@/test-utils/flush';
import { afterEach } from 'vitest';

// deferred-flush 添付（FL-3b）の配線検証用。ピッカーは files API を引くため onPick 即時スタブへ、
// 添付 API（createAttachment）はモックして flush 呼び出しの宛先を検証する。
// cmn-0146: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { createAttachment } = vi.hoisted(() => ({
  createAttachment: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  createAttachment: (...args: unknown[]) => createAttachment(...args),
}));
vi.mock('../components/file-picker-overlay', () => ({
  FilePickerOverlay: ({
    onPick,
  }: {
    onPick: (fileId: string, fileName: string, source: 'repo' | 'local') => void;
  }) => (
    <button type="button" onClick={() => onPick('f1', '仕様.pdf', 'local')}>
      pick-stub
    </button>
  ),
}));

import { ThemeComposer } from '../components/theme-composer';

afterEach(() => {
  cleanup();
  createAttachment.mockReset();
});

// テーマ作成コンポーザーの描画テスト。説明欄は共有リッチエディタ（Tiptap / ADR 0019）へ配線済み。
// contenteditable への実入力は jsdom で完全再現できないため、描画・ツールバー・タイトルのクリア/検証を検証する
// （書式適用そのものは E2E/手動で確認）。
describe('ThemeComposer', () => {
  it('タイトル入力・説明エディタ・送信ボタンを描画する', () => {
    render(<ThemeComposer onCreate={vi.fn()} accounts={[]} />);
    expect(screen.getByPlaceholderText('タイトル')).toBeInTheDocument();
    // 説明はリッチエディタ（aria-label="説明" の contenteditable）。
    expect(screen.getByLabelText('説明')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument();
  });

  it('実書式適用ツールバー（live）と添付ボタンを描画する', () => {
    render(<ThemeComposer onCreate={vi.fn()} accounts={[]} />);
    expect(screen.getByRole('toolbar', { name: '文字書式' })).toBeInTheDocument();
    expect(screen.getByLabelText('太字')).toBeInTheDocument();
    expect(screen.getByLabelText('箇条書き')).toBeInTheDocument();
    expect(screen.getByLabelText('フォント色')).toBeInTheDocument();
    // ファイル添付（FL-3b・deferred-flush）= PendingAttachmentField のテキストボタン。
    expect(screen.getByRole('button', { name: 'ファイル添付' })).toBeInTheDocument();
  });

  it('キャンセルボタンは常時表示で空のとき disabled、入力で活性化して破棄確認で内容をクリアする（dsk-0350）', () => {
    render(<ThemeComposer onCreate={vi.fn()} accounts={[]} />);
    const title = screen.getByPlaceholderText('タイトル') as HTMLInputElement;
    // 常時表示・空＝disabled（dsk-0350・dirty ゲート撤廃）。
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();

    fireEvent.change(title, { target: { value: 'テーマ案' } });
    expect(title.value).toBe('テーマ案');
    // 入力で活性化する。押下で破棄確認 → OK でクリア。
    expect(screen.getByRole('button', { name: 'キャンセル' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(title.value).toBe('');
  });

  it('プレースホルダーは「タイトル」（rete-desk-0061）', () => {
    render(<ThemeComposer onCreate={vi.fn()} accounts={[]} />);
    expect(screen.getByPlaceholderText('タイトル')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('新しい話題のタイトル')).toBeNull();
  });

  it('タイトル入力欄で Ctrl+Enter を押すと送信する（rete-desk-0060）', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 't1' });
    render(<ThemeComposer onCreate={onCreate} accounts={[]} />);
    const title = screen.getByPlaceholderText('タイトル');
    fireEvent.change(title, { target: { value: '在庫確認' } });
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true });
    await flush();
    expect(onCreate).toHaveBeenCalledWith({
      title: '在庫確認',
      description: undefined,
      descriptionMentionAccountIds: [],
    });
  });

  it('タイトル入力欄で Cmd+Enter を押すと送信する（mac / rete-desk-0060）', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 't2' });
    render(<ThemeComposer onCreate={onCreate} accounts={[]} />);
    const title = screen.getByPlaceholderText('タイトル');
    fireEvent.change(title, { target: { value: '発注' } });
    fireEvent.keyDown(title, { key: 'Enter', metaKey: true });
    await flush();
    expect(onCreate).toHaveBeenCalledWith({
      title: '発注',
      description: undefined,
      descriptionMentionAccountIds: [],
    });
  });

  it('タイトル・説明どちらも空のとき送信・キャンセルは無効（dsk-0350・activity-state は title or body 非空）', () => {
    const onCreate = vi.fn();
    render(<ThemeComposer onCreate={onCreate} accounts={[]} />);
    // 旧: クリックで validate エラーを表示していた。新挙動: 空のうちは押せない（disabled）。
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    // クリックしても onCreate は呼ばれない。
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('タイトルだけ入力すると送信・キャンセルが活性化する（dsk-0350）', () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 't1' });
    render(<ThemeComposer onCreate={onCreate} accounts={[]} />);
    const title = screen.getByPlaceholderText('タイトル') as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'テストテーマ' } });
    // title のみ入力で活性化する（title or body 非空）。
    expect(screen.getByRole('button', { name: '送信' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャンセル' })).not.toBeDisabled();
  });

  it('入力ありで Esc を押すと破棄ダイアログを出し、OK でクリアする（rete-desk-0079/0102）', () => {
    render(<ThemeComposer onCreate={vi.fn()} accounts={[]} />);
    const title = screen.getByPlaceholderText('タイトル') as HTMLInputElement;
    fireEvent.change(title, { target: { value: '破棄テスト' } });
    // Esc はルート div の onKeyDown へバブリングして × と同じキャンセル挙動になる。
    fireEvent.keyDown(title, { key: 'Escape' });
    // 文言は共有ダイアログの既定（rete-desk-0127/0128 で単一メッセージへ統一）。
    expect(
      screen.getByText('編集中の内容を破棄しますか？保存していない変更は失われます。'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(title.value).toBe('');
  });

  it('入力ありで Esc → 「キャンセル」なら内容を保持する（rete-desk-0079/0102）', () => {
    render(<ThemeComposer onCreate={vi.fn()} accounts={[]} />);
    const title = screen.getByPlaceholderText('タイトル') as HTMLInputElement;
    fireEvent.change(title, { target: { value: '保持テスト' } });
    fireEvent.keyDown(title, { key: 'Escape' });
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    expect(title.value).toBe('保持テスト');
  });

  it('入力なしで Esc を押しても破棄ダイアログを出さない（rete-desk-0079/0102）', () => {
    render(<ThemeComposer onCreate={vi.fn()} accounts={[]} />);
    const title = screen.getByPlaceholderText('タイトル');
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('保留ファイル付きで作成すると、作成テーマ id へ deferred-flush 添付する（FL-3b）', async () => {
    createAttachment.mockResolvedValue(undefined);
    const onCreate = vi.fn().mockResolvedValue({ id: 't9' });
    render(<ThemeComposer onCreate={onCreate} accounts={[]} />);

    fireEvent.change(screen.getByPlaceholderText('タイトル'), {
      target: { value: '入荷フロー' },
    });
    // ファイル添付 → スタブで 1 件保留 → 送信。
    fireEvent.click(screen.getByRole('button', { name: 'ファイル添付' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-stub' }));
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    await flush();

    expect(onCreate).toHaveBeenCalledWith({
      title: '入荷フロー',
      description: undefined,
      descriptionMentionAccountIds: [],
    });
    // 作成成功後、保留ファイルが新テーマ（t9）へ添付される。
    expect(createAttachment).toHaveBeenCalledWith({
      targetType: 'theme',
      targetId: 't9',
      fileId: 'f1',
    });
  });
});
