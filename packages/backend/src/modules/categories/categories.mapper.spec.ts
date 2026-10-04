import { makeCategoryEntity } from '../../__tests__/factories';
import { toCategoryResponse } from './categories.mapper';

describe('categories.mapper', () => {
  describe('toCategoryResponse', () => {
    it('Category の主要フィールドを DTO に写すこと', () => {
      const dto = toCategoryResponse(makeCategoryEntity());
      expect(dto.id).toBe(1);
      expect(dto.name).toBe('入荷');
      expect(dto.sortOrder).toBe(0);
    });

    it('Date 系フィールドを ISO 8601 文字列に変換すること', () => {
      const dto = toCategoryResponse(
        makeCategoryEntity({
          createdAt: new Date('2026-05-29T01:23:45.000Z'),
          updatedAt: new Date('2026-05-29T09:00:00.000Z'),
        }),
      );
      expect(dto.createdAt).toBe('2026-05-29T01:23:45.000Z');
      expect(dto.updatedAt).toBe('2026-05-29T09:00:00.000Z');
      expect(typeof dto.createdAt).toBe('string');
    });

    it('sortOrder の値を保持すること', () => {
      const dto = toCategoryResponse(makeCategoryEntity({ sortOrder: 5 }));
      expect(dto.sortOrder).toBe(5);
    });
  });
});
