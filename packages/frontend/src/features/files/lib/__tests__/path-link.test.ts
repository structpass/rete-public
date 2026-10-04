import { describe, it, expect } from 'vitest';
import {
  buildLinks,
  buildSearchLinks,
  truncateLinks,
  buildShareDescription,
  PATH_SEP,
} from '../path-link';
import type { FileItem, PathLink, SearchResultItem, TreeNode } from '../types';

const crumb = [
  { id: 'f-chuo', name: '中央倉庫PJ' },
  { id: 'f-ukeire', name: '受入オペレーション' },
  { id: 'f-zaiko', name: '在庫アラート検討' },
];

describe('buildLinks', () => {
  it('フォルダはフルパス・ファイルは親 ＞ 名 のパスを持つ', () => {
    const items: FileItem[] = [
      { kind: 'folder', name: '議事録', updatedBy: 'admin', updatedAt: '' },
      { kind: 'file', name: 'メモ.md', updatedBy: 'admin', updatedAt: '' },
    ];
    const links = buildLinks(crumb, items);
    expect(links[0]).toEqual<PathLink>({
      kind: 'folder',
      label: 'フォルダ',
      path: `中央倉庫PJ${PATH_SEP}受入オペレーション${PATH_SEP}在庫アラート検討${PATH_SEP}議事録`,
    });
    expect(links[1].label).toBe('ファイル');
    expect(links[1].path.endsWith(`在庫アラート検討${PATH_SEP}メモ.md`)).toBe(true);
  });

  it('上位が見えないユーザーの crumb（途中開始）は、渡された範囲だけでパスを組む（fil-0105 項目5）', () => {
    // backend は最初の非可視祖先で crumb を打ち切る（fil-0099）。root から始まらない crumb が来ても
    // 省略記号などを足さず、見える範囲だけを連結するのが仕様（足すと非可視の上位の存在が漏れる）。
    const partialCrumb = crumb.slice(1);
    const links = buildLinks(partialCrumb, [
      { kind: 'file', name: 'メモ.md', updatedBy: 'admin', updatedAt: '' },
    ]);
    expect(links[0].path).toBe(`受入オペレーション${PATH_SEP}在庫アラート検討${PATH_SEP}メモ.md`);
    expect(links[0].path.startsWith('中央倉庫PJ')).toBe(false);
  });
});

describe('buildSearchLinks (fil-0051)', () => {
  // フラット前順リスト + level。中央倉庫PJ > 受入 と 中央倉庫PJ > 出荷 の 2 系統。
  const tree: TreeNode[] = [
    { fid: 'f-chuo', level: 0, name: '中央倉庫PJ' },
    { fid: 'f-ukeire', level: 1, name: '受入' },
    { fid: 'f-shukka', level: 1, name: '出荷' },
  ];

  it('各項目の所属フォルダ（parentFolderId）からフルパスを引いて組む（現在地パンくず非依存）', () => {
    const items: SearchResultItem[] = [
      { kind: 'file', id: 'a', name: 'メモ.md', parentFolderId: 'f-ukeire' },
      { kind: 'file', id: 'b', name: '手順.pdf', parentFolderId: 'f-shukka' },
    ];
    const links = buildSearchLinks(tree, items);
    expect(links[0].path).toBe(`中央倉庫PJ${PATH_SEP}受入${PATH_SEP}メモ.md`);
    expect(links[1].path).toBe(`中央倉庫PJ${PATH_SEP}出荷${PATH_SEP}手順.pdf`);
    expect(links[1].label).toBe('ファイル');
  });

  it('parentFolderId が null（ルート直下ファイル）はフォルダ prefix なしで名前のみ', () => {
    const items: SearchResultItem[] = [
      { kind: 'file', id: 'r', name: 'root.txt', parentFolderId: null },
    ];
    expect(buildSearchLinks(tree, items)[0].path).toBe('root.txt');
  });

  it('フォルダヒットは自身のフルパス・ラベルはフォルダ', () => {
    const items: SearchResultItem[] = [
      { kind: 'folder', id: 'f-ukeire', name: '受入', parentFolderId: 'f-chuo' },
    ];
    const link = buildSearchLinks(tree, items)[0];
    expect(link.label).toBe('フォルダ');
    expect(link.path).toBe(`中央倉庫PJ${PATH_SEP}受入`);
  });
});

describe('truncateLinks', () => {
  const links: PathLink[] = Array.from({ length: 12 }, (_, i) => ({
    kind: 'file',
    label: 'ファイル',
    path: `p${i}`,
  }));
  it('上限まで表示し超過件数を返す', () => {
    const { shown, overflow } = truncateLinks(links, 10);
    expect(shown).toHaveLength(10);
    expect(overflow).toBe(2);
  });
  it('上限以下は超過 0', () => {
    const { shown, overflow } = truncateLinks(links.slice(0, 3), 10);
    expect(shown).toHaveLength(3);
    expect(overflow).toBe(0);
  });
});

describe('buildShareDescription', () => {
  const paths = ['中央倉庫PJ ＞ 受入 ＞ メモ.md', '中央倉庫PJ ＞ 出荷 ＞ 手順.pdf'];

  it('各パスを <p> で包み、自由記述（Tiptap HTML）はそのまま後続に連結する', () => {
    expect(buildShareDescription(paths, '<p>確認お願いします</p>')).toBe(
      '<p>中央倉庫PJ ＞ 受入 ＞ メモ.md</p><p>中央倉庫PJ ＞ 出荷 ＞ 手順.pdf</p><p>確認お願いします</p>',
    );
  });

  it('自由記述が空文字ならパスのみ（空判定は呼び出し側の isRichTextEmpty が担う）', () => {
    expect(buildShareDescription(paths, '')).toBe(
      '<p>中央倉庫PJ ＞ 受入 ＞ メモ.md</p><p>中央倉庫PJ ＞ 出荷 ＞ 手順.pdf</p>',
    );
  });

  it('パスが空なら自由記述 HTML のみ', () => {
    expect(buildShareDescription([], '<p>本文だけ</p>')).toBe('<p>本文だけ</p>');
  });

  it('自由記述のリッチ書式（複数段落・リスト）はそのまま保持する', () => {
    expect(buildShareDescription([], '<p>一行目</p><ul><li>項目</li></ul>')).toBe(
      '<p>一行目</p><ul><li>項目</li></ul>',
    );
  });

  it('パスは literal 文字列としてエスケープする（自由記述は多層 sanitize に委ねる）', () => {
    // 自由記述 HTML は本関数で再エスケープしない。悪意ある HTML は送信先の
    // backend sanitizeRichText + 描画時 RichTextView の DOMPurify allow-list で除去される
    // （ADR 0019 多層防御・security-reviewer 2026-06-16 で全経路 sanitize を確認）。
    expect(buildShareDescription(['a<b>&"c'], '')).toBe('<p>a&lt;b&gt;&amp;&quot;c</p>');
  });

  it('両方空なら空文字', () => {
    expect(buildShareDescription([], '')).toBe('');
  });
});
