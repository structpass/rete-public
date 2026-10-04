-- CreateIndex
CREATE INDEX "accounts_name_idx" ON "accounts"("name");

-- 部分 index: 有効ユーザー（is_active=true）だけを対象にした name 順の選択的 index。
-- 担当者候補クエリ findActive（SELECT id,name WHERE is_active=true ORDER BY name）を、active 絞り込みと
-- ORDER BY name を index scan 一本で消化する（sort ステップ不要）。列を id でなく name にするのが要点
-- （id 部分 index は同クエリで選ばれず死に index になる・rete-backend-0002 database-reviewer MEDIUM）。
-- 全件対象の accounts_name_idx は active 限定でない name 検索（admin 系）用に併存させる。
-- Prisma schema は partial index を表現できないため SQL 手書き（invites_pending_email_unique と同方針）。
CREATE INDEX "accounts_active_idx" ON "accounts"("name") WHERE "is_active" = true;
