-- AlterTable
ALTER TABLE "file_settings" ADD COLUMN     "rejected_extensions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- v2-197: 既存行（すでに設定済みの環境）にも app 既定（DEFAULT_REJECTED_EXTENSIONS）と同じ初期値を入れる。
-- 空のままだと「初期状態で何を拒否しているか」が画面に出ず、管理者が明示的に空にした状態とも区別できない。
UPDATE "file_settings"
SET "rejected_extensions" = ARRAY['.exe', '.dll', '.msi', '.scr', '.com', '.bat', '.cmd', '.ps1', '.sh']::TEXT[]
WHERE "rejected_extensions" IS NULL OR "rejected_extensions" = ARRAY[]::TEXT[];
