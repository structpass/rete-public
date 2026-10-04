import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@rete/shared';
import { Prisma } from '@prisma/client';
import { ChatService } from './chat.service';
import { ChatRepository } from './repositories/chat.repository';
import { CHAT_MESSAGE_NOT_FOUND_MESSAGE, CHAT_THEME_NOT_FOUND_MESSAGE } from './chat.constants';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';

const mockRepo = {
  findThemesAndCount: jest.fn(),
  findThemeDetail: jest.fn(),
  markThemeRead: jest.fn(),
  findById: jest.fn(),
  createTheme: jest.fn(),
  createMessage: jest.fn(),
  updateTheme: jest.fn(),
  updateMessage: jest.fn(),
  findMessageById: jest.fn(),
  deleteTheme: jest.fn(),
  deleteMessage: jest.fn(),
  findReaction: jest.fn(),
  createReaction: jest.fn(),
  deleteReactions: jest.fn(),
  countAccountsByIds: jest.fn(),
};

// 存在秘匿ガード（rete-hardening）のモック。既定は「可視」（assertVisibleOr404 が何も throw しない /
// resolveVisibleSpaceIds が可視集合を返す）。越境テストのみ assertVisibleOr404 を NotFound へ差し替える。
const mockScopeVisibility = {
  canAccessSpace: jest.fn(),
  resolveVisibleSpaceIds: jest.fn(),
  assertVisibleOr404: jest.fn(),
};

const author = { id: 'acc1', name: '佐久間 健' };
const now = new Date('2026-05-31T00:00:00.000Z');

/**
 * owner-check メソッドへ渡す最小ユーザーオブジェクト生成ヘルパ（H4）。
 * set-0180: AuthenticatedUser から featurePermissions/businessRoleId は撤去。deleteTheme の権限判定は
 * service 内の assertOwnerOrAdmin（投稿者本人 or ADMIN）のみに集約。
 */
