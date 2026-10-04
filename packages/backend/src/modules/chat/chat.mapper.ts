import type { ChatTheme, ChatMessage, Account } from '@prisma/client';
import type { ChatThemeStatus } from '@rete/shared';
import { toAttachment } from '../attachments/attachments.mapper';
import type { AttachmentWithDisplay } from '../attachments/repositories/attachments.repository';
import type {
  ChatAuthorDto,
  ChatMessageResponseDto,
  ChatThemeSummaryDto,
  ChatThemeDetailDto,
  ReactionSummaryDto,
} from './dto/chat-response.dto';

type AuthorPick = Pick<Account, 'id' | 'name'>;
// mapper はリアクションの emoji と押下者 id だけ集計に使う（他列は不要・include を絞れる）。
type ReactionPick = { emoji: string; authorId: string };
// メンション先は account を id+name に絞って include する（DTO 境界・rete-desk-0049）。
type MentionPick = { account: AuthorPick };
// reactions / attachments / mentions は経路により include しないため optional 受け（§D・型崩れ回避）。
type MessageWithAuthor = ChatMessage & {
  author: AuthorPick;
  reactions?: ReactionPick[];
  attachments?: AttachmentWithDisplay[];
  mentions?: MentionPick[];
};
type ThemeWithAuthorAndCount = ChatTheme & {
  author: AuthorPick;
  _count: { messages: number };
};
type ThemeWithMessages = ChatTheme & {
  author: AuthorPick;
  messages: MessageWithAuthor[];
  reactions?: ReactionPick[];
  attachments?: AttachmentWithDisplay[];
};

function toAuthor(author: AuthorPick): ChatAuthorDto {
  return { id: author.id, name: author.name };
}

/**
 * リアクション生レコードを emoji 別に集計し DTO 形へ畳む。
 * count = その emoji の総数、reactedByMe = currentUserId 本人の押下が含まれるか。
 * 出現順（≒ createdAt 昇順 = 最初に押された emoji が先頭）を保つため Map を使う。
 * task-comments.mapper（dsk-0297）が対象種別非依存のこの関数をそのまま import して再利用する
 * （§3 コピペ禁止）。
 */
export function aggregateReactions(
  reactions: ReactionPick[] | undefined,
  currentUserId?: string,
): ReactionSummaryDto[] {
  const byEmoji = new Map<string, ReactionSummaryDto>();
  for (const r of reactions ?? []) {
    const existing = byEmoji.get(r.emoji);
    if (existing) {
      existing.count += 1;
      if (currentUserId !== undefined && r.authorId === currentUserId) {
        existing.reactedByMe = true;
      }
    } else {
      byEmoji.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        reactedByMe: currentUserId !== undefined && r.authorId === currentUserId,
      });
    }
  }
  return [...byEmoji.values()];
}

export function toChatMessageResponse(
  message: MessageWithAuthor,
  currentUserId?: string,
): ChatMessageResponseDto {
  return {
    id: message.id,
    themeId: message.themeId,
    body: message.body,
    author: toAuthor(message.author),
    createdAt: message.createdAt.toISOString(),
    reactions: aggregateReactions(message.reactions, currentUserId),
    attachments: (message.attachments ?? []).map(toAttachment),
    // メンション先 account を id+name のみへ畳む（生フィールド非露出・§1 DTO 境界）。
    mentions: (message.mentions ?? []).map((m) => toAuthor(m.account)),
  };
}

export function toChatThemeSummary(
  theme: ThemeWithAuthorAndCount,
  // 「このテーマに自分宛メンションを含むメッセージがあるか」。repository が一覧ページ全体に対し
  // 単一の集約クエリで判定した結果を受け取る（N+1 回避 / rete-desk-0049）。userId 無し経路では false。
  hasMentionToMe = false,
  // 「このテーマに未読（自分以外の新着 / 最終既読より後）があるか」。repository が ChatReadState と
  // 他者メッセージ最終時刻を一覧ページ全体で集約した結果を受け取る（N+1 回避 / rete-desk-0075）。
  // 自分起票・自分投稿は未読に数えない。userId 無し経路では false。
  hasUnread = false,
): ChatThemeSummaryDto {
  return {
    id: theme.id,
    title: theme.title,
    // Prisma 生成の `$Enums.ChatThemeStatus`（string literal union）→ shared `enum
    // ChatThemeStatus`（nominal）の橋渡し境界。値の同一性は schema.prisma と shared/chat.ts
    // の SSOT 一致で担保（tasks.mapper と同一規約）。
    status: theme.status as ChatThemeStatus,
    // archivedAt（時刻 or NULL）を boolean へ畳む（レスポンス契約は archived: boolean）。
    archived: theme.archivedAt != null,
    // 顛末（自由記入ノート）の記録有無を boolean へ畳む（顛末フィルタ用 / rete-desk-0050）。
    // 空白のみは未記録扱い（タスク側 0052 の tenmatsu 非空判定と一貫）。本文は summary に載せない。
    hasTenmatsu: theme.tenmatsu != null && theme.tenmatsu.trim() !== '',
    hasMentionToMe,
    hasUnread,
    author: toAuthor(theme.author),
    messageCount: theme._count.messages,
    lastMessageAt: theme.lastMessageAt.toISOString(),
    createdAt: theme.createdAt.toISOString(),
  };
}

export function toChatThemeDetail(
  theme: ThemeWithMessages,
  currentUserId?: string,
): ChatThemeDetailDto {
  return {
    id: theme.id,
    title: theme.title,
    description: theme.description,
    // 顛末（スレッドの結論・自由記入ノート / rete-desk-0092）。未記入は null。
    tenmatsu: theme.tenmatsu,
    status: theme.status as ChatThemeStatus,
    // archivedAt を boolean へ畳む（summary と同じ導出）。
    archived: theme.archivedAt != null,
    author: toAuthor(theme.author),
    messages: theme.messages.map((m) => toChatMessageResponse(m, currentUserId)),
    reactions: aggregateReactions(theme.reactions, currentUserId),
    attachments: (theme.attachments ?? []).map(toAttachment),
    lastMessageAt: theme.lastMessageAt.toISOString(),
    createdAt: theme.createdAt.toISOString(),
    updatedAt: theme.updatedAt.toISOString(),
  };
}
