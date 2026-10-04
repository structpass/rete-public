import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@rete/shared';
import type { TagIconName, TagColorName } from '@rete/shared';
import { AnnouncementTagsController } from './announcement-tags.controller';
import { AnnouncementTagsService } from './announcement-tags.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const mockService = {
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('AnnouncementTagsController', () => {
  let controller: AnnouncementTagsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementTagsController],
      providers: [{ provide: AnnouncementTagsService, useValue: mockService }],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnnouncementTagsController>(AnnouncementTagsController);
  });

  it('findAll は service.findAll へ委譲すること', async () => {
    const expected = {
      success: true,
      data: [{ id: 'atag-1', name: '重要', icon: 'Star', color: 'red' }],
    };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll({ kind: 'board' }, Role.MEMBER)).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledWith({ kind: 'board' });
  });

  // hom-0086 項目3: アーカイブ済の閲覧（includeArchived=true）は ADMIN のみ。
  it('非ADMIN が includeArchived=true を渡すと 403 を投げ service を呼ばないこと', async () => {
    await expect(
      controller.findAll({ kind: 'board', includeArchived: true }, Role.MEMBER),
    ).rejects.toThrow(ForbiddenException);
    expect(mockService.findAll).not.toHaveBeenCalled();
  });

  it('非ADMIN の通常一覧（includeArchived 無し / false）は従来通り委譲されること', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll({ kind: 'board' }, Role.MEMBER)).toBe(expected);
    expect(await controller.findAll({ kind: 'board', includeArchived: false }, Role.MEMBER)).toBe(
      expected,
    );
    expect(mockService.findAll).toHaveBeenCalledTimes(2);
  });

  it('ADMIN は includeArchived=true でも委譲されること', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll({ kind: 'board', includeArchived: true }, Role.ADMIN)).toBe(
      expected,
    );
    expect(mockService.findAll).toHaveBeenCalledWith({ kind: 'board', includeArchived: true });
  });

  it('create は dto を service.create へ委譲すること', async () => {
    const dto = { name: '重要', icon: 'Star' as TagIconName, color: 'slate' as TagColorName };
    const expected = {
      success: true,
      data: { id: 'atag-new', name: '重要', icon: 'Star', color: 'slate' },
    };
    mockService.create.mockResolvedValue(expected);

    expect(await controller.create(dto)).toBe(expected);
    expect(mockService.create).toHaveBeenCalledWith(dto);
  });

  it('update は id と dto を service.update へ委譲すること', async () => {
    const dto = { name: '緊急', icon: 'Bell' as TagIconName };
    const expected = {
      success: true,
      data: { id: 'atag-1', name: '緊急', icon: 'Bell', color: 'slate' },
    };
    mockService.update.mockResolvedValue(expected);

    expect(await controller.update('atag-1', dto)).toBe(expected);
    expect(mockService.update).toHaveBeenCalledWith('atag-1', dto);
  });

  it('delete は id を service.delete へ委譲すること', async () => {
    const expected = { success: true, data: { id: 'atag-1' } };
    mockService.delete.mockResolvedValue(expected);

    expect(await controller.delete('atag-1')).toBe(expected);
    expect(mockService.delete).toHaveBeenCalledWith('atag-1');
  });
});

/** cmn-0039(E12): 書き込み系（create/update/delete）は ADMIN 限定（RolesGuard integration）。
 *  Guard を override せず実際の RolesGuard を使い、MEMBER は ForbiddenException・ADMIN は通過、
 *  findAll（@Roles 無し）は MEMBER でも通過することを確認する（files/settings.controller.spec と同方針）。
 */
describe('AnnouncementTagsController — cmn-0039: 書き込みは ADMIN のみ（RolesGuard integration）', () => {
  let controller: AnnouncementTagsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementTagsController],
      providers: [{ provide: AnnouncementTagsService, useValue: mockService }],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      // RolesGuard は override せず実態を使う
      .compile();

    controller = module.get<AnnouncementTagsController>(AnnouncementTagsController);
  });

  const makeCtx = (handler: (...args: never[]) => unknown, role: Role) =>
    ({
      getHandler: () => handler,
      getClass: () => AnnouncementTagsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'acc-1', role } }) }),
    }) as never;

  const makeGuard = async () => {
    const { Reflector } = await import('@nestjs/core');
    return new RolesGuard(new Reflector());
  };

  it.each([
    ['create', () => AnnouncementTagsController.prototype.create],
    ['update', () => AnnouncementTagsController.prototype.update],
    ['delete', () => AnnouncementTagsController.prototype.delete],
  ])('MEMBER が %s にアクセスすると RolesGuard が 403 を返すこと', async (_name, handler) => {
    const guard = await makeGuard();
    expect(() => guard.canActivate(makeCtx(handler(), Role.MEMBER))).toThrow(ForbiddenException);
  });

  it.each([
    ['create', () => AnnouncementTagsController.prototype.create],
    ['update', () => AnnouncementTagsController.prototype.update],
    ['delete', () => AnnouncementTagsController.prototype.delete],
  ])('ADMIN が %s にアクセスすると RolesGuard が通過すること', async (_name, handler) => {
    const guard = await makeGuard();
    expect(guard.canActivate(makeCtx(handler(), Role.ADMIN))).toBe(true);
  });

  it('findAll（@Roles 無し・一覧）は MEMBER でも RolesGuard を通過すること（回帰防止）', async () => {
    const guard = await makeGuard();
    expect(guard.canActivate(makeCtx(controller.findAll, Role.MEMBER))).toBe(true);
  });
});
