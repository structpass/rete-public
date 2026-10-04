import type { UserFavorite } from '@prisma/client';
import { toFavoriteDto } from './favorites.mapper';

function makeFavorite(overrides: Partial<UserFavorite> = {}): UserFavorite {
  const base = new Date('2026-06-01T00:00:00.000Z');
  return {
    id: 'fav-1',
    accountId: 'acc-1',
    kind: 'chat',
    targetRef: 'theme-1',
    label: 'ラベル',
    sortOrder: 3,
    createdAt: base,
    updatedAt: base,
    ...overrides,
  } as UserFavorite;
}

describe('toFavoriteDto', () => {
  it('表示用の最小集合だけを返し、内部列は落とす', () => {
    const dto = toFavoriteDto(makeFavorite());
    expect(dto).toEqual({ id: 'fav-1', kind: 'chat', targetRef: 'theme-1', label: 'ラベル' });
    expect(dto).not.toHaveProperty('accountId');
    expect(dto).not.toHaveProperty('sortOrder');
    expect(dto).not.toHaveProperty('createdAt');
  });

  it('kind 文字列を FavoriteKind として通す（4 種いずれも）', () => {
    for (const kind of ['system', 'chat', 'task', 'file'] as const) {
      expect(toFavoriteDto(makeFavorite({ kind })).kind).toBe(kind);
    }
  });
});
