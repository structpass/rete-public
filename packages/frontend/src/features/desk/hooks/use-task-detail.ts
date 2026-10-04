'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { type ReactionEmoji } from '@rete/shared';
import { fetchTaskDetail, updateTask, toggleTaskReaction } from '../lib/api';
import type { Task } from '@/features/tasks/lib/api';

export interface UseTaskDetailResult {
  task: Task | null;
  /**
   * 詳細取得中の状態。dsk-0432: 現状 UI へは配線していない（詳細画面は dsk-0219 により stale な
   * task を出し続ける方針のため）。dsk-0409 の受入確認はこの内部状態で判定していた。
   */
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** 更新を保存する。保存自体が成功すれば解決する（保存後の再取得失敗は save の失敗として伝えない）。 */
  save: (payload: Record<string, unknown>) => Promise<void>;
  toggleReaction: (emoji: ReactionEmoji) => Promise<void>;
}

/**
 * タスク詳細（1 件）の取得 + 更新。taskId が null の間は何も取得しない。
 * 更新は楽観反映せず、サーバ確定値で task state を差し替える。
 *
 * dsk-0219: `seed`（一覧が既に持つタスク要約）を渡すと、詳細 GET 完了前に種として即描画し、
 * オープン直後のローディングスピナーのちらつきを消す。種が無い（一覧にも無い）真の初回ロードのみ
 * task=null のままとなりスピナーを許容する。種は ref 経由で参照し load の依存に含めない
 * （tree 再取得で種の参照が変わっても詳細を無駄に再 GET しないため）。
 */
