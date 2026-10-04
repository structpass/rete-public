-- FL-3b: 添付先にチャットテーマ（ChatTheme）を追加。XOR を task/chat_message の 2 分岐から
-- task/chat_message/theme の 3 分岐へ拡張する（reaction_target_xor と同方針）。

-- AlterTable: 添付先テーマ列を追加（NULL 許容・ポリモーフィック XOR の一肢）。
ALTER TABLE "attachments" ADD COLUMN "theme_id" TEXT;

-- CreateIndex
CREATE INDEX "attachments_theme_id_idx" ON "attachments"("theme_id");

-- CreateIndex: 同一テーマへの同一版の二重添付防止（NULL 列は別 unique に分割）。
CREATE UNIQUE INDEX "attachments_theme_id_file_version_id_key" ON "attachments"("theme_id", "file_version_id");

-- AddForeignKey: onDelete CASCADE — 添付先テーマ削除でその添付も消える。
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "chat_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 排他制約（XOR）を 2 分岐 → 3 分岐へ張り替え。task_id / chat_message_id / theme_id はちょうど一つが非 NULL。
-- MANUAL: この CHECK は prisma schema では表現不可（reaction_target_xor / 旧 attachment_target_xor と同じ運用）。
-- `prisma migrate reset` で DB を作り直せば本マイグレーションが再適用されるが、db push 等の自動再生成や
-- 新規 baseline 採番時は脱落し得る。その場合は本制約（3 分岐版）を手動で再適用すること。
ALTER TABLE "attachments" DROP CONSTRAINT "attachment_target_xor";
ALTER TABLE "attachments" ADD CONSTRAINT attachment_target_xor CHECK ((("task_id" IS NOT NULL)::int + ("chat_message_id" IS NOT NULL)::int + ("theme_id" IS NOT NULL)::int) = 1);
