-- hom-0141: targetBusinessRoleIds 配列照合（hasSome）のシーケンシャルスキャン回避。
-- 既存 targetRoles の GIN index（20260313 系）と対称に追加する設計判断は
-- schema.prisma の @@index([targetBusinessRoleIds], type: Gin) コメント参照。
-- visibilityWhere の AND 結合で role軸・businessRoleId軸が独立に評価されるため、
-- 両軸のインデックス整備は同等の必要度。
CREATE INDEX "announcements_target_business_role_ids_idx" ON "announcements" USING GIN ("target_business_role_ids");
