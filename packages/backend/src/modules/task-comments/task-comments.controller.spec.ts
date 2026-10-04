import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TaskCommentsController } from './task-comments.controller';
import { TaskCommentsService } from './task-comments.service';
import { throttleLimitOf, throttleTtlOf } from '../../common/testing/throttle-metadata';

const mockService = {
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  toggleReaction: jest.fn(),
};

// 認可判定に使う最小ユーザー（@CurrentUser() で注入される AuthenticatedUser の部分集合）。
const user = { id: 'acc-1', role: 'MEMBER' } as never;

describe('TaskCommentsController', () => {
  let controller: TaskCommentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskCommentsController],
      providers: [{ provide: TaskCommentsService, useValue: mockService }],
    }).compile();

    controller = module.get<TaskCommentsController>(TaskCommentsController);
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findComments', () => {
    it('タスク id・現在ユーザー id を Service へ委譲し結果を返すこと', async () => {
      const expected = { success: true, data: [] };
      mockService.list.mockResolvedValue(expected);

      const result = await controller.findComments(42, 'acc-1');

      expect(result).toBe(expected);
      // ParseIntPipe で解析済みの number と @CurrentUser('id') の accountId をこの順で委譲。
      expect(mockService.list).toHaveBeenCalledWith(42, 'acc-1');
    });
  });

  describe('postComment', () => {
    it('タスク id・authorId・dto をこの順で Service へ委譲すること', async () => {
      const dto = { body: '対応しました' };
      const expected = { success: true, data: { id: 'cmt-1' } };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.postComment(42, 'acc-1', dto as never);

      expect(result).toBe(expected);
      // authorId は @CurrentUser('id') 由来（client 指定でなくセッションユーザー）。
      expect(mockService.create).toHaveBeenCalledWith(42, 'acc-1', dto);
    });
  });

  describe('updateComment', () => {
    it('commentId・user・dto・taskId をこの順で Service へ委譲すること（dsk-0241・親子検証 dsk-0260）', async () => {
      const dto = { body: 'なおしました' };
      const expected = { success: true, data: { id: 'cmt-1' } };
      mockService.update.mockResolvedValue(expected);

      const result = await controller.updateComment(42, 'cmt-1', user, dto as never);

      expect(result).toBe(expected);
      // 所有判定は commentId（UUID）+ user、親子 cross-validate 用に taskId を末尾で委譲（dsk-0260）。
      expect(mockService.update).toHaveBeenCalledWith('cmt-1', user, dto, 42);
    });
  });

  describe('deleteComment', () => {
    it('commentId・user・taskId をこの順で Service へ委譲すること（dsk-0241・親子検証 dsk-0260）', async () => {
      const expected = { success: true, message: 'Task comment deleted successfully' };
      mockService.remove.mockResolvedValue(expected);

      const result = await controller.deleteComment(42, 'cmt-1', user);

      expect(result).toBe(expected);
      expect(mockService.remove).toHaveBeenCalledWith('cmt-1', user, 42);
    });
  });

  describe('toggleReaction（dsk-0297）', () => {
    it('タスク id・コメント id・authorId・dto をこの順で Service へ委譲すること', async () => {
      const dto = { emoji: '👍' };
      const expected = { success: true, data: { reacted: true } };
      mockService.toggleReaction.mockResolvedValue(expected);

      const result = await controller.toggleReaction(42, 'cmt-1', 'acc-1', dto as never);

      expect(result).toBe(expected);
      expect(mockService.toggleReaction).toHaveBeenCalledWith(42, 'cmt-1', 'acc-1', dto);
    });
  });

  describe('ルーティング / ガードのメタデータ', () => {
    it('GET は :id/comments、POST は :id/comments にマッピングされていること', () => {
      const getPath = Reflect.getMetadata('path', controller.findComments);
      const getMethod = Reflect.getMetadata('method', controller.findComments);
      const postPath = Reflect.getMetadata('path', controller.postComment);
      const postMethod = Reflect.getMetadata('method', controller.postComment);
      expect(getPath).toBe(':id/comments');
      // RequestMethod.GET = 0 / POST = 1（@nestjs/common の enum 値）。
      expect(getMethod).toBe(0);
      expect(postPath).toBe(':id/comments');
      expect(postMethod).toBe(1);
    });

    it('クラスは認証ガードを備えること', () => {
      // set-0180: FeaturePermissionGuard 剥がし後、認証ガードのみ（AuthenticatedGuard）が付与される。
      const guards = Reflect.getMetadata('__guards__', TaskCommentsController);
      expect(Array.isArray(guards)).toBe(true);
      expect(guards).toHaveLength(1);
    });

    it('POST のみ @Throttle が掛かり、GET には掛からないこと（書き込み系のスパム抑制）', () => {
      // @Throttle({ default: { limit, ttl } }) は per-name メタデータ（`<KEY>default`）をメソッドへ付与する。
      // POST は limit=20 / ttl=60_000、GET は未付与（undefined）。
      const postLimit = throttleLimitOf(controller.postComment);
      const postTtl = throttleTtlOf(controller.postComment);
      const getLimit = throttleLimitOf(controller.findComments);
      expect(postLimit).toBe(20);
      expect(postTtl).toBe(60_000);
      expect(getLimit).toBeUndefined();
    });

    it('POST は 201 Created を返すこと（@HttpCode(HttpStatus.CREATED)）', () => {
      const status = Reflect.getMetadata('__httpCode__', controller.postComment);
      expect(status).toBe(201);
    });

    it('PATCH/DELETE は :id/comments/:commentId にマッピングされること（dsk-0241）', () => {
      const patchPath = Reflect.getMetadata('path', controller.updateComment);
      const patchMethod = Reflect.getMetadata('method', controller.updateComment);
      const deletePath = Reflect.getMetadata('path', controller.deleteComment);
      const deleteMethod = Reflect.getMetadata('method', controller.deleteComment);
      expect(patchPath).toBe(':id/comments/:commentId');
      expect(deletePath).toBe(':id/comments/:commentId');
      // RequestMethod.POST=1 / PUT=2 / DELETE=3 / PATCH=4（@nestjs/common の enum 値）。
      expect(patchMethod).toBe(4);
      expect(deleteMethod).toBe(3);
    });

    it('PATCH は 20/min、DELETE は 10/min の Throttle（書き込み系のスパム抑制・削除は厳しめ）', () => {
      const patchLimit = throttleLimitOf(controller.updateComment);
      const deleteLimit = throttleLimitOf(controller.deleteComment);
      expect(patchLimit).toBe(20);
      expect(deleteLimit).toBe(10);
    });

    it('POST reactions は :id/comments/:commentId/reactions にマッピングされ 30/min・200 OK で返すこと（dsk-0297・chat 側と同率）', () => {
      const path = Reflect.getMetadata('path', controller.toggleReaction);
      const method = Reflect.getMetadata('method', controller.toggleReaction);
      const limit = throttleLimitOf(controller.toggleReaction);
      const status = Reflect.getMetadata('__httpCode__', controller.toggleReaction);
      expect(path).toBe(':id/comments/:commentId/reactions');
      // RequestMethod.POST = 1
      expect(method).toBe(1);
      expect(limit).toBe(30);
      expect(status).toBe(200);
    });
  });
});
