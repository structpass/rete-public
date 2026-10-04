import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TaskActivitiesService } from './task-activities.service';
import type { TaskActivityChange } from './repositories/task-activities.repository';
import { TaskActivitiesRepository } from './repositories/task-activities.repository';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';

const mockRepo = {
  findTaskForActivity: jest.fn(),
  listByTask: jest.fn(),
  createMany: jest.fn(),
};

// 存在秘匿ガードのモック。既定は「可視」。越境テストのみ assertVisibleOr404 を NotFound へ差し替える。
const mockScopeVisibility = {
  canAccessSpace: jest.fn(),
  resolveVisibleSpaceIds: jest.fn(),
  assertVisibleOr404: jest.fn(),
};

const actor = { id: 'acc-1', name: '佐久間 健' };
const now = new Date('2026-06-24T00:00:00.000Z');

describe('TaskActivitiesService', () => {
  let service: TaskActivitiesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskActivitiesService,
        { provide: TaskActivitiesRepository, useValue: mockRepo },
        { provide: ScopeVisibilityService, useValue: mockScopeVisibility },
      ],
    }).compile();
    service = module.get<TaskActivitiesService>(TaskActivitiesService);
    mockScopeVisibility.assertVisibleOr404.mockResolvedValue(undefined);
    mockRepo.findTaskForActivity.mockResolvedValue({ id: 1, spaceId: 'space-1' });
  });

  describe('list', () => {
    it('当該タスクの監査ログを { activities, truncated } の DTO で返す（DTO shape 検証・dsk-0228）', async () => {
      mockRepo.listByTask.mockResolvedValue({
        rows: [
          {
            id: 'act-1',
            taskId: 1,
            actorAccountId: 'acc-1',
            field: 'status',
            fromLabel: '未着手',
            toLabel: '対応中',
            createdAt: now,
            actor,
          },
          {
            id: 'act-2',
            taskId: 1,
            actorAccountId: 'acc-1',
            field: 'assignee',
            fromLabel: '未割当',
            toLabel: '佐久間 健',
            createdAt: new Date('2026-06-24T01:00:00.000Z'),
            actor,
          },
        ],
        truncated: false,
      });

      const result = await service.list(1, 'acc-1');

      expect(result.success).toBe(true);
      expect(result.data.truncated).toBe(false);
      expect(result.data.activities).toHaveLength(2);
      const [first] = result.data.activities;
      expect(first).toEqual({
        id: 'act-1',
        taskId: 1,
        field: 'status',
        fromLabel: '未着手',
        toLabel: '対応中',
        actor: { id: 'acc-1', name: '佐久間 健' },
        createdAt: '2026-06-24T00:00:00.000Z',
      });
      // 時系列順（repository の orderBy 昇順）を service がそのまま保つ。
      expect(result.data.activities.map((a) => a.id)).toEqual(['act-1', 'act-2']);
    });

    it('repository の truncated=true をそのまま DTO へ透過する（打ち切りシグナル・dsk-0228）', async () => {
      mockRepo.listByTask.mockResolvedValue({ rows: [], truncated: true });

      const result = await service.list(1, 'acc-1');

      expect(result.data.truncated).toBe(true);
      expect(result.data.activities).toEqual([]);
    });

    it('親タスクが存在しなければ NotFound（タスクと同じ境界）', async () => {
      mockRepo.findTaskForActivity.mockResolvedValue(null);
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

  describe('record', () => {
    it('変更があれば createMany へ taskId / actor / changes を委譲すること', async () => {
      const changes: TaskActivityChange[] = [
        { field: 'status', fromLabel: '未着手', toLabel: '完了' },
      ];
      await service.record(1, 'acc-1', changes);
      expect(mockRepo.createMany).toHaveBeenCalledWith(1, 'acc-1', changes);
    });

    it('changes が空なら createMany を呼ばないこと（ゴミ行を作らない）', async () => {
      await service.record(1, 'acc-1', []);
      expect(mockRepo.createMany).not.toHaveBeenCalled();
    });

    it('actor は null 許容（内部経路）であること', async () => {
      const changes: TaskActivityChange[] = [
        { field: 'category', fromLabel: '未分類', toLabel: '入荷' },
      ];
      await service.record(1, null, changes);
      expect(mockRepo.createMany).toHaveBeenCalledWith(1, null, changes);
    });
  });

  /**
   * 存在秘匿の応答平準化（v2-254）。親タスクの不在の 404 と、親タスクが在るが器が非可視の 404 が、
   * status だけでなく文言まで一致することを両分岐の実メッセージ比較で固定する（ADR 0038）。
   */
  describe('404 の応答平準化（不在と非可視で同じ文言・v2-254）', () => {
    const SPACE_X = 'space-x-invisible';

    const messageOf = async (fn: () => Promise<unknown>): Promise<string> => {
      try {
        await fn();
        return '<no-error>';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };

    it('list: 親タスクの不在と非可視が同じ文言（Task not found）', async () => {
      mockRepo.findTaskForActivity.mockResolvedValue(null);
      const missing = await messageOf(() => service.list(999, 'me'));

      mockRepo.findTaskForActivity.mockResolvedValue({ id: 1, spaceId: SPACE_X });
      mockScopeVisibility.assertVisibleOr404.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );
      const invisible = await messageOf(() => service.list(1, 'me'));

      expect(missing).toBe('Task not found');
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

    it('list: 親タスク不在でも可視範囲の解決を親タスク取得より先に通る', async () => {
      mockRepo.findTaskForActivity.mockResolvedValue(null);
      mockScopeVisibility.resolveVisibleSpaceIds.mockResolvedValue(['space-1']);

      await expect(service.list(999, 'acc-1')).rejects.toThrow(NotFoundException);

      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith('acc-1');
      expect(
        calledBefore(mockScopeVisibility.resolveVisibleSpaceIds, mockRepo.findTaskForActivity),
      ).toBe(true);
    });
  });
});
