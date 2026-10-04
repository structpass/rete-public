-- rete-desk-0158: 分類（Category）を Space 単位スコープへ。
-- Category に space_id(NOT NULL, FK→spaces, ON DELETE CASCADE) を追加し、name の global unique を
-- @@unique([spaceId, name]) へ置換。@@index([spaceId]) を追加。Task.category_id を nullable 化（未分類許可）。
-- 既存データは reseed 前提（data migration なし。reset 後の空テーブルへ適用）。

-- 1. Category.name の global unique を撤廃（Space 内一意へ移行するため）。
DROP INDEX "categories_name_key";

-- 2. Category に space_id を追加（NOT NULL）。reseed 前提のため既存行 0 件を前提に直接 NOT NULL で追加する。
ALTER TABLE "categories" ADD COLUMN "space_id" TEXT NOT NULL;

-- 3. Space 内一意（別 Space は同名可）＋ space_id index。
CREATE UNIQUE INDEX "categories_space_id_name_key" ON "categories"("space_id", "name");
CREATE INDEX "categories_space_id_idx" ON "categories"("space_id");

-- 4. Category → Space の FK（Space 削除でその分類も Cascade 消去）。
ALTER TABLE "categories" ADD CONSTRAINT "categories_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Task.category_id を nullable 化（未分類を許可）。FK（ON DELETE RESTRICT）は維持。
ALTER TABLE "tasks" ALTER COLUMN "category_id" DROP NOT NULL;
