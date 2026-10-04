-- dsk-0323: reaction_target_xor (3 分岐版) に COMMENT を付与。schema.prisma の Reaction モデル
-- 冒頭コメントに書かれた「CHECK 制約追加時の NOT VALID + VALIDATE CONSTRAINT 2 段構成切替」運用
-- ルールは docs/architecture/operational-policy.md §11 を正本とする（schema 側に書き写さない＝
-- single-source-of-truth）。本 NOTE は DB 側にも参照を残して、運用調査者が schema を開く前に
-- ここで気付けるようにする。reaction_target_xor を将来 4 分岐以上に拡張する場合も §11 を参照。
COMMENT ON CONSTRAINT reaction_target_xor ON reactions IS 'dsk-0297 で設定（3 分岐版）。長期行数時の ACCESS EXCLUSIVE ロック対応は docs/architecture/operational-policy.md §11 を参照。schema.prisma の Reaction モデル冒頭コメントと同期。';