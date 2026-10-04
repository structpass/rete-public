import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

const mockCategoriesService = {
  findAll: jest.fn(),
  create: jest.fn(),
  reorder: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('CategoriesController', () => {
  let controller: CategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: mockCategoriesService }],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  // @CurrentUser('id') で注入される認証ユーザー id（存在秘匿の enforcement に service へ渡る / ADR 0042）。
  const ACCOUNT_ID = 'acct-1';

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('spaceId / accountId を service へ伝搬すること（既定はアーカイブ済除外 = includeArchived false / rete-desk-0158）', async () => {
      const expected = { success: true, data: [{ id: 1, name: '入荷' }] };
      mockCategoriesService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ spaceId: 'space-1' } as never, ACCOUNT_ID);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.findAll).toHaveBeenCalledWith('space-1', ACCOUNT_ID, false);
    });

    it('spaceId / accountId と includeArchived=true を service へ伝搬すること（rete-desk-0140・0158）', async () => {
      mockCategoriesService.findAll.mockResolvedValue({ success: true, data: [] });

      await controller.findAll({ spaceId: 'space-1', includeArchived: true } as never, ACCOUNT_ID);

      expect(mockCategoriesService.findAll).toHaveBeenCalledWith('space-1', ACCOUNT_ID, true);
    });
  });

  describe('create', () => {
    it('分類を作成して返すこと（accountId を存在秘匿用に service へ渡す）', async () => {
      const dto = { name: '出荷', spaceId: 'space-1', sortOrder: 1 };
      const expected = { success: true, data: { id: 2, ...dto } };
      mockCategoriesService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as never, ACCOUNT_ID);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.create).toHaveBeenCalledWith(dto, ACCOUNT_ID);
    });
  });

  describe('reorder（rete-desk-0197）', () => {
    it('spaceId / orderedIds / accountId を service へ委譲すること', async () => {
      const dto = { spaceId: 'space-1', orderedIds: [3, 1, 2] };
      const expected = { success: true, data: [{ id: 3 }, { id: 1 }, { id: 2 }] };
      mockCategoriesService.reorder.mockResolvedValue(expected);

      const result = await controller.reorder(dto as never, ACCOUNT_ID);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.reorder).toHaveBeenCalledWith('space-1', [3, 1, 2], ACCOUNT_ID);
    });
  });

  describe('update（rete-desk-0140）', () => {
    it('id / dto / accountId を service へ委譲すること', async () => {
      const dto = { archived: true };
      const expected = { success: true, data: { id: 1, archived: true } };
      mockCategoriesService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as never, ACCOUNT_ID);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.update).toHaveBeenCalledWith(1, dto, ACCOUNT_ID);
    });
  });

  describe('remove（rete-desk-0140）', () => {
    it('id / accountId を service へ委譲すること', async () => {
      const expected = { success: true, data: { message: 'Category deleted successfully' } };
      mockCategoriesService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1, ACCOUNT_ID);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.remove).toHaveBeenCalledWith(1, ACCOUNT_ID);
    });
  });
});
