import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { OverlayDialog, useOverlayClose } from '../overlay-dialog';

afterEach(() => cleanup());

const bgChildren = () =>
  Array.from(document.body.children).filter((el) => !el.hasAttribute('data-overlay-root'));

describe('OverlayDialog', () => {
  it('open=false のとき内容を描画しない', () => {
    render(
      <OverlayDialog open={false} onClose={() => {}} ariaLabel="テスト">
        <button>中身</button>
      </OverlayDialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('中身')).toBeNull();
  });

  it('open=true で children を role=dialog / aria-modal / aria-label 付きで描画する', () => {
    render(
      <OverlayDialog open onClose={() => {}} ariaLabel="テストダイアログ">
        <button>中身</button>
      </OverlayDialog>,
    );
    const dlg = screen.getByRole('dialog');
    expect(dlg).toBeInTheDocument();
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(dlg).toHaveAttribute('aria-label', 'テストダイアログ');
    expect(screen.getByText('中身')).toBeInTheDocument();
  });

  it('Escape キーで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(
      <OverlayDialog open onClose={onClose} ariaLabel="x">
        <button>中身</button>
      </OverlayDialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop クリックで onClose を呼ぶ（既定）', () => {
    const onClose = vi.fn();
    render(
      <OverlayDialog open onClose={onClose} ariaLabel="x">
        <button>中身</button>
      </OverlayDialog>,
    );
    fireEvent.click(screen.getByTestId('overlay-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closeOnBackdrop=false なら backdrop クリックで閉じない', () => {
    const onClose = vi.fn();
    render(
      <OverlayDialog open onClose={onClose} ariaLabel="x" closeOnBackdrop={false}>
        <button>中身</button>
      </OverlayDialog>,
    );
    fireEvent.click(screen.getByTestId('overlay-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('開いた時にダイアログ内へフォーカスが移る', async () => {
    render(
      <OverlayDialog open onClose={() => {}} ariaLabel="x">
        <button>最初</button>
        <button>最後</button>
      </OverlayDialog>,
    );
    const dlg = screen.getByRole('dialog');
    await waitFor(() => {
      expect(dlg.contains(document.activeElement)).toBe(true);
    });
  });

  it('Tab トラップ: 最後の要素から Tab で最初へ、最初から Shift+Tab で最後へ巡回する', () => {
    render(
      <OverlayDialog open onClose={() => {}} ariaLabel="x">
        <button>最初</button>
        <input aria-label="中" />
        <button>最後</button>
      </OverlayDialog>,
    );
    const first = screen.getByText('最初');
    const last = screen.getByText('最後');
    const dlg = screen.getByRole('dialog');

    last.focus();
    fireEvent.keyDown(dlg, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(dlg, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('閉じた時に開く前のフォーカス位置へ戻す', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>開く</button>
          <OverlayDialog open={open} onClose={() => setOpen(false)} ariaLabel="x">
            <button onClick={() => setOpen(false)}>閉じる</button>
          </OverlayDialog>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByText('開く');
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByText('閉じる'));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('2つ同時マウント → 一方を閉じても背景は隔離継続、両方閉じると inert/aria-hidden が完全復元される', async () => {
    function Harness() {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      return (
        <>
          <button onClick={() => setA(false)}>Aを閉じる</button>
          <button onClick={() => setB(false)}>Bを閉じる</button>
          <OverlayDialog open={a} onClose={() => setA(false)} ariaLabel="A">
            <button>A中身</button>
          </OverlayDialog>
          <OverlayDialog open={b} onClose={() => setB(false)} ariaLabel="B">
            <button>B中身</button>
          </OverlayDialog>
        </>
      );
    }
    render(<Harness />);
    await waitFor(() =>
      expect(bgChildren().every((el) => el.getAttribute('aria-hidden') === 'true')).toBe(true),
    );

    // A だけ閉じる → B が開いている間は背景隔離が継続する
    fireEvent.click(screen.getByText('Aを閉じる'));
    await waitFor(() => expect(screen.queryByText('A中身')).toBeNull());
    expect(bgChildren().every((el) => el.getAttribute('aria-hidden') === 'true')).toBe(true);

    // B も閉じる → 永続リークなく完全復元
    fireEvent.click(screen.getByText('Bを閉じる'));
    await waitFor(() => expect(screen.queryByText('B中身')).toBeNull());
    expect(bgChildren().some((el) => el.getAttribute('aria-hidden') === 'true')).toBe(false);
    expect(bgChildren().some((el) => (el as HTMLElement).inert)).toBe(false);
  });

  it('dirty=true の Escape は即閉じず破棄確認を出し、OK で onClose・キャンセルで留まる（mdl-0034 規約②）', async () => {
    const onClose = vi.fn();
    render(
      <OverlayDialog open onClose={onClose} ariaLabel="x" dirty>
        <input aria-label="入力" />
      </OverlayDialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toBeInTheDocument();

    // キャンセル → 破棄せず編集に留まる
    fireEvent.click(screen.getByText('キャンセル'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();

    // 再度 Esc → OK → 破棄して閉じる
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(await screen.findByText('OK'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dirty=true の backdrop クリックも破棄確認を挟む', async () => {
    const onClose = vi.fn();
    render(
      <OverlayDialog open onClose={onClose} ariaLabel="x" dirty>
        <input aria-label="入力" />
      </OverlayDialog>,
    );
    fireEvent.click(screen.getByTestId('overlay-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('dirty=false なら Escape で従来どおり確認なしに即閉じる', () => {
    const onClose = vi.fn();
    render(
      <OverlayDialog open onClose={onClose} ariaLabel="x" dirty={false}>
        <input aria-label="入力" />
      </OverlayDialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('useOverlayClose 経由の閉じ要求（キャンセル/×ボタン相当）も dirty 時は破棄確認を挟む', async () => {
    const onClose = vi.fn();
    function CancelButton() {
      const requestClose = useOverlayClose();
      return (
        <button type="button" onClick={requestClose}>
          やめる
        </button>
      );
    }
    render(
      <OverlayDialog open onClose={onClose} ariaLabel="x" dirty>
        <CancelButton />
      </OverlayDialog>,
    );
    fireEvent.click(screen.getByText('やめる'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText('OK'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('discardMessage で破棄確認の本文を差し替えられる', async () => {
    render(
      <OverlayDialog
        open
        onClose={() => {}}
        ariaLabel="x"
        dirty
        discardMessage="入力を破棄しますか？"
      >
        <input aria-label="入力" />
      </OverlayDialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(await screen.findByText('入力を破棄しますか？')).toBeInTheDocument();
  });

  it('開いている間は背景（body 直下の非オーバーレイ要素）を aria-hidden にし、閉じると戻す', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>開く</button>
          <OverlayDialog open={open} onClose={() => setOpen(false)} ariaLabel="x">
            <button onClick={() => setOpen(false)}>閉じる</button>
          </OverlayDialog>
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByText('開く'));
    await waitFor(() =>
      expect(bgChildren().every((el) => el.getAttribute('aria-hidden') === 'true')).toBe(true),
    );
    fireEvent.click(screen.getByText('閉じる'));
    await waitFor(() =>
      expect(bgChildren().some((el) => el.getAttribute('aria-hidden') === 'true')).toBe(false),
    );
  });
});
