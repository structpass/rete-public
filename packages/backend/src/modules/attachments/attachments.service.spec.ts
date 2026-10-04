import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@rete/shared';
import { AttachmentsService } from './attachments.service';
import { AttachmentsRepository } from './repositories/attachments.repository';
import type { AttachmentWithDisplay } from './repositories/attachments.repository';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';

/** owner-check メソッドへ渡す最小ユーザーオブジェクト生成ヘルパ（H4）。 */
const mkUser = (id: string, role = Role.MEMBER) => ({ id, role });

/** linkLatestVersion の可視性チェック（cmn-0279）へ渡す操作主体（ADR 0063 で accountId だけになった）。 */
const mkActor = (id: string) => ({ id });

const FIXED_DATE = new Date('2026-06-05T01:23:45.000Z');
const UUID = '11111111-1111-4111-8111-111111111111';
const MSG_UUID = '22222222-2222-4222-a222-222222222222';
const THEME_UUID = '33333333-3333-4333-b333-333333333333';
const CMT_UUID = '44444444-4444-4444-8444-444444444444';

const mockRepo = {
  findTaskById: jest.fn(),
  findChatMessageById: jest.fn(),
  findThemeById: jest.fn(),
  findTaskCommentById: jest.fn(),
  findAnnouncementById: jest.fn(),
  findLatestFileVersion: jest.fn(),
  findFileCurrentSpaceId: jest.fn(),
  createAttachment: jest.fn(),
  findByTask: jest.fn(),
  findByChatMessage: jest.fn(),
  findByTheme: jest.fn(),
  findByTaskComment: jest.fn(),
  findById: jest.fn(),
  findByIdForAuth: jest.fn(),
  deleteById: jest.fn(),
};

// 存在秘匿（ADR 0038）の可視性ガード。既定の「可視」は beforeEach（:83-84）で明示設定する
// （resetMocks で戻り設定は毎テスト剥がれるため、ここでの「未設定 = 可視」という記述は実体と合わない）。
// 非可視ケースは各テストで mockRejectedValueOnce(new NotFoundException) を設定する。
const mockScopeVisibility = {
  assertVisibleOr404: jest.fn(),
  resolveVisibleSpaceIds: jest.fn(),
  canAccessSpace: jest.fn(),
};

// 添付元ファイルの器の可視性チェック（cmn-0279 / ADR 0063）は同じ mockScopeVisibility.canAccessSpace が担う。
// 既定は true（可視＝添付可）。非可視ケースは各テストで mockResolvedValueOnce(false) を設定する。

function makeDisplay(overrides: Partial<AttachmentWithDisplay> = {}): AttachmentWithDisplay {
  return {
    id: 'att-1',
    fileVersionId: 'ver-1',
    taskId: 1,
    chatMessageId: null,
    attachedById: 'acc-1',
    createdAt: FIXED_DATE,
    fileVersion: {
      id: 'ver-1',
      versionNo: 1,
      byteSize: BigInt(100),
      mimeType: 'text/csv',
      file: { id: 'file-1', name: 'a.csv' },
    },
    attachedBy: { name: '担当者' },
    ...overrides,
  } as AttachmentWithDisplay;
}

/**
 * removeAttachment の認可判定入力（findByIdForAuth の戻り）を組み立てる（v2-262）。
 * 添付本体の XOR 対象列と、解決済みの添付先の器を持つ。既定は「対象列なし・器なし」＝ announcement
 * スコープ相当（可視性チェック対象外）。器の解決は repository 側（添付の実在に依らず同じ 3 本）へ
 * 移したため、spec 側は解決結果だけを渡す。
 */
const mkAuthView = (overrides: Record<string, unknown> = {}) => ({
  id: 'att-1',
  attachedById: 'acc-1',
  announcementId: null,
  taskId: null,
  themeId: null,
  chatMessageId: null,
  taskCommentId: null,
  taskSpace: null,
  themeSpace: null,
  ...overrides,
});

