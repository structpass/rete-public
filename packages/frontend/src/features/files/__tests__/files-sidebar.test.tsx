import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Desk 共有の器スコープ・階層データ hook をスタブし、fil-0137 のサイドバー再構築
// （ロケーション枠撤去・組織＞プロジェクト＞チャネル ツリー・channel 選択）を検証する。
const { setSelectedSpaceId, loadChannels } = vi.hoisted(() => ({
  setSelectedSpaceId: vi.fn(),
  loadChannels: vi.fn(),
}));

vi.mock('@/features/desk/hooks/desk-space-context', () => ({
  useDeskSpace: () => ({ selectedSpaceId: 'ch-1', setSelectedSpaceId, hydrated: true }),
}));
vi.mock('@/features/desk/hooks/use-organizations', () => ({
  useOrganizations: () => ({
    organizations: [{ id: 'org-1', name: '株式会社サンプル' }],
    loading: false,
    error: false,
    reload: vi.fn(),
  }),
}));
vi.mock('@/features/desk/hooks/use-projects', () => ({
  useProjects: () => ({
    projects: [{ id: 'pj-1', name: '基幹プロジェクト', organizationId: 'org-1' }],
    loading: false,
    error: false,
    reload: vi.fn(),
  }),
}));
vi.mock('@/features/desk/hooks/use-project-channels', () => ({
  useProjectChannels: () => ({
    channelsByProject: {
      'pj-1': [
        { id: 'ch-1', name: '一般' },
        { id: 'ch-2', name: '開発' },
      ],
    },
    loadingProjects: new Set<string>(),
    loadChannels,
    reloadChannels: vi.fn(),
  }),
}));

import { FilesSidebar } from '../components/files-sidebar';

function renderSidebar() {
  return render(<FilesSidebar onOpenSettings={vi.fn()} onOpenTagMaster={vi.fn()} />);
}

describe('FilesSidebar — Desk 共有ツリー（fil-0137）', () => {
  it('組織＞プロジェクト＞チャネル の階層が描画され、選択中 channel に active が付く', () => {
    renderSidebar();
    expect(screen.getByText('株式会社サンプル')).toBeInTheDocument();
    expect(screen.getByText('基幹プロジェクト')).toBeInTheDocument();
    const ch1 = screen.getByRole('button', { name: '一般' });
    const ch2 = screen.getByRole('button', { name: '開発' });
    expect(ch1.className).toContain('active');
    expect(ch2.className).not.toContain('active');
  });

  it('channel クリックで setSelectedSpaceId が呼ばれる（Desk と選択状態を共有）', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: '開発' }));
    expect(setSelectedSpaceId).toHaveBeenCalledWith('ch-2');
  });

  it('展開中プロジェクトのチャネルを lazy 取得する（既定は展開）', () => {
    renderSidebar();
    expect(loadChannels).toHaveBeenCalledWith('pj-1');
  });

  it('旧ロケーション枠（リポジトリ/共有）と権限設定起動が存在しない', () => {
    renderSidebar();
    expect(screen.queryByText('ロケーション')).toBeNull();
    expect(screen.queryByText('共有')).toBeNull();
    expect(screen.queryByText('権限設定')).toBeNull();
    // 設定枠（タグ管理 / アップロード設定）とストレージゲージは現状維持。
    expect(screen.getByText('タグ管理')).toBeInTheDocument();
    expect(screen.getByText('アップロード設定')).toBeInTheDocument();
    expect(screen.getByText('ストレージ')).toBeInTheDocument();
  });
});
