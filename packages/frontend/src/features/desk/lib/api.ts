import apiClient from '@/lib/api-client';
import {
  type ApiResponse,
  type PaginatedResponse,
  TaskStatus,
  ChatThemeStatus,
  type ReactionSummary,
  type ReactionEmoji,
  type ReactionToggleResponseDto,
  type OrganizationDto,
  type ProjectDto,
  type SpaceDto,
  type CreateSpaceInput,
  type UpdateSpaceInput,
  SpaceKind,
  type AttachmentDto,
  type TaskActivityField,
  type TaskActivityDto,
  type TaskActivityListDto,
  type ChatAuthorDto,
  type ChatMessageResponseDto,
  type ChatThemeDetailDto,
  type ChatThemeSummaryDto,
  type TaskCommentResponseDto,
  type TaskTreeCategoryDto,
  type TaskTreeNodeDto,
  type TaskTreeResponseDto,
} from '@rete/shared';
import type { Task } from '@/features/tasks/lib/api';

// ===== 組織モデル（CM-2 / ADR 0037・組織＞プロジェクト＞チャネル＝Space）=====
// DTO/enum の SSOT は @rete/shared の org.ts（§5 shared 型整合）。frontend では再定義せず import して使う。
// 3 endpoint いずれも ok(array) 包み（{ success, data } = ApiResponse<T[]>）で返る。

/** 自分が所属する組織一覧（GET /organizations・archived 除外・sortOrder 昇順）。 */
export async function fetchOrganizations(): Promise<OrganizationDto[]> {
  const res = await apiClient.get<ApiResponse<OrganizationDto[]>>('/organizations');
  return res.data.data;
}

/**
 * プロジェクト一覧（GET /projects）。organizationId 省略時は自分の全プロジェクト（サイドバーは 1 回取得して
 * organizationId でクライアント集約する＝組織数 N 回の往復を避ける）。
 */
export async function fetchProjects(organizationId?: string): Promise<ProjectDto[]> {
  const res = await apiClient.get<ApiResponse<ProjectDto[]>>('/projects', {
    params: organizationId ? { organizationId } : {},
  });
  return res.data.data;
}

/**
 * 器（Space）一覧（GET /spaces?kind=&projectId=）。kind は必ず指定する（未指定は backend が id リストのみ返す）。
 * CHANNEL は projectId 必須（非メンバーは Forbidden）＝プロジェクト展開時に lazy 取得する。
 */
export async function fetchSpaces(
  params: { kind?: SpaceKind; projectId?: string } = {},
): Promise<SpaceDto[]> {
  const res = await apiClient.get<ApiResponse<SpaceDto[]>>('/spaces', { params });
  return res.data.data;
}

/**
 * 器（Space）作成（POST /spaces / CM-2 rete-desk-0144）。kind により必須フィールドが変わる（判別共用体）。
 * 入力契約 CreateSpaceInput の SSOT は @rete/shared（§5）。GROUP=name 必須（誰でも）/ PERSONAL_DM=peerAccountId
 * 必須（重複ペアは backend が 409）。権限・重複検証は backend（spaces.service）が担い、frontend は素直に投げる。
 * 確定した SpaceDto を返す（呼び出し側が一覧 reload + 選択状態化に使う）。
 */
export async function createSpace(input: CreateSpaceInput): Promise<SpaceDto> {
  const res = await apiClient.post<ApiResponse<SpaceDto>>('/spaces', input);
  return res.data.data;
}

/**
 * 器（Space）更新（PATCH /spaces/:id / CM-2 rete-desk-0143）。チャネル / グループの改名（name）と
 * アーカイブ（archived: true = ソフト削除 / false = 復帰）に使う。権限（ADMIN ゲート）は backend が担う。
 * 削除は archived:true で表現し hard delete は行わない（archivedAt ソフト削除）。確定 SpaceDto を返す。
 */
export async function updateSpace(id: string, input: UpdateSpaceInput): Promise<SpaceDto> {
  const res = await apiClient.patch<ApiResponse<SpaceDto>>(`/spaces/${id}`, input);
  return res.data.data;
}

/**
 * チャットの応答形。形の正本は @rete/shared の `types/chat`（v2-245 で集約）で、本名は画面側の
 * 既存参照を保つための別名。明細カードの導出フラグ（archived / hasTenmatsu / hasMentionToMe /
 * hasUnread）と発話の添付・メンション・リアクションの意味は shared 側のコメントを参照。
 */
