import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TagsService } from './tags.service';
import { TagsRepository } from './repositories/tags.repository';
import { makeTagEntity } from '../../__tests__/factories';

const mockRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('TagsService', () => {
  let service: TagsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsService, { provide: TagsRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  describe('findAll', () => {
    it('全タグを TagDto 配列（id/name/icon/color/archived のみ）で返す', async () => {
      mockRepo.findAll.mockResolvedValue([
        makeTagEntity({ id: 't1', name: '重要', icon: 'Star', color: 'red' }),
        makeTagEntity({ id: 't2', name: '請求', icon: 'Flag', color: 'blue' }),
      ]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        { id: 't1', name: '重要', icon: 'Star', color: 'red', archived: false },
        { id: 't2', name: '請求', icon: 'Flag', color: 'blue', archived: false },
      ]);
    });

    it('includeArchived 未指定は repo へ false を渡す（既定でアーカイブ済を除外・fil-0094）', async () => {
      mockRepo.findAll.mockResolvedValue([]);

      await service.findAll();
      await service.findAll({});

      expect(mockRepo.findAll).toHaveBeenNthCalledWith(1, false);
      expect(mockRepo.findAll).toHaveBeenNthCalledWith(2, false);
    });

    it('includeArchived:true を repo へ伝搬し、archived フラグを畳んで返す（fil-0094）', async () => {
      const archived = makeTagEntity({ id: 't2', name: '旧', archivedAt: new Date() });
      mockRepo.findAll.mockResolvedValue([makeTagEntity({ id: 't1' }), archived]);

      const result = await service.findAll({ includeArchived: true });

      expect(mockRepo.findAll).toHaveBeenCalledWith(true);
      expect(result.data[1].archived).toBe(true);
      expect(result.data[1]).not.toHaveProperty('archivedAt');
    });
  });

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

    it('制御文字のみの名前はサニタイズで空になり BadRequest', async () => {
      await expect(
        service.create({ name: '\x00\x01\x7f', icon: 'Star', color: 'red' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('BiDi 制御 / ゼロ幅文字を除去して保存する（表示偽装の防止）', async () => {
      mockRepo.findByName.mockResolvedValue(null);
      mockRepo.create.mockImplementation(async (data) =>
        makeTagEntity({ id: 'new', name: data.name, icon: data.icon, color: data.color }),
      );
      // RLO(U+202E) + 'abc' + ZWSP(U+200B) + LRM(U+200E) → 不可視文字は全除去され 'abc' のみ残る。
      const dirty = String.fromCharCode(0x202e) + 'abc' + String.fromCharCode(0x200b, 0x200e);

      await service.create({ name: dirty, icon: 'Star', color: 'red' });

      expect(mockRepo.create).toHaveBeenCalledWith({ name: 'abc', icon: 'Star', color: 'red' });
    });

    it('正常: 前後空白を詰めた名前で作成し TagDto を返す', async () => {
      mockRepo.findByName.mockResolvedValue(null);
      mockRepo.create.mockImplementation(async (data) =>
        makeTagEntity({ id: 'new', name: data.name, icon: data.icon, color: data.color }),
      );

      const result = await service.create({ name: '  重要  ', icon: 'Star', color: 'blue' });

      // 重複チェック・作成いずれもサニタイズ後の名前で行う。
      expect(mockRepo.findByName).toHaveBeenCalledWith('重要');
      expect(mockRepo.create).toHaveBeenCalledWith({ name: '重要', icon: 'Star', color: 'blue' });
      expect(result.data).toEqual({
        id: 'new',
        name: '重要',
        icon: 'Star',
        color: 'blue',
        archived: false,
      });
    });
  });

  describe('update', () => {
    it('name / icon / color / archived すべて未指定なら BadRequest（存在確認もしない）', async () => {
      await expect(service.update('t1', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });

    it('対象タグ不在なら NotFound', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update('missing', { icon: 'Flag' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('改名先が自分以外の同名と衝突すれば Conflict', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 't1', name: '旧' }));
      mockRepo.findByName.mockResolvedValue(makeTagEntity({ id: 'other', name: '重要' }));

      await expect(service.update('t1', { name: '重要' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('自分自身と同名（改名なし相当）なら衝突扱いせず更新する', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 't1', name: '重要' }));
      mockRepo.findByName.mockResolvedValue(makeTagEntity({ id: 't1', name: '重要' }));
      mockRepo.update.mockImplementation(async (id, data) =>
        makeTagEntity({ id, name: data.name ?? '重要', icon: data.icon ?? 'Star' }),
      );

      const result = await service.update('t1', { name: '重要', icon: 'Flag' });

      expect(mockRepo.update).toHaveBeenCalledWith('t1', { name: '重要', icon: 'Flag' });
      expect(result.data).toMatchObject({ id: 't1', icon: 'Flag' });
    });

    it('icon のみ更新: name は undefined で渡し重複チェックを行わない', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 't1', name: '重要' }));
      mockRepo.update.mockImplementation(async (id, data) =>
        makeTagEntity({ id, name: '重要', icon: data.icon ?? 'Star' }),
      );

      await service.update('t1', { icon: 'Flag' });

      expect(mockRepo.findByName).not.toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith('t1', { name: undefined, icon: 'Flag' });
    });

    // fil-0094: archived → archivedAt の畳み込み（hom-0083 の横展開・computeArchivedAt 共用）。
    it('archived:true でアーカイブ日時を刻む（fil-0094）', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 't1' })); // archivedAt: null
      mockRepo.update.mockResolvedValue(makeTagEntity({ id: 't1', archivedAt: new Date() }));

      const result = await service.update('t1', { archived: true });

      expect(mockRepo.update).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ archivedAt: expect.any(Date) }),
      );
      expect(result.data.archived).toBe(true);
    });

    it('archived:false でアーカイブを解除（null 化）する', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 't1', archivedAt: new Date() }));
      mockRepo.update.mockResolvedValue(makeTagEntity({ id: 't1', archivedAt: null }));

      const result = await service.update('t1', { archived: false });

      expect(mockRepo.update).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ archivedAt: null }),
      );
      expect(result.data.archived).toBe(false);
    });

    it('既にアーカイブ済へ archived:true を再送しても日時を上書きしない（初回アーカイブ日時を保持）', async () => {
      const archivedAt = new Date('2026-06-01T00:00:00Z');
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 't1', archivedAt }));
      mockRepo.update.mockResolvedValue(makeTagEntity({ id: 't1', archivedAt }));

      await service.update('t1', { archived: true });

      // archivedAt を data に含めない（undefined のまま渡し、repo/Prisma が更新スキップして既存値を保持）
      expect(mockRepo.update).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ archivedAt: undefined }),
      );
    });
  });

  describe('delete', () => {
    it('対象タグ不在なら NotFound', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('正常: 削除し ok({id}) を返す（付与は Cascade）', async () => {
      mockRepo.findById.mockResolvedValue(makeTagEntity({ id: 't1' }));
      mockRepo.delete.mockResolvedValue(makeTagEntity({ id: 't1' }));

      const result = await service.delete('t1');

      expect(mockRepo.delete).toHaveBeenCalledWith('t1');
      expect(result).toEqual({ success: true, data: { id: 't1' } });
    });
  });
});
