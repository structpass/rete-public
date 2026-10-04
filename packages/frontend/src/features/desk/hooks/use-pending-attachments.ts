'use client';

import { useCallback, useState } from 'react';
import type { AttachmentTargetType } from '../lib/api';
import { flushFileIds } from '../lib/flush-file-ids';

/**
 * 添付の出所（rete-desk-0108）。`repo`=Files から既存ファイルを参照（リンク）、`local`=ローカル PC から
 * アップロードして取り込み。チップのアイコン表現（リンク/ファイル）を切り替えるためだけに保持する
 * （flush 後はどちらも fileId 参照に収束するため、サーバ側へは送らない compose 時限定の区別）。
 */
export type AttachmentSource = 'repo' | 'local';

/** 保留中（未確定エンティティ向け）の添付候補。エンティティ確定までローカルに保持する。 */
export interface PendingAttachment {
  fileId: string;
  fileName: string;
  /** 出所（チップのアイコン表現用・未指定はローカル扱い）。 */
  source: AttachmentSource;
}

/**
 * deferred-flush 添付（FL-3b）。新規作成／投稿コンポーザや編集モードのように「添付先エンティティの id が
 * まだ確定していない」局面で使う。compose 中はファイルをローカル保持し、作成/投稿が成功した瞬間に
 * flush() で添付 API を一括発火して紐づける（既存エンティティ向けの即時添付は useDeskAttachments を使う）。
 *
 * - add/remove はローカル配列のみ操作（サーバ未通信）。同一ファイルの二重保留は fileId で抑止。
 * - flush は個々の失敗を toast で投影しつつ best-effort で続行（一部成功を許容）。完了後ローカルを空にする。
 */
export function usePendingAttachments() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const add = useCallback(
    (fileId: string, fileName: string, source: AttachmentSource = 'local') => {
      setPending((prev) =>
        prev.some((p) => p.fileId === fileId) ? prev : [...prev, { fileId, fileName, source }],
      );
    },
    [],
  );

  const remove = useCallback((fileId: string) => {
    setPending((prev) => prev.filter((p) => p.fileId !== fileId));
  }, []);

  const clear = useCallback(() => setPending([]), []);

  /**
   * 確定したエンティティ（id 確定後）へ保留中ファイルを一括添付する。
   * 個々の失敗は toast で投影しつつ続行し、成功有無に関わらず最後にローカルを空にする
   * （compose は完了済みのため未確定状態を残さない）。
   */
  const flush = useCallback(
    async (targetType: AttachmentTargetType, targetId: string | number): Promise<void> => {
      if (pending.length === 0) return;
      await flushFileIds(
        pending.map((p) => p.fileId),
        targetType,
        targetId,
        (id) => pending.find((p) => p.fileId === id)?.fileName,
      );
      setPending([]);
    },
    [pending],
  );

  return { pending, add, remove, clear, flush, count: pending.length };
}
