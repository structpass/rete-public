-- cmn-0038(C3): citext 拡張（大小無視テキスト型の前提）。IF NOT EXISTS で再適用安全。
CREATE EXTENSION IF NOT EXISTS citext;

-- AlterTable
ALTER TABLE "announcement_tags" ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "tags" ALTER COLUMN "name" SET DATA TYPE CITEXT;