export type ChatAuthor = ChatAuthorDto;
export type ChatThemeSummary = ChatThemeSummaryDto;
export type ChatMessage = ChatMessageResponseDto;
export type ChatThemeDetail = ChatThemeDetailDto;

export interface ChatThemeListParams {
  search?: string;
  page?: number;
  limit?: number;
  /** アーカイブ絞り込み（rete-desk-0061 を server 化）。true = アーカイブ済のみ。未指定 = 除外（既定）。 */
  archiveOnly?: boolean;
  /** 顛末絞り込み（rete-desk-0050 を server 化）。true = 顛末記録済のみ。未指定 = 両方。 */
  tenmatsuOnly?: boolean;
  /** メンション発信者（From）絞り込み（rete-desk-0049 / §5.3 A案）。Account.id の OR 集合。空 = 全て。 */
  mentionFrom?: string[];
  /** メンション先（To）絞り込み（rete-desk-0049）。Account.id の OR 集合。空 = 全て。
   *  From×To は同一メッセージで AND（backend が判定）。 */
  mentionTo?: string[];
  /** 器（Space）スコープ絞り込み（CM-2 / ADR 0037）。未指定 = 全件（従来どおり・安全な中断点）。
   *  「スコープ」であって検索フィルタではない（空判定で「絞り込み一致なし」と数えない）。 */
  spaceId?: string;
}

export async function fetchChatThemes(
  params: ChatThemeListParams = {},
): Promise<PaginatedResponse<ChatThemeSummary>> {
  const res = await apiClient.get<PaginatedResponse<ChatThemeSummary>>('/chat/themes', { params });
  return res.data;
}

export async function fetchChatThemeDetail(id: string): Promise<ChatThemeDetail> {
  const res = await apiClient.get<ApiResponse<ChatThemeDetail>>(`/chat/themes/${id}`);
  return res.data.data;
}

export async function createChatTheme(payload: {
  title: string;
  description?: string;
  // 説明（description）本文中の @ メンションから抽出した宛先（メンション先 / rete-desk-0116）。
  // 空/未指定はメンションなし。backend が重複排除 + 存在検証して説明面の宛先を永続化する。
  descriptionMentionAccountIds?: string[];
  // 器（Space）スコープ（CM-2 / ADR 0037）。チャネル等を選択中なら其の spaceId を載せ、新規テーマを
  // その器に刻印する（未指定 = backend が DEFAULT_CHANNEL_ID に収容）。選択スコープ外への迷子化を防ぐ。
  spaceId?: string;
}): Promise<ChatThemeSummary> {
  const res = await apiClient.post<ApiResponse<ChatThemeSummary>>('/chat/themes', payload);
  return res.data.data;
}

/**
 * 返信メッセージ投稿（POST /chat/themes/:id/messages）。mentionAccountIds = 宛先（メンション先 / rete-desk-0049）。
 * 空/未指定はメンションなし投稿（従来どおり）。backend が重複排除 + 存在検証する。
 */
export async function postChatMessage(
  themeId: string,
  body: string,
  mentionAccountIds: string[] = [],
): Promise<ChatMessage> {
  const res = await apiClient.post<ApiResponse<ChatMessage>>(`/chat/themes/${themeId}/messages`, {
    body,
    mentionAccountIds,
  });
  return res.data.data;
}

/**
 * 自分の発話の本文編集（PATCH /chat/messages/:id / rete-desk-0146）。body（RTE HTML）は backend で
 * sanitize 経路を通る。mentionAccountIds は編集後本文から再抽出した宛先で、当該発話の宛先を全置換する
 * （未指定 = 据え置き）。編集は投稿者本人のみ（backend が 403）。返却は更新後メッセージ（詳細最新化は
 * 呼び出し側が GET 再取得で行う）。
 */
export async function updateChatMessage(
  messageId: string,
  body: string,
  mentionAccountIds: string[] = [],
): Promise<ChatMessage> {
  const res = await apiClient.patch<ApiResponse<ChatMessage>>(`/chat/messages/${messageId}`, {
    body,
    mentionAccountIds,
  });
  return res.data.data;
}

