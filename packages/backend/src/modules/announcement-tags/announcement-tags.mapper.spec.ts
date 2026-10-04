import { toAnnouncementTagDto } from './announcement-tags.mapper';
// cmn-0040(E34): インライン factory を共有 factory へ集約。
import { makeAnnouncementTagEntity } from '../../__tests__/factories';

describe('toAnnouncementTagDto', () => {
  it('AnnouncementTag Entity から id/name/icon/color/archived のみを抜き出す（createdAt/updatedAt は載せない）', () => {
    const tag = makeAnnouncementTagEntity({ id: 'a1', name: '重要', icon: 'Star', color: 'red' });

    const dto = toAnnouncementTagDto(tag);

    expect(dto).toEqual({ id: 'a1', name: '重要', icon: 'Star', color: 'red', archived: false });
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
  });

  it('archivedAt が非 null なら archived: true を返す（hom-0083）', () => {
    const tag = makeAnnouncementTagEntity({ archivedAt: new Date('2026-07-01T00:00:00Z') });

    const dto = toAnnouncementTagDto(tag);

    expect(dto.archived).toBe(true);
  });
});
