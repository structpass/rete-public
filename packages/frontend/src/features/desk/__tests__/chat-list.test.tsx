import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { ChatList } from '../components/chat-list';
import type { ChatThemeSummary } from '../lib/api';
import { ChatThemeStatus } from '@rete/shared';

// ChatListRow は useDraggable を使うため DndContext 配下で描画する。
const withDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>);

const base = {
  status: ChatThemeStatus.OPEN,
  archived: false,
  hasUnread: false,
  author: { id: 'u1', name: '山田' },
  messageCount: 3,
  lastMessageAt: '2026-06-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
};

const theme = (over: Partial<ChatThemeSummary>): ChatThemeSummary =>
  ({ ...base, id: 'theme-x', title: 'テーマ', hasTenmatsu: false, ...over }) as ChatThemeSummary;

const rowTenmatsuIcon = (title: string) =>
  screen.getByText(title).closest('button')!.querySelector('.desk-thread-tenmatsu');

describe('ChatList — 顛末アイコンは実データ（hasTenmatsu）で判定する', () => {
  // 顛末アイコン = .desk-thread-tenmatsu。サンプルハッシュ（sampleChatMeta）ではなく
  // theme.hasTenmatsu で出し分ける。theme-d はハッシュ上は顛末ありだが hasTenmatsu=false なら出さない
  // （開発統括報告のバグ「顛末がないのに顛末アイコンが付く」を捕捉する）。theme-a はハッシュ上は顛末なしだが
  // hasTenmatsu=true なら出す。
  const themes: ChatThemeSummary[] = [
    theme({ id: 'theme-a', title: '顛末ありテーマ', hasTenmatsu: true }),
    theme({ id: 'theme-d', title: '顛末なしテーマ', hasTenmatsu: false }),
  ];

  it('hasTenmatsu=true のテーマにのみ顛末アイコンを描画すること', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowTenmatsuIcon('顛末ありテーマ')).not.toBeNull();
  });

  it('hasTenmatsu=false のテーマには顛末アイコンを描画しないこと（ハッシュ上は顛末ありの id でも）', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowTenmatsuIcon('顛末なしテーマ')).toBeNull();
  });
});

describe('ChatList — メンションアイコンは実データ（hasMentionToMe）で判定する（rete-desk-0049）', () => {
  // 自分宛メンションアイコン = aria-label「自分宛メンションあり」。sampleChatMeta（旧サンプルハッシュ）を
  // 撤去し、hasMentionToMe（actor 視点の集約 / バックエンド判定）で出し分ける。
  const themes: ChatThemeSummary[] = [
    theme({ id: 'theme-m', title: 'メンションありテーマ', hasMentionToMe: true }),
    theme({ id: 'theme-n', title: 'メンションなしテーマ', hasMentionToMe: false }),
  ];

  const rowMentionIcon = (title: string) =>
    screen.getByText(title).closest('button')!.querySelector('.desk-thread-count.is-mention');

  it('hasMentionToMe=true のテーマにのみメンションアイコンを描画すること', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowMentionIcon('メンションありテーマ')).not.toBeNull();
  });

  it('hasMentionToMe=false のテーマにはメンションアイコンを描画しないこと', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowMentionIcon('メンションなしテーマ')).toBeNull();
  });
});

describe('ChatList — 未読は実データ（hasUnread）で題名太字を出し分ける（rete-desk-0075）', () => {
  // 未読 = .desk-chat-card.is-unread（CSS で題名太字）。サンプルハッシュ（sampleUnread）を撤去し、
  // backend が ChatReadState と他者新着から集約した hasUnread で出し分ける（DBT-4 返済）。
  const themes: ChatThemeSummary[] = [
    theme({ id: 'theme-u', title: '未読テーマ', hasUnread: true }),
    theme({ id: 'theme-r', title: '既読テーマ', hasUnread: false }),
  ];

  const rowCard = (title: string) => screen.getByText(title).closest('button')!;

  it('hasUnread=true のテーマにのみ is-unread を付与すること', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowCard('未読テーマ').classList.contains('is-unread')).toBe(true);
  });

  it('hasUnread=false のテーマには is-unread を付与しないこと', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowCard('既読テーマ').classList.contains('is-unread')).toBe(false);
  });
});

