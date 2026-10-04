-- dsk-0228: task_activities の一覧用複合 index に id を第3キーとして追加する。
-- listByTask は ORDER BY created_at DESC, id DESC LIMIT 200 で最新側を切り出すが、
-- 旧 index (task_id, created_at) は id を含まず、createMany による同一 created_at の行束が
-- 大きい場合に id 二次ソートが index 外へはみ出し LIMIT の早期終了を阻害しうる。
-- (task_id, created_at, id) へ拡張し、打ち切りを常に index 内で完結させる（旧 index は置換＝削除）。

-- DropIndex
DROP INDEX "task_activities_task_id_created_at_idx";

-- CreateIndex
CREATE INDEX "task_activities_task_id_created_at_id_idx" ON "task_activities"("task_id", "created_at", "id");
