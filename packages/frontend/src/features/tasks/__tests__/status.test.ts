import { describe, it, expect } from 'vitest';
import { TaskStatus } from '@rete/shared';
import { taskStatusLabel, taskStatusVariant, TASK_STATUS_OPTIONS } from '../lib/status';

describe('taskStatusLabel', () => {
  it('TaskStatus を日本語ラベルにマップすること', () => {
    expect(taskStatusLabel(TaskStatus.TODO)).toBe('未着手');
    expect(taskStatusLabel(TaskStatus.IN_PROGRESS)).toBe('対応中');
    expect(taskStatusLabel(TaskStatus.IN_REVIEW)).toBe('レビュー');
    expect(taskStatusLabel(TaskStatus.DONE)).toBe('完了');
  });

  it('未知の値はそのまま返すこと', () => {
    expect(taskStatusLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('taskStatusVariant', () => {
  it('各ステータスに対応するバッジ variant を返すこと', () => {
    expect(taskStatusVariant(TaskStatus.TODO)).toBe('todo');
    expect(taskStatusVariant(TaskStatus.DONE)).toBe('done');
  });

  it('未知の値は outline にフォールバックすること', () => {
    expect(taskStatusVariant('UNKNOWN')).toBe('outline');
  });
});

describe('TASK_STATUS_OPTIONS', () => {
  it('4 つの選択肢を spec 順で提供すること', () => {
    expect(TASK_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.IN_REVIEW,
      TaskStatus.DONE,
    ]);
  });
});
