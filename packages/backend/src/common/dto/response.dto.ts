/**
 * API レスポンス共通型と生成ヘルパー。
 * 全 Service が `{ success: true, data, meta? }` の形で返す現行仕様を集約する。
 * envelope 型（PaginationMeta/ApiResponse/PaginatedResponse）の正本は @rete/shared（cmn-0015・§5 shared 型整合）。
 * 本ファイルは独自宣言を持たず、shared 型の再 export とヘルパー関数のみを担う。
 */
import type { PaginationMeta, ApiResponse, PaginatedResponse } from '@rete/shared';

export type { PaginationMeta, ApiResponse, PaginatedResponse };

export interface MessageResponse {
  success: true;
  data: { message: string };
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function okPaginated<T>(data: T[], meta: PaginationMeta): PaginatedResponse<T> {
  return { success: true, data, meta };
}

export function okMessage(message: string): MessageResponse {
  return { success: true, data: { message } };
}

export function buildPaginatedMeta(total: number, page: number, limit: number): PaginationMeta {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}
