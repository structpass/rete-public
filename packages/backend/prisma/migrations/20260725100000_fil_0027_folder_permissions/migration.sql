-- fil-0027 (FB+1): ディレクトリ単位 ACL の基盤を追加する。
-- 権限モデルは純 per-folder ACL（開発統括確認 2026-07-23 案A）＝ Folder に space_id は足さず、
-- folder_permissions へユーザー / 業務ロール / 全員へ直接付与し、祖先チェーン走査で有効レベルを解決する。
-- 解決ロジックは app 層（FolderAclService）。本 migration はテーブル・列・既存挙動の非退行 seed のみ。

-- 1. 付与先種別 / 権限レベルの enum。
CREATE TYPE "FolderGranteeType" AS ENUM ('ROLE', 'USER', 'ALL');
CREATE TYPE "FolderPermissionLevel" AS ENUM ('VIEW', 'EDIT', 'MANAGE');

-- 2. Folder への 2 列追加。
--    inherit_parent_perms: 既存フォルダは継承あり（true）＝現行の階層挙動を保つ。
--    created_by_id: 既存フォルダは作成者不明（NULL）＝暗黙 MANAGE なし。
ALTER TABLE "folders" ADD COLUMN "inherit_parent_perms" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "folders" ADD COLUMN "created_by_id" TEXT;

ALTER TABLE "folders"
  ADD CONSTRAINT "folders_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 作成者アカウント削除（SET NULL）時の逆引きを seq scan にしない。
CREATE INDEX "folders_created_by_id_idx" ON "folders"("created_by_id");

-- 3. ACL テーブル。grantee_id は ALL のとき空文字（NULL は Postgres の等値比較で UNIQUE が効かないため）。
CREATE TABLE "folder_permissions" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "grantee_type" "FolderGranteeType" NOT NULL,
    "grantee_id" TEXT NOT NULL DEFAULT '',
    "level" "FolderPermissionLevel" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "folder_permissions_pkey" PRIMARY KEY ("id")
);

-- 同一フォルダ × 同一付与先は 1 行（レベル変更は update）。最左列が folder_id なので
-- 祖先チェーン走査（WHERE folder_id IN (...)）にも流用でき、別 index は張らない。
CREATE UNIQUE INDEX "folder_permissions_folder_id_grantee_type_grantee_id_key"
  ON "folder_permissions"("folder_id", "grantee_type", "grantee_id");

ALTER TABLE "folder_permissions"
  ADD CONSTRAINT "folder_permissions_folder_id_fkey"
  FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. 非退行 seed: MVP は全認証ユーザーがフラットに読み書きできていた。ルート直下フォルダへ
--    {全員: EDIT} を付与し、継承（inherit_parent_perms=true）で配下も従来どおり編集可能にする。
--    ADMIN は解決時に常に MANAGE のため seed 不要。既存 seed 済み環境の再適用でも
--    ON CONFLICT DO NOTHING で冪等（unique index に載る）。
INSERT INTO "folder_permissions" ("id", "folder_id", "grantee_type", "grantee_id", "level", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 'ALL', '', 'EDIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "folders"
WHERE "parent_folder_id" IS NULL
ON CONFLICT ("folder_id", "grantee_type", "grantee_id") DO NOTHING;