/**
 * チャットテーマ編集（PATCH /chat/themes/:id）。title / description（RTE HTML）/ tenmatsu を更新する。
 * description は backend 側で sanitize 経路を通る（多層防御の server 層）。tenmatsu は plain text
 * （空入力で null を送るとクリア / rete-desk-0092）。
 *
 * 返却は backend updateTheme（toChatThemeSummary）に合わせ ChatThemeSummary（description / tenmatsu /
 * messages / reactions を含まない一覧カード形）。詳細の最新化は呼び出し側が GET 再取得で行う
 * （use-chat-thread は戻り値を使わず load() を呼ぶ）。
 */
export async function updateChatTheme(
  id: string,
  payload: {
    title?: string;
    description?: string;
    tenmatsu?: string | null;
    archived?: boolean;
    // 説明面の宛先（rete-desk-0116）。description を編集する保存でのみ送る（空配列=全クリア / 未指定=据え置き）。
    descriptionMentionAccountIds?: string[];
    // 顛末面の宛先（rete-desk-0116 Phase B）。tenmatsu を編集する保存でのみ送る（空配列=全クリア / 未指定=据え置き）。
    tenmatsuMentionAccountIds?: string[];
  },
): Promise<ChatThemeSummary> {
  const res = await apiClient.patch<ApiResponse<ChatThemeSummary>>(`/chat/themes/${id}`, payload);
  return res.data.data;
}

/**
 * チャットテーマ削除（DELETE /chat/themes/:id / rete-desk-0095）。投稿者本人のみ（backend が 403 で防御）。
 * 配下の発話・リアクション・既読・宛先・添付行ごと物理削除される（昇格済みタスクは残る / sourceTheme SetNull）。
 */
export async function deleteChatTheme(id: string): Promise<void> {
  await apiClient.delete(`/chat/themes/${id}`);
}

/**
 * 発話（返信メッセージ）削除（DELETE /chat/messages/:id・dsk-0316）。投稿者本人のみ（backend が 403 で防御）。
 * 物理削除（復元不能）。テーマ本体（起点カード）は残る＝deleteChatTheme とは別経路。
 */
export async function deleteChatMessage(id: string): Promise<void> {
  await apiClient.delete(`/chat/messages/${id}`);
}

/**
 * トグル API の返り（付与/解除の結果のみ。集計配列は返らない＝呼び出し側が GET で再取得する）。
 * 形の正本は @rete/shared の ReactionToggleResponseDto（v2-251）。既存の参照名を保つための別名。
 */
export type ReactionToggleResult = ReactionToggleResponseDto;

/** メッセージのリアクションをトグル（POST /chat/messages/:id/reactions）。返り値の reacted は付与後の状態。 */
export async function toggleMessageReaction(
  messageId: string,
  emoji: ReactionEmoji,
): Promise<ReactionToggleResult> {
  const res = await apiClient.post<ApiResponse<ReactionToggleResult>>(
    `/chat/messages/${messageId}/reactions`,
    { emoji },
  );
  return res.data.data;
}

/** テーマ起点カードのリアクションをトグル（POST /chat/themes/:id/reactions）。 */
export async function toggleThemeReaction(
  themeId: string,
  emoji: ReactionEmoji,
): Promise<ReactionToggleResult> {
  const res = await apiClient.post<ApiResponse<ReactionToggleResult>>(
    `/chat/themes/${themeId}/reactions`,
    { emoji },
  );
  return res.data.data;
}

// ===== タスク（desk タスク明細 / 詳細）=====
// ツリーの形の正本は @rete/shared の `types/task`（v2-245 で集約）で、本名は desk 側の既存参照を
// 保つための別名。ノードは Task を children 付きで拡張した再帰構造（Task 型・status 表示の SSOT は
// tasks feature 側。desk では再定義せず再利用してコピペを避ける）。

export type DeskTaskNode = TaskTreeNodeDto;
export type DeskTaskCategory = TaskTreeCategoryDto;
export type DeskTaskTree = TaskTreeResponseDto;

/**
 * カテゴリ別にネストしたタスクツリー（GET /tasks/tree）。spaceId 指定時はその器のタスクのみ
 * （CM-2 / ADR 0037・未指定＝全件＝従来どおり＝安全な中断点）。
 */
export async function fetchTaskTree(spaceId?: string): Promise<DeskTaskTree> {
  const res = await apiClient.get<ApiResponse<DeskTaskTree>>('/tasks/tree', {
    params: spaceId ? { spaceId } : {},
  });
  return res.data.data;
}

/** タスク 1 件の詳細（GET /tasks/:id）。 */
export async function fetchTaskDetail(id: number): Promise<Task> {
  const res = await apiClient.get<ApiResponse<Task>>(`/tasks/${id}`);
  return res.data.data;
}

