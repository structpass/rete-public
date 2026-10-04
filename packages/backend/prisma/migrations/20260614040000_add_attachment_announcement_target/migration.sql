-- H0022: 添付先に掲示板通知（Announcement）を追加。XOR を task/chat_message/theme の 3 分岐から
-- task/chat_message/theme/announcement の 4 分岐へ拡張する（attachment_theme_target と同方針）。

-- AlterTable: 添付先通知列を追加（NULL 許容・ポリモーフィック XOR の一肢）。
ALTER TABLE "attachments" ADD COLUMN "announcement_id" TEXT;

-- CreateIndex
CREATE INDEX "attachments_announcement_id_idx" ON "attachments"("announcement_id");

-- CreateIndex: 同一通知への同一版の二重添付防止（NULL 列は別 unique に分割）。
CREATE UNIQUE INDEX "attachments_announcement_id_file_version_id_key" ON "attachments"("announcement_id", "file_version_id");

-- AddForeignKey: onDelete CASCADE — 添付先通知削除でその添付も消える。
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 排他制約（XOR）を 3 分岐 → 4 分岐へ張り替え。task_id / chat_message_id / theme_id / announcement_id は
-- ちょうど一つが非 NULL。
-- MANUAL: この CHECK は prisma schema では表現不可（reaction_target_xor / attachment_target_xor と同じ運用）。
-- `prisma migrate reset` で DB を作り直せば本マイグレーションが再適用されるが、db push 等の自動再生成や
-- 新規 baseline 採番時は脱落し得る。その場合は本制約（4 分岐版）を手動で再適用すること。
ALTER TABLE "attachments" DROP CONSTRAINT "attachment_target_xor";
ALTER TABLE "attachments" ADD CONSTRAINT attachment_target_xor CHECK ((("task_id" IS NOT NULL)::int + ("chat_message_id" IS NOT NULL)::int + ("theme_id" IS NOT NULL)::int + ("announcement_id" IS NOT NULL)::int) = 1);
