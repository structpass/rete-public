'use client';

import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/lib/error-utils';
import {
  addAnnouncementAttachment,
  removeAnnouncementAttachment,
  type AnnouncementAttachment,
} from '../lib/api';

/** useAnnouncementAttachments の返り（編集フォームの添付欄が使う）。 */
export interface UseAnnouncementAttachmentsResult {
  attachments: AnnouncementAttachment[];
  mutating: boolean;
  add: (fileId: string) => Promise<boolean>;
  remove: (attachmentId: string) => Promise<void>;
}

/**
 * 通知の添付（H0022・編集モード即時）。既存通知（id 確定済）への後付け添付/解除を担う。
 * 詳細 GET が既に添付一覧を返すため初期値をそのまま seed し、無駄な再取得をしない（desk の useDeskAttachments
 * と同方針だが、通知は detail 由来の初期値で開始する点だけ異なる）。
 *
 * - 追加成功時は backend が返す確定版（版番号・添付者名）を末尾に積む。失敗は toast（業務メッセージ投影）。
 * - 解除は楽観的にローカル除去（GET 再取得を避ける・失敗時は toast）。
 * - 認可（ADMIN 限定）は backend が enforce するため、本 hook は編集フォーム（ADMIN のみ露出）からのみ使う。
 */
export function useAnnouncementAttachments(
  announcementId: string,
  initial: AnnouncementAttachment[],
): UseAnnouncementAttachmentsResult {
  const [attachments, setAttachments] = useState<AnnouncementAttachment[]>(initial);
  const [mutating, setMutating] = useState(false);
  // in-flight ガードは ref で読む（mutating state を依存に含めると add/remove が往復ごとに再生成され、
  // 受け手の useCallback 連鎖を無駄に揺らす）。UI 用の mutating state は据え置く。
  const mutatingRef = useRef(false);

  const setMutatingBoth = useCallback((v: boolean) => {
    mutatingRef.current = v;
    setMutating(v);
  }, []);

  const add = useCallback(
    async (fileId: string): Promise<boolean> => {
      if (mutatingRef.current) return false;
      setMutatingBoth(true);
      try {
        const created = await addAnnouncementAttachment(announcementId, fileId);
        setAttachments((prev) => [...prev, created]);
        return true;
      } catch (e) {
        toast.error(extractErrorMessage(e, '添付の追加に失敗しました'));
        return false;
      } finally {
        setMutatingBoth(false);
      }
    },
    [announcementId, setMutatingBoth],
  );

  const remove = useCallback(
    async (attachmentId: string): Promise<void> => {
      if (mutatingRef.current) return;
      setMutatingBoth(true);
      try {
        await removeAnnouncementAttachment(announcementId, attachmentId);
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      } catch (e) {
        toast.error(extractErrorMessage(e, '添付の解除に失敗しました'));
      } finally {
        setMutatingBoth(false);
      }
    },
    [announcementId, setMutatingBoth],
  );

  return { attachments, mutating, add, remove };
}
