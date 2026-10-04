-- v2-197 要求版2: 常に拒否する拡張子（.exe / .dll / .msi / .scr / .com）を編集可能な一覧から外す。
-- この 5 種はコード定数 FIXED_REJECTED_EXTENSIONS として常時拒否される層へ移したため、設定行に残して
-- おくと「画面から外せる」と誤解させる（実際には保存時にも除かれる）。保存値を実装の意味に合わせる。
UPDATE "file_settings"
SET "rejected_extensions" = ARRAY(
  SELECT ext FROM unnest("rejected_extensions") AS ext
  WHERE ext <> ALL (ARRAY['.exe', '.dll', '.msi', '.scr', '.com']::TEXT[])
)
WHERE "rejected_extensions" && ARRAY['.exe', '.dll', '.msi', '.scr', '.com']::TEXT[];
