'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import type { SpaceDto } from '@rete/shared';
import { updateSpace } from '../lib/api';
import { apiErrorMessage } from '../lib/api-error';

/**
 * 器（Space）更新導線の共有 hook（CM-2 rete-desk-0143・チャネル / dsk-0366 でグループも共用）。
 * 改名フォームと行メニューの「アーカイブ」双方から使う（§3・更新結果のハンドリングを一元化）。
 *
 * 成功時は確定 SpaceDto を返し、呼び出し側が一覧 reload を行う（reload は useProjectChannels が所有）。
 * 失敗時は backend の error.message（権限不足は 403）を toast し null を返す。
 * 削除は archived:true（ソフト削除）で表現し hard delete は行わない。
 */
export function useUpdateSpace() {
  const [submitting, setSubmitting] = useState(false);

  const renameSpace = useCallback(async (id: string, name: string): Promise<SpaceDto | null> => {
    setSubmitting(true);
    try {
      const space = await updateSpace(id, { name });
      toast.success(`「${space.name}」に変更しました`);
      return space;
    } catch (e) {
      toast.error(apiErrorMessage(e, '名前の変更に失敗しました'));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const archiveSpace = useCallback(async (id: string): Promise<SpaceDto | null> => {
    setSubmitting(true);
    try {
      const space = await updateSpace(id, { archived: true });
      toast.success(`「${space.name}」をアーカイブしました`);
      return space;
    } catch (e) {
      toast.error(apiErrorMessage(e, 'アーカイブに失敗しました'));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { renameSpace, archiveSpace, submitting };
}
