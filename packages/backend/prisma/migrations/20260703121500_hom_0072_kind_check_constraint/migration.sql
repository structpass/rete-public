-- hom-0072: announcements.kind / announcement_tags.kind の許容値を DB CHECK 制約で強制する。
-- kind は Prisma enum でなく String 運用（今後の kind 追加が軽い）のため、enum 型化せず CHECK で値集合を明示する。
-- 許容値: 'board' / 'faq'。既存データは全件 kind='board'（本チケットの直前マイグレーションで既定投入）のため
-- 即時検証で付与できる（NOT VALID は不要）。
-- MANUAL: この CHECK は prisma schema では表現不可（task_activities_field_check と同じ運用）。
ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_kind_check"
  CHECK ("kind" IN ('board', 'faq'));

ALTER TABLE "announcement_tags"
  ADD CONSTRAINT "announcement_tags_kind_check"
  CHECK ("kind" IN ('board', 'faq'));
