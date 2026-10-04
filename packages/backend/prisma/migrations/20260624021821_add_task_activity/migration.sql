-- CreateTable
CREATE TABLE "task_activities" (
    "id" TEXT NOT NULL,
    "task_id" INTEGER NOT NULL,
    "actor_account_id" TEXT,
    "field" TEXT NOT NULL,
    "from_label" TEXT,
    "to_label" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_activities_task_id_created_at_idx" ON "task_activities"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_activities_actor_account_id_idx" ON "task_activities"("actor_account_id");

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
