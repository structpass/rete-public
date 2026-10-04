-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source_theme_id" TEXT;

-- Backfill: 既存タスクの sort_order を各兄弟グループ（category_id + parent_task_id）内で
-- 現 id 昇順に 0 始まりで採番し、現行の表示順を保存する。
-- NULLS NOT DISTINCT 相当の挙動: parent_task_id が NULL（トップレベル）は同一カテゴリ内で 1 グループに束ねる。
UPDATE "tasks" SET "sort_order" = sub.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "category_id", "parent_task_id"
           ORDER BY "id"
         ) - 1 AS rn
  FROM "tasks"
) sub
WHERE "tasks"."id" = sub."id";

-- CreateIndex
CREATE INDEX "tasks_category_id_parent_task_id_sort_order_idx" ON "tasks"("category_id", "parent_task_id", "sort_order");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_theme_id_fkey" FOREIGN KEY ("source_theme_id") REFERENCES "chat_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
