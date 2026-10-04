import { Module } from '@nestjs/common';
import { TaskCommentsController } from './task-comments.controller';
import { TaskCommentsService } from './task-comments.service';
import { TaskCommentsRepository } from './repositories/task-comments.repository';
import { MembershipsModule } from '../memberships/memberships.module';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  // MembershipsModule が ScopeVisibilityService を export する（タスクと同じ可視性境界 / chat・tasks と同方針）。
  // MembershipsModule は他 CM-2 モジュールを import しないため一方向で循環なし。
  // TaskActivitiesModule: コメント投稿時に「スレッドの更新」履歴を記録するため Service を借りる（dsk-0246）。
  // 同モジュールは TaskComments を import しないため循環なし。
  // ChatModule: リアクショントグル本体（ChatService.toggleReaction）を再利用するため import（dsk-0297・
  // §3 コピペ禁止）。ChatModule は MembershipsModule のみ import し TaskComments 側へ依存しないため循環なし。
  imports: [MembershipsModule, TaskActivitiesModule, ChatModule],
  controllers: [TaskCommentsController],
  providers: [TaskCommentsService, TaskCommentsRepository],
})
export class TaskCommentsModule {}
