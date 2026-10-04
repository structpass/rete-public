import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '@rete/shared';
import {
  TaskCommentsService,
  TASK_COMMENT_ACTIVITY_EXCERPT_MAX_LENGTH,
} from './task-comments.service';
import { TaskCommentsRepository } from './repositories/task-comments.repository';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';
import { TaskActivitiesService } from '../task-activities/task-activities.service';
import { ChatService } from '../chat/chat.service';
import type { ReactionToggleResponseDto } from '../chat/dto/chat-response.dto';
import type { ApiResponse } from '../../common/dto';

const mockRepo = {
  findTaskForComment: jest.fn(),
  listByTask: jest.fn(),
  create: jest.fn(),
  findByIdForAuth: jest.fn(),
  update: jest.fn(),
  deleteById: jest.fn(),
  // メンション（dsk-0203）: 宛先存在検証。
  countAccountsByIds: jest.fn(),
};

const member = { id: 'acc-1', role: Role.MEMBER };
const otherMember = { id: 'acc-2', role: Role.MEMBER };
const admin = { id: 'acc-admin', role: Role.ADMIN };

// 存在秘匿ガードのモック。既定は「可視」。越境テストのみ assertVisibleOr404 を NotFound へ差し替える。
const mockScopeVisibility = {
  canAccessSpace: jest.fn(),
  resolveVisibleSpaceIds: jest.fn(),
  assertVisibleOr404: jest.fn(),
};

// 履歴記録サービスのモック（dsk-0246・コメント投稿時の「スレッドの更新」記録）。
const mockTaskActivities = {
  record: jest.fn(),
};

// リアクショントグル本体の借用元（dsk-0297・ChatModule が export した ChatService を cross-module DI で注入）。
// 実メソッドへ型で結び付け、モックの戻り形が実装（ApiResponse<ReactionToggleResponseDto>）と食い違えば
// ts-jest の型診断で落ちるようにする（v2-253。旧実装は無型の jest.fn() で envelope を直書きしていた）。
const mockChatService: jest.Mocked<Pick<ChatService, 'toggleReaction'>> = {
  toggleReaction: jest.fn(),
};

/**
 * ChatService.toggleReaction の応答。envelope（success/data）と data の形の正本は
 * ApiResponse<ReactionToggleResponseDto>（backend の chat-response.dto = @rete/shared の再公開）で、
 * 実装（chat.service.ts の共通トグル本体）は ok({ reacted }) でこの形を返す。
 * テストが応答形を自前で持たないよう、値の生成をここ 1 箇所へ集約する（v2-253）。
 */
const commentReactionToggle = (reacted: boolean): ApiResponse<ReactionToggleResponseDto> => ({
  success: true,
  data: { reacted },
});

const author = { id: 'acc-1', name: '佐久間 健' };
const now = new Date('2026-06-23T00:00:00.000Z');

