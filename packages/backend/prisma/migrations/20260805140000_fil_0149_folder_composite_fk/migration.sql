-- fil-0149（fil-0143 子2・M4・M7）: Folder に @@unique([id, spaceId]) を追加し、parentFolder を
-- 複合 FK（fields: [parentFolderId, spaceId], references: [id, spaceId]）へ変更する。
-- 「子の space_id＝親の space_id」不変条件を app 層規約から DB 不変条件へ格上げし、崩れても
-- FK violation で fail-closed させる（LOW8「moveFolderAtomic の tx 内 spaceId 再検証」を包含）。
-- 同時に M7: fil_0135 migration の index コメントを実態へ是正するコメントはこの migration に集約。
--
-- 順序の根拠（Postgres は FK 追加時に参照側 unique を要求する）:
--   1) 参照側 unique index（folders_id_space_id_key）を先に作る
--   2) 旧 FK（folders_parent_folder_id_fkey）を drop
--   3) 複合 FK（folders_parent_folder_id_space_id_fkey）を add
-- ※ 2 と 3 の間に 1 を置くと FK 追加が「参照側 unique 無し」で失敗するためこの順が必須。
-- ルート直下（parent_folder_id IS NULL）は MATCH SIMPLE の FK で NULL はスキップされる（fil-0149 criteria 4）。

-- 1) 参照側 unique（複合 FK が「(id, space_id)」を参照するため必要・id 単独の @id と共存）
CREATE UNIQUE INDEX "folders_id_space_id_key" ON "folders"("id", "space_id");

-- 2) 旧 FK（単一 parent_folder_id）を drop
ALTER TABLE "folders" DROP CONSTRAINT "folders_parent_folder_id_fkey";

-- 3) 複合 FK（(parent_folder_id, space_id) → (id, space_id)）を add
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_folder_id_space_id_fkey"
  FOREIGN KEY ("parent_folder_id", "space_id") REFERENCES "folders"("id", "space_id")
  ON DELETE CASCADE ON UPDATE CASCADE;