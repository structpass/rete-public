'use client';

import { useEffect, useMemo, useRef } from 'react';
import type {
  UseFormClearErrors,
  UseFormRegister,
  UseFormSetError,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import { isUnmatchedParentTaskId, type TaskFormData } from '@/features/tasks/lib/validations';
import type { ParentTaskOption } from '@/features/tasks/lib/api';

/** dsk-0239: 親コード該当なしで更新を弾いた時のインラインエラー文言（両 save 面で共有）。 */
export const UNMATCHED_PARENT_MESSAGE = '親タスクが存在しません';

/**
 * 親コード（自由入力のチケットNo）が候補に存在しない「該当なし」を submit 前に判定する共有ガード（dsk-0239）。
 * 該当なしなら parentTaskId に manual error を立てて false（送信中止）を返す。該当あり/空/picker 無効時は
 * 残留 error をクリアして true（続行）を返す。useTaskForm が zodResolver を使うため field-level validate は
 * 効かず、両 save 面（編集=DeskTaskForm.submit / 新規=TaskCreateOverlay.handleValid）がこの単一関数を呼ぶ。
 */
export function validateParentMatch(
  parentTaskId: string | undefined,
  parentTasks: ReadonlyArray<{ id: number }> | undefined,
  setError: UseFormSetError<TaskFormData>,
  clearErrors: UseFormClearErrors<TaskFormData>,
): boolean {
  if (parentTasks && isUnmatchedParentTaskId(parentTaskId, parentTasks)) {
    setError('parentTaskId', { type: 'manual', message: UNMATCHED_PARENT_MESSAGE });
    return false;
  }
  clearErrors('parentTaskId');
  return true;
}

/** 親の categoryId（number|null）→ フォームの分類 select 値（空文字 = 未分類 / rete-desk-0158）。 */
function categoryIdToFormValue(categoryId: number | null): string {
  return categoryId != null ? String(categoryId) : '';
}

interface DeskParentFieldProps {
  register: UseFormRegister<TaskFormData>;
  watch: UseFormWatch<TaskFormData>;
  setValue: UseFormSetValue<TaskFormData>;
  /** 親候補（呼び出し側で自身＋子孫を除外済み）。 */
  parentTasks: ParentTaskOption[];
  /** submit 前バリデーション（dsk-0239）のインラインエラー文言。該当なしで更新を弾いた時に表示する。 */
  error?: string;
}

/**
 * 親タスク picker（rete-desk-0068/0071/0072）。新規登録・タスク詳細編集で共有する単一ソース
 * （architecture-invariants §3）。select の value は文字列 id（空 = 親なし＝トップレベル）。
 *
 * 分類連動（rete-desk-0072）:
 * - 親を選ぶと分類をその親の分類へ強制する（backend も create/move で親継承するため UI を先回りで合わせる）。
 * - 分類を手動で別の値に変えると、親との分類不一致になるため親選択をクリアする。
 * 2 つの effect は依存（parentTaskId / categoryId）が分かれており相互ループしない:
 * 親選択→分類セット→「親と一致」なのでクリア判定は発火せず、分類手動変更→親クリア→親空なので分類セットは発火しない。
 */
export function DeskParentField({
  register,
  watch,
  setValue,
  parentTasks,
  error,
}: DeskParentFieldProps) {
  const parentTaskId = watch('parentTaskId');
  const categoryId = watch('categoryId');
  // 候補を id→option の Map に。render 本体での ref 書き換えを避け useMemo で導出する
  // （parentTasks 変化時のみ再構築。effect は最後に走った render の closure で参照する）。
  const byId = useMemo(() => new Map(parentTasks.map((t) => [String(t.id), t])), [parentTasks]);

  // dsk-0229: linkage はユーザーが実際に親/分類を変えた時だけ発火させる。マウント時や parentTasks の
  // 非同期ロードによる effect 再実行で「保存値どうしの不整合（子の分類≠親の分類）」を自動補正すると、
  // 未編集なのに setValue(shouldDirty) が走り phantom dirty になる（閉じる際に破棄確認が誤発火する）。
  // ref を現在値で初期化し、監視値が前回から変化した時のみ処理する（初回・byId 遅延ロードはスキップ）。
  const prevParentRef = useRef(parentTaskId);
  const prevCategoryRef = useRef(categoryId);

  // 親選択 → 分類を親に強制。親が未分類（categoryId=null）なら空文字（フォームの「未分類」）に合わせる。
  useEffect(() => {
    const parentChanged = prevParentRef.current !== parentTaskId;
    prevParentRef.current = parentTaskId;
    if (!parentChanged) return; // マウント / byId 遅延ロード（親選択は不変）はスキップ
    if (!parentTaskId) return;
    const parent = byId.get(parentTaskId);
    const parentCat = parent ? categoryIdToFormValue(parent.categoryId) : null;
    if (parent && parentCat !== watch('categoryId')) {
      setValue('categoryId', parentCat ?? '', { shouldDirty: true });
    }
    // categoryId は意図的に依存から外す（親選択時のみ強制し、以降の分類編集は effect B に委ねる）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentTaskId, byId, setValue]);

  // 分類が親と不一致になったら親をクリア（= ユーザーが分類を手動変更）。
  useEffect(() => {
    const categoryChanged = prevCategoryRef.current !== categoryId;
    prevCategoryRef.current = categoryId;
    if (!categoryChanged) return; // マウント / byId 遅延ロード（分類は不変）はスキップ
    if (!parentTaskId) return;
    const parent = byId.get(parentTaskId);
    if (parent && categoryIdToFormValue(parent.categoryId) !== categoryId) {
      setValue('parentTaskId', '', { shouldDirty: true });
    }
    // parentTaskId は依存に入れない（親切替自体は effect A が処理）。categoryId 変化のみを契機にする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, byId, setValue]);

  // 入力された親チケットNo（= タスク id 文字列）に一致する親候補。一致時のみ枠外へ題名ラベルを出す。
  const parentMatch = parentTaskId ? byId.get(parentTaskId) : undefined;

  return (
    <div className="desk-detail-info-field">
      <label className="desk-detail-info-label" htmlFor="dtf-parent">
        親タスク
      </label>
      {/* 親タスクは select ではなくチケットNo の手入力にする（rete-desk-0179・開発統括指示）。
          No を入れると枠外に題名ラベルを出す。ラベルは枠幅で切り、ホバー（title 属性）で全文表示する。
          空 = 親なし（トップレベル）。分類連動 effect は parentTaskId を読むため挙動は select 時と不変。 */}
      <div className="desk-parent-no-row">
        <input
          id="dtf-parent"
          type="text"
          inputMode="numeric"
          className="desk-parent-no-input"
          aria-label="親タスクのチケットNo"
          // フォーカス時にブラウザの過去入力候補（ネイティブ autocomplete）を出さない。
          // 親No は毎回違う番号を打つのが通常で、同じ番号の再入力は稀（rete-desk-0208・開発統括指示）。
          autoComplete="off"
          {...register('parentTaskId')}
        />
        {parentMatch ? (
          <span className="desk-parent-no-title" title={parentMatch.title}>
            {parentMatch.title}
          </span>
        ) : parentTaskId ? (
          <span className="desk-parent-no-title is-unmatched">該当なし</span>
        ) : null}
      </div>
      {/* dsk-0239: 該当なしのまま更新を試みた時の submit 前バリデーションエラー。「該当なし」ラベルは
          常時の live ヒント、こちらは更新を弾いた理由を明示する。 */}
      {error && <p className="mt-1 text-xs text-[var(--sp-accent-red)]">{error}</p>}
    </div>
  );
}
