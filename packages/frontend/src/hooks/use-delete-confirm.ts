'use client';

import { useState, useCallback } from 'react';

/**
 * 削除処理。第 1 引数は id、第 2 引数は確定時点の対象実体（cmn-0352）。
 * 対象の id 以外の情報（kind 等）が必要な場合は第 2 引数を使う。
 */
type RemoveFn<T> = (id: number | string, target: T) => Promise<boolean>;

interface UseDeleteConfirmOptions<T> {
  remove: RemoveFn<T>;
  /** 削除成功後の後処理。第 1 引数は id、第 2 引数は確定時点の対象実体（cmn-0352）。 */
  onSuccess?: (deletedId: number | string, target: T) => void;
}

/**
 * 一覧画面の削除確認ダイアログ状態と実行ロジックを共通化する（reference 踏襲）。
 *
 * 契約（cmn-0352・close-first）: 確定（handleDelete）を押した瞬間にダイアログを閉じ
 * （setDeleteTarget(null) → await remove）、削除処理は裏で実行する。remove() が true を
 * 返した場合 onSuccess(deletedId, target) を呼ぶ。失敗時のエラー表示は remove 側の
 * toast に委譲（ダイアログは閉じたまま）。
 */
export function useDeleteConfirm<T extends { id: number | string }>({
  remove,
  onSuccess,
}: UseDeleteConfirmOptions<T>) {
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    const target = deleteTarget;
    setDeleteTarget(null);
    const ok = await remove(targetId, target);
    if (ok) {
      onSuccess?.(targetId, target);
    }
  }, [deleteTarget, remove, onSuccess]);

  return {
    deleteTarget,
    setDeleteTarget,
    handleDelete,
  };
}
