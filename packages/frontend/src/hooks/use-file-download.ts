'use client';

import { useCallback, useRef, useState } from 'react';
import { saveBlobAsFile } from '@/lib/save-blob';

export interface UseFileDownloadResult {
  /** ダウンロード進行中フラグ（ボタン二度押し防止・loading 表示用）。 */
  downloading: boolean;
  /**
   * fetchBlob で取得した blob を filename で保存する。busy ガード込み。
   * 成功で true / 失敗で false（呼び出し側が options.onError で toast 等を制御）。
   */
  download: (
    fetchBlob: () => Promise<Blob>,
    filename: string,
    options?: { onError?: (err: unknown) => void },
  ) => Promise<boolean>;
}

/**
 * CSV エクスポート等の「fetch→blob 保存」定型（audit-log / members / invites の
 * exporting フラグ + createObjectURL 塊）を共通化する hook（set-0046・§6）。
 */
export function useFileDownload(): UseFileDownloadResult {
  const [downloading, setDownloading] = useState(false);
  const guardRef = useRef(false);

  const download = useCallback(
    async (
      fetchBlob: () => Promise<Blob>,
      filename: string,
      options?: { onError?: (err: unknown) => void },
    ): Promise<boolean> => {
      if (guardRef.current) return false;
      guardRef.current = true;
      setDownloading(true);
      try {
        const blob = await fetchBlob();
        saveBlobAsFile(blob, filename);
        return true;
      } catch (err) {
        options?.onError?.(err);
        return false;
      } finally {
        guardRef.current = false;
        setDownloading(false);
      }
    },
    [],
  );

  return { downloading, download };
}
