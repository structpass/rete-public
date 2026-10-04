-- dsk-0225: task_activities.field の許容値を DB CHECK 制約で強制する。
-- field は Prisma enum でなく String 運用（許容値追加が軽い）のため、enum 型化せず CHECK で値集合を明示する。
-- 許容値: status / category / assignee / startDate / dueDate / parent / space（'space' は dsk-0225 で追加）。
-- 既存データは上記許容値のみで構成されている前提（dsk-0223 以降の記録経路が field を限定）なので NOT VALID は使わず即時検証で付与する。
-- MANUAL: この CHECK は prisma schema では表現不可（reaction_target_xor / attachment_target_xor と同じ運用）。
-- `prisma migrate reset` で DB を作り直すと本マイグレーションが再適用されるため通常は問題ないが、schema からの
-- 自動再生成（db push 等）や新規 baseline 採番時はこの CHECK が脱落し得る。その場合は本制約を手動で再適用すること。
ALTER TABLE "task_activities"
  ADD CONSTRAINT "task_activities_field_check"
  CHECK ("field" IN ('status', 'category', 'assignee', 'startDate', 'dueDate', 'parent', 'space'));
