import { describe, it, expect } from 'vitest';
import { buildManifest, findTheme, MODEL_CATEGORIES } from '../manifest';
import { MODEL_THEMES } from '../../content';
import { DEMOS } from '../../components/demos';
import type { ModelTheme, ThemeExample } from '../../types';

const theme = (id: string, category: ModelTheme['category']): ModelTheme => ({
  id,
  title: id,
  category,
  status: 'active',
  summary: '',
  sources: [],
  purpose: '',
  spec: [],
});

describe('buildManifest', () => {
  it('カテゴリ順（MODEL_CATEGORIES）でグルーピングする', () => {
    const themes = [theme('b', 'naming'), theme('a', 'ui')];
    const groups = buildManifest(themes);
    expect(groups.map((g) => g.category.key)).toEqual(['ui', 'naming']);
  });

  it('テーマ 0 件のカテゴリは出さない', () => {
    const groups = buildManifest([theme('a', 'ui')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category.key).toBe('ui');
  });

  it('カテゴリ内はテーマ配列の登録順を保つ', () => {
    const themes = [theme('a', 'ui'), theme('b', 'ui')];
    const groups = buildManifest(themes);
    expect(groups[0].themes.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('findTheme', () => {
  it('id でテーマを引く', () => {
    const themes = [theme('a', 'ui')];
    expect(findTheme(themes, 'a')?.id).toBe('a');
  });

  it('null / 未知 id は null', () => {
    expect(findTheme([theme('a', 'ui')], null)).toBeNull();
    expect(findTheme([theme('a', 'ui')], 'zzz')).toBeNull();
  });
});

describe('MODEL_THEMES（正本データ整合）', () => {
  it('id は全テーマで一意', () => {
    const ids = MODEL_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全テーマの category は MODEL_CATEGORIES のいずれか', () => {
    const valid = new Set(MODEL_CATEGORIES.map((c) => c.key));
    expect(MODEL_THEMES.every((t) => valid.has(t.category))).toBe(true);
  });

  it('全カテゴリ（MODEL_CATEGORIES）すべてに 1 件以上テーマがある', () => {
    const groups = buildManifest(MODEL_THEMES);
    expect(groups).toHaveLength(MODEL_CATEGORIES.length);
  });
});

describe('実描画見本の必須化（mdl-0011）', () => {
  /** UI デザイン系カテゴリ = 正例/悪例に実描画見本（イメージ）必須（開発統括指示 2026-07-02）。 */
  const VISUAL_CATEGORIES = new Set<ModelTheme['category']>(['ui', 'ui-component']);

  const exampleItems = (t: ModelTheme): ThemeExample[] => [
    ...(t.examples?.good ?? []),
    ...(t.examples?.bad ?? []),
  ];

  it('UI系 active テーマの正例/悪例は全項目 demo（実描画見本）付き', () => {
    const targets = MODEL_THEMES.filter(
      (t) => VISUAL_CATEGORIES.has(t.category) && t.status === 'active' && t.examples,
    );
    for (const t of targets) {
      for (const ex of exampleItems(t)) {
        const hasDemo = typeof ex !== 'string' && !!ex.demo;
        expect(
          hasDemo,
          `${t.id} の例に実描画見本が無い: 「${typeof ex === 'string' ? ex : ex.text}」`,
        ).toBe(true);
      }
    }
  });

  it('参照されている demo キーはすべて registry（DEMOS）に実在する', () => {
    for (const t of MODEL_THEMES) {
      const keys: string[] = [];
      for (const blocks of [t.spec, t.behavior ?? [], t.design ?? []]) {
        for (const b of blocks) if (b.type === 'demo') keys.push(b.demo);
      }
      for (const ex of exampleItems(t)) {
        if (typeof ex !== 'string' && ex.demo) keys.push(ex.demo);
      }
      for (const key of keys) {
        expect(DEMOS[key], `${t.id} が未登録の demo キーを参照: ${key}`).toBeDefined();
      }
    }
  });
});