describe('TaskCommentsService', () => {
  let service: TaskCommentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCommentsService,
        { provide: TaskCommentsRepository, useValue: mockRepo },
        { provide: ScopeVisibilityService, useValue: mockScopeVisibility },
        { provide: TaskActivitiesService, useValue: mockTaskActivities },
        { provide: ChatService, useValue: mockChatService },
      ],
    }).compile();
    service = module.get<TaskCommentsService>(TaskCommentsService);
    mockScopeVisibility.assertVisibleOr404.mockResolvedValue(undefined);
    mockRepo.findTaskForComment.mockResolvedValue({ id: 1, spaceId: 'space-1' });
    mockTaskActivities.record.mockResolvedValue(undefined);
  });

  describe('list', () => {
    it('当該タスクのコメントを時系列順の DTO 配列で返す（DTO shape 検証）', async () => {
      mockRepo.listByTask.mockResolvedValue([
        {
          id: 'cmt-1',
          taskId: 1,
          authorId: 'acc-1',
          body: '一件目',
          createdAt: now,
          updatedAt: now,
          author,
        },
        {
          id: 'cmt-2',
          taskId: 1,
          authorId: 'acc-1',
          body: '二件目',
          createdAt: new Date('2026-06-23T01:00:00.000Z'),
          updatedAt: new Date('2026-06-23T01:00:00.000Z'),
          author,
        },
      ]);

      const result = await service.list(1, 'acc-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      // DTO shape（success フラグだけでなく中身を検証）。
      const [first] = result.data;
      expect(first).toEqual({
        id: 'cmt-1',
        taskId: 1,
        body: '一件目',
        author: { id: 'acc-1', name: '佐久間 健' },
        attachments: [],
        mentions: [],
        reactions: [],
        createdAt: '2026-06-23T00:00:00.000Z',
        updatedAt: '2026-06-23T00:00:00.000Z',
      });
      // 時系列順（repository の orderBy 昇順）を service がそのまま保つ。
      expect(result.data.map((c) => c.id)).toEqual(['cmt-1', 'cmt-2']);
      // author は id/name のみ（authorId 等の生フィールド非露出・§1 DTO 境界）。
      expect(Object.keys(first.author).sort()).toEqual(['id', 'name']);
    });

    it('親タスクが存在しなければ NotFound（タスクと同じ境界）', async () => {
      mockRepo.findTaskForComment.mockResolvedValue(null);
      await expect(service.list(999, 'acc-1')).rejects.toThrow(NotFoundException);
      expect(mockRepo.listByTask).not.toHaveBeenCalled();
    });

    it('非可視 Space の親タスクは 404（assertVisibleOr404 が throw / 越境取得を封じる）', async () => {
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Task not found'),
      );
      await expect(service.list(1, 'intruder')).rejects.toThrow(NotFoundException);
      expect(mockRepo.listByTask).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('コメントを永続化し DTO を返す（投稿者は authorId）', async () => {
      mockRepo.create.mockResolvedValue({
        id: 'cmt-new',
        taskId: 1,
        authorId: 'acc-1',
        body: 'できました',
        createdAt: now,
        updatedAt: now,
        author,
      });

      const result = await service.create(1, 'acc-1', { body: 'できました' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'cmt-new',
        taskId: 1,
        body: 'できました',
        author: { id: 'acc-1', name: '佐久間 健' },
        attachments: [],
        mentions: [],
        reactions: [],
        createdAt: '2026-06-23T00:00:00.000Z',
        updatedAt: '2026-06-23T00:00:00.000Z',
      });
      // taskId / authorId / sanitize 済み body / 宛先未指定（undefined=据え置き）で repository を呼ぶ。
      expect(mockRepo.create).toHaveBeenCalledWith(1, 'acc-1', 'できました', undefined);
    });

    it('コメント投稿時に「メッセージを追加」履歴を本文抜粋付きで記録する（dsk-0269・field=commentAdd・実行者=authorId）', async () => {
      mockRepo.create.mockResolvedValue({
        id: 'cmt-new',
        taskId: 1,
        authorId: 'acc-1',
        body: '<p>できました</p>',
        createdAt: now,
        updatedAt: now,
        author,
      });

      await service.create(1, 'acc-1', { body: '<p>できました</p>' });

      // dsk-0246 の field='thread'（固定文）から専用種別へ分離。toLabel はタグ除去済みの本文抜粋。
      expect(mockTaskActivities.record).toHaveBeenCalledWith(1, 'acc-1', [
        { field: 'commentAdd', fromLabel: null, toLabel: 'できました' },
      ]);
    });

    it('履歴の本文抜粋は先頭140文字+「…」に切り詰める（dsk-0269・専用定数）', async () => {
      const long = 'あ'.repeat(TASK_COMMENT_ACTIVITY_EXCERPT_MAX_LENGTH + 10);
      mockRepo.create.mockResolvedValue({
        id: 'cmt-new',
        taskId: 1,
        authorId: 'acc-1',
        body: `<p>${long}</p>`,
        createdAt: now,
        updatedAt: now,
        author,
      });

      await service.create(1, 'acc-1', { body: `<p>${long}</p>` });

      const change = mockTaskActivities.record.mock.calls[0][2][0];
      expect(change.field).toBe('commentAdd');
      expect(change.toLabel).toBe(`${'あ'.repeat(TASK_COMMENT_ACTIVITY_EXCERPT_MAX_LENGTH)}…`);
    });

    it('履歴記録の失敗はコメント投稿を巻き戻さない（監査副作用の例外隔離）', async () => {
      mockRepo.create.mockResolvedValue({
        id: 'cmt-new',
        taskId: 1,
        authorId: 'acc-1',
        body: 'できました',
        createdAt: now,
        updatedAt: now,
        author,
      });
      mockTaskActivities.record.mockRejectedValueOnce(new Error('db down'));
      const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      // record が投げてもコメント投稿は成功で返る（投稿は commit 済み）。
      const result = await service.create(1, 'acc-1', { body: 'できました' });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('cmt-new');
      errSpy.mockRestore();
    });

    it('本文を sanitize して保存する（ADR 0019・保存側 XSS 防御）', async () => {
      mockRepo.create.mockResolvedValue({
        id: 'cmt-x',
        taskId: 1,
        authorId: 'acc-1',
        body: 'safe',
        createdAt: now,
        updatedAt: now,
        author,
      });

      await service.create(1, 'acc-1', { body: '<script>alert(1)</script>こんにちは' });

      const savedBody = mockRepo.create.mock.calls[0][2] as string;
      expect(savedBody).not.toContain('<script>');
      expect(savedBody).toContain('こんにちは');
    });

    it('非可視 Space の親タスクへは投稿できない（404）', async () => {
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Task not found'),
      );
      await expect(service.create(1, 'intruder', { body: 'x' })).rejects.toThrow(NotFoundException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('create メンション（dsk-0203・ChatMessageMention のタスク版）', () => {
    const postedComment = {
      id: 'cmt-m',
      taskId: 1,
      authorId: 'acc-1',
      body: 'hi',
      createdAt: now,
      updatedAt: now,
      author,
      mentions: [],
    };

    it('mentionAccountIds が全て実在すれば repository へ渡す', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.create.mockResolvedValue(postedComment);

      await service.create(1, 'acc-1', { body: 'hi', mentionAccountIds: ['u2', 'u3'] });

      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.create).toHaveBeenCalledWith(1, 'acc-1', 'hi', ['u2', 'u3']);
    });

    it('重複した mentionAccountIds は排除してから検証・保存する', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.create.mockResolvedValue(postedComment);

      await service.create(1, 'acc-1', { body: 'hi', mentionAccountIds: ['u2', 'u3', 'u2'] });

      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.create).toHaveBeenCalledWith(1, 'acc-1', 'hi', ['u2', 'u3']);
    });

    it('存在しない accountId が含まれると BadRequest を投げ create を呼ばない', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(1); // 2 件指定中 1 件しか実在しない

      await expect(
        service.create(1, 'acc-1', { body: 'hi', mentionAccountIds: ['u2', 'ghost'] }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('mentionAccountIds 未指定なら存在検証をスキップして従来どおり投稿する', async () => {
      mockRepo.create.mockResolvedValue(postedComment);

      await service.create(1, 'acc-1', { body: 'hi' });

      expect(mockRepo.countAccountsByIds).not.toHaveBeenCalled();
    });

    it('検証通過後に対象アカウントが消えて createMany が FK 違反（P2003）になっても 400 へ変換する（TOCTOU）', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK constraint failed', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create(1, 'acc-1', { body: 'hi', mentionAccountIds: ['u2'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('P2003 以外の Prisma エラーは握らず再 throw する（filter へ委譲 / §4）', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('other', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(
        service.create(1, 'acc-1', { body: 'hi', mentionAccountIds: ['u2'] }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('宛先付きコメントは mentions を DTO（id+name）で返す', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.create.mockResolvedValue({
        ...postedComment,
        mentions: [{ account: { id: 'u2', name: '受信 花子' } }],
      });

      const result = await service.create(1, 'acc-1', { body: 'hi', mentionAccountIds: ['u2'] });

      expect(result.data.mentions).toEqual([{ id: 'u2', name: '受信 花子' }]);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      mockRepo.findByIdForAuth.mockResolvedValue({
        id: 'cmt-1',
        authorId: 'acc-1',
        task: { id: 1, spaceId: 'space-1' },
      });
    });

    it('投稿者本人は本文を編集でき DTO を返す（sanitize 済み body で repo を呼ぶ）', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'cmt-1',
        taskId: 1,
        authorId: 'acc-1',
        body: 'なおしました',
        createdAt: now,
        updatedAt: new Date('2026-06-23T02:00:00.000Z'),
        author,
      });

      const result = await service.update('cmt-1', member, { body: 'なおしました' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'cmt-1',
        taskId: 1,
        body: 'なおしました',
        author: { id: 'acc-1', name: '佐久間 健' },
        attachments: [],
        mentions: [],
        reactions: [],
        createdAt: '2026-06-23T00:00:00.000Z',
        updatedAt: '2026-06-23T02:00:00.000Z',
      });
      // 宛先未指定（undefined=据え置き）で repository を呼ぶ。
      expect(mockRepo.update).toHaveBeenCalledWith('cmt-1', 'なおしました', undefined);
    });

    it('コメント編集時に「メッセージを編集」履歴を本文抜粋付きで記録する（dsk-0269・field=commentEdit・taskId は認可済み実体から）', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'cmt-1',
        taskId: 1,
        authorId: 'acc-1',
        body: '<p>なおしました</p>',
        createdAt: now,
        updatedAt: now,
        author,
      });

      await service.update('cmt-1', member, { body: '<p>なおしました</p>' });

      // 従来は編集の履歴記録なし（dsk-0269 で新規追加）。taskId は comment.task.id（=1）由来。
      expect(mockTaskActivities.record).toHaveBeenCalledWith(1, 'acc-1', [
        { field: 'commentEdit', fromLabel: null, toLabel: 'なおしました' },
      ]);
    });

    it('履歴記録の失敗はコメント編集を巻き戻さない（監査副作用の例外隔離・dsk-0269）', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'cmt-1',
        taskId: 1,
        authorId: 'acc-1',
        body: 'なおしました',
        createdAt: now,
        updatedAt: now,
        author,
      });
      mockTaskActivities.record.mockRejectedValueOnce(new Error('db down'));
      const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const result = await service.update('cmt-1', member, { body: 'なおしました' });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('cmt-1');
      errSpy.mockRestore();
    });

    it('本文を sanitize して保存する（ADR 0019・保存側 XSS 防御）', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'cmt-1',
        taskId: 1,
        authorId: 'acc-1',
        body: 'safe',
        createdAt: now,
        updatedAt: now,
        author,
      });

      await service.update('cmt-1', member, { body: '<script>alert(1)</script>やあ' });

      const savedBody = mockRepo.update.mock.calls[0][1] as string;
      expect(savedBody).not.toContain('<script>');
      expect(savedBody).toContain('やあ');
    });

    it('他人のコメントは編集できない（403・IDOR 防御）', async () => {
      await expect(service.update('cmt-1', otherMember, { body: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('ADMIN は他人のコメントも編集できる（assertOwnerOrAdmin・H4）', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'cmt-1',
        taskId: 1,
        authorId: 'acc-1',
        body: 'admin 修正',
        createdAt: now,
        updatedAt: now,
        author,
      });
      const result = await service.update('cmt-1', admin, { body: 'admin 修正' });
      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('コメントが存在しなければ NotFound', async () => {
      mockRepo.findByIdForAuth.mockResolvedValueOnce(null);
      await expect(service.update('missing', member, { body: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('非可視 Space の親タスク配下は所有判定より先に 404（存在秘匿）', async () => {
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Task not found'),
      );
      // 越境者（otherMember）でも 403 でなく 404（存在を漏らさない・assertVisible が先）。
      await expect(service.update('cmt-1', otherMember, { body: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('URL の taskId が親 task.id と一致すれば編集できる（dsk-0260）', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'cmt-1',
        taskId: 1,
        authorId: 'acc-1',
        body: 'ok',
        createdAt: now,
        updatedAt: now,
        author,
      });
      const result = await service.update('cmt-1', member, { body: 'ok' }, 1);
      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('URL の taskId が親 task.id と不一致なら 404（親子 cross-validate・dsk-0260）', async () => {
      // 可視・本人でも、別タスクの URL からは触れない（404）。可視性ゲートを先に通す順序のため
      // assertVisibleOr404 は呼ばれる（非可視コメントの親 taskId を総当たり推測される oracle を作らない・dsk-0260）。
      await expect(service.update('cmt-1', member, { body: 'x' }, 999)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalled();
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('非可視 Space は taskId 不一致でも一律 404（可視性が先に発火・oracle 無し・dsk-0260）', async () => {
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );
      // taskId が誤っていても可視性が先に 404 を返す＝正誤で応答が変わらない（情報秘匿の一貫）。
      await expect(service.update('cmt-1', member, { body: 'x' }, 999)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('mentionAccountIds 指定時は重複排除 + 存在検証して全置換で渡す（dsk-0203）', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.update.mockResolvedValue({
        id: 'cmt-1',
        taskId: 1,
        authorId: 'acc-1',
        body: 'x',
        createdAt: now,
        updatedAt: now,
        author,
      });

      await service.update('cmt-1', member, { body: 'x', mentionAccountIds: ['u2', 'u3', 'u2'] });

      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.update).toHaveBeenCalledWith('cmt-1', 'x', ['u2', 'u3']);
    });

    it('mentionAccountIds が空配列なら全クリア意図として [] を渡す（据え置きと区別・dsk-0203）', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'cmt-1',
        taskId: 1,
        authorId: 'acc-1',
        body: 'x',
        createdAt: now,
        updatedAt: now,
        author,
      });

      await service.update('cmt-1', member, { body: 'x', mentionAccountIds: [] });

      expect(mockRepo.update).toHaveBeenCalledWith('cmt-1', 'x', []);
    });

    it('存在しない accountId が含まれると BadRequest を投げ update を呼ばない（dsk-0203）', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(1);

      await expect(
        service.update('cmt-1', member, { body: 'x', mentionAccountIds: ['u2', 'ghost'] }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('検証通過後の FK 違反（P2003）は 400 へ変換する（TOCTOU・dsk-0203）', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'test' }),
      );

      await expect(
        service.update('cmt-1', member, { body: 'x', mentionAccountIds: ['u2'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      mockRepo.findByIdForAuth.mockResolvedValue({
        id: 'cmt-1',
        authorId: 'acc-1',
        task: { id: 1, spaceId: 'space-1' },
      });
      mockRepo.deleteById.mockResolvedValue(undefined);
    });

    it('投稿者本人はコメントを削除できる', async () => {
      const result = await service.remove('cmt-1', member);
      expect(result.success).toBe(true);
      expect(mockRepo.deleteById).toHaveBeenCalledWith('cmt-1');
    });

    it('他人のコメントは削除できない（403・IDOR 防御）', async () => {
      await expect(service.remove('cmt-1', otherMember)).rejects.toThrow(ForbiddenException);
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });

    it('ADMIN は他人のコメントも削除できる（H4）', async () => {
      const result = await service.remove('cmt-1', admin);
      expect(result.success).toBe(true);
      expect(mockRepo.deleteById).toHaveBeenCalledWith('cmt-1');
    });

    it('コメントが存在しなければ NotFound', async () => {
      mockRepo.findByIdForAuth.mockResolvedValueOnce(null);
      await expect(service.remove('missing', member)).rejects.toThrow(NotFoundException);
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });

    it('非可視 Space の親タスク配下は所有判定より先に 404（存在秘匿）', async () => {
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Task not found'),
      );
      await expect(service.remove('cmt-1', otherMember)).rejects.toThrow(NotFoundException);
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });

    it('URL の taskId が親 task.id と不一致なら 404（親子 cross-validate・dsk-0260）', async () => {
      await expect(service.remove('cmt-1', member, 999)).rejects.toThrow(NotFoundException);
      // 可視性ゲート先行のため assertVisibleOr404 は呼ばれる（oracle 回避の順序・dsk-0260）。
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalled();
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('toggleReaction（dsk-0297）', () => {
    beforeEach(() => {
      mockRepo.findByIdForAuth.mockResolvedValue({
        id: 'cmt-1',
        authorId: 'acc-1',
        task: { id: 1, spaceId: 'space-1' },
      });
    });

    it('可視な参加者なら投稿者本人でなくてもトグルでき ChatService.toggleReaction へ委譲する（複製しない・§3）', async () => {
      // ChatService.toggleReaction は ok({reacted}) で success/data 包みを返す（chat.service.ts 実装どおり）。
      mockChatService.toggleReaction.mockResolvedValue(commentReactionToggle(true));

      const result = await service.toggleReaction(1, 'cmt-1', 'acc-2', { emoji: '👍' });

      expect(result).toEqual(commentReactionToggle(true));
      expect(mockChatService.toggleReaction).toHaveBeenCalledWith(
        { taskCommentId: 'cmt-1' },
        'acc-2',
        '👍',
      );
    });

    it('コメントが存在しなければ NotFound（トグル前）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValueOnce(null);
      await expect(service.toggleReaction(1, 'missing', 'acc-1', { emoji: '👍' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockChatService.toggleReaction).not.toHaveBeenCalled();
    });

    it('非可視 Space のコメントは 404（存在秘匿）', async () => {
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Task comment not found'),
      );
      await expect(service.toggleReaction(1, 'cmt-1', 'intruder', { emoji: '👍' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockChatService.toggleReaction).not.toHaveBeenCalled();
    });

    it('URL の taskId が親 task.id と不一致なら 404（親子 cross-validate・dsk-0260 と同型）', async () => {
      await expect(service.toggleReaction(999, 'cmt-1', 'acc-1', { emoji: '👍' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockChatService.toggleReaction).not.toHaveBeenCalled();
    });
  });

  /**
   * 存在秘匿の応答平準化（v2-254）。対象不在の 404 と、対象が存在するが非可視の 404 が、
   * status だけでなく文言まで一致することを両分岐の実メッセージ比較で固定する。片側だけ変えると
   * 応答本文が「存在するか」の oracle に戻る（ADR 0038）。
   */
  describe('404 の応答平準化（不在と非可視で同じ文言・v2-254）', () => {
    const SPACE_X = 'space-x-invisible';
    const invisibleComment = {
      id: 'cmt-1',
      authorId: 'acc-1',
      task: { id: 1, spaceId: SPACE_X },
    };

    const denySpace = (spaceId: string) =>
      mockScopeVisibility.assertVisibleOr404.mockImplementation(
        (accountId: string | undefined | null, target: string) =>
          target === spaceId
            ? Promise.reject(new NotFoundException('Resource not found'))
            : Promise.resolve(undefined),
      );

    const messageOf = async (fn: () => Promise<unknown>): Promise<string> => {
      try {
        await fn();
        return '<no-error>';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };

    it('list: 親タスクの不在と非可視が同じ文言（Task not found）', async () => {
      mockRepo.findTaskForComment.mockResolvedValue(null);
      const missing = await messageOf(() => service.list(999, 'me'));

      mockRepo.findTaskForComment.mockResolvedValue({ id: 1, spaceId: SPACE_X });
      denySpace(SPACE_X);
      const invisible = await messageOf(() => service.list(1, 'me'));

      expect(missing).toBe('Task not found');
      expect(invisible).toBe(missing);
    });

    it('update / remove: コメントの不在と非可視が同じ文言（Task comment not found）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(null);
      const updateMissing = await messageOf(() => service.update('missing', member, { body: 'x' }));
      const removeMissing = await messageOf(() => service.remove('missing', member));

      mockRepo.findByIdForAuth.mockResolvedValue(invisibleComment);
      denySpace(SPACE_X);
      const updateInvisible = await messageOf(() => service.update('cmt-1', member, { body: 'x' }));
      const removeInvisible = await messageOf(() => service.remove('cmt-1', member));

      expect(updateMissing).toBe('Task comment not found');
      expect(updateInvisible).toBe(updateMissing);
      expect(removeInvisible).toBe(removeMissing);
    });

    it('toggleReaction: コメントの不在と非可視が同じ文言（Task comment not found）', async () => {
      mockRepo.findByIdForAuth.mockResolvedValue(null);
      const missing = await messageOf(() =>
        service.toggleReaction(1, 'missing', 'me', { emoji: '👍' }),
      );

      mockRepo.findByIdForAuth.mockResolvedValue(invisibleComment);
      denySpace(SPACE_X);
      const invisible = await messageOf(() =>
        service.toggleReaction(1, 'cmt-1', 'me', { emoji: '👍' }),
      );

      expect(missing).toBe('Task comment not found');
      expect(invisible).toBe(missing);
    });
  });

  /**
   * v2-259: 入力依存不変条件（不在でも可視範囲の解決を対象取得より先に通す）。
   */
  describe('404 の応答コスト平準化（不在でも可視範囲の解決を先に通す・v2-259）', () => {
    /** 呼び出し順の比較（resetMocks 済みなので各テストの 1 回目同士を比べる）。 */
    const calledBefore = (first: jest.Mock, second: jest.Mock): boolean =>
      first.mock.invocationCallOrder[0] < second.mock.invocationCallOrder[0];

    beforeEach(() => {
      mockRepo.findTaskForComment.mockResolvedValue(null);
      mockRepo.findByIdForAuth.mockResolvedValue(null);
      mockScopeVisibility.resolveVisibleSpaceIds.mockResolvedValue(['space-1']);
    });

    it('list: 親タスク不在でも可視範囲の解決を親タスク取得より先に通る', async () => {
      await expect(service.list(999, 'acc-1')).rejects.toThrow(NotFoundException);

      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith('acc-1');
      expect(
        calledBefore(mockScopeVisibility.resolveVisibleSpaceIds, mockRepo.findTaskForComment),
      ).toBe(true);
    });

    it('update: コメント不在でも可視範囲の解決をコメント取得より先に通る', async () => {
      await expect(service.update('missing', member, { body: 'x' })).rejects.toThrow(
        NotFoundException,
      );

      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith(member.id);
      expect(
        calledBefore(mockScopeVisibility.resolveVisibleSpaceIds, mockRepo.findByIdForAuth),
      ).toBe(true);
    });
  });
});
