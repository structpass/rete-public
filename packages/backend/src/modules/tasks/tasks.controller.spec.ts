import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Role } from '@rete/shared';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

/** テスト用最小 AuthenticatedUser（owner check 系に渡す user オブジェクト）。 */
const makeUser = (role: Role = Role.MEMBER) => ({
  id: 'acc-1',
  email: 'test@example.com',
  name: 'テスト',
  role,
  businessRoleId: null,
  featurePermissions: {
    chat: { canRead: false, canCreate: false, canUpdate: false, canDelete: false },
    task: { canRead: true, canCreate: true, canUpdate: true, canDelete: true },
    file: { canRead: false, canCreate: false, canUpdate: false, canDelete: false },
  },
});

const mockTasksService = {
  findAll: jest.fn(),
  findTree: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  move: jest.fn(),
  remove: jest.fn(),
  toggleReaction: jest.fn(),
};

describe('TasksController', () => {
  let controller: TasksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: mockTasksService }],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('タスク一覧を返すこと', async () => {
      const expected = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };
      mockTasksService.findAll.mockResolvedValue(expected);

      const query = { page: 1, limit: 20 };
      const result = await controller.findAll(query as never, 'acc-1');

      expect(result).toEqual(expected);
      // accountId を service へ渡す（存在秘匿フィルタ / rete-hardening-0002）。
      expect(mockTasksService.findAll).toHaveBeenCalledWith(query, 'acc-1');
    });
  });

  describe('findOne', () => {
    it('タスク詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, title: 'タスク' } };
      mockTasksService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1, 'acc-1');

      expect(result).toEqual(expected);
      // accountId を service へ渡す（単体 GET の存在秘匿 404 / rete-hardening-0002）。
      expect(mockTasksService.findOne).toHaveBeenCalledWith(1, 'acc-1');
    });
  });

  describe('create', () => {
    it('dto と creatorId を Service へ委譲し結果を返すこと（H4: owner 登録）', async () => {
      const dto = { title: '新タスク', categoryId: 1 };
      const expected = { success: true, data: { id: 1, ...dto } };
      mockTasksService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as never, 'acc-1');

      expect(result).toEqual(expected);
      expect(mockTasksService.create).toHaveBeenCalledWith(dto, 'acc-1');
    });
  });

  describe('update', () => {
    it('id・dto・user オブジェクトを Service へ委譲すること（H4: requesterId → user）', async () => {
      const dto = { title: '更新タスク' };
      const expected = { success: true, data: { id: 1, title: '更新タスク' } };
      const user = makeUser();
      mockTasksService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as never, user as never);

      expect(result).toEqual(expected);
      expect(mockTasksService.update).toHaveBeenCalledWith(1, dto, user);
    });
  });

  describe('move', () => {
    it('id・move payload・user を service.move へ移譲すること（HIGH-1: IDOR 修正）', async () => {
      const dto = { parentTaskId: 7, categoryId: 2, afterTaskId: null };
      const expected = { success: true, data: { id: 100, parentTaskId: 7, categoryId: 2 } };
      const user = makeUser();
      mockTasksService.move.mockResolvedValue(expected);

      const result = await controller.move(100, dto as never, user as never);

      expect(result).toEqual(expected);
      expect(mockTasksService.move).toHaveBeenCalledWith(100, dto, user);
    });
  });

  describe('remove', () => {
    it('id と user オブジェクトを Service へ委譲すること（H4: requesterId → user）', async () => {
      const expected = { success: true, data: { message: 'Task deleted successfully' } };
      const user = makeUser();
      mockTasksService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1, user as never);

      expect(result).toEqual(expected);
      expect(mockTasksService.remove).toHaveBeenCalledWith(1, user);
    });
  });

  describe('toggleReaction（dsk-0297・起点カードへのリアクション）', () => {
    it('id・authorId・dto を Service へ委譲し結果を返すこと', async () => {
      const dto = { emoji: '👍' };
      const expected = { reacted: true };
      mockTasksService.toggleReaction.mockResolvedValue(expected);

      const result = await controller.toggleReaction(1, 'acc-1', dto as never);

      expect(result).toEqual(expected);
      expect(mockTasksService.toggleReaction).toHaveBeenCalledWith(1, 'acc-1', dto);
    });
  });

  describe('findTree', () => {
    it('service.findTree に移譲すること（spaceId 未指定）', async () => {
      const expected = { success: true, data: { categories: [] } };
      mockTasksService.findTree.mockResolvedValue(expected);

      const result = await controller.findTree({}, 'acc-1');

      expect(result).toEqual(expected);
      // accountId を service へ渡す（可視 Space のみへ絞る / rete-hardening-0002）。
      expect(mockTasksService.findTree).toHaveBeenCalledWith(undefined, 'acc-1');
    });

    it('spaceId 指定時はそのまま service.findTree へ渡すこと', async () => {
      const expected = { success: true, data: { categories: [] } };
      mockTasksService.findTree.mockResolvedValue(expected);
      const spaceId = '00000000-0000-4000-b000-000000000003';

      await controller.findTree({ spaceId }, 'acc-1');

      expect(mockTasksService.findTree).toHaveBeenCalledWith(spaceId, 'acc-1');
    });
  });
});
