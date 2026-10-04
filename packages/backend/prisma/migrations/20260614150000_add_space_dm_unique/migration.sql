-- rete-common-0011: PERSONAL_DM の無向ペア二重作成を DB 層で封じる。
-- 背景: spaces.service の findExistingDm→createPersonalDm 間に DB ロックが無く、
--       同一ペアへの並行 POST が両方 check を通過して DM が二重作成され得た（TOCTOU）。
--       app 層 cross-check のみで DB unique 制約が無かった。

-- STEP 0: cascade 安全ガード。dedupe で削除される重複 DM（最古以外）に会話履歴
-- （ChatTheme / Task）がぶら下がっていたら、サイレントな cascade 消失を避けるため
-- migration を停止する（運用者が手動で履歴を集約してから再実行する想定）。
-- spaces は本日新設のため通常は 0 件で素通りする。
DO $$
DECLARE
  victim_count INT;
BEGIN
  WITH losers AS (
    SELECT s."id"
    FROM "spaces" s
    JOIN "spaces" keep
      ON keep."kind" = 'PERSONAL_DM'
     AND s."kind" = 'PERSONAL_DM'
     AND LEAST(s."owner_id", s."peer_account_id") = LEAST(keep."owner_id", keep."peer_account_id")
     AND GREATEST(s."owner_id", s."peer_account_id") = GREATEST(keep."owner_id", keep."peer_account_id")
     AND (
       s."created_at" > keep."created_at"
       OR (s."created_at" = keep."created_at" AND s."id" > keep."id")
     )
  )
  SELECT count(*) INTO victim_count
  FROM losers l
  WHERE EXISTS (SELECT 1 FROM "chat_themes" ct WHERE ct."space_id" = l."id")
     OR EXISTS (SELECT 1 FROM "tasks" t WHERE t."space_id" = l."id");

  IF victim_count > 0 THEN
    RAISE EXCEPTION
      '重複 PERSONAL_DM の % 件に会話/タスク履歴が存在します。cascade 消失を避けるため停止。手動で履歴を集約してから再実行してください。',
      victim_count;
  END IF;
END $$;

-- STEP 1: 既存の無向重複 DM を最古 1 件へ集約（dedupe）。
-- LEAST/GREATEST で owner/peer の順序に依存せず重複ペアを同一視し、
-- 後発（created_at が新しい・同時刻なら id が大きい）行を削除する。
-- STEP 0 のガードを通過しているため、ここで消える行は履歴を持たない。
DELETE FROM "spaces" s
USING "spaces" keep
WHERE s."kind" = 'PERSONAL_DM'
  AND keep."kind" = 'PERSONAL_DM'
  AND LEAST(s."owner_id", s."peer_account_id") = LEAST(keep."owner_id", keep."peer_account_id")
  AND GREATEST(s."owner_id", s."peer_account_id") = GREATEST(keep."owner_id", keep."peer_account_id")
  AND (
    s."created_at" > keep."created_at"
    OR (s."created_at" = keep."created_at" AND s."id" > keep."id")
  );

-- STEP 2: 無向ペア重複防止の部分一意 index。
-- LEAST/GREATEST 式 index で {A,B} と {B,A} を同一視（owner/peer の方向に非依存）。
-- archived も対象に含める（アーカイブ済み DM ペアの再作成も二重作成として弾く）。
-- Prisma schema は式 / partial index を表現できないため SQL 手書き
-- （先例: invites_pending_email_unique / space_kind_shape CHECK）。
CREATE UNIQUE INDEX IF NOT EXISTS "spaces_dm_pair_unique"
  ON "spaces" (LEAST("owner_id", "peer_account_id"), GREATEST("owner_id", "peer_account_id"))
  WHERE "kind" = 'PERSONAL_DM';
