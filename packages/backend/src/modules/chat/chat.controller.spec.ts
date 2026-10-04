import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Role } from '@rete/shared';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

const mockChatService = {
  findThemes: jest.fn(),
  findThemeDetail: jest.fn(),
  createTheme: jest.fn(),
  postMessage: jest.fn(),
  updateTheme: jest.fn(),
  updateMessage: jest.fn(),
  deleteTheme: jest.fn(),
  deleteMessage: jest.fn(),
  toggleMessageReaction: jest.fn(),
  toggleThemeReaction: jest.fn(),
};

/** テスト用最小 AuthenticatedUser（owner check 系に渡す user オブジェクト）。 */
const makeUser = (role: Role = Role.MEMBER) => ({
  id: 'acc-1',
  email: 'test@example.com',
  name: 'テスト',
  role,
  businessRoleId: null,
  featurePermissions: {
    chat: { canRead: true, canCreate: true, canUpdate: true, canDelete: true },
    task: { canRead: false, canCreate: false, canUpdate: false, canDelete: false },
    file: { canRead: false, canCreate: false, canUpdate: false, canDelete: false },
  },
});

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findThemes', () => {
    it('クエリと現在ユーザー id を Service へ委譲し結果を返すこと（hasMentionToMe 集約 / rete-desk-0049）', () => {
      const query = { status: 'OPEN', page: 1, limit: 20 };
      const expected = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };
      mockChatService.findThemes.mockReturnValue(expected);

      const result = controller.findThemes(query as never, 'acc-1');

      expect(result).toBe(expected);
      expect(mockChatService.findThemes).toHaveBeenCalledWith(query, 'acc-1');
    });
  });

  describe('findThemeDetail', () => {
    it('テーマ id と現在ユーザー id を Service へ委譲すること', () => {
      const expected = { success: true, data: { id: 'theme-1' } };
      mockChatService.findThemeDetail.mockReturnValue(expected);

      const result = controller.findThemeDetail('theme-1', 'acc-1');

      expect(result).toBe(expected);
      expect(mockChatService.findThemeDetail).toHaveBeenCalledWith('theme-1', 'acc-1');
    });
  });

  describe('createTheme', () => {
    it('CurrentUser の authorId と dto を Service へ委譲すること', () => {
      const dto = { title: '入荷遅延の対応', description: null };
      const expected = { success: true, data: { id: 'theme-2' } };
      mockChatService.createTheme.mockReturnValue(expected);

      const result = controller.createTheme('acc-1', dto as never);

      expect(result).toBe(expected);
      expect(mockChatService.createTheme).toHaveBeenCalledWith('acc-1', dto);
    });
  });

  describe('postMessage', () => {
    it('テーマ id・authorId・dto をこの順で Service へ委譲すること', () => {
      const dto = { body: '対応します' };
      const expected = { success: true, data: { id: 'msg-1' } };
      mockChatService.postMessage.mockReturnValue(expected);

      const result = controller.postMessage('theme-1', 'acc-1', dto as never);

      expect(result).toBe(expected);
      expect(mockChatService.postMessage).toHaveBeenCalledWith('theme-1', 'acc-1', dto);
    });
  });

  describe('updateTheme', () => {
    it('テーマ id・user オブジェクト・dto を Service へ委譲すること（H4: requesterId → user / rete-desk-0083）', () => {
      const dto = { title: '改題', description: '<p>新説明</p>' };
      const expected = { success: true, data: { id: 'theme-1' } };
      const user = makeUser();
      mockChatService.updateTheme.mockReturnValue(expected);

      const result = controller.updateTheme('theme-1', user as never, dto as never);

      expect(result).toBe(expected);
      expect(mockChatService.updateTheme).toHaveBeenCalledWith('theme-1', dto, user);
    });
  });

  describe('updateMessage', () => {
    it('メッセージ id・user オブジェクト・dto をこの順で Service へ委譲すること（H4: requesterId → user / rete-desk-0146）', () => {
      const dto = { body: '<p>修正後</p>', mentionAccountIds: ['u2'] };
      const expected = { success: true, data: { id: 'msg-1' } };
      const user = makeUser();
      mockChatService.updateMessage.mockReturnValue(expected);

      const result = controller.updateMessage('msg-1', user as never, dto as never);

      expect(result).toBe(expected);
      expect(mockChatService.updateMessage).toHaveBeenCalledWith('msg-1', user, dto);
    });
  });

  describe('deleteTheme', () => {
    it('テーマ id・user オブジェクトを Service へ委譲すること（H4: requesterId → user / rete-desk-0095）', () => {
      const expected = { success: true, data: { message: 'Chat theme deleted successfully' } };
      const user = makeUser();
      mockChatService.deleteTheme.mockReturnValue(expected);

      const result = controller.deleteTheme('theme-1', user as never);

      expect(result).toBe(expected);
      expect(mockChatService.deleteTheme).toHaveBeenCalledWith('theme-1', user);
    });
  });

  describe('deleteMessage', () => {
    it('メッセージ id・user オブジェクトを Service へ委譲すること（dsk-0316）', () => {
      const expected = { success: true, data: { message: 'Chat message deleted successfully' } };
      const user = makeUser();
      mockChatService.deleteMessage.mockReturnValue(expected);

      const result = controller.deleteMessage('msg-1', user as never);

      expect(result).toBe(expected);
      expect(mockChatService.deleteMessage).toHaveBeenCalledWith('msg-1', user);
    });
  });

  describe('toggleMessageReaction', () => {
    it('メッセージ id・authorId・dto をこの順で Service へ委譲すること', () => {
      const dto = { emoji: '👍' };
      const expected = { success: true, data: { reacted: true } };
      mockChatService.toggleMessageReaction.mockReturnValue(expected);

      const result = controller.toggleMessageReaction('msg-1', 'acc-1', dto as never);

      expect(result).toBe(expected);
      expect(mockChatService.toggleMessageReaction).toHaveBeenCalledWith('msg-1', 'acc-1', dto);
    });
  });

  describe('toggleThemeReaction', () => {
    it('テーマ id・authorId・dto をこの順で Service へ委譲すること', () => {
      const dto = { emoji: '🎉' };
      const expected = { success: true, data: { reacted: true } };
      mockChatService.toggleThemeReaction.mockReturnValue(expected);

      const result = controller.toggleThemeReaction('theme-1', 'acc-1', dto as never);

      expect(result).toBe(expected);
      expect(mockChatService.toggleThemeReaction).toHaveBeenCalledWith('theme-1', 'acc-1', dto);
    });
  });
});
