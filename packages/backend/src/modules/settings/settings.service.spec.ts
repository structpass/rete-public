import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsRepository } from './repositories/settings.repository';
import { makeTenantEntity, makeTenantSystemEntity } from '../../__tests__/factories';

const mockRepo = {
  findTenant: jest.fn(),
  upsertTenant: jest.fn(),
  findSystemById: jest.fn(),
  findSystems: jest.fn(),
  reorderSystems: jest.fn(),
  toggleSystem: jest.fn(),
  deleteSystem: jest.fn(),
};

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: SettingsRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('getTenant', () => {
    it('TenantResponseDto を { success, data } で返し updatedAt を ISO 文字列化すること', async () => {
      mockRepo.findTenant.mockResolvedValue(
        makeTenantEntity({ name: '開発法人', badgeColor: 'green' }),
      );

      const result = await service.getTenant();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({ name: '開発法人', badgeColor: 'green' }),
      );
      expect(typeof result.data.updatedAt).toBe('string');
    });

    it('行が無い場合でも既定値の DTO を返すこと', async () => {
      mockRepo.findTenant.mockResolvedValue(null);

      const result = await service.getTenant();

      expect(result.success).toBe(true);
      expect(result.data.updatedAt).toBeNull();
    });
  });

  describe('updateTenant', () => {
    it('name / badgeColor を patch として upsert へ渡し DTO を返すこと', async () => {
      mockRepo.upsertTenant.mockResolvedValue(
        makeTenantEntity({ name: '新法人', badgeColor: 'red' }),
      );

      const result = await service.updateTenant({ name: '新法人', badgeColor: 'red' });

      expect(mockRepo.upsertTenant).toHaveBeenCalledWith({ name: '新法人', badgeColor: 'red' });
      expect(result.data).toEqual(expect.objectContaining({ name: '新法人', badgeColor: 'red' }));
    });

    it('未指定フィールドは undefined のまま渡す（既存値保持）こと', async () => {
      mockRepo.upsertTenant.mockResolvedValue(makeTenantEntity());

      await service.updateTenant({ name: '名前のみ' });

      expect(mockRepo.upsertTenant).toHaveBeenCalledWith({
        name: '名前のみ',
        badgeColor: undefined,
      });
    });
  });

  describe('getSystems', () => {
    it('TenantSystemResponseDto 配列を { success, data } で返すこと', async () => {
      mockRepo.findSystems.mockResolvedValue([
        makeTenantSystemEntity({ id: 'SYS-001', sortOrder: 0 }),
        makeTenantSystemEntity({ id: 'SYS-002', sortOrder: 1 }),
      ]);

      const result = await service.getSystems();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('SYS-001');
    });
  });

  describe('reorderSystems', () => {
    it('id 集合が一致する時、orderedIds を repository へ渡し反映後の DTO 配列を返すこと', async () => {
      mockRepo.reorderSystems.mockResolvedValue({
        ok: true,
        items: [
          makeTenantSystemEntity({ id: 'SYS-002', sortOrder: 0 }),
          makeTenantSystemEntity({ id: 'SYS-001', sortOrder: 1 }),
        ],
      });

      const result = await service.reorderSystems({ orderedIds: ['SYS-002', 'SYS-001'] });

      expect(mockRepo.reorderSystems).toHaveBeenCalledWith(['SYS-002', 'SYS-001']);
      expect(result.data.map((s) => s.id)).toEqual(['SYS-002', 'SYS-001']);
    });

    it('repository が set-mismatch を返す（過不足・重複）時は BadRequest を投げる（cmn-0345）', async () => {
      mockRepo.reorderSystems.mockResolvedValue({ ok: false, reason: 'set-mismatch' });

      // 過不足・重複いずれも repository の tx 内検証で set-mismatch に落ちる（service は翻訳のみ）。
      await expect(service.reorderSystems({ orderedIds: ['SYS-001', 'SYS-001'] })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('toggleSystem', () => {
    it('id / enabled を repository へ渡し、更新後の DTO を返すこと', async () => {
      mockRepo.toggleSystem.mockResolvedValue(
        makeTenantSystemEntity({ id: 'SYS-001', enabled: false }),
      );

      const result = await service.toggleSystem('SYS-001', { enabled: false });

      expect(mockRepo.toggleSystem).toHaveBeenCalledWith('SYS-001', false);
      expect(result.data.enabled).toBe(false);
    });
  });

  describe('deleteSystem（ST-3 cascade cleanup）', () => {
    it('存在するシステムなら deleteSystem を呼び成功メッセージを返すこと', async () => {
      mockRepo.findSystemById.mockResolvedValue({ id: 'SYS-001' });
      mockRepo.deleteSystem.mockResolvedValue(undefined);

      const result = await service.deleteSystem('SYS-001');

      expect(mockRepo.findSystemById).toHaveBeenCalledWith('SYS-001');
      expect(mockRepo.deleteSystem).toHaveBeenCalledWith('SYS-001');
      expect(result.success).toBe(true);
    });

    it('存在しないシステムは NotFoundException を投げ deleteSystem を呼ばないこと', async () => {
      mockRepo.findSystemById.mockResolvedValue(null);

      await expect(service.deleteSystem('GHOST')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.deleteSystem).not.toHaveBeenCalled();
    });
  });
});
