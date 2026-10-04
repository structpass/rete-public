-- hom-0072: announcements / announcement_tags へ kind 列を追加（'board'|'faq'）。
-- 既存データは全件 kind='board' として後方互換。

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'board';

-- AlterTable
ALTER TABLE "announcement_tags" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'board';

-- DropIndex（position, published_at の複合を kind スコープへ差し替え）
DROP INDEX "announcements_position_published_at_idx";

-- CreateIndex
CREATE INDEX "announcements_kind_position_published_at_idx" ON "announcements"("kind", "position", "published_at" DESC);

-- DropIndex（name 単体 unique を撤去。kind+name の複合 unique へ移行）
DROP INDEX "announcement_tags_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "announcement_tags_kind_name_key" ON "announcement_tags"("kind", "name");
