import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReactionBar } from '../components/reaction-bar';

/**
 * cmn-0217: ReactionBar のピッカー閉じ挙動を固定する。brd-0227 で手書きの pointerdown 監視を
 * useOutsideClose へ寄せたが、このコンポーネントだけは portal 描画のため内側判定が
 * [rootRef, pickerRef] の 2 ref になっており、共通 hook のテストでは守れない固有リスクを持つ
 * （pickerRef を落とすとピッカー内側の操作で自分自身が閉じる）。
 * Esc は hook 内の useEscapeConsume が document 段で消費し、desk-shell の window 段一括クローズ
 * （オーバーレイごと閉じる）へは伝播しない＝「ピッカーだけ閉じる」ことも併せて固定する。
 */
function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'リアクションを追加' }));
}

function renderBar() {
  const onToggle = vi.fn().mockResolvedValue(undefined);
  render(
    <ReactionBar reactions={[{ emoji: '👍', count: 1, reactedByMe: false }]} onToggle={onToggle} />,
  );
  return { onToggle };
}

describe('ReactionBar — ピッカーの閉じ挙動（cmn-0217）', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('外側 pointerdown でピッカーが閉じる', () => {
    renderBar();
    openPicker();
    expect(screen.getByRole('button', { name: 'リアクションを追加' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.pointerDown(document.body);

    expect(screen.getByRole('button', { name: 'リアクションを追加' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('ピッカー内側の pointerdown では閉じない（portal 先も内側として判定する）', () => {
    renderBar();
    openPicker();

    // portal 描画されたピッカー内の絵文字ボタンを押し込む（click までは進めない＝選択ではなく押下の検証）。
    const picker = screen.getByRole('menu', { name: '絵文字を選択' });
    const emojiButtons = Array.from(picker.querySelectorAll('button'));
    expect(emojiButtons.length).toBeGreaterThan(0);
    fireEvent.pointerDown(emojiButtons[0]);

    expect(screen.getByRole('button', { name: 'リアクションを追加' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('Escape でピッカーだけが閉じ、window 段のリスナーへは伝播しない', () => {
    const onWindowKeyDown = vi.fn();
    window.addEventListener('keydown', onWindowKeyDown);
    try {
      renderBar();
      openPicker();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.getByRole('button', { name: 'リアクションを追加' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(onWindowKeyDown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  });
});
