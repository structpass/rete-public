-- hom-0054: important/isNew 列を廃止（タグで代替済み）
ALTER TABLE "announcements" DROP COLUMN IF EXISTS "important";
ALTER TABLE "announcements" DROP COLUMN IF EXISTS "is_new";
