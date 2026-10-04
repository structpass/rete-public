-- CreateIndex: dsk-0330 MEDIUM3
-- DeskGroupMember の findMembers(accountId) ホットパス（accountId で絞って sortOrder 順ソート）を
-- index-only にする。DeskGroup / DeskGroupClassification と非対称だった (accountId, sortOrder) を揃え、
-- 複合 index の非対称を解消する。accountId 上位 → sortOrder 昇順の B-Tree を 1 つ追加。
CREATE INDEX "desk_group_members_account_id_sort_order_idx" ON "desk_group_members"("account_id", "sort_order");
