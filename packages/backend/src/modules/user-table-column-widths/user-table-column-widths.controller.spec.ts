import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UserTableColumnWidthsController } from './user-table-column-widths.controller';
import { UserTableColumnWidthsService } from './user-table-column-widths.service';
import type { UpsertColumnWidthDto } from './dto';

const mockService = {
  getMine: jest.fn(),
  upsert: jest.fn(),
  resetMine: jest.fn(),
};

describe('UserTableColumnWidthsController', () => {
  let controller: UserTableColumnWidthsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserTableColumnWidthsController],
      providers: [{ provide: UserTableColumnWidthsService, useValue: mockService }],
    }).compile();

    controller = module.get<UserTableColumnWidthsController>(UserTableColumnWidthsController);
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('getMine', () => {
    it('UserTableColumnWidthResponseDto shape の配列を返すこと', async () => {
      const expected = {
        success: true,
        data: [
          {
            tableId: 'files-list',
            columnKey: 'name',
            width: 200,
            updatedAt: '2026-06-21T00:00:00.000Z',
          },
        ],
      };
      mockService.getMine.mockResolvedValue(expected);

      const result = await controller.getMine('user-uuid-1', 'files-list');

      expect(result.success).toBe(true);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          tableId: expect.any(String),
          columnKey: expect.any(String),
          width: expect.any(Number),
          updatedAt: expect.any(String),
        }),
      );
      expect(mockService.getMine).toHaveBeenCalledWith('user-uuid-1', 'files-list');
    });

    it('未知の tableId は BadRequestException を投げること', async () => {
      await expect(controller.getMine('user-uuid-1', 'unknown-table')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.getMine).not.toHaveBeenCalled();
    });
  });

  describe('upsert', () => {
    it('正常系: service.upsert 結果を返すこと', async () => {
      const expected = {
        success: true,
        data: {
          tableId: 'files-list',
          columnKey: 'name',
          width: 200,
          updatedAt: '2026-06-21T00:00:00.000Z',
        },
      };
      mockService.upsert.mockResolvedValue(expected);

      const dto: UpsertColumnWidthDto = { width: 200 };
      const result = await controller.upsert('user-uuid-1', 'files-list', 'name', dto);

      expect(result).toEqual(expected);
      expect(mockService.upsert).toHaveBeenCalledWith('user-uuid-1', 'files-list', 'name', 200);
    });

    it('未知の tableId は BadRequestException を投げること', async () => {
      const dto: UpsertColumnWidthDto = { width: 200 };

      await expect(controller.upsert('user-uuid-1', 'unknown-table', 'name', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.upsert).not.toHaveBeenCalled();
    });

    it('空文字 columnKey は BadRequestException を投げること', async () => {
      const dto: UpsertColumnWidthDto = { width: 200 };

      await expect(controller.upsert('user-uuid-1', 'files-list', '', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.upsert).not.toHaveBeenCalled();
    });

    it('65文字以上の columnKey は BadRequestException を投げること', async () => {
      const dto: UpsertColumnWidthDto = { width: 200 };
      const longKey = 'a'.repeat(65);

      await expect(controller.upsert('user-uuid-1', 'files-list', longKey, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.upsert).not.toHaveBeenCalled();
    });

    it.each(['__proto__', 'constructor', 'name with space', 'name<script>', '日本語'])(
      '不正文字を含む columnKey "%s" は BadRequestException を投げること',
      async (badKey) => {
        const dto: UpsertColumnWidthDto = { width: 200 };
        await expect(controller.upsert('user-uuid-1', 'files-list', badKey, dto)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockService.upsert).not.toHaveBeenCalled();
      },
    );

    it.each(['name', 'order_no', 'col-1', 'a.b', 'ns:key'])(
      '許可文字のみの columnKey "%s" は通ること',
      async (goodKey) => {
        const dto: UpsertColumnWidthDto = { width: 200 };
        mockService.upsert.mockResolvedValue({ success: true, data: {} });
        await expect(
          controller.upsert('user-uuid-1', 'files-list', goodKey, dto),
        ).resolves.toBeDefined();
        expect(mockService.upsert).toHaveBeenCalled();
      },
    );
  });

  describe('reset', () => {
    it('正常系: service.resetMine 結果を返すこと', async () => {
      const expected = { success: true, data: { deleted: 2 } };
      mockService.resetMine.mockResolvedValue(expected);

      const result = await controller.reset('user-uuid-1', 'files-list');

      expect(result).toEqual(expected);
      expect(mockService.resetMine).toHaveBeenCalledWith('user-uuid-1', 'files-list');
    });

    it('未知の tableId は BadRequestException を投げ service を呼ばないこと', async () => {
      await expect(controller.reset('user-uuid-1', 'unknown-table')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.resetMine).not.toHaveBeenCalled();
    });
  });
});
