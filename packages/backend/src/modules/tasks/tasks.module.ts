import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './repositories/tasks.repository';
import { MembershipsModule } from '../memberships/memberships.module';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  // MembershipsModule が ScopeVisibilityService を export する（Space 可視性による越境作成封鎖
  // / rete-hardening-0001）。MembershipsModule は他 CM-2 モジュールを import しないため一方向で循環なし。
  // TaskActivitiesModule は TaskActivitiesService を export する（属性変更の監査記録 / dsk-0223）。
  // ChatModule: 起点カードのリアクショントグル本体（ChatService.toggleReaction）を再利用するため import
  // （dsk-0297・§3 コピペ禁止・task-comments.module と同方針）。ChatModule は MembershipsModule のみ import し
  // Tasks 側へ依存しないため循環なし。
  imports: [MembershipsModule, TaskActivitiesModule, ChatModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
  exports: [TasksService],
})
export class TasksModule {}
