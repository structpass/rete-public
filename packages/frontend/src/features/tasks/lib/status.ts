import { TaskStatus } from '@rete/shared';
import type { BadgeProps } from '@/components/ui/badge';

/**
 * TaskStatus（@rete/shared が SSOT）→ 表示ラベル / バッジ variant のマップ。
 * ラベルは desk spec の 未着手 / 対応中 / レビュー / 完了 に対応する。
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: '未着手',
  [TaskStatus.IN_PROGRESS]: '対応中',
  [TaskStatus.IN_REVIEW]: 'レビュー',
  [TaskStatus.DONE]: '完了',
};

const TASK_STATUS_VARIANTS: Record<TaskStatus, NonNullable<BadgeProps['variant']>> = {
  [TaskStatus.TODO]: 'todo',
  [TaskStatus.IN_PROGRESS]: 'progress',
  [TaskStatus.IN_REVIEW]: 'review',
  [TaskStatus.DONE]: 'done',
};

/** 既知のステータスはラベルへ、未知の値はそのまま返す（防御的）。 */
export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status as TaskStatus] ?? status;
}

/** 既知のステータスはバッジ variant へ、未知の値は outline にフォールバック。 */
export function taskStatusVariant(status: string): NonNullable<BadgeProps['variant']> {
  return TASK_STATUS_VARIANTS[status as TaskStatus] ?? 'outline';
}

/** フォームの select / フィルタ用の選択肢（表示順は spec 準拠）。 */
export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: TaskStatus.TODO, label: TASK_STATUS_LABELS[TaskStatus.TODO] },
  { value: TaskStatus.IN_PROGRESS, label: TASK_STATUS_LABELS[TaskStatus.IN_PROGRESS] },
  { value: TaskStatus.IN_REVIEW, label: TASK_STATUS_LABELS[TaskStatus.IN_REVIEW] },
  { value: TaskStatus.DONE, label: TASK_STATUS_LABELS[TaskStatus.DONE] },
];
