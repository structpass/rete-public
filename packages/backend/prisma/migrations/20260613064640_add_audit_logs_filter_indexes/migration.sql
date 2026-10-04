-- CreateIndex
CREATE INDEX "audit_logs_action_type_created_at_idx" ON "audit_logs"("action_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_system_id_created_at_idx" ON "audit_logs"("system_id", "created_at");
