import { toOrganizationDto } from './organizations.mapper';
import { makeOrganizationRow } from '../../__tests__/factories';

describe('organizations.mapper', () => {
  describe('toOrganizationDto', () => {
    it('DTO は id/name/sortOrder/archived/createdAt/updatedAt の 6 キーで archivedAt を漏らさない（§1 DTO 境界）', () => {
      const dto = toOrganizationDto(makeOrganizationRow());
      expect(Object.keys(dto).sort()).toEqual([
        'archived',
        'createdAt',
        'id',
        'name',
        'sortOrder',
        'updatedAt',
      ]);
      expect(dto).not.toHaveProperty('archivedAt');
    });

    it('archivedAt が null の場合 archived は false', () => {
      const dto = toOrganizationDto(makeOrganizationRow({ archivedAt: null }));
      expect(dto.archived).toBe(false);
    });

    it('archivedAt が非 null の場合 archived は true（archivedAt → archived: boolean への畳み込み）', () => {
      const dto = toOrganizationDto(
        makeOrganizationRow({ archivedAt: new Date('2026-05-01T00:00:00.000Z') }),
      );
      expect(dto.archived).toBe(true);
    });

    it('createdAt / updatedAt は Date から ISO 8601 文字列へ変換する', () => {
      const row = makeOrganizationRow({
        createdAt: new Date('2026-05-29T01:23:45.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      const dto = toOrganizationDto(row);
      expect(dto.createdAt).toBe('2026-05-29T01:23:45.000Z');
      expect(dto.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    });

    it('id / name / sortOrder はそのまま写す', () => {
      const row = makeOrganizationRow({ id: 'org-999', name: '本社', sortOrder: 5 });
      const dto = toOrganizationDto(row);
      expect(dto.id).toBe('org-999');
      expect(dto.name).toBe('本社');
      expect(dto.sortOrder).toBe(5);
    });
  });
});
