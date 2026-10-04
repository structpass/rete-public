import apiClient from '@/lib/api-client';
import type {
  ApiResponse,
  HubMenuCategory,
  HubMenuItemType,
  HubMenuItemDto,
  HubMenuDto,
} from '@rete/shared';

/**
 * メニューの形の SSOT は @rete/shared（cmn-0211）。frontend での従来名（HubMenuItem / HubMenu）を
 * 別名として保ち、利用側は無改修のままにする（集約前は backend と逐語同形の定義がここにあった）。
 */
export type HubMenuItem = HubMenuItemDto;
export type HubMenu = HubMenuDto;
export type { HubMenuCategory, HubMenuItemType };

export async function fetchHubMenu(): Promise<HubMenu> {
  const res = await apiClient.get<ApiResponse<HubMenu>>('/hub/menu');
  return res.data.data;
}
