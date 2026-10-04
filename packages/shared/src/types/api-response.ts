/**
 * API レスポンス共通 envelope 型。
 * backend `packages/backend/src/common/dto/response.dto.ts` の shape を正準とする SSOT。
 * frontend の各 feature lib はここから import し、局所再宣言しない。
 */

/** ページネーション付きレスポンスの meta 情報。 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** 単一リソース取得・作成・更新系レスポンスの envelope。 */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

/** 一覧取得系レスポンスの envelope（ページネーション meta 付き）。 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}
