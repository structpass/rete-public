-- AlterTable: cmn-0094 (H10a: TOTP replay 対策)
-- MfaSetting に last_used_counter 列（Int nullable）を追加する。TOTP 検証成功時に otplib の delta から算出した
-- time-step counter を条件付き更新で記録し、次回以降それ以下の counter を持つコードは「既使用済」として拒否する。
-- replay window を otplib の ±30 秒（実効約90 秒）から「once」相当へ狭める。null のままの既存行は replay 防御
-- 未適用（後方互換・既存のセットアップ済みアカウントは次回 confirm 通過後に最初の記録が入る）。
ALTER TABLE "mfa_settings" ADD COLUMN "last_used_counter" INTEGER;
