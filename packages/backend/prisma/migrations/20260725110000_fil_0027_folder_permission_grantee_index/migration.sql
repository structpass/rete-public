-- fil-0027 / FB+1 追補: grantee 側の index。
-- findFolderGrantsForUser は folder_id を絞らず「本人に関係する付与」だけを引く（ACL 解決の常時経路＝
-- ADMIN 以外の全リクエストで走る）。folder_permissions の unique index は最左列が folder_id なので
-- この形では leftmost prefix が使えず seq scan になるため、grantee 側の index を別に張る。
CREATE INDEX "folder_permissions_grantee_type_grantee_id_idx" ON "folder_permissions"("grantee_type", "grantee_id");
