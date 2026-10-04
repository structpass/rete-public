import { makeTenantEntity, makeTenantSystemEntity } from '../../__tests__/factories';
import { toTenantResponse, toTenantSystemResponse } from './settings.mapper';
import { DEFAULT_TENANT_BADGE_COLOR, DEFAULT_TENANT_NAME } from './settings.constants';

describe('settings.mapper', () => {
  describe('toTenantResponse', () => {
    it('Tenant の主要フィールドを DTO に写すこと', () => {
      const dto = toTenantResponse(makeTenantEntity({ name: '開発法人', badgeColor: 'blue' }));
      expect(dto.name).toBe('開発法人');
      expect(dto.badgeColor).toBe('blue');
    });

    it('updatedAt を ISO 8601 文字列に変換すること', () => {
      const dto = toTenantResponse(
        makeTenantEntity({ updatedAt: new Date('2026-05-29T09:00:00.000Z') }),
      );
      expect(dto.updatedAt).toBe('2026-05-29T09:00:00.000Z');
    });

    it('行が未作成（null）なら app 既定値で補完し updatedAt は null を返すこと', () => {
      const dto = toTenantResponse(null);
      expect(dto.name).toBe(DEFAULT_TENANT_NAME);
      expect(dto.badgeColor).toBe(DEFAULT_TENANT_BADGE_COLOR);
      expect(dto.updatedAt).toBeNull();
    });
  });

  describe('toTenantSystemResponse', () => {
    it('TenantSystem の全フィールドを DTO に写すこと', () => {
      const dto = toTenantSystemResponse(
        makeTenantSystemEntity({
          id: 'RETE-DESK',
          name: 'デスク',
          isRete: true,
          enabled: false,
          sortOrder: 3,
        }),
      );
      expect(dto).toEqual({
        id: 'RETE-DESK',
        name: 'デスク',
        isRete: true,
        enabled: false,
        sortOrder: 3,
      });
    });
  });
});
