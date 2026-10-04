import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { useRowHoverBand } from '../use-row-hover-band';

/**
 * jsdom は offsetTop/offsetHeight が常に 0 のため座標値は検証しない（brd-0205）。
 * 検証対象は bandStyle の null / 非 null＝帯の表示有無に限定する。
 */
function Probe({ leaveOnNoMatch }: { leaveOnNoMatch?: boolean }) {
  const { listRef, onMouseOver, onMouseLeave, bandStyle } = useRowHoverBand<HTMLDivElement>(
    '.row',
    'vertical',
    leaveOnNoMatch,
  );
  return (
    <div ref={listRef} onMouseOver={onMouseOver} onMouseLeave={onMouseLeave}>
      <div className="row" data-testid="row">
        row
      </div>
      <div className="not-row" data-testid="not-row">
        heading
      </div>
      {bandStyle ? <div data-testid="band" style={bandStyle} /> : null}
    </div>
  );
}

describe('useRowHoverBand (brd-0205)', () => {
  afterEach(cleanup);

  it('行にホバーすると帯が出る', () => {
    render(<Probe />);
    expect(screen.queryByTestId('band')).toBeNull();
    fireEvent.mouseOver(screen.getByTestId('row'));
    expect(screen.getByTestId('band')).toBeTruthy();
  });

  it('leaveOnNoMatch=true では非一致要素へ移ると帯が消える', () => {
    render(<Probe leaveOnNoMatch />);
    fireEvent.mouseOver(screen.getByTestId('row'));
    expect(screen.getByTestId('band')).toBeTruthy();
    fireEvent.mouseOver(screen.getByTestId('not-row'));
    expect(screen.queryByTestId('band')).toBeNull();
  });

  it('既定（leaveOnNoMatch=false）では非一致要素へ移っても最後の位置を保持する', () => {
    render(<Probe />);
    fireEvent.mouseOver(screen.getByTestId('row'));
    expect(screen.getByTestId('band')).toBeTruthy();
    fireEvent.mouseOver(screen.getByTestId('not-row'));
    expect(screen.getByTestId('band')).toBeTruthy();
  });

  it('コンテナから離れると帯が消える', () => {
    render(<Probe />);
    fireEvent.mouseOver(screen.getByTestId('row'));
    expect(screen.getByTestId('band')).toBeTruthy();
    fireEvent.mouseLeave(screen.getByTestId('row').parentElement as HTMLElement);
    expect(screen.queryByTestId('band')).toBeNull();
  });
});

/**
 * dsk-0398: 既存 4 ケースが未カバーだった 2 枝（axis='horizontal' の帯形状 / 初回 hover の
 * transition 抑制）を埋める。jsdom は offsetLeft/offsetWidth も常に 0 のため座標値そのものは
 * 検証せず、「どの CSS プロパティが載るか」を見る。
 */
function AxisProbe({ axis }: { axis: 'vertical' | 'horizontal' }) {
  const { listRef, onMouseOver, onMouseLeave, bandStyle } = useRowHoverBand<HTMLDivElement>(
    '.row',
    axis,
  );
  return (
    <div ref={listRef} onMouseOver={onMouseOver} onMouseLeave={onMouseLeave}>
      <div className="row" data-testid="row-1">
        row-1
      </div>
      <div className="row" data-testid="row-2">
        row-2
      </div>
      {bandStyle ? (
        <div data-testid="band" data-style={JSON.stringify(bandStyle)} style={bandStyle} />
      ) : null}
    </div>
  );
}

function bandStyleOf(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('band').getAttribute('data-style') as string);
}

describe('useRowHoverBand — axis と初回 transition 抑制（dsk-0398）', () => {
  afterEach(cleanup);

  it("axis='horizontal' の帯は width と横方向 translate3d を持ち、height を持たない", () => {
    render(<AxisProbe axis="horizontal" />);
    fireEvent.mouseOver(screen.getByTestId('row-1'));

    const style = bandStyleOf();
    expect(style).toHaveProperty('width');
    expect(style).not.toHaveProperty('height');
    expect(style.transform).toBe('translate3d(0px, 0, 0)');
  });

  it("axis='vertical' の帯は height と縦方向 translate3d を持ち、width を持たない（対の確認）", () => {
    render(<AxisProbe axis="vertical" />);
    fireEvent.mouseOver(screen.getByTestId('row-1'));

    const style = bandStyleOf();
    expect(style).toHaveProperty('height');
    expect(style).not.toHaveProperty('width');
    expect(style.transform).toBe('translate3d(0, 0px, 0)');
  });

  it('初回 hover では transition を切り、次の行へ移ると通常の transition に戻る', () => {
    render(<AxisProbe axis="vertical" />);

    // jsdom は offsetTop/offsetHeight が常に 0 で、hook は同一寸法の再測定を捨てる（前の rect を
    // そのまま返す）ため、行ごとに違う座標を与えないと 2 行目の hover が再描画に至らない。
    const row1 = screen.getByTestId('row-1');
    const row2 = screen.getByTestId('row-2');
    Object.defineProperty(row1, 'offsetTop', { value: 0, configurable: true });
    Object.defineProperty(row1, 'offsetHeight', { value: 40, configurable: true });
    Object.defineProperty(row2, 'offsetTop', { value: 40, configurable: true });
    Object.defineProperty(row2, 'offsetHeight', { value: 40, configurable: true });

    // 帯が最初に現れる瞬間は、前の位置が無いので滑らせない。
    fireEvent.mouseOver(row1);
    expect(bandStyleOf().transition).toBe('none');

    // 表示済みなので、以降の行移動は通常どおり滑らせる（transition 指定を外す）。
    fireEvent.mouseOver(row2);
    expect(bandStyleOf().transition).toBeUndefined();
    expect(bandStyleOf().transform).toBe('translate3d(0, 40px, 0)');
  });

  it("axis='horizontal' でも初回 hover のみ transition を切る（軸ごとに同じ抑制が効く）", () => {
    render(<AxisProbe axis="horizontal" />);

    const row1 = screen.getByTestId('row-1');
    const row2 = screen.getByTestId('row-2');
    Object.defineProperty(row1, 'offsetLeft', { value: 0, configurable: true });
    Object.defineProperty(row1, 'offsetWidth', { value: 60, configurable: true });
    Object.defineProperty(row2, 'offsetLeft', { value: 60, configurable: true });
    Object.defineProperty(row2, 'offsetWidth', { value: 60, configurable: true });

    fireEvent.mouseOver(row1);
    expect(bandStyleOf().transition).toBe('none');

    fireEvent.mouseOver(row2);
    expect(bandStyleOf().transition).toBeUndefined();
    expect(bandStyleOf().transform).toBe('translate3d(60px, 0, 0)');
  });
});