/**
 * タスク一覧（GET /tasks・フラットページング）のクエリ（backend FindTasksDto のうち desk が使う部分）。
 * mentionFrom / mentionTo はチャット側 ChatThemeListParams と同型（dsk-0203）: Account.id の OR 集合、
 * 空 = 全て、From×To は同一タスク/コメントで AND（backend が判定）。
 */
export interface TaskListParams {
  /** メンション発信者（From）絞り込み（dsk-0203）。値は Account.id の OR 集合。 */
  mentionFrom?: string[];
  /** メンション先（To）絞り込み（dsk-0203）。From と併用時は同一タスク/コメントで AND。 */
  mentionTo?: string[];
  page?: number;
  limit?: number;
}

/**
 * タスク一覧（GET /tasks）。desk のタスク明細はツリー（GET /tasks/tree）を正とするが、メンション From/To
 * 絞り込み（dsk-0203）は宛先 join のサーバー判定が必要なため、本一覧で一致タスク id 集合を取得して
 * ツリーの可視判定（computeVisibleTaskIds）へ合流させる（チャット側の server 絞り込み A案のタスク版）。
 */
export async function fetchTasks(params: TaskListParams = {}): Promise<PaginatedResponse<Task>> {
  const res = await apiClient.get<PaginatedResponse<Task>>('/tasks', { params });
  return res.data;
}

/** タスク更新（PUT /tasks/:id）。payload は tasks feature の toTaskPayload で組み立てる。 */
export async function updateTask(id: number, payload: Record<string, unknown>): Promise<Task> {
  const res = await apiClient.put<ApiResponse<Task>>(`/tasks/${id}`, payload);
  return res.data.data;
}

/**
 * タスク新規作成（POST /tasks）。sourceThemeId を載せない = 素の新規作成（D&D 昇格と同 endpoint・別意味）。
 * payload は tasks feature の toTaskPayload で組み立てる（title / categoryId 必須）。
 */
export async function createTask(payload: Record<string, unknown>): Promise<Task> {
  const res = await apiClient.post<ApiResponse<Task>>('/tasks', payload);
  return res.data.data;
}

/**
 * タスクコメント 1 件（GET/POST /tasks/:id/comments・dsk-0216）。形の正本は @rete/shared の
 * `types/task-comment`（v2-245 で集約）で、本名は desk 側の既存参照を保つための別名。
 * 投稿者は id + 表示名のみ公開（§1 DTO 境界）。チャット発話（ChatMessage）とは別テーブル（TaskComment）。
 * メンション（dsk-0203）とリアクション（dsk-0297）はチャット発話と対称。
 */
export type TaskCommentDto = TaskCommentResponseDto;

/** タスクコメント一覧（GET /tasks/:id/comments・createdAt 昇順）。 */
export async function fetchTaskComments(taskId: number): Promise<TaskCommentDto[]> {
  const res = await apiClient.get<ApiResponse<TaskCommentDto[]>>(`/tasks/${taskId}/comments`);
  return res.data.data;
}

/**
 * タスクコメント投稿（POST /tasks/:id/comments）。body はリッチテキスト HTML。
 * mentionAccountIds = 宛先（メンション先 / dsk-0203・チャット postChatMessage と同型）。
 * 空/未指定はメンションなし投稿（従来どおり）。backend が重複排除 + 存在検証する。
 */
export async function postTaskComment(
  taskId: number,
  body: string,
  mentionAccountIds: string[] = [],
): Promise<TaskCommentDto> {
  const res = await apiClient.post<ApiResponse<TaskCommentDto>>(`/tasks/${taskId}/comments`, {
    body,
    mentionAccountIds,
  });
  return res.data.data;
}

/**
 * タスクコメント編集（PATCH /tasks/:taskId/comments/:commentId・dsk-0241）。投稿者本人のみ（backend が 403）。
 * body は RTE HTML（backend で sanitize 経路を通る）。mentionAccountIds は編集後本文から再抽出した宛先で、
 * 当該コメントの宛先を全置換する（dsk-0203・チャット updateChatMessage と同型）。返却は更新後コメント
 * （呼び出し側が一覧へ差し替える）。
 */
export async function updateTaskComment(
  taskId: number,
  commentId: string,
  body: string,
  mentionAccountIds: string[] = [],
): Promise<TaskCommentDto> {
  const res = await apiClient.patch<ApiResponse<TaskCommentDto>>(
    `/tasks/${taskId}/comments/${commentId}`,
    { body, mentionAccountIds },
  );
  return res.data.data;
}

