'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Labeled, DemoRow } from './shared';

/**
 * comp-card / comp-badge / comp-spinner テーマの実描画見本（mdl-0005 Batch B）。
 * 実物コンポーネントを描画するため、components/ui/* の改修に見本が自動追随する。
 */

/** Card の基本構成（Header + Title + Content）。 */
export function CardAnatomyDemo() {
  return (
    <div className="max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>お知らせ</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--sp-text-warm-2)]">
            CardHeader（p-6）に見出し、CardContent（p-6 pt-0）に本文。枠は --sp-line-warm、面は
            bg-card + shadow-sm。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** 正しい例: Card 合成で囲み面を作る。 */
export function CardUsageGoodDemo() {
  return (
    <div className="max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>メンバー</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--sp-text-warm-2)]">枠・余白・角丸が全画面で同じ。</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * だめな例: 囲み面の手組み（枠色 hex・独自影・余白の作り込み）。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function CardUsageBadDemo() {
  return (
    <div
      style={{
        maxWidth: '24rem',
        border: '2px dashed #888',
        borderRadius: '1.25rem',
        padding: '0.75rem 2rem 2.5rem 0.75rem',
        boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
        background: '#fffef5',
      }}
    >
      <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.25rem' }}>メンバー</div>
      <div style={{ fontSize: '0.875rem' }}>枠線・影・余白・面色がこのカードだけ別物になる。</div>
    </div>
  );
}

/** Badge の variant 一覧（status 色は --sp-status-* トークン＝desk のタスク状態と同色）。 */
export function BadgeVariantsDemo() {
  return (
    <DemoRow>
      <Labeled label="todo（青）">
        <Badge variant="todo">未対応</Badge>
      </Labeled>
      <Labeled label="progress（橙）">
        <Badge variant="progress">対応中</Badge>
      </Labeled>
      <Labeled label="review（紫）">
        <Badge variant="review">レビュー</Badge>
      </Labeled>
      <Labeled label="done（緑）">
        <Badge variant="done">完了</Badge>
      </Labeled>
      <Labeled label="default（primary 塗り）">
        <Badge>3</Badge>
      </Labeled>
      <Labeled label="outline（枠線のみ）">
        <Badge variant="outline">タグ</Badge>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: 状態は Badge variant で示す（desk のタスク状態と同色に揃う）。 */
export function BadgeUsageGoodDemo() {
  return (
    <DemoRow>
      <Labeled label="タスク状態 → variant を選ぶだけ">
        <div className="flex items-center gap-2">
          <Badge variant="progress">対応中</Badge>
          <span className="text-sm text-[var(--sp-text-warm)]">API 設計の見直し</span>
        </div>
      </Labeled>
    </DemoRow>
  );
}

/**
 * だめな例: 状態色の hex 直書き・画面独自の状態表現。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function BadgeUsageBadDemo() {
  return (
    <DemoRow>
      <Labeled label="状態色を hex 直書き（desk と別色になる）">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            borderRadius: '9999px',
            padding: '0.125rem 0.625rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: '#ffe0b2',
            color: '#e65100',
          }}
        >
          対応中
        </span>
      </Labeled>
      <Labeled label="画面独自の四角ラベル（形も色も不揃い）">
        <span
          style={{
            display: 'inline-block',
            padding: '0.25rem 0.5rem',
            fontSize: '0.8rem',
            background: '#37474f',
            color: '#fff',
          }}
        >
          進行中
        </span>
      </Labeled>
    </DemoRow>
  );
}

/** Spinner のサイズ・配置（単体 / ボタン内 / ページ内センタリング）。 */
export function SpinnerPlacementDemo() {
  return (
    <DemoRow>
      <Labeled label="単体（サイズは className の h/w で指定）">
        <Spinner className="h-6 w-6 text-[var(--sp-accent-teal)]" />
      </Labeled>
      <Labeled label="ボタン内（loading=true で自動挿入・h-4 w-4）">
        <Button loading>送信</Button>
      </Labeled>
      <Labeled label="ページ/領域内（中央寄せ + 薄めの色）">
        <div className="flex h-20 w-56 items-center justify-center rounded-md border border-[var(--sp-line-warm-2)]">
          <Spinner className="h-8 w-8 text-[var(--sp-text-warm-mute)]" />
        </div>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: loading 表現は共通 Spinner に一本化。 */
export function SpinnerUsageGoodDemo() {
  return (
    <DemoRow>
      <Labeled label="読み込み中は Spinner（色は text-* で文脈に合わせる）">
        <div className="flex items-center gap-2 text-sm text-[var(--sp-text-warm-2)]">
          <Spinner className="h-4 w-4" />
          読み込み中…
        </div>
      </Labeled>
    </DemoRow>
  );
}

/**
 * だめな例: 画面ごとの独自ローダー。
 * 規約違反の展示のため意図的に inline style + CSS アニメの手組みで書いている（実装で真似しない）。
 */
export function SpinnerUsageBadDemo() {
  return (
    <DemoRow>
      <Labeled label="独自ローダーの手組み（形・速度・色が画面ごとに揺れる）">
        <div className="flex items-center gap-2 text-sm">
          <span
            className="animate-pulse"
            style={{
              display: 'inline-block',
              width: '1rem',
              height: '1rem',
              borderRadius: '9999px',
              background: '#7c3aed',
            }}
          />
          Loading...
        </div>
      </Labeled>
      <Labeled label="文字だけの点滅表現">
        <span className="animate-pulse text-sm" style={{ color: '#e91e63' }}>
          ●●● 処理中 ●●●
        </span>
      </Labeled>
    </DemoRow>
  );
}
