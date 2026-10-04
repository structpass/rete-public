import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RichTextView } from '../components/rich-text-view';

describe('RichTextView', () => {
  it('sanitize した HTML を描画する（script は除去）', () => {
    const { container } = render(
      <RichTextView html="<p><strong>hi</strong></p><script>alert(1)</script>" />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.textContent).toContain('hi');
  });

  it('空 / null は何も描画しない', () => {
    const { container } = render(<RichTextView html={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('className を反映する', () => {
    const { container } = render(
      <RichTextView html="<p>x</p>" className="desk-thread-head-body" />,
    );
    expect((container.firstChild as HTMLElement)?.className).toContain('desk-thread-head-body');
  });

  it('highlight 指定時に本文の一致箇所を mark.sp-search-hl で包む（rete-desk-0048）', () => {
    const { container } = render(<RichTextView html="<p>在庫の確認</p>" highlight="在庫" />);
    const mark = container.querySelector('mark.sp-search-hl');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('在庫');
    expect(container.textContent).toBe('在庫の確認'); // テキスト全体は不変
  });

  it('highlight 未指定なら mark を挿入しない', () => {
    const { container } = render(<RichTextView html="<p>在庫の確認</p>" />);
    expect(container.querySelector('mark.sp-search-hl')).toBeNull();
  });
});
