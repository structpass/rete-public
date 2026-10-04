import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from '../pagination';

describe('Pagination', () => {
  it('ナビハンドラを1つも渡さない画面（全件表示のみ）はナビボタンを描画しない', () => {
    render(<Pagination total="全 12 件" />);
    expect(screen.getByText('全 12 件')).toBeInTheDocument();
    expect(screen.queryByLabelText('ページ切り替え')).not.toBeInTheDocument();
  });

  it('ナビハンドラを渡した画面はナビボタンを描画する', () => {
    render(
      <Pagination
        total="全 1,000 件"
        pageLabel="2 / 20 page"
        onFirst={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onLast={vi.fn()}
        canPrev
        canNext
      />,
    );
    expect(screen.getByLabelText('ページ切り替え')).toBeInTheDocument();
    expect(screen.getByText('2 / 20 page')).toBeInTheDocument();
  });

  it('canPrev/canNext が false の時は対応するボタンを disabled にする', () => {
    render(
      <Pagination
        total="全 1,000 件"
        onFirst={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onLast={vi.fn()}
        canPrev={false}
        canNext={false}
      />,
    );
    expect(screen.getByLabelText('先頭ページ')).toBeDisabled();
    expect(screen.getByLabelText('前のページ')).toBeDisabled();
    expect(screen.getByLabelText('次のページ')).toBeDisabled();
    expect(screen.getByLabelText('最終ページ')).toBeDisabled();
  });

  it('pageLabel を空文字で渡すと(0件時)ページ数表示を出さない', () => {
    render(<Pagination total="全 0 件" pageLabel="" />);
    expect(screen.getByText('全 0 件')).toBeInTheDocument();
    expect(screen.queryByText(/page/)).not.toBeInTheDocument();
  });

  it('pageLabel を省略すると既定の "1 / 1 page" になる（静的一覧の既定挙動）', () => {
    render(<Pagination total="全 5 件" />);
    expect(screen.getByText('1 / 1 page')).toBeInTheDocument();
  });
});
