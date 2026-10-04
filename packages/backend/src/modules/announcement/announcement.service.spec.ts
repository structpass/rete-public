import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import { AnnouncementRepository } from './repositories/announcement.repository';
import { AttachmentsService } from '../attachments/attachments.service';
import type { AnnouncementWithAuthor } from './repositories/announcement.repository';

const mockRepo = {
  findManyAndCount: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findReadIds: jest.fn(),
  markRead: jest.fn(),
  countUnread: jest.fn(),
  reorder: jest.fn(),
  minPosition: jest.fn(),
  setTags: jest.fn(),
  countAnnouncementTagsByIds: jest.fn(),
};

// 添付は AttachmentsService に委譲する（H0022）。本 spec では list は空配列既定、attach/detach は委譲確認のみ。
const mockAttachments = {
  listDtosForAnnouncement: jest.fn(),
  createForAnnouncement: jest.fn(),
  removeForAnnouncement: jest.fn(),
};

function makeAnnouncement(overrides: Partial<AnnouncementWithAuthor> = {}): AnnouncementWithAuthor {
  const base = new Date('2026-06-01T00:00:00.000Z');
  return {
    id: 'ann-1',
    title: 'お知らせ',
    body: '<p>本文</p>',
    kind: 'board',
    authorId: 'acc-1',
    publishedAt: base,
    createdAt: base,
    updatedAt: base,
    author: { name: '田中 太郎' },
    ...overrides,
  } as AnnouncementWithAuthor;
}

