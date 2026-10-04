import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TaskStatus } from '@rete/shared';
import { taskFormSchema, type TaskFormData } from '../lib/validations';

/**
 * タスク作成 / 編集フォームの状態ロジック（useForm + zod resolver + 既定値）。
 *
 * 単独タスクタブの汎用 TaskForm（shadcn 意匠）と Desk オーバーレイの DeskTaskForm
 * （mock .desk-ticket-* 意匠）が、見た目を分けつつ同一ロジックを共有するための単一ソース。
 * フォーム JSX の重複は許容するが、状態ロジックの重複は本 hook に集約する
 * （architecture-invariants §3: コピペ禁止 — ロジックは単一ソース）。
 */
export function useTaskForm(defaultValues?: Partial<TaskFormData>) {
  return useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: '',
      description: '',
      status: TaskStatus.TODO,
      categoryId: '',
      parentTaskId: '',
      assigneeId: '',
      assigneeName: '',
      startDate: '',
      dueDate: '',
      ...defaultValues,
    },
  });
}
