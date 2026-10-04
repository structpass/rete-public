import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus } from '@rete/shared';

// apiClient（axios インスタンス）をモック化して、API 関数が正しい path で投げるか検証する。
// CRUD 実行（一覧 / 作成 / 更新 / 削除）は use-crud-api 経由に一元化したため、ここでは
// 変換関数（toTaskPayload / taskToFormValues）と全件取得（fetchCategories）のみを検証する。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
  },
}));

import { fetchCategories, toTaskPayload, taskToFormValues, type Task } from '../lib/api';
import type { TaskFormData } from '../lib/validations';

const form: TaskFormData = {
  title: '件名',
  description: '本文',
  status: TaskStatus.IN_PROGRESS,
  categoryId: '3',
  assigneeId: '11111111-1111-1111-1111-111111111111',
  assigneeName: 'admin',
  startDate: '2026-05-01',
  dueDate: '2026-05-10',
};

const task: Task = {
  id: 42,
  title: '件名',
  description: '本文',
  status: TaskStatus.IN_PROGRESS,
  tenmatsu: null,
  categoryId: 3,
  parentTaskId: null,
  sortOrder: 0,
  sourceThemeId: null,
  sourceTheme: null,
  assignee: null,
  ownerId: null,
  owner: null,
  assigneeName: 'admin',
  startDate: '2026-05-01T00:00:00.000Z',
  dueDate: '2026-05-10T00:00:00.000Z',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  hasMentionToMe: false,
  reactions: [],
};

beforeEach(() => {
  get.mockReset();
});

describe('toTaskPayload', () => {
  it('categoryId を number に、日付を UTC 0 時固定の ISO に変換すること', () => {
    const payload = toTaskPayload(form);
    expect(payload.categoryId).toBe(3);
    expect(payload.status).toBe(TaskStatus.IN_PROGRESS);
    // TZ 非依存で UTC midnight に固定される（ローカル TZ でも日付がずれない）。
    expect(payload.startDate).toBe('2026-05-01T00:00:00.000Z');
    expect(payload.dueDate).toBe('2026-05-10T00:00:00.000Z');
  });

  it('assigneeId を送ること（選択時は UUID、未選択は null で割当解除）', () => {
    expect(toTaskPayload(form).assigneeId).toBe('11111111-1111-1111-1111-111111111111');
    // 空文字（未選択）は null を送って backend で disconnect させる。
    expect(toTaskPayload({ ...form, assigneeId: '' }).assigneeId).toBeNull();
  });

  it('空文字フィールドは undefined に畳むこと', () => {
    const payload = toTaskPayload({
      ...form,
      description: '',
      startDate: '',
      dueDate: '',
    });
    expect(payload.description).toBeUndefined();
    expect(payload.startDate).toBeUndefined();
    expect(payload.dueDate).toBeUndefined();
  });
});

describe('taskToFormValues', () => {
  it('Task を編集フォーム初期値に変換すること（日付は YYYY-MM-DD、null は空文字）', () => {
    const values = taskToFormValues({ ...task, assigneeName: null, dueDate: null });
    expect(values.categoryId).toBe('3');
    expect(values.startDate).toBe('2026-05-01');
    expect(values.dueDate).toBe('');
    expect(values.assigneeName).toBe('');
  });
});

describe('toTaskPayload (categoryId 任意化 / rete-desk-0158)', () => {
  it('分類未選択（空文字）は categoryId: null を送ること', () => {
    expect(toTaskPayload({ ...form, categoryId: '' }).categoryId).toBeNull();
  });
});

describe('taskToFormValues (categoryId 任意化 / rete-desk-0158)', () => {
  it('未分類（categoryId=null）は空文字へ変換すること', () => {
    expect(taskToFormValues({ ...task, categoryId: null }).categoryId).toBe('');
  });
});

const SPACE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('fetchCategories', () => {
  it('spaceId を必須 query として GET し配列を返すこと（既定はアーカイブ済除外 / rete-desk-0158）', async () => {
    get.mockResolvedValue({
      data: { success: true, data: [{ id: 1, name: '入荷', sortOrder: 0, spaceId: SPACE_ID }] },
    });
    const cats = await fetchCategories(SPACE_ID);
    expect(get).toHaveBeenCalledWith('/categories', { params: { spaceId: SPACE_ID } });
    expect(cats[0].name).toBe('入荷');
  });

  it('includeArchived=true を spaceId と併せて query へ載せること（分類マスタ管理 / rete-desk-0140・0158）', async () => {
    get.mockResolvedValue({ data: { success: true, data: [] } });
    await fetchCategories(SPACE_ID, true);
    expect(get).toHaveBeenCalledWith('/categories', {
      params: { spaceId: SPACE_ID, includeArchived: true },
    });
  });
});
