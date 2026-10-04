/**
 * バイト数を利用者向けの表示（B / KB / MB / GB）へ整える（v2-191・v2-209 で共通層へ移設）。
 *
 * 以前は MB へ切り捨てていたため、1 MB 未満の上限が「0 MB」と表示され、上限が 0 に見えていた。
 * 単位を落として実際の値を出し、案内文が設定値と食い違わないようにする。
 *
 * アップロードの拒否文言（file モジュールの業務上限・multipart 層の上限）が使う。呼び出し元が
 * モジュールをまたぐため、機能モジュールではなく共通層に置く。
 */
export function formatFileSize(bytes: number): string {
  const round = (value: number): string =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  const kb = 1024;
  if (bytes >= gb) return `${round(bytes / gb)} GB`;
  if (bytes >= mb) return `${round(bytes / mb)} MB`;
  if (bytes >= kb) return `${round(bytes / kb)} KB`;
  return `${bytes} B`;
}
