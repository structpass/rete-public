import type { TaskActivity, Account } from '@prisma/client';
import type {
  TaskActivityActorDto,
  TaskActivityField,
  TaskActivityResponseDto,
} from './dto/task-activity-response.dto';

// 操作者は表示名 + id のみ取得・露出する（email 等の個人情報をクエリ／レスポンスに乗せない）。
type ActorPick = Pick<Account, 'id' | 'name'>;
// actor は SetNull により null になりうる（操作者 Account 削除後）。
type ActivityWithActor = TaskActivity & { actor: ActorPick | null };

function toActor(actor: ActorPick | null): TaskActivityActorDto | null {
  if (!actor) return null;
  return { id: actor.id, name: actor.name };
}

/**
 * TaskActivity Entity（actor 同梱）を Response DTO へ写す（§1 DTO 境界・Date は ISO 文字列化）。
 *
 * 【不変条件・dsk-0224】fromLabel/toLabel は DB に保存された生のラベルをそのまま写す（mapper でも加工しない）。
 * これらは保存時に sanitize されていない正規名なので、表示は必ずフロントの React テキストノードとして
 * 描画し（自動エスケープ）、dangerouslySetInnerHTML / innerHTML 等で描画してはならない（XSS 防御の最終境界）。
 */
export function toTaskActivityResponse(activity: ActivityWithActor): TaskActivityResponseDto {
  return {
    id: activity.id,
    taskId: activity.taskId,
    // DB 列は String だが許容値は CHECK 制約（task_activities_field_check）が TaskActivityField と
    // 1:1 で強制する。書き込み側も union 型でしか record できないため、ここで union へ狭める（cmn-0211）。
    field: activity.field as TaskActivityField,
    fromLabel: activity.fromLabel,
    toLabel: activity.toLabel,
    actor: toActor(activity.actor),
    createdAt: activity.createdAt.toISOString(),
  };
}
