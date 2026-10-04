-- dsk-0323: Reaction モデルの冗長 index を削除。schema.prisma の @@unique([X, authorId, emoji])
-- の左端 prefix により X 単独検索は unique index で賄えるため、@@index([X]) は write overhead のみ
-- 増やしていた。3 列（message_id / theme_id / task_comment_id）すべて削除する。
-- 適用後の検索性能は unique index の左端 prefix で従来どおり維持される。
DROP INDEX IF EXISTS "reactions_message_id_idx";
DROP INDEX IF EXISTS "reactions_theme_id_idx";
DROP INDEX IF EXISTS "reactions_task_comment_id_idx";