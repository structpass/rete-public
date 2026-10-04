'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Download, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { highlightMatches } from '@/lib/highlight';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { Labeled, DemoRow } from './shared';

/**
 * state-representation / color-tokens / crud-consistency テーマの実描画見本（mdl-0012）。
 * ConfirmDialog の面クラスは StaticAlertPanel で portal 非使用の静的合成
 * （confirm-dialog.tsx = message + キャンセル/OK。AlertDialog は下層部品であり CRUD 削除確認の正解例ではない）。
 */

function StaticAlertPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full max-w-lg gap-4 border bg-white p-6 shadow-lg sm:rounded-lg">
      {children}
    </div>
  );
}

/** loading / empty / error の3状態を横並びで示す（canonical: Spinner・empty文言・取得失敗=領域内）。 */
export function StateTriptychDemo() {
  return (
    <DemoRow>
      <Labeled label="loading（Spinner + 遅延表示。200ms 未満は出さない）">
        <div className="flex h-16 w-40 items-center justify-center gap-2 rounded-md border border-[var(--sp-line-warm-2)] text-sm text-[var(--sp-text-warm-2)]">
          <Spinner className="h-4 w-4" />
          読み込み中…
        </div>
      </Labeled>
      <Labeled label="empty（現状は画面ごとに割れる。ここは文言表示側＝members-screen.tsx）">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-[var(--sp-line-warm-2)] text-sm text-[var(--sp-text-warm-mute)]">
          該当するメンバーがいません
        </div>
      </Labeled>
      <Labeled label="error 取得失敗（領域内 role=alert・destructive。操作失敗は toast）">
        <div
          role="alert"
          className="flex h-16 w-40 items-center justify-center rounded-md border border-[var(--sp-line-warm-2)] px-2 text-center text-xs text-[var(--sp-accent-red)]"
        >
          一覧の取得に失敗しました
        </div>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: loading=Spinner、取得失敗=領域内、操作失敗=toast。 */
export function StateUsageGoodDemo() {
  return (
    <Labeled label="loading=Spinner。取得失敗=領域内 role=alert。操作失敗=toast">
      <div className="w-52 space-y-2 rounded-md border border-[var(--sp-line-warm-2)] p-3">
        <div className="flex items-center gap-2 text-sm text-[var(--sp-text-warm-2)]">
          <Spinner className="h-4 w-4" />
          一覧を読み込み中…
        </div>
        <p role="alert" className="text-xs text-[var(--sp-accent-red)]">
          一覧の取得に失敗しました
        </p>
        <div className="rounded-md bg-[#1f2937] px-2 py-1 text-[0.6875rem] text-white shadow">
          （toast）保存に失敗しました
        </div>
      </div>
    </Labeled>
  );
}

/**
 * だめな例: 画面独自ローダー + 取得失敗を toast のみ（領域空）+ 操作失敗を本文に英語生文言。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function StateUsageBadDemo() {
  return (
    <Labeled label="独自ローダー / 取得失敗を toast のみで領域空 / 操作失敗を本文に英語生文言">
      <div className="w-52 space-y-2 rounded-md border border-[var(--sp-line-warm-2)] p-3">
        <div className="flex items-center gap-2 text-sm">
          <span
            className="animate-pulse"
            style={{
              display: 'inline-block',
              width: '0.75rem',
              height: '0.75rem',
              borderRadius: '9999px',
              background: '#7c3aed',
            }}
          />
          Loading...
        </div>
        <div
          className="h-8 rounded-md border border-dashed border-[var(--sp-line-warm-2)]"
          aria-hidden
        />
        <div className="rounded-md bg-[#1f2937] px-2 py-1 text-[0.6875rem] text-white shadow">
          （toast）一覧の取得に失敗しました
        </div>
        <div style={{ color: '#dc2626', fontSize: '0.8rem' }}>
          Error: Request failed with status 500
        </div>
      </div>
    </Labeled>
  );
}

/** colorトークンの分類カタログ（面/枠・アクセント・文字・状態・選択）。 */
export function ColorTokensSwatchesDemo() {
  return (
    <div className="space-y-3">
      <DemoRow>
        <Labeled label="面/枠: --sp-paper">
          <div className="h-10 w-16 rounded-md border border-[var(--sp-line-warm)] bg-[var(--sp-paper)]" />
        </Labeled>
        <Labeled label="面/枠: --sp-card">
          <div className="h-10 w-16 rounded-md border border-[var(--sp-line-warm)] bg-[var(--sp-card)]" />
        </Labeled>
        <Labeled label="面/枠: --sp-line-warm">
          <div className="h-10 w-16 rounded-md bg-[var(--sp-card)] border-2 border-[var(--sp-line-warm)]" />
        </Labeled>
      </DemoRow>
      <DemoRow>
        <Labeled label="アクセント: --sp-accent-teal（主要塗り）">
          <div className="h-10 w-16 rounded-md bg-[var(--sp-accent-teal)]" />
        </Labeled>
        <Labeled label="アクセント: --sp-accent-ink（副次文字）">
          <div className="h-10 w-16 rounded-md bg-[var(--sp-accent-soft)] flex items-center justify-center text-[var(--sp-accent-ink)] text-xs font-medium">
            ink
          </div>
        </Labeled>
        <Labeled label="アクセント: --sp-accent-red（destructive）">
          <div className="h-10 w-16 rounded-md bg-[var(--sp-accent-red)]" />
        </Labeled>
      </DemoRow>
      <DemoRow>
        <Labeled label="文字: --sp-text-warm">
          <span className="text-sm font-medium text-[var(--sp-text-warm)]">本文文字</span>
        </Labeled>
        <Labeled label="文字: --sp-text-warm-2">
          <span className="text-sm text-[var(--sp-text-warm-2)]">副次文字</span>
        </Labeled>
        <Labeled label="文字: --sp-text-warm-mute">
          <span className="text-sm text-[var(--sp-text-warm-mute)]">ミュート文字</span>
        </Labeled>
      </DemoRow>
      <DemoRow>
        <Labeled label="状態: --sp-status-* （Badge variant 経由）">
          <div className="flex gap-1.5">
            <Badge variant="todo">未対応</Badge>
            <Badge variant="progress">対応中</Badge>
            <Badge variant="review">レビュー</Badge>
            <Badge variant="done">完了</Badge>
          </div>
        </Labeled>
      </DemoRow>
      <DemoRow>
        <Labeled label="選択: --sp-select-soft">
          <div className="h-10 w-16 rounded-md bg-[var(--sp-select-soft)]" />
        </Labeled>
        <Labeled label="選択: --sp-select-hover">
          <div className="h-10 w-16 rounded-md bg-[var(--sp-select-hover)]" />
        </Labeled>
      </DemoRow>
    </div>
  );
}

/** 正しい例: 色は --sp-* トークン参照のみ（hex を直書きしない）。 */
export function ColorTokensUsageGoodDemo() {
  return (
    <Labeled label="var(--sp-accent-teal) を参照（配色変更が globals.css 1箇所で波及）">
      <button
        type="button"
        className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
        style={{ background: 'var(--sp-accent-teal)' }}
      >
        保存
      </button>
    </Labeled>
  );
}

/**
 * だめな例: 色 hex の直書き。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function ColorTokensUsageBadDemo() {
  return (
    <Labeled label="#1fb6a2 を直書き（トークン変更が波及せずこのボタンだけ古い色に取り残される）">
      <button
        type="button"
        style={{
          background: '#1fb6a2',
          color: '#fff',
          borderRadius: '0.375rem',
          padding: '0.375rem 0.75rem',
          fontSize: '0.875rem',
          fontWeight: 500,
          border: 'none',
        }}
      >
        保存
      </button>
    </Labeled>
  );
}

/** CRUD 一覧の共通骨格（一覧取得/toast=useCrudApi・削除確認=useDeleteConfirm+ConfirmDialog・状態=Badge）。 */
export function CrudAnatomyDemo() {
  return (
    <div className="w-72 space-y-2">
      <div className="flex items-center gap-2 rounded-md border border-[var(--sp-line-warm-2)] bg-[var(--sp-card)] px-2 py-1.5 text-xs text-[var(--sp-text-warm-2)]">
        <span className="rounded-[0.375rem] bg-transparent px-1">
          useCrudApi（items/meta/loading）
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b border-[var(--sp-line-warm-2)]">
            <td className="py-1.5 pr-2">API 設計の見直し</td>
            <td className="py-1.5">
              <Badge variant="progress">対応中</Badge>
            </td>
            <td className="py-1.5 text-right text-[0.6875rem] text-[var(--sp-accent-ink)]">削除</td>
          </tr>
        </tbody>
      </table>
      {/* ConfirmDialog 骨格の静的合成。useDeleteConfirm が deleteTarget を保持し message を渡す。 */}
      <StaticAlertPanel>
        <p className="text-sm text-[var(--sp-text-warm)]">
          「API 設計の見直し」を削除しますか？削除すると元に戻せません。
        </p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          <Button type="button" variant="outline" size="sm" tabIndex={-1}>
            キャンセル
          </Button>
          <Button type="button" variant="destructive" size="sm" tabIndex={-1}>
            OK
          </Button>
        </div>
      </StaticAlertPanel>
    </div>
  );
}

/** 正しい例: 状態は Badge variant、削除は useDeleteConfirm + ConfirmDialog（confirm() を使わない）。 */
export function CrudUsageGoodDemo() {
  return (
    <Labeled label="Badge variant で状態表示・削除は useDeleteConfirm 経由の ConfirmDialog で確認を挟む">
      <div className="flex items-center gap-2 rounded-md border border-[var(--sp-line-warm-2)] px-2 py-1.5 text-sm">
        <Badge variant="done">完了</Badge>
        <span className="text-[var(--sp-text-warm)]">結合テスト実施</span>
        <span className="ml-auto text-[0.6875rem] text-[var(--sp-accent-ink)]">
          削除（ConfirmDialog 経由）
        </span>
      </div>
    </Labeled>
  );
}

/**
 * だめな例: window.confirm で即削除・状態を画面独自の色付きテキストで表現。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function CrudUsageBadDemo() {
  return (
    <Labeled label="window.confirm で即削除（ConfirmDialog を経由しない）・状態が画面独自の色文字">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          border: '1px solid #ccc',
          borderRadius: '0.375rem',
          padding: '0.375rem 0.5rem',
          fontSize: '0.875rem',
        }}
      >
        <span style={{ color: '#2e7d32', fontWeight: 600 }}>[完了]</span>
        <span>結合テスト実施</span>
        <span
          style={{
            marginLeft: 'auto',
            color: '#dc2626',
            fontSize: '0.75rem',
            textDecoration: 'underline',
          }}
        >
          削除（confirm()）
        </span>
      </div>
    </Labeled>
  );
}

/** フォント階層（見出し/小見出し/本文/補助）の実物比較（mdl-0014）。 */
export function TypographyHierarchyDemo() {
  return (
    <div className="w-72 space-y-2 rounded-md border border-[var(--sp-line-warm-2)] bg-[var(--sp-card)] p-3">
      <h2 className="text-xl font-semibold text-[var(--sp-text-warm)]">見出し（h2）</h2>
      <h3 className="text-sm font-semibold text-[var(--sp-text-warm)]">小見出し（h3/h4）</h3>
      <p className="text-sm text-[var(--sp-text-warm)]">本文テキスト。既定色を継承する。</p>
      <p className="text-xs text-[var(--sp-text-warm-mute)]">補助・caption テキスト</p>
    </div>
  );
}

/** 正しい例: Tailwind 任意値クラスで色/サイズ/太さを指定（inline style を使わない）。 */
export function TypographyUsageGoodDemo() {
  return (
    <Labeled label="text-xl font-semibold text-[var(--sp-text-warm)]（Tailwind クラスのみ）">
      <h2 className="text-xl font-semibold text-[var(--sp-text-warm)]">ページ見出し</h2>
    </Labeled>
  );
}

/**
 * だめな例: inline style で色指定（Tailwind クラスに寄せていない）。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function TypographyUsageBadDemo() {
  return (
    <Labeled label="style={{ color: 'var(--sp-text-warm)' }} を inline で指定（grep 性が低い）">
      <h2 className="text-xl font-semibold" style={{ color: 'var(--sp-text-warm)' }}>
        ページ見出し
      </h2>
    </Labeled>
  );
}

/** アイコンサイズ階層の実物比較（mdl-0019・4段階の px 階層）。 */
export function IconSizeHierarchyDemo() {
  return (
    <DemoRow>
      <Labeled label="h-3 w-3（極小・ソート指標/チップ内）">
        <Trash2 className="h-3 w-3 text-[var(--sp-text-warm-2)]" />
      </Labeled>
      <Labeled label="h-3.5 w-3.5（コンパクト・一覧行内/ツールバー）">
        <Trash2 className="h-3.5 w-3.5 text-[var(--sp-text-warm-2)]" />
      </Labeled>
      <Labeled label="h-4 w-4（標準）">
        <Trash2 className="h-4 w-4 text-[var(--sp-text-warm-2)]" />
      </Labeled>
      <Labeled label="h-5 w-5 / h-6 w-6（状態・単独配置）">
        <Trash2 className="h-5 w-5 text-[var(--sp-text-warm-2)]" />
      </Labeled>
    </DemoRow>
  );
}

/** icon-only（一覧行内操作）と icon+テキスト（フォーム/カード操作）の使い分け（mdl-0015）。 */
export function IconOnlyVsTextDemo() {
  return (
    <div className="w-72 space-y-3">
      <Labeled label="icon-only（一覧行内・aria-label 必須）">
        <div className="flex items-center gap-2 rounded-md border border-[var(--sp-line-warm-2)] px-2 py-1.5 text-sm">
          <span className="text-[var(--sp-text-warm)]">結合テスト実施</span>
          <button
            type="button"
            aria-label="編集"
            className="ml-auto rounded p-0.5 text-[var(--sp-text-warm-mute)] hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="削除"
            className="rounded p-0.5 text-[var(--sp-text-warm-mute)] hover:bg-[color-mix(in_srgb,var(--sp-accent-red)_10%,transparent)] hover:text-[var(--sp-accent-red)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </Labeled>
      <Labeled label="icon+テキスト（フォーム/カード単位の操作）">
        <button
          type="button"
          className="flex items-center gap-1 rounded-md bg-[var(--sp-accent-teal)] px-3 py-1.5 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          新規登録
        </button>
      </Labeled>
    </div>
  );
}

/** 正しい例: 一覧行内は h-3.5・削除は親ボタンの hover で薄赤帯 + 赤（アイコンは無着色・階層クラスのみ）。 */
export function IconUsageGoodDemo() {
  return (
    <Labeled label="h-3.5 w-3.5 + 親ボタン is-danger 系（平常 mute・hover 薄赤帯 + 赤）">
      <button
        type="button"
        aria-label="削除"
        className="rounded p-0.5 text-[var(--sp-text-warm-mute)] hover:bg-[color-mix(in_srgb,var(--sp-accent-red)_10%,transparent)] hover:text-[var(--sp-accent-red)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </Labeled>
  );
}

/**
 * だめな例: 数値属性サイズ + 赤の常時焼き込み + strokeWidth 明示。
 * 規約違反の展示のため意図的に width/height 属性 + inline style で書いている（実装で真似しない）。
 */
export function IconUsageBadDemo() {
  return (
    <Labeled label="width={14} height={14} + style={{ color: 'var(--sp-accent-red)' }} + strokeWidth={1.5}">
      <button type="button" aria-label="削除">
        <Trash2
          width={14}
          height={14}
          strokeWidth={1.5}
          style={{ color: 'var(--sp-accent-red)' }}
        />
      </button>
    </Labeled>
  );
}

/** ホバー帯色の2系統（mdl-0020 / mdl-0050 改訂）。実物にマウスを載せて確かめられるライブ見本。 */
export function HoverBandDemo() {
  // mdl-0050: 明細行は行個別の :hover 背景でなく、単一の薄グレー帯（.sp-row-hoverband）が
  // スライド追従する（実装と同じ useRowHoverBand を使うライブ見本）。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('.sp-row-pillable');
  return (
    <DemoRow>
      <Labeled label="明細行: 単一の薄グレー帯（.sp-row-hoverband）がスライド追従">
        <div
          ref={listRef}
          onMouseOver={onMouseOver}
          onMouseLeave={onMouseLeave}
          className="relative w-56 rounded-md border border-[var(--sp-line-warm-2)] text-sm text-[var(--sp-text-warm)]"
        >
          {['要件定義レビュー', '結合テスト実施', 'リリース判定会'].map((t) => (
            <div
              key={t}
              className="sp-row-pillable cursor-pointer border-b border-[var(--sp-line-warm-2)] px-3 py-1.5 last:border-b-0"
            >
              <span>{t}</span>
            </div>
          ))}
          {bandStyle ? <div aria-hidden className="sp-row-hoverband" style={bandStyle} /> : null}
        </div>
      </Labeled>
      <Labeled label="メニュー/候補: hover で --sp-accent-soft 帯 + ink 文字">
        <div className="w-44 rounded-md border border-[var(--sp-line-warm-2)] p-1 text-sm text-[var(--sp-text-warm)]">
          {['名前を変更', '複製', 'アーカイブ'].map((t) => (
            <div
              key={t}
              className="cursor-pointer rounded px-2 py-1 hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)]"
            >
              {t}
            </div>
          ))}
        </div>
      </Labeled>
    </DemoRow>
  );
}

/** cursor 語彙の見本（mdl-0020）: pointer / not-allowed / grab / col-resize。 */
export function HoverCursorDemo() {
  return (
    <DemoRow>
      <Labeled label="押せる: cursor-pointer">
        <button
          type="button"
          className="cursor-pointer rounded-md border border-[var(--sp-line-warm)] px-3 py-1.5 text-sm text-[var(--sp-text-warm)] hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)]"
        >
          編集
        </button>
      </Labeled>
      <Labeled label="無効: not-allowed + 減光">
        <button
          type="button"
          disabled
          className="rounded-md border border-[var(--sp-line-warm)] px-3 py-1.5 text-sm text-[var(--sp-text-warm)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          編集
        </button>
      </Labeled>
      <Labeled label="掴める: grab（掴み中 grabbing）">
        <div className="flex cursor-grab items-center gap-1 rounded-md border border-[var(--sp-line-warm-2)] px-3 py-1.5 text-sm text-[var(--sp-text-warm)] active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5 text-[var(--sp-text-warm-mute)]" />
          並べ替え可能な行
        </div>
      </Labeled>
      <Labeled label="境界: col-resize">
        <div className="flex h-9 items-center">
          <div className="h-full w-1.5 cursor-col-resize rounded bg-[var(--sp-line-warm)] hover:bg-[var(--sp-accent-teal)]" />
        </div>
      </Labeled>
    </DemoRow>
  );
}

/** ダウンロード表現の2形態（mdl-0020）: ファイル名リンク（hover 下線）と Download アイコンボタン。 */
export function HoverDownloadDemo() {
  return (
    <DemoRow>
      <Labeled label="個別ファイル: ファイル名リンク（hover で下線）">
        <button
          type="button"
          className="cursor-pointer text-sm text-[var(--sp-text-warm)] hover:underline"
        >
          設計書_v2.pdf
        </button>
      </Labeled>
      <Labeled label="一括/エクスポート: Download アイコンボタン">
        <button
          type="button"
          className="flex items-center gap-1 rounded-md border border-[var(--sp-line-warm)] px-3 py-1.5 text-sm text-[var(--sp-text-warm)] hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)]"
        >
          <Download className="h-3.5 w-3.5" />
          ダウンロード
        </button>
      </Labeled>
    </DemoRow>
  );
}

/** アクティブ表現のライブ見本（mdl-0023 / mdl-0055 改訂）: 入力フォーカス=枠線同太さ 1px teal・シャドウ無し / 選択明細行=teal 内枠線 1px（.sp-row-ring）。 */
export function FocusActiveDemo() {
  // mdl-0055: 選択行は板ピルでなく teal 内枠線 1px（拡大表現は廃止）。hover は帯スライド（実装と同じ hook）。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('.sp-row-pillable');
  return (
    <DemoRow>
      <Labeled label="入力: focus で枠線 1px が --sp-focus-border（teal）へ・シャドウ無し">
        <input
          type="text"
          placeholder="クリックしてフォーカス"
          className="h-8 w-52 rounded-md border border-[var(--sp-line-warm)] bg-[hsl(var(--input-bg))] px-2 text-sm text-[var(--sp-text-warm)] outline-none focus:border-[var(--sp-focus-border)]"
        />
      </Labeled>
      <Labeled label="キーワード検索: 同規約（背景は白のまま）">
        <input
          type="search"
          placeholder="キーワード検索"
          className="h-8 w-44 rounded-md border border-[var(--sp-line-warm)] bg-[var(--sp-card)] px-2 text-sm text-[var(--sp-text-warm)] outline-none focus:border-[var(--sp-focus-border)]"
        />
      </Labeled>
      <Labeled label="選択明細行: teal 内枠線 1px（.sp-row-ring・行の高さ/文字サイズは変えない・静的）">
        <div
          ref={listRef}
          onMouseOver={onMouseOver}
          onMouseLeave={onMouseLeave}
          className="relative w-56 rounded-md border border-[var(--sp-line-warm-2)] text-sm text-[var(--sp-text-warm)]"
        >
          <div className="sp-row-pillable relative cursor-pointer border-b border-[var(--sp-line-warm-2)] px-3 py-1.5">
            <span className="sp-row-title">要件定義レビュー</span>
          </div>
          <div className="sp-row-pillable sp-row-ring relative cursor-pointer border-b border-[var(--sp-line-warm-2)] px-3 py-1.5">
            <span className="sp-row-title">結合テスト実施（選択中）</span>
          </div>
          <div className="sp-row-pillable relative cursor-pointer px-3 py-1.5">
            <span className="sp-row-title">リリース判定会</span>
          </div>
          {bandStyle ? <div aria-hidden className="sp-row-hoverband" style={bandStyle} /> : null}
        </div>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: 入力フォーカスは枠色変化のみ（1px・シャドウ無し）。 */
export function FocusUsageGoodDemo() {
  return (
    <Labeled label="outline-none + focus:border-[var(--sp-focus-border)]（枠色だけ変える）">
      <input
        type="text"
        placeholder="クリックしてフォーカス"
        className="h-8 w-52 rounded-md border border-[var(--sp-line-warm)] bg-[hsl(var(--input-bg))] px-2 text-sm text-[var(--sp-text-warm)] outline-none focus:border-[var(--sp-focus-border)]"
      />
    </Labeled>
  );
}

/**
 * だめな例: にじみシャドウ + ピンク ring。
 * 規約違反の展示のため意図的に旧方式（ring-ring / rgba にじみ）で書いている（実装で真似しない）。
 */
export function FocusUsageBadDemo() {
  return (
    <DemoRow>
      <Labeled label="focus:ring-2 focus:ring-ring + offset（shadcn 既定のピンク ring）">
        <input
          type="text"
          placeholder="クリックしてフォーカス"
          className="h-8 w-44 rounded-md border border-[var(--sp-line-warm)] bg-[hsl(var(--input-bg))] px-2 text-sm text-[var(--sp-text-warm)] ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </Labeled>
      <Labeled label="teal 枠 + にじみシャドウ（0 0 0 2px rgba 18%）">
        <input
          type="text"
          placeholder="クリックしてフォーカス"
          className="h-8 w-44 rounded-md border border-[var(--sp-line-warm)] bg-[hsl(var(--input-bg))] px-2 text-sm text-[var(--sp-text-warm)] outline-none focus:border-[var(--sp-focus-border)] focus:[box-shadow:0_0_0_2px_rgba(31,182,162,0.18)]"
        />
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: 明細行=薄グレー帯スライド（useRowHoverBand + .sp-row-hoverband）・無効ボタン=not-allowed + 減光。 */
export function HoverUsageGoodDemo() {
  // mdl-0050: 明細行の hover は行個別の :hover 背景でなく帯スライド（実装と同じ hook）。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('.sp-row-pillable');
  return (
    <DemoRow>
      <Labeled label="明細行 useRowHoverBand + .sp-row-hoverband（単一帯スライド）+ cursor-pointer">
        <div
          ref={listRef}
          onMouseOver={onMouseOver}
          onMouseLeave={onMouseLeave}
          className="relative w-48 rounded-md border border-[var(--sp-line-warm-2)] text-sm text-[var(--sp-text-warm)]"
        >
          {['結合テスト実施', 'リリース判定会'].map((t) => (
            <div
              key={t}
              className="sp-row-pillable cursor-pointer border-b border-[var(--sp-line-warm-2)] px-3 py-1.5 last:border-b-0"
            >
              <span>{t}</span>
            </div>
          ))}
          {bandStyle ? <div aria-hidden className="sp-row-hoverband" style={bandStyle} /> : null}
        </div>
      </Labeled>
      <Labeled label="無効 disabled:cursor-not-allowed disabled:opacity-50">
        <button
          type="button"
          disabled
          className="rounded-md bg-[var(--sp-accent-teal)] px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存
        </button>
      </Labeled>
    </DemoRow>
  );
}

/**
 * だめな例: 行 hover にグレー標準色 + 無効でもカーソルが変わらない。
 * 規約違反の展示のため意図的に gray 系クラスで書いている（実装で真似しない）。
 */
export function HoverUsageBadDemo() {
  return (
    <DemoRow>
      <Labeled label="hover:bg-gray-100（sp トークン圏外のグレー帯）">
        <div className="w-48 cursor-pointer rounded-md border border-[var(--sp-line-warm-2)] px-3 py-1.5 text-sm text-[var(--sp-text-warm)] hover:bg-gray-100">
          結合テスト実施
        </div>
      </Labeled>
      <Labeled label="disabled なのに pointer-events-none だけ（カーソル無反応）">
        <button
          type="button"
          disabled
          className="pointer-events-none rounded-md bg-[var(--sp-accent-teal)] px-3 py-1.5 text-sm text-white opacity-50"
        >
          保存
        </button>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: 共通 highlightMatches を通し .sp-search-hl（薄黄色）で一致箇所を表現する。 */
export function SearchHighlightUsageGoodDemo() {
  return (
    <Labeled label="highlightMatches(text, query) → mark.sp-search-hl">
      <div className="w-56 rounded-md border border-[var(--sp-line-warm-2)] px-3 py-1.5 text-sm text-[var(--sp-text-warm)]">
        {highlightMatches('在庫の確認タスク', '在庫')}
      </div>
    </Labeled>
  );
}

/**
 * だめな例: 画面独自の色・class でハイライトを手組みする。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function SearchHighlightUsageBadDemo() {
  return (
    <Labeled label="独自 span + inline style で手組み（.sp-search-hl を使わない）">
      <div className="w-56 rounded-md border border-[var(--sp-line-warm-2)] px-3 py-1.5 text-sm text-[var(--sp-text-warm)]">
        <span style={{ background: 'orange', fontWeight: 'bold' }}>在庫</span>の確認タスク
      </div>
    </Labeled>
  );
}
