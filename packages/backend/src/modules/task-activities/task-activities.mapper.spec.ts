import { toTaskActivityResponse } from './task-activities.mapper';

// 固定日時で ISO 文字列変換を決定的に検証する。
const CREATED = new Date('2026-06-24T01:23:45.000Z');
const actor = { id: 'acc-1', name: '山田太郎' };

describe('task-activities.mapper', () => {
  const activity = {
    id: 'act-1',
    taskId: 42,
    actorAccountId: 'acc-1',
    field: 'status',
    fromLabel: '未着手',
    toLabel: '完了',
    createdAt: CREATED,
    actor,
  };

  it('主要フィールドと操作者(id+name)を DTO に写すこと', () => {
    const dto = toTaskActivityResponse(activity);
    expect(dto.id).toBe('act-1');
    expect(dto.taskId).toBe(42);
    expect(dto.field).toBe('status');
    expect(dto.fromLabel).toBe('未着手');
    expect(dto.toLabel).toBe('完了');
    expect(dto.actor).toEqual({ id: 'acc-1', name: '山田太郎' });
  });

  it('actor は id/name のみへ絞り、actorAccountId 等の生フィールドを露出しないこと（§1 DTO 境界）', () => {
    const dto = toTaskActivityResponse(activity);
    expect(Object.keys(dto.actor as object).sort()).toEqual(['id', 'name']);
  });

  it('actor が null（操作者削除後）の行は actor=null へ写すこと', () => {
    const dto = toTaskActivityResponse({ ...activity, actor: null, actorAccountId: null });
    expect(dto.actor).toBeNull();
  });

  it('fromLabel / toLabel が null（未設定）でもそのまま写すこと', () => {
    const dto = toTaskActivityResponse({ ...activity, fromLabel: null, toLabel: null });
    expect(dto.fromLabel).toBeNull();
    expect(dto.toLabel).toBeNull();
  });

  it('createdAt を ISO 8601 文字列へ変換すること', () => {
    const dto = toTaskActivityResponse(activity);
    expect(dto.createdAt).toBe('2026-06-24T01:23:45.000Z');
    expect(typeof dto.createdAt).toBe('string');
  });

  it('DTO は許可されたキーのみを持つこと（Entity 直返しでない）', () => {
    const dto = toTaskActivityResponse(activity);
    expect(Object.keys(dto).sort()).toEqual([
      'actor',
      'createdAt',
      'field',
      'fromLabel',
      'id',
      'taskId',
      'toLabel',
    ]);
  });
});
