'use client';

import { useCallback, useState } from 'react';
import { createTask } from '../lib/api';
import type { Task } from '@/features/tasks/lib/api';

interface UseDeskTaskCreateArgs {
  /** 作成成功時にタスクツリーを取り直す。 */
  refetchTree: () => Promise<void>;
}

export interface UseDeskTaskCreateResult {
  saving: boolean;
  /** 作成エラー（write hook の error slot 名は saveError に統一。read hook 群は error）。 */
  saveError: string | null;
  /**
   * タスクを新規作成する（POST /tasks）。成功で作成 Task / 失敗で null を返す。
   * 返した Task の id は呼び出し側が deferred-flush 添付（FL-3b）の対象 id に使う。
   * ADR 0002: 作成後に詳細を自動オープンしない。閉じる等の view 遷移は呼び出し側（成功時）が行う。
   */
  create: (payload: Record<string, unknown>) => Promise<Task | null>;
}

/**
 * Desk のタスク新規作成フロー（C-新規）。D&D 昇格（useChatPromotion）と別経路の素の作成。
 * 作成 → ツリー再取得まで。成功後の view 遷移（closeLeft）は呼び出し側に委ねる（ADR 0002 準拠）。
 */
export function useDeskTaskCreate({ refetchTree }: UseDeskTaskCreateArgs): UseDeskTaskCreateResult {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const create = useCallback(
    async (payload: Record<string, unknown>): Promise<Task | null> => {
      setSaving(true);
      setSaveError(null);
      try {
        const created = await createTask(payload);
        await refetchTree();
        return created;
      } catch {
        setSaveError('タスクの作成に失敗しました');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [refetchTree],
  );

  return { saving, saveError, create };
}
