-- cmn-0037(開発エージェント): pg_trgm 拡張（trgm 演算子クラス gin_trgm_ops の前提）。postgresqlExtensions preview を
-- 使わず手書きで管理する（既存の raw SQL migration 流儀に合わせる）。IF NOT EXISTS で再適用安全。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "audit_logs_actor_name_idx" ON "audit_logs" USING GIN ("actor_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "audit_logs_actor_email_idx" ON "audit_logs" USING GIN ("actor_email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "files_name_idx" ON "files" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "folders_name_idx" ON "folders" USING GIN ("name" gin_trgm_ops);
