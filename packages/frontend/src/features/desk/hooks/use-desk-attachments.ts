'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/lib/error-utils';
import {
  fetchAttachments,
  createAttachment as createAttachmentApi,
  deleteAttachment as deleteAttachmentApi,
  type Attachment,
  type AttachmentTargetType,
} from '../lib/api';

export interface AttachmentTarget {
  targetType: AttachmentTargetType;
  /** task=タスク id（数値）/ chatMessage=メッセージ id（UUID）/ theme=テーマ id（UUID）。 */
  targetId: string | number;
  /**
   * 取得を有効化するか（既定 true）。対象 id が未確定（例: タスク詳細のロード中）の局面で false にして
   * 無効 id への GET を避ける。false→true へ切り替わると（id 確定時）通常どおり取得する。
   */
  enabled?: boolean;
}

/** useDeskAttachments の返り（一覧の表示パネルとコメント欄の添付ボタンで共有するため型を公開）。 */
export interface UseDeskAttachmentsResult {
  attachments: Attachment[];
  loading: boolean;
  error: string | null;
  mutating: boolean;
  /**
   * ファイルを添付する。fileName はピッカーが持つ表示名で、保留（deferred）実装が確定前チップの表示に
   * 使う（即時実装＝本 hook は fileId のみ使用し無視・dsk-0265）。
   */
  add: (fileId: string, fileName?: string) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * Desk 添付（FL-3）の一覧取得・追加・解除を担う hook。タスク詳細／チャットの添付欄が共有する
 * （targetType で task / chatMessage を切り替え・配線は共通）。
 *
 * - 取得失敗はインライン error（呼び出し側が表示）。追加/解除失敗は toast（backend 業務メッセージを投影）。
 * - 追加成功後は load() で再取得しサーバ確定状態へ整合（版固定・添付者名を正とする）。
 * - 解除は楽観的にローカル配列から除去（GET 再取得コストを避ける・失敗時は toast のみ）。
 */
export function useDeskAttachments(target: AttachmentTarget): UseDeskAttachmentsResult {
  const { targetType, targetId, enabled = true } = target;
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const load = useCallback(async () => {
    // 対象 id 未確定（enabled=false）の間は取得しない（無効 id への GET を避ける）。
    // 直前の対象の一覧が残ってちらつかないよう空にする（別テーマ/タスクへ切替時の stale 表示防止）。
    if (!enabled) {
      setAttachments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setAttachments(await fetchAttachments(targetType, targetId));
    } catch (e) {
      setError(extractErrorMessage(e, '添付の取得に失敗しました'));
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  /** ファイルを添付する。成功時 true（呼び出し側はピッカーを閉じる）。 */
  const add = useCallback(
    async (fileId: string): Promise<boolean> => {
      if (mutating) return false;
      setMutating(true);
      try {
        await createAttachmentApi({ targetType, targetId, fileId });
        await load();
        return true;
      } catch (e) {
        toast.error(extractErrorMessage(e, '添付の追加に失敗しました'));
        return false;
      } finally {
        setMutating(false);
      }
    },
    [mutating, targetType, targetId, load],
  );

  /** 添付を解除する（楽観的にローカル除去・失敗時は toast）。 */
  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (mutating) return;
      setMutating(true);
      try {
        await deleteAttachmentApi(id);
        setAttachments((prev) => prev.filter((a) => a.id !== id));
      } catch (e) {
        toast.error(extractErrorMessage(e, '添付の解除に失敗しました'));
      } finally {
        setMutating(false);
      }
    },
    [mutating],
  );

  return { attachments, loading, error, mutating, add, remove, reload: load };
}
