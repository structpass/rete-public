import apiClient from '@/lib/api-client';
import type {
  AccountSummaryDto,
  CategoryDto,
  TaskAssigneeDto,
  TaskResponseDto,
  TaskSourceThemeDto,
} from '@rete/shared';
import type { TaskFormData } from './validations';

/**
 * タスクの応答形。形の正本は @rete/shared の `types/task`（v2-245 で集約）で、本名は画面側の
 * 既存参照を保つための別名。フィールドの有無・必須/任意は backend の契約と 1 対 1 に揃う
 * （backend は null 許容フィールドも必ずキーを返す）。
 */
export type TaskSourceTheme = TaskSourceThemeDto;
export type TaskAssignee = TaskAssigneeDto;
export type Task = TaskResponseDto;

/**
 * カテゴリ Response 形は `@rete/shared` の CategoryDto を SSOT とする（§5 shared 型整合）。
 * 下流（use-categories / desk / フォーム）は引き続き `Category` 名で参照するためエイリアスで再 export する。
 * archived は backend が archivedAt 非 null を畳んだ導出フラグ（rete-desk-0140）。
 * 既定の一覧取得はアーカイブ済を含まないため通常 false。includeArchived=true でのみ混在する。
 */
export type Category = CategoryDto;

/** 担当者候補（形の正本は shared の AccountSummaryDto・id + 表示名のみ）。 */
export type Account = AccountSummaryDto;

export const CATEGORIES_PATH = '/categories';
export const ACCOUNTS_PATH = '/accounts';

/**
 * `YYYY-MM-DD`（date input）→ ISO 8601（UTC 0 時固定）。空文字 / 未入力は undefined。
 *
 * `new Date('YYYY-MM-DD')` だけだと実行環境の TZ 解釈に依存し、toISOString() で日付が
 * 前後する（JST ブラウザだと 1 日ずれる）。明示的に UTC midnight を組み立てて TZ 非依存にする。
 */
function toIso(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * フォーム値 → backend Create/Update payload。空文字は undefined に畳んで送らない。
 * parentTaskId は含めない: 既存タスクの親付け替えは move endpoint（sortOrder / 循環 / カテゴリ波及を
 * 一元処理）に流すため、update payload には載せない。新規作成時の親は toCreatePayload を使う。
 */
export function toTaskPayload(form: TaskFormData): Record<string, unknown> {
  return {
    title: form.title,
    description: form.description ? form.description : undefined,
    status: form.status,
    // 分類は任意（rete-desk-0158）。未選択（空文字）は null を送って未分類化する。
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    // 担当 Account: 選択時は UUID、未選択（空文字）は null を送って割当解除する（backend disconnect）。
    assigneeId: form.assigneeId ? form.assigneeId : null,
    startDate: toIso(form.startDate || undefined),
    dueDate: toIso(form.dueDate || undefined),
  };
}

/**
 * 新規作成 payload。toTaskPayload に親タスク（parentTaskId）と所属チャネル（spaceId）を加える。
 * create POST は backend が親の存在検証 + categoryId の親継承 + sortOrder 解決を一括で行うため、
 * 親選択時はそのまま parentTaskId を送ってよい（move を経由する必要があるのは既存タスクの付け替えのみ）。
 *
 * spaceId は現在 Desk で選択中のチャネル（rete-desk-0187）。未指定（チャネル未選択 = 全件表示）時は
 * 送らず backend のデフォルトチャネルに委ねる。指定時は新規タスクが当該チャネル配下に作られる。
 */
export function toCreatePayload(form: TaskFormData, spaceId?: string): Record<string, unknown> {
  const parentTaskId = form.parentTaskId ? Number(form.parentTaskId) : undefined;
  return { ...toTaskPayload(form), parentTaskId, spaceId: spaceId || undefined };
}

/** backend Task → フォーム初期値（date は YYYY-MM-DD に丸め、null は空文字へ）。 */
export function taskToFormValues(task: Task): TaskFormData {
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    // 未分類（null）は空文字（select の「未分類」選択肢）へ。
    categoryId: task.categoryId != null ? String(task.categoryId) : '',
    parentTaskId: task.parentTaskId != null ? String(task.parentTaskId) : '',
    // 担当 Account（FK）。未割当は空文字。旧 assigneeName は移行期温存だが UI 選択は本フィールドで行う。
    assigneeId: task.assignee?.id ?? '',
    assigneeName: task.assigneeName ?? '',
    startDate: task.startDate ? task.startDate.slice(0, 10) : '',
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
  };
}

