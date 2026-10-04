import { describe, it, expect, vi, beforeEach } from 'vitest';

// apiClient（axios インスタンス）をモックして、添付 API が正しい path / params / payload で投げるか検証する。
// cmn-0147: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

import { fetchAttachments, createAttachment, deleteAttachment, type Attachment } from '../lib/api';

const sample: Attachment = {
  id: 'att-1',
  fileId: 'file-1',
  fileName: '仕様書.pdf',
  versionNo: 2,
  byteSize: 1024,
  mimeType: 'application/pdf',
  attachedBy: '山田',
  createdAt: '2026-06-01T00:00:00.000Z',
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
});

describe('fetchAttachments', () => {
  it('GET /attachments に targetType / targetId(string) を params で渡し、配列を返すこと', async () => {
    get.mockResolvedValue({ data: { success: true, data: [sample] } });

    const result = await fetchAttachments('task', 42);

    expect(get).toHaveBeenCalledWith('/attachments', {
      params: { targetType: 'task', targetId: '42' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('仕様書.pdf');
  });

  it('chatMessage(UUID) の targetId も文字列化して渡すこと', async () => {
    get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchAttachments('chatMessage', 'msg-uuid');

    expect(get).toHaveBeenCalledWith('/attachments', {
      params: { targetType: 'chatMessage', targetId: 'msg-uuid' },
    });
  });
});

describe('createAttachment', () => {
  it('POST /attachments に targetType / targetId(string) / fileId を渡し、確定添付を返すこと', async () => {
    post.mockResolvedValue({ data: { success: true, data: sample } });

    const result = await createAttachment({ targetType: 'task', targetId: 42, fileId: 'file-1' });

    expect(post).toHaveBeenCalledWith('/attachments', {
      targetType: 'task',
      targetId: '42',
      fileId: 'file-1',
    });
    expect(result.id).toBe('att-1');
    expect(result.versionNo).toBe(2);
  });
});

describe('deleteAttachment', () => {
  it('DELETE /attachments/:id を呼ぶこと', async () => {
    del.mockResolvedValue({ data: { success: true } });

    await deleteAttachment('att-1');

    expect(del).toHaveBeenCalledWith('/attachments/att-1');
  });
});
