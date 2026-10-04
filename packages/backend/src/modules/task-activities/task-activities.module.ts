import { Module } from '@nestjs/common';
import { TaskActivitiesController } from './task-activities.controller';
import { TaskActivitiesService } from './task-activities.service';
import { TaskActivitiesRepository } from './repositories/task-activities.repository';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  // MembershipsModule が ScopeVisibilityService を export する（タスクと同じ可視性境界 / task-comments と同方針）。
  // MembershipsModule は他 CM-2 モジュールを import しないため一方向で循環なし。
  imports: [MembershipsModule],
  controllers: [TaskActivitiesController],
  providers: [TaskActivitiesService, TaskActivitiesRepository],
  // TasksModule が記録（record）に使うため Service を export する。
  exports: [TaskActivitiesService],
})
export class TaskActivitiesModule {}
