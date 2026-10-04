import { describe, it, expect } from 'vitest';
import { computeFlipPosition } from '../compute-flip-position';

// viewport を引数で渡し window 非依存で境界を検証する（dsk-0369）。
const VIEWPORT = { width: 1280, height: 800 };
const SIZE = { width: 240, height: 290 };
const OPTS = { preferAbove: true, margin: 8, gap: 6 };

function rect(left: number, top: number, height = 24) {
  return { left, top, bottom: top + height };
}

describe('computeFlipPosition', () => {
  it('(a) 上に収まる → anchor 上に gap を空けて出す', () => {
    const r = rect(100, 400);
    const { left, top } = computeFlipPosition(r, SIZE, OPTS, VIEWPORT);
    expect(left).toBe(100);
    expect(top).toBe(400 - 6 - 290); // anchor.top - gap - height
  });

  it('(b) 上に収まらず下に収まる → 下へフリップ', () => {
    const r = rect(100, 50); // above = 50-6-290 < margin
    const { top } = computeFlipPosition(r, SIZE, OPTS, VIEWPORT);
    expect(top).toBe(50 + 24 + 6); // anchor.bottom + gap
  });

  it('(c) 上下どちらも無理 → 下端寄せへクランプ', () => {
    const shortViewport = { width: 1280, height: 200 }; // 290px は上下どちらにも入らない
    const r = rect(100, 100);
    const { top } = computeFlipPosition(r, SIZE, OPTS, shortViewport);
    expect(top).toBe(Math.max(8, 200 - 8 - 290)); // = margin(8) 側に clamp
  });

  it('(d) 右端を越える → 内側へ寄せる（left + w <= vw - margin）', () => {
    const r = rect(1200, 400);
    const { left } = computeFlipPosition(r, SIZE, OPTS, VIEWPORT);
    expect(left).toBe(1280 - 8 - 240);
  });

  it('(d) 左端を割る → margin へクランプ', () => {
    const r = rect(-20, 400);
    const { left } = computeFlipPosition(r, SIZE, OPTS, VIEWPORT);
    expect(left).toBe(8);
  });

  it('(e) preferAbove:false は下優先の対称挙動（下に収まれば下）', () => {
    const r = rect(100, 400);
    const { top } = computeFlipPosition(r, SIZE, { ...OPTS, preferAbove: false }, VIEWPORT);
    expect(top).toBe(400 + 24 + 6); // 上にも入るが下優先
  });

  it('(e) preferAbove:false で下に収まらなければ上へフリップ', () => {
    const r = rect(100, 700); // below = 724+6, +290 > 800-8
    const { top } = computeFlipPosition(r, SIZE, { ...OPTS, preferAbove: false }, VIEWPORT);
    expect(top).toBe(700 - 6 - 290);
  });

  it('gap/margin は引数で吸収される（mention の gap:4 相当）', () => {
    const r = rect(100, 400);
    const { top } = computeFlipPosition(
      r,
      SIZE,
      { preferAbove: true, margin: 8, gap: 4 },
      VIEWPORT,
    );
    expect(top).toBe(400 - 4 - 290);
  });
});
