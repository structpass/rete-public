import apiClient from '@/lib/api-client';
import type {
  ApiResponse,
  FavoriteDto,
  FavoriteKind,
  ReferenceObjectTypeSummary,
} from '@rete/shared';

/**
 * HOME サイドバーの横断お気に入り（HM-1）の API クライアント。backend favorites モジュールの
 * Response DTO（FavoriteDto / @rete/shared）と同形。全エンドポイントは自分のお気に入りにスコープされる
 * （accountId は backend がセッションから取得。クライアントは渡さない）。
 */

export interface AddFavoriteInput {
  kind: FavoriteKind;
  label: string;
  /** 省略時は backend が合成 id を採番する（manual 追加）。★トグル（HM-1-4）からは実リソース id を渡す。 */
  targetRef?: string;
}

export async function fetchFavorites(): Promise<FavoriteDto[]> {
  const res = await apiClient.get<ApiResponse<FavoriteDto[]>>('/favorites');
  return res.data.data;
}

export async function addFavorite(input: AddFavoriteInput): Promise<FavoriteDto> {
  const res = await apiClient.post<ApiResponse<FavoriteDto>>('/favorites', input);
  return res.data.data;
}

export async function removeFavorite(id: string): Promise<void> {
  await apiClient.delete(`/favorites/${id}`);
}

export async function reorderFavorites(orderedIds: string[]): Promise<FavoriteDto[]> {
  const res = await apiClient.patch<ApiResponse<FavoriteDto[]>>('/favorites/reorder', {
    orderedIds,
  });
  return res.data.data;
}

/**
 * reference（struct-pass-reference）の ObjectType 種別一覧を rete backend の proxy API 経由で取得する
 * （hom-0067）。rete frontend から reference API を直接呼ばない（criteria【1】）。失敗・縮退時は空配列。
 */
export async function fetchReferenceObjectTypes(): Promise<ReferenceObjectTypeSummary[]> {
  const res = await apiClient.get<ApiResponse<ReferenceObjectTypeSummary[]>>(
    '/integration/object-types',
  );
  return res.data.data;
}
