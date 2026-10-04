-- DropIndex
DROP INDEX "file_versions_file_id_version_no_idx";

-- AlterTable
ALTER TABLE "file_versions" ALTER COLUMN "byte_size" SET DATA TYPE BIGINT;
