import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { TaskActivitiesService } from './task-activities.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// タスク監査ログはタスクと同じ認可境界（認証必須 / H4）。
// 可視性（Space スコープ）は service 層で親タスクに合わせて enforce する（ScopeVisibilityService）。
// ルートは /tasks/:id/activities。tasks.controller の `:id` は単一セグメントのため衝突しない。
// 記録（書き込み）は POST を持たず tasks.service 内部から行うため、本 controller は GET のみ（task-comments と非対称な読取専用）。
@ApiTags('tasks')
@Controller('tasks')
@UseGuards(AuthenticatedGuard)
export class TaskActivitiesController {
  constructor(private readonly service: TaskActivitiesService) {}

  // 監査ログ列挙のレート制限は、グローバル ThrottlerModule（30req/60s・app.module.ts）が
  // 全エンドポイントに適用済みで、task-comments GET と同じくグローバル依存で同水準が効く。
  // 明示 @Throttle はグローバルと同値の no-op になり、将来グローバルを締めた時このメソッドだけ
  // 旧値で固定され緩くなる逆転を招くため付けない（criteria item2 はグローバルで既達・dsk-0224）。
  @Get(':id/activities')
  @ApiOperation({ summary: 'タスク属性変更の監査ログ一覧取得（createdAt 昇順）' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  async findActivities(
    @Param('id', ParseIntPipe) taskId: number,
    @CurrentUser('id') accountId: string,
  ) {
    return this.service.list(taskId, accountId);
  }
}
