import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { AnnouncementTagDto } from '../../lib/api';

// board/faq で異なる一覧を返すことで、2 インスタンスが独立していることを検証する（hom-0074）。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchAnnouncementTags } = vi.hoisted(() => ({
  fetchAnnouncementTags: vi.fn(),
}));
vi.mock('../../lib/api', () => ({
  fetchAnnouncementTags: (...a: unknown[]) => fetchAnnouncementTags(...a),
  createAnnouncementTag: vi.fn(),
  updateAnnouncementTag: vi.fn(),
  deleteAnnouncementTag: vi.fn(),
}));

import {
  AnnouncementTagMasterProvider,
  useAnnouncementTagMasterContext,
} from '../announcement-tag-master-context';

const boardTags: AnnouncementTagDto[] = [
  { id: 'b1', name: '掲示板タグ', icon: 'Bell', color: 'blue', archived: false },
];
const faqTags: AnnouncementTagDto[] = [
  { id: 'f1', name: 'FAQタグ', icon: 'Info', color: 'green', archived: false },
];

function Consumer() {
  const { board, faq, archiveOnly, setArchiveOnly } = useAnnouncementTagMasterContext();
  return (
    <div>
      <div data-testid="board">
        {board.loading ? 'loading' : board.tags.map((t) => t.name).join(',')}
      </div>
      <div data-testid="faq">{faq.loading ? 'loading' : faq.tags.map((t) => t.name).join(',')}</div>
      <div data-testid="include-archived">{String(archiveOnly)}</div>
      <button onClick={() => setArchiveOnly(!archiveOnly)}>toggle</button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAnnouncementTags.mockImplementation((kind: string) =>
    Promise.resolve(kind === 'faq' ? faqTags : boardTags),
  );
});

describe('AnnouncementTagMasterProvider / useAnnouncementTagMasterContext（hom-0074）', () => {
  it('board/faq それぞれ独立したタグ一覧を保持する', async () => {
    render(
      <AnnouncementTagMasterProvider>
        <Consumer />
      </AnnouncementTagMasterProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('board')).toHaveTextContent('掲示板タグ'));
    expect(screen.getByTestId('faq')).toHaveTextContent('FAQタグ');
    expect(fetchAnnouncementTags).toHaveBeenCalledWith('board', false);
    expect(fetchAnnouncementTags).toHaveBeenCalledWith('faq', false);
  });

  it('Provider 外で useAnnouncementTagMasterContext を使うと throw する', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow();
    spy.mockRestore();
  });

  it('archiveOnly は board/faq 共通の 1 フラグで、切替えると両 fetch へ反映される（hom-0084）', async () => {
    render(
      <AnnouncementTagMasterProvider>
        <Consumer />
      </AnnouncementTagMasterProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('include-archived')).toHaveTextContent('false'));
    fetchAnnouncementTags.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await waitFor(() => expect(screen.getByTestId('include-archived')).toHaveTextContent('true'));
    await waitFor(() => expect(fetchAnnouncementTags).toHaveBeenCalledWith('board', true));
    expect(fetchAnnouncementTags).toHaveBeenCalledWith('faq', true);
  });
});
