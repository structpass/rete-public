import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

const mockService = {
  findAll: jest.fn(),
  add: jest.fn(),
  reorder: jest.fn(),
  remove: jest.fn(),
};

describe('FavoritesController', () => {
  let controller: FavoritesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [{ provide: FavoritesService, useValue: mockService }],
    }).compile();

    controller = module.get<FavoritesController>(FavoritesController);
  });

  it('findAll は session の accountId を service.findAll へ委譲する', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll('acc-1')).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledWith('acc-1');
  });

  it('add は accountId（session）と dto を service.add へ委譲する', async () => {
    const dto = { kind: 'chat' as const, label: 'お気に入り', targetRef: 'theme-1' };
    const expected = { success: true, data: { id: 'new-1' } };
    mockService.add.mockResolvedValue(expected);

    expect(await controller.add('acc-1', dto)).toBe(expected);
    expect(mockService.add).toHaveBeenCalledWith('acc-1', dto);
  });

  it('reorder は accountId と dto を service.reorder へ委譲する', async () => {
    const dto = { orderedIds: ['b', 'a'] };
    const expected = { success: true, data: [] };
    mockService.reorder.mockResolvedValue(expected);

    expect(await controller.reorder('acc-1', dto)).toBe(expected);
    expect(mockService.reorder).toHaveBeenCalledWith('acc-1', dto);
  });

  it('remove は accountId と id を service.remove へ委譲する', async () => {
    const expected = { success: true, data: { message: 'お気に入りを削除しました' } };
    mockService.remove.mockResolvedValue(expected);

    expect(await controller.remove('acc-1', 'fav-1')).toBe(expected);
    expect(mockService.remove).toHaveBeenCalledWith('acc-1', 'fav-1');
  });
});
