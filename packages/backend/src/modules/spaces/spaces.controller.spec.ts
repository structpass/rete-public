import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import { Role, SpaceKind } from '@rete/shared';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const mockService = {
  create: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  // dsk-0319: テナント管理 ADMIN 向け GROUP 全件一覧。
  findAllAdmin: jest.fn(),
  // set-0162: system ADMIN 専用のチャネル管理経路。
  createAdmin: jest.fn(),
  adminUpdate: jest.fn(),
  adminDelete: jest.fn(),
};

describe('SpacesController', () => {
  let controller: SpacesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpacesController],
      providers: [{ provide: SpacesService, useValue: mockService }],
    }).compile();

    controller = module.get<SpacesController>(SpacesController);
  });

  it('create は dto と session userId を service.create へ委譲する', async () => {
    const dto = { kind: SpaceKind.CHANNEL, projectId: 'proj-1', name: 'general' };
    const expected = { success: true, data: { id: 'space-1' } };
    mockService.create.mockResolvedValue(expected);

    expect(await controller.create(dto as never, 'user-1')).toBe(expected);
    expect(mockService.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('findAll は kind・projectId・session userId・role を service.findAll へ委譲する（順序: userId, kind, projectId, role, includeArchived）', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(
      await controller.findAll(SpaceKind.CHANNEL, 'proj-1', undefined, 'user-1', Role.MEMBER),
    ).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledWith(
      'user-1',
      SpaceKind.CHANNEL,
      'proj-1',
      Role.MEMBER,
      undefined,
    );
  });

  it('findAll は includeArchived=true を service.findAll へ委譲する（CHANNEL のアーカイブ済表示）', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll(SpaceKind.CHANNEL, 'proj-1', true, 'user-1', Role.MEMBER)).toBe(
      expected,
    );
    expect(mockService.findAll).toHaveBeenCalledWith(
      'user-1',
      SpaceKind.CHANNEL,
      'proj-1',
      Role.MEMBER,
      true,
    );
  });

  it('findAll は kind・projectId が undefined でも service.findAll へ委譲する（kind 未指定で全 visible ID を返す）', async () => {
    const expected = { success: true, data: ['space-1', 'space-2'] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll(undefined, undefined, undefined, 'user-2', Role.ADMIN)).toBe(
      expected,
    );
    expect(mockService.findAll).toHaveBeenCalledWith(
      'user-2',
      undefined,
      undefined,
      Role.ADMIN,
      undefined,
    );
  });

  it('update は id・dto・session userId を service.update へ委譲する', async () => {
    const dto = { name: '新チャネル名' };
    const expected = { success: true, data: { id: 'space-1' } };
    mockService.update.mockResolvedValue(expected);

    expect(await controller.update('space-1', dto as never, 'user-1')).toBe(expected);
    expect(mockService.update).toHaveBeenCalledWith('space-1', dto, 'user-1');
  });

  it('update は archived トグルを dto 経由で service.update へ委譲する', async () => {
    const dto = { archived: true };
    const expected = { success: true, data: { id: 'space-1', archived: true } };
    mockService.update.mockResolvedValue(expected);

    expect(await controller.update('space-1', dto as never, 'user-99')).toBe(expected);
    expect(mockService.update).toHaveBeenCalledWith('space-1', dto, 'user-99');
  });

  // dsk-0319: ADMIN 専用エンドポイント。@Roles(Role.ADMIN) の gating は RolesGuard が担う
  // （メタデータテストは controller 層では実装せず、e2e/integration 側に委ねる）。

  describe('findAllAdmin', () => {
    it('kind と includeArchived を service.findAllAdmin へ委譲する', async () => {
      const expected = { success: true, data: [] };
      mockService.findAllAdmin.mockResolvedValue(expected);

      expect(await controller.findAllAdmin(SpaceKind.GROUP, undefined, true)).toBe(expected);
      expect(mockService.findAllAdmin).toHaveBeenCalledWith(SpaceKind.GROUP, undefined, true);
    });

    it('projectId を service.findAllAdmin へ委譲する（kind=CHANNEL 時）', async () => {
      const expected = { success: true, data: [] };
      mockService.findAllAdmin.mockResolvedValue(expected);

      expect(await controller.findAllAdmin(SpaceKind.CHANNEL, 'proj-1')).toBe(expected);
      expect(mockService.findAllAdmin).toHaveBeenCalledWith(SpaceKind.CHANNEL, 'proj-1', undefined);
    });

    it('includeArchived が undefined でも service.findAllAdmin へ委譲する', async () => {
      mockService.findAllAdmin.mockResolvedValue({ success: true, data: [] });

      await controller.findAllAdmin(SpaceKind.GROUP, undefined, undefined);

      expect(mockService.findAllAdmin).toHaveBeenCalledWith(SpaceKind.GROUP, undefined, undefined);
    });

    // dsk-0319 criteria: @Roles(ADMIN) メタデータテスト含む（set-0027 と同型）。
    // NestJS SetMetadata は descriptor.value（メソッド関数）自体にメタデータを付与する。
    it('findAllAdmin メソッドに @Roles(Role.ADMIN) メタデータが付与されている（system ADMIN gate）', () => {
      const requiredRoles = Reflect.getMetadata(ROLES_KEY, SpacesController.prototype.findAllAdmin);
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });

  describe('admin CRUD（set-0162・system ADMIN 専用経路）', () => {
    it('createAdmin は dto を service.createAdmin へ委譲する（userId なし・membership 非依存）', async () => {
      const dto = { kind: SpaceKind.CHANNEL, projectId: 'proj-1', name: 'general' };
      const expected = { success: true, data: { id: 'space-1' } };
      mockService.createAdmin.mockResolvedValue(expected);

      expect(await controller.createAdmin(dto as never)).toBe(expected);
      expect(mockService.createAdmin).toHaveBeenCalledWith(dto);
    });

    it('createAdmin メソッドに @Roles(Role.ADMIN) メタデータが付与されている', () => {
      const requiredRoles = Reflect.getMetadata(ROLES_KEY, SpacesController.prototype.createAdmin);
      expect(requiredRoles).toContain(Role.ADMIN);
    });

    it('adminUpdate は id・dto を service.adminUpdate へ委譲する（membership 非依存）', async () => {
      const dto = { name: '新名称' };
      const expected = { success: true, data: { id: 'space-1', name: '新名称' } };
      mockService.adminUpdate.mockResolvedValue(expected);

      expect(await controller.adminUpdate('space-1', dto as never)).toBe(expected);
      expect(mockService.adminUpdate).toHaveBeenCalledWith('space-1', dto);
    });

    it('adminUpdate メソッドに @Roles(Role.ADMIN) メタデータが付与されている', () => {
      const requiredRoles = Reflect.getMetadata(ROLES_KEY, SpacesController.prototype.adminUpdate);
      expect(requiredRoles).toContain(Role.ADMIN);
    });

    it('adminDelete は id を service.adminDelete へ委譲する（membership 非依存）', async () => {
      const expected = { success: true, data: { id: 'space-1' } };
      mockService.adminDelete.mockResolvedValue(expected);

      expect(await controller.adminDelete('space-1')).toBe(expected);
      expect(mockService.adminDelete).toHaveBeenCalledWith('space-1');
    });

    it('adminDelete メソッドに @Roles(Role.ADMIN) メタデータが付与されている', () => {
      const requiredRoles = Reflect.getMetadata(ROLES_KEY, SpacesController.prototype.adminDelete);
      expect(requiredRoles).toContain(Role.ADMIN);
    });
  });
});
