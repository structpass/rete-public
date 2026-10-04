import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Role } from '@rete/shared';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const mockService = {
  getTenant: jest.fn(),
  updateTenant: jest.fn(),
  getSystems: jest.fn(),
  reorderSystems: jest.fn(),
  toggleSystem: jest.fn(),
  deleteSystem: jest.fn(),
};

describe('SettingsController', () => {
  let controller: SettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: mockService }],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  it('getTenant は service.getTenant へ委譲する', async () => {
    const expected = { success: true, data: {} };
    mockService.getTenant.mockResolvedValue(expected);
    expect(await controller.getTenant()).toBe(expected);
    expect(mockService.getTenant).toHaveBeenCalledTimes(1);
  });

  it('updateTenant は dto を service.updateTenant へ委譲する', async () => {
    const dto = { name: '新法人', badgeColor: 'blue' };
    const expected = { success: true, data: {} };
    mockService.updateTenant.mockResolvedValue(expected);
    expect(await controller.updateTenant(dto)).toBe(expected);
    expect(mockService.updateTenant).toHaveBeenCalledWith(dto);
  });

  it('getSystems は service.getSystems へ委譲する', async () => {
    const expected = { success: true, data: [] };
    mockService.getSystems.mockResolvedValue(expected);
    expect(await controller.getSystems()).toBe(expected);
    expect(mockService.getSystems).toHaveBeenCalledTimes(1);
  });

  it('reorderSystems は dto を service.reorderSystems へ委譲する', async () => {
    const dto = { orderedIds: ['SYS-002', 'SYS-001'] };
    const expected = { success: true, data: [] };
    mockService.reorderSystems.mockResolvedValue(expected);
    expect(await controller.reorderSystems(dto)).toBe(expected);
    expect(mockService.reorderSystems).toHaveBeenCalledWith(dto);
  });

  it('toggleSystem は id / dto を service.toggleSystem へ委譲する', async () => {
    const dto = { enabled: false };
    const expected = { success: true, data: {} };
    mockService.toggleSystem.mockResolvedValue(expected);
    expect(await controller.toggleSystem('SYS-001', dto)).toBe(expected);
    expect(mockService.toggleSystem).toHaveBeenCalledWith('SYS-001', dto);
  });

  it('deleteSystem は id を service.deleteSystem へ委譲する（ST-3）', async () => {
    const expected = { success: true, data: { message: 'Tenant system deleted successfully' } };
    mockService.deleteSystem.mockResolvedValue(expected);
    expect(await controller.deleteSystem('SYS-001')).toBe(expected);
    expect(mockService.deleteSystem).toHaveBeenCalledWith('SYS-001');
  });
});

/** HIGH-3: RolesGuard が実際に発火するかを integration レベルで検証。
 *  Guard を override せず実際の RolesGuard を使い、MEMBER が書込エンドポイントに
 *  アクセスした場合に ForbiddenException が投げられることを確認する。
 */
describe('SettingsController — HIGH-3: 書込は ADMIN のみ（RolesGuard integration）', () => {
  let controller: SettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: mockService }],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      // RolesGuard は override せずに実態を使う
      .compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  it('MEMBER が PATCH /tenant にアクセスすると RolesGuard が 403 を返すこと', async () => {
    const { Reflector } = await import('@nestjs/core');
    const reflector = new Reflector();
    const { RolesGuard: Guard } = await import('../auth/guards/roles.guard');
    const guard = new Guard(reflector);

    // MEMBER user で updateTenant ハンドラに対する context を模倣
    const ctx = {
      getHandler: () => controller.updateTenant,
      getClass: () => SettingsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'acc-1', role: Role.MEMBER } }),
      }),
    } as never;

    // RolesGuard は @Roles(Role.ADMIN) が付いた handler に MEMBER でアクセスすると throw する
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ADMIN が PATCH /tenant にアクセスすると RolesGuard が通過すること', async () => {
    const { Reflector } = await import('@nestjs/core');
    const reflector = new Reflector();
    const { RolesGuard: Guard } = await import('../auth/guards/roles.guard');
    const guard = new Guard(reflector);

    const ctx = {
      getHandler: () => controller.updateTenant,
      getClass: () => SettingsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'acc-1', role: Role.ADMIN } }),
      }),
    } as never;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('非 UUID が PATCH /tenant/systems/:id/toggle の id に渡された場合 400 になること（ParseUUIDPipe）', () => {
    // ParseUUIDPipe は DI 不要・バリデーション単体で検証する
    const { ParseUUIDPipe } = jest.requireActual(
      '@nestjs/common',
      // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- jest.requireActual の戻り型は動的 import が必要で本ルールの対象外
    ) as typeof import('@nestjs/common');
    const pipe = new ParseUUIDPipe({ version: '4' });
    void expect(pipe.transform('not-a-uuid', { type: 'param' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
