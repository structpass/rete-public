'use client';

import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/lib/error-utils';
import { downloadAttachment } from '../lib/download-attachment';
import type { Attachment } from '../lib/api';

export interface UseAttachmentDownloadResult {
  isDownloading: (id: string) => boolean;
  download: (att: Attachment) => void;
}

/**
 * 確定済添付のダウンロード起動（dsk-0251）の堅牢化（dsk-0261）。
 * 失敗は無音で握り潰さず toast で通知し、実行中の添付は id 単位で再入させない（連打で同一ファイルの
 * 並列取得が起きるのを防ぐ・別ファイルの同時ダウンロードは妨げない）。in-flight は ref で同期判定し、
 * setState の updater 内で副作用を起こさない（Strict Mode の updater 二重呼び出しで二重ダウンロードに
 * ならないようにするため）。
 */
export function useAttachmentDownload(): UseAttachmentDownloadResult {
  const inFlight = useRef<Set<string>>(new Set());
  const [, forceRender] = useState(0);

  const download = useCallback((att: Attachment) => {
    if (inFlight.current.has(att.id)) return;
    inFlight.current.add(att.id);
    forceRender((n) => n + 1);
    void downloadAttachment(att)
      .catch((e) => {
        toast.error(extractErrorMessage(e, 'ダウンロードに失敗しました'));
      })
      .finally(() => {
        inFlight.current.delete(att.id);
        forceRender((n) => n + 1);
      });
  }, []);

  const isDownloading = useCallback((id: string) => inFlight.current.has(id), []);

  return { isDownloading, download };
}
