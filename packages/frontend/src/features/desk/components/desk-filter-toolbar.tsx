'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  Search,
  AtSign,
  ClipboardCheck,
  Archive,
  CircleCheckBig,
  User,
  Tag,
  RotateCcw,
  CalendarRange,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { TaskStatus } from '@rete/shared';
import { cn } from '@/lib/utils';
import { TASK_STATUS_OPTIONS } from '@/features/tasks/lib/status';
import type { Account, Category } from '@/features/tasks/lib/api';
import type { DeskSearchMode } from '../hooks/use-desk-search';
import { useFilterPopover, ToggleFilter } from '@/components/filters/toggle-filter';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { DeskDateRangePopover } from './desk-date-range';

/**
 * Desk 明細上部の統合検索/フィルタトールバー（モック desk/index.html の .desk-shell-header 移植）。
 *
 * 上段 = チャット/タスク モードトグル（表示する filter bar を切替）、下段 = モード別フィルタバー。
 * 実配線済（C-検索 / Batch5）: チャット キーワード・アーカイブ・顛末・メンション From/To（rete-desk-0049）/
 * タスク キーワード（チケット名・#）・ステータス・担当者・分類・顛末・期日範囲・メンション From/To
 * （dsk-0203。チャット側と同じ MentionFilter を共有し、判定はサーバー GET /tasks → 可視 id 集合へ合流）。
 */

type SearchMode = DeskSearchMode;

/**
 * 検索キーワード入力欄の左端 X を、共通ヘッダの Home タブ左端 X に揃える（rete-desk-0043）。
 *
 * モック desk/index.html の alignKeywordWithHomeTab の React 移植。ヘッダ nav は中央 absolute 配置で
 * リサイズに応じて X が変わるため、`.tab-link[data-tab="home"]` と `.desk-shell-header` を実測して
 * CSS 変数 `--keyword-left` を更新する（is-static の padding-left が参照）。変数未設定時は
 * globals.css の静的フォールバック（calc(50% - 7rem)）で描画され、位置がモックとズレていた。
 */
function useAlignKeywordWithHomeTab(headerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof window === 'undefined') return;
    const update = () => {
      const home = document.querySelector<HTMLElement>('.tab-link[data-tab="home"]');
      if (!home) return;
      const homeRect = home.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const offset = Math.max(0, homeRect.left - headerRect.left);
      header.style.setProperty('--keyword-left', `${offset}px`);
    };
    update();
    window.addEventListener('resize', update);
    // フォント・タブレイアウト確定後に再計測（モック同様の load 補正）。
    window.addEventListener('load', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('load', update);
    };
  }, [headerRef]);
}

/**
 * listbox option（role="option" の <li>）を keyboard 操作可能にする（a11y / WCAG）。
 * Enter / Space で activate。option は popover が開いている時のみ tabbable（hidden 時は tab 対象外）。
 */
function activateOnKey(handler: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      handler();
    }
  };
}

interface MultiSelectOption<T extends string | number> {
  value: T;
  label: string;
}

/**
 * 複数選択フィルタ（モック .desk-filter-menu listbox 移植 / §3 コピペ防止の共通抽出）。
 * ステータス（rete-desk-0038・0056）/ 担当者（0054）/ 分類（0055）が共有する。
 *
 * - 選択中の項目にチェック（.is-selected）を表示し、option クリックで OR 集合をトグル（menu は開いたまま）
 * - 「全て」リセット項目は持たない（既定=空配列=全て表示。全解除は外部クリアボタン / rete-desk-0056・0058・0059）
 * - **マウス枠外（chip + menu の外）へ出たら閉じる**（rete-desk-0053・0054・0055）。一覧 dropdown 専用で、
 *   日付/トグルには適用しない（native date picker やスイッチの誤閉じ回避）
 * - searchable=true（担当者 / rete-desk-0054）: 先頭に combobox 入力を置き手入力で候補を絞り込む。
 *   入力フォーカス中は mouseleave 枠外閉じを抑止し、タイプ中にカーソルが菜単外へ流れても閉じない
 *   ようにする（outside-click / ESC / blur 後 mouseleave では閉じる）。絞り込みは label の部分一致
 *   （大文字小文字無視）。選択は query にかかわらず保持される。
 */
