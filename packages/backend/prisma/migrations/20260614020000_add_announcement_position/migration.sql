-- AlterTable: 手動並び順列を追加（H0021 D&D）。既定 0 はフォールバックで、既存行は下で publishedAt 降順に振り直す。
ALTER TABLE "announcements" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: 既存行を publishedAt 降順（新着が上）に 0..N-1 で採番し、現状の表示順を手動順の初期値として保存する。
WITH ranked AS (
  SELECT "id", (ROW_NUMBER() OVER (ORDER BY "published_at" DESC) - 1) AS rn
  FROM "announcements"
)
UPDATE "announcements" a
SET "position" = ranked.rn
FROM ranked
WHERE a."id" = ranked."id";

-- CreateIndex: 一覧の主クエリ（position 昇順 + publishedAt 降順 tiebreak）に効く複合インデックス。
-- sort 方向を query（position ASC, published_at DESC）と一致させ、B-tree の混在方向フォールバックを避ける。
CREATE INDEX "announcements_position_published_at_idx" ON "announcements"("position" ASC, "published_at" DESC);
