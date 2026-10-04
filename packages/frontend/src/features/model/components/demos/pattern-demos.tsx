'use client';

import { useState } from 'react';
import { CircleCheckBig } from 'lucide-react';
import {
  FilterBar,
  FilterChipSelect,
  FilterClear,
  FilterSearchInput,
} from '@/components/shared/filter-bar';
import { PageTitle } from '@/components/shared/page-title';
import { Labeled } from './shared';

/**
 * comp-toolbar / comp-tabs / comp-sidebar-link テーマの実描画見本（mdl-0007 Batch D）。
 * この3つは canonical な components/ui/* が無く、features 側の反復実装（globals.css の
 * .sp-page-tab / .sidebar-link 等）から蒸留した共通パターン。タブ・サイドバーは実 CSS クラスを
 * そのまま再利用して描画する（globals.css 改修に見本が自動追随する）。ツールバーは共通形の合成。
 */

/** 蒸留した共通形のツールバーボタン（透明地・text-xs・アイコン⇄ラベル gap 4px＝mdl-0024・hover で ink 文字）。 */
function ToolbarBtn({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex h-[1.875rem] items-center gap-1 rounded-[0.375rem] bg-transparent px-2.5 text-xs font-medium transition-colors hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)] ${
        danger ? 'text-[var(--sp-accent-red)]' : 'text-[var(--sp-text-warm-2)]'
      }`}
    >
      {children}
    </button>
  );
}

/** 画面タイトルのライブ見本（comp-page-title / mdl-0028）。実物の共通コンポーネントをそのまま描画する。 */
export function PageTitleLiveDemo() {
  return (
    <div>
      <PageTitle title="掲示板" />
      <PageTitle title="メンバー" description="テナントに所属するアカウントを管理します" />
    </div>
  );
}

/** 画面タイトルの悪例（mdl-0028 以前の分裂＝太字+下区切り線 / 画面ごとの余白バラつき）。 */
export function PageTitleUsageBadDemo() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="border-b border-[var(--sp-line-warm)] pb-4">
        <h2 className="text-xl font-bold text-[var(--sp-text-warm)]">掲示板（太字+区切り線）</h2>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-[var(--sp-text-warm)]">
        ファイル（余白が画面ごとに別値）
      </h2>
    </div>
  );
}

/** 検索フィルタ帯のライブ見本（comp-filter-bar / mdl-0026）。実物の共通コンポーネントをそのまま描画する。 */
export function FilterBarLiveDemo() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'locked'>('all');
  return (
    <FilterBar>
      <FilterSearchInput
        placeholder="氏名 / メールで検索..."
        value={keyword}
        onChange={setKeyword}
      />
      <FilterChipSelect
        icon={CircleCheckBig}
        label="状態"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'all', label: 'すべて' },
          { value: 'active', label: '有効' },
          { value: 'locked', label: 'ロック中' },
        ]}
      />
      <FilterClear
        onClick={() => {
          setKeyword('');
          setStatus('all');
        }}
      />
    </FilterBar>
  );
}

/** 検索フィルタ帯の悪例（mdl-0026 以前の設定タブ実装＝sp-card の箱 + native select）。 */
export function FilterBarUsageBadDemo() {
  return (
    <div
      className="sp-card"
      style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
      aria-hidden="true"
    >
      <input
        className="sp-input sp-input--filter"
        placeholder="氏名 / メールで検索..."
        readOnly
        style={{ width: '12rem' }}
      />
      <select
        className="sp-select sp-input--filter"
        defaultValue="all"
        style={{ pointerEvents: 'none' }}
      >
        <option value="all">状態: すべて</option>
      </select>
    </div>
  );
}

/** ツールバー共通形（透明地・薄いボタン・主要アクション右端。検索・絞り込みは FilterBar へ分離＝mdl-0026）。 */
export function ToolbarPatternDemo() {
  return (
    <div className="flex items-center gap-2 border-y border-[var(--sp-line-warm-2)] px-2 py-1.5">
      <ToolbarBtn>並び替え</ToolbarBtn>
      <ToolbarBtn>ダウンロード</ToolbarBtn>
      <div className="ml-auto flex items-center gap-1">
        <ToolbarBtn>＋ 新規登録</ToolbarBtn>
        <ToolbarBtn danger>削除</ToolbarBtn>
      </div>
    </div>
  );
}

/** 正しい例: 主要アクション右端（ml-auto 分離）・ボタンは透明地 + hover ink。検索は置かない。 */
export function ToolbarUsageGoodDemo() {
  return (
    <Labeled label="主要アクション=右端（ml-auto）・ボタン高さと hover 表現が揃う・検索/絞り込みは FilterBar 側">
      <div className="flex items-center gap-2 border-y border-[var(--sp-line-warm-2)] px-2 py-1.5">
        <ToolbarBtn>並び替え</ToolbarBtn>
        <div className="ml-auto">
          <ToolbarBtn>＋ 新規</ToolbarBtn>
        </div>
      </div>
    </Labeled>
  );
}

/**
 * だめな例: ボタン高さ・色・角丸が行内で不揃い、主要アクションが中央に埋もれる。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function ToolbarUsageBadDemo() {
  return (
    <Labeled label="高さ・色・角丸が不揃い / 新規（主要アクション）が中央に埋もれる">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          border: '1px solid #ccc',
          padding: '0.375rem 0.5rem',
          background: '#fff',
        }}
      >
        <input
          type="text"
          placeholder="検索"
          style={{ height: '2.75rem', padding: '0 0.75rem', border: '1px solid #999' }}
        />
        <button
          type="button"
          style={{
            height: '2rem',
            padding: '0 1rem',
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '9999px',
            fontSize: '0.875rem',
          }}
        >
          新規
        </button>
        <button
          type="button"
          style={{
            height: '2.5rem',
            padding: '0 0.75rem',
            background: '#eee',
            border: '1px solid #999',
            fontSize: '0.75rem',
          }}
        >
          フィルタ
        </button>
        <button
          type="button"
          style={{
            height: '1.5rem',
            padding: '0 0.5rem',
            background: '#fff',
            border: '1px dashed #666',
            fontSize: '0.6875rem',
          }}
        >
          削除
        </button>
      </div>
    </Labeled>
  );
}

/** タブ共通形（下線型・実 CSS クラス .sp-page-tabs / .sp-page-tab をそのまま描画）。 */
export function TabsPatternDemo() {
  return (
    <div className="sp-page-tabs">
      <button type="button" className="sp-page-tab active">
        プロパティ
      </button>
      <button type="button" className="sp-page-tab">
        履歴
        <span className="sp-page-tab-badge">3</span>
      </button>
      <button type="button" className="sp-page-tab">
        顛末
      </button>
    </div>
  );
}

/** 正しい例: 下線型 + 選択中は --sp-accent-ink の 2px 下線・同色文字（cmn-0135）。 */
export function TabsUsageGoodDemo() {
  return (
    <Labeled label="下線型で統一（選択中=ink 色の下線 + 文字・非選択=薄文字 + 透明下線）">
      <div className="sp-page-tabs">
        <button type="button" className="sp-page-tab">
          概要
        </button>
        <button type="button" className="sp-page-tab active">
          メンバー
        </button>
        <button type="button" className="sp-page-tab">
          設定
        </button>
      </div>
    </Labeled>
  );
}

/**
 * だめな例: 画面独自の pill タブ + 選択色の hex 直書き。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function TabsUsageBadDemo() {
  return (
    <Labeled label="独自 pill タブ・選択色 hex 直書き（下線型の他画面と表現が割れる）">
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          style={{
            padding: '0.375rem 1rem',
            borderRadius: '9999px',
            border: 'none',
            background: '#3f51b5',
            color: '#fff',
            fontSize: '0.8125rem',
          }}
        >
          プロパティ
        </button>
        <button
          type="button"
          style={{
            padding: '0.375rem 1rem',
            borderRadius: '9999px',
            border: '1px solid #999',
            background: '#fff',
            fontSize: '0.8125rem',
          }}
        >
          履歴
        </button>
      </div>
    </Labeled>
  );
}

/** サイドバー項目の共通形（実 CSS クラス .sidebar-link / .sidebar-badge を dark 地で描画）。 */
export function SidebarLinkPatternDemo() {
  return (
    <div
      className="w-64 overflow-hidden rounded-md py-2"
      style={{ background: 'hsl(var(--sidebar))' }}
    >
      <div className="sidebar-section-label">セクション</div>
      <button type="button" className="sidebar-link w-full text-left">
        通常項目
      </button>
      <button type="button" className="sidebar-link active w-full text-left">
        選択中（active: 白ピル 42%・角丸 8px）
      </button>
      <button type="button" className="sidebar-link w-full text-left">
        バッジ付き
        <span className="sidebar-badge ml-auto">3</span>
      </button>
      <button type="button" className="sidebar-link disabled w-full text-left">
        準備中（disabled）
      </button>
    </div>
  );
}

/** 正しい例: 共通 .sidebar-link + .sidebar-badge を使う（active/hover/バッジが全タブで揃う）。 */
export function SidebarLinkUsageGoodDemo() {
  return (
    <Labeled label="共通 .sidebar-link + .sidebar-badge（active=白ピル・バッジ=グレー地で統一）">
      <div
        className="w-64 overflow-hidden rounded-md py-2"
        style={{ background: 'hsl(var(--sidebar))' }}
      >
        <button type="button" className="sidebar-link active w-full text-left">
          受信箱
          <span className="sidebar-badge ml-auto">12</span>
        </button>
        <button type="button" className="sidebar-link w-full text-left">
          アーカイブ
        </button>
      </div>
    </Labeled>
  );
}

/**
 * だめな例: active をピンク不透明で塗る（hover 色の流用）+ バッジ色の独自実装。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function SidebarLinkUsageBadDemo() {
  return (
    <Labeled label="active にピンク不透明（hover 用トークンの流用）・バッジが画面独自色">
      <div
        className="w-64 overflow-hidden rounded-md py-2"
        style={{ background: 'hsl(var(--sidebar))' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            background: 'hsl(336 26% 22%)',
            color: 'hsl(220 10% 88%)',
            fontWeight: 600,
          }}
        >
          選択中のつもり（hover 色で塗った）
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            color: 'hsl(220 10% 88% / 0.75)',
          }}
        >
          通知
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.625rem',
              fontWeight: 600,
              padding: '0.125rem 0.375rem',
              borderRadius: '0.625rem',
              background: '#e91e63',
              color: '#fff',
            }}
          >
            5
          </span>
        </div>
      </div>
    </Labeled>
  );
}
