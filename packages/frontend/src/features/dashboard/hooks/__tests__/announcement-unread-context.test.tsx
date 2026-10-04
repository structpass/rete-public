import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// unread-count fetch をモックし、Provider が「kind 別に 1 回ずつ取得し複数の子へ同一カウントを共有」
// 「decrement で 0 未満に落ちない楽観更新」を行うことを検証する（HM-3・ADR 0029・hom-0073 で kind 分離）。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchAnnouncementUnreadCount } = vi.hoisted(() => ({
  fetchAnnouncementUnreadCount: vi.fn(),
}));
vi.mock('../../lib/api', () => ({
  fetchAnnouncementUnreadCount: (...a: unknown[]) => fetchAnnouncementUnreadCount(...a),
}));

import { AnnouncementUnreadProvider, useAnnouncementUnread } from '../announcement-unread-context';
import type { AnnouncementTagKind } from '../../lib/api';

function Count({ testid, kind }: { testid: string; kind?: AnnouncementTagKind }) {
  const { unreadCount, loading } = useAnnouncementUnread(kind);
  return <div data-testid={testid}>{loading ? 'loading' : String(unreadCount)}</div>;
}

function DecButton({ kind }: { kind?: AnnouncementTagKind }) {
  const { decrement } = useAnnouncementUnread(kind);
  return <button onClick={() => decrement()}>減</button>;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAnnouncementUnreadCount.mockImplementation((kind: AnnouncementTagKind) =>
    Promise.resolve(kind === 'faq' ? 5 : 2),
  );
});

describe('AnnouncementUnreadProvider / useAnnouncementUnread', () => {
  it('kind 省略（board）は 1 回だけ取得し複数の子へ同一カウントを供給する', async () => {
    render(
      <AnnouncementUnreadProvider>
        <Count testid="x" />
        <Count testid="y" />
      </AnnouncementUnreadProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('x')).toHaveTextContent('2'));
    expect(screen.getByTestId('y')).toHaveTextContent('2');
    expect(fetchAnnouncementUnreadCount).toHaveBeenCalledWith('board');
    expect(fetchAnnouncementUnreadCount.mock.calls.filter((c) => c[0] === 'board')).toHaveLength(1);
  });

  it('board / faq は独立してカウントされる（一方の取得結果が他方に混入しない）', async () => {
    render(
      <AnnouncementUnreadProvider>
        <Count testid="board" kind="board" />
        <Count testid="faq" kind="faq" />
      </AnnouncementUnreadProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('board')).toHaveTextContent('2'));
    expect(screen.getByTestId('faq')).toHaveTextContent('5');
    expect(fetchAnnouncementUnreadCount).toHaveBeenCalledWith('board');
    expect(fetchAnnouncementUnreadCount).toHaveBeenCalledWith('faq');
  });

  it('decrement は楽観的に 1 減らし、0 未満には落ちない（board）', async () => {
    fetchAnnouncementUnreadCount.mockImplementation((kind: AnnouncementTagKind) =>
      Promise.resolve(kind === 'faq' ? 5 : 1),
    );
    render(
      <AnnouncementUnreadProvider>
        <Count testid="x" />
        <DecButton />
      </AnnouncementUnreadProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('x')).toHaveTextContent('1'));

    fireEvent.click(screen.getByText('減'));
    await waitFor(() => expect(screen.getByTestId('x')).toHaveTextContent('0'));
    // さらに減らしても 0 でクランプ。
    fireEvent.click(screen.getByText('減'));
    await waitFor(() => expect(screen.getByTestId('x')).toHaveTextContent('0'));
  });

  it('board の decrement は faq のカウントに影響しない', async () => {
    render(
      <AnnouncementUnreadProvider>
        <Count testid="board" kind="board" />
        <Count testid="faq" kind="faq" />
        <DecButton kind="board" />
      </AnnouncementUnreadProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('board')).toHaveTextContent('2'));
    expect(screen.getByTestId('faq')).toHaveTextContent('5');

    fireEvent.click(screen.getByText('減'));
    await waitFor(() => expect(screen.getByTestId('board')).toHaveTextContent('1'));
    // faq 側は無関係のため据え置き。
    expect(screen.getByTestId('faq')).toHaveTextContent('5');
  });

  it('取得失敗時はバッジ非表示の 0 を据え置く（致命にしない）', async () => {
    fetchAnnouncementUnreadCount.mockRejectedValue(new Error('boom'));
    render(
      <AnnouncementUnreadProvider>
        <Count testid="x" />
      </AnnouncementUnreadProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('x')).toHaveTextContent('0'));
  });

  it('Provider 外で useAnnouncementUnread を使うと throw する', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Count testid="z" />)).toThrow();
    spy.mockRestore();
  });
});
