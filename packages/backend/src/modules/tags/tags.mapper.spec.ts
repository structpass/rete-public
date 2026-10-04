import { toTagDto } from './tags.mapper';
import { makeTagEntity } from '../../__tests__/factories';

describe('toTagDto', () => {
  it('Tag Entity から id/name/icon/color/archived のみを抜き出す（createdAt/updatedAt は載せない）', () => {
    const tag = makeTagEntity({ id: 't1', name: '重要', icon: 'Star', color: 'red' });

    const dto = toTagDto(tag);

    expect(dto).toEqual({ id: 't1', name: '重要', icon: 'Star', color: 'red', archived: false });
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
  });

  it('archivedAt 非 null は archived: true に畳む（生の archivedAt は公開しない・fil-0094）', () => {
    const tag = makeTagEntity({ id: 't1', archivedAt: new Date('2026-07-01T00:00:00Z') });

    const dto = toTagDto(tag);

    expect(dto.archived).toBe(true);
    expect(dto).not.toHaveProperty('archivedAt');
  });
});
