'use client';

import { useCallback, useEffect } from 'react';
import { useTaskForm } from '@/features/tasks/hooks/use-task-form';
import type { Account, Category, ParentTaskOption } from '@/features/tasks/lib/api';
import type { TaskFormData } from '@/features/tasks/lib/validations';
import { DeskTaskFields } from './desk-task-fields';
import { validateParentMatch } from './desk-parent-field';

export type DeskTaskFormMode = 'create' | 'edit';

interface DeskTaskFormProps {
  categories: Category[];
  /**
   * 親タスク picker（rete-desk-0068/0071/0072）の候補。指定時のみ picker を描画する。
   * 候補は呼び出し側で自身＋子孫を除外済み（編集時の循環防止）のものを渡す。
   */
  parentTasks?: ParentTaskOption[];
  /** 担当者候補（rete-desk-0062）。指定時は担当者を Account select として描画する。 */
  accounts?: Account[];
  defaultValues?: Partial<TaskFormData>;
  onSubmit: (data: TaskFormData) => Promise<void>;
  mode: DeskTaskFormMode;
  loading?: boolean;
  onCancel?: () => void;
  /** form 要素の id。外部の送信ボタン（`<button form={id}>`）から submit させる時に使う。 */
  id?: string;
  /**
   * タイトル / 説明フィールドを隠す（タスク詳細の二段組では題名・説明を左スレッド列の起点カードに置き、
   * 右情報列は属性のみ並べるため）。隠す場合も値は hidden input で register し続け、submit に含める。
   */
  hideTitleDescription?: boolean;
  /** フォーム末尾の操作ボタン行（キャンセル / 更新）を隠す。外部ヘッダの更新ボタンに委ねる時に使う。 */
  hideActions?: boolean;
  /** 編集中フラグの報告（C-編集・DBT-7 / 閉じ経路の破棄ガード用）。dirty 変化・アンマウントで通知。 */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * 送信前ガード（C-顛末 / 完了ゲート）。false を返すと onSubmit も reset も実行せず、dirty を維持したまま
   * 送信を中断する（フォーム外の状態＝顛末を読んだ判定を呼び出し側に委ねるための拡張）。
   * 詳細面のみが渡し、新規登録 / 昇格は未指定で従来どおり常に送信する。
   */
  beforeSubmit?: (data: TaskFormData) => boolean | Promise<boolean>;
}

/**
 * Desk オーバーレイ（タスク詳細 / 昇格フォーム）の編集フォーム。
 * mock .desk-ticket-form 意匠（暖色・コンパクトな grid 密集 / native input・select・textarea）。
 * 状態ロジックは useTaskForm を共有し、単独タスクタブの汎用 TaskForm とはロジックのみ単一ソース化する
 * （見た目だけ surface ごとに分岐 / architecture-invariants §3）。
 */
export function DeskTaskForm({
  categories,
  parentTasks,
  accounts,
  defaultValues,
  onSubmit,
  mode,
  loading,
  onCancel,
  id,
  hideTitleDescription = false,
  hideActions = false,
  onDirtyChange,
  beforeSubmit,
}: DeskTaskFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isDirty },
  } = useTaskForm(defaultValues);

  // 編集状態を上位へ報告。アンマウント時は false に戻し、次回オープンへ持ち越さない。
  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  // 保存成功で baseline を更新（isDirty=false に戻す）。詳細は保存後も開いたままなので、
  // reset しないと「保存済みなのに ESC/閉じで破棄確認が出る」誤発火になる。失敗時は dirty 維持で再編集。
  const submit = useCallback(
    async (data: TaskFormData) => {
      // dsk-0239: 親コード該当なし（存在しない親 No）での保存を submit 前に弾く共有ガード。
      // この経路は本番では編集（タスク詳細）専用。新規登録は別シェル TaskCreateOverlay が同じ
      // validateParentMatch を呼ぶ（両 save 面で単一ソース。zodResolver 配下で field-level validate は無効）。
      if (!validateParentMatch(data.parentTaskId, parentTasks, setError, clearErrors)) return;
      // 完了ゲート等の送信前ガード。false なら保存も baseline 更新もせず dirty を維持して中断。
      if (beforeSubmit && !(await beforeSubmit(data))) return;
      await onSubmit(data);
      reset(data);
    },
    [parentTasks, setError, clearErrors, beforeSubmit, onSubmit, reset],
  );

  return (
    <form
      id={id}
      onSubmit={handleSubmit(submit)}
      onKeyDown={(e) =>
        e.key === 'Enter' && e.target instanceof HTMLInputElement && e.preventDefault()
      }
      className="desk-ticket-form"
      aria-label="タスクフォーム"
    >
      {hideTitleDescription ? (
        // 二段組タスク詳細: 題名・説明は左スレッド列の起点カードに置くため隠す。値は submit に残す。
        <>
          <input type="hidden" {...register('title')} />
          <input type="hidden" {...register('description')} />
        </>
      ) : (
        <>
          <div className="desk-ticket-field">
            <label className="desk-ticket-label" htmlFor="dtf-title">
              タイトル
            </label>
            <div>
              <input id="dtf-title" className="desk-ticket-input" {...register('title')} />
              {errors.title && (
                <p className="mt-1 text-xs text-[var(--sp-accent-red)]">{errors.title.message}</p>
              )}
            </div>
          </div>

          <div className="desk-ticket-field">
            <label className="desk-ticket-label" htmlFor="dtf-desc">
              説明
            </label>
            <div>
              <textarea
                id="dtf-desc"
                className="desk-ticket-textarea"
                {...register('description')}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-[var(--sp-accent-red)]">
                  {errors.description.message}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* タスク詳細 編集の右情報列。属性フィールドは新規登録モード（TaskCreateOverlay）と
          共有の DeskTaskFields に集約（architecture-invariants §3 コピペ回避）。編集なので required なし。 */}
      <DeskTaskFields
        control={control}
        register={register}
        errors={errors}
        categories={categories}
        parentTasks={parentTasks}
        watch={parentTasks ? watch : undefined}
        setValue={parentTasks ? setValue : undefined}
        accounts={accounts}
      />

      {!hideActions && (
        <div className="desk-ticket-actions">
          {onCancel && (
            // dsk-0412: キャンセルは背景なし（ghost）が正本（mdl-0035）。旧 -cancel（灰塗り）は廃止。
            <button
              type="button"
              className="desk-ticket-btn desk-ticket-btn-ghost"
              onClick={onCancel}
            >
              キャンセル
            </button>
          )}
          <button
            type="submit"
            className="desk-ticket-btn desk-ticket-btn-save"
            disabled={loading || (mode === 'edit' && !isDirty)}
            aria-busy={loading}
          >
            保存
          </button>
        </div>
      )}
    </form>
  );
}
