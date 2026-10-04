'use client';

import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { createFolder as apiCreateFolder } from '../lib/api';
import { extractErrorMessage } from '@/lib/error-utils';

/** ツリー上のインライン新規フォルダ入力の状態（作成先・入力中の名前）。 */
export interface FolderDraft {
  /** 作成先の親フォルダ id（ルート直下は null）。 */
  parentFolderId: string | null;
  /** 入力中のフォルダ名。 */
  name: string;
}

export interface UseFolderCreateResult {
  draft: FolderDraft | null;
  submitting: boolean;
  /** 指定フォルダ直下（null=ルート直下）に新規フォルダの draft 入力を開始する。 */
  begin: (parentFolderId: string | null) => void;
  /** 入力中の名前を更新する。 */
  changeName: (name: string) => void;
  /** draft をキャンセルする（破棄）。 */
  cancel: () => void;
  /** 入力中の名前で作成 API を叩く。成功で draft を閉じ onCreated を呼ぶ。失敗は toast で draft を保持。 */
  commit: () => Promise<void>;
}

/**
 * フォルダのインライン新規作成 state（architecture-invariants §6 同型 UI hook 化）。
 *
 * ツリー上の draft 入力行の状態（作成先・入力名・送信中）を集約し、作成 API → 再取得を司る。
 * 楽観更新は採らず、成功後に onCreated（ツリー + 現在フォルダ再取得）で backend 状態へ整合させる
 * （移動 / 削除と同じく source-of-truth は backend）。同名衝突など backend の業務エラーは toast で示し、
 * draft を閉じずに保持して利用者が名前を直せるようにする。
 *
 * @param onCreated 作成成功後に呼ぶ再取得（通常 use-file-browser の reloadAll）。
 * @param spaceId 現在表示中の器（channel）。ルート直下作成の帰属器として送る（ADR 0063・fil-0137）。
 */
export function useFolderCreate(
  onCreated: () => Promise<void>,
  spaceId?: string | null,
): UseFolderCreateResult {
  const [draft, setDraft] = useState<FolderDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 送信中の二重コミット（Enter 連打 / disable 反映前の再入）を同期的に弾く。
  const submittingRef = useRef(false);

  const begin = useCallback((parentFolderId: string | null) => {
    setDraft({ parentFolderId, name: '' });
  }, []);

  const changeName = useCallback((name: string) => {
    setDraft((d) => (d ? { ...d, name } : d));
  }, []);

  const cancel = useCallback(() => {
    setDraft(null);
  }, []);

  const commit = useCallback(async () => {
    if (submittingRef.current || !draft) return;
    const name = draft.name.trim();
    // 空名は作成せず入力を継続させる（Enter での確定を無視）。
    if (!name) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await apiCreateFolder(draft.parentFolderId, name, spaceId ?? undefined);
      setDraft(null);
      await onCreated();
      toast.success(`フォルダ「${name}」を作成しました`);
    } catch (e) {
      toast.error(extractErrorMessage(e, 'フォルダの作成に失敗しました'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [draft, onCreated, spaceId]);

  return { draft, submitting, begin, changeName, cancel, commit };
}
