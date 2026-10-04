-- dsk-0249: 添付先にタスクコメント（TaskComment＝スレッド投稿物）を追加。XOR を
-- task/chat_message/theme/announcement の 4 分岐から task/chat_message/theme/announcement/task_comment の
-- 5 分岐へ拡張する（add_attachment_announcement_target と同方針）。チャット返信（chat_message 添付）と
-- 対称に、タスク詳細のコメント＝投稿物に添付がぶら下がる。

-- AlterTable: 添付先タスクコメント列を追加（NULL 許容・ポリモーフィック XOR の一肢）。
ALTER TABLE "attachments" ADD COLUMN "task_comment_id" TEXT;

-- CreateIndex
CREATE INDEX "attachments_task_comment_id_idx" ON "attachments"("task_comment_id");

-- CreateIndex: 同一コメントへの同一版の二重添付防止（NULL 列は別 unique に分割）。
CREATE UNIQUE INDEX "attachments_task_comment_id_file_version_id_key" ON "attachments"("task_comment_id", "file_version_id");

-- AddForeignKey: onDelete CASCADE — 添付先コメント削除でその添付も消える。
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_comment_id_fkey" FOREIGN KEY ("task_comment_id") REFERENCES "task_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 排他制約（XOR）を 4 分岐 → 5 分岐へ張り替え。task_id / chat_message_id / theme_id / announcement_id /
-- task_comment_id はちょうど一つが非 NULL。
-- MANUAL: この CHECK は prisma schema では表現不可（reaction_target_xor / attachment_target_xor と同じ運用）。
-- `prisma migrate reset` で DB を作り直せば本マイグレーションが再適用されるが、db push 等の自動再生成や
-- 新規 baseline 採番時は脱落し得る。その場合は本制約（5 分岐版）を手動で再適用すること。
ALTER TABLE "attachments" DROP CONSTRAINT "attachment_target_xor";
ALTER TABLE "attachments" ADD CONSTRAINT attachment_target_xor CHECK ((("task_id" IS NOT NULL)::int + ("chat_message_id" IS NOT NULL)::int + ("theme_id" IS NOT NULL)::int + ("announcement_id" IS NOT NULL)::int + ("task_comment_id" IS NOT NULL)::int) = 1);
