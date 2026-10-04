-- CreateIndex
CREATE INDEX "invites_email_status_idx" ON "invites"("email", "status");

-- Partial unique index: PENDING 状態の email は重複禁止（DB 側での PENDING 重複保証）。
-- Prisma schema は partial index を表現できないため SQL 手書き（@@index は複合のみ schema 生成）。
-- 期限切れ / ACCEPTED / EXPIRED の同 email は複数レコード可（正常な再招待シナリオを許容）。
CREATE UNIQUE INDEX "invites_pending_email_unique" ON "invites"("email") WHERE "status" = 'PENDING';
