import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AttachmentsRepository, attachmentDisplayInclude } from './attachments.repository';
import { PrismaService } from '../../../database/prisma.service';

/**
 * AttachmentsRepository のユニットテスト。Prisma はモックし、DB アクセス層の境界だけを固定する。
 *
 * ここで検証すること:
 * - 添付先の存在確認クエリが、可視性判定（ADR 0038）に要る spaceId を必ず select していること
 *   （select 全体を完全一致で見るため、spaceId が落ちたら必ず落ちる）。
 * - 表示用 include に個人情報（email / passwordHash 等）が乗らないこと。
 * - 添付一覧5種がすべて createdAt 昇順 + id 昇順の二段キー安定順で引かれること
 *   （一括添付で createdAt が同値になる複数行の順序を DB 任せにせず、毎回同じ並びにする）。
 * - 版固定が versionNo 降順の先頭1件（findFirst）であること。
 * - 添付先 XOR 制約（taskId / chatMessageId / themeId / announcementId / taskCommentId の
 *   うちちょうど1つだけが非 NULL）は DB の raw CHECK（migration 手書き）と service の
 *   resolveTarget（attachments.service.ts:182-）の二重防御で担保する（DBT-13 参照）。
 *
 * E2E / 実 DB へ委譲すること:
 * - 実 PostgreSQL での実際の並び順・二重添付の @@unique 違反（P2002）の発生と 409 への写像・
 *   Prisma が最終的に発行する SQL。
 */

const mockPrisma = {
  task: { findUnique: jest.fn(), findFirst: jest.fn() },
  chatMessage: { findUnique: jest.fn() },
  chatTheme: { findUnique: jest.fn(), findFirst: jest.fn() },
  announcement: { findUnique: jest.fn() },
  taskComment: { findUnique: jest.fn() },
  fileVersion: { findFirst: jest.fn() },
  folder: { findFirst: jest.fn() },
  attachment: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};

