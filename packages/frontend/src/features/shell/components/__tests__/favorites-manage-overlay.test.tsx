import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { FavoriteDto } from '@rete/shared';
import { FavoritesManageOverlay } from '../favorites-manage-overlay';

const items: FavoriteDto[] = [
  { id: 'f1', kind: 'file', targetRef: 'r1', label: '資料', sortOrder: 0 } as FavoriteDto,
  { id: 'f2', kind: 'chat', targetRef: 'r2', label: '雑談', sortOrder: 1 } as FavoriteDto,
];

const remove = vi.fn();
const reorder = vi.fn();

function renderOverlay(
  override: Partial<React.ComponentProps<typeof FavoritesManageOverlay>> = {},
) {
  return render(
    <FavoritesManageOverlay
      open
      onClose={vi.fn()}
      items={items}
      loading={false}
      error={null}
      remove={remove}
      reorder={reorder}
      {...override}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('FavoritesManageOverlay 並び替え (hom-0129)', () => {
  it('各行にドラッグ用グリップがある', () => {
    renderOverlay();
    expect(screen.getByLabelText('資料 を並び替え')).toBeTruthy();
    expect(screen.getByLabelText('雑談 を並び替え')).toBeTruthy();
  });

  it('↑↓ ボタンは廃止されている（グリップ D&D へ一本化）', () => {
    renderOverlay();
    expect(screen.queryByLabelText('資料 を上へ')).toBeNull();
    expect(screen.queryByLabelText('資料 を下へ')).toBeNull();
    expect(screen.queryByLabelText('雑談 を上へ')).toBeNull();
    expect(screen.queryByLabelText('雑談 を下へ')).toBeNull();
  });

  it('削除ボタンは各行に残る', () => {
    renderOverlay();
    expect(screen.getByLabelText('資料 を削除')).toBeTruthy();
    expect(screen.getByLabelText('雑談 を削除')).toBeTruthy();
  });

  it('削除は remove を呼ぶ（D&D 化で既存操作が退行しない）', async () => {
    remove.mockResolvedValue(undefined);
    renderOverlay();
    fireEvent.click(screen.getByLabelText('資料 を削除'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('f1'));
  });

  it('空状態では一覧を出さずメッセージを表示する', () => {
    renderOverlay({ items: [] });
    expect(screen.getByText('お気に入りはまだありません')).toBeTruthy();
    expect(screen.queryByLabelText('資料 を並び替え')).toBeNull();
  });

  it('追加フォーム（種別/ラベル/追加ボタン）は表示されない（hom-0137）', () => {
    renderOverlay();
    expect(screen.queryByLabelText('種別')).toBeNull();
    expect(screen.queryByLabelText('ラベル')).toBeNull();
    expect(screen.queryByRole('button', { name: '追加' })).toBeNull();
  });
});
