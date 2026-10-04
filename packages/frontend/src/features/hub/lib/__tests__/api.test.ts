import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHubMenu } from '../api';
import type { HubMenuDto } from '@rete/shared';

// apiClient.get の呼び出し検証用にモックを用意（files/lib/__tests__/api.test.ts:31-40 と同型）。
const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  default: { get: getMock },
}));

// 接続前から本番経路までの fetchHubMenu の本体挙動（URL・unwrap shape・reject 伝播）を cmn-0282 で固定する。
describe('fetchHubMenu（hub 画面のメニュー取得 / cmn-0282）', () => {
  const sampleMenu: HubMenuDto = {
    items: [
      {
        key: 'desk',
        label: 'Desk',
        description: 'チャット × タスク融合画面',
        category: 'rete',
        type: 'internal',
        href: '/desk',
        available: true,
      },
      {
        key: 'files',
        label: 'Files',
        description: 'ファイル管理',
        category: 'rete',
        type: 'internal',
        href: '/files',
        available: true,
      },
    ],
  };

  beforeEach(() => {
    getMock.mockReset();
  });

  it('GET /hub/menu を叩く', async () => {
    getMock.mockResolvedValue({ data: { success: true, data: sampleMenu } });
    await fetchHubMenu();
    expect(getMock).toHaveBeenCalledWith('/hub/menu');
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('ApiResponse の封筒から data.data を取り出して HubMenu の形で返す（unwrap）', async () => {
    getMock.mockResolvedValue({ data: { success: true, data: sampleMenu } });
    const result = await fetchHubMenu();
    expect(result).toEqual(sampleMenu);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ key: 'desk', category: 'rete' });
  });

  it('apiClient の reject を握り潰さず呼び出し元へ伝播する', async () => {
    const networkError = new Error('network down');
    getMock.mockRejectedValue(networkError);
    await expect(fetchHubMenu()).rejects.toBe(networkError);
  });
});
