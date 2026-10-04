import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Role } from '@rete/shared';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const mockService = {
  create: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  findAllAdmin: jest.fn(),
  adminUpdate: jest.fn(),
  createAdmin: jest.fn(),
  adminDelete: jest.fn(),
};

describe('ProjectsController', () => {
  let controller: ProjectsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: mockService }],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('create は dto と session userId を service.create へ委譲する', async () => {
    const dto = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      name: 'テストプロジェクト',
    };
    const expected = { success: true, data: { id: 'proj-1' } };
    mockService.create.mockResolvedValue(expected);

    expect(await controller.create(dto, 'acc-1')).toBe(expected);
    expect(mockService.create).toHaveBeenCalledWith(dto, 'acc-1');
  });

  it('findAll は organizationId と session userId を service.findAll へ委譲する', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll('11111111-1111-4111-8111-111111111111', 'acc-1')).toBe(
      expected,
    );
    expect(mockService.findAll).toHaveBeenCalledWith(
      'acc-1',
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('findAll は organizationId 省略時（undefined）でも service.findAll へ委譲する', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll(undefined, 'acc-1')).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledWith('acc-1', undefined);
  });

  it('update は id・dto・session userId を service.update へ委譲する', async () => {
    const dto = { name: '改名プロジェクト' };
    const expected = { success: true, data: { id: 'proj-1', name: '改名プロジェクト' } };
    mockService.update.mockResolvedValue(expected);

    expect(await controller.update('proj-1', dto, 'acc-1')).toBe(expected);
    expect(mockService.update).toHaveBeenCalledWith('proj-1', dto, 'acc-1');
  });

  // ============================================================
  // テナント管理 ADMIN 専用エンドポイント（set-0027）
  // ============================================================

  describe('findAllAdmin（GET /projects/admin）', () => {
    it('organizationId / includeArchived を service.findAllAdmin へ委譲する', async () => {
      const expected = { success: true, data: [] };
      mockService.findAllAdmin.mockResolvedValue(expected);

      expect(await controller.findAllAdmin('org-uuid', true)).toBe(expected);
      expect(mockService.findAllAdmin).toHaveBeenCalledWith('org-uuid', true);
    });

    it('両パラメータ省略（undefined）でも委譲できる', async () => {
      mockService.findAllAdmin.mockResolvedValue({ success: true, data: [] });

      await controller.findAllAdmin(undefined, undefined);

      expect(mockService.findAllAdmin).toHaveBeenCalledWith(undefined, undefined);
    });

    it('findAllAdmin メソッドに @Roles(Role.ADMIN) メタデータが付与されている（system ADMIN gate）', () => {
      // NestJS SetMetadata は descriptor.value（メソッド関数）自体にメタデータを付与する
      const requiredRoles = Reflect.getMetadata(
        ROLES_KEY,
        ProjectsController.prototype.findAllAdmin,
      );
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });

  describe('adminUpdate（PATCH /projects/admin/:id）', () => {
    it('id と dto を service.adminUpdate へ委譲する（userId なし・membership 非依存）', async () => {
      const dto = { name: '新名称' };
      const expected = { success: true, data: { id: 'proj-1', name: '新名称' } };
      mockService.adminUpdate.mockResolvedValue(expected);

      expect(await controller.adminUpdate('proj-1', dto)).toBe(expected);
      expect(mockService.adminUpdate).toHaveBeenCalledWith('proj-1', dto);
    });

    it('archived=true の dto も正しく委譲する（連鎖 cascade トリガー確認）', async () => {
      const dto = { archived: true };
      const expected = { success: true, data: { id: 'proj-1', archived: true } };
      mockService.adminUpdate.mockResolvedValue(expected);

      expect(await controller.adminUpdate('proj-1', dto)).toBe(expected);
      expect(mockService.adminUpdate).toHaveBeenCalledWith('proj-1', dto);
    });

    it('adminUpdate メソッドに @Roles(Role.ADMIN) メタデータが付与されている（system ADMIN gate・非 ADMIN 拒否 negative）', () => {
      const requiredRoles = Reflect.getMetadata(
        ROLES_KEY,
        ProjectsController.prototype.adminUpdate,
      );
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });

  describe('createAdmin（POST /projects/admin・set-0162）', () => {
    it('dto を service.createAdmin へ委譲する（userId なし・membership 非依存）', async () => {
      const dto = { organizationId: 'org-1', name: '新 PJ' };
      const expected = { success: true, data: { id: 'proj-1', name: '新 PJ' } };
      mockService.createAdmin.mockResolvedValue(expected);

      expect(await controller.createAdmin(dto)).toBe(expected);
      expect(mockService.createAdmin).toHaveBeenCalledWith(dto);
    });

    it('createAdmin メソッドに @Roles(Role.ADMIN) メタデータが付与されている（system ADMIN gate）', () => {
      const requiredRoles = Reflect.getMetadata(
        ROLES_KEY,
        ProjectsController.prototype.createAdmin,
      );
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });

  describe('adminDelete（DELETE /projects/admin/:id・set-0162）', () => {
    it('id を service.adminDelete へ委譲する（userId なし・membership 非依存）', async () => {
      const expected = { success: true, data: { id: 'proj-1' } };
      mockService.adminDelete.mockResolvedValue(expected);

      expect(await controller.adminDelete('proj-1')).toBe(expected);
      expect(mockService.adminDelete).toHaveBeenCalledWith('proj-1');
    });

    it('adminDelete メソッドに @Roles(Role.ADMIN) メタデータが付与されている（system ADMIN gate）', () => {
      const requiredRoles = Reflect.getMetadata(
        ROLES_KEY,
        ProjectsController.prototype.adminDelete,
      );
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });
});