const mkUser = (id: string, role = Role.MEMBER) => ({
  id,
  role,
});

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ChatRepository, useValue: mockRepo },
        { provide: ScopeVisibilityService, useValue: mockScopeVisibility },
      ],
    }).compile();
    service = module.get<ChatService>(ChatService);
    // 既定は全 Space 可視。各テストの本筋（メンション/sanitize/owner 等）が存在秘匿で落ちないようにする。
    mockScopeVisibility.assertVisibleOr404.mockResolvedValue(undefined);
    mockScopeVisibility.resolveVisibleSpaceIds.mockResolvedValue(['space-visible']);
    mockScopeVisibility.canAccessSpace.mockResolvedValue(true);
  });

  it('findThemes は summary 配列とページネーション meta を返す', async () => {
    mockRepo.findThemesAndCount.mockResolvedValue({
      items: [
        {
          id: 't1',
          title: '在庫アラートの閾値',
          description: 'x',
          status: 'OPEN',
          author,
          _count: { messages: 3 },
          lastMessageAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
      total: 1,
      // repository が集約した「自分宛メンションを含むテーマ id 集合」。service が theme 毎に has で畳む。
      mentionedThemeIds: new Set(['t1']),
      // 「未読を含むテーマ id 集合」（rete-desk-0075）。service が theme 毎に hasUnread へ畳む。
      unreadThemeIds: new Set(['t1']),
    });
    const result = await service.findThemes({ page: 1, limit: 20 } as never, 'me');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].messageCount).toBe(3);
    expect(result.data[0].author.name).toBe('佐久間 健');
    // mentionedThemeIds に含まれるテーマは hasMentionToMe:true へ畳まれる（rete-desk-0049）。
    expect(result.data[0].hasMentionToMe).toBe(true);
    // unreadThemeIds に含まれるテーマは hasUnread:true へ畳まれる（rete-desk-0075）。
    expect(result.data[0].hasUnread).toBe(true);
    expect(result.meta?.total).toBe(1);
  });

  it('findThemes は currentUserId を repository へ渡す（hasMentionToMe 集約のため / rete-desk-0049）', async () => {
    mockRepo.findThemesAndCount.mockResolvedValue({
      items: [],
      total: 0,
      mentionedThemeIds: new Set(),
      unreadThemeIds: new Set(),
    });
    await service.findThemes({ page: 1, limit: 20 } as never, 'me');
    expect(mockRepo.findThemesAndCount.mock.calls[0][0]).toMatchObject({ page: 1, limit: 20 });
    expect(mockRepo.findThemesAndCount.mock.calls[0][1]).toBe('me');
  });

  it('findThemeDetail は存在しないと NotFound を投げる', async () => {
    // v2-255: 対象の実在は同梱なしの軽い取得（findById）で判定する（詳細取得の有無で応答時間が割れないように）。
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.findThemeDetail('x')).rejects.toThrow(NotFoundException);
  });

  /**
   * 対象不在の 404 は日本語の共通文言で返す（v2-238）。
   *
   * 旧文言は `Chat theme with id ${id} not found` のように英語＋内部 ID を service で組み立てており、
   * Desk の操作トースト（features/desk/lib/api-error.ts が backend の error.message を surface する）に
   * そのまま出ていた。文言は chat.constants.ts へ集約したので、8 経路すべてが同じ定数で返ることを
   * 固定する（1 経路だけ直して他が英語のまま残る形を検出する）。
   */
  it('対象不在の 404 は日本語の共通文言で返る（内部 ID を載せない・v2-238）', async () => {
    mockRepo.findThemeDetail.mockResolvedValue(null);
    mockRepo.findById.mockResolvedValue(null);
    mockRepo.findMessageById.mockResolvedValue(null);
    const themeMessage = CHAT_THEME_NOT_FOUND_MESSAGE;
    const messageMessage = CHAT_MESSAGE_NOT_FOUND_MESSAGE;

    // テーマ系 5 経路
    await expect(service.findThemeDetail('theme-1')).rejects.toMatchObject({
      message: themeMessage,
    });
    await expect(service.updateTheme('theme-1', {} as never, mkUser('acc1'))).rejects.toMatchObject(
      {
        message: themeMessage,
      },
    );
    await expect(service.deleteTheme('theme-1', mkUser('acc1'))).rejects.toMatchObject({
      message: themeMessage,
    });
    await expect(
      service.toggleThemeReaction('theme-1', 'acc1', { emoji: '👍' } as never),
    ).rejects.toMatchObject({ message: themeMessage });
    await expect(
      service.postMessage('theme-1', 'acc1', { body: 'x' } as never),
    ).rejects.toMatchObject({ message: themeMessage });

    // メッセージ系 3 経路
    await expect(
      service.toggleMessageReaction('msg-1', 'acc1', { emoji: '👍' } as never),
    ).rejects.toMatchObject({ message: messageMessage });
    await expect(
      service.updateMessage('msg-1', mkUser('acc1'), { body: 'x' } as never),
    ).rejects.toMatchObject({ message: messageMessage });
    await expect(service.deleteMessage('msg-1', mkUser('acc1'))).rejects.toMatchObject({
      message: messageMessage,
    });

    // 文言そのものを固定する（英字＝英語文言と内部 ID の混入を許さない）。
    expect(themeMessage).toBe('チャットテーマが見つかりません');
    expect(messageMessage).toBe('チャットメッセージが見つかりません');
  });

  it('findThemeDetail は messages を含む detail を返す', async () => {
    // v2-255: 判定は軽い取得（findById）→ 可視確定後に詳細（findThemeDetail）の順で読む。
    mockRepo.findById.mockResolvedValue({ id: 't1', spaceId: 'space-visible' });
    mockRepo.findThemeDetail.mockResolvedValue({
      id: 't1',
      title: 'テーマ',
      description: '説明',
      status: 'OPEN',
      author,
      messages: [{ id: 'm1', themeId: 't1', body: 'こんにちは', author, createdAt: now }],
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const result = await service.findThemeDetail('t1');
    expect(result.data.messages).toHaveLength(1);
    expect(result.data.messages[0].body).toBe('こんにちは');
    expect(result.data.description).toBe('説明');
  });

  it('findThemeDetail は currentUserId 指定時にスレッドを既読化する（rete-desk-0075）', async () => {
    mockRepo.findById.mockResolvedValue({ id: 't1', spaceId: 'space-visible' });
    mockRepo.findThemeDetail.mockResolvedValue({
      id: 't1',
      title: 'テーマ',
      description: '説明',
      status: 'OPEN',
      author,
      messages: [],
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await service.findThemeDetail('t1', 'me');
    // 開いた = 既読化。GET 詳細取得の副作用として markThemeRead(themeId, accountId) を呼ぶ。
    expect(mockRepo.markThemeRead).toHaveBeenCalledWith('t1', 'me');
  });

  it('findThemeDetail は既読化（markThemeRead）が失敗しても読み取りを 500 化せず detail を返す（rete-desk-0075）', async () => {
    mockRepo.findById.mockResolvedValue({ id: 't1', spaceId: 'space-visible' });
    mockRepo.findThemeDetail.mockResolvedValue({
      id: 't1',
      title: 'テーマ',
      description: '説明',
      status: 'OPEN',
      author,
      messages: [],
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    // 既読化の transient 失敗（接続断・ロック競合など）。本筋（読み取り）の成否を左右させない。
    mockRepo.markThemeRead.mockRejectedValue(new Error('db down'));
    const result = await service.findThemeDetail('t1', 'me');
    expect(result.success).toBe(true);
    expect(result.data.id).toBe('t1');
  });

  it('findThemeDetail は currentUserId 無し（匿名経路）なら既読化しない（rete-desk-0075）', async () => {
    mockRepo.findById.mockResolvedValue({ id: 't1', spaceId: 'space-visible' });
    mockRepo.findThemeDetail.mockResolvedValue({
      id: 't1',
      title: 'テーマ',
      description: '説明',
      status: 'OPEN',
      author,
      messages: [],
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await service.findThemeDetail('t1');
    expect(mockRepo.markThemeRead).not.toHaveBeenCalled();
  });

  it('createTheme は作成された summary を返す', async () => {
    mockRepo.createTheme.mockResolvedValue({
      id: 't2',
      title: '新規テーマ',
      description: null,
      status: 'OPEN',
      author,
      _count: { messages: 0 },
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const result = await service.createTheme('acc1', { title: '新規テーマ' });
    expect(result.success).toBe(true);
    expect(result.data.title).toBe('新規テーマ');
    expect(result.data.messageCount).toBe(0);
    // sanitize 層を通った後に repository へ渡る dto を検査（description なしなのでそのまま）。
    expect(mockRepo.createTheme.mock.calls[0][0]).toBe('acc1');
    expect(mockRepo.createTheme.mock.calls[0][1]).toEqual({ title: '新規テーマ' });
  });

  it('postMessage はテーマが無いと NotFound を投げ、createMessage を呼ばない', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.postMessage('missing', 'acc1', { body: 'hi' })).rejects.toThrow(
      NotFoundException,
    );
    expect(mockRepo.createMessage).not.toHaveBeenCalled();
  });

  it('postMessage はテーマが在れば作成した message を返す', async () => {
    mockRepo.findById.mockResolvedValue({ id: 't1' });
    mockRepo.createMessage.mockResolvedValue({
      id: 'm9',
      themeId: 't1',
      body: '返信です',
      author,
      createdAt: now,
    });
    const result = await service.postMessage('t1', 'acc1', { body: '返信です' });
    expect(result.success).toBe(true);
    expect(result.data.body).toBe('返信です');
    expect(result.data.author.id).toBe('acc1');
    // sanitize 層を通った後に repository へ渡る dto を検査（plain text はそのまま素通り）。
    expect(mockRepo.createMessage.mock.calls[0][0]).toBe('t1');
    expect(mockRepo.createMessage.mock.calls[0][1]).toBe('acc1');
    expect(mockRepo.createMessage.mock.calls[0][2]).toEqual({ body: '返信です' });
  });

  describe('postMessage メンション（rete-desk-0049）', () => {
    const postedMessage = {
      id: 'm9',
      themeId: 't1',
      body: 'hi',
      author,
      createdAt: now,
      mentions: [],
    };

    it('mentionAccountIds が全て実在すれば createMessage へ渡す', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.createMessage.mockResolvedValue(postedMessage);
      await service.postMessage('t1', 'acc1', { body: 'hi', mentionAccountIds: ['u2', 'u3'] });
      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.createMessage.mock.calls[0][2].mentionAccountIds).toEqual(['u2', 'u3']);
    });

    it('重複した mentionAccountIds は排除してから検証・保存する', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.createMessage.mockResolvedValue(postedMessage);
      await service.postMessage('t1', 'acc1', {
        body: 'hi',
        mentionAccountIds: ['u2', 'u3', 'u2'],
      });
      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.createMessage.mock.calls[0][2].mentionAccountIds).toEqual(['u2', 'u3']);
    });

    it('存在しない accountId が含まれると BadRequest を投げ createMessage を呼ばない', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1); // 2 件指定中 1 件しか実在しない
      await expect(
        service.postMessage('t1', 'acc1', { body: 'hi', mentionAccountIds: ['u2', 'ghost'] }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createMessage).not.toHaveBeenCalled();
    });

    it('mentionAccountIds 未指定なら存在検証をスキップして従来どおり投稿する', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.createMessage.mockResolvedValue(postedMessage);
      await service.postMessage('t1', 'acc1', { body: 'hi' });
      expect(mockRepo.countAccountsByIds).not.toHaveBeenCalled();
    });

    it('検証通過後に対象アカウントが消えて createMany が FK 違反（P2003）になっても 400 へ変換する（TOCTOU）', async () => {
      // countAccountsByIds は通過（検証時点では実在）したが、createMessage 実行時には削除済み。
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.createMessage.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK constraint failed', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.postMessage('t1', 'acc1', { body: 'hi', mentionAccountIds: ['u2'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('P2003 以外の Prisma エラーは握らず再 throw する（filter へ委譲 / §4）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.createMessage.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('other', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.postMessage('t1', 'acc1', { body: 'hi', mentionAccountIds: ['u2'] }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('createTheme メンション（rete-desk-0116・説明面）', () => {
    const createdTheme = {
      id: 't2',
      title: 'T',
      description: '<p>本文</p>',
      status: 'OPEN',
      author,
      _count: { messages: 0 },
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };

    it('descriptionMentionAccountIds が全て実在すれば createTheme へ渡す', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.createTheme.mockResolvedValue(createdTheme);
      await service.createTheme('acc1', {
        title: 'T',
        description: '<p>本文</p>',
        descriptionMentionAccountIds: ['u2', 'u3'],
      });
      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.createTheme.mock.calls[0][1].descriptionMentionAccountIds).toEqual([
        'u2',
        'u3',
      ]);
    });

    it('重複した descriptionMentionAccountIds は排除してから検証・保存する', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.createTheme.mockResolvedValue(createdTheme);
      await service.createTheme('acc1', {
        title: 'T',
        descriptionMentionAccountIds: ['u2', 'u3', 'u2'],
      });
      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.createTheme.mock.calls[0][1].descriptionMentionAccountIds).toEqual([
        'u2',
        'u3',
      ]);
    });

    it('存在しない accountId が含まれると BadRequest を投げ createTheme を呼ばない', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      await expect(
        service.createTheme('acc1', { title: 'T', descriptionMentionAccountIds: ['u2', 'ghost'] }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createTheme).not.toHaveBeenCalled();
    });

    it('検証通過後の FK 違反（P2003）は 400 へ変換する（TOCTOU）', async () => {
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.createTheme.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'test' }),
      );
      await expect(
        service.createTheme('acc1', { title: 'T', descriptionMentionAccountIds: ['u2'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('createTheme は description（HTML）を保存前に sanitize する（ADR 0019 / 多層防御の保存側）', async () => {
    mockRepo.createTheme.mockResolvedValue({
      id: 't3',
      title: 'テーマ',
      description: '<p>safe</p>',
      status: 'OPEN',
      author,
      _count: { messages: 0 },
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await service.createTheme('acc1', {
      title: 'テーマ',
      description: '<p>safe</p><script>alert(1)</script>',
    });
    const passed = mockRepo.createTheme.mock.calls[0][1];
    expect(passed.description).toContain('<p>safe</p>');
    expect(passed.description).not.toContain('<script>');
  });

  it('postMessage は body（HTML）を保存前に sanitize する', async () => {
    mockRepo.findById.mockResolvedValue({ id: 't1' });
    mockRepo.createMessage.mockResolvedValue({
      id: 'm10',
      themeId: 't1',
      body: '<p>hi</p>',
      author,
      createdAt: now,
    });
    await service.postMessage('t1', 'acc1', {
      body: '<p>hi</p><img src=x onerror=alert(1)>',
    });
    const passed = mockRepo.createMessage.mock.calls[0][2];
    expect(passed.body).toContain('<p>hi</p>');
    expect(passed.body).not.toContain('onerror');
    expect(passed.body).not.toContain('<img');
  });

  describe('updateTheme', () => {
    it('テーマが無いと NotFound を投げ updateTheme を呼ばない', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.updateTheme('missing', { title: 'x' }, mkUser('u1'))).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.updateTheme).not.toHaveBeenCalled();
    });

    it('投稿者本人でないと Forbidden を投げ updateTheme を呼ばない（IDOR 防止 / rete-desk-0083）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'owner' });
      await expect(service.updateTheme('t1', { title: 'x' }, mkUser('intruder'))).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.updateTheme).not.toHaveBeenCalled();
    });

    it('ADMIN は他者のテーマも編集できること（H4 ADMIN バイパス）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'other-user' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: '改題',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme('t1', { title: '改題' }, mkUser('admin-user', Role.ADMIN));
      expect(mockRepo.updateTheme).toHaveBeenCalledTimes(1);
    });

    it('顛末（tenmatsu + 顛末面宛先）のみの更新は非所有者でも許可する（rete-desk-0122）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'owner' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'T',
        description: null,
        tenmatsu: '<p>決着</p>',
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme(
        't1',
        { tenmatsu: '<p>決着</p>', tenmatsuMentionAccountIds: ['u2'] },
        mkUser('not-owner'),
      );
      expect(mockRepo.updateTheme).toHaveBeenCalledTimes(1);
    });

    // null クリアも「顛末を記録する」運用の一部として非所有者に許可する（書き直しのための消去）。
    // null だけ禁じても空 HTML 上書きで実質消去できるため、禁止してもセキュリティ向上にならない（仕様固定）。
    it('非所有者による tenmatsu:null（クリア）も顛末のみ更新として許可する（rete-desk-0122）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'owner' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'T',
        description: null,
        tenmatsu: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme('t1', { tenmatsu: null }, mkUser('not-owner'));
      expect(mockRepo.updateTheme).toHaveBeenCalledTimes(1);
    });

    it('顛末に加えて他フィールド（title 等）を含む非所有者更新は Forbidden のまま（rete-desk-0122 免除の境界）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'owner' });
      await expect(
        service.updateTheme('t1', { title: '改題', tenmatsu: '<p>決着</p>' }, mkUser('not-owner')),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.updateTheme).not.toHaveBeenCalled();
    });

    it('description（HTML）を保存前に sanitize して repository へ渡す', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'タイトル',
        description: '<p>safe</p>',
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme(
        't1',
        {
          title: 'タイトル',
          description: '<p>safe</p><script>alert(1)</script>',
        },
        mkUser('u1'),
      );
      const passed = mockRepo.updateTheme.mock.calls[0][1];
      expect(passed.title).toBe('タイトル');
      expect(passed.description).toContain('<p>safe</p>');
      expect(passed.description).not.toContain('<script>');
    });

    it('descriptionMentionAccountIds が全て実在すれば repository へ渡す（説明面の宛先差し替え / rete-desk-0116）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'T',
        description: '<p>本文</p>',
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme(
        't1',
        { description: '<p>本文</p>', descriptionMentionAccountIds: ['u2', 'u3'] },
        mkUser('u1'),
      );
      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.updateTheme.mock.calls[0][1].descriptionMentionAccountIds).toEqual([
        'u2',
        'u3',
      ]);
    });

    it('descriptionMentionAccountIds が空配列なら全クリア意図として [] を repository へ渡す（据え置きと区別 / rete-desk-0116）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'T',
        description: '<p>本文</p>',
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme(
        't1',
        { description: '<p>本文</p>', descriptionMentionAccountIds: [] },
        mkUser('u1'),
      );
      // 空配列は存在検証スキップ（count 不要）だが、クリア意図として [] を repository へ載せる。
      expect(mockRepo.countAccountsByIds).not.toHaveBeenCalled();
      expect(mockRepo.updateTheme.mock.calls[0][1].descriptionMentionAccountIds).toEqual([]);
    });

    it('descriptionMentionAccountIds 未指定なら宛先キーを載せない（据え置き / 顛末だけ保存などで宛先を巻き込まない）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'T',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme('t1', { tenmatsu: '<p>結論</p>' }, mkUser('u1'));
      expect(mockRepo.updateTheme.mock.calls[0][1].descriptionMentionAccountIds).toBeUndefined();
    });

    it('存在しない accountId が含まれると BadRequest を投げ updateTheme を呼ばない', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      await expect(
        service.updateTheme(
          't1',
          { description: '<p>x</p>', descriptionMentionAccountIds: ['u2', 'ghost'] },
          mkUser('u1'),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.updateTheme).not.toHaveBeenCalled();
    });

    it('tenmatsuMentionAccountIds が全て実在すれば repository へ渡す（顛末面の宛先差し替え / rete-desk-0116 Phase B）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'T',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme(
        't1',
        { tenmatsu: '<p>結論</p>', tenmatsuMentionAccountIds: ['u4', 'u5'] },
        mkUser('u1'),
      );
      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u4', 'u5']);
      expect(mockRepo.updateTheme.mock.calls[0][1].tenmatsuMentionAccountIds).toEqual(['u4', 'u5']);
    });

    it('tenmatsuMentionAccountIds が空配列なら全クリア意図として [] を repository へ渡す（顛末クリア時 / Phase B）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'T',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme(
        't1',
        { tenmatsu: null, tenmatsuMentionAccountIds: [] },
        mkUser('u1'),
      );
      expect(mockRepo.countAccountsByIds).not.toHaveBeenCalled();
      expect(mockRepo.updateTheme.mock.calls[0][1].tenmatsuMentionAccountIds).toEqual([]);
    });

    it('説明面のみ保存では顛末面の宛先キーを載せない（面別独立・据え置き / Phase B）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'T',
        description: '<p>本文</p>',
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme(
        't1',
        { description: '<p>本文</p>', descriptionMentionAccountIds: ['u2'] },
        mkUser('u1'),
      );
      expect(mockRepo.updateTheme.mock.calls[0][1].tenmatsuMentionAccountIds).toBeUndefined();
    });

    it('顛末面に存在しない accountId が含まれると BadRequest を投げ updateTheme を呼ばない（Phase B）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      await expect(
        service.updateTheme(
          't1',
          { tenmatsu: '<p>x</p>', tenmatsuMentionAccountIds: ['u4', 'ghost'] },
          mkUser('u1'),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.updateTheme).not.toHaveBeenCalled();
    });

    it('tenmatsu（HTML）を保存前に sanitize して repository へ渡す（rete-desk-0091 RTE 化）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'タイトル',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme(
        't1',
        {
          tenmatsu: '<p>CSV は UTF-8 で確定</p><script>alert(1)</script>',
        },
        mkUser('u1'),
      );
      const passed = mockRepo.updateTheme.mock.calls[0][1];
      expect(passed.tenmatsu).toContain('<p>CSV は UTF-8 で確定</p>');
      expect(passed.tenmatsu).not.toContain('<script>');
    });

    it('tenmatsu:null はクリアとして repository へ渡す（rete-desk-0092）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'タイトル',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme('t1', { tenmatsu: null }, mkUser('u1'));
      const passed = mockRepo.updateTheme.mock.calls[0][1];
      expect(passed.tenmatsu).toBeNull();
    });

    it('title のみ指定なら description キーを生やさない（未指定 shape を保つ）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: '改題',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme('t1', { title: '改題' }, mkUser('u1'));
      const passed = mockRepo.updateTheme.mock.calls[0][1];
      expect(passed).toEqual({ title: '改題' });
      expect('description' in passed).toBe(false);
    });

    it('archived:true は archivedAt に現在時刻（Date）を立てて repository へ渡す', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'タイトル',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const res = await service.updateTheme('t1', { archived: true }, mkUser('u1'));
      const passed = mockRepo.updateTheme.mock.calls[0][1];
      expect(passed.archivedAt).toBeInstanceOf(Date);
      expect(res.data.archived).toBe(true);
    });

    it('archived:false は archivedAt=null（解除）で渡す', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: 'タイトル',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const res = await service.updateTheme('t1', { archived: false }, mkUser('u1'));
      const passed = mockRepo.updateTheme.mock.calls[0][1];
      expect(passed.archivedAt).toBeNull();
      expect(res.data.archived).toBe(false);
    });

    it('archived 未指定なら archivedAt キーを生やさない（据え置き）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.updateTheme.mockResolvedValue({
        id: 't1',
        title: '改題',
        description: null,
        status: 'OPEN',
        author,
        _count: { messages: 0 },
        lastMessageAt: now,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await service.updateTheme('t1', { title: '改題' }, mkUser('u1'));
      const passed = mockRepo.updateTheme.mock.calls[0][1];
      expect('archivedAt' in passed).toBe(false);
    });
  });

  describe('deleteTheme（rete-desk-0095: その他 > メッセージ削除）', () => {
    it('テーマが無いと NotFound を投げ deleteTheme を呼ばない', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.deleteTheme('missing', mkUser('u1'))).rejects.toThrow(NotFoundException);
      expect(mockRepo.deleteTheme).not.toHaveBeenCalled();
    });

    it('投稿者本人でないと Forbidden を投げ deleteTheme を呼ばない（IDOR 防止 / updateTheme と同境界）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'owner' });
      await expect(service.deleteTheme('t1', mkUser('intruder'))).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.deleteTheme).not.toHaveBeenCalled();
    });

    it('ADMIN は他者のテーマも削除できること（H4 ADMIN バイパス）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'other-user' });
      mockRepo.deleteTheme.mockResolvedValue({ id: 't1' });
      const result = await service.deleteTheme('t1', mkUser('admin-user', Role.ADMIN));
      expect(mockRepo.deleteTheme).toHaveBeenCalledWith('t1');
      expect(result.success).toBe(true);
    });

    it('投稿者本人なら物理削除して message レスポンスを返す', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'owner' });
      mockRepo.deleteTheme.mockResolvedValue({ id: 't1' });
      const result = await service.deleteTheme('t1', mkUser('owner'));
      expect(mockRepo.deleteTheme).toHaveBeenCalledWith('t1');
      expect(result.success).toBe(true);
      expect(result.data.message).toBe('Chat theme deleted successfully');
    });

    // set-0180: FeaturePermissionGuard/業務ロール canDelete 判定を撤去。deleteTheme は
    // assertOwnerOrAdmin（投稿者本人 or ADMIN）のみで判定する。
    describe('set-0180: assertOwnerOrAdmin ベースの削除判定', () => {
      it('投稿者本人は Space 種別・権限に関わらず削除できる（canDelete 撤去・carve-out 不要化）', async () => {
        mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'owner', spaceId: 'space-ch' });
        mockRepo.deleteTheme.mockResolvedValue({ id: 't1' });
        const result = await service.deleteTheme('t1', mkUser('owner', Role.MEMBER));
        expect(mockRepo.deleteTheme).toHaveBeenCalledWith('t1');
        expect(result.success).toBe(true);
      });

      it('他人のテーマは Forbidden のまま（IDOR 無退行）', async () => {
        mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'owner', spaceId: 'space-memo' });
        await expect(service.deleteTheme('t1', mkUser('intruder', Role.MEMBER))).rejects.toThrow(
          ForbiddenException,
        );
        expect(mockRepo.deleteTheme).not.toHaveBeenCalled();
      });

      it('ADMIN は他人のテーマも削除できる（バイパス）', async () => {
        mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'other', spaceId: 'space-ch' });
        mockRepo.deleteTheme.mockResolvedValue({ id: 't1' });
        await service.deleteTheme('t1', mkUser('admin-user', Role.ADMIN));
        expect(mockRepo.deleteTheme).toHaveBeenCalledWith('t1');
      });
    });
  });

  describe('updateMessage（rete-desk-0146: 自分の発話の本文編集）', () => {
    const updatedMessage = {
      id: 'm1',
      themeId: 't1',
      body: '<p>修正後</p>',
      author,
      createdAt: now,
      mentions: [],
      attachments: [],
      reactions: [],
    };

    it('対象メッセージが無いと NotFound を投げ updateMessage を呼ばない', async () => {
      mockRepo.findMessageById.mockResolvedValue(null);
      await expect(
        service.updateMessage('m-missing', mkUser('acc1'), { body: '<p>x</p>' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.updateMessage).not.toHaveBeenCalled();
    });

    it('投稿者本人でないと Forbidden を投げ updateMessage を呼ばない（IDOR 防止 / updateTheme と同境界）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'owner' });
      await expect(
        service.updateMessage('m1', mkUser('intruder'), { body: '<p>x</p>' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.updateMessage).not.toHaveBeenCalled();
    });

    it('ADMIN は他者のメッセージも編集できること（H4 ADMIN バイパス）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'other-user' });
      mockRepo.updateMessage.mockResolvedValue({
        id: 'm1',
        themeId: 't1',
        body: '<p>修正後</p>',
        author,
        createdAt: now,
        mentions: [],
        attachments: [],
        reactions: [],
      });
      await service.updateMessage('m1', mkUser('admin-user', Role.ADMIN), {
        body: '<p>修正後</p>',
      });
      expect(mockRepo.updateMessage).toHaveBeenCalledTimes(1);
    });

    it('本人なら body を sanitize して repository へ渡し更新結果を返す（ADR 0019）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'acc1' });
      mockRepo.updateMessage.mockResolvedValue(updatedMessage);
      const result = await service.updateMessage('m1', mkUser('acc1'), {
        body: '<p>修正後</p><img src=x onerror=alert(1)>',
      });
      expect(result.success).toBe(true);
      expect(result.data.body).toBe('<p>修正後</p>');
      const passed = mockRepo.updateMessage.mock.calls[0][1];
      expect(passed.body).toContain('<p>修正後</p>');
      expect(passed.body).not.toContain('onerror');
      expect(passed.body).not.toContain('<img');
    });

    it('mentionAccountIds 指定時は重複排除 + 存在検証して全置換で渡す', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'acc1' });
      mockRepo.countAccountsByIds.mockResolvedValue(2);
      mockRepo.updateMessage.mockResolvedValue(updatedMessage);
      await service.updateMessage('m1', mkUser('acc1'), {
        body: '<p>x</p>',
        mentionAccountIds: ['u2', 'u3', 'u2'],
      });
      expect(mockRepo.countAccountsByIds).toHaveBeenCalledWith(['u2', 'u3']);
      expect(mockRepo.updateMessage.mock.calls[0][1].mentionAccountIds).toEqual(['u2', 'u3']);
    });

    it('mentionAccountIds が空配列なら全クリア意図として [] を repository へ渡す（据え置きと区別）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'acc1' });
      mockRepo.updateMessage.mockResolvedValue(updatedMessage);
      await service.updateMessage('m1', mkUser('acc1'), {
        body: '<p>x</p>',
        mentionAccountIds: [],
      });
      expect(mockRepo.countAccountsByIds).not.toHaveBeenCalled();
      expect(mockRepo.updateMessage.mock.calls[0][1].mentionAccountIds).toEqual([]);
    });

    it('mentionAccountIds 未指定なら undefined（据え置き）で渡す', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'acc1' });
      mockRepo.updateMessage.mockResolvedValue(updatedMessage);
      await service.updateMessage('m1', mkUser('acc1'), { body: '<p>x</p>' });
      expect(mockRepo.countAccountsByIds).not.toHaveBeenCalled();
      expect(mockRepo.updateMessage.mock.calls[0][1].mentionAccountIds).toBeUndefined();
    });

    it('存在しない accountId が含まれると BadRequest を投げ updateMessage を呼ばない', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'acc1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      await expect(
        service.updateMessage('m1', mkUser('acc1'), {
          body: '<p>x</p>',
          mentionAccountIds: ['u2', 'ghost'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.updateMessage).not.toHaveBeenCalled();
    });

    it('検証通過後の FK 違反（P2003）は 400 へ変換する（TOCTOU）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'acc1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.updateMessage.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'test' }),
      );
      await expect(
        service.updateMessage('m1', mkUser('acc1'), {
          body: '<p>x</p>',
          mentionAccountIds: ['u2'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('P2003 以外の Prisma エラーは握らず再 throw する（filter へ委譲 / §4）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'acc1' });
      mockRepo.countAccountsByIds.mockResolvedValue(1);
      mockRepo.updateMessage.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('other', { code: 'P2002', clientVersion: 'test' }),
      );
      await expect(
        service.updateMessage('m1', mkUser('acc1'), {
          body: '<p>x</p>',
          mentionAccountIds: ['u2'],
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('deleteMessage（dsk-0316: 発話「その他」> メッセージの削除）', () => {
    it('対象メッセージが無いと NotFound を投げ deleteMessage を呼ばない', async () => {
      mockRepo.findMessageById.mockResolvedValue(null);
      await expect(service.deleteMessage('m-missing', mkUser('u1'))).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.deleteMessage).not.toHaveBeenCalled();
    });

    it('投稿者本人でないと Forbidden を投げ deleteMessage を呼ばない（IDOR 防止 / deleteTheme と同境界）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'owner' });
      await expect(service.deleteMessage('m1', mkUser('intruder'))).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.deleteMessage).not.toHaveBeenCalled();
    });

    it('ADMIN は他者の発話も削除できること（H4 ADMIN バイパス）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'other-user' });
      mockRepo.deleteMessage.mockResolvedValue({ id: 'm1' });
      const result = await service.deleteMessage('m1', mkUser('admin-user', Role.ADMIN));
      expect(mockRepo.deleteMessage).toHaveBeenCalledWith('m1');
      expect(result.success).toBe(true);
    });

    it('投稿者本人なら物理削除して message レスポンスを返す', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1', authorId: 'owner' });
      mockRepo.deleteMessage.mockResolvedValue({ id: 'm1' });
      const result = await service.deleteMessage('m1', mkUser('owner'));
      expect(mockRepo.deleteMessage).toHaveBeenCalledWith('m1');
      expect(result.success).toBe(true);
      expect(result.data.message).toBe('Chat message deleted successfully');
    });
  });

  describe('toggleMessageReaction', () => {
    it('対象メッセージが無いと NotFound を投げ create/delete を呼ばない', async () => {
      mockRepo.findMessageById.mockResolvedValue(null);
      await expect(
        service.toggleMessageReaction('m-missing', 'acc1', { emoji: '👍' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.createReaction).not.toHaveBeenCalled();
      expect(mockRepo.deleteReactions).not.toHaveBeenCalled();
    });

    it('既存リアクションが無ければ作成し reacted=true を返す（付与）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1' });
      mockRepo.findReaction.mockResolvedValue(null);
      mockRepo.createReaction.mockResolvedValue({ id: 'r1' });
      const result = await service.toggleMessageReaction('m1', 'acc1', { emoji: '👍' });
      expect(mockRepo.createReaction).toHaveBeenCalledWith({
        messageId: 'm1',
        authorId: 'acc1',
        emoji: '👍',
      });
      expect(mockRepo.deleteReactions).not.toHaveBeenCalled();
      expect(result.data.reacted).toBe(true);
    });

    it('既存リアクションが在れば deleteMany で解除し reacted=false を返す（トグル）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1' });
      mockRepo.findReaction.mockResolvedValue({ id: 'r1' });
      mockRepo.deleteReactions.mockResolvedValue({ count: 1 });
      const result = await service.toggleMessageReaction('m1', 'acc1', { emoji: '👍' });
      // 冪等化: id 指定 delete ではなく対象一致の deleteMany（対象 0 でもエラー化しない）。
      expect(mockRepo.deleteReactions).toHaveBeenCalledWith({ messageId: 'm1' }, 'acc1', '👍');
      expect(mockRepo.createReaction).not.toHaveBeenCalled();
      expect(result.data.reacted).toBe(false);
    });

    it('並列連打で作成側が P2002 競合した時は握って reacted=true を返す（冪等）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1' });
      // findReaction では未検出（並列の別リクエストが先に作成したケース）。
      mockRepo.findReaction.mockResolvedValue(null);
      mockRepo.createReaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const result = await service.toggleMessageReaction('m1', 'acc1', { emoji: '👍' });
      // 既に存在＝トグル結果としては付与済みと同義。409 に流さずに正常レスポンスへ。
      expect(result.data.reacted).toBe(true);
    });

    it('P2002 以外の Prisma エラーは握らず再 throw する（filter へ委譲）', async () => {
      mockRepo.findMessageById.mockResolvedValue({ id: 'm1' });
      mockRepo.findReaction.mockResolvedValue(null);
      mockRepo.createReaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK failed', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );
      await expect(service.toggleMessageReaction('m1', 'acc1', { emoji: '👍' })).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });
  });

  describe('toggleThemeReaction', () => {
    it('対象テーマが無いと NotFound を投げる', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.toggleThemeReaction('t-missing', 'acc1', { emoji: '🎉' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.createReaction).not.toHaveBeenCalled();
    });

    it('既存が無ければ themeId で作成し reacted=true を返す', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.findReaction.mockResolvedValue(null);
      mockRepo.createReaction.mockResolvedValue({ id: 'r1' });
      const result = await service.toggleThemeReaction('t1', 'acc1', { emoji: '🎉' });
      expect(mockRepo.createReaction).toHaveBeenCalledWith({
        themeId: 't1',
        authorId: 'acc1',
        emoji: '🎉',
      });
      expect(result.data.reacted).toBe(true);
    });

    it('既存が在れば themeId 一致の deleteMany で解除し reacted=false を返す', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't1', authorId: 'u1' });
      mockRepo.findReaction.mockResolvedValue({ id: 'r9' });
      mockRepo.deleteReactions.mockResolvedValue({ count: 1 });
      const result = await service.toggleThemeReaction('t1', 'acc1', { emoji: '🎉' });
      expect(mockRepo.deleteReactions).toHaveBeenCalledWith({ themeId: 't1' }, 'acc1', '🎉');
      expect(result.data.reacted).toBe(false);
    });
  });

  // 存在秘匿 / IDOR（rete-hardening）: 他 Space のリソースを直打ちしても「無いことにする」（404）。
  // 一覧は可視 Space 集合へフィルタし越境器の結果を含めない。enforcement は service 層、
  // ScopeVisibilityService が 404（NotFound）を throw する経路を assert する（success フラグだけでなく
  // 例外型 / 副作用未呼び出し / 可視集合の配線を検証）。SPACE_X = 越境先（非可視）の器 id とする。
  describe('存在秘匿 / IDOR（越境アクセスは 404 / 一覧から除外 / rete-hardening）', () => {
    const SPACE_X = 'space-x-foreign';
    /** 越境（非可視）状態を作る: 存在秘匿ガードを NotFound へ差し替える。 */
    const denyVisibility = () =>
      mockScopeVisibility.assertVisibleOr404.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );

    it('findThemes は可視 Space 集合を解決し repository の where フィルタへ渡す（query.spaceId 越境を封じる）', async () => {
      mockScopeVisibility.resolveVisibleSpaceIds.mockResolvedValue(['space-a', 'space-b']);
      mockRepo.findThemesAndCount.mockResolvedValue({
        items: [],
        total: 0,
        mentionedThemeIds: new Set(),
        unreadThemeIds: new Set(),
      });
      // 攻撃者は越境器 SPACE_X を query.spaceId に直打ちするが、service は可視集合のみを repository へ渡す。
      await service.findThemes({ page: 1, limit: 20, spaceId: SPACE_X } as never, 'me');
      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith('me');
      // 3rd 引数（visibleSpaceIds）= 可視集合。SPACE_X はここに含まれない＝repository where で 0 件へ畳まれる。
      expect(mockRepo.findThemesAndCount.mock.calls[0][2]).toEqual(['space-a', 'space-b']);
      expect(mockRepo.findThemesAndCount.mock.calls[0][2]).not.toContain(SPACE_X);
    });

    it('findThemeDetail は越境テーマを 404 にし既読化（markThemeRead）もしない', async () => {
      // v2-255: 実在と所属 Space の判定は同梱なしの軽い取得（findById）で行い、詳細（findThemeDetail）は
      // 可視が確定した後だけ読む（不在と非可視の同期コストを揃える・存在内容の水和を漏らさない）。
      mockRepo.findById.mockResolvedValue({ id: 't-foreign', spaceId: SPACE_X, authorId: 'owner' });
      denyVisibility();
      await expect(service.findThemeDetail('t-foreign', 'intruder')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.findThemeDetail).not.toHaveBeenCalled();
      expect(mockRepo.markThemeRead).not.toHaveBeenCalled();
    });

    it('postMessage は越境テーマへの投稿を 404 にし createMessage を呼ばない', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't-foreign', spaceId: SPACE_X, authorId: 'owner' });
      denyVisibility();
      await expect(service.postMessage('t-foreign', 'intruder', { body: 'hi' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.createMessage).not.toHaveBeenCalled();
    });

    it('updateTheme は越境テーマを 404 にする（所有判定 403 より先に弾き存在を漏らさない）', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't-foreign', spaceId: SPACE_X, authorId: 'owner' });
      denyVisibility();
      await expect(
        service.updateTheme('t-foreign', { title: 'x' }, mkUser('intruder')),
      ).rejects.toThrow(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.updateTheme).not.toHaveBeenCalled();
    });

    it('deleteTheme は越境テーマを 404 にし deleteTheme を呼ばない', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't-foreign', spaceId: SPACE_X, authorId: 'owner' });
      denyVisibility();
      await expect(service.deleteTheme('t-foreign', mkUser('intruder'))).rejects.toThrow(
        NotFoundException,
      );
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.deleteTheme).not.toHaveBeenCalled();
    });

    it('updateMessage は越境メッセージ（親テーマ非可視）を 404 にし updateMessage を呼ばない', async () => {
      // message 自身は spaceId を持たず親テーマ経由で解決する（repository が theme を同梱）。
      mockRepo.findMessageById.mockResolvedValue({
        id: 'm-foreign',
        authorId: 'owner',
        theme: { spaceId: SPACE_X },
      });
      denyVisibility();
      await expect(
        service.updateMessage('m-foreign', mkUser('intruder'), { body: '<p>x</p>' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.updateMessage).not.toHaveBeenCalled();
    });

    it('deleteMessage は越境メッセージ（親テーマ非可視）を 404 にし deleteMessage を呼ばない', async () => {
      mockRepo.findMessageById.mockResolvedValue({
        id: 'm-foreign',
        authorId: 'owner',
        theme: { spaceId: SPACE_X },
      });
      denyVisibility();
      await expect(service.deleteMessage('m-foreign', mkUser('intruder'))).rejects.toThrow(
        NotFoundException,
      );
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.deleteMessage).not.toHaveBeenCalled();
    });

    it('toggleMessageReaction は越境メッセージを 404 にし create/delete を呼ばない', async () => {
      mockRepo.findMessageById.mockResolvedValue({
        id: 'm-foreign',
        authorId: 'owner',
        theme: { spaceId: SPACE_X },
      });
      denyVisibility();
      await expect(
        service.toggleMessageReaction('m-foreign', 'intruder', { emoji: '👍' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.createReaction).not.toHaveBeenCalled();
      expect(mockRepo.deleteReactions).not.toHaveBeenCalled();
    });

    it('toggleThemeReaction は越境テーマを 404 にし createReaction を呼ばない', async () => {
      mockRepo.findById.mockResolvedValue({ id: 't-foreign', spaceId: SPACE_X, authorId: 'owner' });
      denyVisibility();
      await expect(
        service.toggleThemeReaction('t-foreign', 'intruder', { emoji: '🎉' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.createReaction).not.toHaveBeenCalled();
    });

    it('createTheme は非可視 Space への越境作成を 404 にし createTheme を呼ばない（越境作成封鎖）', async () => {
      denyVisibility();
      await expect(
        service.createTheme('intruder', { title: 'T', spaceId: SPACE_X }),
      ).rejects.toThrow(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('intruder', SPACE_X);
      expect(mockRepo.createTheme).not.toHaveBeenCalled();
    });
  });

  // v2-246: 不在と非可視の応答平準化（存在秘匿）。非可視 404 は、同じ経路の対象不在 404 と同じ
  // message で返る（文言差がそのまま「対象が存在するか」の oracle になる）。status はどちらも 404。
  describe('存在秘匿の応答平準化（不在と非可視が同一文言・v2-246）', () => {
    const SPACE_X = 'space-x-foreign';
    /** 越境（非可視）状態を作る: 共有ガードを対象不在と同じ 404 文言で拒否させる。 */
    const denyVisibility = () =>
      mockScopeVisibility.assertVisibleOr404.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );

    it('テーマ系（detail / update / delete / reaction / postMessage / create）の非可視 404 は対象不在と同じ文言', async () => {
      mockRepo.findThemeDetail.mockResolvedValue({ id: 't-foreign', spaceId: SPACE_X });
      mockRepo.findById.mockResolvedValue({ id: 't-foreign', spaceId: SPACE_X, authorId: 'owner' });
      denyVisibility();

      await expect(service.findThemeDetail('t-foreign', 'intruder')).rejects.toMatchObject({
        message: CHAT_THEME_NOT_FOUND_MESSAGE,
      });
      await expect(
        service.updateTheme('t-foreign', { title: 'x' } as never, mkUser('intruder')),
      ).rejects.toMatchObject({ message: CHAT_THEME_NOT_FOUND_MESSAGE });
      await expect(service.deleteTheme('t-foreign', mkUser('intruder'))).rejects.toMatchObject({
        message: CHAT_THEME_NOT_FOUND_MESSAGE,
      });
      await expect(
        service.toggleThemeReaction('t-foreign', 'intruder', { emoji: '🎉' } as never),
      ).rejects.toMatchObject({ message: CHAT_THEME_NOT_FOUND_MESSAGE });
      await expect(
        service.postMessage('t-foreign', 'intruder', { body: 'x' } as never),
      ).rejects.toMatchObject({ message: CHAT_THEME_NOT_FOUND_MESSAGE });
      // createTheme は器の非可視だけを弾く経路（対象不在の twin が無い）が、言語を揃えて同じ文言で返す。
      await expect(
        service.createTheme('intruder', { title: 'T', spaceId: SPACE_X } as never),
      ).rejects.toMatchObject({ message: CHAT_THEME_NOT_FOUND_MESSAGE });
    });

    it('メッセージ系（reaction / update / delete）の非可視 404 は対象不在と同じ文言', async () => {
      mockRepo.findMessageById.mockResolvedValue({
        id: 'm-foreign',
        authorId: 'owner',
        theme: { spaceId: SPACE_X },
      });
      denyVisibility();

      await expect(
        service.toggleMessageReaction('m-foreign', 'intruder', { emoji: '👍' } as never),
      ).rejects.toMatchObject({ message: CHAT_MESSAGE_NOT_FOUND_MESSAGE });
      await expect(
        service.updateMessage('m-foreign', mkUser('intruder'), { body: 'x' } as never),
      ).rejects.toMatchObject({ message: CHAT_MESSAGE_NOT_FOUND_MESSAGE });
      await expect(service.deleteMessage('m-foreign', mkUser('intruder'))).rejects.toMatchObject({
        message: CHAT_MESSAGE_NOT_FOUND_MESSAGE,
      });
    });
  });

  // v2-255: 存在秘匿の応答コスト平準化（timing oracle の解消）。対象が存在しない枝も、存在するが非可視の
  // 枝と同じく「可視範囲（可視 Space 集合）の解決 → 対象取得」の順を通る。対象取得 1 回で早期に 404 を
  // 返すと、応答時間の差が「対象が存在するか」を読み分ける oracle になる（v2-246 の残差）。可視範囲の
  // 解決は ScopeVisibilityService の RequestCache（同一リクエスト・同一 accountId）で 1 回へ畳まれるため、
  // 後続のガード呼び出しは DB 往復を増やさない＝不在/非可視が同一コストになる。
  describe('存在秘匿の応答コスト平準化（不在でも可視範囲を先に解決・v2-255）', () => {
    /** 直近の対象取得より前に、直近の可視範囲の解決が呼ばれていること（クエリ順序の不変条件）。 */
    const expectVisibleResolutionBefore = (repoMock: jest.Mock) => {
      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith('intruder');
      const resolveOrders = mockScopeVisibility.resolveVisibleSpaceIds.mock.invocationCallOrder;
      const repoOrders = repoMock.mock.invocationCallOrder;
      expect(resolveOrders.length).toBeGreaterThan(0);
      expect(repoOrders.length).toBeGreaterThan(0);
      expect(resolveOrders[resolveOrders.length - 1]).toBeLessThan(
        repoOrders[repoOrders.length - 1],
      );
    };

    it('テーマ系（detail / update / delete / reaction / postMessage）は対象不在でも可視範囲の解決を先に通る', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.findThemeDetail('t-missing', 'intruder')).rejects.toThrow(
        NotFoundException,
      );
      // detail は軽い取得（findById）で不在を判定し、同梱つきの詳細取得は呼ばない（コストを非可視枝と揃える）。
      expectVisibleResolutionBefore(mockRepo.findById);
      expect(mockRepo.findThemeDetail).not.toHaveBeenCalled();

      await expect(
        service.updateTheme('t-missing', { title: 'x' } as never, mkUser('intruder')),
      ).rejects.toThrow(NotFoundException);
      expectVisibleResolutionBefore(mockRepo.findById);

      await expect(service.deleteTheme('t-missing', mkUser('intruder'))).rejects.toThrow(
        NotFoundException,
      );
      expectVisibleResolutionBefore(mockRepo.findById);

      await expect(
        service.toggleThemeReaction('t-missing', 'intruder', { emoji: '🎉' } as never),
      ).rejects.toThrow(NotFoundException);
      expectVisibleResolutionBefore(mockRepo.findById);

      await expect(
        service.postMessage('t-missing', 'intruder', { body: 'x' } as never),
      ).rejects.toThrow(NotFoundException);
      expectVisibleResolutionBefore(mockRepo.findById);
    });

    it('メッセージ系（reaction / update / delete）は対象不在でも可視範囲の解決を先に通る', async () => {
      mockRepo.findMessageById.mockResolvedValue(null);

      await expect(
        service.toggleMessageReaction('m-missing', 'intruder', { emoji: '👍' } as never),
      ).rejects.toThrow(NotFoundException);
      expectVisibleResolutionBefore(mockRepo.findMessageById);

      await expect(
        service.updateMessage('m-missing', mkUser('intruder'), { body: 'x' } as never),
      ).rejects.toThrow(NotFoundException);
      expectVisibleResolutionBefore(mockRepo.findMessageById);

      await expect(service.deleteMessage('m-missing', mkUser('intruder'))).rejects.toThrow(
        NotFoundException,
      );
      expectVisibleResolutionBefore(mockRepo.findMessageById);
    });
  });
});
