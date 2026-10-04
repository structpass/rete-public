'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { fetchFileMeta } from '../lib/api';
import type { FileEditTarget } from '../lib/types';

/**
 * お気に入りファイル★の deep link（/files?fileId=<id>）を編集オーバーレイ導線へ解決する（FF・rete-files-0026）。
 *
 * fileId が来たらメタ（名前 / 所属フォルダ / 最新版）を取得し、所属フォルダへ移動したうえで編集
 * オーバーレイ（DL→ローカル編集→再アップで新版）を開く。同一 fileId での二重発火は ref で抑止する
 * （selectFolder / openEdit が再生成されても、解決済み fileId なら再起動しない）。取得失敗は toast で通知する。
 *
 * @param fileId       現在の `?fileId=` クエリ（無ければ null）
 * @param selectFolder 所属フォルダへ遷移させる（browser.selectFolder・useCallback 安定前提）
 * @param openEdit     編集オーバーレイを開く（overlays.openEdit・useCallback 安定前提）
 */
export function useFileEditLink(
  fileId: string | null,
  selectFolder: (fid: string) => void,
  openEdit: (target: FileEditTarget) => void,
): void {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!fileId || handledRef.current === fileId) return;
    handledRef.current = fileId;
    let cancelled = false;
    void (async () => {
      try {
        const meta = await fetchFileMeta(fileId);
        if (cancelled) return;
        selectFolder(meta.folderId);
        openEdit({ id: meta.id, name: meta.name, versionNo: meta.versionNo });
      } catch {
        if (cancelled) return;
        // 取得失敗時は次回同 fileId で再試行できるよう解決済みフラグを戻す。
        handledRef.current = null;
        toast.error('お気に入りファイルを開けませんでした');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, selectFolder, openEdit]);
}
