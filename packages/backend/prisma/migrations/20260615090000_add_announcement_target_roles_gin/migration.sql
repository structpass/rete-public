-- rete-home-0027 可視性フィルタの配列照合（hasSome）を加速する GIN index。
-- MEMBER の一覧（findManyAndCount）/ 未読集計（countUnread）の where（OR: target_roles 空 / target_roles && ARRAY[role]）が
-- シーケンシャルスキャンに落ちないようにする。target_roles は enum 配列のため GIN が適合。
CREATE INDEX "announcements_target_roles_idx" ON "announcements" USING GIN ("target_roles");