function MultiSelectFilter<T extends string | number>({
  Icon,
  label,
  options,
  selected,
  onToggle,
  searchable = false,
}: {
  Icon: LucideIcon;
  label: string;
  options: MultiSelectOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
  /** true で combobox 手入力絞り込みを有効化（担当者のみ / rete-desk-0054）。 */
  searchable?: boolean;
}) {
  const { open, setOpen, ref } = useFilterPopover();
  const [query, setQuery] = useState('');
  const listboxId = useId();
  // 入力フォーカス中は mouseleave 枠外閉じを抑止する（タイプ中にカーソルが菜単外へ出ても閉じない）。
  const searchFocusedRef = useRef(false);
  const isActive = selected.length > 0;
  // popover を閉じたら絞り込み入力をリセット（次回は全候補表示で開く）。
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  const q = query.trim().toLowerCase();
  const visibleOptions = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  return (
    <div
      className={cn('desk-filter-icon', isActive && 'is-active')}
      ref={ref}
      // rete-desk-0053・0054・0055: マウスが枠外（chip + menu の外）へ出たら閉じる。menu は DOM 子のため
      // ボタン→menu の移動では発火しない（mouseleave はサブツリー全体を離れた時のみ）。
      // searchable: 入力フォーカス中は抑止（rete-desk-0054。タイプ中の誤閉じ回避）。
      onMouseLeave={() => {
        if (searchable && searchFocusedRef.current) return;
        setOpen(false);
      }}
    >
      <button
        type="button"
        className="desk-filter-icon-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon className="desk-filter-icon-svg h-4 w-4" aria-hidden="true" />
        <span className="desk-filter-icon-label">{label}</span>
      </button>
      <div className="desk-filter-menu" hidden={!open}>
        {searchable && (
          <input
            type="text"
            role="combobox"
            className="desk-filter-menu-search"
            aria-label={`${label}を絞り込み`}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            placeholder={`${label}を絞り込み`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              searchFocusedRef.current = true;
            }}
            onBlur={() => {
              searchFocusedRef.current = false;
            }}
            // chip クリック（popover トグル）への伝播を止める。ESC 閉じは useFilterPopover の document keydown が担う。
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <ul
          id={listboxId}
          className="desk-filter-menu-list"
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
        >
          {visibleOptions.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <li
                key={String(opt.value)}
                className={cn('desk-filter-menu-item', checked && 'is-selected')}
                role="option"
                aria-selected={checked}
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(opt.value);
                }}
                onKeyDown={activateOnKey(() => onToggle(opt.value))}
              >
                <Check className="desk-filter-menu-check h-3.5 w-3.5" aria-hidden="true" />
                <span>{opt.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * メンション From/To フィルタ（チャット / rete-desk-0049）。1 つの chip 配下に From（発信者）/ To（宛先）の
 * 2 列 listbox を並べた popover。モックに該当要素は無いため、option 行は MultiSelectFilter と同じ
 * `.desk-filter-menu-*` 様式を共有する（§3 コピペ防止）。
 *
 * - From・To とも複数選択（各列 OR・列間 AND はサーバー判定 / §5.2）。空集合 = その軸は「全て」。
 * - 「全て」項目は持たない（0058/0059 と統一。全解除は外部クリアボタン）。
 * - 候補は全アカウント対象（distinct 動的集合は不採用 / §5.1 確定）。
 * - 閉じるのは outside-click / Esc のみ（dsk-0310。ホバー枠外では閉じない＝他 MultiSelectFilter と意図的に差分）。
 * - 絞り込み実行はサーバー側（呼び出し側が再取得）。
 */
function MentionFilter({
  accounts,
  mentionFrom,
  onMentionFromToggle,
  mentionTo,
  onMentionToToggle,
}: {
  accounts: Account[];
  mentionFrom: string[];
  onMentionFromToggle: (id: string) => void;
  mentionTo: string[];
  onMentionToToggle: (id: string) => void;
}) {
  const { open, setOpen, ref } = useFilterPopover();
  const fromLabelId = useId();
  const toLabelId = useId();
  const isActive = mentionFrom.length > 0 || mentionTo.length > 0;
  return (
    <div className={cn('desk-filter-icon', isActive && 'is-active')} ref={ref}>
      <button
        type="button"
        className="desk-filter-icon-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="メンション"
        aria-label="メンション"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <AtSign className="desk-filter-icon-svg h-4 w-4" aria-hidden="true" />
        <span className="desk-filter-icon-label">メンション</span>
      </button>
      <div
        className="desk-filter-mention-popup"
        role="dialog"
        aria-label="メンション From/To"
        hidden={!open}
      >
        <MentionColumn
          title="From（発信者）"
          labelId={fromLabelId}
          accounts={accounts}
          selected={mentionFrom}
          onToggle={onMentionFromToggle}
        />
        <MentionColumn
          title="To（宛先）"
          labelId={toLabelId}
          accounts={accounts}
          selected={mentionTo}
          onToggle={onMentionToToggle}
        />
      </div>
    </div>
  );
}

/** メンション popover の 1 列（From or To）。option 行は MultiSelectFilter と同じ様式を共有する。 */
function MentionColumn({
  title,
  labelId,
  accounts,
  selected,
  onToggle,
}: {
  title: string;
  labelId: string;
  accounts: Account[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="desk-filter-mention-col">
      <span className="desk-filter-mention-col-title" id={labelId}>
        {title}
      </span>
      <ul
        className="desk-filter-menu-list desk-filter-mention-list"
        role="listbox"
        aria-labelledby={labelId}
        aria-multiselectable="true"
      >
        {accounts.map((a) => {
          const checked = selected.includes(a.id);
          return (
            <li
              key={a.id}
              className={cn('desk-filter-menu-item', checked && 'is-selected')}
              role="option"
              aria-selected={checked}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(a.id);
              }}
              onKeyDown={activateOnKey(() => onToggle(a.id))}
            >
              <Check className="desk-filter-menu-check h-3.5 w-3.5" aria-hidden="true" />
              <span>{a.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 期日範囲フィルタ（From/To 日付 + クリア / モック desk-task-filter-due 移植）。outside-click / ESC で閉じる。
 * popover 本体は タスク属性の開始日・期日と共有する DeskDateRangePopover（v2-170・§3 コピペ回避）。
 * chip 直下の absolute 配置は `.desk-filter-daterange-popup` 側のままで従来と同じ。
 */
function DueRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const { open, setOpen, ref } = useFilterPopover();
  const isActive = !!(from || to);
  return (
    <div className={cn('desk-filter-icon', isActive && 'is-active')} ref={ref}>
      <button
        type="button"
        className="desk-filter-icon-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="期日範囲"
        aria-label="期日範囲"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <CalendarRange className="desk-filter-icon-svg h-4 w-4" aria-hidden="true" />
        <span className="desk-filter-icon-label">期日</span>
      </button>
      <DeskDateRangePopover
        from={from}
        to={to}
        onChange={onChange}
        idPrefix="desk-task-filter-due"
        hidden={!open}
      />
    </div>
  );
}

export interface DeskFilterToolbarProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  chatKeyword: string;
  onChatKeywordChange: (value: string) => void;
  /** アーカイブ絞り込み（rete-desk-0061）。 */
  archiveOnly: boolean;
  onArchiveToggle: () => void;
  /** チャット顛末フィルタ（rete-desk-0050）。true = 顛末記録済のみ。 */
  chatTenmatsuOnly: boolean;
  onChatTenmatsuToggle: () => void;
  /** メンション From フィルタ（複数選択 / rete-desk-0049）。空配列 = 全て。 */
  mentionFrom: string[];
  onMentionFromToggle: (id: string) => void;
  /** メンション To フィルタ（複数選択 / rete-desk-0049）。空配列 = 全て。 */
  mentionTo: string[];
  onMentionToToggle: (id: string) => void;
  taskKeyword: string;
  onTaskKeywordChange: (value: string) => void;
  dueFrom: string;
  dueTo: string;
  onDueChange: (range: { from: string; to: string }) => void;
  /** ステータスフィルタの選択集合（rete-desk-0038・0056。空 = 既定「未完了のみ」）。 */
  statusFilter: TaskStatus[];
  /** ステータス 1 値のトグル。 */
  onStatusToggle: (status: TaskStatus) => void;
  /** 担当者フィルタ（複数選択 / rete-desk-0054）。空配列 = 全て。 */
  assigneeFilter: string[];
  /** 担当者 1 件のトグル。 */
  onAssigneeToggle: (id: string) => void;
  /** 分類フィルタ（複数選択 / rete-desk-0055）。空配列 = 全て。 */
  categoryFilter: number[];
  /** 分類 1 件のトグル。 */
  onCategoryToggle: (id: number) => void;
  /** 顛末フィルタ（rete-desk-0052）。 */
  tenmatsuOnly: boolean;
  onTenmatsuToggle: () => void;
  /** タスク側メンション From フィルタ（複数選択 / dsk-0203）。空配列 = 全て。 */
  taskMentionFrom: string[];
  onTaskMentionFromToggle: (id: string) => void;
  /** タスク側メンション To フィルタ（複数選択 / dsk-0203）。空配列 = 全て。 */
  taskMentionTo: string[];
  onTaskMentionToToggle: (id: string) => void;
  /** 担当者候補（実データ）。 */
  accounts: Account[];
  /** 分類候補（実データ）。 */
  categories: Category[];
  onClearChat: () => void;
  onClearTask: () => void;
}

export function DeskFilterToolbar({
  mode,
  onModeChange,
  chatKeyword,
  onChatKeywordChange,
  archiveOnly,
  onArchiveToggle,
  chatTenmatsuOnly,
  onChatTenmatsuToggle,
  mentionFrom,
  onMentionFromToggle,
  mentionTo,
  onMentionToToggle,
  taskKeyword,
  onTaskKeywordChange,
  dueFrom,
  dueTo,
  onDueChange,
  statusFilter,
  onStatusToggle,
  assigneeFilter,
  onAssigneeToggle,
  categoryFilter,
  onCategoryToggle,
  tenmatsuOnly,
  onTenmatsuToggle,
  taskMentionFrom,
  onTaskMentionFromToggle,
  taskMentionTo,
  onTaskMentionToToggle,
  accounts,
  categories,
  onClearChat,
  onClearTask,
}: DeskFilterToolbarProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  useAlignKeywordWithHomeTab(headerRef);
  const {
    listRef: searchModeRef,
    onMouseOver: onSearchModeTabMouseOver,
    onMouseLeave: onSearchModeTabMouseLeave,
    bandStyle: searchModeTabHoverBandStyle,
  } = useRowHoverBand<HTMLDivElement>('.desk-search-mode-tab', 'horizontal');
  const statusOptions: MultiSelectOption<TaskStatus>[] = TASK_STATUS_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const assigneeOptions: MultiSelectOption<string>[] = accounts.map((a) => ({
    value: a.id,
    label: a.name,
  }));
  const categoryOptions: MultiSelectOption<number>[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  return (
    <div className="desk-shell-header" ref={headerRef}>
      {/* 両モードのフィルタバーは常時 DOM 在駐で CSS（data-search-mode）切替のため、真の
          tabpanel 切替を伴わない。role=tab ではなく aria-pressed トグルボタン群として扱う。 */}
      <div
        className="desk-search-mode"
        role="group"
        aria-label="検索モード"
        ref={searchModeRef}
        onMouseOver={onSearchModeTabMouseOver}
        onMouseLeave={onSearchModeTabMouseLeave}
      >
        {searchModeTabHoverBandStyle ? (
          <div
            aria-hidden="true"
            className="desk-search-mode-tab-hoverband"
            style={searchModeTabHoverBandStyle}
          />
        ) : null}
        <button
          type="button"
          className={cn('desk-search-mode-tab', mode === 'chat' && 'is-active')}
          aria-pressed={mode === 'chat'}
          onClick={() => onModeChange('chat')}
        >
          チャット
        </button>
        <button
          type="button"
          className={cn('desk-search-mode-tab', mode === 'task' && 'is-active')}
          aria-pressed={mode === 'task'}
          onClick={() => onModeChange('task')}
        >
          タスク
        </button>
      </div>

      <div className="desk-search-area" data-search-mode={mode}>
        {/* チャット: キーワード + メンション + 顛末/アーカイブ（すべて配線）+ クリア */}
        <div className="desk-filter-bar is-static" data-mode="chat">
          <div className="desk-filter-keyword">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <input
              type="search"
              placeholder="キーワードで検索..."
              aria-label="チャットを検索"
              value={chatKeyword}
              onChange={(e) => onChatKeywordChange(e.target.value)}
              // C-ESC Layer A: 検索ボックスの ESC は値クリア（オーバーレイは閉じない）。
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !e.nativeEvent.isComposing) onChatKeywordChange('');
              }}
            />
          </div>
          {/* メンション From/To（配線 / rete-desk-0049）。From・To とも複数選択・候補=全アカウント。
              絞り込みはサーバー側（§5.3 A案）で、選択変更時に呼び出し側がテーマ一覧を再取得する。 */}
          <MentionFilter
            accounts={accounts}
            mentionFrom={mentionFrom}
            onMentionFromToggle={onMentionFromToggle}
            mentionTo={mentionTo}
            onMentionToToggle={onMentionToToggle}
          />
          {/* 顛末（配線 / rete-desk-0050）。hasTenmatsu（tenmatsu 非空）を「記録済」とみなす。
              タスク側 0052 と同型。モック並び順に従いメンションの後・アーカイブの前へ置く。
              dsk-0403: flash 1クリック自動トグル化。dsk-0436: 一過性 flash popup は撤去（リストを出さない）。 */}
          <ToggleFilter
            Icon={ClipboardCheck}
            label="顛末"
            switchLabel="顛末記録済のみ表示"
            active={chatTenmatsuOnly}
            onToggle={onChatTenmatsuToggle}
            flash
          />
          {/* アーカイブ（配線 / rete-desk-0061）。既定でアーカイブ済を除外、ON で済のみ表示。 */}
          <ToggleFilter
            Icon={Archive}
            label="アーカイブ"
            switchLabel="アーカイブ済のみ表示"
            active={archiveOnly}
            onToggle={onArchiveToggle}
          />
          <button
            type="button"
            className="desk-filter-clear"
            title="フィルタをクリア"
            aria-label="チャットフィルタをクリア"
            onClick={onClearChat}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="desk-filter-icon-label">クリア</span>
          </button>
        </div>

        {/* タスク: キーワード（配線）+ ステータス/メンション/担当者/分類/顛末/期日（配線）+ クリア */}
        <div className="desk-filter-bar is-static" data-mode="task">
          <div className="desk-filter-keyword">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <input
              type="search"
              placeholder="チケット名・本文・# で検索..."
              aria-label="タスクを検索（タイトル/説明/顛末/チケット番号）"
              value={taskKeyword}
              onChange={(e) => onTaskKeywordChange(e.target.value)}
              // C-ESC Layer A: 検索ボックスの ESC は値クリア（オーバーレイは閉じない）。
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !e.nativeEvent.isComposing) onTaskKeywordChange('');
              }}
            />
          </div>
          {/* ステータス（配線 / rete-desk-0038・0056）。「全て」は撤去（既定=未完了）。chip 並び先頭。 */}
          <MultiSelectFilter
            Icon={CircleCheckBig}
            label="ステータス"
            options={statusOptions}
            selected={statusFilter}
            onToggle={onStatusToggle}
          />
          {/* メンション From/To（配線 / dsk-0203）。チャット側と同じ MentionFilter を共有（§3 コピペ防止）。
              判定はサーバー（GET /tasks の mentionFrom/mentionTo）で行い、一致 id 集合をツリーの
              クライアント絞り込みへ積集合として合流させる（use-task-mention-filter）。 */}
          <MentionFilter
            accounts={accounts}
            mentionFrom={taskMentionFrom}
            onMentionFromToggle={onTaskMentionFromToggle}
            mentionTo={taskMentionTo}
            onMentionToToggle={onTaskMentionToToggle}
          />
          {/* 顛末（配線 / rete-desk-0052）。task.tenmatsu 非空を「記録済」とみなす。
              dsk-0403: flash 1クリック自動トグル化。dsk-0436: 一過性 flash popup は撤去（リストを出さない）。 */}
          <ToggleFilter
            Icon={ClipboardCheck}
            label="顛末"
            switchLabel="顛末記録済のみ表示"
            active={tenmatsuOnly}
            onToggle={onTenmatsuToggle}
            flash
          />
          {/* 担当者（配線 / 複数選択 + combobox 手入力絞り込み rete-desk-0054）。
              「全て」項目は撤去（既定=空配列=全て表示。ステータスと統一 / rete-desk-0059）。全解除はクリアボタン。 */}
          <MultiSelectFilter
            Icon={User}
            label="担当者"
            options={assigneeOptions}
            selected={assigneeFilter}
            onToggle={onAssigneeToggle}
            searchable
          />
          {/* 分類（配線 / 複数選択 rete-desk-0055）。値は Category.id（number のまま受け渡し）。
              「全て」項目は撤去（rete-desk-0058）。全解除はクリアボタン。 */}
          <MultiSelectFilter
            Icon={Tag}
            label="分類"
            options={categoryOptions}
            selected={categoryFilter}
            onToggle={onCategoryToggle}
          />
          <DueRangeFilter from={dueFrom} to={dueTo} onChange={onDueChange} />
          <button
            type="button"
            className="desk-filter-clear"
            title="フィルタをクリア"
            aria-label="タスクフィルタをクリア"
            onClick={onClearTask}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="desk-filter-icon-label">クリア</span>
          </button>
        </div>
      </div>
    </div>
  );
}