describe('ChatList — アクティブ枠は activeId で描く・詳細を閉じても残る（dsk-0401）', () => {
  const themes: ChatThemeSummary[] = [
    theme({ id: 'theme-a', title: 'テーマA' }),
    theme({ id: 'theme-b', title: 'テーマB' }),
  ];
  const rowCard = (title: string) => screen.getByText(title).closest('button')!;

  it('activeId 未指定時は selectedId で枠を描く（後方互換）', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId="theme-a"
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowCard('テーマA').classList.contains('sp-row-ring')).toBe(true);
    expect(rowCard('テーマB').classList.contains('sp-row-ring')).toBe(false);
  });

  it('selectedId=null（詳細を閉じた状態）でも activeId が残っていれば枠が付く', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        activeId="theme-a"
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowCard('テーマA').classList.contains('sp-row-ring')).toBe(true);
  });

  it('selectedId=null かつ activeId=null なら枠は付かない（初期状態）', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        activeId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(rowCard('テーマA').classList.contains('sp-row-ring')).toBe(false);
    expect(rowCard('テーマB').classList.contains('sp-row-ring')).toBe(false);
  });
});

describe('ChatList — 検索キーワードの題名ハイライト（rete-desk-0048）', () => {
  const themes: ChatThemeSummary[] = [theme({ id: 'theme-h', title: '在庫の発注フロー' })];

  it('highlight 指定時は一致部分を <mark class="sp-search-hl"> で包むこと', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
        highlight="発注"
      />,
    );
    const mark = document.querySelector('.sp-search-hl');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('発注');
    // 題名全体は分割しても元テキストを保持する（mdl-0050 で sp-row-title が併設されたため contains 判定）。
    expect(
      screen.getByText((_, el) => !!el?.classList.contains('desk-chat-card-title')),
    ).toHaveTextContent('在庫の発注フロー');
  });

  it('highlight 未指定ならハイライトを描画しないこと', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
      />,
    );
    expect(document.querySelector('.sp-search-hl')).toBeNull();
  });

  it('highlight が空文字なら（trim 後 falsy）ハイライトを描画しないこと', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
        highlight="   "
      />,
    );
    expect(document.querySelector('.sp-search-hl')).toBeNull();
    // 題名は欠落せず素通しで描画される。
    expect(screen.getByText('在庫の発注フロー')).toBeInTheDocument();
  });

  it('題名に一致しないキーワード（本文ヒットでカードは出る）ならハイライトを描画しないこと', () => {
    withDnd(
      <ChatList
        themes={themes}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
        highlight="存在しない語"
      />,
    );
    expect(document.querySelector('.sp-search-hl')).toBeNull();
    expect(screen.getByText('在庫の発注フロー')).toBeInTheDocument();
  });

  it('題名内に複数回一致する場合はすべてをハイライトすること', () => {
    withDnd(
      <ChatList
        themes={[theme({ id: 'theme-rep', title: '在庫と在庫の差' })]}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
        highlight="在庫"
      />,
    );
    const marks = document.querySelectorAll('.sp-search-hl');
    expect(marks).toHaveLength(2);
  });

  it('大文字小文字を無視して一致させること', () => {
    withDnd(
      <ChatList
        themes={[theme({ id: 'theme-en', title: 'Stock Order' })]}
        selectedId={null}
        loading={false}
        error={null}
        onSelect={vi.fn()}
        highlight="order"
      />,
    );
    const mark = document.querySelector('.sp-search-hl');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('Order');
  });
});
