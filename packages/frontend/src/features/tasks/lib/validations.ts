import { z } from 'zod';
import { TaskStatus } from '@rete/shared';

/**
 * タスク作成 / 編集フォームのバリデーションスキーマ。
 * backend の CreateTaskDto / UpdateTaskDto の制約（title<=500, description<=5000,
 * assigneeName<=100, categoryId>0, status enum）に合わせる。
 *
 * 日付は `<input type="date">` の `YYYY-MM-DD` 文字列を扱う。送信時に API 層で
 * ISO 8601 へ正規化する。空文字は「未入力」として扱う。
 */
export const taskFormSchema = z
  .object({
    title: z
      .string()
      .min(1, 'タイトルは必須です')
      .max(500, 'タイトルは500文字以内で入力してください'),
    description: z
      .string()
      .max(5000, '説明は5000文字以内で入力してください')
      .optional()
      .or(z.literal('')),
    status: z.nativeEnum(TaskStatus),
    // 分類は任意（rete-desk-0158）。select の value は文字列で、空文字 = 未分類。
    categoryId: z.string().optional().or(z.literal('')),
    // 親タスク ID（select の value は文字列。空文字 = 親なし＝トップレベル）。任意。
    parentTaskId: z.string().optional().or(z.literal('')),
    // 担当 Account ID（select の value は UUID 文字列。空文字 = 未割当）。任意。
    assigneeId: z.string().optional().or(z.literal('')),
    // 旧フリーテキスト担当者名（移行期温存。UI には出さないがフォーム状態として保持）。
    assigneeName: z
      .string()
      .max(100, '担当者名は100文字以内で入力してください')
      .optional()
      .or(z.literal('')),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください')
      .optional()
      .or(z.literal('')),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください')
      .optional()
      .or(z.literal('')),
  })
  .refine(
    (v) => {
      if (!v.startDate || !v.dueDate) return true;
      return v.startDate <= v.dueDate;
    },
    { message: '期日は開始日以降にしてください', path: ['dueDate'] },
  );

export type TaskFormData = z.infer<typeof taskFormSchema>;

/**
 * 親タスク入力（チケットNo 文字列）が候補に存在しない「該当なし」かを判定する（dsk-0239）。
 * 親タスクは自由入力（DeskParentField）のため、submit 前にこの判定で「存在しない親 No」での保存を弾く。
 * 空文字（親なし＝トップレベル）は不正でないため false。候補は構造型のみ要求し import 結合を避ける。
 */
export function isUnmatchedParentTaskId(
  parentTaskId: string | undefined,
  parentTasks: ReadonlyArray<{ id: number }>,
): boolean {
  if (!parentTaskId) return false;
  return !parentTasks.some((t) => String(t.id) === parentTaskId);
}
