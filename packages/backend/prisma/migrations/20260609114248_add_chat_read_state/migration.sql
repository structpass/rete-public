-- CreateTable
CREATE TABLE "chat_read_states" (
    "account_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_read_states_pkey" PRIMARY KEY ("account_id","theme_id")
);

-- CreateIndex
CREATE INDEX "chat_read_states_theme_id_idx" ON "chat_read_states"("theme_id");

-- AddForeignKey
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "chat_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
