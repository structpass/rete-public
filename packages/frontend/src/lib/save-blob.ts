/**
 * 手元にある blob をブラウザ経由でファイル保存する（set-0046・§3 コピペ回避）。
 * audit-log / members / invites の CSV エクスポート・ダウンロード導線で
 * createObjectURL→a要素→click→revokeObjectURL の逐語コピーが4箇所あったため抽出。
 * fetch を伴う保存は useFileDownload（busy フラグ込み）から呼ぶ。
 *
 * revokeDelayMs: object URL を解放するまでの遅延 ms。省略時は click 直後に解放する（抽出元4箇所の従来挙動）。
 * click と同一 tick の revoke でダウンロードを取りこぼすブラウザがあるため、遅延させたい導線
 * （files の DL=1000ms / desk の添付 DL=0ms＝次 tick）が明示的に渡す（v2-234）。
 */
export function saveBlobAsFile(blob: Blob, filename: string, revokeDelayMs?: number): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // DOM 操作が throw しても object URL を残さない（desk 添付 DL の従来実装と同じ保証）。
    if (revokeDelayMs === undefined) URL.revokeObjectURL(url);
    else setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs);
  }
}
