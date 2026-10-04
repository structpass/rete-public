-- DropIndex
DROP INDEX "chat_messages_theme_id_idx";

-- CreateIndex
CREATE INDEX "chat_messages_theme_id_author_id_created_at_idx" ON "chat_messages"("theme_id", "author_id", "created_at");
