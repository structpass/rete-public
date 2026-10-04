import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AnnouncementTagsRepository } from './announcement-tags.repository';
import { PrismaService } from '../../../database/prisma.service';

/**
 * AnnouncementTagsRepository の unit test。PrismaService を mock 化し、
 * repository が正しい Prisma delegate（prisma.announcementTag）を呼ぶことを検証する。
 */

const FIXED_DATE = new Date('2026-06-17T00:00:00.000Z');

function makeAnnouncementTagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'atag-1',
    kind: 'board',
    name: '重要',
    icon: 'Star',
    color: 'slate',
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

const mockPrisma = {
  announcementTag: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('AnnouncementTagsRepository', () => {
  let repo: AnnouncementTagsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnnouncementTagsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<AnnouncementTagsRepository>(AnnouncementTagsRepository);
  });

  describe('findAll', () => {
    it('既定（includeArchived 未指定）は archivedAt: null を where に含め name 昇順で findMany を呼ぶ（hom-0083）', async () => {
      const rows = [
        makeAnnouncementTagRow({ id: 'a1', name: '新着' }),
        makeAnnouncementTagRow({ id: 'a2', name: '重要' }),
      ];
      mockPrisma.announcementTag.findMany.mockResolvedValue(rows);

      const result = await repo.findAll('board');

      expect(mockPrisma.announcementTag.findMany).toHaveBeenCalledWith({
        where: { kind: 'board', archivedAt: null },
        orderBy: { name: 'asc' },
      });
      expect(result).toBe(rows);
    });

    it('includeArchived: true は archivedAt 条件を外し全件を返す', async () => {
      mockPrisma.announcementTag.findMany.mockResolvedValue([]);

      await repo.findAll('board', true);

      expect(mockPrisma.announcementTag.findMany).toHaveBeenCalledWith({
        where: { kind: 'board' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('id で findUnique を呼ぶ', async () => {
      const row = makeAnnouncementTagRow();
      mockPrisma.announcementTag.findUnique.mockResolvedValue(row);

      const result = await repo.findById('atag-1');

      expect(mockPrisma.announcementTag.findUnique).toHaveBeenCalledWith({
        where: { id: 'atag-1' },
      });
      expect(result).toBe(row);
    });

    it('存在しない id は null を返す', async () => {
      mockPrisma.announcementTag.findUnique.mockResolvedValue(null);

      const result = await repo.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('kind+name で findUnique を呼ぶ（複合キー）', async () => {
      mockPrisma.announcementTag.findUnique.mockResolvedValue(null);

      await repo.findByName('board', '重要');

      expect(mockPrisma.announcementTag.findUnique).toHaveBeenCalledWith({
        where: { kind_name: { kind: 'board', name: '重要' } },
      });
    });
  });

  describe('create', () => {
    it('kind / name / icon / color で create を呼ぶ', async () => {
      const row = makeAnnouncementTagRow();
      mockPrisma.announcementTag.create.mockResolvedValue(row);

      const result = await repo.create({
        kind: 'board',
        name: '重要',
        icon: 'Star',
        color: 'slate',
      });

      expect(mockPrisma.announcementTag.create).toHaveBeenCalledWith({
        data: { kind: 'board', name: '重要', icon: 'Star', color: 'slate' },
      });
      expect(result).toBe(row);
    });
  });

  describe('update', () => {
    it('id と部分 data で update を呼ぶ', async () => {
      const row = makeAnnouncementTagRow({ icon: 'Bell' });
      mockPrisma.announcementTag.update.mockResolvedValue(row);

      const result = await repo.update('atag-1', { icon: 'Bell' });

      expect(mockPrisma.announcementTag.update).toHaveBeenCalledWith({
        where: { id: 'atag-1' },
        data: { icon: 'Bell' },
      });
      expect(result).toBe(row);
    });
  });

  describe('delete', () => {
    it('id で delete を呼ぶ', async () => {
      const row = makeAnnouncementTagRow();
      mockPrisma.announcementTag.delete.mockResolvedValue(row);

      await repo.delete('atag-1');

      expect(mockPrisma.announcementTag.delete).toHaveBeenCalledWith({
        where: { id: 'atag-1' },
      });
    });
  });
});
