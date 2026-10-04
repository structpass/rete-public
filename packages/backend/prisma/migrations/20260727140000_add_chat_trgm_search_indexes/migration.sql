-- cmn-0186(開発エージェント): チャット検索（title / description / messages.body の 3 条件 OR・ILIKE）の seq scan を解消する
-- trgm GIN。body 単独では themes 側の 2 条件が seq scan のまま残るので 3 列まとめて張る。
-- 対応する宣言は schema.prisma 側（ChatTheme / ChatMessage の @@index(... ops: raw("gin_trgm_ops"), type: Gin)）
-- にあり、本ファイルはその生成物にあたる（既存 20260619054617 と同じ管理形態。CREATE EXTENSION だけが手書き）。
-- CREATE EXTENSION / CREATE INDEX とも IF NOT EXISTS 付きで再適用安全。
-- CONCURRENTLY は使えない（Prisma が migration を単一トランザクションで実行するため 25001）。通常の
-- CREATE INDEX は対象表に SHARE ロックを取り構築中の書き込みをブロックする＝現行規模では秒未満で許容する。
-- 大規模化したら operational-policy.md §13.1 の手順に切り替える: migration ファイルへは書かず SQL を
-- 手動生成し、CREATE INDEX CONCURRENTLY を out-of-band（psql 等で直接）適用した後、
-- prisma migrate resolve --applied で _prisma_migrations 台帳を整合させる。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_body_idx" ON "chat_messages" USING GIN ("body" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_themes_title_idx" ON "chat_themes" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_themes_description_idx" ON "chat_themes" USING GIN ("description" gin_trgm_ops);
