-- DropIndex
DROP INDEX "chat_themes_status_idx";

-- CreateIndex
CREATE INDEX "chat_themes_status_last_message_at_idx" ON "chat_themes"("status", "last_message_at");
