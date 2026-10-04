import { describe, it, expect } from 'vitest';
import { buildFileRows } from '../rows';
import type { FileItem } from '../types';

const item = (name: string, kind: 'folder' | 'file' = 'file', updatedAt = ''): FileItem => ({
  kind,
  name,
  updatedBy: '',
  updatedAt,
});

describe('buildFileRows', () => {
  const items: FileItem[] = [
    item('議事録.md', 'file', '2026-06-01'),
    item('在庫', 'folder', '2026-06-02'),
    item('入荷検品.md', 'file', '2026-06-03'),
  ];

  it('sortKey=null はフォルダ優先 → 更新日降順で並べる', () => {
    const rows = buildFileRows(items, null, 'asc', '');
    expect(rows.map((r) => r.item.name)).toEqual(['在庫', '入荷検品.md', '議事録.md']);
  });

  it('srcIndex は元配列上の位置を保持する（D&D 用）', () => {
    const rows = buildFileRows(items, null, 'asc', '');
    const folderRow = rows.find((r) => r.item.kind === 'folder');
    expect(folderRow?.srcIndex).toBe(1);
  });

  it('検索は name 部分一致（大文字小文字無視）で絞り込む', () => {
    const rows = buildFileRows(items, null, 'asc', '入荷');
    expect(rows.map((r) => r.item.name)).toEqual(['入荷検品.md']);
  });

  it('検索が空なら全件返す', () => {
    expect(buildFileRows(items, null, 'asc', '   ')).toHaveLength(3);
  });

  it('name 昇順/降順指定で並べ替えする', () => {
    const ascii: FileItem[] = [item('banana.md'), item('apple.md'), item('cherry.md')];
    expect(buildFileRows(ascii, 'name', 'asc', '').map((r) => r.item.name)).toEqual([
      'apple.md',
      'banana.md',
      'cherry.md',
    ]);
    expect(buildFileRows(ascii, 'name', 'desc', '').map((r) => r.item.name)).toEqual([
      'cherry.md',
      'banana.md',
      'apple.md',
    ]);
  });
});
