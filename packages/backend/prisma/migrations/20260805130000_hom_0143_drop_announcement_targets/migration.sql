-- hom-0143: Home 掲示板 / FAQ の「通知先」を機能ごと撤去（開発統括指示・ADR 0036 superseded）。
-- 削除後の通知は全認証ユーザーが全件閲覧（絞り込みなし）。既存通知の本文・タグ・添付・並び順は無変換で維持。
-- 通知先設定値は失われるが、フィルタを消すため可視性には影響しない（全員可視へ戻るだけ・可逆=UI 復活+フィルタ復活は後から可能）。

-- DropIndex（targetRoles 用 GIN・20260615090000 追加）
DROP INDEX "announcements_target_roles_idx";

-- DropIndex（targetBusinessRoleIds 用 GIN・20260724180000 追加）
DROP INDEX "announcements_target_business_role_ids_idx";

-- AlterTable
ALTER TABLE "announcements" DROP COLUMN "target_roles";
ALTER TABLE "announcements" DROP COLUMN "target_business_role_ids";
