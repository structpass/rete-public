import apiClient from '@/lib/api-client';
import { ApiResponse, DisplayPreferenceDto, STRIPE_COLOR_DEFAULT } from '@rete/shared';

/**
 * 表示個人設定（明細の縞模様 / mdl-0022）の API と、:root への反映ヘルパ。
 * 反映タイミングは「ログイン（セッション初期化）時のみ」＝設定保存後は再ログインで反映する仕様。
 */

/** 表示個人設定の取得（GET /accounts/me/display-preference）。未保存なら null。 */
export async function fetchDisplayPreference(): Promise<DisplayPreferenceDto | null> {
  const res = await apiClient.get<ApiResponse<DisplayPreferenceDto | null>>(
    '/accounts/me/display-preference',
  );
  return res.data.data;
}

/** 表示個人設定の保存（PUT /accounts/me/display-preference / upsert）。 */
export async function saveDisplayPreference(
  pref: DisplayPreferenceDto,
): Promise<DisplayPreferenceDto> {
  const res = await apiClient.put<ApiResponse<DisplayPreferenceDto>>(
    '/accounts/me/display-preference',
    pref,
  );
  return res.data.data;
}

/**
 * 表示個人設定を :root の CSS 変数へ反映する（純粋な DOM 操作・SessionProvider から呼ぶ）。
 * - 未保存（null）: 何も上書きしない＝CSS 既定（縞 ON・#FAFCFF）のまま
 * - OFF: --sp-row-stripe を transparent 化（縞を使う全明細が一括で無地になる）
 * - ON + カスタム色: --sp-row-stripe をユーザー色へ上書き
 * 縞の実装は全て var(--sp-row-stripe) 参照（globals.css）のため、この 1 変数で横断制御できる。
 */
export function applyDisplayPreference(
  pref: DisplayPreferenceDto | null,
  root: HTMLElement = document.documentElement,
): void {
  if (!pref) {
    root.style.removeProperty('--sp-row-stripe');
    return;
  }
  root.style.setProperty('--sp-row-stripe', pref.stripeEnabled ? pref.stripeColor : 'transparent');
}

export { STRIPE_COLOR_DEFAULT };
