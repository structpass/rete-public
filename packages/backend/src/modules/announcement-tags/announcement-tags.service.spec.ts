import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AnnouncementTagsService } from './announcement-tags.service';
import { AnnouncementTagsRepository } from './repositories/announcement-tags.repository';
// cmn-0040(E34): 各 spec のインライン factory を共有 factory へ集約。
import { makeAnnouncementTagEntity as makeTagEntity } from '../../__tests__/factories';

const mockRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('AnnouncementTagsService', () => {
  let service: AnnouncementTagsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementTagsService,
        { provide: AnnouncementTagsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<AnnouncementTagsService>(AnnouncementTagsService);
  });

  // ----------------------------------------------------------------
  // findAll
  // ----------------------------------------------------------------
  describe('findAll', () => {
    it('全タグを AnnouncementTagDto 配列（id/name/icon/color/archived のみ）で返す（§1 DTO 境界）', async () => {
      mockRepo.findAll.mockResolvedValue([
        makeTagEntity({ id: 'a1', name: '重要', icon: 'Star', color: 'red' }),
        makeTagEntity({ id: 'a2', name: '新着', icon: 'Bell', color: 'blue' }),
      ]);

      const result = await service.findAll({ kind: 'board' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        { id: 'a1', name: '重要', icon: 'Star', color: 'red', archived: false },
        { id: 'a2', name: '新着', icon: 'Bell', color: 'blue', archived: false },
      ]);
      // createdAt / updatedAt が DTO に漏れていないことを確認（§1 DTO 境界）。
      expect(result.data[0]).not.toHaveProperty('createdAt');
    });

    it('includeArchived 未指定は repo へ false を渡す（既定でアーカイブ済を除外・hom-0083）', async () => {
      mockRepo.findAll.mockResolvedValue([]);

      await service.findAll({ kind: 'board' });

      expect(mockRepo.findAll).toHaveBeenCalledWith('board', false);
    });

    it('includeArchived:true を repo へ伝搬し、archived フラグを畳んで返す（hom-0083）', async () => {
      const archived = makeTagEntity({ id: 'a2', name: '旧', archivedAt: new Date() });
      mockRepo.findAll.mockResolvedValue([makeTagEntity({ id: 'a1' }), archived]);

      const result = await service.findAll({ kind: 'board', includeArchived: true });

      expect(mockRepo.findAll).toHaveBeenCalledWith('board', true);
      expect(result.data[1].archived).toBe(true);
      expect(result.data[1]).not.toHaveProperty('archivedAt');
    });
  });

  // ----------------------------------------------------------------
  // create
  // ----------------------------------------------------------------
  describe('create', () => {
    it('同名タグが既に存在すれば Conflict（作成しない）', async () => {
      mockRepo.findByName.mockResolvedValue(makeTagEntity({ id: 'other', name: '重要' }));

      await expect(
        service.create({ name: '重要', icon: 'Star', color: 'red' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('サニタイズ後に空になる名前は BadRequest（重複チェックへ進まない）', async () => {
      await expect(
        service.create({ name: '   ', icon: 'Star', color: 'red' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.findByName).not.toHaveBeenCalled();
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('正常: 前後空白を詰めた名前で作成し AnnouncementTagDto を返す', async () => {
      mockRepo.findByName.mockResolvedValue(null);
      mockRepo.create.mockImplementation(
        async (data: { name: string; icon: string; color: string }) =>
          makeTagEntity({ id: 'new', name: data.name, icon: data.icon, color: data.color }),
      );

      const result = await service.create({ name: '  重要  ', icon: 'Star', color: 'blue' });

      expect(mockRepo.findByName).toHaveBeenCalledWith('board', '重要');
      expect(mockRepo.create).toHaveBeenCalledWith({
        kind: 'board',
        name: '重要',
        icon: 'Star',
        color: 'blue',
      });
      expect(result.data).toEqual({
        id: 'new',
        name: '重要',
        icon: 'Star',
        color: 'blue',
        archived: false,
      });
    });

    it('BiDi 制御 / ゼロ幅文字を除去して保存する（表示偽装の防止）', async () => {
      mockRepo.findByName.mockResolvedValue(null);
      mockRepo.create.mockImplementation(
        async (data: { name: string; icon: string; color: string }) =>
          makeTagEntity({ id: 'new', name: data.name, icon: data.icon, color: data.color }),
      );
      const dirty = String.fromCharCode(0x202e) + 'abc' + String.fromCharCode(0x200b, 0x200e);

      await service.create({ name: dirty, icon: 'Star', color: 'red' });

      expect(mockRepo.create).toHaveBeenCalledWith({
        kind: 'board',
        name: 'abc',
        icon: 'Star',
        color: 'red',
      });
    });
  });

  // ----------------------------------------------------------------
  // update
  // ----------------------------------------------------------------
  describe('update', () => {
    it('name / icon / color すべて未指定なら BadRequest（存在確認もしない）', async () => {
      await expect(service.update('a1', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });

    it('対象タグ不在なら NotFound', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update('missing', { icon: 'Bell' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('改名先が自分以外の同名と衝突すれば Conflict', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 'a1', name: '旧' }));
      mockRepo.findByName.mockResolvedValue(makeTagEntity({ id: 'other', name: '重要' }));

      await expect(service.update('a1', { name: '重要' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('自分自身と同名（改名なし相当）なら衝突扱いせず更新する', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 'a1', name: '重要' }));
      mockRepo.findByName.mockResolvedValue(makeTagEntity({ id: 'a1', name: '重要' }));
      mockRepo.update.mockImplementation(
        async (id: string, data: { name?: string; icon?: string; color?: string }) =>
          makeTagEntity({ id, name: data.name ?? '重要', icon: data.icon ?? 'Star' }),
      );

      const result = await service.update('a1', { name: '重要', icon: 'Bell' });

      expect(mockRepo.update).toHaveBeenCalledWith('a1', { name: '重要', icon: 'Bell' });
      expect(result.data).toMatchObject({ id: 'a1', icon: 'Bell' });
    });

    it('icon のみ更新: name は undefined で渡し重複チェックを行わない', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 'a1', name: '重要' }));
      mockRepo.update.mockImplementation(
        async (id: string, data: { name?: string; icon?: string; color?: string }) =>
          makeTagEntity({ id, name: '重要', icon: data.icon ?? 'Star' }),
      );

      await service.update('a1', { icon: 'Bell' });

      expect(mockRepo.findByName).not.toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith('a1', { name: undefined, icon: 'Bell' });
    });

    it('archived:true でアーカイブ日時を刻む（hom-0083・Category と同方針）', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 'a1' })); // archivedAt: null
      mockRepo.update.mockResolvedValue(makeTagEntity({ id: 'a1', archivedAt: new Date() }));

      const result = await service.update('a1', { archived: true });

      expect(mockRepo.update).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ archivedAt: expect.any(Date) }),
      );
      expect(result.data.archived).toBe(true);
    });

    it('archived:false でアーカイブを解除（null 化）する', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 'a1', archivedAt: new Date() }));
      mockRepo.update.mockResolvedValue(makeTagEntity({ id: 'a1', archivedAt: null }));

      const result = await service.update('a1', { archived: false });

      expect(mockRepo.update).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ archivedAt: null }),
      );
      expect(result.data.archived).toBe(false);
    });

    it('既にアーカイブ済へ archived:true を再送しても日時を上書きしない（初回アーカイブ日時を保持）', async () => {
      const archivedAt = new Date('2026-06-01T00:00:00Z');
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 'a1', archivedAt }));
      mockRepo.update.mockResolvedValue(makeTagEntity({ id: 'a1', archivedAt }));

      await service.update('a1', { archived: true });

      // archivedAt を data に含めない（undefined のまま渡し、repo/Prisma が更新スキップして既存値を保持）
      expect(mockRepo.update).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ archivedAt: undefined }),
      );
    });
  });

  // ----------------------------------------------------------------
  // delete
  // ----------------------------------------------------------------
  describe('delete', () => {
    it('対象タグ不在なら NotFound', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('正常: 削除し ok({id}) を返す（付与は Cascade）', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 'a1' }));
      mockRepo.delete.mockResolvedValue(makeTagEntity({ id: 'a1' }));

      const result = await service.delete('a1');

      expect(mockRepo.delete).toHaveBeenCalledWith('a1');
      expect(result).toEqual({ success: true, data: { id: 'a1' } });
    });
  });
});