describe('AttachmentsService', () => {
  let service: AttachmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: AttachmentsRepository, useValue: mockRepo },
        { provide: ScopeVisibilityService, useValue: mockScopeVisibility },
      ],
    }).compile();
    service = module.get<AttachmentsService>(AttachmentsService);
    // resetMocks で戻り設定は毎テスト剥がれるため、既定の「可視」をここで再設定する。
    mockScopeVisibility.assertVisibleOr404.mockResolvedValue(undefined);
    mockScopeVisibility.canAccessSpace.mockResolvedValue(true);
    // cmn-0290: 既定では「移動していない」前提を保つため、findLatestFileVersion が返す器と同じ
    // spaceId を返す。各テストで移動ケースを表現する時は mockResolvedValueOnce で上書きする。
    mockRepo.findFileCurrentSpaceId.mockResolvedValue('space-1');
  });

  describe('createAttachment', () => {
    it('task: 添付先存在 → 最新版固定 → 作成し DTO を返す', async () => {
      mockRepo.findTaskById.mockResolvedValue({ id: 5 });
      mockRepo.findLatestFileVersion.mockResolvedValue({
        id: 'ver-9',
        versionNo: 3,
        spaceId: 'space-1',
      });
      mockRepo.createAttachment.mockResolvedValue(makeDisplay({ id: 'att-x' }));

      const result = await service.createAttachment(
        { targetType: 'task', targetId: '5', fileId: UUID },
        mkActor('acc-7'),
      );

      // 添付時点の最新版（ver-9）を固定し、taskId 側のみ埋める（XOR）。
      expect(mockRepo.createAttachment).toHaveBeenCalledWith({
        fileVersionId: 'ver-9',
        taskId: 5,
        chatMessageId: undefined,
        themeId: undefined,
        attachedById: 'acc-7',
      });
      expect(result).toEqual({ success: true, data: expect.objectContaining({ id: 'att-x' }) });
    });

    it('task が存在しなければ NotFound', async () => {
      mockRepo.findTaskById.mockResolvedValue(null);
      await expect(
        service.createAttachment(
          { targetType: 'task', targetId: '99', fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.createAttachment).not.toHaveBeenCalled();
    });

    it('task の targetId が非整数なら BadRequest', async () => {
      await expect(
        service.createAttachment(
          { targetType: 'task', targetId: 'abc', fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.findTaskById).not.toHaveBeenCalled();
    });

    it('ファイルに版が無ければ NotFound（版固定できない）', async () => {
      mockRepo.findTaskById.mockResolvedValue({ id: 1 });
      mockRepo.findLatestFileVersion.mockResolvedValue(null);
      await expect(
        service.createAttachment(
          { targetType: 'task', targetId: '1', fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('chatMessage: UUID 検証 → 存在確認 → chatMessageId 側を埋めて作成', async () => {
      mockRepo.findChatMessageById.mockResolvedValue({ id: MSG_UUID, theme: { spaceId: null } });
      mockRepo.findLatestFileVersion.mockResolvedValue({
        id: 'ver-1',
        versionNo: 1,
        spaceId: 'space-1',
      });
      mockRepo.createAttachment.mockResolvedValue(
        makeDisplay({ taskId: null, chatMessageId: MSG_UUID }),
      );

      await service.createAttachment(
        { targetType: 'chatMessage', targetId: MSG_UUID, fileId: UUID },
        mkActor('acc-1'),
      );

      expect(mockRepo.createAttachment).toHaveBeenCalledWith({
        fileVersionId: 'ver-1',
        taskId: undefined,
        chatMessageId: MSG_UUID,
        themeId: undefined,
        attachedById: 'acc-1',
      });
    });

    it('chatMessage の targetId が UUID でなければ BadRequest', async () => {
      await expect(
        service.createAttachment(
          { targetType: 'chatMessage', targetId: 'not-uuid', fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('theme: UUID 検証 → 存在確認 → themeId 側を埋めて作成', async () => {
      mockRepo.findThemeById.mockResolvedValue({ id: THEME_UUID });
      mockRepo.findLatestFileVersion.mockResolvedValue({
        id: 'ver-2',
        versionNo: 1,
        spaceId: 'space-1',
      });
      mockRepo.createAttachment.mockResolvedValue(
        makeDisplay({ taskId: null, chatMessageId: null, themeId: THEME_UUID }),
      );

      await service.createAttachment(
        { targetType: 'theme', targetId: THEME_UUID, fileId: UUID },
        mkActor('acc-1'),
      );

      expect(mockRepo.createAttachment).toHaveBeenCalledWith({
        fileVersionId: 'ver-2',
        taskId: undefined,
        chatMessageId: undefined,
        themeId: THEME_UUID,
        attachedById: 'acc-1',
      });
    });

    it('theme が存在しなければ NotFound', async () => {
      mockRepo.findThemeById.mockResolvedValue(null);
      await expect(
        service.createAttachment(
          { targetType: 'theme', targetId: THEME_UUID, fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.createAttachment).not.toHaveBeenCalled();
    });

    it('theme の targetId が UUID でなければ BadRequest', async () => {
      await expect(
        service.createAttachment(
          { targetType: 'theme', targetId: 'not-uuid', fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('taskComment: UUID 検証 → 存在確認（親タスク spaceId 可視）→ taskCommentId 側を埋めて作成（dsk-0249）', async () => {
      mockRepo.findTaskCommentById.mockResolvedValue({ id: CMT_UUID, task: { spaceId: null } });
      mockRepo.findLatestFileVersion.mockResolvedValue({
        id: 'ver-3',
        versionNo: 1,
        spaceId: 'space-1',
      });
      mockRepo.createAttachment.mockResolvedValue(
        makeDisplay({ taskId: null, chatMessageId: null, taskCommentId: CMT_UUID }),
      );

      await service.createAttachment(
        { targetType: 'taskComment', targetId: CMT_UUID, fileId: UUID },
        mkActor('acc-1'),
      );

      // コメントの可視性は親タスクの器に従い、taskCommentId 側のみ埋める（XOR・chatMessage と対称）。
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalled();
      expect(mockRepo.createAttachment).toHaveBeenCalledWith({
        fileVersionId: 'ver-3',
        taskId: undefined,
        chatMessageId: undefined,
        themeId: undefined,
        announcementId: undefined,
        taskCommentId: CMT_UUID,
        attachedById: 'acc-1',
      });
    });

    it('taskComment が存在しなければ NotFound', async () => {
      mockRepo.findTaskCommentById.mockResolvedValue(null);
      await expect(
        service.createAttachment(
          { targetType: 'taskComment', targetId: CMT_UUID, fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.createAttachment).not.toHaveBeenCalled();
    });

    it('taskComment の targetId が UUID でなければ BadRequest', async () => {
      await expect(
        service.createAttachment(
          { targetType: 'taskComment', targetId: 'not-uuid', fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.findTaskCommentById).not.toHaveBeenCalled();
    });

    // ── 添付元ファイルの器の可視性検証（cmn-0279・metadata IDOR 封止 / ADR 0063） ──
    describe('添付元の器の可視性（cmn-0279）', () => {
      it('非可視の器のファイルで添付すると「実在しない」と同一文言の 404（作成しない・メタ漏れなし）', async () => {
        mockRepo.findTaskById.mockResolvedValue({ id: 5 });
        mockRepo.findLatestFileVersion.mockResolvedValue({
          id: 'ver-9',
          versionNo: 3,
          spaceId: 'space-hidden',
        });
        // 版は解決できるが器が非可視 → 404（文言はファイル不在時と同一＝存在秘匿）。
        mockScopeVisibility.canAccessSpace.mockResolvedValueOnce(false);

        await expect(
          service.createAttachment(
            { targetType: 'task', targetId: '5', fileId: UUID },
            mkActor('acc-1'),
          ),
        ).rejects.toMatchObject({ message: '添付するファイルが見つかりません' });

        // 可視性判定は添付元ファイルの器で行われ、作成へは到達しない（メタ情報が応答に載らない）。
        expect(mockScopeVisibility.canAccessSpace).toHaveBeenCalledWith('acc-1', 'space-hidden');
        expect(mockRepo.createAttachment).not.toHaveBeenCalled();
      });

      it('非可視の器は task 以外の添付先（theme/chatMessage/taskComment）でも同一 404 になる', async () => {
        mockRepo.findThemeById.mockResolvedValue({ id: THEME_UUID, spaceId: null });
        mockRepo.findLatestFileVersion.mockResolvedValue({
          id: 'ver-2',
          versionNo: 1,
          spaceId: 'space-hidden',
        });
        mockScopeVisibility.canAccessSpace.mockResolvedValueOnce(false);

        await expect(
          service.createAttachment(
            { targetType: 'theme', targetId: THEME_UUID, fileId: UUID },
            mkActor('acc-1'),
          ),
        ).rejects.toMatchObject({ message: '添付するファイルが見つかりません' });
        expect(mockRepo.createAttachment).not.toHaveBeenCalled();
      });

      it('器が可視のユーザーは添付できる（回帰なし・可視性チェック通過後に作成）', async () => {
        mockRepo.findTaskById.mockResolvedValue({ id: 5 });
        mockRepo.findLatestFileVersion.mockResolvedValue({
          id: 'ver-9',
          versionNo: 3,
          spaceId: 'space-1',
        });
        mockRepo.createAttachment.mockResolvedValue(makeDisplay({ id: 'att-x' }));
        // beforeEach 既定（canAccessSpace=true）のまま = 可視性チェック通過。

        const result = await service.createAttachment(
          { targetType: 'task', targetId: '5', fileId: UUID },
          mkActor('acc-7'),
        );

        expect(mockRepo.createAttachment).toHaveBeenCalledWith({
          fileVersionId: 'ver-9',
          taskId: 5,
          chatMessageId: undefined,
          themeId: undefined,
          attachedById: 'acc-7',
        });
        expect(result).toEqual({ success: true, data: expect.objectContaining({ id: 'att-x' }) });
      });

      it('ADMIN でも非可視の器のファイルは添付できない（ADR 0063 で全フォルダバイパスを廃止）', async () => {
        mockRepo.findTaskById.mockResolvedValue({ id: 5 });
        mockRepo.findLatestFileVersion.mockResolvedValue({
          id: 'ver-9',
          versionNo: 3,
          spaceId: 'space-hidden',
        });
        mockScopeVisibility.canAccessSpace.mockResolvedValueOnce(false);

        await expect(
          service.createAttachment(
            { targetType: 'task', targetId: '5', fileId: UUID },
            mkActor('admin-1'),
          ),
        ).rejects.toMatchObject({ message: '添付するファイルが見つかりません' });
        expect(mockRepo.createAttachment).not.toHaveBeenCalled();
      });

      // ── 添付元の器の再判定（cmn-0290・TOCTOU 窓の file 移動ケース塞ぎ） ──
      it('ファイル移動後の器で可視性を判定し直し、fileVersionId は変えない（移動ケース）', async () => {
        // findLatestFileVersion は「リクエスト開始時点」の器（移動前）。findFileCurrentSpaceId は
        // insert 直前の現在の器（移動後）= 本ケースは silent accept が塞がれていることの確認点。
        mockRepo.findTaskById.mockResolvedValue({ id: 5 });
        mockRepo.findLatestFileVersion.mockResolvedValue({
          id: 'ver-9',
          versionNo: 3,
          spaceId: 'space-A',
        });
        mockRepo.findFileCurrentSpaceId.mockResolvedValueOnce('space-B');
        mockRepo.createAttachment.mockResolvedValue(makeDisplay({ id: 'att-x' }));

        await service.createAttachment(
          { targetType: 'task', targetId: '5', fileId: UUID },
          mkActor('acc-7'),
        );

        // 可視性判定は 2 回：1 回目は findLatestFileVersion の器、2 回目は insert 直前の現在の器。
        expect(mockScopeVisibility.canAccessSpace).toHaveBeenCalledTimes(2);
        expect(mockScopeVisibility.canAccessSpace).toHaveBeenNthCalledWith(1, 'acc-7', 'space-A');
        expect(mockScopeVisibility.canAccessSpace).toHaveBeenNthCalledWith(2, 'acc-7', 'space-B');
        // fileVersionId は変えない（版固定・criteria 2）。移動後の器が可視なので作成される。
        expect(mockRepo.createAttachment).toHaveBeenCalledWith(
          expect.objectContaining({ fileVersionId: 'ver-9', taskId: 5, attachedById: 'acc-7' }),
        );
      });

      it('ファイル移動後の器が非可視なら、findLatestFileVersion 時点の器で見えていても 404 で止める', async () => {
        // 1 回目（findLatestFileVersion 時点）は可視 → 2 回目（移動後の現在の器）で非可視。
        mockRepo.findTaskById.mockResolvedValue({ id: 5 });
        mockRepo.findLatestFileVersion.mockResolvedValue({
          id: 'ver-9',
          versionNo: 3,
          spaceId: 'space-A',
        });
        mockRepo.findFileCurrentSpaceId.mockResolvedValueOnce('space-B-restricted');
        mockScopeVisibility.canAccessSpace.mockResolvedValueOnce(true); // 1 回目通過
        mockScopeVisibility.canAccessSpace.mockResolvedValueOnce(false); // 2 回目で非可視
        mockRepo.createAttachment.mockResolvedValue(makeDisplay({ id: 'att-x' }));

        await expect(
          service.createAttachment(
            { targetType: 'task', targetId: '5', fileId: UUID },
            mkActor('acc-7'),
          ),
        ).rejects.toMatchObject({ message: '添付するファイルが見つかりません' });

        // 存在秘匿の文言一致（findLatestFileVersion の null 経路と同一）。
        expect(mockScopeVisibility.canAccessSpace).toHaveBeenCalledTimes(2);
        expect(mockRepo.createAttachment).not.toHaveBeenCalled();
      });

      it('再読時点で File が無い（spaceId=null）なら「実在しない」と同一文言の 404（fail-closed・criteria 3）', async () => {
        mockRepo.findTaskById.mockResolvedValue({ id: 5 });
        mockRepo.findLatestFileVersion.mockResolvedValue({
          id: 'ver-9',
          versionNo: 3,
          spaceId: 'space-1',
        });
        mockRepo.findFileCurrentSpaceId.mockResolvedValueOnce(null); // ファイル自体が消えた

        await expect(
          service.createAttachment(
            { targetType: 'task', targetId: '5', fileId: UUID },
            mkActor('acc-7'),
          ),
        ).rejects.toMatchObject({ message: '添付するファイルが見つかりません' });

        // 2 回目の可視性判定は実行されず（再読の null 判定で先に 404）、作成にも到達しない。
        expect(mockScopeVisibility.canAccessSpace).toHaveBeenCalledTimes(1);
        expect(mockRepo.createAttachment).not.toHaveBeenCalled();
      });
    });
  });

  describe('createForAnnouncement', () => {
    it('通知存在 → 最新版固定 → 器が可視なら作成（cmn-0279 criteria 4・回帰なし）', async () => {
      mockRepo.findAnnouncementById.mockResolvedValue({ id: 'ann-1' });
      mockRepo.findLatestFileVersion.mockResolvedValue({
        id: 'ver-9',
        versionNo: 3,
        spaceId: 'space-1',
      });
      mockRepo.createAttachment.mockResolvedValue(
        makeDisplay({ taskId: null, chatMessageId: null, announcementId: 'ann-1' }),
      );

      const result = await service.createForAnnouncement('ann-1', UUID, 'admin-1');

      // 通知添付経路も一般経路と同じ可視性判定を通る（ADR 0063 で ADMIN バイパスは廃止）。
      expect(mockScopeVisibility.canAccessSpace).toHaveBeenCalledWith('admin-1', 'space-1');
      expect(mockRepo.createAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ announcementId: 'ann-1', attachedById: 'admin-1' }),
      );
      expect(result).toEqual({ success: true, data: expect.objectContaining({ id: 'att-1' }) });
    });

    it('通知が存在しなければ NotFound（添付しない）', async () => {
      mockRepo.findAnnouncementById.mockResolvedValue(null);

      await expect(
        service.createForAnnouncement('missing', UUID, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.createAttachment).not.toHaveBeenCalled();
    });

    it('通知経路でも現在の器で可視性を判定し直す（移動ケース）', async () => {
      // cmn-0290 criteria 5: createForAnnouncement も同一経路を通り、判定・エラー文言・挙動が揃う。
      mockRepo.findAnnouncementById.mockResolvedValue({ id: 'ann-1' });
      mockRepo.findLatestFileVersion.mockResolvedValue({
        id: 'ver-9',
        versionNo: 3,
        spaceId: 'space-A',
      });
      mockRepo.findFileCurrentSpaceId.mockResolvedValueOnce('space-B');
      mockRepo.createAttachment.mockResolvedValue(
        makeDisplay({ taskId: null, chatMessageId: null, announcementId: 'ann-1' }),
      );

      const result = await service.createForAnnouncement('ann-1', UUID, 'admin-1');

      // 2 回判定され、最後は現在の器。
      expect(mockScopeVisibility.canAccessSpace).toHaveBeenCalledTimes(2);
      expect(mockScopeVisibility.canAccessSpace).toHaveBeenNthCalledWith(2, 'admin-1', 'space-B');
      expect(result).toEqual({ success: true, data: expect.objectContaining({ id: 'att-1' }) });
    });
  });

  describe('listAttachments', () => {
    it('task: findByTask 結果を DTO 配列で返す', async () => {
      // 添付先の存在検証（v2-257）を通すため、可視の添付先を返す（未設定は不在＝404）。
      mockRepo.findTaskById.mockResolvedValue({ id: 3 });
      mockRepo.findByTask.mockResolvedValue([makeDisplay({ id: 'a' }), makeDisplay({ id: 'b' })]);
      const result = await service.listAttachments({ targetType: 'task', targetId: '3' });
      expect(mockRepo.findByTask).toHaveBeenCalledWith(3);
      expect(result.data.map((d) => d.id)).toEqual(['a', 'b']);
    });

    it('theme: findByTheme 結果を DTO 配列で返す', async () => {
      mockRepo.findThemeById.mockResolvedValue({ id: THEME_UUID });
      mockRepo.findByTheme.mockResolvedValue([makeDisplay({ id: 'c' })]);
      const result = await service.listAttachments({ targetType: 'theme', targetId: THEME_UUID });
      expect(mockRepo.findByTheme).toHaveBeenCalledWith(THEME_UUID);
      expect(result.data.map((d) => d.id)).toEqual(['c']);
    });

    it('taskComment: findByTaskComment 結果を DTO 配列で返す（dsk-0249）', async () => {
      mockRepo.findTaskCommentById.mockResolvedValue({ id: CMT_UUID, task: { spaceId: null } });
      mockRepo.findByTaskComment.mockResolvedValue([makeDisplay({ id: 'd' })]);
      const result = await service.listAttachments({
        targetType: 'taskComment',
        targetId: CMT_UUID,
      });
      expect(mockRepo.findByTaskComment).toHaveBeenCalledWith(CMT_UUID);
      expect(result.data.map((d) => d.id)).toEqual(['d']);
    });

    it('chatMessage の targetId が UUID でなければ BadRequest', async () => {
      await expect(
        service.listAttachments({ targetType: 'chatMessage', targetId: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('theme の targetId が UUID でなければ BadRequest', async () => {
      await expect(
        service.listAttachments({ targetType: 'theme', targetId: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('taskComment の targetId が UUID でなければ BadRequest', async () => {
      await expect(
        service.listAttachments({ targetType: 'taskComment', targetId: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('removeAttachment', () => {
    it('存在すれば削除し { id } を返す（user 未指定・内部経路）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(mkAuthView());
      mockRepo.deleteById.mockResolvedValue({ id: 'att-1' });
      const result = await service.removeAttachment('att-1');
      expect(mockRepo.deleteById).toHaveBeenCalledWith('att-1');
      expect(result).toEqual({ success: true, data: { id: 'att-1' } });
    });

    it('存在しなければ NotFound（削除しない）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(null);
      await expect(service.removeAttachment('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });

    it('添付者本人なら削除できること（H4）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(mkAuthView());
      mockRepo.deleteById.mockResolvedValue({ id: 'att-1' });

      const result = await service.removeAttachment('att-1', mkUser('acc-1'));

      expect(mockRepo.deleteById).toHaveBeenCalledWith('att-1');
      expect(result.success).toBe(true);
    });

    it('ADMIN は他者添付も解除できること（H4 ADMIN バイパス）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(mkAuthView({ attachedById: 'other-user' }));
      mockRepo.deleteById.mockResolvedValue({ id: 'att-1' });

      await service.removeAttachment('att-1', mkUser('admin-user', Role.ADMIN));

      expect(mockRepo.deleteById).toHaveBeenCalledWith('att-1');
    });

    it('非添付者（MEMBER）は Forbidden を投げ deleteById を呼ばないこと（H4）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(mkAuthView());

      await expect(service.removeAttachment('att-1', mkUser('intruder'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });

    it('announcement 添付を汎用経路で消そうとすると 404 で隠す（存在秘匿・専用 ADMIN 経路のみ）', async () => {
      // announcement スコープ添付は space に属さず可視性チェックが効かない。汎用 DELETE /attachments/:id で
      // 非所有者が叩いた時、403（存在を漏らす拒否）でなく 404 で「無いことにする」（ADR 0038 存在秘匿）。
      mockRepo.findByIdForAuth.mockResolvedValue(
        mkAuthView({ id: 'att-ann', attachedById: 'admin-user', announcementId: 'ann-1' }),
      );
      await expect(service.removeAttachment('att-ann', mkUser('intruder'))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });
  });

  // ── 存在秘匿（ADR 0038）: 他 Space のリソースを直打ちしても「無いことにする」（404 / 非包含） ──
  describe('IDOR 存在秘匿（ADR 0038）', () => {
    const OTHER_SPACE = 'space-other-9999';

    it('create: 他 space の task に添付しようとすると 404（assertVisibleOr404）で作成しない', async () => {
      // task は存在するが呼び出しアカウントには非可視 → resolveTarget が 404 を投げる。
      mockRepo.findTaskById.mockResolvedValue({ id: 5, spaceId: OTHER_SPACE });
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

      await expect(
        service.createAttachment(
          { targetType: 'task', targetId: '5', fileId: UUID },
          mkActor('intruder'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      // 非可視 Space の確定 spaceId で可視性が照会され、版固定・作成まで到達しないこと。
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', OTHER_SPACE);
      expect(mockRepo.findLatestFileVersion).not.toHaveBeenCalled();
      expect(mockRepo.createAttachment).not.toHaveBeenCalled();
    });

    it('create: 他 space の theme に添付しようとすると 404 で作成しない', async () => {
      mockRepo.findThemeById.mockResolvedValue({ id: THEME_UUID, spaceId: OTHER_SPACE });
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

      await expect(
        service.createAttachment(
          { targetType: 'theme', targetId: THEME_UUID, fileId: UUID },
          mkActor('intruder'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.createAttachment).not.toHaveBeenCalled();
    });

    it('create: 他 space の chatMessage（theme 経由）に添付しようとすると 404 で作成しない', async () => {
      // chatMessage は spaceId を直接持たず theme.spaceId で器に属する。
      mockRepo.findChatMessageById.mockResolvedValue({
        id: MSG_UUID,
        theme: { spaceId: OTHER_SPACE },
      });
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

      await expect(
        service.createAttachment(
          { targetType: 'chatMessage', targetId: MSG_UUID, fileId: UUID },
          mkActor('intruder'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', OTHER_SPACE);
      expect(mockRepo.createAttachment).not.toHaveBeenCalled();
    });

    it('create: 他 space の taskComment（親タスク経由）に添付しようとすると 404 で作成しない（dsk-0249）', async () => {
      // コメントは spaceId を直接持たず親タスクの spaceId で器に属する（chatMessage→theme と同型）。
      mockRepo.findTaskCommentById.mockResolvedValue({
        id: CMT_UUID,
        task: { spaceId: OTHER_SPACE },
      });
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

      await expect(
        service.createAttachment(
          { targetType: 'taskComment', targetId: CMT_UUID, fileId: UUID },
          mkActor('intruder'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', OTHER_SPACE);
      expect(mockRepo.createAttachment).not.toHaveBeenCalled();
    });

    it('remove: 他 space の taskComment 添付を直打ちすると 404（所有者チェック前・削除しない・dsk-0249）', async () => {
      // 添付は taskComment に紐づくが親タスクの space が非可視 → owner チェックより先に 404 で隠す。
      mockRepo.findByIdForAuth.mockResolvedValue(
        mkAuthView({
          id: 'att-cmt',
          attachedById: 'victim',
          taskCommentId: CMT_UUID,
          taskSpace: { spaceId: OTHER_SPACE },
        }),
      );
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

      await expect(service.removeAttachment('att-cmt', mkUser('intruder'))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', OTHER_SPACE);
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });

    it('list: 他 space の task の添付一覧を直打ちすると 404（findByTask を呼ばず行を返さない）', async () => {
      mockRepo.findTaskById.mockResolvedValue({ id: 7, spaceId: OTHER_SPACE });
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

      await expect(
        service.listAttachments({ targetType: 'task', targetId: '7' }, 'intruder'),
      ).rejects.toBeInstanceOf(NotFoundException);

      // 可視性で弾かれたら一覧クエリ（findByTask）に到達せず、他人の添付が一切漏れないこと。
      expect(mockRepo.findByTask).not.toHaveBeenCalled();
    });

    it('list: 対象不在も非可視と同じ 404（200 空配列で返さない・v2-257）', async () => {
      // 不在 target は findTaskById=null。200 空配列で返すと status の差（200/404）が対象実在の
      // oracle になるため、非可視と同じ「不在」文言の 404 へ寄せる（一覧クエリは走らせない）。
      mockRepo.findTaskById.mockResolvedValue(null);

      await expect(
        service.listAttachments({ targetType: 'task', targetId: '404404' }, 'someone'),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        message: '添付先のタスクが見つかりません',
      });
      expect(mockScopeVisibility.assertVisibleOr404).not.toHaveBeenCalled();
      expect(mockRepo.findByTask).not.toHaveBeenCalled();
    });

    it('remove: 他 space の添付 id を直打ちすると 404（所有者チェック前・削除しない）', async () => {
      // 添付は存在し task に紐づくが、その task の space が非可視 → owner チェックより先に 404 で隠す。
      mockRepo.findByIdForAuth.mockResolvedValue(
        mkAuthView({
          id: 'att-other',
          attachedById: 'victim',
          taskId: 7,
          taskSpace: { spaceId: OTHER_SPACE },
        }),
      );
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

      await expect(
        service.removeAttachment('att-other', mkUser('intruder')),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', OTHER_SPACE);
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });
  });

  /**
   * 存在秘匿の応答平準化（v2-254）。添付先の不在の 404 と、添付先が在るが器が非可視の 404 が、
   * status だけでなく文言まで一致することを両分岐の実メッセージ比較で固定する（ADR 0038）。
   */
  describe('404 の応答平準化（不在と非可視で同じ文言・v2-254）', () => {
    const OTHER_SPACE = 'space-other-9999';

    const deny = () =>
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

    const messageOf = async (fn: () => Promise<unknown>): Promise<string> => {
      try {
        await fn();
        return '<no-error>';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };

    it('create: 添付先の不在と非可視が同じ文言（targetType ごとに一致）', async () => {
      const cases = [
        {
          dto: { targetType: 'task' as const, targetId: '5', fileId: UUID },
          missing: () => mockRepo.findTaskById.mockResolvedValueOnce(null),
          found: () => mockRepo.findTaskById.mockResolvedValueOnce({ id: 5, spaceId: OTHER_SPACE }),
          expected: '添付先のタスクが見つかりません',
        },
        {
          dto: { targetType: 'theme' as const, targetId: THEME_UUID, fileId: UUID },
          missing: () => mockRepo.findThemeById.mockResolvedValueOnce(null),
          found: () =>
            mockRepo.findThemeById.mockResolvedValueOnce({
              id: THEME_UUID,
              spaceId: OTHER_SPACE,
            }),
          expected: '添付先のテーマが見つかりません',
        },
        {
          dto: { targetType: 'taskComment' as const, targetId: CMT_UUID, fileId: UUID },
          missing: () => mockRepo.findTaskCommentById.mockResolvedValueOnce(null),
          found: () =>
            mockRepo.findTaskCommentById.mockResolvedValueOnce({
              id: CMT_UUID,
              task: { spaceId: OTHER_SPACE },
            }),
          expected: '添付先のコメントが見つかりません',
        },
        {
          dto: { targetType: 'chatMessage' as const, targetId: MSG_UUID, fileId: UUID },
          missing: () => mockRepo.findChatMessageById.mockResolvedValueOnce(null),
          found: () =>
            mockRepo.findChatMessageById.mockResolvedValueOnce({
              id: MSG_UUID,
              theme: { spaceId: OTHER_SPACE },
            }),
          expected: '添付先のメッセージが見つかりません',
        },
      ];

      for (const c of cases) {
        c.missing();
        const missing = await messageOf(() => service.createAttachment(c.dto, mkActor('intruder')));

        c.found();
        deny();
        const invisible = await messageOf(() =>
          service.createAttachment(c.dto, mkActor('intruder')),
        );

        expect(missing).toBe(c.expected);
        expect(invisible).toBe(missing);
      }
    });

    it('remove: 添付の不在と非可視が同じ文言（添付が見つかりません）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValueOnce(null);
      const missing = await messageOf(() =>
        service.removeAttachment('missing', mkUser('intruder')),
      );

      mockRepo.findByIdForAuth.mockResolvedValueOnce(
        mkAuthView({
          id: 'att-1',
          attachedById: 'victim',
          taskId: 7,
          taskSpace: { spaceId: OTHER_SPACE },
        }),
      );
      deny();
      const invisible = await messageOf(() =>
        service.removeAttachment('att-1', mkUser('intruder')),
      );

      expect(missing).toBe('添付が見つかりません');
      expect(invisible).toBe(missing);
    });

    it('list: 不在と非可視が同じ status（404）・同じ文言（targetType ごとに一致・v2-257）', async () => {
      const cases = [
        {
          query: { targetType: 'task' as const, targetId: '7' },
          missing: () => mockRepo.findTaskById.mockResolvedValueOnce(null),
          found: () => mockRepo.findTaskById.mockResolvedValueOnce({ id: 7, spaceId: OTHER_SPACE }),
          expected: '添付先のタスクが見つかりません',
        },
        {
          query: { targetType: 'theme' as const, targetId: THEME_UUID },
          missing: () => mockRepo.findThemeById.mockResolvedValueOnce(null),
          found: () =>
            mockRepo.findThemeById.mockResolvedValueOnce({
              id: THEME_UUID,
              spaceId: OTHER_SPACE,
            }),
          expected: '添付先のテーマが見つかりません',
        },
        {
          query: { targetType: 'taskComment' as const, targetId: CMT_UUID },
          missing: () => mockRepo.findTaskCommentById.mockResolvedValueOnce(null),
          found: () =>
            mockRepo.findTaskCommentById.mockResolvedValueOnce({
              id: CMT_UUID,
              task: { spaceId: OTHER_SPACE },
            }),
          expected: '添付先のコメントが見つかりません',
        },
        {
          query: { targetType: 'chatMessage' as const, targetId: MSG_UUID },
          missing: () => mockRepo.findChatMessageById.mockResolvedValueOnce(null),
          found: () =>
            mockRepo.findChatMessageById.mockResolvedValueOnce({
              id: MSG_UUID,
              theme: { spaceId: OTHER_SPACE },
            }),
          expected: '添付先のメッセージが見つかりません',
        },
      ];

      // status は「404（NotFoundException）か否か」で見る（不在も非可視も 404 であることを比較する）。
      const outcomeOf = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
          return { notFound: false, message: '<no-error>' };
        } catch (e) {
          return {
            notFound: e instanceof NotFoundException,
            message: e instanceof Error ? e.message : String(e),
          };
        }
      };

      for (const c of cases) {
        c.missing();
        const missing = await outcomeOf(() => service.listAttachments(c.query, 'intruder'));
        c.found();
        deny();
        const invisible = await outcomeOf(() => service.listAttachments(c.query, 'intruder'));

        expect(missing).toEqual({ notFound: true, message: c.expected });
        expect(invisible).toEqual(missing);
      }
    });
  });

  /**
   * 存在秘匿の応答コスト平準化（v2-262）。404 の status・文言は v2-254 / v2-257 で揃ったが、
   * 「対象不在」は対象取得 1 回で返るのに対し「存在するが非可視」は可視範囲の解決（複数クエリ）を
   * 通ってから返るため、応答時間が対象実在の oracle に戻っていた。添付の 404 経路は対象取得より先に
   * 可視範囲の解決を通し（primeVisibleSpaces）、対象の器の取得本数を実在に依らず揃える。
   * ここでは順序（入力だけで決まる）を固定し、本数は repository spec 側で固定する（v2-255 と同型）。
   */
  describe('404 の応答コスト平準化（v2-262）', () => {
    /** 可視範囲の解決が対象取得より先に 1 回だけ走ること（後追いだと不在枝で丸ごと省かれる）。 */
    const expectPrimedBefore = (targetMock: jest.Mock) => {
      const primeOrder = mockScopeVisibility.resolveVisibleSpaceIds.mock.invocationCallOrder;
      expect(primeOrder).toHaveLength(1);
      expect(primeOrder[0]).toBeLessThan(targetMock.mock.invocationCallOrder[0]);
    };

    it('list: 対象不在でも可視範囲の解決が対象取得より先に走る', async () => {
      mockRepo.findTaskById.mockResolvedValue(null);

      await expect(
        service.listAttachments({ targetType: 'task', targetId: '999' }, 'acc-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith('acc-1');
      expectPrimedBefore(mockRepo.findTaskById);
    });

    it('create: 対象不在でも可視範囲の解決が対象取得より先に走る', async () => {
      mockRepo.findTaskById.mockResolvedValue(null);

      await expect(
        service.createAttachment(
          { targetType: 'task', targetId: '999', fileId: UUID },
          mkActor('acc-1'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expectPrimedBefore(mockRepo.findTaskById);
    });

    it('remove: 添付不在でも可視範囲の解決が対象取得より先に走る（応答は 404 のまま）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(null);

      await expect(service.removeAttachment('missing', mkUser('intruder'))).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith('intruder');
      expectPrimedBefore(mockRepo.findByIdForAuth);
    });

    it('remove: user 未指定（内部経路）は可視範囲の解決を通さない（従来どおり）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(mkAuthView());
      mockRepo.deleteById.mockResolvedValue({ id: 'att-1' });

      await service.removeAttachment('att-1');

      expect(mockScopeVisibility.resolveVisibleSpaceIds).not.toHaveBeenCalled();
      expect(mockRepo.deleteById).toHaveBeenCalledWith('att-1');
    });

    it('remove: 添付不在でも添付先の器の解決を省かない（findByIdForAuth を常に 1 回呼ぶ）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(null);

      await expect(service.removeAttachment('missing', mkUser('acc-1'))).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(mockRepo.findByIdForAuth).toHaveBeenCalledTimes(1);
      expect(mockRepo.findTaskById).not.toHaveBeenCalled();
    });
  });
});
