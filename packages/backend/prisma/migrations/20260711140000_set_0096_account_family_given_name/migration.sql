-- set-0096: Account に姓・名列を追加し、既存 name を先頭空白で分割して backfill する。
-- 初回 backfill は簡易 SQL。厳密同型（splitDisplayName）への揃えは
-- 20260711141000_set_0096_backfill_align_split を参照。

ALTER TABLE "accounts" ADD COLUMN "family_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "accounts" ADD COLUMN "given_name" TEXT NOT NULL DEFAULT '';

UPDATE "accounts"
SET
  "family_name" = CASE
    WHEN position(' ' in "name") > 0 THEN left("name", position(' ' in "name") - 1)
    WHEN position(E'\u3000' in "name") > 0 THEN left("name", position(E'\u3000' in "name") - 1)
    ELSE "name"
  END,
  "given_name" = CASE
    WHEN position(' ' in "name") > 0 THEN btrim(substring("name" from position(' ' in "name") + 1))
    WHEN position(E'\u3000' in "name") > 0 THEN btrim(substring("name" from position(E'\u3000' in "name") + 1))
    ELSE ''
  END;