describe('AnnouncementService', () => {
  let service: AnnouncementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementService,
        { provide: AnnouncementRepository, useValue: mockRepo },
        { provide: AttachmentsService, useValue: mockAttachments },
      ],
    }).compile();

    service = module.get<AnnouncementService>(AnnouncementService);
    // 添付一覧は既定で空配列（detail 埋め込みで undefined にならないよう常に配列を返す）。
    mockAttachments.listDtosForAnnouncement.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('一覧 + ページング meta を { success, data, meta } で返す', async () => {
      mockRepo.findManyAndCount.mockResolvedValue({
        items: [makeAnnouncement({ id: 'a1' }), makeAnnouncement({ id: 'a2' })],
        total: 5,
      });
      mockRepo.findReadIds.mockResolvedValue(new Set());

      const result = await service.findAll({ page: 2, limit: 2, kind: 'board' }, 'acc-1');

      expect(mockRepo.findManyAndCount).toHaveBeenCalledWith(2, 2, 'board');
      expect(result.success).toBe(true);
      expect(result.data.map((d) => d.id)).toEqual(['a1', 'a2']);
      expect(result.data[0]).not.toHaveProperty('body');
      expect(result.meta).toMatchObject({ total: 5, page: 2, limit: 2 });
    });

    it('既読 id 集合に含まれる行は unread=false、含まれない行は unread=true（HM-3・ADR 0029）', async () => {
      mockRepo.findManyAndCount.mockResolvedValue({
        items: [makeAnnouncement({ id: 'read-1' }), makeAnnouncement({ id: 'unread-1' })],
        total: 2,
      });
      mockRepo.findReadIds.mockResolvedValue(new Set(['read-1']));

      const result = await service.findAll({ page: 1, limit: 20, kind: 'board' }, 'acc-1');

      expect(mockRepo.findReadIds).toHaveBeenCalledWith(['read-1', 'unread-1'], 'acc-1');
      expect(result.data.find((d) => d.id === 'read-1')!.unread).toBe(false);
      expect(result.data.find((d) => d.id === 'unread-1')!.unread).toBe(true);
    });
  });

  describe('findOne', () => {
    it('対象不在なら NotFound（既読化しない）', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'acc-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.markRead).not.toHaveBeenCalled();
    });

    it('詳細（body 込み）を { success, data } で返し、currentUserId があれば既読化する（GET 副作用 / ADR 0024・0029）', async () => {
      mockRepo.findById.mockResolvedValue(makeAnnouncement({ id: 'a1', body: '<p>詳細</p>' }));
      mockRepo.markRead.mockResolvedValue(undefined);

      const result = await service.findOne('a1', 'acc-1');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('a1');
      expect(result.data.body).toBe('<p>詳細</p>');
      expect(mockRepo.markRead).toHaveBeenCalledWith('a1', 'acc-1');
    });

    it('詳細に添付一覧を埋めて返す（H0022）', async () => {
      mockRepo.findById.mockResolvedValue(makeAnnouncement({ id: 'a1' }));
      mockRepo.markRead.mockResolvedValue(undefined);
      const att = { id: 'att-1', fileId: 'f1', fileName: 'a.pdf' };
      mockAttachments.listDtosForAnnouncement.mockResolvedValue([att]);

      const result = await service.findOne('a1', 'acc-1');

      expect(mockAttachments.listDtosForAnnouncement).toHaveBeenCalledWith('a1');
      expect(result.data.attachments).toEqual([att]);
    });

    it('既読化の失敗は握って詳細 200 を返す（副作用失敗を本筋に伝搬させない / ADR 0029）', async () => {
      mockRepo.findById.mockResolvedValue(makeAnnouncement({ id: 'a1' }));
      mockRepo.markRead.mockRejectedValue(new Error('db down'));

      const result = await service.findOne('a1', 'acc-1');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('a1');
    });
  });

  describe('countUnread', () => {
    it('未読数を { success, data: { count } } で返し、kind を repository へ渡す（hom-0143 で可視性フィルタ撤去）', async () => {
      mockRepo.countUnread.mockResolvedValue(3);

      const result = await service.countUnread('acc-1', 'board');

      expect(mockRepo.countUnread).toHaveBeenCalledWith('acc-1', 'board');
      expect(result.success).toBe(true);
      expect(result.data.count).toBe(3);
    });
  });

  describe('create', () => {
    // create は position 先頭採番のため minPosition を引く。既存通知なし（null → position 0）を既定とする。
    beforeEach(() => {
      mockRepo.minPosition.mockResolvedValue(null);
    });

    it('本文を sanitize（script 除去）した上で authorId 付きで永続化する', async () => {
      mockRepo.create.mockImplementation(async (authorId, data) =>
        makeAnnouncement({ ...data, authorId, id: 'new-1' }),
      );

      const result = await service.create('acc-9', {
        title: '新規',
        body: '<p>安全</p><script>alert(1)</script>',
      });

      const [authorIdArg, dataArg] = mockRepo.create.mock.calls[0];
      expect(authorIdArg).toBe('acc-9');
      expect(dataArg.title).toBe('新規');
      // sanitize により script は除去され、許可タグは残る。
      expect(dataArg.body).not.toContain('<script>');
      expect(dataArg.body).toContain('<p>安全</p>');
      expect(result.data.id).toBe('new-1');
    });

    it('body 未指定は空文字へ正規化する', async () => {
      mockRepo.create.mockImplementation(async (authorId, data) =>
        makeAnnouncement({ ...data, authorId }),
      );

      await service.create('acc-9', { title: 'タイトルのみ' });

      const [, dataArg] = mockRepo.create.mock.calls[0];
      expect(dataArg.body).toBe('');
    });

    it('position は現在の最小 - 1 で先頭に積む（既存ありなら新着優先 / H0021）', async () => {
      mockRepo.minPosition.mockResolvedValue(-2);
      mockRepo.create.mockImplementation(async (authorId, data) =>
        makeAnnouncement({ ...data, authorId }),
      );

      await service.create('acc-9', { title: '先頭' });

      const [, dataArg] = mockRepo.create.mock.calls[0];
      expect(dataArg.position).toBe(-3);
    });

    it('通知が無い（minPosition=null）時の position は 0', async () => {
      mockRepo.minPosition.mockResolvedValue(null);
      mockRepo.create.mockImplementation(async (authorId, data) =>
        makeAnnouncement({ ...data, authorId }),
      );

      await service.create('acc-9', { title: '最初' });

      expect(mockRepo.create.mock.calls[0][1].position).toBe(0);
    });
  });

  describe('update', () => {
    it('対象不在なら NotFound（更新しない）', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.update('missing', { title: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('指定キーのみ部分更新し、body 指定時のみ sanitize する', async () => {
      mockRepo.findById.mockResolvedValue(makeAnnouncement({ id: 'a1' }));
      mockRepo.update.mockImplementation(async (id, data) => makeAnnouncement({ id, ...data }));

      await service.update('a1', { body: '<p>改</p><script>x</script>' });

      const [idArg, dataArg] = mockRepo.update.mock.calls[0];
      expect(idArg).toBe('a1');
      // title は未指定キーとして生やさない（部分更新の shape を保つ）。
      expect(dataArg).not.toHaveProperty('title');
      expect(dataArg.body).not.toContain('<script>');
      expect(dataArg.body).toContain('<p>改</p>');
    });

    it('title のみ指定時は body を触らない', async () => {
      mockRepo.findById.mockResolvedValue(makeAnnouncement({ id: 'a1' }));
      mockRepo.update.mockImplementation(async (id, data) => makeAnnouncement({ id, ...data }));

      await service.update('a1', { title: '改題' });

      const [, dataArg] = mockRepo.update.mock.calls[0];
      expect(dataArg).toEqual({ title: '改題' });
      expect(dataArg).not.toHaveProperty('body');
    });
  });

  describe('remove', () => {
    it('対象不在なら NotFound（削除しない）', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('存在すれば削除しメッセージ応答を返す', async () => {
      mockRepo.findById.mockResolvedValue(makeAnnouncement({ id: 'a1' }));
      mockRepo.delete.mockResolvedValue(undefined);

      const result = await service.remove('a1');

      expect(mockRepo.delete).toHaveBeenCalledWith('a1');
      expect(result.success).toBe(true);
      expect(result.data.message).toContain('削除');
    });
  });

  describe('reorder', () => {
    it('orderedIds が全件と不一致（set-mismatch）なら BadRequest（H0021）', async () => {
      mockRepo.reorder.mockResolvedValue({ ok: false, reason: 'set-mismatch' });

      await expect(service.reorder('acc-1', { orderedIds: ['a1'] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('成功時は並び替え後の一覧を summary（unread 込み・body 無し）で返す', async () => {
      mockRepo.reorder.mockResolvedValue({
        ok: true,
        items: [makeAnnouncement({ id: 'a2' }), makeAnnouncement({ id: 'a1' })],
      });
      mockRepo.findReadIds.mockResolvedValue(new Set(['a1']));

      const result = await service.reorder('acc-1', { orderedIds: ['a2', 'a1'], kind: 'board' });

      expect(mockRepo.reorder).toHaveBeenCalledWith(['a2', 'a1'], 'board');
      expect(result.success).toBe(true);
      // 返却順は repo が返した並び替え後の順序をそのまま保つ。
      expect(result.data.map((d) => d.id)).toEqual(['a2', 'a1']);
      // 既読集合に含まれる a1 は unread=false、含まれない a2 は unread=true（findAll と同じ算出）。
      expect(result.data.find((d) => d.id === 'a1')!.unread).toBe(false);
      expect(result.data.find((d) => d.id === 'a2')!.unread).toBe(true);
      expect(result.data[0]).not.toHaveProperty('body');
    });
  });

  // ----------------------------------------------------------------
  // setTags（rete-home-0043）
  // ----------------------------------------------------------------
  describe('setTags', () => {
    it('お知らせ不在なら NotFound（タグ操作しない）', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.setTags('missing', { tagIds: ['tag-1'] })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.setTags).not.toHaveBeenCalled();
    });

    it('tagIds に存在しないタグ ID が含まれれば BadRequest（setTags しない）', async () => {
      mockRepo.findById.mockResolvedValue(makeAnnouncement({ id: 'a1' }));
      // 2 件のうち 1 件しか DB に存在しない（count=1 < ids.length=2）
      mockRepo.countAnnouncementTagsByIds.mockResolvedValue(1);

      await expect(
        service.setTags('a1', { tagIds: ['tag-1', 'tag-not-exist'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.setTags).not.toHaveBeenCalled();
    });

    it('空配列（全解除）は tag 存在チェックをスキップして setTags を呼ぶ', async () => {
      const ann = makeAnnouncement({ id: 'a1', tagAssignments: [] } as never);
      mockRepo.findById.mockResolvedValue(ann);
      mockRepo.setTags.mockResolvedValue(undefined);

      await service.setTags('a1', { tagIds: [] });

      expect(mockRepo.countAnnouncementTagsByIds).not.toHaveBeenCalled();
      expect(mockRepo.setTags).toHaveBeenCalledWith('a1', []);
    });

    it('正常: setTags を呼び更新後の詳細 DTO を返す（tags フィールド含む）', async () => {
      const ann = makeAnnouncement({
        id: 'a1',
        tagAssignments: [
          {
            announcementId: 'a1',
            tagId: 'tag-1',
            createdAt: new Date(),
            tag: {
              id: 'tag-1',
              name: '重要',
              icon: 'Star',
              color: 'red',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      } as never);
      mockRepo.findById
        .mockResolvedValueOnce(makeAnnouncement({ id: 'a1', tagAssignments: [] } as never)) // 存在確認
        .mockResolvedValueOnce(ann); // setTags 後の再 fetch
      mockRepo.countAnnouncementTagsByIds.mockResolvedValue(1);
      mockRepo.setTags.mockResolvedValue(undefined);
      mockAttachments.listDtosForAnnouncement.mockResolvedValue([]);

      const result = await service.setTags('a1', { tagIds: ['tag-1'] });

      // hom-0072: 存在確認は対象お知らせの kind でスコープする（他 kind のタグ混入を防ぐ）。
      expect(mockRepo.countAnnouncementTagsByIds).toHaveBeenCalledWith(['tag-1'], 'board');
      expect(mockRepo.setTags).toHaveBeenCalledWith('a1', ['tag-1']);
      expect(result.success).toBe(true);
      // tags フィールドが DTO に含まれることを確認
      expect(result.data.tags).toBeDefined();
      expect(result.data.tags).toEqual([
        { id: 'tag-1', name: '重要', icon: 'Star', color: 'red', archived: false },
      ]);
    });

    it('setTags 後の再 fetch が null（並走削除）なら NotFound に正規化する', async () => {
      mockRepo.findById
        .mockResolvedValueOnce(makeAnnouncement({ id: 'a1', tagAssignments: [] } as never)) // 存在確認
        .mockResolvedValueOnce(null); // setTags 後の再 fetch で消えていた
      mockRepo.countAnnouncementTagsByIds.mockResolvedValue(1);
      mockRepo.setTags.mockResolvedValue(undefined);

      await expect(service.setTags('a1', { tagIds: ['tag-1'] })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('attachments（H0022）', () => {
    it('addAttachment は AttachmentsService.createForAnnouncement へ委譲する', async () => {
      const created = { success: true, data: { id: 'att-1' } };
      mockAttachments.createForAnnouncement.mockResolvedValue(created);

      const result = await service.addAttachment('a1', 'file-1', 'acc-9');

      expect(mockAttachments.createForAnnouncement).toHaveBeenCalledWith('a1', 'file-1', 'acc-9');
      expect(result).toBe(created);
    });

    it('removeAttachment は AttachmentsService.removeForAnnouncement へ委譲する', async () => {
      const removed = { success: true, data: { id: 'att-1' } };
      mockAttachments.removeForAnnouncement.mockResolvedValue(removed);

      const result = await service.removeAttachment('a1', 'att-1');

      expect(mockAttachments.removeForAnnouncement).toHaveBeenCalledWith('a1', 'att-1');
      expect(result).toBe(removed);
    });
  });
});
