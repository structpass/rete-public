/**
 * Desk 個人設定（ペイン幅比率 / rete-desk-0142）の値域 SSOT（§5）。
 * backend DTO（class-validator @Min/@Max）と frontend のドラッグ clamp が双方 import して使い、
 * 片側だけ変更されて検証範囲が食い違うのを防ぐ。
 * どちらかのペインが潰れて操作不能にならない範囲として 0.25〜0.75 に制限する。
 */
export const DESK_PANE_RATIO_MIN = 0.25;
export const DESK_PANE_RATIO_MAX = 0.75;

/** 既定の左ペイン比率。CSS 既定 `4.5fr 6px 5.5fr` と同じ見た目（4.5 / 10）。 */
export const DESK_PANE_DEFAULT_RATIO = 0.45;