describe('AttachmentsRepository', () => {
  let repo: AttachmentsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AttachmentsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<AttachmentsRepository>(AttachmentsRepository);
  });

  // ============================================================
  // 表示用 include（個人情報を乗せない）
  // ============================================================
  describe('attachmentDisplayInclude', () => {
    it('include は fileVersion / attachedBy の2つだけで、attachedBy は name のみ（個人情報を含まない）', () => {
      expect(Object.keys(attachmentDisplayInclude)).toEqual(['fileVersion', 'attachedBy']);
      expect(attachmentDisplayInclude.attachedBy.select).toEqual({ name: true });
    });

    it('fileVersion の select が版情報＋ファイル名のみと完全一致する', () => {
      expect(attachmentDisplayInclude.fileVersion.select).toEqual({
        id: true,
        versionNo: true,
        byteSize: true,
        mimeType: true,
        file: { select: { id: true, name: true } },
      });
    });
  });

  // ============================================================
  // 添付先の存在確認（ACL 用 spaceId の select＝落ちると権限判定が壊れる）
  // ============================================================
  describe('添付先の存在確認と spaceId 解決', () => {
    it('findTaskById が spaceId を select する', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 1, spaceId: 's1' });

      await repo.findTaskById(1);

      expect(mockPrisma.task.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { id: true, spaceId: true },
      });
    });

    it('findThemeById が spaceId を select する', async () => {
      mockPrisma.chatTheme.findUnique.mockResolvedValue({ id: 't1', spaceId: 's1' });

      await repo.findThemeById('t1');

      expect(mockPrisma.chatTheme.findUnique).toHaveBeenCalledWith({
        where: { id: 't1' },
        select: { id: true, spaceId: true },
      });
    });

    it('findChatMessageById は親テーマの spaceId を、発話の実在に依らない 2 本で解決する（v2-262）', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue({ id: 'm1' });
      mockPrisma.chatTheme.findFirst.mockResolvedValue({ spaceId: 's1' });

      const result = await repo.findChatMessageById('m1');

      expect(mockPrisma.chatMessage.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        select: { id: true },
      });
      // 親テーマは発話 id の関係フィルタで引く（入れ子 select だと発話行が在るときだけ関係クエリが
      // 1 本増え、不在 / 実在で本数が割れて応答時間が存在の oracle になる）。
      expect(mockPrisma.chatTheme.findFirst).toHaveBeenCalledWith({
        where: { messages: { some: { id: 'm1' } } },
        select: { spaceId: true },
      });
      expect(result).toEqual({ id: 'm1', theme: { spaceId: 's1' } });
    });

    it('findChatMessageById は発話が無くても親テーマの照会を省かない（常に 2 本・null を返す）', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue(null);

      await expect(repo.findChatMessageById('missing')).resolves.toBeNull();

      expect(mockPrisma.chatMessage.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.chatTheme.findFirst).toHaveBeenCalledTimes(1);
    });

    it('findTaskCommentById は親タスクの spaceId を、コメントの実在に依らない 2 本で解決する（v2-262）', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.task.findFirst.mockResolvedValue({ spaceId: 's1' });

      const result = await repo.findTaskCommentById('c1');

      expect(mockPrisma.taskComment.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        select: { id: true },
      });
      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: { comments: { some: { id: 'c1' } } },
        select: { spaceId: true },
      });
      expect(result).toEqual({ id: 'c1', task: { spaceId: 's1' } });
    });

    it('findTaskCommentById はコメントが無くても親タスクの照会を省かない（常に 2 本・null を返す）', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue(null);

      await expect(repo.findTaskCommentById('missing')).resolves.toBeNull();

      expect(mockPrisma.taskComment.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.task.findFirst).toHaveBeenCalledTimes(1);
    });

    // 掲示板通知だけ spaceId を取らない非対称は意図的（通知添付は ADMIN 専用経路で統制する設計・
    // attachments.service.ts:101-107）。現状挙動の記録に留め、spaceId を期待する赤テストは置かない。
    it('findAnnouncementById は id のみ select する（spaceId 非対称は現状挙動の記録）', async () => {
      mockPrisma.announcement.findUnique.mockResolvedValue({ id: 'a1' });

      await repo.findAnnouncementById('a1');

      expect(mockPrisma.announcement.findUnique).toHaveBeenCalledWith({
        where: { id: 'a1' },
        select: { id: true },
      });
    });
  });

  // ============================================================
  // 版固定
  // ============================================================
  describe('findLatestFileVersion', () => {
    it('versionNo 降順の先頭1件を findFirst で引く（findMany でも昇順でもない）', async () => {
      mockPrisma.fileVersion.findFirst.mockResolvedValue({ id: 'v2', versionNo: 2 });
      mockPrisma.folder.findFirst.mockResolvedValue({ spaceId: 'space-1' });

      const result = await repo.findLatestFileVersion('f1');

      expect(mockPrisma.fileVersion.findFirst).toHaveBeenCalledWith({
        where: { fileId: 'f1' },
        orderBy: { versionNo: 'desc' },
        select: { id: true, versionNo: true },
      });
      // 器はファイル id の関係フィルタで引く（入れ子 select だと版が在るときだけ親を辿る
      // 関係クエリが走り、版なし 1 本 / 版あり 3 本と割れて応答時間が存在の oracle になる・v2-262）。
      expect(mockPrisma.folder.findFirst).toHaveBeenCalledWith({
        where: { files: { some: { id: 'f1' } } },
        select: { spaceId: true },
      });
      expect(result).toEqual({ id: 'v2', versionNo: 2, spaceId: 'space-1' });
    });

    it('版なし（null）でも器の照会を省かず null を返す（本数を実在で割らない・v2-262）', async () => {
      mockPrisma.fileVersion.findFirst.mockResolvedValue(null);
      mockPrisma.folder.findFirst.mockResolvedValue({ spaceId: 'space-1' });

      await expect(repo.findLatestFileVersion('f1')).resolves.toBeNull();

      expect(mockPrisma.fileVersion.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.folder.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // 作成
  // ============================================================
  describe('createAttachment', () => {
    it('NewAttachmentData の7項目をそのまま data へ渡し、include は共有定数と同一参照', async () => {
      const created = { id: 'at1' };
      mockPrisma.attachment.create.mockResolvedValue(created);
      const data = {
        fileVersionId: 'v1',
        taskId: 1,
        chatMessageId: 'm1',
        themeId: 't1',
        announcementId: 'a1',
        taskCommentId: 'c1',
        attachedById: 'acc-1',
      };

      const result = await repo.createAttachment(data);

      expect(mockPrisma.attachment.create).toHaveBeenCalledTimes(1);
      const args = mockPrisma.attachment.create.mock.calls[0][0];
      expect(args.data).toEqual(data);
      expect(args.include).toBe(attachmentDisplayInclude);
      expect(result).toBe(created);
    });
  });

  // ============================================================
  // 一覧5種（createdAt 昇順 + id タイブレークの安定順）
  // ============================================================
  describe('添付一覧', () => {
    const cases: [string, (r: AttachmentsRepository) => Promise<unknown>, object][] = [
      ['findByTask', (r) => r.findByTask(1), { taskId: 1 }],
      ['findByChatMessage', (r) => r.findByChatMessage('m1'), { chatMessageId: 'm1' }],
      ['findByTheme', (r) => r.findByTheme('t1'), { themeId: 't1' }],
      ['findByAnnouncement', (r) => r.findByAnnouncement('a1'), { announcementId: 'a1' }],
      ['findByTaskComment', (r) => r.findByTaskComment('c1'), { taskCommentId: 'c1' }],
    ];

    it.each(cases)(
      '%s は対応する外部キーで絞り createdAt 昇順・id タイブレークの二段キーで引く',
      async (_name, call, where) => {
        mockPrisma.attachment.findMany.mockResolvedValue([]);

        await call(repo);

        expect(mockPrisma.attachment.findMany).toHaveBeenCalledWith({
          where,
          include: attachmentDisplayInclude,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        // include は共有定数と同一参照であること（各メソッドへのリテラル複製＝SSOT 崩れを弾く）。
        expect(mockPrisma.attachment.findMany.mock.calls[0][0].include).toBe(
          attachmentDisplayInclude,
        );
      },
    );
  });

  // ============================================================
  // 単票取得 / 解除
  // ============================================================
  describe('findById / deleteById', () => {
    it('findById は include 無しの findUnique({where:{id}})', async () => {
      mockPrisma.attachment.findUnique.mockResolvedValue(null);

      await repo.findById('at1');

      expect(mockPrisma.attachment.findUnique).toHaveBeenCalledWith({ where: { id: 'at1' } });
    });

    it('deleteById は delete({where:{id}})（実体ファイルには触れない）', async () => {
      mockPrisma.attachment.delete.mockResolvedValue({ id: 'at1' });

      await repo.deleteById('at1');

      expect(mockPrisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'at1' } });
    });
  });

  // ============================================================
  // 解除の認可判定入力（添付の実在に依らず同じ 3 本・v2-262）
  // ============================================================
  describe('findByIdForAuth', () => {
    const attachmentRow = {
      id: 'at1',
      attachedById: 'acc-1',
      announcementId: null,
      taskId: 7,
      themeId: null,
      chatMessageId: null,
      taskCommentId: null,
    };

    it('添付本体と器 2 種（task / theme）を、対象種別に依らず同じ 3 本で引く', async () => {
      mockPrisma.attachment.findUnique.mockResolvedValue(attachmentRow);
      mockPrisma.task.findFirst.mockResolvedValue({ spaceId: 'space-1' });
      mockPrisma.chatTheme.findFirst.mockResolvedValue(null);

      const result = await repo.findByIdForAuth('at1');

      expect(mockPrisma.attachment.findUnique).toHaveBeenCalledWith({
        where: { id: 'at1' },
        select: {
          id: true,
          attachedById: true,
          announcementId: true,
          taskId: true,
          themeId: true,
          chatMessageId: true,
          taskCommentId: true,
        },
      });
      // 器は添付 id の関係フィルタで引く（対象種別で分岐して照会を省くと、その本数差が応答時間の
      // oracle に戻る）。taskComment / chatMessage は親を辿る条件を同じ 1 本へ OR で乗せる。
      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { attachments: { some: { id: 'at1' } } },
            { comments: { some: { attachments: { some: { id: 'at1' } } } } },
          ],
        },
        select: { spaceId: true },
      });
      expect(mockPrisma.chatTheme.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { attachments: { some: { id: 'at1' } } },
            { messages: { some: { attachments: { some: { id: 'at1' } } } } },
          ],
        },
        select: { spaceId: true },
      });
      expect(result).toEqual({
        ...attachmentRow,
        taskSpace: { spaceId: 'space-1' },
        themeSpace: null,
      });
    });

    it('添付が無くても器の照会を省かず null を返す（本数を実在で割らない・存在秘匿）', async () => {
      mockPrisma.attachment.findUnique.mockResolvedValue(null);

      await expect(repo.findByIdForAuth('missing')).resolves.toBeNull();

      expect(mockPrisma.attachment.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.task.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.chatTheme.findFirst).toHaveBeenCalledTimes(1);
    });
  });
});
