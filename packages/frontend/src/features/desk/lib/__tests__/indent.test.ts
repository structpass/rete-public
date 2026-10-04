import { describe, it, expect } from 'vitest';
import { clampIndent, levelFromClass, indentRenderAttrs, MAX_INDENT } from '../indent';

describe('indent helpers（rete-desk-0063）', () => {
  describe('clampIndent', () => {
    it('0 以下・非数値は 0 に丸める', () => {
      expect(clampIndent(0)).toBe(0);
      expect(clampIndent(-3)).toBe(0);
      expect(clampIndent('abc')).toBe(0);
      expect(clampIndent(undefined)).toBe(0);
      expect(clampIndent(null)).toBe(0);
    });
    it('MAX_INDENT を超える値は MAX に丸める', () => {
      expect(clampIndent(MAX_INDENT + 2)).toBe(MAX_INDENT);
      expect(clampIndent(99)).toBe(MAX_INDENT);
    });
    it('範囲内はそのまま（小数は floor）', () => {
      expect(clampIndent(1)).toBe(1);
      expect(clampIndent(3)).toBe(3);
      expect(clampIndent(2.9)).toBe(2);
    });
  });

  describe('levelFromClass', () => {
    it('desk-indent-N を抽出する', () => {
      expect(levelFromClass('desk-indent-1')).toBe(1);
      expect(levelFromClass('foo desk-indent-3 bar')).toBe(3);
    });
    it('該当 class が無ければ 0', () => {
      expect(levelFromClass('')).toBe(0);
      expect(levelFromClass(null)).toBe(0);
      expect(levelFromClass('other-class')).toBe(0);
    });
    it('部分一致（desk-indent-12 等）に誤反応しない範囲で 1 桁を読む', () => {
      // desk-indent-5 まで前提。1 桁数値のみ対象。
      expect(levelFromClass('desk-indent-5')).toBe(5);
    });
  });

  describe('indentRenderAttrs', () => {
    it('0 は class を付けない', () => {
      expect(indentRenderAttrs(0)).toEqual({});
    });
    it('1〜MAX は desk-indent-N を返す', () => {
      expect(indentRenderAttrs(1)).toEqual({ class: 'desk-indent-1' });
      expect(indentRenderAttrs(MAX_INDENT)).toEqual({ class: `desk-indent-${MAX_INDENT}` });
    });
    it('範囲外は clamp して返す', () => {
      expect(indentRenderAttrs(99)).toEqual({ class: `desk-indent-${MAX_INDENT}` });
      expect(indentRenderAttrs(-1)).toEqual({});
    });
  });
});
