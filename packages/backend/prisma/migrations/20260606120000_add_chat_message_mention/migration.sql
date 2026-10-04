-- CreateTable
CREATE TABLE "chat_message_mentions" (
    "message_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "chat_message_mentions_pkey" PRIMARY KEY ("message_id","account_id")
);

-- CreateIndex
CREATE INDEX "chat_message_mentions_account_id_idx" ON "chat_message_mentions"("account_id");

-- AddForeignKey
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
