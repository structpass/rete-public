import type { Task, Category } from '@prisma/client';
import type { TaskStatus } from '@rete/shared';
import type { TaskResponseDto, TaskSourceThemeDto, TaskAssigneeDto } from './dto/task-response.dto';
import type {
  TaskTreeResponseDto,
  TaskTreeNodeDto,
  TaskTreeCategoryDto,
} from './dto/task-tree-response.dto';
import { aggregateReactions } from '../chat/chat.mapper';
import type { TaskWithCategory } from './repositories/tasks.repository';

// リアクションは集計に使う emoji / authorId のみ（chat.mapper.aggregateReactions が消費・dsk-0297）。
type ReactionPick = { emoji: string; authorId: string };

/**
 * mapper 入力型: Task Entity に sourceTheme relation（id+title select、未読込/未昇格は null）を
 * 任意で添えたもの。findById / findAllForTree が include した形に対応する。relation 未指定の
 * 素の Task（更新直後など）も受け付け、その場合 sourceTheme は null として扱う。
 * reactions は起点カードへのリアクション同梱経路（findById）のみ持つ（dsk-0297・他経路は未指定→空配列）。
 */
export type TaskWithSourceTheme = Task & {
  sourceTheme?: TaskSourceThemeDto | null;
  assignee?: TaskAssigneeDto | null;
  owner?: TaskAssigneeDto | null;
  reactions?: ReactionPick[];
};

/** Date を ISO 8601 文字列へ。null はそのまま透過する。 */
function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Task Entity → TaskResponseDto（§1 DTO 境界）。
 * Date 系は ISO 文字列化、enum はそのまま、null 許容フィールドは null を保持する。
 *
 * status: Prisma 生成の `$Enums.TaskStatus`（string literal union）と shared の
 * `enum TaskStatus` は値が完全一致するが TS 上は別の nominal 型になる。両者を橋渡しする
 * 唯一の境界が本 mapper なので、ここで shared enum へ明示変換する（値の同一性は
 * schema.prisma と shared/task.ts の SSOT 一致で担保）。
 *
 * sourceTheme: relation が include されていればその id+title を、無ければ null を返す
 * （リンク表示用サマリ。本文・個人情報は載せない）。
 */
export function toTaskResponse(
  entity: TaskWithSourceTheme,
  // 「このタスクに自分宛メンション（説明/顛末 または配下コメント）があるか」。repository が一覧ページ
  // 全体（findOne は単体）に対し定数クエリで判定した結果を受け取る（N+1 回避 / dsk-0203・
  // chat.mapper の hasMentionToMe と同方針）。未集約の経路（tree / create / update / move）では false。
  hasMentionToMe = false,
  // reactedByMe 判定用の呼び出し元 accountId（dsk-0297・chat.mapper と同方針）。findOne 呼び出しのみ
  // 実値を渡す。entity.reactions が未指定（tree / create / update / move）の経路は集計結果が空配列になる。
  currentUserId?: string,
): TaskResponseDto {
  return {
    id: entity.id,
    title: entity.title,
    description: entity.description,
    status: entity.status as TaskStatus,
    tenmatsu: entity.tenmatsu,
    categoryId: entity.categoryId,
    parentTaskId: entity.parentTaskId,
    sortOrder: entity.sortOrder,
    // HIGH-2: §1 DTO 境界 — ownerId を明示マップ（脱落防止）。
    ownerId: entity.ownerId,
    // 作成者サマリ（owner relation が include されていれば id+name、無ければ null）。担当者と独立に持つ
    // ことで履歴の「作成」行 actor を担当者変更から切り離す（dsk-0235）。
    owner: entity.owner ?? null,
    sourceThemeId: entity.sourceThemeId,
    // Repository includes spaceId only for reader-specific visibility filtering; never expose it in the DTO.
    sourceTheme: entity.sourceTheme
      ? { id: entity.sourceTheme.id, title: entity.sourceTheme.title }
      : null,
    assignee: entity.assignee ?? null,
    assigneeName: entity.assigneeName,
    startDate: toIso(entity.startDate),
    dueDate: toIso(entity.dueDate),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    hasMentionToMe,
    // emoji 別に集計したリアクション（chat.mapper の共有関数を再利用・§3 コピペ禁止・dsk-0297）。
    reactions: aggregateReactions(entity.reactions, currentUserId),
  };
}

/**
 * category relation 付き Task の平坦配列 → カテゴリ別ネストツリー（§1 DTO 境界）。
 * 純粋関数（DB に触れない）。Repository が取得した Entity をここで DTO 化・ツリー化する。
 *
 * - 2 パス: 先に全ノードを生成し、次に parentTaskId で子を親の children に接続する。
 * - トップレベル（親なし、または親が集合外＝防御的）は所属カテゴリのグループへ束ねる。
 *   categoryId=null（未分類 / rete-desk-0158）のトップレベルは「未分類」バケットへ集約する。
 * - 子ノードは親に従って構造化し、子自身の categoryId はグルーピングに用いない。
 * - カテゴリ順・兄弟順は入力配列の順序を保持する（呼び出し側で sortOrder→id 昇順整列済の前提）。
 *   未分類バケットは encounter 順で末尾に並ぶ（findAllForTree が category.sortOrder ASC NULLS LAST で
 *   null カテゴリのタスクを末尾に出すため自然）。
 */
export function toTaskTreeResponse(tasks: TaskWithCategory[]): TaskTreeResponseDto {
  // id → ノード（children 空で初期化）。toTaskResponse で Date/enum を DTO 化する。
  const nodeById = new Map<number, TaskTreeNodeDto>();
  for (const task of tasks) {
    nodeById.set(task.id, { ...toTaskResponse(task), children: [] });
  }

  // カテゴリは登場順を保持しつつ束ねる（id=number のキー）。未分類は id=null で別管理。
  const categoryOrder: number[] = [];
  const categoryById = new Map<number, TaskTreeCategoryDto>();
  const ensureCategory = (category: Category): TaskTreeCategoryDto => {
    let entry = categoryById.get(category.id);
    if (!entry) {
      entry = { id: category.id, name: category.name, sortOrder: category.sortOrder, tasks: [] };
      categoryById.set(category.id, entry);
      categoryOrder.push(category.id);
    }
    return entry;
  };

  // 未分類バケット（categoryId=null）。最初に未分類タスクが現れた時のみ生成し、末尾に並べる。
  let uncategorized: TaskTreeCategoryDto | null = null;
  const ensureUncategorized = (): TaskTreeCategoryDto => {
    if (!uncategorized) {
      // 見出しは「（未分類）」表記でフォーム select の（未分類）選択肢と揃える（rete-desk-0186）。
      uncategorized = {
        id: null,
        name: '（未分類）',
        sortOrder: Number.MAX_SAFE_INTEGER,
        tasks: [],
      };
    }
    return uncategorized;
  };

  for (const task of tasks) {
    const node = nodeById.get(task.id)!;
    const parent = task.parentTaskId != null ? nodeById.get(task.parentTaskId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else if (task.category != null) {
      ensureCategory(task.category).tasks.push(node);
    } else {
      ensureUncategorized().tasks.push(node);
    }
  }

  const categories: TaskTreeCategoryDto[] = categoryOrder.map((id) => categoryById.get(id)!);
  if (uncategorized) categories.push(uncategorized);
  return { categories };
}
