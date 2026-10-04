import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useRef } from 'react';
import { useOutsideClose } from '../use-outside-close';

function Probe({
  active,
  multi = false,
  onClose,
  eventType,
}: {
  active: boolean;
  multi?: boolean;
  onClose: () => void;
  eventType?: 'click' | 'pointerdown';
}) {
  const ref1 = useRef<HTMLDivElement>(null);
  const ref2 = useRef<HTMLDivElement>(null);
  useOutsideClose({ active, refs: multi ? [ref1, ref2] : [ref1], onClose, eventType });
  return (
    <div>
      <div ref={ref1} className="inside-1" data-testid="inside-1">
        inside-1
      </div>
      {multi && (
        <div ref={ref2} className="inside-2" data-testid="inside-2">
          inside-2
        </div>
      )}
      <button type="button" className="outside">
        outside
      </button>
    </div>
  );
}

describe('useOutsideClose (dsk-0358)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('active=true で外側要素 click → onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('active=true で内側要素 click → onClose は呼ばれない', () => {
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);
    fireEvent.click(screen.getByTestId('inside-1'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('active=false（閉）時は listener が attach されず外側 click でも onClose は呼ばれない', () => {
    const onClose = vi.fn();
    render(<Probe active={false} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc で onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('active=false（閉）時は Esc でも onClose は呼ばれない', () => {
    const onClose = vi.fn();
    render(<Probe active={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dsk-0371: IME 変換中（isComposing=true）の Esc では onClose は呼ばれない', () => {
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape', isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dsk-0371: Esc は stopPropagation で消費され window 段のリスナーへ伝播しない', () => {
    const onClose = vi.fn();
    const windowListener = vi.fn();
    window.addEventListener('keydown', windowListener);
    try {
      render(<Probe active onClose={onClose} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(windowListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowListener);
    }
  });

  it('dsk-0310 ガード: document.body への click では onClose は呼ばれない', () => {
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);
    fireEvent.click(document.body);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dsk-0310 ガード: document.documentElement への click では onClose は呼ばれない', () => {
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);
    fireEvent.click(document.documentElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('複数 ref 対応: いずれかの内側 click なら onClose は呼ばれない（ToggleFilter の trigger+popup 形状）', () => {
    const onClose = vi.fn();
    render(<Probe active multi onClose={onClose} />);
    fireEvent.click(screen.getByTestId('inside-2'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('複数 ref 対応: どの内側にも属さない click → onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(<Probe active multi onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
/**
 * brd-0227: Desk のメニュー 6 箇所は手書きで pointerdown を購読していた（押した瞬間に閉じる）。
 * 購読イベント種別をオプション化して寄せる。既定は click のままで既存呼び出し元は不変。
 */
describe('useOutsideClose — eventType 種別オプション（brd-0227）', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("eventType='pointerdown' で外側 pointerdown → onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<Probe active eventType="pointerdown" onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("eventType='pointerdown' で内側 pointerdown → onClose は呼ばれない", () => {
    const onClose = vi.fn();
    render(<Probe active eventType="pointerdown" onClose={onClose} />);
    fireEvent.pointerDown(screen.getByTestId('inside-1'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("eventType='pointerdown' では click では閉じない（購読種別が排他）", () => {
    const onClose = vi.fn();
    render(<Probe active eventType="pointerdown" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('既定（eventType 未指定）は click のまま＝外側 pointerdown では閉じない', () => {
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("eventType='pointerdown' では document.body への pointerdown でも閉じる（dsk-0310 ガードは click 固有）", () => {
    const onClose = vi.fn();
    render(<Probe active eventType="pointerdown" onClose={onClose} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("eventType='pointerdown' でも Esc 閉じは従来どおり効く", () => {
    const onClose = vi.fn();
    render(<Probe active eventType="pointerdown" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * cmn-0217: Esc の意味論（「popover だけ閉じ、window 段の一括クローズへは届かない」）を assertion で固定する。
 * brd-0227 の統合で rte-toolbar / reaction-bar もこの挙動へ揃ったが、根拠が UI 証跡だけで
 * テストに無く、useEscapeConsume の stopPropagation を外しても静かに緑のままだった。
 */
describe('useOutsideClose — Esc のローカル消費（cmn-0217）', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(['click', 'pointerdown'] as const)(
    'eventType=%s: Esc は onClose を呼びつつ window 段のリスナーへは伝播しない',
    (eventType) => {
      const onClose = vi.fn();
      const onWindowKeyDown = vi.fn();
      window.addEventListener('keydown', onWindowKeyDown);
      try {
        render(<Probe active eventType={eventType} onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onWindowKeyDown).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('keydown', onWindowKeyDown);
      }
    },
  );

  it('Escape 以外のキーは消費せず window 段まで届く（遮断が Esc 限定であること）', () => {
    const onClose = vi.fn();
    const onWindowKeyDown = vi.fn();
    window.addEventListener('keydown', onWindowKeyDown);
    try {
      render(<Probe active onClose={onClose} />);
      fireEvent.keyDown(document, { key: 'a' });
      expect(onClose).not.toHaveBeenCalled();
      expect(onWindowKeyDown).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  });
});

/**
 * dsk-0397: 購読 effect の依存に onClose / refs が入っていると、呼び出し元（dsk-0397 当時は ToggleFilter /
 * DeskMemberPicker / useFilterPopover の 3 箇所）はいずれも inline arrow と inline 配列を渡すため、親の
 * 再レンダーごとに listener の解除・再登録が走る。latest-ref パターン（use-escape-consume と同型）
 * へ揃え、deps を [active] のみにして churn を止める。
 */
describe('useOutsideClose — 購読 churn（dsk-0397）', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('同一 active のまま親を再レンダーしても click listener が貼り直されない', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const { rerender } = render(<Probe active onClose={() => {}} />);

    const clickAddsAfterMount = addSpy.mock.calls.filter(([type]) => type === 'click').length;
    expect(clickAddsAfterMount).toBe(1);

    // 呼び出し元と同じ形（inline arrow + inline 配列）のまま再レンダーを繰り返す。
    rerender(<Probe active onClose={() => {}} />);
    rerender(<Probe active onClose={() => {}} />);

    const clickAddsAfterRerender = addSpy.mock.calls.filter(([type]) => type === 'click').length;
    expect(clickAddsAfterRerender).toBe(clickAddsAfterMount);
  });

  it('再レンダー後の外側 click では、差し替え後の最新の onClose が呼ばれる', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe active onClose={first} />);

    rerender(<Probe active onClose={second} />);
    fireEvent.click(screen.getByRole('button', { name: 'outside' }));

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('再レンダーで内側 ref の構成が変わっても、最新の refs で内外判定される', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Probe active onClose={onClose} />);

    // 単一 ref → 複数 ref（inside-2 が内側に加わる）へ差し替え。
    rerender(<Probe active multi onClose={onClose} />);
    fireEvent.click(screen.getByTestId('inside-2'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
