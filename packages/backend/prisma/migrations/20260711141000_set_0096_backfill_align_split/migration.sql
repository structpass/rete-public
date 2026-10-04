-- set-0096 follow-up: backfill を splitDisplayName（display-name.ts）と同型へ揃える。
-- btrim 後、先頭 \S+ の直後の半角/全角空白で1回分割。区切り無しは全体を family_name。

UPDATE "accounts"
SET
  "family_name" = COALESCE(
    (regexp_match(btrim("name"), E'^(\\S+)[\\u0020\\u3000]+(.*)$'))[1],
    btrim("name")
  ),
  "given_name" = COALESCE(
    btrim((regexp_match(btrim("name"), E'^(\\S+)[\\u0020\\u3000]+(.*)$'))[2]),
    ''
  );
