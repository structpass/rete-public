/**
 * タスクのステータス。desk spec の 未着手 / 対応中 / レビュー / 完了 に対応。
 * Prisma の `enum TaskStatus`（schema.prisma）と値を完全一致させる SSOT。
 * backend の DTO / バリデーションが本 enum を import して使う。
 */
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
}

/**
 * タスク（tasks モジュール）の応答形の SSOT（v2-245 で集約）。
 * backend の task-response.dto.ts / task-tree-response.dto.ts と frontend tasks / desk のローカル型が
 * 同形を別々に宣言していたため、形の正本をここへ一本化した
 * （backend の dto は再公開のみ・frontend は本型を参照する）。
 */
import type { ReactionSummary } from './chat';

/** 昇格元テーマの表示用サマリ（id + title のみ。本文・個人情報は載せない）。 */
export interface TaskSourceThemeDto {
  id: string;
  title: string;
}

/** 担当者の表示用サマリ（id + 表示名のみ。email / role 等の機密列は載せない）。 */
export interface TaskAssigneeDto {
  id: string;
  name: string;
}

/**
 * Task の Response DTO（§1 DTO 境界）。
 * Prisma Entity を直返しせず、本 DTO を経由する。
 * Date 系フィールド（startDate / dueDate / createdAt / updatedAt）は
 * mapper で ISO 8601 文字列に変換する。null 許容フィールドは null をそのまま保持する。
 */
export interface TaskResponseDto {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  /** 顛末（結論・決定事項）。status=DONE では必須（完了ゲート）。未記録は null。 */
  tenmatsu: string | null;
  /** 所属分類 ID。null = 未分類（rete-desk-0158）。 */
  categoryId: number | null;
  parentTaskId: number | null;
  /** 同一兄弟グループ内の表示順（チャット→タスク昇格の精密挿入で永続化）。 */
  sortOrder: number;
  /** 作成者（所有者）Account の id（H4 RBAC enforcement 用。既存行は null）。 */
  ownerId: string | null;
  /**
   * 作成者（所有者）Account の表示用サマリ（id+name のみ・履歴の「作成」行 actor 用。未所有/失効は null）。
   * assignee と独立: 担当者を変更しても作成者表示は不変（dsk-0235・created_by は更新系で書き換えない）。
   */
  owner: TaskAssigneeDto | null;
  /** 昇格元 ChatTheme の id（昇格由来でないタスクは null）。 */
  sourceThemeId: string | null;
  /** 昇格元テーマの表示用サマリ（リンク表示用、未昇格は null）。 */
  sourceTheme: TaskSourceThemeDto | null;
  /** 担当 Account の表示用サマリ（FK 化後の正本、未割当は null）。 */
  assignee: TaskAssigneeDto | null;
  /** 旧フリーテキスト担当者名（移行期温存。表示は assignee?.name ?? assigneeName のフォールバック）。 */
  assigneeName: string | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * 自分宛メンション（説明/顛末 または配下コメントに自分宛メンションを含む）を 1 件以上含むタスクか
   * （dsk-0203・ChatThemeSummaryDto.hasMentionToMe のタスク版）。一覧カードのメンションアイコン点灯に使う。
   * actor 依存のため backend が集約して boolean で公開する（未集約の経路は既定 false）。
   */
  hasMentionToMe: boolean;
  /**
   * 起点カード（タスク本体）への emoji 別集計リアクション（dsk-0297・ChatMessageResponseDto.reactions と
   * 対称・集計形は shared の ReactionSummary を再利用し複製しない・§3 コピペ禁止）。未集約の経路は空配列。
   */
  reactions: ReactionSummary[];
}

/**
 * ツリーのタスクノード（§1 DTO 境界）。TaskResponseDto に子配列を加えた再帰構造。
 * children は parentTaskId 解決で組み立てた直接の子ノード（兄弟順は取得時の昇順を保持）。
 */
export interface TaskTreeNodeDto extends TaskResponseDto {
  children: TaskTreeNodeDto[];
}

/**
 * カテゴリ単位のグループ（desk タスク明細のグループ見出しに対応）。
 * tasks はトップレベル（親なし、または親が集合外）のノードのみで、子は各ノードの children にネストする。
 */
export interface TaskTreeCategoryDto {
  /** 分類 ID。null = 未分類バケット（categoryId 未設定タスクの集約見出し / rete-desk-0158）。 */
  id: number | null;
  name: string;
  sortOrder: number;
  tasks: TaskTreeNodeDto[];
}

/** GET /tasks/tree のレスポンス本体。カテゴリ別にネストしたタスクツリー。 */
export interface TaskTreeResponseDto {
  categories: TaskTreeCategoryDto[];
}
