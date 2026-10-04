import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { UserTableColumnWidth } from '@prisma/client';
import { UserTableColumnWidthsService } from './user-table-column-widths.service';
import { UserTableColumnWidthsRepository } from './repositories/user-table-column-widths.repository';

const baseEntity: UserTableColumnWidth = {
  userId: 'user-uuid-1',
  tableId: 'files-list',
  columnKey: 'name',
  width: 200,
  updatedAt: new Date('2026-06-21T00:00:00Z'),
};

const mockRepo = {
  findManyByUserAndTable: jest.fn(),
  upsert: jest.fn(),
  deleteAllByUserAndTable: jest.fn(),
};

describe('UserTableColumnWidthsService', () => {
  let service: UserTableColumnWidthsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTableColumnWidthsService,
        { provide: UserTableColumnWidthsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<UserTableColumnWidthsService>(UserTableColumnWidthsService);
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('getMine', () => {
    it('repo.findManyByUserAndTable を呼んで ok shape を返すこと', async () => {
      mockRepo.findManyByUserAndTable.mockResolvedValue([baseEntity]);

      const result = await service.getMine('user-uuid-1', 'files-list');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      // DTO shape: userId なし、tableId / columnKey / width / updatedAt(ISO)
      expect(result.data[0]).toEqual({
        tableId: 'files-list',
        columnKey: 'name',
        width: 200,
        updatedAt: '2026-06-21T00:00:00.000Z',
      });
      expect(mockRepo.findManyByUserAndTable).toHaveBeenCalledWith('user-uuid-1', 'files-list');
    });

    it('空配列の場合も success を返すこと', async () => {
      mockRepo.findManyByUserAndTable.mockResolvedValue([]);

      const result = await service.getMine('user-uuid-1', 'files-list');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('upsert', () => {
    it('repo.upsert を呼んで ok(dto) shape を返すこと', async () => {
      mockRepo.upsert.mockResolvedValue(baseEntity);

      const result = await service.upsert('user-uuid-1', 'files-list', 'name', 200);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        tableId: 'files-list',
        columnKey: 'name',
        width: 200,
        updatedAt: '2026-06-21T00:00:00.000Z',
      });
      expect(mockRepo.upsert).toHaveBeenCalledWith('user-uuid-1', 'files-list', 'name', 200);
    });

    it('repo.upsert の引数 (userId, tableId, columnKey, width) が正しく渡されること', async () => {
      mockRepo.upsert.mockResolvedValue({ ...baseEntity, columnKey: 'updatedAt', width: 136 });

      await service.upsert('user-uuid-1', 'files-list', 'updatedAt', 136);

      expect(mockRepo.upsert).toHaveBeenCalledWith('user-uuid-1', 'files-list', 'updatedAt', 136);
    });
  });

  describe('resetMine', () => {
    it('repo.deleteAllByUserAndTable を呼んで ok({ deleted }) を返すこと', async () => {
      mockRepo.deleteAllByUserAndTable.mockResolvedValue(3);

      const result = await service.resetMine('user-uuid-1', 'files-list');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ deleted: 3 });
      expect(mockRepo.deleteAllByUserAndTable).toHaveBeenCalledWith('user-uuid-1', 'files-list');
    });

    it('保存値が無い場合も deleted:0 で success を返すこと', async () => {
      mockRepo.deleteAllByUserAndTable.mockResolvedValue(0);

      const result = await service.resetMine('user-uuid-1', 'files-list');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ deleted: 0 });
    });
  });
});
