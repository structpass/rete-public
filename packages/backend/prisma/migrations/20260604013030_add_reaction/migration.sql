-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "theme_id" TEXT,
    "author_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reactions_message_id_idx" ON "reactions"("message_id");

-- CreateIndex
CREATE INDEX "reactions_theme_id_idx" ON "reactions"("theme_id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_message_id_author_id_emoji_key" ON "reactions"("message_id", "author_id", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_theme_id_author_id_emoji_key" ON "reactions"("theme_id", "author_id", "emoji");

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "chat_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 排他制約（XOR）: message_id / theme_id はちょうど一方が非 NULL。Prisma schema では表現できないため手書き。
-- MANUAL: この CHECK は prisma schema では表現不可。`prisma migrate reset` で DB を作り直すと
-- 本マイグレーションが再適用されるため通常は問題ないが、schema からの自動再生成（db push 等）や
-- 新規 baseline 採番時はこの CHECK が脱落し得る。その場合は本制約を手動で再適用すること。
ALTER TABLE "reactions" ADD CONSTRAINT reaction_target_xor CHECK ((("message_id" IS NOT NULL)::int + ("theme_id" IS NOT NULL)::int) = 1);