/**
 * タスクコメント削除（DELETE /tasks/:taskId/comments/:commentId・dsk-0241）。投稿者本人のみ（backend が 403 で防御）。
 * 物理削除（復元不能）。フロントのボタン非表示に依存せず backend が IDOR を塞ぐ。
 */
export async function deleteTaskComment(taskId: number, commentId: string): Promise<void> {
  await apiClient.delete(`/tasks/${taskId}/comments/${commentId}`);
}

/**
 * タスクコメントのリアクションをトグル（POST /tasks/:taskId/comments/:commentId/reactions・dsk-0297）。
 * チャットの toggleMessageReaction/toggleThemeReaction と対称（返り値の集計は返らず reacted のみ）。
 */
export async function toggleTaskCommentReaction(
  taskId: number,
  commentId: string,
  emoji: ReactionEmoji,
): Promise<ReactionToggleResult> {
  const res = await apiClient.post<ApiResponse<ReactionToggleResult>>(
    `/tasks/${taskId}/comments/${commentId}/reactions`,
    { emoji },
  );
  return res.data.data;
}

/**
 * 起点カード（タスク本体）のリアクションをトグル（POST /tasks/:id/reactions・dsk-0297）。
 * チャットの toggleThemeReaction と対称（返り値の集計は返らず reacted のみ）。
 */
export async function toggleTaskReaction(
  taskId: number,
  emoji: ReactionEmoji,
): Promise<ReactionToggleResult> {
  const res = await apiClient.post<ApiResponse<ReactionToggleResult>>(
    `/tasks/${taskId}/reactions`,
    { emoji },
  );
  return res.data.data;
}

// ===== タスク変更履歴（監査ログ・dsk-0223）=====

/**
 * 監査ログの形は @rete/shared が SSOT（cmn-0211）。従来の型名のまま別名で再公開し、利用側は無改修。
 * 集約前はここに 6 種で止まった TaskActivityField があり、`TaskActivityField | string` で
 * 型チェックを無効化していたため backend（11 種）とのズレに誰も気づけなかった。
 */
export type { TaskActivityField, TaskActivityDto, TaskActivityListDto };

/** タスク変更履歴一覧（GET /tasks/:id/activities・createdAt 昇順・最新200件上限 + truncated）。 */
export async function fetchTaskActivities(taskId: number): Promise<TaskActivityListDto> {
  const res = await apiClient.get<ApiResponse<TaskActivityListDto>>(`/tasks/${taskId}/activities`);
  return res.data.data;
}

// ===== チャット → タスク昇格（D&D）=====
// 昇格専用エンドポイントは無い。Phase 1 で拡張済の create（POST /tasks）に sourceThemeId /
// afterTaskId / parentTaskId を載せて昇格を表現する（§3.1 — create 複製を避ける）。

/**
 * 昇格 payload（POST /tasks 拡張）。drop モードに応じて parentTaskId / afterTaskId を出し分ける:
 * - カテゴリ末尾(append): parentTaskId / afterTaskId とも省略
 * - 兄弟の間(sibling): parentTaskId（兄弟の親, null 可）+ afterTaskId（直前兄弟 id）
 * - タスクの上(child): parentTaskId（対象タスク id）。categoryId は対象の値を送る（backend が親継承）
 */
export interface PromotePayload {
  title: string;
  description?: string;
  // 説明（description）本文中の @ メンションから抽出した宛先（dsk-0203・createChatTheme と同型）。
  // 空/未指定はメンションなし。backend（CreateTaskDto）が重複排除 + 存在検証して説明面の宛先を永続化する。
  descriptionMentionAccountIds?: string[];
  status?: TaskStatus;
  // 分類は任意（rete-desk-0158）。未分類バケットへの昇格時は省略（backend が未分類で作成）。
  categoryId?: number;
  parentTaskId?: number;
  sourceThemeId: string;
  afterTaskId?: number;
  assigneeName?: string;
  startDate?: string;
  dueDate?: string;
  // 昇格先の器（Space）ID（CM-2 / ADR 0037 §7）。選択中チャネルへ確実に作成するため送る。
  // 省略すると backend が DEFAULT_CHANNEL_ID を刻印し、新規チャネルでは作成タスクがそのチャネルの
  // ツリー（spaceId 絞り込み）に出てこない（rete-desk-0175）。
  spaceId?: string;
}

