import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TaskActivitiesController } from './task-activities.controller';
import { TaskActivitiesService } from './task-activities.service';

const mockService = {
  list: jest.fn(),
};

describe('TaskActivitiesController', () => {
  let controller: TaskActivitiesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskActivitiesController],
      providers: [{ provide: TaskActivitiesService, useValue: mockService }],
    }).compile();

    controller = module.get<TaskActivitiesController>(TaskActivitiesController);
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findActivities', () => {
    it('タスク id・現在ユーザー id を Service へ委譲し結果を返すこと', async () => {
      const expected = { success: true, data: { activities: [], truncated: false } };
      mockService.list.mockResolvedValue(expected);

      const result = await controller.findActivities(42, 'acc-1');

      expect(result).toBe(expected);
      // ParseIntPipe で解析済みの number と @CurrentUser('id') の accountId をこの順で委譲。
      expect(mockService.list).toHaveBeenCalledWith(42, 'acc-1');
    });
  });

  describe('ルーティング / ガードのメタデータ', () => {
    it('GET は :id/activities にマッピングされていること', () => {
      const getPath = Reflect.getMetadata('path', controller.findActivities);
      const getMethod = Reflect.getMetadata('method', controller.findActivities);
      expect(getPath).toBe(':id/activities');
      // RequestMethod.GET = 0（@nestjs/common の enum 値）。
      expect(getMethod).toBe(0);
    });

    it('クラスは認証ガードを備えること', () => {
      // set-0180: FeaturePermissionGuard 剥がし後、認証ガードのみ（AuthenticatedGuard）が付与される。
      const guards = Reflect.getMetadata('__guards__', TaskActivitiesController);
      expect(Array.isArray(guards)).toBe(true);
      expect(guards).toHaveLength(1);
    });
  });
});
