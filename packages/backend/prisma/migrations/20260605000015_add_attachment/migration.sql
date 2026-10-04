-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "file_version_id" TEXT NOT NULL,
    "task_id" INTEGER,
    "chat_message_id" TEXT,
    "attached_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_task_id_idx" ON "attachments"("task_id");

-- CreateIndex
CREATE INDEX "attachments_chat_message_id_idx" ON "attachments"("chat_message_id");

-- CreateIndex
CREATE INDEX "attachments_file_version_id_idx" ON "attachments"("file_version_id");

-- CreateIndex
CREATE INDEX "attachments_attached_by_id_idx" ON "attachments"("attached_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_task_id_file_version_id_key" ON "attachments"("task_id", "file_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_chat_message_id_file_version_id_key" ON "attachments"("chat_message_id", "file_version_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_version_id_fkey" FOREIGN KEY ("file_version_id") REFERENCES "file_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 排他制約（XOR）: task_id / chat_message_id はちょうど一方が非 NULL。Prisma schema では表現できないため手書き。
-- MANUAL: この CHECK は prisma schema では表現不可（reaction_target_xor と同じ運用）。`prisma migrate reset` で
-- DB を作り直すと本マイグレーションが再適用されるため通常は問題ないが、schema からの自動再生成（db push 等）や
-- 新規 baseline 採番時はこの CHECK が脱落し得る。その場合は本制約を手動で再適用すること。
ALTER TABLE "attachments" ADD CONSTRAINT attachment_target_xor CHECK ((("task_id" IS NOT NULL)::int + ("chat_message_id" IS NOT NULL)::int) = 1);