/** 親タスク picker の候補 1 件（select option 用）。categoryId は分類強制（rete-desk-0072）に使う。 */
export interface ParentTaskOption {
  id: number;
  title: string;
  // 親の分類（rete-desk-0158 で nullable 化）。null = 未分類。
  categoryId: number | null;
}

/**
 * 機能領域分類の全件取得（select / フィルタ・グルーピング名解決用）。
 * ページング不要の全件取得なので、一覧 CRUD の use-crud-api（meta 前提）ではなく
 * この軽量 fetch を使う。タスクの CRUD 実行（一覧 / 作成 / 更新 / 削除）は
 * use-crud-api に一元化しているため、ここには置かない（経路二重化の回避）。
 */
export async function fetchCategories(
  spaceId: string,
  includeArchived = false,
): Promise<Category[]> {
  const res = await apiClient.get<{ success: true; data: Category[] }>(CATEGORIES_PATH, {
    // spaceId は必須（チャネル単位スコープ / rete-desk-0158）。includeArchived は分類マスタ管理画面専用（rete-desk-0140）。
    params: includeArchived ? { spaceId, includeArchived: true } : { spaceId },
  });
  return res.data.data;
}

/** 分類マスタの作成（POST /categories / rete-desk-0140）。spaceId 必須（チャネル単位 / rete-desk-0158）。 */
export async function createCategory(spaceId: string, name: string): Promise<Category> {
  const res = await apiClient.post<{ success: true; data: Category }>(CATEGORIES_PATH, {
    name,
    spaceId,
  });
  return res.data.data;
}

/** 分類マスタの部分更新（名称 / アーカイブ切替 / PATCH /categories/:id / rete-desk-0140）。 */
export async function updateCategory(
  id: number,
  patch: { name?: string; archived?: boolean },
): Promise<Category> {
  const res = await apiClient.patch<{ success: true; data: Category }>(
    `${CATEGORIES_PATH}/${id}`,
    patch,
  );
  return res.data.data;
}

/** 分類マスタの削除（DELETE /categories/:id）。紐づくタスクがあると 409（アーカイブを案内）。 */
export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`${CATEGORIES_PATH}/${id}`);
}

/**
 * 分類マスタの並び替え（PATCH /categories/reorder / rete-desk-0197・0199）。
 * orderedIds は当該 Space の全カテゴリ id を表示順に並べた完全列。backend が当該 Space の
 * id 集合との完全一致を検証し（IDOR / 不整合拒否）、index 順に sortOrder = index + 1 を一括設定する。
 */
export async function reorderCategories(spaceId: string, orderedIds: number[]): Promise<void> {
  await apiClient.patch(`${CATEGORIES_PATH}/reorder`, { spaceId, orderedIds });
}

/**
 * 担当者候補（有効アカウント）の全件取得（担当者 select 用）。
 * fetchCategories と同じ軽量全件取得パターン。レスポンスは id + 表示名のみ（backend が機密列を遮断）。
 */
export async function fetchAccounts(): Promise<Account[]> {
  const res = await apiClient.get<{ success: true; data: Account[] }>(ACCOUNTS_PATH);
  return res.data.data;
}

/**
 * 担当者候補を Space（チャネル）メンバーに絞った取得（dsk-0211 criteria 1）。
 * 当該 Space の属する project のメンバーのみを返す。space が project 未紐付け（移行期の名残）の場合は
 * backend が全有効アカウントへフォールバックする（候補ゼロで担当者を選べない詰みを避ける保険）。
 */
export async function fetchAccountsBySpace(spaceId: string): Promise<Account[]> {
  const res = await apiClient.get<{ success: true; data: Account[] }>(`${ACCOUNTS_PATH}/by-space`, {
    params: { spaceId },
  });
  return res.data.data;
}
