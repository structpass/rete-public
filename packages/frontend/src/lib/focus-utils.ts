/**
 * フォーカス可能要素の CSS セレクタ（focus trap 共通定義・rete-files-0041）。
 *
 * OverlayDialog（components/ui/overlay-dialog.tsx）が使用する（cmn-0355: useFocusTrap は
 * 削除済み・本番参照ゼロのため）。要素種別（[role=menuitem] / details>summary 等）を足す時は
 * ここを単一ソースにする。
 */
export const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"])';
