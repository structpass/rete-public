import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageTitle } from '../page-title';

describe('PageTitle', () => {
  it('タイトルを h2 見出しとして描画する', () => {
    render(<PageTitle title="掲示板" />);
    const heading = screen.getByRole('heading', { level: 2, name: '掲示板' });
    expect(heading).toBeInTheDocument();
    expect(heading.className).toContain('text-xl');
    expect(heading.className).toContain('font-semibold');
  });

  it('description を渡すと同一行の補足説明を描画する', () => {
    render(<PageTitle title="メンバー" description="テナントに所属するアカウントを管理します" />);
    expect(screen.getByText('テナントに所属するアカウントを管理します')).toBeInTheDocument();
  });

  it('description を渡さない時は補足説明の span を描画しない', () => {
    const { container } = render(<PageTitle title="ファイル" />);
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });

  it('after を渡すとタイトル右隣に描画する', () => {
    render(<PageTitle title="画面タイトル" after={<span data-testid="badge">整備中</span>} />);
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });

  it('className をラッパへ結合する（ホームの shrink-0 用途）', () => {
    const { container } = render(<PageTitle title="掲示板" className="shrink-0" />);
    expect((container.firstChild as HTMLElement).className).toContain('shrink-0');
  });
});
