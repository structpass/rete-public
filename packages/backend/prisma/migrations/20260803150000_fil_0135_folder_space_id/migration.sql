-- fil-0135（親 fil-0124 / ADR 0063）: Folder を Desk 統一 Space へ帰属させる。
-- 詳細設計 = docs/files/space-integration-schema-design.md（fil-0134）。
--
-- 追加系のみ（folder_permissions / inherit_parent_perms の drop は fil-0136 と同一コミット）。
-- NOT NULL 化は「nullable 追加 → backfill → 制約付与」の3段を本ファイル内で順に発行する
-- （別ファイルへ割ると中間状態のまま止まった DB が生まれるため）。
--
-- 固定 ID '00000000-0000-4000-b000-000000000003' は @rete/shared の DEFAULT_CHANNEL_ID と
-- 完全一致させること（migration SQL は TS を import できないためリテラル直書き・org.ts:38-45 の規約）。
-- default 器そのものは 20260614044757_add_cm2_org_model が ON CONFLICT DO NOTHING で作成済みで、
-- seed 実行の有無に依存しない。

-- ============================================================
-- 手順1: nullable で列を追加（既存行があってもエラーにならない）
-- ============================================================
-- 型は TEXT（spaces.id は Prisma の String @id で TEXT 列。UUID 型にすると FK が
-- "incompatible types: uuid and text" で張れない）。
ALTER TABLE "folders" ADD COLUMN "space_id" TEXT;

-- ============================================================
-- 手順2: 既存 folder を default channel へ backfill（深さを問わず全件・例外なし）
--   先例 = 20260614044757_add_cm2_org_model/migration.sql:148-149（chat_themes / tasks の同型 UPDATE）
--   ツリー全体がまるごと同一 Space へ移るため、親子の space_id 整合も自動的に満たされる。
-- ============================================================
UPDATE "folders" SET "space_id" = '00000000-0000-4000-b000-000000000003' WHERE "space_id" IS NULL;

-- ============================================================
-- 手順3: NOT NULL 制約 + FK + index を付与
--   onDelete: RESTRICT — File の実体 bytes は FS 上にあり、DB Cascade では storage.delete が
--   走らず孤児 blob が残るため（ADR 0063 / 設計書 §1.2）。Category/Task/ChatTheme の Cascade とは
--   意図的に非対称。
-- ============================================================
ALTER TABLE "folders" ALTER COLUMN "space_id" SET NOT NULL;

ALTER TABLE "folders"
  ADD CONSTRAINT "folders_space_id_fkey"
  FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 器スコープのツリー取得（findAllFolders の space_id 絞り）専用。**第2列 sort_order は findAllFolders の
-- ORDER BY（parent_folder_id, sort_order, name）と一致せず、並べ替えには寄与しない**（fil-0149・M7）。
-- index 自体は space_id 絞り専用として有効で張り替え不要。Space.@@index([project_id, sort_order]) とは
-- 別物（fil-0149 で同名コメントの誤導を是正）。
CREATE INDEX "folders_space_id_sort_order_idx" ON "folders"("space_id", "sort_order");
