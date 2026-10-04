-- dsk-0297: Reaction の対象に taskComment を追加（message/theme の2択XOR → message/theme/taskComment の3択XOR）。
-- 20260630120000_add_attachment_task_comment_target（Attachment の対象拡張）と同型のDROP→ADD CHECK手順。
ALTER TABLE "reactions" ADD COLUMN "task_comment_id" TEXT;
CREATE INDEX "reactions_task_comment_id_idx" ON "reactions"("task_comment_id");
CREATE UNIQUE INDEX "reactions_task_comment_id_author_id_emoji_key" ON "reactions"("task_comment_id", "author_id", "emoji");
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_task_comment_id_fkey" FOREIGN KEY ("task_comment_id") REFERENCES "task_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reactions" DROP CONSTRAINT "reaction_target_xor";
ALTER TABLE "reactions" ADD CONSTRAINT reaction_target_xor CHECK ((("message_id" IS NOT NULL)::int + ("theme_id" IS NOT NULL)::int + ("task_comment_id" IS NOT NULL)::int) = 1);
