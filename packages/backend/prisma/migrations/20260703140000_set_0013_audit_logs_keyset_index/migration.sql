-- set-0013: audit_logs の keyset ページング（ORDER BY created_at, id 複合）を支える複合 index。
-- 既存の単独 (created_at) index は左方一致で残す（他クエリの互換性維持）。
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_id_idx" ON "audit_logs" ("created_at", "id");
