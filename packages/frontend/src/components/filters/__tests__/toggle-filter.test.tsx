import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Filter } from 'lucide-react';
import { ToggleFilter } from '../toggle-filter';

// hom-0105: hom-0080 で ToggleFilter の popover を createPortal(document.body) 化した際の
// 固有ロジック（popupRef 経由の outside-click 判定・scroll/resize 追従・unmount クリーンアップ）を
// 検証する。JSDOM は overflow:hidden な祖先によるクリップを再現しないため、Portal化そのものの
// 不具合（rete-desk-0080 議事の実物確認）は unit test では検出できないが、Portal化後のロジックは
// ここで再発防止できる。

describe('ToggleFilter — Portal popover のロジック（hom-0080 / hom-0105）', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function setup(active = false) {
    const onToggle = vi.fn();
    render(
      <ToggleFilter
        Icon={Filter}
        label="アーカイブ"
        switchLabel="表示する"
        active={active}
        onToggle={onToggle}
      />,
    );
    return { onToggle };
  }

  it('popup は trigger の DOM 子孫ではなく document.body 直下へ Portal 描画される', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'アーカイブ' }));

    const popup = screen.getByRole('dialog', { name: 'アーカイブ' });
    const trigger = screen.getByRole('button', { name: 'アーカイブ' });
    expect(popup.parentElement).toBe(document.body);
    expect(trigger.contains(popup)).toBe(false);
  });

  it('popupRef 経由で inside 扱いされ、popup 内クリックでは閉じない', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'アーカイブ' }));
    expect(screen.getByRole('dialog', { name: 'アーカイブ' })).toBeInTheDocument();

    // popup 自体（スイッチ以外の領域）をクリックしても、trigger の DOM 子孫でない popup を
    // popupRef.contains で inside 判定できているか（できていなければ即座に閉じてしまう）。
    fireEvent.click(screen.getByRole('dialog', { name: 'アーカイブ' }));
    expect(screen.getByRole('dialog', { name: 'アーカイブ' })).toBeInTheDocument();
  });

  it('document.body への click では閉じない（dsk-0310: focus 移動由来の body click は外側扱いしない）', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'アーカイブ' }));
    expect(screen.getByRole('dialog', { name: 'アーカイブ' })).toBeInTheDocument();

    fireEvent.click(document.body);
    expect(screen.getByRole('dialog', { name: 'アーカイブ' })).toBeInTheDocument();
  });

  it('popup 外の別要素 click で閉じる（trigger/popup の contains 判定）', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'アーカイブ' }));
    expect(screen.getByRole('dialog', { name: 'アーカイブ' })).toBeInTheDocument();

    // 別要素（trigger とは別の div）を click して閉じる
    const outside = document.createElement('div');
    outside.setAttribute('data-testid', 'outside');
    document.body.appendChild(outside);
    fireEvent.click(outside);
    expect(screen.queryByRole('dialog', { name: 'アーカイブ' })).not.toBeInTheDocument();
    outside.remove();
  });

  it('open 中は scroll/resize で再配置ロジックが再実行される', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'アーカイブ' }));
    const trigger = screen.getByRole('button', { name: 'アーカイブ' });
    const spy = vi.spyOn(trigger.parentElement as HTMLElement, 'getBoundingClientRect');

    fireEvent.scroll(window);
    fireEvent.resize(window);

    expect(spy).toHaveBeenCalled();
  });

  it('unmount 時に scroll/resize/click/keydown のリスナーを解除する', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const winAddSpy = vi.spyOn(window, 'addEventListener');
    const winRemoveSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <ToggleFilter
        Icon={Filter}
        label="アーカイブ"
        switchLabel="表示する"
        active={false}
        onToggle={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'アーカイブ' }));

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function));
    // keydown は useEscapeConsume が capture 引数を明示して登録する（click は 2 引数）。
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), expect.any(Boolean));
    expect(winAddSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(winAddSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), expect.any(Boolean));
    expect(winRemoveSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(winRemoveSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});

// dsk-0403: 顛末 chip の flash 化（1クリック自動トグル）。チップ本体が role=switch になりクリックで
// onToggle を直接呼ぶ（dialog popover は描かない）。
// dsk-0436: 一過性 flash popup（.is-flash・装飾専用）を撤去。ON/OFF トグルのみのフィルタは
// ポップアップ/リストを一切表示せず、チップの is-active 状態（mdl-0033 右上赤丸ドット）だけで
// ON/OFF を識別する。既定 false の2段階挙動は上位 describe で保護済み。
describe('ToggleFilter — flash 1クリックトグル（dsk-0403 / dsk-0436）', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function setupFlash(active = false) {
    const onToggle = vi.fn();
    render(
      <ToggleFilter
        Icon={Filter}
        label="顛末"
        switchLabel="顛末記録済のみ表示"
        active={active}
        onToggle={onToggle}
        flash
      />,
    );
    return { onToggle };
  }

  it('チップ本体が role=switch になり aria-checked が active を反映する（haspopup/expanded は付かない）', () => {
    setupFlash(false);
    const chip = screen.getByRole('switch', { name: '顛末' });
    expect(chip).toHaveAttribute('aria-checked', 'false');
    expect(chip).not.toHaveAttribute('aria-haspopup');
    expect(chip).not.toHaveAttribute('aria-expanded');
  });

  it('active=true で aria-checked=true と is-active クラスが付く（has-inline-switch は撤去）', () => {
    setupFlash(true);
    const chip = screen.getByRole('switch', { name: '顛末' });
    expect(chip).toHaveAttribute('aria-checked', 'true');
    expect(chip.closest('.desk-filter-icon')).toHaveClass('is-active');
    expect(chip.closest('.desk-filter-icon')).not.toHaveClass('has-inline-switch');
  });

  it('1クリックで onToggle が直接呼ばれ、role=dialog の popover は描画されない', () => {
    const { onToggle } = setupFlash(false);
    fireEvent.click(screen.getByRole('switch', { name: '顛末' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: '顛末' })).not.toBeInTheDocument();
  });

  it('flash popup（.is-flash）は click 時にも mount されない（dsk-0436 撤去）', () => {
    setupFlash(false);
    fireEvent.click(screen.getByRole('switch', { name: '顛末' }));
    // 一過性のリスト/ポップアップを一切出さない（ON/OFF はチップの is-active で識別）。
    expect(document.querySelector('.desk-filter-toggle-popup.is-flash')).not.toBeInTheDocument();
    expect(document.querySelector('.desk-filter-toggle-popup')).not.toBeInTheDocument();
  });

  it('連打しても flash popup は mount されない（dsk-0436 撤去・トグルだけが効く）', () => {
    const { onToggle } = setupFlash(false);
    fireEvent.click(screen.getByRole('switch', { name: '顛末' }));
    fireEvent.click(screen.getByRole('switch', { name: '顛末' }));
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.desk-filter-toggle-popup.is-flash')).not.toBeInTheDocument();
  });
});
