-- CreateEnum
CREATE TYPE "ChatThemeMentionField" AS ENUM ('DESCRIPTION', 'TENMATSU');

-- CreateTable
CREATE TABLE "chat_theme_mentions" (
    "theme_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "field" "ChatThemeMentionField" NOT NULL,

    CONSTRAINT "chat_theme_mentions_pkey" PRIMARY KEY ("theme_id","account_id","field")
);

-- CreateIndex
CREATE INDEX "chat_theme_mentions_account_id_idx" ON "chat_theme_mentions"("account_id");

-- AddForeignKey
ALTER TABLE "chat_theme_mentions" ADD CONSTRAINT "chat_theme_mentions_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "chat_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_theme_mentions" ADD CONSTRAINT "chat_theme_mentions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
