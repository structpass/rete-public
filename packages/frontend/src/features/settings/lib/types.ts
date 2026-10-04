/**
 * 設定タブ（シェル先行）の型定義。ST-1 は frontend 限定のサンプル値シェルのため、
 * backend DTO とは独立した画面 ViewModel として定義する（tenant/tenant_system の実モデル・API は次フェーズ）。
 */

/** バッジ/アバターの配色トーン。モック settings/ の accent 系を rete 既定トークンへ対応づけたもの。 */
export type SettingTone = 'ink' | 'teal' | 'blue' | 'orange' | 'muted';

/** 契約 system の識別子（メンバー画面の system タブ / 権限画面で共有）。 */
export type SystemKey = 'a' | 'b' | 'c';

// MemberRow（メンバー画面 1 行の旧 ViewModel）は未参照のため knip 検出（set-0049）で削除済み。
