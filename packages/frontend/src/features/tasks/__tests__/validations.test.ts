import { describe, it, expect } from 'vitest';
import { TaskStatus } from '@rete/shared';
import { taskFormSchema, isUnmatchedParentTaskId } from '../lib/validations';

const valid = {
  title: '在庫アラート閾値の見直し',
  description: '説明',
  status: TaskStatus.IN_PROGRESS,
  categoryId: '1',
  assigneeName: 'admin',
  startDate: '2026-05-01',
  dueDate: '2026-05-10',
};

describe('taskFormSchema', () => {
  it('正常値を通すこと', () => {
    const result = taskFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('title が空なら失敗すること', () => {
    const result = taskFormSchema.safeParse({ ...valid, title: '' });
    expect(result.success).toBe(false);
  });

  it('title が 500 文字超なら失敗すること', () => {
    const result = taskFormSchema.safeParse({ ...valid, title: 'あ'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('categoryId 未選択（空文字）= 未分類で許容すること（rete-desk-0158 で任意化）', () => {
    const result = taskFormSchema.safeParse({ ...valid, categoryId: '' });
    expect(result.success).toBe(true);
  });

  it('未知の status を弾くこと', () => {
    const result = taskFormSchema.safeParse({ ...valid, status: 'NOPE' });
    expect(result.success).toBe(false);
  });

  it('description / assigneeName / 日付は省略可能なこと', () => {
    const result = taskFormSchema.safeParse({
      title: 't',
      status: TaskStatus.TODO,
      categoryId: '2',
    });
    expect(result.success).toBe(true);
  });

  it('期日が開始日より前なら失敗すること', () => {
    const result = taskFormSchema.safeParse({
      ...valid,
      startDate: '2026-05-10',
      dueDate: '2026-05-01',
    });
    expect(result.success).toBe(false);
  });

  it('片方の日付のみなら通すこと', () => {
    const result = taskFormSchema.safeParse({ ...valid, startDate: '', dueDate: '2026-05-01' });
    expect(result.success).toBe(true);
  });

  it('日付が YYYY-MM-DD 形式でないなら失敗すること', () => {
    const bad = taskFormSchema.safeParse({ ...valid, startDate: '2026/05/01' });
    expect(bad.success).toBe(false);
  });
});

// 同一ソース（lib/validations）のテストとして本ファイルへ集約（cmn-0162・flat 配置へ統一）。
describe('isUnmatchedParentTaskId（dsk-0239 親コード該当なし判定）', () => {
  const parents = [{ id: 10 }, { id: 20 }];

  it('空文字（親なし＝トップレベル）は該当なしではない（false）', () => {
    expect(isUnmatchedParentTaskId('', parents)).toBe(false);
    expect(isUnmatchedParentTaskId(undefined, parents)).toBe(false);
  });

  it('候補に存在する No は該当あり（false）', () => {
    expect(isUnmatchedParentTaskId('10', parents)).toBe(false);
    expect(isUnmatchedParentTaskId('20', parents)).toBe(false);
  });

  it('候補に存在しない No は該当なし（true）', () => {
    expect(isUnmatchedParentTaskId('999', parents)).toBe(true);
    expect(isUnmatchedParentTaskId('1', parents)).toBe(true); // 部分一致でなく完全一致
  });

  it('候補が空でも No 入力があれば該当なし（true）', () => {
    expect(isUnmatchedParentTaskId('10', [])).toBe(true);
  });
});
