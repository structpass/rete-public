import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Role } from '@rete/shared';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const mockService = {
  create: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  findAllAdmin: jest.fn(),
  adminUpdate: jest.fn(),
  adminDelete: jest.fn(),
};

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: mockService }],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('create は dto と session userId を service.create へ委譲する（作成者が ADMIN に自動昇格 ADR 0037 §5）', async () => {
    const dto = { name: 'テスト組織' };
    const expected = {
      success: true,
      data: {
        id: 'org-1',
        name: 'テスト組織',
        sortOrder: 0,
        archived: false,
        createdAt: '2026-05-29T01:23:45.000Z',
        updatedAt: '2026-05-29T01:23:45.000Z',
      },
    };
    mockService.create.mockResolvedValue(expected);

    expect(await controller.create(dto, 'acc-1')).toBe(expected);
    expect(mockService.create).toHaveBeenCalledWith(dto, 'acc-1');
  });

  it('findAll は session userId を service.findAll へ委譲する（membership 可視範囲のみ・archived 除外・sortOrder 昇順）', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll('acc-1')).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledWith('acc-1');
  });

  it('update は id・dto・session userId を service.update へ委譲する（ADMIN のみ更新可・改名 / archive トグル）', async () => {
    const dto = { name: '改名組織' };
    const expected = { success: true, data: { id: 'org-1' } };
    mockService.update.mockResolvedValue(expected);

    expect(await controller.update('org-1', dto, 'acc-1')).toBe(expected);
    expect(mockService.update).toHaveBeenCalledWith('org-1', dto, 'acc-1');
  });

  it('update は archived フラグのみの dto も service.update へ正しく委譲する（アーカイブトグル）', async () => {
    const dto = { archived: true };
    const expected = { success: true, data: { id: 'org-1' } };
    mockService.update.mockResolvedValue(expected);

    expect(await controller.update('org-1', dto, 'acc-9')).toBe(expected);
    expect(mockService.update).toHaveBeenCalledWith('org-1', dto, 'acc-9');
  });

  // ============================================================
  // テナント管理 ADMIN 専用エンドポイント（set-0027）
  // ============================================================

  describe('findAllAdmin（GET /organizations/admin）', () => {
    it('findAllAdmin は includeArchived を service.findAllAdmin へ委譲する', async () => {
      const expected = { success: true, data: [] };
      mockService.findAllAdmin.mockResolvedValue(expected);

      expect(await controller.findAllAdmin(true)).toBe(expected);
      expect(mockService.findAllAdmin).toHaveBeenCalledWith(true);
    });

    it('includeArchived 未指定（undefined）も委譲できる', async () => {
      mockService.findAllAdmin.mockResolvedValue({ success: true, data: [] });

      await controller.findAllAdmin(undefined);

      expect(mockService.findAllAdmin).toHaveBeenCalledWith(undefined);
    });

    it('findAllAdmin メソッドに @Roles(Role.ADMIN) メタデータが付与されている（system ADMIN gate）', () => {
      // NestJS SetMetadata は descriptor.value（メソッド関数）自体にメタデータを付与する
      const requiredRoles = Reflect.getMetadata(
        ROLES_KEY,
        OrganizationsController.prototype.findAllAdmin,
      );
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });

  describe('adminUpdate（PATCH /organizations/admin/:id）', () => {
    it('id と dto を service.adminUpdate へ委譲する（userId なし・membership 非依存）', async () => {
      const dto = { name: '新名称' };
      const expected = { success: true, data: { id: 'org-1', name: '新名称' } };
      mockService.adminUpdate.mockResolvedValue(expected);

      expect(await controller.adminUpdate('org-1', dto)).toBe(expected);
      expect(mockService.adminUpdate).toHaveBeenCalledWith('org-1', dto);
    });

    it('archived=true の dto も正しく委譲する（連鎖 cascade トリガー確認）', async () => {
      const dto = { archived: true };
      const expected = { success: true, data: { id: 'org-1', archived: true } };
      mockService.adminUpdate.mockResolvedValue(expected);

      expect(await controller.adminUpdate('org-1', dto)).toBe(expected);
      expect(mockService.adminUpdate).toHaveBeenCalledWith('org-1', dto);
    });

    it('adminUpdate メソッドに @Roles(Role.ADMIN) メタデータが付与されている（system ADMIN gate・非 ADMIN 拒否 negative）', () => {
      const requiredRoles = Reflect.getMetadata(
        ROLES_KEY,
        OrganizationsController.prototype.adminUpdate,
      );
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });

  describe('adminDelete（DELETE /organizations/admin/:id・set-0162）', () => {
    it('id を service.adminDelete へ委譲する（userId なし・membership 非依存）', async () => {
      const expected = { success: true, data: { id: 'org-1' } };
      mockService.adminDelete.mockResolvedValue(expected);

      expect(await controller.adminDelete('org-1')).toBe(expected);
      expect(mockService.adminDelete).toHaveBeenCalledWith('org-1');
    });

    it('adminDelete メソッドに @Roles(Role.ADMIN) メタデータが付与されている（system ADMIN gate）', () => {
      const requiredRoles = Reflect.getMetadata(
        ROLES_KEY,
        OrganizationsController.prototype.adminDelete,
      );
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });
});
