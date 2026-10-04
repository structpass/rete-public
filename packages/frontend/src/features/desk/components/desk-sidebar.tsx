'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Network, Pencil, Plus, User, Users } from 'lucide-react';
import { type SpaceDto, type ProjectDto, type OrganizationDto, SpaceKind } from '@rete/shared';
import { cn } from '@/lib/utils';
import { FavoriteToggle } from '@/features/shell';
import { useSession } from '@/features/auth';
import { useAccounts } from '@/features/tasks/hooks/use-accounts';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { useDeskSidebarState, type DeskSidebarTab } from '../hooks/use-desk-sidebar-state';
import { useDeskSpace } from '../hooks/desk-space-context';
import { useOrganizations } from '../hooks/use-organizations';
import { useProjects } from '../hooks/use-projects';
import { useSpaces } from '../hooks/use-spaces';
import { useProjectChannels } from '../hooks/use-project-channels';
import { useLazyChannelLoad, useProjectsByOrg } from '../hooks/use-project-tree';
import { useCreateSpace } from '../hooks/use-create-space';
import { useUpdateSpace } from '../hooks/use-update-space';
import { avatarClassFor, avatarChar } from '../lib/avatar';
import { DeskCreateGroupForm } from './desk-create-group-form';
import { DeskMemberPicker } from './desk-member-picker';
import { DeskGroupMemberModal } from './desk-group-member-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';

/**
 * Desk タブ専用の左サイドバー（モック desk/index.html の Desk モードサイドバーを意匠移植 / CM-2 スライスB）。
 *
 * 3 スコープ（組織＞プロジェクト＞チャネル / グループ / 個人）をタブ切替で出す。hardcoded mock を実 API
 * データへ差し替え、行クリックでその器（Space）を選択して desk-space-context へ書く（DeskShell がチャット明細 /
 * タスク明細を spaceId で絞る / 論点3）。タブ切替・プロジェクト折り畳みは UI state（useDeskSidebarState・
 * localStorage 永続化）、選択中の器（selectedSpaceId）は desk-space-context が保持する。
 *
 * ADR 0013（視覚のみシェルは撤去でなく配線）に従い CSS クラス（sidebar-project / sidebar-channel /
 * sidebar-member-row 等）とレイアウトは維持し、データソースだけ mock→実 API に差し替える。
 * 作成導線:
 * - グループ／ダイレクトメッセージ（1:1 DM）: タブ見出しの ＋ → インラインフォーム（rete-desk-0144）。
 *
 * dsk-0426: 組織タブのチャネル管理（追加／改名／アーカイブ）とプロジェクト参照権限管理は本サイドバー
 * から撤去。チャンネル一覧の表示・選択・lazy 取得・お気に入り・deep-link 復元は維持。管理操作は
 * 別チケット（dsk-0430）で set-0148 が新設する管理画面へ移設する。
 */

// アバター色 / 文字ヘルパは ../lib/avatar に集約（§3・メンバーピッカーと共有）。

function ChannelRow({
  channel,
  active,
  onSelect,
}: {
  channel: SpaceDto;
  active?: boolean;
  onSelect: () => void;
}) {
  // dsk-0426: チャネル行の編集メニュー（名前変更 / アーカイブ）は撤去。チャネル一覧・選択・お気に入り
  // のみを維持する。管理操作は設定画面（set-0148 が新設）へ移設する。
  return (
    <div className="sidebar-channel-row">
      <button
        type="button"
        className={cn('sidebar-channel', active && 'active')}
        onClick={onSelect}
      >
        <span className="sidebar-channel-name">{channel.name}</span>
      </button>
      <FavoriteToggle target={{ kind: 'space', targetRef: channel.id, label: channel.name }} />
    </div>
  );
}

function MemberRow({
  space,
  index,
  active,
  onSelect,
  displayName,
}: {
  space: SpaceDto;
  index: number;
  active?: boolean;
  onSelect: () => void;
  /** 表示名の上書き（DM は space.name が固定 'DM' のため閲覧者視点の相手名で上書きする・既定は space.name）。 */
  displayName?: string;
}) {
  const name = displayName ?? space.name;
  return (
    <div className="sidebar-member-row-wrap">
      <button
        type="button"
        className={cn('sidebar-member-row', active && 'active')}
        onClick={onSelect}
      >
        <span className={cn('sidebar-member-avatar', avatarClassFor(index))}>
          {avatarChar(name)}
        </span>
        <span className="sidebar-member-name">{name}</span>
      </button>
      <FavoriteToggle target={{ kind: 'space', targetRef: space.id, label: name }} />
    </div>
  );
}

