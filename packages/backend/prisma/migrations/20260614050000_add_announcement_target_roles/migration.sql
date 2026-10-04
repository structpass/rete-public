-- H0023 通知先ロール（rete-home-0024 Phase 3）
-- Announcement に受信対象のシステム Role 配列を追加する。空配列 = 全員配信（絞り込みなし）。
-- 可視性 enforce（read-filter）は本フェーズでは実装しない＝定義+格納+フォーム+表示まで（ADR 0036）。
-- 既存行は全員配信（空配列）として後方互換: DEFAULT ARRAY[]::"Role"[] で埋める。
ALTER TABLE "announcements" ADD COLUMN "target_roles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];
