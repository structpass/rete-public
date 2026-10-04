import { describe, it, expect } from 'vitest';
import { sortItems } from '../sort';
import type { FileItem } from '../types';

const items: FileItem[] = [
  { kind: 'file', name: 'b.md', updatedBy: '林 拓也', updatedAt: '2026/05/02 14:30' },
  { kind: 'folder', name: 'あ資料', updatedBy: 'admin', updatedAt: '2026/04/12 09:14' },
  { kind: 'file', name: 'a.md', updatedBy: 'admin', updatedAt: '2026/05/07 11:45' },
];

describe('sortItems（既定 = sortKey null）', () => {
  it('フォルダ優先 → 更新日降順', () => {
    const r = sortItems(items, null, 'asc');
    expect(r[0].kind).toBe('folder');
    // ファイルは updatedAt 降順（a.md=05/07 が b.md=05/02 より先）
    expect(r[1].name).toBe('a.md');
    expect(r[2].name).toBe('b.md');
  });
  it('元配列を破壊しない', () => {
    const copy = [...items];
    sortItems(items, null, 'asc');
    expect(items).toEqual(copy);
  });
});

describe('sortItems（列指定）', () => {
  it('name 昇順（ja: ラテン文字 → ひらがな）', () => {
    const r = sortItems(items, 'name', 'asc');
    expect(r.map((i) => i.name)).toEqual(['a.md', 'b.md', 'あ資料']);
  });
  it('name 降順は昇順の逆', () => {
    const asc = sortItems(items, 'name', 'asc').map((i) => i.name);
    const desc = sortItems(items, 'name', 'desc').map((i) => i.name);
    expect(desc).toEqual([...asc].reverse());
  });
  it('updatedBy（更新者）でソートできる', () => {
    const r = sortItems(items, 'updatedBy', 'asc');
    expect(r[0].updatedBy).toBe('admin');
  });
});
