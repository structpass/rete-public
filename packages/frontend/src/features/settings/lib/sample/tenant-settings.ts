/**
 * テナント設定画面のサンプルデータ（モック settings/tenant-settings/index.html の内容を踏襲）。
 * ST-1 はシェル先行のためサンプル値固定。実データ（tenant/tenant_system API）への接続は次フェーズ。
 */

/** バッジ色の選択肢。 */
export type TenantBadgeColor = 'green' | 'red' | 'blue' | 'none';

/** 契約システム 1 行の ViewModel。 */
export interface TenantSystemRow {
  /** ユニーク ID（並び替え・有効化の操作キーとして使う）。 */
  id: string;
  /** 画面表示用のシステム名。 */
  name: string;
  /** Rete 組み込みシステムかどうか（Rete バッジを表示する）。 */
  isRete?: boolean;
  /** 有効・無効状態。 */
  enabled: boolean;
}

/** テナント情報の ViewModel。 */
export interface TenantInfo {
  /** テナント名（ヘッダ左端バッジに表示）。最大 20 文字。 */
  name: string;
  /** バッジの表示色。 */
  badgeColor: TenantBadgeColor;
}

/** バッジ色のパレット定義（カラーピッカーの swatch・テナント名プレビューで使う）。 */
export const BADGE_PALETTE: Record<
  TenantBadgeColor,
  { bg: string; fg: string; border: string; label: string }
> = {
  green: { bg: '#DCFCE7', fg: '#166534', border: '#86EFAC', label: '緑' },
  red: { bg: '#FEE2E2', fg: '#991B1B', border: '#FCA5A5', label: '赤' },
  blue: { bg: '#DBEAFE', fg: '#1E40AF', border: '#93C5FD', label: '青' },
  none: { bg: 'transparent', fg: 'var(--sp-text-warm)', border: 'transparent', label: 'なし' },
};

// SAMPLE_TENANT_SYSTEMS / SAMPLE_TENANT_INFO（tenant-settings-screen 移行前のサンプル値）は
// 未参照のため knip 検出（set-0049）で削除済み。
