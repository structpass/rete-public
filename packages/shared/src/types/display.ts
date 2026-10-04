/**
 * 表示個人設定（明細の縞模様 / mdl-0022）の SSOT（§5）。
 * backend DTO（class-validator @Matches）と frontend の色入力検証・既定値表示が双方 import して使い、
 * 片側だけ変更されて検証・既定値が食い違うのを防ぐ。
 */

/** 明細縞の既定色（CSS --sp-row-stripe / DB default と同値。mdl-0052: 開発統括判断で #FAFCFF を正に確定＝dsk-0377 の #F4F5F7 化を差し戻し）。 */
export const STRIPE_COLOR_DEFAULT = '#FAFCFF';

/** 縞色の許容形式（#RRGGBB の 6 桁 hex のみ。3 桁短縮・rgb() は不可）。 */
export const STRIPE_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** 表示個人設定の DTO 形（GET/PUT /accounts/me/display-preference の data）。 */
export interface DisplayPreferenceDto {
  /** 明細の縞模様を表示するか（既定 true）。 */
  stripeEnabled: boolean;
  /** 縞模様の色（#RRGGBB）。 */
  stripeColor: string;
}
