import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TagsRepository } from './tags.repository';
import { PrismaService } from '../../../database/prisma.service';
import { makeTagEntity } from '../../../__tests__/factories';

/**
 * TagsRepository の unit test（fil-0094）。PrismaService を mock 化し、
 * repository が正しい Prisma delegate（prisma.tag）を呼ぶことを検証する
 * （announcement-tags.repository.spec と同型）。
 */

const mockPrisma = {
  tag: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('TagsRepository', () => {
  let repo: TagsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<TagsRepository>(TagsRepository);
  });

  describe('findAll', () => {
    it('既定（includeArchived 未指定）は archivedAt: null を where に含め name 昇順で findMany を呼ぶ（fil-0094）', async () => {
      const rows = [
        makeTagEntity({ id: 't1', name: '請求' }),
        makeTagEntity({ id: 't2', name: '重要' }),
      ];
      mockPrisma.tag.findMany.mockResolvedValue(rows);

      const result = await repo.findAll();

      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: { archivedAt: null },
        orderBy: { name: 'asc' },
      });
      expect(result).toBe(rows);
    });

    it('includeArchived: true は archivedAt 条件を外し全件を返す', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([]);

      await repo.findAll(true);

      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('id で findUnique を呼ぶ', async () => {
      const row = makeTagEntity();
      mockPrisma.tag.findUnique.mockResolvedValue(row);

      const result = await repo.findById('tag-1');

      expect(mockPrisma.tag.findUnique).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
      expect(result).toBe(row);
    });

    it('存在しない id は null を返す', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(null);

      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findByName', () => {
    it('name で findUnique を呼び、全列（archivedAt 含む）を返す（アーカイブ済み同名判定・hom-0103 横展開）', async () => {
      const row = makeTagEntity({ archivedAt: new Date('2026-07-01T00:00:00Z') });
      mockPrisma.tag.findUnique.mockResolvedValue(row);

      const result = await repo.findByName('重要');

      expect(mockPrisma.tag.findUnique).toHaveBeenCalledWith({ where: { name: '重要' } });
      expect(result?.archivedAt).toEqual(new Date('2026-07-01T00:00:00Z'));
    });
  });

  describe('create', () => {
    it('name / icon / color で create を呼ぶ', async () => {
      const row = makeTagEntity();
      mockPrisma.tag.create.mockResolvedValue(row);

      const result = await repo.create({ name: '重要', icon: 'Star', color: 'slate' });

      expect(mockPrisma.tag.create).toHaveBeenCalledWith({
        data: { name: '重要', icon: 'Star', color: 'slate' },
      });
      expect(result).toBe(row);
    });
  });

  describe('update', () => {
    it('id と部分 data（archivedAt 含む）で update を呼ぶ', async () => {
      const row = makeTagEntity({ icon: 'Bell' });
      mockPrisma.tag.update.mockResolvedValue(row);

      const result = await repo.update('tag-1', { icon: 'Bell', archivedAt: null });

      expect(mockPrisma.tag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { icon: 'Bell', archivedAt: null },
      });
      expect(result).toBe(row);
    });
  });

  describe('delete', () => {
    it('id で delete を呼ぶ', async () => {
      mockPrisma.tag.delete.mockResolvedValue(makeTagEntity());

      await repo.delete('tag-1');

      expect(mockPrisma.tag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
    });
  });
});
