import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, ChatThemeStatus } from '@rete/shared';

// apiClient（axios インスタンス）をモック化して、API 関数が正しい path / payload で投げるか検証する。
// cmn-0147: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { post, patch } = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
  },
}));

import {
  promoteChatToTask,
  updateChatTheme,
  toggleMessageReaction,
  toggleThemeReaction,
  type PromotePayload,
} from '../lib/api';
import type { Task } from '@/features/tasks/lib/api';

const responseTask: Task = {
  id: 99,
  title: '昇格タスク',
  description: 'テーマ本文',
  status: TaskStatus.TODO,
  tenmatsu: null,
  categoryId: 1,
  parentTaskId: null,
  sortOrder: 3,
  sourceThemeId: 'theme-uuid',
  sourceTheme: { id: 'theme-uuid', title: '元テーマ' },
  assignee: null,
  ownerId: null,
  owner: null,
  assigneeName: null,
  startDate: null,
  dueDate: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  hasMentionToMe: false,
  reactions: [],
};

beforeEach(() => {
  post.mockReset();
  patch.mockReset();
  post.mockResolvedValue({ data: { success: true, data: responseTask } });
});

describe('promoteChatToTask', () => {
  it('POST /tasks に payload をそのまま渡し、確定 Task を返すこと', async () => {
    const payload: PromotePayload = {
      title: '昇格タスク',
      description: 'テーマ本文',
      categoryId: 1,
      sourceThemeId: 'theme-uuid',
    };

    const result = await promoteChatToTask(payload);

    expect(post).toHaveBeenCalledWith('/tasks', payload);
    expect(result.id).toBe(99);
    expect(result.sourceThemeId).toBe('theme-uuid');
    expect(result.sortOrder).toBe(3);
  });

  it('兄弟挿入モードの payload（parentTaskId / afterTaskId）を欠落させずに送ること', async () => {
    const payload: PromotePayload = {
      title: 'タイトル',
      categoryId: 2,
      parentTaskId: 5,
      afterTaskId: 7,
      sourceThemeId: 'theme-uuid',
      status: TaskStatus.IN_PROGRESS,
      assigneeName: '山田',
      startDate: '2026-06-01T00:00:00.000Z',
      dueDate: '2026-06-10T00:00:00.000Z',
    };

    await promoteChatToTask(payload);

    expect(post).toHaveBeenCalledWith('/tasks', payload);
  });
});

describe('updateChatTheme', () => {
  it('PATCH /chat/themes/:id に title / description を渡し、更新後 summary を返すこと', async () => {
    // backend updateTheme は ChatThemeSummary（description / messages / reactions を含まない）を返す。
    patch.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 't1',
          title: '新題名',
          status: ChatThemeStatus.OPEN,
          author: { id: 'u1', name: '山田' },
          messageCount: 2,
          lastMessageAt: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      },
    });

    const result = await updateChatTheme('t1', { title: '新題名', description: '<p>x</p>' });

    expect(patch).toHaveBeenCalledWith('/chat/themes/t1', {
      title: '新題名',
      description: '<p>x</p>',
    });
    expect(result.title).toBe('新題名');
    expect(result.messageCount).toBe(2);
  });
});

describe('toggleMessageReaction / toggleThemeReaction', () => {
  it('メッセージは POST /chat/messages/:id/reactions に emoji を渡し reacted を返すこと', async () => {
    post.mockResolvedValueOnce({ data: { success: true, data: { reacted: true } } });

    const result = await toggleMessageReaction('m1', '👍');

    expect(post).toHaveBeenCalledWith('/chat/messages/m1/reactions', { emoji: '👍' });
    expect(result.reacted).toBe(true);
  });

  it('テーマは POST /chat/themes/:id/reactions に emoji を渡すこと', async () => {
    post.mockResolvedValueOnce({ data: { success: true, data: { reacted: false } } });

    await toggleThemeReaction('t1', '🎉');

    expect(post).toHaveBeenCalledWith('/chat/themes/t1/reactions', { emoji: '🎉' });
  });
});
