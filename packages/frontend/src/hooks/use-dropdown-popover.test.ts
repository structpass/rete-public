import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { useDropdownPopover } from './use-dropdown-popover';

// hom-0099: TagFilterDropdown / SelectDropdown が共有する外側クリック・Escape での
// 閉じる挙動を hook 本体で直接検証する（quality-review 2026-07-05 で検出されたテスト欠落を解消）。
// cmn-0354: 実装を useOutsideClose 委譲へ差し替えたため、検証する境界観点は維持したまま
// イベント種別（pointerdown）と Esc 消費（useEscapeConsume）を新実装に合わせて更新。

function TestComponent() {
  const { open, setOpen, ref } = useDropdownPopover();
  return createElement(
    'div',
    { ref, 'data-testid': 'root' },
    createElement('button', { 'data-testid': 'toggle', onClick: () => setOpen(!open) }, 'toggle'),
    open ? createElement('div', { 'data-testid': 'menu' }, 'menu') : null,
  );
}

function openMenu() {
  fireEvent.click(document.querySelector('[data-testid="toggle"]') as HTMLElement);
}

describe('useDropdownPopover — 開閉制御（hom-0099 / cmn-0354）', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('ルート要素の外側を pointerdown すると閉じる（従来の押下タイミングを維持）', () => {
    render(createElement(TestComponent));
    openMenu();
    expect(document.querySelector('[data-testid="menu"]')).not.toBeNull();

    fireEvent.pointerDown(document.body);

    expect(document.querySelector('[data-testid="menu"]')).toBeNull();
  });

  it('ルート要素の内側を pointerdown しても閉じない', () => {
    render(createElement(TestComponent));
    openMenu();
    const root = document.querySelector('[data-testid="root"]') as HTMLElement;

    fireEvent.pointerDown(root);

    expect(document.querySelector('[data-testid="menu"]')).not.toBeNull();
  });

  it('Escape キーで閉じる（useEscapeConsume 経由・document 購読）', () => {
    render(createElement(TestComponent));
    openMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.querySelector('[data-testid="menu"]')).toBeNull();
  });

  it('close 中（open=false）は document リスナーを登録しない', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    render(createElement(TestComponent));

    expect(addSpy).not.toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });

  it('open 中は document へ pointerdown リスナーを登録する', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    render(createElement(TestComponent));
    openMenu();

    expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });

  it('unmount 時に pointerdown リスナーを解除する', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(createElement(TestComponent));
    openMenu();

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });
});
