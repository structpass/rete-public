import { ChatThemeStatus } from '@prisma/client';
import { toChatMessageResponse, toChatThemeSummary, toChatThemeDetail } from './chat.mapper';

// 固定日時で ISO 文字列変換を決定的に検証する。
const CREATED = new Date('2026-05-29T01:23:45.000Z');
const LAST_MESSAGE = new Date('2026-05-30T12:00:00.000Z');
const author = { id: 'acc-1', name: '山田太郎' };

// 添付 include 済みレコード（FL-3b 同梱）の最小フィクスチャ。
function makeAttachment(id: string) {
  return {
    id,
    fileVersionId: 'ver-1',
    taskId: null,
    chatMessageId: null,
    themeId: null,
    announcementId: null,
    taskCommentId: null,
    attachedById: 'acc-1',
    createdAt: CREATED,
    fileVersion: {
      id: 'ver-1',
      versionNo: 2,
      byteSize: BigInt(2048),
      mimeType: 'application/pdf',
      file: { id: 'file-1', name: '仕様書.pdf' },
    },
    attachedBy: { name: '山田太郎' },
  };
}

describe('chat.mapper', () => {
  describe('toChatMessageResponse', () => {
    const message = {
      id: 'msg-1',
      themeId: 'theme-1',
      authorId: 'acc-1',
      body: '取込完了しました',
      createdAt: CREATED,
      updatedAt: CREATED,
      author,
    };

    it('発話の主要フィールドと投稿者(id+name)を DTO に写すこと', () => {
      const dto = toChatMessageResponse(message);
      expect(dto.id).toBe('msg-1');
      expect(dto.themeId).toBe('theme-1');
      expect(dto.body).toBe('取込完了しました');
      expect(dto.author).toEqual({ id: 'acc-1', name: '山田太郎' });
    });

    it('createdAt を ISO 8601 文字列へ変換すること', () => {
      const dto = toChatMessageResponse(message);
      expect(dto.createdAt).toBe('2026-05-29T01:23:45.000Z');
      expect(typeof dto.createdAt).toBe('string');
    });

    it('author は id/name のみ公開し authorId 等の生フィールドを漏らさないこと（§1 DTO 境界）', () => {
      const dto = toChatMessageResponse(message);
      expect(Object.keys(dto.author)).toEqual(['id', 'name']);
      expect((dto as unknown as Record<string, unknown>).authorId).toBeUndefined();
    });

    it('reactions 未指定（postMessage 経路）でも空配列にフォールバックすること', () => {
      const dto = toChatMessageResponse(message);
      expect(dto.reactions).toEqual([]);
    });

    it('reactions を emoji 別に集計し count / reactedByMe を算出すること', () => {
      const withReactions = {
        ...message,
        reactions: [
          { emoji: '👍', authorId: 'acc-1' },
          { emoji: '👍', authorId: 'acc-2' },
          { emoji: '🎉', authorId: 'acc-2' },
        ],
      };
      const dto = toChatMessageResponse(withReactions, 'acc-1');
      const thumbs = dto.reactions.find((r) => r.emoji === '👍');
      const tada = dto.reactions.find((r) => r.emoji === '🎉');
      expect(thumbs).toEqual({ emoji: '👍', count: 2, reactedByMe: true });
      expect(tada).toEqual({ emoji: '🎉', count: 1, reactedByMe: false });
    });

    it('currentUserId 未指定なら reactedByMe は全て false', () => {
      const withReactions = {
        ...message,
        reactions: [{ emoji: '👍', authorId: 'acc-1' }],
      };
      const dto = toChatMessageResponse(withReactions);
      expect(dto.reactions[0].reactedByMe).toBe(false);
    });

    it('attachments 未指定（postMessage 経路）でも空配列にフォールバックすること', () => {
      const dto = toChatMessageResponse(message);
      expect(dto.attachments).toEqual([]);
    });

    it('mentions 未指定でも空配列にフォールバックすること（rete-desk-0049）', () => {
      const dto = toChatMessageResponse(message);
      expect(dto.mentions).toEqual([]);
    });

    it('mentions を宛先アカウントの id+name 配列へマップすること（§1 DTO 境界・account 生フィールド非露出）', () => {
      const withMentions = {
        ...message,
        mentions: [
          { account: { id: 'acc-2', name: '田中花子' } },
          { account: { id: 'acc-3', name: '佐藤次郎' } },
        ],
      };
      const dto = toChatMessageResponse(withMentions);
      expect(dto.mentions).toEqual([
        { id: 'acc-2', name: '田中花子' },
        { id: 'acc-3', name: '佐藤次郎' },
      ]);
    });

    it('attachments を AttachmentResponseDto 形へマップすること（版固定・byteSize は number）', () => {
      const withAttachments = { ...message, attachments: [makeAttachment('att-1')] };
      const dto = toChatMessageResponse(withAttachments);
      expect(dto.attachments).toHaveLength(1);
      expect(dto.attachments[0]).toEqual({
        id: 'att-1',
        fileId: 'file-1',
        fileName: '仕様書.pdf',
        versionNo: 2,
        byteSize: 2048,
        mimeType: 'application/pdf',
        attachedBy: '山田太郎',
        createdAt: '2026-05-29T01:23:45.000Z',
      });
    });
  });

  describe('toChatThemeSummary', () => {
    const theme = {
      id: 'theme-1',
      title: '入荷遅延の対応',
      description: '詳細説明',
      tenmatsu: null,
      status: ChatThemeStatus.OPEN,
      authorId: 'acc-1',
      lastMessageAt: LAST_MESSAGE,
      archivedAt: null,
      spaceId: null, // CM-2: 器スコープ（既存テーマは null → seed で DEFAULT_CHANNEL に収容）
      createdAt: CREATED,
      updatedAt: CREATED,
      author,
      _count: { messages: 3 },
    };

    it('明細カードの主要フィールドを写し、_count.messages を messageCount に展開すること', () => {
      const dto = toChatThemeSummary(theme);
      expect(dto.id).toBe('theme-1');
      expect(dto.title).toBe('入荷遅延の対応');
      expect(dto.status).toBe('OPEN');
      expect(dto.messageCount).toBe(3);
      expect(dto.author).toEqual({ id: 'acc-1', name: '山田太郎' });
    });

    it('archivedAt=null は archived:false、非 null は archived:true へ畳むこと', () => {
      expect(toChatThemeSummary(theme).archived).toBe(false);
      expect(toChatThemeSummary({ ...theme, archivedAt: CREATED }).archived).toBe(true);
    });

    it('tenmatsu の有無を hasTenmatsu(boolean) へ畳むこと（空白のみは未記録扱い / rete-desk-0050）', () => {
      // summary は tenmatsu 本文を載せず「記録済か」のフラグだけ公開する（顛末フィルタ用）。
      expect(toChatThemeSummary(theme).hasTenmatsu).toBe(false); // tenmatsu:null
      expect(toChatThemeSummary({ ...theme, tenmatsu: '結論メモ' }).hasTenmatsu).toBe(true);
      expect(toChatThemeSummary({ ...theme, tenmatsu: '   ' }).hasTenmatsu).toBe(false);
    });

    it('summary は tenmatsu 本文を含まないこと（フラグのみ公開）', () => {
      const dto = toChatThemeSummary({ ...theme, tenmatsu: '機密の結論' });
      expect((dto as unknown as Record<string, unknown>).tenmatsu).toBeUndefined();
    });

    it('lastMessageAt / createdAt を ISO 文字列へ変換すること', () => {
      const dto = toChatThemeSummary(theme);
      expect(dto.lastMessageAt).toBe('2026-05-30T12:00:00.000Z');
      expect(dto.createdAt).toBe('2026-05-29T01:23:45.000Z');
    });

    it('summary は messages 本体を含まないこと（件数のみ）', () => {
      const dto = toChatThemeSummary(theme);
      expect((dto as unknown as Record<string, unknown>).messages).toBeUndefined();
    });

    it('第2引数 hasMentionToMe を受け取りそのまま反映すること（repository の集約結果 / rete-desk-0049）', () => {
      // repository が一覧ページ全体に対し単一クエリで判定した boolean を受け取る（N+1 プローブを廃止）。
      expect(toChatThemeSummary(theme, true).hasMentionToMe).toBe(true);
      expect(toChatThemeSummary(theme, false).hasMentionToMe).toBe(false);
    });

    it('hasMentionToMe 省略時（userId 無し経路）は false へフォールバックすること', () => {
      expect(toChatThemeSummary(theme).hasMentionToMe).toBe(false);
    });

    it('第3引数 hasUnread を受け取りそのまま反映すること（repository の未読集約結果 / rete-desk-0075）', () => {
      // repository が ChatReadState と他者新着から一覧ページ全体で集約した boolean を受け取る（N+1 なし）。
      expect(toChatThemeSummary(theme, false, true).hasUnread).toBe(true);
      expect(toChatThemeSummary(theme, false, false).hasUnread).toBe(false);
    });

    it('hasUnread 省略時（userId 無し経路）は false へフォールバックすること', () => {
      expect(toChatThemeSummary(theme).hasUnread).toBe(false);
    });
  });

  describe('toChatThemeDetail', () => {
    const makeTheme = (description: string | null) => ({
      id: 'theme-1',
      title: '入荷遅延の対応',
      description,
      tenmatsu: null,
      status: ChatThemeStatus.OPEN,
      authorId: 'acc-1',
      lastMessageAt: LAST_MESSAGE,
      archivedAt: null,
      spaceId: null, // CM-2: 器スコープ（既存テーマは null → seed で DEFAULT_CHANNEL に収容）
      createdAt: CREATED,
      updatedAt: LAST_MESSAGE,
      author,
      messages: [
        {
          id: 'msg-1',
          themeId: 'theme-1',
          authorId: 'acc-1',
          body: '一報です',
          createdAt: CREATED,
          updatedAt: CREATED,
          author,
        },
      ],
    });

    it('テーマ本体 + メッセージ全件をネストして写すこと', () => {
      const dto = toChatThemeDetail(makeTheme('詳細説明'));
      expect(dto.id).toBe('theme-1');
      expect(dto.description).toBe('詳細説明');
      expect(dto.messages).toHaveLength(1);
      expect(dto.messages[0].body).toBe('一報です');
      expect(dto.messages[0].createdAt).toBe('2026-05-29T01:23:45.000Z');
    });

    it('description が null の場合はそのまま null を保持すること', () => {
      const dto = toChatThemeDetail(makeTheme(null));
      expect(dto.description).toBeNull();
    });

    it('tenmatsu をそのまま写し、未記入は null を保持すること（rete-desk-0092）', () => {
      expect(toChatThemeDetail(makeTheme('x')).tenmatsu).toBeNull();
      expect(toChatThemeDetail({ ...makeTheme('x'), tenmatsu: '結論' }).tenmatsu).toBe('結論');
    });

    it('archivedAt を archived(boolean) へ畳むこと', () => {
      expect(toChatThemeDetail(makeTheme('x')).archived).toBe(false);
      expect(toChatThemeDetail({ ...makeTheme('x'), archivedAt: CREATED }).archived).toBe(true);
    });

    it('lastMessageAt / createdAt / updatedAt を ISO 文字列へ変換すること', () => {
      const dto = toChatThemeDetail(makeTheme('x'));
      expect(dto.lastMessageAt).toBe('2026-05-30T12:00:00.000Z');
      expect(dto.createdAt).toBe('2026-05-29T01:23:45.000Z');
      expect(dto.updatedAt).toBe('2026-05-30T12:00:00.000Z');
    });

    it('テーマ起点カードの reactions を集計し reactedByMe を currentUserId で判定すること', () => {
      const theme = {
        ...makeTheme('x'),
        reactions: [
          { emoji: '❤️', authorId: 'acc-1' },
          { emoji: '❤️', authorId: 'acc-9' },
        ],
      };
      const dto = toChatThemeDetail(theme, 'acc-1');
      const heart = dto.reactions.find((r) => r.emoji === '❤️');
      expect(heart).toEqual({ emoji: '❤️', count: 2, reactedByMe: true });
    });

    it('テーマ reactions 未指定なら空配列にフォールバックすること', () => {
      const dto = toChatThemeDetail(makeTheme('x'));
      expect(dto.reactions).toEqual([]);
    });

    it('テーマ attachments 未指定なら空配列にフォールバックすること', () => {
      const dto = toChatThemeDetail(makeTheme('x'));
      expect(dto.attachments).toEqual([]);
    });

    it('テーマ attachments を AttachmentResponseDto 形へマップすること', () => {
      const theme = { ...makeTheme('x'), attachments: [makeAttachment('att-9')] };
      const dto = toChatThemeDetail(theme);
      expect(dto.attachments).toHaveLength(1);
      expect(dto.attachments[0].id).toBe('att-9');
      expect(dto.attachments[0].fileName).toBe('仕様書.pdf');
    });

    it('メッセージ単位の attachments も同梱マップすること', () => {
      const base = makeTheme('x');
      const theme = {
        ...base,
        messages: [{ ...base.messages[0], attachments: [makeAttachment('att-m')] }],
      };
      const dto = toChatThemeDetail(theme);
      expect(dto.messages[0].attachments).toHaveLength(1);
      expect(dto.messages[0].attachments[0].id).toBe('att-m');
    });
  });
});
