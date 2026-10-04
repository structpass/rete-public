-- dsk-0246: task_activities.field に 'outcome'（顛末の更新）/ 'thread'（スレッドの更新）を追加する。
-- 顛末（tenmatsu）更新・起点カード（題名/説明=スレッド）更新を履歴に残すため、CHECK の許容値集合を拡張する。
-- field は Prisma enum でなく String + CHECK 運用（許容値追加が軽い）のため、enum 型化せず CHECK を貼り替える。
-- 許容値: status / category / assignee / startDate / dueDate / parent / space / outcome / thread。
-- 既存データは旧許容値のみで構成される前提（記録経路が field を限定）なので NOT VALID は使わず即時検証で再付与する。
-- MANUAL: この CHECK は prisma schema では表現不可（20260624060000_add_task_activity_field_check と同じ運用）。
-- `prisma migrate reset` での再適用は問題ないが、schema からの自動再生成（db push 等）では脱落し得る。脱落時は手動再適用。
ALTER TABLE "task_activities" DROP CONSTRAINT "task_activities_field_check";

ALTER TABLE "task_activities"
  ADD CONSTRAINT "task_activities_field_check"
  CHECK ("field" IN ('status', 'category', 'assignee', 'startDate', 'dueDate', 'parent', 'space', 'outcome', 'thread'));
