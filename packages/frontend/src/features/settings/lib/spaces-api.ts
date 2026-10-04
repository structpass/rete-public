import apiClient from '@/lib/api-client';
import {
  type ApiResponse,
  type CreateSpaceInput,
  type SpaceDto,
  type UpdateSpaceInput,
  SpaceKind,
} from '@rete/shared';

/**
 * 設定タブから Space を取得する口（招待発行の初期 Space 選択肢・論点1）。
 * desk 側の fetchSpaces（desk/lib/api.ts）と同契約（GET /spaces?kind=）だが、feature 境界を越えて
 * desk を import しないよう settings 側へ薄い口を置く（§2 データアクセスの分離・feature 独立）。
 */

/** GROUP Space 一覧取得（GET /spaces?kind=GROUP）。招待受諾時に追加する初期 Space の選択肢。 */
export async function fetchGroupSpaces(): Promise<SpaceDto[]> {
  const res = await apiClient.get<ApiResponse<SpaceDto[]>>('/spaces', {
    params: { kind: SpaceKind.GROUP },
  });
  return res.data.data;
}

/**
 * 全 GROUP Space 一覧取得（GET /spaces/admin?kind=GROUP・system ADMIN 専用・dsk-0319）。
 * membership 非依存で archived を含む全件を返す（includeArchived=true で archived 含む）。
 * 用途: 設定タブ「所属管理」のグループ選択肢で、ADMIN が自分が非所属の GROUP にも
 * 自分を追加できるようにするための導線。invites-screen は fetchGroupSpaces を使い続ける
 * （招待受諾時は membership がある GROUP だけが意味を持つため・surgical 分離）。
 * 既定は archived 除外（settings 所属管理は dsk-0319 criteria で「アーカイブ済み除外」指定）。
 */
export async function fetchGroupSpacesAdmin(includeArchived = false): Promise<SpaceDto[]> {
  const res = await apiClient.get<ApiResponse<SpaceDto[]>>('/spaces/admin', {
    params: { kind: SpaceKind.GROUP, ...(includeArchived ? { includeArchived: true } : {}) },
  });
  return res.data.data;
}

/**
 * プロジェクト配下の CHANNEL 一覧（GET /spaces/admin?kind=CHANNEL&projectId=・system ADMIN 専用・
 * membership 非依存・set-0162 admin 経路）。
 */
export async function fetchChannelsByProjectAdmin(
  projectId: string,
  includeArchived = false,
): Promise<SpaceDto[]> {
  const res = await apiClient.get<ApiResponse<SpaceDto[]>>('/spaces/admin', {
    params: {
      kind: SpaceKind.CHANNEL,
      projectId,
      ...(includeArchived ? { includeArchived: true } : {}),
    },
  });
  return res.data.data;
}

/** CHANNEL 作成（POST /spaces/admin・system ADMIN 専用・membership 非依存・set-0162）。 */
export async function createChannelAdmin(input: CreateSpaceInput): Promise<SpaceDto> {
  const res = await apiClient.post<ApiResponse<SpaceDto>>('/spaces/admin', input);
  return res.data.data;
}

/** CHANNEL 更新（PATCH /spaces/admin/:id・system ADMIN 専用・改名 / archive・set-0162）。 */
export async function adminUpdateChannel(id: string, input: UpdateSpaceInput): Promise<SpaceDto> {
  const res = await apiClient.patch<ApiResponse<SpaceDto>>(`/spaces/admin/${id}`, input);
  return res.data.data;
}

/** CHANNEL の物理削除（DELETE /spaces/admin/:id・system ADMIN 専用・set-0162）。 */
export async function deleteChannel(id: string): Promise<void> {
  await apiClient.delete<ApiResponse<unknown>>(`/spaces/admin/${id}`);
}
