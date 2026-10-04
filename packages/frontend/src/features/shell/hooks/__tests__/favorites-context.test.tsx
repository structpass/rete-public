import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { FavoriteDto } from '@rete/shared';

// favorites-api をモックし、Provider が「1 回取得して複数の子へ同一 state を共有する」ことを検証する。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchFavorites, addFavorite, removeFavorite, reorderFavorites } = vi.hoisted(() => ({
  fetchFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  reorderFavorites: vi.fn(),
}));

vi.mock('../../lib/favorites-api', () => ({
  fetchFavorites: (...a: unknown[]) => fetchFavorites(...a),
  addFavorite: (...a: unknown[]) => addFavorite(...a),
  removeFavorite: (...a: unknown[]) => removeFavorite(...a),
  reorderFavorites: (...a: unknown[]) => reorderFavorites(...a),
}));

import { FavoritesProvider, useFavoritesContext } from '../favorites-context';

function fav(id: string): FavoriteDto {
  return { id, kind: 'chat', targetRef: `ref-${id}`, label: id };
}

function List({ testid }: { testid: string }) {
  const { items, loading } = useFavoritesContext();
  return <div data-testid={testid}>{loading ? 'loading' : items.map((f) => f.id).join(',')}</div>;
}

function AddButton() {
  const { add } = useFavoritesContext();
  return (
    <button onClick={() => void add({ kind: 'chat', targetRef: 'ref-c', label: 'c' })}>追加</button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchFavorites.mockResolvedValue([fav('a'), fav('b')]);
});

describe('FavoritesProvider / useFavoritesContext', () => {
  it('1 回だけ取得し複数の子へ同一 state を供給する', async () => {
    render(
      <FavoritesProvider>
        <List testid="x" />
        <List testid="y" />
      </FavoritesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('x')).toHaveTextContent('a,b'));
    expect(screen.getByTestId('y')).toHaveTextContent('a,b');
    expect(fetchFavorites).toHaveBeenCalledTimes(1);
  });

  it('ある子からの add が他の子へ即時反映される（共有 state）', async () => {
    render(
      <FavoritesProvider>
        <List testid="x" />
        <AddButton />
      </FavoritesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('x')).toHaveTextContent('a,b'));

    addFavorite.mockResolvedValue(fav('c'));
    fetchFavorites.mockResolvedValueOnce([fav('a'), fav('b'), fav('c')]);
    fireEvent.click(screen.getByText('追加'));

    await waitFor(() => expect(screen.getByTestId('x')).toHaveTextContent('a,b,c'));
  });

  it('Provider 外で useFavoritesContext を使うと throw する', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<List testid="z" />)).toThrow();
    spy.mockRestore();
  });
});
