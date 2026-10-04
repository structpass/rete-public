'use client';

import { useCallback, useEffect, useState } from 'react';
import { createChatThreadFromFiles, createTaskFromFiles, fetchCategories } from '../lib/api';
import type { ShareCategory } from '../lib/api';
import type { ShareTarget } from '../lib/types';

export interface ShareSubmitInput {
  title: string;
  description: string;
  /** タスク共有時の categoryId（chat では未使用）。 */
  categoryId?: number;
}

export interface UseFileShareResult {
  categories: ShareCategory[];
  categoriesLoading: boolean;
  /** カテゴリ取得に失敗したか（タスク共有は categoryId 必須なので取得失敗 = 共有不能を明示する）。 */
  categoriesError: boolean;
  submitting: boolean;
  /** 実生成して true / 失敗で false を返す（呼び出し側が toast / close を制御）。 */
  submit: (input: ShareSubmitInput) => Promise<boolean>;
}

/**
 * ファイル→Desk 共有（FL）の生成ロジック。chat は新規テーマ、task は新規タスクを実生成する。
 * task のみ categoryId が必須のため、target==='task' のときだけカテゴリ一覧を取得する。
 */
export function useFileShare(target: ShareTarget): UseFileShareResult {
  const [categories, setCategories] = useState<ShareCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(target === 'task');
  const [categoriesError, setCategoriesError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target !== 'task') return;
    let active = true;
    setCategoriesLoading(true);
    setCategoriesError(false);
    fetchCategories()
      .then((cats) => {
        if (active) setCategories(cats);
      })
      .catch(() => {
        if (active) {
          setCategories([]);
          setCategoriesError(true);
        }
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [target]);

  const submit = useCallback(
    async (input: ShareSubmitInput): Promise<boolean> => {
      setSubmitting(true);
      try {
        if (target === 'task') {
          if (input.categoryId === undefined) return false;
          await createTaskFromFiles({
            title: input.title,
            categoryId: input.categoryId,
            description: input.description,
          });
        } else {
          await createChatThreadFromFiles(input.title, input.description);
        }
        return true;
      } catch {
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [target],
  );

  return { categories, categoriesLoading, categoriesError, submitting, submit };
}