export function useTaskDetail(taskId: number | null, seed?: Task | null): UseTaskDetailResult {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seedRef = useRef(seed);
  seedRef.current = seed;

  // dsk-0397: 発行順の連番。↑↓ の連続移動（use-desk-keyboard-nav の follow）でタスク A→B と素早く
  // 切り替えると GET が並走し、先発（A）が後着した場合に B 選択中へ A の内容が入る。応答適用時に
  // 自分が最新の要求かを照合し、追い越された古い応答は捨てる（use-chat-thread の requestSeqRef と同型）。
  // load と save で連番を共有する（別々に持つと互いの追い越しを検知できない）。
  const requestSeqRef = useRef(0);
  // dsk-0404: 現在の taskId を毎レンダーで保持する ref。toggleReaction が await 後に「タスクが
  // 変わったか」を起点 taskId との比較で判定する。旧実装は切替検出に requestSeqRef（load/save
  // の連番）を兼用していたが、同一タスクでトグルと save が並走すると save の seq++ が偽陽性を
  // 生み、後着トグルの再取得が黙って落ちてリアクションが次回取得まで stale になる退行だった
  // （use-chat-thread の dsk-0399 再入ガード起因と同根）。taskId 比較は identity 変化そのものを
  // エンコードするため、同タスク並走では偽陽性ゼロ・切替時は再取得をスキップする。
  // save の seq++（in-flight の古い GET 無効化）は本来の役割なので現状維持。
  const activeTaskIdRef = useRef(taskId);
  activeTaskIdRef.current = taskId;

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    if (taskId == null) {
      setTask(null);
      // 早期 return 経路は自前で loading を降ろす。進行中だった先発 GET の finally は seq 不一致で
      // setLoading(false) をスキップするため、ここで降ろさないと spinner が残り続ける
      // （use-chat-thread の !themeId 経路と同じ理由）。
      setLoading(false);
      return;
    }
    // dsk-0219: 新しいタスクを開く瞬間（現 task が無い / 別 id）に、一覧の種があれば即描画して
    // スピナーを出さない。既に同一 id を表示中（タスク切替の stale 保持）や種が無い場合は現状維持。
    setTask((cur) => {
      if (cur?.id === taskId) return cur;
      const s = seedRef.current;
      return s != null && s.id === taskId ? s : cur;
    });
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchTaskDetail(taskId);
      if (seq !== requestSeqRef.current) return; // 追い越された古い応答は表示へ反映しない
      setTask(detail);
    } catch {
      // 追い越された側の失敗で、最新要求の成功表示にエラーを被せない。
      if (seq !== requestSeqRef.current) return;
      setError('タスク詳細の取得に失敗しました');
    } finally {
      // 追い越された側が loading を降ろすと、後発の切替が立てた spinner を横から消してしまう。
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (payload: Record<string, unknown>): Promise<void> => {
      if (taskId == null) throw new Error('保存対象のタスクが選択されていません');
      // dsk-0409: 書き込み完了後に「見ているタスクが変わっていないか」を先に判定する。
      // 書き込み前に seq を取ると、書き込み中に割り込んだ取得（トグル由来の load 等）に番号を
      // 追い越され、保存自身の新しい GET が捨てられて表示が次回操作まで古いままになる
      // （dsk-0404 で窓が開いたレース。保存自体は成功しているので戻り値は解決する）。
      // 単に判定を後ろへ動かすだけでは、切替中の保存が切替先の in-flight GET を bump で
      // 無効化して読み込み表示を残すため、identity 不一致時は seq に触れず離脱する。
      await updateTask(taskId, payload);
      // 切替中（別タスクの load が進行中）の保存は、再取得すると切替先の GET を無効化して
      // スピナーが残るため、何もせず離脱する。
      if (taskId !== activeTaskIdRef.current) return;
      // ここからが最新の要求。同一タスクの古い GET（トグル由来の load 等）を無効化する bump。
      // 無効化された load は finally の setLoading(false) を seq 一致でスキップするため、
      // その分の loading はこちらで降ろす（save 自体は loading を立てない＝保存時スピナー抑止）。
      const seq = ++requestSeqRef.current;
      setLoading(false);
      try {
        const detailed = await fetchTaskDetail(taskId);
        if (seq === requestSeqRef.current) setTask(detailed);
      } catch {
        // 保存後の再取得の失敗は「保存の失敗」として呼び出し側へ伝えない（desk-shell.tsx:530-532 の
        // ツリー再取得と同じ判断。保存自体は成功済み）。ただし黙って stale な task を出し続ける
        // 「task + error=null + loading=false」で止まらせず、取得のエラーとして setError する
        // （dsk-0432 M2）。追い越された側の失敗は最新要求の表示に被せない。
        if (seq !== requestSeqRef.current) return;
        setError('タスク詳細の取得に失敗しました');
      }
    },
    [taskId],
  );

  /**
   * 起点カード（タスク本体）へのリアクションをトグル（dsk-0297）。トグル API は {reacted} のみ返すため、
   * count/reactedByMe を最新化するには詳細を引き直す（use-task-comments.toggleReaction と同型）。
   */
  const toggleReaction = useCallback(
    async (emoji: ReactionEmoji) => {
      if (taskId == null) return;
      // dsk-0397 / dsk-0404: トグル API の解決を待つ間に別タスクへ切り替わると、ここで走る load() は
      // 切替前の taskId を閉じ込めたまま旧タスクの詳細を表示へ適用してしまう。起点 taskId を控え、
      // 切替が起きていたら再取得自体を行わない。旧実装は切替検出に requestSeqRef（load/save の
      // 連番）を兼用していたが、save の seq++ が同タスク並走時に偽陽性を生み後着トグルの再取得を
      // 落としていた（dsk-0404・activeTaskIdRef 宣言部コメント参照）。identity 比較なら同タスク
      // 並走では偽陽性ゼロ。連打の直列化（ReactionBar の busy 無効化）は UX 層で維持。
      const startTaskId = activeTaskIdRef.current;
      await toggleTaskReaction(taskId, emoji);
      if (activeTaskIdRef.current !== startTaskId) return;
      await load();
    },
    [taskId, load],
  );

  return { task, loading, error, refetch: load, save, toggleReaction };
}