/** チャットテーマをタスクへ昇格（POST /tasks）。確定 Task を返す。 */
export async function promoteChatToTask(payload: PromotePayload): Promise<Task> {
  const res = await apiClient.post<ApiResponse<Task>>('/tasks', payload);
  return res.data.data;
}

// ===== タスク移動（D&D / PATCH /tasks/:id/move）=====
// 親変更 + カテゴリ変更 + 並び順をまとめて反映。:id = 移動サブツリーのルート task id。
// subtreeDepth は backend が自前算出するため送らない。レスポンスは移動後の単体 Task のみ
// （ツリー全体は返らない＝楽観更新前提）。

/**
 * 移動 payload（PATCH /tasks/:id/move）。
 * - parentTaskId: 移動先の親（トップレベルは null）。サブツリー全体に波及。
 * - categoryId: 移動先カテゴリ（null = 未分類 / rete-desk-0158・サブツリー全体に波及）。
 * - afterTaskId: 差し込み先の直前兄弟（先頭は null）。
 */
export interface MoveTaskPayload {
  parentTaskId: number | null;
  categoryId: number | null;
  afterTaskId: number | null;
}

/** タスク（サブツリー）を移動（PATCH /tasks/:id/move）。移動後の単体 Task を返す。 */
export async function moveTask(id: number, payload: MoveTaskPayload): Promise<Task> {
  const res = await apiClient.patch<ApiResponse<Task>>(`/tasks/${id}/move`, payload);
  return res.data.data;
}

// ===== 添付（FL-3 / タスク・チャット発話へのファイル添付）=====
// 応答形の正本は @rete/shared（AttachmentDto）。frontend は再公開するだけで契約型を所有しない（v2-245）。
// 添付は「添付時点の版」を固定して指す（versionNo は固定版・後でファイルへ新版が上がっても変わらない）。

/** 添付先の種別（backend ATTACHMENT_TARGET_TYPES と同形）。 */
export type AttachmentTargetType = 'task' | 'chatMessage' | 'theme' | 'taskComment';

/** 添付 1 件。shape の正本は @rete/shared AttachmentDto（cmn-0015・backend AttachmentResponseDto と同形）。 */
export type Attachment = AttachmentDto;

/** 添付一覧取得（GET /attachments?targetType=&targetId=）。targetId は task=数値 / chatMessage=UUID。 */
export async function fetchAttachments(
  targetType: AttachmentTargetType,
  targetId: string | number,
): Promise<Attachment[]> {
  const res = await apiClient.get<ApiResponse<Attachment[]>>('/attachments', {
    params: { targetType, targetId: String(targetId) },
  });
  return res.data.data;
}

/** 添付作成（POST /attachments）。添付時点の最新版を固定して紐づける。確定した添付を返す。 */
export async function createAttachment(input: {
  targetType: AttachmentTargetType;
  targetId: string | number;
  fileId: string;
}): Promise<Attachment> {
  const res = await apiClient.post<ApiResponse<Attachment>>('/attachments', {
    targetType: input.targetType,
    targetId: String(input.targetId),
    fileId: input.fileId,
  });
  return res.data.data;
}

/** 添付解除（DELETE /attachments/:id）。リンクのみ削除し実体ファイルは消さない。 */
export async function deleteAttachment(id: string): Promise<void> {
  await apiClient.delete(`/attachments/${id}`);
}

/** Desk 個人設定（ペイン幅比率 / rete-desk-0142）。値域 0.25〜0.75 は backend DTO と同じ制約。 */
export interface DeskPreference {
  leftPaneRatio: number;
}

/**
 * Desk 個人設定の取得（GET /accounts/me/desk-preference）。対象は常にセッション本人。
 * 未保存なら null（呼び出し側が既定比率で描画する）。
 */
export async function fetchDeskPreference(): Promise<DeskPreference | null> {
  const res = await apiClient.get<ApiResponse<DeskPreference | null>>(
    '/accounts/me/desk-preference',
  );
  return res.data.data;
}

/** Desk 個人設定の保存（PUT /accounts/me/desk-preference / upsert）。 */
export async function saveDeskPreference(leftPaneRatio: number): Promise<DeskPreference> {
  const res = await apiClient.put<ApiResponse<DeskPreference>>('/accounts/me/desk-preference', {
    leftPaneRatio,
  });
  return res.data.data;
}
