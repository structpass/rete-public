import { describe, it, expect } from 'vitest';
import { stepIndex, nearestIndexByCenter } from '../lib/keyboard-nav';

/**
 * Desk キーボードナビの純粋ヘルパー。
 * モック desk/index.html の ↑↓ edge-stop / ←→ 最近傍（getBoundingClientRect 中心の縦距離最小）を移植。
 */
describe('stepIndex — ↑↓/Tab の edge-stop index 計算', () => {
  it('下移動（delta=+1）で次の index を返す', () => {
    expect(stepIndex(5, 1, 1)).toBe(2);
  });

  it('上移動（delta=-1）で前の index を返す', () => {
    expect(stepIndex(5, 3, -1)).toBe(2);
  });

  it('末尾で下移動すると null（wrap しない / edge-stop）', () => {
    expect(stepIndex(5, 4, 1)).toBeNull();
  });

  it('先頭で上移動すると null（wrap しない / edge-stop）', () => {
    expect(stepIndex(5, 0, -1)).toBeNull();
  });

  it('現在 index が見つからない（-1）場合は null', () => {
    expect(stepIndex(5, -1, 1)).toBeNull();
  });

  it('要素が空（length=0）なら null', () => {
    expect(stepIndex(0, -1, 1)).toBeNull();
  });
});

describe('nearestIndexByCenter — ←→ の縦中心が最も近い候補', () => {
  it('source の中心に最も近い候補の index を返す', () => {
    // source 中心 100、候補中心 [20, 90, 160] → 90（index 1）が最近傍
    expect(nearestIndexByCenter(100, [20, 90, 160])).toBe(1);
  });

  it('距離が同点なら先に出現した候補（index 小）を採る', () => {
    // source 100、候補 [80, 120] はどちらも距離 20 → 先頭 index 0
    expect(nearestIndexByCenter(100, [80, 120])).toBe(0);
  });

  it('候補が 1 件ならその index 0', () => {
    expect(nearestIndexByCenter(100, [9999])).toBe(0);
  });

  it('候補が空なら null', () => {
    expect(nearestIndexByCenter(100, [])).toBeNull();
  });
});
