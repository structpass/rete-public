-- fil-0136 / ADR 0063: per-folder ACL（FB+）の撤去。
-- 可視性は Folder.space_id（fil-0135 で追加・NOT NULL）と ScopeVisibilityService の一本になり、
-- 「チャネル可視＝配下ファイル可視」で解決する。段階権限（VIEW/EDIT/MANAGE）・付与先種別・継承フラグは
-- 参照する実装が同一コミットで消えるため、ここでまとめて drop する。
--
-- 順序: 依存する側（テーブル）→ enum。テーブルが残ったまま型を落とすことはできない。
-- folders.created_by_id は残す（監査記録＝誰が作ったか。設計書 §3）。

-- 1) ACL 本体。index / unique / FK はテーブルごと落ちる。
DROP TABLE "folder_permissions";

-- 2) ACL 専用 enum（参照元は上のテーブルのみ）。
DROP TYPE "FolderPermissionLevel";
DROP TYPE "FolderGranteeType";

-- 3) 継承スイッチ（ACL の祖先チェーン走査を遮断するフラグ）。判定自体が無くなり意味を失う。
ALTER TABLE "folders" DROP COLUMN "inherit_parent_perms";
