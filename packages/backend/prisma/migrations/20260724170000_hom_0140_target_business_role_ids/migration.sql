-- hom-0140: Announcement へ targetBusinessRoleIds String[] を追加（既定値 [] で既存挙動を変えない）。
-- 業務ロール（RoleDefinition.id = 動的UUID）での可視性絞り込み用フィールド。
-- hom-0141 でクエリ形確定後に GIN index 要否を再判定するため、本 migration では index は追加しない。
-- 既存 targetRoles フィールド・可視性ロジック（rete-home-0027）は無変更（併存前提を壊さない）。

ALTER TABLE "announcements" ADD COLUMN "target_business_role_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
