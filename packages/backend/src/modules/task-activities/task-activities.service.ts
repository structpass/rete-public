import { Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_CHANNEL_ID } from '@rete/shared';
import { ok } from '../../common/dto';
import { assertSpaceVisibleOr404, primeVisibleSpaces } from '../../common/visibility';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';
import {
  TaskActivitiesRepository,
  TaskActivityChange,
} from './repositories/task-activities.repository';
import { toTaskActivityResponse } from './task-activities.mapper';
import { TaskActivityListResponseDto } from './dto/task-activity-response.dto';

/**
 * 404 の「対象不在」文言（v2-254）。親タスクが存在しない時と、存在するが呼び出し元に非可視の時で
 * 同じ文言を返す——という不変条件を 1 箇所で保つため定数にする（非可視側は common/visibility の
 * assertSpaceVisibleOr404 で本定数へ写し替える・存在秘匿 ADR 0038）。
 */
const TASK_NOT_FOUND_MESSAGE = 'Task not found';

@Injectable()
export class TaskActivitiesService {
  constructor(
    private readonly repo: TaskActivitiesRepository,
    // 認可境界はタスクと同一（tasks.service / task-comments.service と同じ ScopeVisibilityService）。
    // 親タスクが非可視 Space なら「無いことにする」= 404（存在秘匿・越境に存在を漏らさない）。
    private readonly scopeVisibility: ScopeVisibilityService,
  ) {}

  /**
   * 親タスクの存在検証 + Space 可視性ゲートを 1 箇所に集約する（task-comments.assertTaskVisible と同型）。
   * tasks.service.findOne と同じ境界: 親タスク不在は 404、非可視 Space も 404 へ畳む。
   */
  private async assertTaskVisible(taskId: number, accountId?: string) {
    // v2-259: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型）。
    await primeVisibleSpaces(this.scopeVisibility, accountId);
    const task = await this.repo.findTaskForActivity(taskId);
    if (!task) {
      throw new NotFoundException(TASK_NOT_FOUND_MESSAGE);
    }
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      task.spaceId ?? DEFAULT_CHANNEL_ID,
      TASK_NOT_FOUND_MESSAGE,
    );
  }

  /**
   * 当該タスクの監査ログを時系列昇順で返す（タスク閲覧権限が無ければ 404・親タスクと同じ可視性）。
   * data は { activities, truncated } の包み（dsk-0228・TaskActivityListResponseDto）。
   * truncated=true は取得上限で古い側が切れたことを示し、frontend 履歴タブが注記を出す。
   */
  async list(taskId: number, accountId?: string) {
    await this.assertTaskVisible(taskId, accountId);
    const { rows, truncated } = await this.repo.listByTask(taskId);
    const body: TaskActivityListResponseDto = {
      activities: rows.map(toTaskActivityResponse),
      truncated,
    };
    return ok(body);
  }

  /**
   * タスク属性変更の監査ログを記録する（POST は持たず tasks.service 内部からのみ呼ばれる）。
   * changes が空なら DB を打たず即 return（無変更 update でゴミ行を作らない）。
   * 例外は飲み込まず投げる（呼び出し側 = tasks.service が try/catch で監査失敗を本処理から切り離す方針）。
   */
  async record(taskId: number, actorAccountId: string | null, changes: TaskActivityChange[]) {
    if (changes.length === 0) return;
    await this.repo.createMany(taskId, actorAccountId, changes);
  }
}
