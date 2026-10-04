'use client';

import { useState } from 'react';
import { ChevronDown, Settings, Tags } from 'lucide-react';
import type { OrganizationDto, ProjectDto, SpaceDto } from '@rete/shared';
import { cn } from '@/lib/utils';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { useDeskSpace } from '@/features/desk/hooks/desk-space-context';
import { useOrganizations } from '@/features/desk/hooks/use-organizations';
import { useProjects } from '@/features/desk/hooks/use-projects';
import { useProjectChannels } from '@/features/desk/hooks/use-project-channels';
import { useLazyChannelLoad, useProjectsByOrg } from '@/features/desk/hooks/use-project-tree';

/**
 * File タブ専用サイドバー（fil-0137・ADR 0063）。
 *
 * 旧「ロケーション（リポジトリ / 共有）」枠と権限設定起動を撤去し、Desk と共有の
 * 組織＞プロジェクト＞チャネル 階層から「どのリポジトリ（channel）を開くか」を選ぶツリーを描画する。
 * データ取得（useOrganizations / useProjects / useProjectChannels）と選択状態（useDeskSpace の
 * selectedSpaceId）は Desk 側の実装をそのまま共有し、可視性判定を frontend に二重実装しない
 * （backend の space スコープ API が返すものだけが並ぶ）。管理導線（チャネル追加/改名/アーカイブ・
 * ★・権限管理）は Desk サイドバーの管轄で、File 側は選択のみ。
 * ストレージゲージは静的サンプル（実集計は後続フェーズ）。
 */

/** チャネル（リポジトリ）1 行。選択のみ（Desk の ChannelRow から管理導線を除いた同意匠）。 */
function FileChannelRow({
  channel,
  active,
  onSelect,
}: {
  channel: SpaceDto;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="sidebar-channel-row">
      <button
        type="button"
        className={cn('sidebar-channel', active && 'active')}
        onClick={onSelect}
      >
        <span className="sidebar-channel-name">{channel.name}</span>
      </button>
    </div>
  );
}

/** プロジェクト 1 件 + 配下チャネル（展開時 lazy）。Desk の ProjectSection と同じ展開・lazy 取得規律。 */
function FileProjectSection({
  project,
  expanded,
  selectedSpaceId,
  channels,
  loadChannels,
  onToggle,
  onSelectSpace,
}: {
  project: ProjectDto;
  expanded: boolean;
  selectedSpaceId: string | null;
  channels: SpaceDto[] | undefined;
  loadChannels: (projectId: string) => void;
  onToggle: (projectId: string) => void;
  onSelectSpace: (spaceId: string) => void;
}) {
  // 展開時 lazy 取得の規律は Desk と共有（fil-0145）。
  useLazyChannelLoad(expanded, project.id, loadChannels);

  return (
    <div className={cn('sidebar-project', expanded && 'is-expanded')}>
      <div className="sidebar-project-head-row">
        <button
          type="button"
          className="sidebar-project-head"
          aria-expanded={expanded}
          onClick={() => onToggle(project.id)}
        >
          <ChevronDown className="sidebar-project-chevron h-3 w-3" aria-hidden="true" />
          <span className="sidebar-project-name">{project.name}</span>
        </button>
      </div>
      <div className="sidebar-channel-list">
        {channels?.map((channel) => (
          <FileChannelRow
            key={channel.id}
            channel={channel}
            active={channel.id === selectedSpaceId}
            onSelect={() => onSelectSpace(channel.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function FilesSidebar({
  onOpenSettings,
  onOpenTagMaster,
}: {
  onOpenSettings: () => void;
  /** タグ管理（マスタ）オーバーレイを開く（rete-files-0009・ツールバーから移設）。 */
  onOpenTagMaster: () => void;
}) {
  // 器スコープ（selectedSpaceId）は Desk と共有（DeskSpaceProvider 配下・fil-0137）。
  const { selectedSpaceId, setSelectedSpaceId } = useDeskSpace();
  // 組織＞プロジェクト＞チャネル のデータ取得は Desk サイドバーと同じ hook 群を共有する。
  const { organizations } = useOrganizations();
  const { projects } = useProjects();
  const channels = useProjectChannels();

  // organizationId → プロジェクト群に集約（Desk と共有規律・fil-0145）。
  const projectsByOrg = useProjectsByOrg(projects);

  // プロジェクト折り畳み（既定は展開）。File 側はセッション内のローカル UI state で足りる
  // （Desk の useDeskSidebarState は タブ状態も含む永続化で、File 側に持ち込むと二重管理になる）。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleProject = (projectId: string) =>
    setCollapsed((prev) => ({ ...prev, [projectId]: !prev[projectId] }));

  // cmn-0130→brd-0205: cmn-0128（app-sidebar.tsx）と同じ hook・同じ .app-sidebar-hoverband 帯を共用。
  // 行セレクタは desk-sidebar の ROW_SELECTOR と同基準（行ラッパー・選択中チャネルは除外＝cmn-0133）＋
  // 設定リンク（.sidebar-link）。scroll 内は section-label / storage ゲージも同居するため、
  // leaveOnNoMatch=true で非行領域へ移った時に帯を消す（無いと最後の行に帯が凍結残置する）。
  const {
    listRef: scrollRef,
    onMouseOver: handleScrollMouseOver,
    onMouseLeave,
    bandStyle,
  } = useRowHoverBand<HTMLDivElement>(
    '.sidebar-project-head-row, .sidebar-channel-row:not(:has(.sidebar-channel.active)), .sidebar-link:not(.active)',
    'vertical',
    true,
  );

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-header">
        <h1>File</h1>
      </div>

      <div
        className="app-sidebar-scroll"
        ref={scrollRef}
        onMouseOver={handleScrollMouseOver}
        onMouseLeave={onMouseLeave}
      >
        {/* 組織＞プロジェクト＞チャネル（リポジトリ選択・Desk 共有ツリー） */}
        {organizations.map((org: OrganizationDto) => (
          <div key={org.id} className="mb-2">
            <div className="sidebar-section-label">
              <span>{org.name}</span>
            </div>
            {(projectsByOrg[org.id] ?? []).map((project) => (
              <FileProjectSection
                key={project.id}
                project={project}
                expanded={!collapsed[project.id]}
                selectedSpaceId={selectedSpaceId}
                channels={channels.channelsByProject[project.id]}
                loadChannels={channels.loadChannels}
                onToggle={toggleProject}
                onSelectSpace={setSelectedSpaceId}
              />
            ))}
          </div>
        ))}

        <div className="mt-2">
          <div className="sidebar-section-label">
            <span>設定</span>
          </div>
          <button type="button" className="sidebar-link" onClick={onOpenTagMaster}>
            <Tags className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">タグ管理</span>
          </button>
          <button type="button" className="sidebar-link" onClick={onOpenSettings}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">アップロード設定</span>
          </button>
        </div>

        <div className="files-storage">
          <div className="files-storage-label">ストレージ</div>
          <div className="files-storage-bar">
            <div className="files-storage-fill" style={{ width: '38%' }} />
          </div>
          <div className="files-storage-text">3.8 GB / 10 GB 使用中</div>
        </div>
        {bandStyle ? <div aria-hidden className="app-sidebar-hoverband" style={bandStyle} /> : null}
      </div>
    </aside>
  );
}
