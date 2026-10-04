-- dsk-0297（起点カード対応）: Reaction の対象に taskId を追加（message/theme/taskComment の3択XOR →
-- message/theme/taskComment/task の4択XOR）。20260708120000（taskComment 追加）と同型のDROP→ADD CHECK手順。
-- dsk-0323 の知見（@@unique([X, authorId, emoji]) の左端 prefix が単独 index を兼ねる）に倣い、
-- 冗長な単独 index は張らず unique index のみを追加する（§13.4 の FK index 併設要件は unique index で充足）。
ALTER TABLE "reactions" ADD COLUMN "task_id" INTEGER;
CREATE UNIQUE INDEX "reactions_task_id_author_id_emoji_key" ON "reactions"("task_id", "author_id", "emoji");
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reactions" DROP CONSTRAINT "reaction_target_xor";
ALTER TABLE "reactions" ADD CONSTRAINT reaction_target_xor CHECK ((("message_id" IS NOT NULL)::int + ("theme_id" IS NOT NULL)::int + ("task_comment_id" IS NOT NULL)::int + ("task_id" IS NOT NULL)::int) = 1);
COMMENT ON CONSTRAINT reaction_target_xor ON reactions IS 'dsk-0297（起点カード対応）で4分岐版へ更新。長期行数時の ACCESS EXCLUSIVE ロック対応は docs/architecture/operational-policy.md §11 を参照。schema.prisma の Reaction モデル冒頭コメントと同期。';
