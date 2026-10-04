import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { UserTableColumnWidthsRepository } from './user-table-column-widths.repository';
import { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  userTableColumnWidth: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('UserTableColumnWidthsRepository', () => {
  let repo: UserTableColumnWidthsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTableColumnWidthsRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repo = module.get<UserTableColumnWidthsRepository>(UserTableColumnWidthsRepository);
  });

  describe('findManyByUserAndTable', () => {
    it('userId・tableId で where 指定して findMany へ委譲する', async () => {
      const expected = [{ id: 'utcw-1' }];
      mockPrisma.userTableColumnWidth.findMany.mockResolvedValue(expected);

      const result = await repo.findManyByUserAndTable('acc-1', 'tasks');

      expect(mockPrisma.userTableColumnWidth.findMany).toHaveBeenCalledWith({
        where: { userId: 'acc-1', tableId: 'tasks' },
      });
      expect(result).toBe(expected);
    });
  });

  describe('upsert', () => {
    it('複合ユニークキー（userId_tableId_columnKey）で upsert する', async () => {
      const expected = {
        id: 'utcw-1',
        userId: 'acc-1',
        tableId: 'tasks',
        columnKey: 'title',
        width: 200,
      };
      mockPrisma.userTableColumnWidth.upsert.mockResolvedValue(expected);

      const result = await repo.upsert('acc-1', 'tasks', 'title', 200);

      expect(mockPrisma.userTableColumnWidth.upsert).toHaveBeenCalledWith({
        where: {
          userId_tableId_columnKey: { userId: 'acc-1', tableId: 'tasks', columnKey: 'title' },
        },
        update: { width: 200 },
        create: { userId: 'acc-1', tableId: 'tasks', columnKey: 'title', width: 200 },
      });
      expect(result).toBe(expected);
    });
  });

  describe('deleteAllByUserAndTable', () => {
    it('userId・tableId スコープで deleteMany し件数を返す（fil-0054・列幅リセット）', async () => {
      mockPrisma.userTableColumnWidth.deleteMany.mockResolvedValue({ count: 3 });

      const result = await repo.deleteAllByUserAndTable('acc-1', 'tasks');

      expect(mockPrisma.userTableColumnWidth.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'acc-1', tableId: 'tasks' },
      });
      expect(result).toBe(3);
    });
  });
});
