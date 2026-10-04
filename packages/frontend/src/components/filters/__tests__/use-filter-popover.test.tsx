import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useFilterPopover } from '../toggle-filter';

// dsk-0310: useFilterPopover が document 全体の click 監視で popup を閉じる仕様に対し、
// 別ウィンドウ/別アプリへフォーカスが移った後、自ウィンドウへフォーカスが戻った際に
// document.body への click が synthesize される場合があり、その click で popup が
// 意図せず閉じていた真因を修正。修正後の挙動を pin する。
//
// 修正方針: onDocClick で `e.target === document.body || document.documentElement` の
// 場合は早期 return。popup 外の別要素 click では従来通り閉じる。

function Probe() {
  const { open, setOpen, ref } = useFilterPopover();
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        open
      </button>
      <div ref={ref} className="probe-popover">
        {open && <div role="dialog">popup-content</div>}
      </div>
    </div>
  );
}

describe('useFilterPopover — dsk-0310 focus 移動由来の body click 除外', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('document.body への click では popup は閉じない（focus 移動由来とみなす）', () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(document.body);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('document.documentElement への click では popup は閉じない', () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(document.documentElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('popup 外の別要素 click では popup が閉じる（外側クリック検知の維持）', () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const outside = document.createElement('button');
    outside.type = 'button';
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    fireEvent.click(outside);
    expect(screen.queryByRole('dialog')).toBeNull();
    outside.remove();
  });

  it('Esc で popup が閉じる（既存挙動維持）', () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
