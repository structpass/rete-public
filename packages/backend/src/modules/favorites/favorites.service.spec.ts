import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { UserFavorite } from '@prisma/client';
import { FavoritesService } from './favorites.service';
import { FavoritesRepository } from './repositories/favorites.repository';

const mockRepo = {
  findByAccount: jest.fn(),
  findByTarget: jest.fn(),
  createWithAutoSortOrder: jest.fn(),
  deleteOwned: jest.fn(),
  reorder: jest.fn(),
};

const ACCOUNT = 'acc-1';

function makeFavorite(overrides: Partial<UserFavorite> = {}): UserFavorite {
  const base = new Date('2026-06-01T00:00:00.000Z');
  return {
    id: 'fav-1',
    accountId: ACCOUNT,
    kind: 'chat',
    targetRef: 'theme-1',
    label: '中央倉庫PJ / general',
    sortOrder: 0,
    createdAt: base,
    updatedAt: base,
    ...overrides,
  } as UserFavorite;
}

describe('FavoritesService', () => {
  let service: FavoritesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FavoritesService, { provide: FavoritesRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<FavoritesService>(FavoritesService);
  });

  describe('findAll', () => {
    it('自分のお気に入りを DTO（内部列を出さない）で返す', async () => {
      mockRepo.findByAccount.mockResolvedValue([
        makeFavorite({ id: 'f1', kind: 'system', targetRef: 'products', label: '商品' }),
        makeFavorite({ id: 'f2', kind: 'file', targetRef: 'file-9', label: '契約書 / 2026' }),
      ]);

      const result = await service.findAll(ACCOUNT);

      expect(mockRepo.findByAccount).toHaveBeenCalledWith(ACCOUNT);
      expect(result.success).toBe(true);
      expect(result.data.map((d) => d.id)).toEqual(['f1', 'f2']);
      expect(result.data[0]).toEqual({
        id: 'f1',
        kind: 'system',
        targetRef: 'products',
        label: '商品',
      });
      // 内部列は漏らさない。
      expect(result.data[0]).not.toHaveProperty('accountId');
      expect(result.data[0]).not.toHaveProperty('sortOrder');
    });
  });

  describe('add', () => {
    it('targetRef 指定時はそのまま登録し、採番は createWithAutoSortOrder に委ねる（cmn-0346）', async () => {
      mockRepo.findByTarget.mockResolvedValue(null);
      mockRepo.createWithAutoSortOrder.mockImplementation(async (accountId, data) =>
        makeFavorite({ id: 'new-1', ...data, sortOrder: 3 }),
      );

      const result = await service.add(ACCOUNT, {
        kind: 'task',
        label: 'マイタスク',
        targetRef: 'task-7',
      });

      expect(mockRepo.createWithAutoSortOrder).toHaveBeenCalledWith(ACCOUNT, {
        kind: 'task',
        targetRef: 'task-7',
        label: 'マイタスク',
      });
      // sortOrder の計算は repository の tx 内採番（ここでは直接扱わない）。
      expect(mockRepo.createWithAutoSortOrder).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ sortOrder: expect.anything() }),
      );
      expect(result.data.id).toBe('new-1');
    });

    it('targetRef 省略時（system 以外）は合成 id（非空）を採番して登録する', async () => {
      mockRepo.findByTarget.mockResolvedValue(null);
      mockRepo.createWithAutoSortOrder.mockImplementation(async (accountId, data) =>
        makeFavorite({ id: 'new-1', ...data, sortOrder: 0 }),
      );

      await service.add(ACCOUNT, { kind: 'chat', label: '雑談' });

      const data = mockRepo.createWithAutoSortOrder.mock.calls[0][1];
      expect(typeof data.targetRef).toBe('string');
      expect(data.targetRef.length).toBeGreaterThan(0);
      // findByTarget は採番後の targetRef で重複検査される。
      expect(mockRepo.findByTarget).toHaveBeenCalledWith(ACCOUNT, 'chat', data.targetRef);
    });

    it("kind='system' で targetRef 省略時は BadRequest（randomUUID の仮 ID を採番しない・criteria【3】）", async () => {
      await expect(service.add(ACCOUNT, { kind: 'system', label: '商品' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepo.findByTarget).not.toHaveBeenCalled();
      expect(mockRepo.createWithAutoSortOrder).not.toHaveBeenCalled();
    });

    it('空白のみのラベルは trim 後に空になるため BadRequest（作成しない）', async () => {
      await expect(
        service.add(ACCOUNT, { kind: 'chat', label: '   ', targetRef: 'theme-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.createWithAutoSortOrder).not.toHaveBeenCalled();
    });

    it('ラベル前後の空白は trim して登録する', async () => {
      mockRepo.findByTarget.mockResolvedValue(null);
      mockRepo.createWithAutoSortOrder.mockImplementation(async (accountId, data) =>
        makeFavorite({ id: 'new-1', ...data }),
      );

      await service.add(ACCOUNT, { kind: 'chat', label: '  余白あり  ', targetRef: 'theme-z' });

      expect(mockRepo.createWithAutoSortOrder.mock.calls[0][1].label).toBe('余白あり');
    });

    it('同一リソースが既にあれば Conflict（作成しない）', async () => {
      mockRepo.findByTarget.mockResolvedValue(makeFavorite());

      await expect(
        service.add(ACCOUNT, { kind: 'chat', label: '重複', targetRef: 'theme-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockRepo.createWithAutoSortOrder).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('自分の所有でない / 不在（削除 0 件）なら NotFound', async () => {
      mockRepo.deleteOwned.mockResolvedValue(0);
      await expect(service.remove(ACCOUNT, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('削除できればメッセージ応答（accountId スコープで削除）', async () => {
      mockRepo.deleteOwned.mockResolvedValue(1);
      const result = await service.remove(ACCOUNT, 'fav-1');
      expect(mockRepo.deleteOwned).toHaveBeenCalledWith(ACCOUNT, 'fav-1');
      expect(result.data.message).toContain('削除');
    });
  });

  describe('reorder', () => {
    it('repository が ok を返せば反映後の一覧を DTO で返す', async () => {
      mockRepo.reorder.mockResolvedValue({
        ok: true,
        items: [makeFavorite({ id: 'b' }), makeFavorite({ id: 'a' })],
      });

      const result = await service.reorder(ACCOUNT, { orderedIds: ['b', 'a'] });

      expect(mockRepo.reorder).toHaveBeenCalledWith(ACCOUNT, ['b', 'a']);
      expect(result.data.map((d) => d.id)).toEqual(['b', 'a']);
      // 内部列は漏らさない。
      expect(result.data[0]).not.toHaveProperty('sortOrder');
    });

    it('repository が set-mismatch を返せば BadRequest（集合不一致は tx 内検証）', async () => {
      mockRepo.reorder.mockResolvedValue({ ok: false, reason: 'set-mismatch' });

      await expect(service.reorder(ACCOUNT, { orderedIds: ['a'] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
