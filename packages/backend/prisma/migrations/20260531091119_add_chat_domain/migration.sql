-- CreateEnum
CREATE TYPE "ChatThemeStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "chat_themes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ChatThemeStatus" NOT NULL DEFAULT 'OPEN',
    "author_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_themes_status_idx" ON "chat_themes"("status");

-- CreateIndex
CREATE INDEX "chat_themes_last_message_at_idx" ON "chat_themes"("last_message_at");

-- CreateIndex
CREATE INDEX "chat_themes_author_id_idx" ON "chat_themes"("author_id");

-- CreateIndex
CREATE INDEX "chat_messages_theme_id_idx" ON "chat_messages"("theme_id");

-- CreateIndex
CREATE INDEX "chat_messages_author_id_idx" ON "chat_messages"("author_id");

-- AddForeignKey
ALTER TABLE "chat_themes" ADD CONSTRAINT "chat_themes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "chat_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
