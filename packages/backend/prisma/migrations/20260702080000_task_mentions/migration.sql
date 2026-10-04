-- CreateEnum
CREATE TYPE "TaskMentionField" AS ENUM ('DESCRIPTION', 'TENMATSU');

-- CreateTable
CREATE TABLE "task_mentions" (
    "task_id" INTEGER NOT NULL,
    "account_id" TEXT NOT NULL,
    "field" "TaskMentionField" NOT NULL,

    CONSTRAINT "task_mentions_pkey" PRIMARY KEY ("task_id","account_id","field")
);

-- CreateIndex
CREATE INDEX "task_mentions_account_id_idx" ON "task_mentions"("account_id");

-- AddForeignKey
ALTER TABLE "task_mentions" ADD CONSTRAINT "task_mentions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_mentions" ADD CONSTRAINT "task_mentions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "task_comment_mentions" (
    "comment_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "task_comment_mentions_pkey" PRIMARY KEY ("comment_id","account_id")
);

-- CreateIndex
CREATE INDEX "task_comment_mentions_account_id_idx" ON "task_comment_mentions"("account_id");

-- AddForeignKey
ALTER TABLE "task_comment_mentions" ADD CONSTRAINT "task_comment_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "task_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comment_mentions" ADD CONSTRAINT "task_comment_mentions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
