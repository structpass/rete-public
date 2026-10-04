import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '@rete/shared';
import { ForbiddenException } from '@nestjs/common';
import type { TagIconName, TagColorName } from '@rete/shared';

const mockService = {
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('TagsController', () => {
  let controller: TagsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsController],
      providers: [{ provide: TagsService, useValue: mockService }],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TagsController>(TagsController);
  });

  it('findAll は service.findAll へ委譲すること', async () => {
    const expected = {
      success: true,
      data: [{ id: 'tag-1', name: '重要', icon: 'Star', color: 'red', archived: false }],
    };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll({}, Role.MEMBER)).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledWith({});
  });

  // fil-0094（hom-0086 と同型）: アーカイブ済の閲覧（includeArchived=true）は ADMIN のみ。
  it('非ADMIN が includeArchived=true を渡すと 403 を投げ service を呼ばないこと', async () => {
    await expect(controller.findAll({ includeArchived: true }, Role.MEMBER)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockService.findAll).not.toHaveBeenCalled();
  });

  it('非ADMIN の通常一覧（includeArchived 無し / false）は従来通り委譲されること', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll({}, Role.MEMBER)).toBe(expected);
    expect(await controller.findAll({ includeArchived: false }, Role.MEMBER)).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledTimes(2);
  });

  it('ADMIN は includeArchived=true でも委譲されること', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll({ includeArchived: true }, Role.ADMIN)).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledWith({ includeArchived: true });
  });

  it('create は dto を service.create へ委譲すること', async () => {
    const dto = { name: '重要', icon: 'Star' as TagIconName, color: 'slate' as TagColorName };
    const expected = {
      success: true,
      data: { id: 'tag-new', name: '重要', icon: 'Star', color: 'slate' },
    };
    mockService.create.mockResolvedValue(expected);

    expect(await controller.create(dto)).toBe(expected);
    expect(mockService.create).toHaveBeenCalledWith(dto);
  });

  it('update は id と dto を service.update へ委譲すること', async () => {
    const dto = { name: '緊急', icon: 'Bell' as TagIconName };
    const expected = {
      success: true,
      data: { id: 'tag-1', name: '緊急', icon: 'Bell', color: 'slate' },
    };
    mockService.update.mockResolvedValue(expected);

    expect(await controller.update('tag-1', dto)).toBe(expected);
    expect(mockService.update).toHaveBeenCalledWith('tag-1', dto);
  });

  it('delete は id を service.delete へ委譲すること', async () => {
    const expected = { success: true, data: { id: 'tag-1' } };
    mockService.delete.mockResolvedValue(expected);

    expect(await controller.delete('tag-1')).toBe(expected);
    expect(mockService.delete).toHaveBeenCalledWith('tag-1');
  });
});

/** fil-0069: 書き込み系（create/update/delete）は ADMIN 限定（RolesGuard integration）。 */
describe('TagsController — fil-0069: 書き込みは ADMIN のみ（RolesGuard integration）', () => {
  let controller: TagsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsController],
      providers: [{ provide: TagsService, useValue: mockService }],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TagsController>(TagsController);
  });

  const makeCtx = (handler: (...args: never[]) => unknown, role: Role) =>
    ({
      getHandler: () => handler,
      getClass: () => TagsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'acc-1', role } }) }),
    }) as never;

  const makeGuard = async () => {
    const { Reflector } = await import('@nestjs/core');
    return new RolesGuard(new Reflector());
  };

  it.each([
    ['create', () => TagsController.prototype.create],
    ['update', () => TagsController.prototype.update],
    ['delete', () => TagsController.prototype.delete],
  ])('MEMBER が %s にアクセスすると RolesGuard が 403 を返すこと', async (_name, handler) => {
    const guard = await makeGuard();
    expect(() => guard.canActivate(makeCtx(handler(), Role.MEMBER))).toThrow(ForbiddenException);
  });

  it.each([
    ['create', () => TagsController.prototype.create],
    ['update', () => TagsController.prototype.update],
    ['delete', () => TagsController.prototype.delete],
  ])('ADMIN が %s にアクセスすると RolesGuard が通過すること', async (_name, handler) => {
    const guard = await makeGuard();
    expect(guard.canActivate(makeCtx(handler(), Role.ADMIN))).toBe(true);
  });

  it('findAll（@Roles 無し・一覧）は MEMBER でも RolesGuard を通過すること（回帰防止）', async () => {
    const guard = await makeGuard();
    expect(guard.canActivate(makeCtx(controller.findAll, Role.MEMBER))).toBe(true);
  });
});
