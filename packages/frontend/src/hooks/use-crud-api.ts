'use client';

import { useState, useCallback } from 'react';
import apiClient from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-utils';
import toast from 'react-hot-toast';
import type { PaginationMeta } from '@rete/shared';

export type { PaginationMeta };

interface FetchParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  [key: string]: unknown;
}

/**
 * 一覧 + 単項目 CRUD の API 呼び出しを共通化する hook（reference の use-crud-api 踏襲）。
 * 成功/失敗の toast 通知を一元化し、各画面は items / meta / loading と操作関数だけを使う。
 */
export function useCrudApi<T>(basePath: string, entityName: string) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const fetchAll = useCallback(
    async (params: FetchParams = {}) => {
      setLoading(true);
      try {
        const res = await apiClient.get(basePath, { params });
        setItems(res.data.data);
        setMeta(res.data.meta ?? null);
      } catch {
        toast.error(`${entityName}一覧の取得に失敗しました`);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    },
    [basePath, entityName],
  );

  const fetchOne = useCallback(
    async (id: string | number): Promise<T | null> => {
      try {
        const res = await apiClient.get(`${basePath}/${id}`);
        return res.data.data;
      } catch {
        toast.error(`${entityName}の取得に失敗しました`);
        return null;
      }
    },
    [basePath, entityName],
  );

  const create = useCallback(
    async (data: Record<string, unknown>): Promise<boolean> => {
      try {
        await apiClient.post(basePath, data);
        toast.success(`${entityName}を登録しました`);
        return true;
      } catch (err: unknown) {
        toast.error(extractErrorMessage(err, `${entityName}の登録に失敗しました`));
        return false;
      }
    },
    [basePath, entityName],
  );

  const update = useCallback(
    async (id: string | number, data: Record<string, unknown>): Promise<boolean> => {
      try {
        await apiClient.put(`${basePath}/${id}`, data);
        toast.success('更新が完了しました');
        return true;
      } catch (err: unknown) {
        toast.error(extractErrorMessage(err, `${entityName}の更新に失敗しました`));
        return false;
      }
    },
    [basePath, entityName],
  );

  const remove = useCallback(
    async (id: string | number): Promise<boolean> => {
      try {
        await apiClient.delete(`${basePath}/${id}`);
        toast.success(`${entityName}を削除しました`);
        return true;
      } catch {
        toast.error(`${entityName}の削除に失敗しました`);
        return false;
      }
    },
    [basePath, entityName],
  );

  return { items, meta, loading, initialized, fetchAll, fetchOne, create, update, remove };
}