/**
 * グループ行専用の描画（dsk-0306）。MemberRow と並列に置き、行右端の ✎ を条件付きで添える。
 * MemberRow は自分メモ/DM/グループで共有のため、グループ限定の導線は新設の当コンポーネントで担う
 * （design-reviewer 指摘に従い副作用を避ける）。
 *
 * dsk-0354（旧 design 上書き）: 権限モデルは維持（GROUP ADMIN / システム ADMIN のみ追加可）。
 * UI は実体に合わせ、canManageMembers=false の行では ✎ を非表示にする
 * （ProjectDto.canManageChannels と同型）。
 *
 * dsk-0364: ✎ を押したら「何を編集するか」を選ばせる吹き出しメニュー（dsk-0366 の
 * メンバー設定 / 名前を変更 / アーカイブ）は廃し、グループ設定モーダルを直接開く。
 * 3 操作はモーダル内に集約した（機能は残し置き場所だけ移した）。行クリック（選択）と
 * 干渉させないため stopPropagation する（外側ボタン群の標準パターン）。
 */
function GroupRow({
  space,
  index,
  active,
  onSelect,
  onManage,
}: {
  space: SpaceDto;
  index: number;
  active?: boolean;
  onSelect: () => void;
  onManage: () => void;
}) {
  return (
    <div className="sidebar-member-row-wrap">
      <button
        type="button"
        className={cn('sidebar-member-row', active && 'active')}
        onClick={onSelect}
      >
        <span className={cn('sidebar-member-avatar', avatarClassFor(index))}>
          {avatarChar(space.name)}
        </span>
        <span className="sidebar-member-name">{space.name}</span>
      </button>
      <FavoriteToggle target={{ kind: 'space', targetRef: space.id, label: space.name }} />
      {space.canManageMembers && (
        <span className="sidebar-row-menu">
          <button
            type="button"
            className="sidebar-row-menu-btn"
            title="グループ設定"
            aria-label="グループ設定"
            onClick={(e) => {
              e.stopPropagation();
              onManage();
            }}
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

/** プロジェクト 1 件 + 配下チャネル（展開時 lazy）の描画。dsk-0426: プロジェクト行の管理メニュー撤去済み。 */
function ProjectSection({
  project,
  expanded,
  selectedSpaceId,
  channels,
  loadChannels,
  onToggleProject,
  onSelectSpace,
}: {
  project: ProjectDto;
  expanded: boolean;
  selectedSpaceId: string | null;
  channels: SpaceDto[] | undefined;
  loadChannels: (projectId: string) => void;
  onToggleProject: (projectId: string) => void;
  onSelectSpace: (spaceId: string) => void;
}) {
  // 展開時 lazy 取得の規律は Files と共有（fil-0145）。
  useLazyChannelLoad(expanded, project.id, loadChannels);

  return (
    <div className={cn('sidebar-project', expanded && 'is-expanded')}>
      <div className="sidebar-project-head-row">
        <button
          type="button"
          className="sidebar-project-head"
          aria-expanded={expanded}
          onClick={() => onToggleProject(project.id)}
        >
          <ChevronDown className="sidebar-project-chevron h-3 w-3" aria-hidden="true" />
          <span className="sidebar-project-name">{project.name}</span>
        </button>
        <FavoriteToggle target={{ kind: 'project', targetRef: project.id, label: project.name }} />
        {/* dsk-0426: プロジェクト行の管理メニュー（参照権限を管理 / チャネルを追加）は撤去。 */}
      </div>
      <div className="sidebar-channel-list">
        {channels?.map((channel) => (
          <ChannelRow
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

/** 組織 1 件 + 配下プロジェクト群（ProjectSection へ委譲）の描画。dsk-0426: 管理メニュー撤去済。 */
function OrganizationGroup({
  org,
  projects,
  collapsed,
  selectedSpaceId,
  channelsByProject,
  loadChannels,
  onToggleProject,
  onSelectSpace,
}: {
  org: OrganizationDto;
  projects: ProjectDto[];
  collapsed: Record<string, boolean>;
  selectedSpaceId: string | null;
  channelsByProject: Record<string, SpaceDto[]>;
  loadChannels: (projectId: string) => void;
  onToggleProject: (projectId: string) => void;
  onSelectSpace: (spaceId: string) => void;
}) {
  return (
    <div className="mb-2">
      <div className="sidebar-section-label">
        <span>{org.name}</span>
      </div>
      {projects.map((project) => (
        <ProjectSection
          key={project.id}
          project={project}
          expanded={!collapsed[project.id]}
          selectedSpaceId={selectedSpaceId}
          channels={channelsByProject[project.id]}
          loadChannels={loadChannels}
          onToggleProject={onToggleProject}
          onSelectSpace={onSelectSpace}
        />
      ))}
    </div>
  );
}

/**
 * DM（無向ペア）の閲覧者視点の相手 Account ID を返す（自分でない側）。DM find は owner / peer 双方向で
 * 返るため、viewer が owner なら peer を、そうでなければ owner を相手とする。候補除外（dmCandidates）と
 * 相手名解決（dmPartnerName）で同じ判定を逐語重複させていたため 1 箇所に集約（dsk-0333 LOW12）。
 */
function dmPartnerAccountId(dm: SpaceDto, viewerId: string | undefined): string | null {
  return dm.ownerId === viewerId ? dm.peerAccountId : dm.ownerId;
}

export function DeskSidebar() {
  const { activeTab, collapsed, setTab, toggleProject, hydrated } = useDeskSidebarState();
  const { selectedSpaceId, setSelectedSpaceId } = useDeskSpace();

  // dsk-0387: パネル内（組織/グループ/個人）の hover 帯スライド。cmn-0127/cmn-0130 と同じ hook・
  // 同じ .app-sidebar-hoverband 帯を共用。rowSelector は行ラッパー（★/menu ボタン区画まで帯が
  // 届く基準・dsk-0335 の意図を継承）。scroll 内は行以外（section-label 等）も同居するため、
  // 非行領域へ移った時は leaveOnNoMatch=true で帯を消す（無いと最後の行に帯が凍結残置する・brd-0205）。
  // cmn-0133: 選択中の行は帯の対象外（選択ピルが半透明の白＝下に帯が入ると透けて二重に見える）。
  // 塗りが行ラッパー側に付くため、除外も :has() でラッパー基準に書く。
  const ROW_SELECTOR =
    '.sidebar-project-head-row, .sidebar-channel-row:not(:has(.sidebar-channel.active)), .sidebar-member-row-wrap:not(:has(.sidebar-member-row.active))';
  const {
    listRef: scrollRef,
    onMouseOver: handleScrollMouseOver,
    onMouseLeave,
    bandStyle,
  } = useRowHoverBand<HTMLDivElement>(ROW_SELECTOR, 'vertical', true);

  // dsk-0387: タブ strip（組織/グループ/個人切替）の横帯。app-header の .nav-hoverband /
  // chat-thread の .desk-ticket-tab-hoverband と同型（axis='horizontal'）。
  // dsk-0409: 手書きの非一致ラッパー（chat-thread / task-detail-overlay から除去済みの同型・
  // dsk-0424 の残存 3 箇所目）を leaveOnNoMatch=true へ置換。タブ列はタブ以外の要素（余白等）と
  // 同居するため、非一致へ移った瞬間に帯を消す必要がある（hook の分岐と逐語同型）。
  const {
    listRef: tabsRef,
    onMouseOver: onTabsMouseOver,
    onMouseLeave: onTabsMouseLeave,
    bandStyle: tabsBandStyle,
  } = useRowHoverBand<HTMLDivElement>('.sidebar-tab', 'horizontal', true);

  // 復元（localStorage）が確定するまではどのタブも active にしない（rete-desk-0174・ちらつき対策）。
  // 既定 activeTab='organization' を初回に描いてから復元タブへ切り替えると組織パネルが一瞬映るため、
  // hydrated まで panelTab=null（全パネル hidden）にし、確定後に最後に開いていたタブだけを出す。
  const panelTab: DeskSidebarTab | null = hydrated ? activeTab : null;

  // dsk-0387 code-reviewer HIGH 是正: キーボード操作等マウスがコンテナ境界を跨がずにタブが切り替わる
  // 経路（role="tab" ボタンの Enter/Space 押下）では onMouseLeave が発火せず、帯が旧パネルの行位置に
  // 凍結残置する。panelTab 変化を契機に明示クリアする（他パネル state と同様 panelTab 駆動に揃える）。
  useEffect(() => {
    onMouseLeave();
  }, [panelTab, onMouseLeave]);

  // 組織タブ: 組織一覧 + 全プロジェクト（organizationId でクライアント集約）+ チャネル lazy。
  const { organizations } = useOrganizations();
  const { projects } = useProjects();
  const channels = useProjectChannels();

  // グループ / 個人タブ: kind 別取得（kind 未指定の全件取得はしない / backend は id リストのみ返すため）。
  const {
    spaces: groups,
    loading: groupsLoading,
    reload: reloadGroups,
  } = useSpaces(SpaceKind.GROUP);
  const {
    spaces: memos,
    loading: memosLoading,
    reload: reloadMemos,
  } = useSpaces(SpaceKind.PERSONAL_MEMO);
  const { spaces: dms, reload: reloadDms } = useSpaces(SpaceKind.PERSONAL_DM);

  // 作成導線（rete-desk-0144・第一弾＝グループ／1:1 DM）。openForm でグループ追加フォーム / DM 相手ピッカーを
  // 局所開閉（A1 状態機械とは無関係のサイドバー内 UI）。DM 候補は自分＋既存 DM 相手を除外する。
  // dsk-0426: createChannel は撤去（チャネル追加は設定画面側へ移設）。
  const { createGroup, createDm, createPersonalMemo, submitting } = useCreateSpace();
  const { renameSpace, archiveSpace, submitting: updating } = useUpdateSpace();
  const { accounts } = useAccounts('DM の相手候補の取得に失敗しました');
  const { user } = useSession();
  const [openForm, setOpenForm] = useState<'group' | 'dm' | null>(null);

  // グループメンバー設定モーダル（dsk-0306）。対象グループを保持し、SpaceDto をそのまま子へ渡す。
  const [groupMemberTarget, setGroupMemberTarget] = useState<SpaceDto | null>(null);

  // グループのアーカイブ確認（dsk-0366）。全メンバーの一覧から消える操作のため ConfirmDialog で
  // 確認を挟む（dsk-0364 でも「破壊操作の確認」は残す＝撤去したのは編集画面へ入る前の中間メニューのみ）。
  // 改名はサイドバー上のインラインフォームを廃し、グループ設定モーダル内へ一本化した（dsk-0364）。
  // cmn-0353: useDeleteConfirm へ移行（archiveSpace は SpaceDto|null を返すため真偽化）。
  const {
    deleteTarget: archiveGroupTarget,
    setDeleteTarget: setArchiveGroupTarget,
    handleDelete: handleArchiveGroup,
  } = useDeleteConfirm<SpaceDto>({
    remove: async (id) => {
      const archived = await archiveSpace(String(id));
      if (archived) {
        await reloadGroups();
        if (selectedSpaceId === id) setSelectedSpaceId(null);
        return true;
      }
      return false;
    },
  });

  const dmCandidates = useMemo(() => {
    const excluded = new Set<string>();
    if (user?.id) excluded.add(user.id);
    // DM は無向ペア（backend の DM find が owner / peer 双方向で返す）。相手＝自分でない側を除外集合へ。
    for (const dm of dms) {
      const partner = dmPartnerAccountId(dm, user?.id);
      if (partner) excluded.add(partner);
    }
    return accounts.filter((a) => !excluded.has(a.id));
  }, [accounts, dms, user]);

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.id, a.name);
    return map;
  }, [accounts]);

  // DM Space の name は backend 固定値 'DM'（dsk-0303・無向ペアのため name 列に相手名を持てない構造）。
  // 閲覧者視点で自分でない側の Account 名を動的解決して表示する。
  // dsk-0325: backend が DM 一覧で peerName を viewer 視点で同梱するようになったため最優先で信頼する。
  // peerName が null（退会・ロック済等で解決不能）のときのみ従来の accounts 引きへフォールバック。
  // 空文字は「空文字を誤って 'DM' にフォールバックしない」要件で素通し（`||` を使わない）。
  const dmPartnerName = useCallback(
    (dm: SpaceDto): string => {
      if (dm.peerName != null) return dm.peerName;
      const partnerId = dmPartnerAccountId(dm, user?.id);
      const fromAccounts = partnerId ? accountNameById.get(partnerId) : undefined;
      return fromAccounts ?? dm.name;
    },
    [accountNameById, user?.id],
  );

  async function handleRenameGroup(groupId: string, name: string): Promise<SpaceDto | null> {
    const updated = await renameSpace(groupId, name);
    if (updated) await reloadGroups();
    return updated;
  }

  async function handleCreateGroup(name: string): Promise<SpaceDto | null> {
    const created = await createGroup(name);
    if (created) {
      await reloadGroups();
      setSelectedSpaceId(created.id);
    }
    return created;
  }

  async function handleCreateDm(peerAccountId: string): Promise<SpaceDto | null> {
    const created = await createDm(peerAccountId);
    if (created) {
      await reloadDms();
      setSelectedSpaceId(created.id);
    }
    return created;
  }

  // 自分宛（dsk-0352）：未保有ユーザーは PERMANENT_MEMO を 1 件だけ持つ
  // ため、初回ロード完了時に 0 件なら自動作成する（lazy find-or-create）。
  // 既に存在する場合は memos[0] を表示するだけで副作用なし。
  // 作成された PERSONAL_MEMO は即選択状態にして利用者に入口の所在を明示する。
  useEffect(() => {
    if (memosLoading) return;
    if (memos.length !== 0) return;
    void createPersonalMemo('').then((created) => {
      if (created) {
        void reloadMemos();
        setSelectedSpaceId(created.id);
      }
    });
  }, [memosLoading, memos.length, createPersonalMemo, reloadMemos, setSelectedSpaceId]);

  // dsk-0399: deep-link（Home ★経由 ?spaceId=）や作成直後の自動選択で selectedSpaceId が現在の
  // panelTab と異なる Space 種別を指すと、パネルが切り替わらず選択中の器がどのタブにも見えなくなる
  // （「タブが切り替わっていない」ように見える不具合）。selectedSpaceId の変化を検知し、実際に
  // 含まれるタブへ追従させる。CHANNEL（組織配下）は展開済みプロジェクトのチャネルしか
  // channelsByProject に無い＝未展開時は判定できないため、group/personal に一致しない場合は
  // 現状維持する（既定が organization のため大半のケースは元々問題にならない）。
  //
  // lastSyncedSpaceIdRef で「直近この selectedSpaceId に対して同期済みか」を追跡し、selectedSpaceId
  // 自体が変わらない限り再判定しない（code-reviewer HIGH 是正）。groups/memos/dms/channelsByProject は
  // 各リストの lazy 取得完了のたびに新しい参照になり effect が再実行されるため、ref 無しだと「選択済み
  // Space の器から手動で他タブへ切り替えた直後、無関係なリストの再取得が走る」だけで setTab が再発火し
  // 直前に開いたタブが問答無用でスナップバックしてしまう（組織/グループ/個人パネルは hidden 切替のみで
  // 常時マウントされ、各プロジェクトが個別に channelsByProject を更新するため頻発する）。
  //
  // activeTabRef は「今アクティブなタブ」の最新値を毎レンダー保持する（依存配列には入れない = 過剰発火の
  // 再発防止）。判定結果が現在の activeTab と同じ時は setTab を呼ばない（code-reviewer MEDIUM 是正:
  // useDeskSidebarState.setTab は無条件に新しい state オブジェクトを返すため、呼ぶたび localStorage
  // 書き込みが走る。同一タブ内で別 Space をクリックする通常操作のたびに無駄書き込みが発生していた）。
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const lastSyncedSpaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedSpaceId === lastSyncedSpaceIdRef.current) return;
    if (!selectedSpaceId) {
      lastSyncedSpaceIdRef.current = null;
      return;
    }
    let matchedTab: DeskSidebarTab | null = null;
    if (groups.some((g) => g.id === selectedSpaceId)) {
      matchedTab = 'group';
    } else if (
      memos.some((m) => m.id === selectedSpaceId) ||
      dms.some((d) => d.id === selectedSpaceId)
    ) {
      matchedTab = 'personal';
    } else if (
      Object.values(channels.channelsByProject).some((cs) =>
        cs.some((c) => c.id === selectedSpaceId),
      )
    ) {
      matchedTab = 'organization';
    }
    if (matchedTab === null) {
      // どのリストにも見つからない（lazy 未取得等）場合は ref を更新しない。該当リストが後から
      // 揃った時点の再実行で拾えるようにする（CHANNEL 未展開時の遅延解決）。
      return;
    }
    if (matchedTab !== activeTabRef.current) setTab(matchedTab);
    lastSyncedSpaceIdRef.current = selectedSpaceId;
  }, [selectedSpaceId, groups, memos, dms, channels.channelsByProject, setTab]);

  // organizationId → プロジェクト群に集約（Files と共有規律・fil-0145）。
  const projectsByOrg = useProjectsByOrg(projects);

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-header">
        <h1>Desk</h1>
      </div>

      <div
        className="sidebar-tabs"
        role="tablist"
        aria-label="サイドバー切替"
        ref={tabsRef}
        onMouseOver={onTabsMouseOver}
        onMouseLeave={onTabsMouseLeave}
      >
        {tabsBandStyle ? (
          <div aria-hidden="true" className="sidebar-tabs-hoverband" style={tabsBandStyle} />
        ) : null}
        <button
          type="button"
          className={cn('sidebar-tab', panelTab === 'organization' && 'is-active')}
          role="tab"
          aria-selected={panelTab === 'organization'}
          aria-controls="desk-sidebar-panel-organization"
          onClick={() => setTab('organization')}
        >
          <Network aria-hidden="true" className="h-3.5 w-3.5" />
          組織
        </button>
        <button
          type="button"
          className={cn('sidebar-tab', panelTab === 'group' && 'is-active')}
          role="tab"
          aria-selected={panelTab === 'group'}
          aria-controls="desk-sidebar-panel-group"
          onClick={() => setTab('group')}
        >
          <Users aria-hidden="true" className="h-3.5 w-3.5" />
          グループ
        </button>
        <button
          type="button"
          className={cn('sidebar-tab', panelTab === 'personal' && 'is-active')}
          role="tab"
          aria-selected={panelTab === 'personal'}
          aria-controls="desk-sidebar-panel-personal"
          onClick={() => setTab('personal')}
        >
          <User aria-hidden="true" className="h-3.5 w-3.5" />
          個人
        </button>
      </div>

      <div
        className="app-sidebar-scroll"
        ref={scrollRef}
        onMouseOver={handleScrollMouseOver}
        onMouseLeave={onMouseLeave}
      >
        {/* 組織 panel: 組織＞プロジェクト＞チャネル */}
        <div
          id="desk-sidebar-panel-organization"
          className={cn('sidebar-panel', panelTab === 'organization' && 'is-active')}
          role="tabpanel"
          hidden={panelTab !== 'organization'}
        >
          {organizations.map((org) => (
            <OrganizationGroup
              key={org.id}
              org={org}
              projects={projectsByOrg[org.id] ?? []}
              collapsed={collapsed}
              selectedSpaceId={selectedSpaceId}
              channelsByProject={channels.channelsByProject}
              loadChannels={channels.loadChannels}
              onToggleProject={toggleProject}
              onSelectSpace={setSelectedSpaceId}
            />
          ))}
        </div>

        {/* グループ panel */}
        <div
          id="desk-sidebar-panel-group"
          className={cn('sidebar-panel', panelTab === 'group' && 'is-active')}
          role="tabpanel"
          hidden={panelTab !== 'group'}
        >
          <div className="sidebar-section-label">
            <span>グループ</span>
            <button
              type="button"
              className="sidebar-add-btn"
              title="グループを追加"
              aria-label="グループを追加"
              aria-expanded={openForm === 'group'}
              onClick={() => setOpenForm((prev) => (prev === 'group' ? null : 'group'))}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          {openForm === 'group' && (
            <DeskCreateGroupForm
              onCreate={handleCreateGroup}
              onClose={() => setOpenForm(null)}
              submitting={submitting}
            />
          )}
          {groups.map((space, i) => (
            <GroupRow
              key={space.id}
              space={space}
              index={i}
              active={space.id === selectedSpaceId}
              onSelect={() => setSelectedSpaceId(space.id)}
              onManage={() => setGroupMemberTarget(space)}
            />
          ))}
          {/* 未割当の空状態案内（set-0026 論点1）: 参加 GROUP Space が 0 件なら権限付与の依頼導線を出す。 */}
          {!groupsLoading && groups.length === 0 && openForm !== 'group' && (
            <p
              style={{
                margin: '0.25rem 0.5rem',
                padding: '0.5rem',
                fontSize: '0.75rem',
                lineHeight: 1.5,
                color: 'var(--sp-text-warm-mute)',
              }}
            >
              参加できる Space がまだありません。管理者に権限付与を依頼してください。
            </p>
          )}
        </div>

        {/* 個人 panel: 自分宛 + 関係者（フラット一覧・dsk-0351 で dsk-0304 の宛先グルーピング機能を撤去） */}
        <div
          id="desk-sidebar-panel-personal"
          className={cn('sidebar-panel', panelTab === 'personal' && 'is-active')}
          role="tabpanel"
          hidden={panelTab !== 'personal'}
        >
          {/* dsk-0381: グループ先頭見出しと同型（mt-2 無し）。個人だけ余白があるとタブ切替で見出しが跳ねる。 */}
          <div className="sidebar-section-label">
            <span>自分宛</span>
          </div>
          {memos[0] && (
            <MemberRow
              key={memos[0].id}
              space={memos[0]}
              // dsk-0382: 行はログインユーザー表示名。アバター色は user.id 由来の安定 index（色4種循環）。
              index={
                user?.id
                  ? Math.abs([...user.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % 4
                  : 0
              }
              active={memos[0].id === selectedSpaceId}
              onSelect={() => setSelectedSpaceId(memos[0].id)}
              displayName={user?.name?.trim() || user?.email || '自分'}
            />
          )}

          {/* dsk-0308: 関係者＋のピッカーを浮遊ポップアップ化するため、見出し行を position:relative の基準にする。
              dsk-0353: 見出し「関係者」→「ダイレクトメッセージ」（実体＝1:1 DM 作成と一致）、＋ボタンの文言も統一。
              確認ダイアログで誤クリックを抑止（候補クリック＝DM 作成の副作用を抑止）。 */}
          <div className="sidebar-member-add-anchor">
            <div className="sidebar-section-label mt-2">
              <span>ダイレクトメッセージ</span>
              <button
                type="button"
                className="sidebar-add-btn"
                title="ダイレクトメッセージを追加"
                aria-label="ダイレクトメッセージを追加"
                aria-expanded={openForm === 'dm'}
                onClick={() => setOpenForm((prev) => (prev === 'dm' ? null : 'dm'))}
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
            {openForm === 'dm' && (
              <DeskMemberPicker
                floating
                candidates={dmCandidates}
                onPick={handleCreateDm}
                onClose={() => setOpenForm(null)}
                submitting={submitting}
                placeholder="DM の相手を検索"
                ariaLabel="DM の相手を検索"
                emptyMessage="相手になれるメンバーがいません"
                getConfirmMessage={(account) =>
                  `${account.name} とダイレクトメッセージを開始しますか？`
                }
              />
            )}
          </div>
          {dms.map((space, i) => (
            <MemberRow
              key={space.id}
              space={space}
              index={i}
              active={space.id === selectedSpaceId}
              onSelect={() => setSelectedSpaceId(space.id)}
              displayName={dmPartnerName(space)}
            />
          ))}
        </div>
        {bandStyle ? (
          <div aria-hidden="true" className="app-sidebar-hoverband" style={bandStyle} />
        ) : null}
      </div>

      {groupMemberTarget && (
        <DeskGroupMemberModal
          open
          onClose={() => setGroupMemberTarget(null)}
          group={groupMemberTarget}
          accounts={accounts}
          submitting={updating}
          onRename={async (name) => {
            const updated = await handleRenameGroup(groupMemberTarget.id, name);
            // 改名後もモーダルは開いたまま（続けてメンバーを触れる）。表示名だけ差し替える。
            if (updated) setGroupMemberTarget(updated);
            return updated;
          }}
          onArchive={() => {
            setGroupMemberTarget(null);
            setArchiveGroupTarget(groupMemberTarget);
          }}
        />
      )}
      {/* グループアーカイブ確認（dsk-0366）。全メンバーの一覧から消える操作のため確認を挟む。 */}
      <ConfirmDialog
        open={archiveGroupTarget !== null}
        message={`グループ「${archiveGroupTarget?.name ?? ''}」をアーカイブしますか？メンバー全員の一覧から表示されなくなります。`}
        destructive
        onConfirm={() => void handleArchiveGroup()}
        onCancel={() => setArchiveGroupTarget(null)}
      />
      {/* dsk-0426: チャネルアーカイブ確認とプロジェクト参照権限モーダルは撤去（設定画面側へ移設）。 */}
    </aside>
  );
}
