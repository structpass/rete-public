import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { UseTagMasterResult } from '@/hooks/use-tag-master';

// TagMasterOverlay（共有・無改修）は master / headTabs / archiveFilter の受け渡しだけ検証すればよいためスタブ化する。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { tagMasterOverlaySpy, boardMaster, faqMaster, setArchiveOnly } = vi.hoisted(() => {
  const board = {
    tags: [{ id: 'b1', name: '掲示板タグ', icon: 'Bell', color: 'blue', archived: false }],
    loading: false,
    error: false,
    mutating: false,
    reload: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const faq = {
    tags: [{ id: 'f1', name: 'FAQタグ', icon: 'Info', color: 'green', archived: false }],
    loading: false,
    error: false,
    mutating: false,
    reload: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  return {
    tagMasterOverlaySpy: vi.fn(),
    boardMaster: board as unknown as UseTagMasterResult,
    faqMaster: faq as unknown as UseTagMasterResult,
    setArchiveOnly: vi.fn(),
  };
});
vi.mock('@/components/tags/tag-master-overlay', () => ({
  TagMasterOverlay: (props: {
    master: UseTagMasterResult;
    onClose: () => void;
    headTabs?: ReactNode;
    archiveFilter?: { value: boolean; onChange: (v: boolean) => void };
  }) => {
    tagMasterOverlaySpy(props.master, props.archiveFilter);
    return (
      <div>
        {props.headTabs}
        <div data-testid="stub-overlay">{props.master.tags.map((t) => t.name).join(',')}</div>
        <div data-testid="stub-include-archived">{String(props.archiveFilter?.value)}</div>
        <button type="button" onClick={props.onClose}>
          stub-close
        </button>
      </div>
    );
  },
}));

vi.mock('../../hooks/announcement-tag-master-context', () => ({
  useAnnouncementTagMasterContext: () => ({
    board: boardMaster,
    faq: faqMaster,
    archiveOnly: false,
    setArchiveOnly,
  }),
}));

import { AnnouncementTagMasterOverlay } from '../announcement-tag-master-overlay';

describe('AnnouncementTagMasterOverlay（hom-0074）', () => {
  it('既定は掲示板タブが選択され board master を渡す', () => {
    render(<AnnouncementTagMasterOverlay onClose={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '掲示板' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('stub-overlay')).toHaveTextContent('掲示板タグ');
  });

  it('FAQ タブをクリックすると faq master に切り替わる', () => {
    render(<AnnouncementTagMasterOverlay onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'FAQ' }));
    expect(screen.getByRole('radio', { name: 'FAQ' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('stub-overlay')).toHaveTextContent('FAQタグ');
    // 掲示板タグ一覧は表示されなくなる（他 kind の混入なし）。
    expect(screen.queryByText('掲示板タグ')).not.toBeInTheDocument();
  });

  it('Context の archiveOnly を archiveFilter として TagMasterOverlay へ渡す（hom-0084・hom-0080）', () => {
    render(<AnnouncementTagMasterOverlay onClose={vi.fn()} />);
    expect(screen.getByTestId('stub-include-archived')).toHaveTextContent('false');
  });

  it('閉じる時に archiveOnly を false へ戻してから onClose を呼ぶ（hom-0080・他画面へのアーカイブ済み漏れ防止）', () => {
    const onClose = vi.fn();
    render(<AnnouncementTagMasterOverlay onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'stub-close' }));
    expect(setArchiveOnly).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
