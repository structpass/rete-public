import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchResults } from '../components/search-results';
import type { SearchResultItem, TreeNode } from '../lib/types';

/**
 * fil-0065: 横断検索結果一覧（名前列）の検索語ハイライト。
 * - keyword 指定時、名前列の一致箇所を sp-search-hl でハイライトする。
 * - keyword 未指定/空はハイライトなし（従来表示のまま）。
 */

const tree: TreeNode[] = [];
const fileA: SearchResultItem = {
  kind: 'file',
  id: 'file-1',
  name: 'report.pdf',
  parentFolderId: 'fld-1',
};

function renderComp(keyword?: string) {
  return render(
    <SearchResults
      results={[fileA]}
      tree={tree}
      loading={false}
      error={false}
      errorText="err"
      emptyText="empty"
      onNavigate={() => {}}
      keyword={keyword}
    />,
  );
}

describe('SearchResults — 検索ハイライト（fil-0065）', () => {
  it('keyword 指定時は名前列の一致箇所を sp-search-hl でハイライトする', () => {
    const { container } = renderComp('report');
    const nameCell = container.querySelector('.file-name-cell')!;
    const marks = nameCell.querySelectorAll('mark.sp-search-hl');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('report');
  });

  it('keyword 未指定はハイライトせず通常表示のまま', () => {
    const { container } = renderComp();
    expect(container.querySelector('.file-name-cell mark')).toBeNull();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  it('keyword が空文字はハイライトしない', () => {
    const { container } = renderComp('');
    expect(container.querySelector('.file-name-cell mark')).toBeNull();
  });
});
