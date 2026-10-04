'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type ReactionEmoji } from '@rete/shared';
import {
  fetchTaskComments,
  postTaskComment,
  updateTaskComment,
  deleteTaskComment,
  toggleTaskCommentReaction,
  type TaskCommentDto,
} from '../lib/api';
import { flushFileIds } from '../lib/flush-file-ids';

/**
 * タスク詳細のコメント（dsk-0214・GET/POST /tasks/:id/comments）。chat 詳細の返信と同型で、
 * 投稿成功後に一覧を再取得して時系列表示へ反映する。taskId=null（タスク未確定/ロード中）は無効 id への
 * GET を避けて空状態に留める。メンションは dsk-0203 でチャットと対称に対応
 * （投稿/編集の宛先 mentionAccountIds を payload へ素通しする）。リアクションは dsk-0297 でチャットと対称に
 * 対応した（トグル API は {reacted} のみ返すため、use-chat-thread と同じく reload で最新化する）。
 */
export function useTaskComments(taskId: number | null) {
  const [comments, setComments] = useState<TaskCommentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 現在表示中の taskId を常に保持（append 時の混入ガード用・dsk-0219）。
  const taskIdRef = useRef<number | null>(taskId);
  useEffect(() => {
    taskIdRef.current = taskId;
  }, [taskId]);

  const load = useCallback(async () => {
    if (taskId == null) {
      setComments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchTaskComments(taskId);
      // fetch がタスク切替後に解決した場合、別タスクの一覧を上書きしない（submit/update/remove と同じ
      // 混入ガード・dsk-0279 code-review HIGH 対処。reload は commit 後の長い非同期チェーン末尾から
      // 呼ばれるため、切替レースの窓が effect 起点の初回 load より広い）。
      if (taskId === taskIdRef.current) setComments(fetched);
    } catch {
      // 旧タスクの失敗を新タスクの画面へ出さない（成功パスと同じガード）。
      if (taskId === taskIdRef.current) setError('コメントの取得に失敗しました');
    } finally {
      // 旧応答の解決で表示中タスクの loading を誤って落とさない。
      if (taskId === taskIdRef.current) setLoading(false);
    }
  }, [taskId]);

  // タスク切替（taskId 変化）で一覧を読み直す。
  useEffect(() => {
    void load();
  }, [load]);

  /**
   * コメント投稿。成功で「サーバ返却の確定コメントを末尾へ直接追記」し true を返す
   * （composer 側が入力欄クリア／失敗表示を成否で判断する）。
   * dsk-0219: 旧実装は投稿後に load() で一覧を再取得していたため、空リストへの初コメント投稿時に
   * loading=true となり一覧スピナーが瞬間表示されちらついた。再取得せず返却 DTO を append することで
   * ちらつきを無くす（時系列は createdAt 昇順の末尾追加で保たれる）。失敗時は一覧を変えず false。
   * 失敗の表示は呼び出し側（composer のローカル error）に委ねるため、ここでは load 専用の `error` を汚さない
   * （一覧取得エラーと投稿エラーの表示位置を分離する）。
   * dsk-0249: 保留添付（fileIds）がある時は、投稿で確定したコメント id へ deferred-flush 添付し（taskComment
   * 対象・チャット返信の post→attach→reload と同型）、添付を反映するため当該コメント行を再取得して差し替える
   * （append した created は添付未紐づけのため）。fileIds なしは従来どおり append のみ（ちらつき回避を維持）。
   */
  const submit = useCallback(
    async (
      body: string,
      fileIds: string[] = [],
      // 宛先（メンション先 / dsk-0203）。本文中の @ メンションから composer が抽出して渡す。
      mentionAccountIds: string[] = [],
    ): Promise<boolean> => {
      if (taskId == null) return false;
      setSubmitting(true);
      try {
        const created = await postTaskComment(taskId, body, mentionAccountIds);
        // POST がタスク切替後に解決した場合、別タスクの一覧へ混入させない（created.taskId が
        // 現在表示中の taskId と一致する時のみ append・dsk-0219 code-review HIGH 対処）。
        if (created.taskId === taskIdRef.current) {
          setComments((prev) => [...prev, created]);
        }
        // 保留添付を確定コメントへ best-effort 添付（FL-3b 共有ヘルパ・個々の失敗は toast で投影）。
        if (fileIds.length > 0) {
          await flushFileIds(fileIds, 'taskComment', created.id);
          // 添付済みの確定コメントを再取得して該当行を差し替える（append 済みの created は attachments=[] のため）。
          // タスク切替後（taskId 不一致）は別タスクへ反映しない（append と同じ混入ガード）。
          if (created.taskId === taskIdRef.current) {
            try {
              const refreshed = await fetchTaskComments(taskId);
              if (taskId === taskIdRef.current) setComments(refreshed);
            } catch {
              // 添付一覧の再取得失敗は投稿成否に影響させない（添付自体は flush 済み・次回 load で反映）。
            }
          }
        }
        return true;
      } catch {
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [taskId],
  );

  /**
   * 自分のコメントの本文編集（dsk-0241）。成功でサーバ返却の確定コメントを一覧の該当行へ差し替え true を返す
   * （編集フォーム側が成否で編集モード解除／失敗表示を判断する）。失敗時は一覧を変えず false。
   * 一覧取得エラー（load 用 `error`）は汚さない（編集の失敗表示は呼び出し側に委ねる）。
   */
  const update = useCallback(
    async (
      commentId: string,
      body: string,
      // 編集後本文から再抽出した宛先（dsk-0203）。当該コメントの宛先を全置換する（chat 発話編集と同型）。
      mentionAccountIds: string[] = [],
    ): Promise<boolean> => {
      if (taskId == null) return false;
      try {
        const updated = await updateTaskComment(taskId, commentId, body, mentionAccountIds);
        // PATCH がタスク切替後に解決した場合、別タスクの一覧へ反映しない（submit の dsk-0219 race guard と同型）。
        // 編集した UUID は切替前タスクの一覧に存在するため、ガードが無いと別タスク表示中に stale 差し替えが起きうる。
        if (updated.taskId === taskIdRef.current) {
          setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        }
        return true;
      } catch {
        return false;
      }
    },
    [taskId],
  );

  /**
   * 自分のコメントの削除（dsk-0241・物理削除）。成功で一覧から該当コメントを取り除き true を返す。
   * 失敗時は一覧を変えず false（呼び出し側が再試行表示を出す）。
   */
  const remove = useCallback(
    async (commentId: string): Promise<boolean> => {
      if (taskId == null) return false;
      try {
        await deleteTaskComment(taskId, commentId);
        // DELETE がタスク切替後に解決した場合、別タスクの一覧を触らない（submit の dsk-0219 race guard と同型）。
        // filter は UUID 不一致なら no-op だが、submit の確立パターンへ対称性を揃える。
        if (taskId === taskIdRef.current) {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }
        return true;
      } catch {
        return false;
      }
    },
    [taskId],
  );

  /**
   * コメントへのリアクションをトグル（dsk-0297）。トグル API は {reacted} のみ返すため、
   * count/reactedByMe を最新化するには一覧を引き直す（use-chat-thread.handleToggleMessageReaction と同型）。
   */
  const toggleReaction = useCallback(
    async (commentId: string, emoji: ReactionEmoji) => {
      if (taskId == null) return;
      await toggleTaskCommentReaction(taskId, commentId, emoji);
      await load();
    },
    [taskId, load],
  );

  // reload: コメント一覧の再取得（dsk-0279）。コメント編集の保留添付 commit 後、update() が差し替えた
  // 行は commit 前のスナップショットで attachments が古いため、確定後に一覧を取り直して反映する。
  return {
    comments,
    loading,
    submitting,
    error,
    submit,
    update,
    remove,
    toggleReaction,
    reload: load,
  };
}
