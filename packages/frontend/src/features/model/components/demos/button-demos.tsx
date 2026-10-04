'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Labeled, DemoRow } from './shared';

/**
 * comp-button / button-color テーマの実描画見本（mdl-0011）。
 * 実物の Button を描画するため、button.tsx の改修に見本が自動追随する。
 */

/** variant 一覧（塗り種別 → 色のマッピングを実物で示す）。 */
export function ButtonVariantsDemo() {
  return (
    <DemoRow>
      <Labeled label="default / sp-primary（主要・塗り）">
        <Button>送信</Button>
      </Labeled>
      <Labeled label="sp-action（副次・背景なし）">
        <Button variant="sp-action">新規登録</Button>
      </Labeled>
      <Labeled label="destructive（削除・破棄）">
        <Button variant="destructive">削除</Button>
      </Labeled>
      <Labeled label="outline">
        <Button variant="outline">キャンセル</Button>
      </Labeled>
      <Labeled label="secondary">
        <Button variant="secondary">閉じる</Button>
      </Labeled>
      <Labeled label="ghost">
        <Button variant="ghost">戻る</Button>
      </Labeled>
      <Labeled label="link">
        <Button variant="link">詳細へ</Button>
      </Labeled>
    </DemoRow>
  );
}

/** size 一覧。 */
export function ButtonSizesDemo() {
  return (
    <DemoRow>
      <Labeled label="lg（h-11）">
        <Button size="lg">大</Button>
      </Labeled>
      <Labeled label="default（h-10）">
        <Button>標準</Button>
      </Labeled>
      <Labeled label="sm（h-9）">
        <Button size="sm">小</Button>
      </Labeled>
      <Labeled label="sp-compact（h-8・高密度行）">
        <Button size="sp-compact">高密度</Button>
      </Labeled>
      <Labeled label="icon（h-10 w-10）">
        <Button size="icon" aria-label="追加">
          <Plus className="h-4 w-4" />
        </Button>
      </Labeled>
      <Labeled label="icon-sm（h-7 w-7）">
        <Button size="icon-sm" variant="sp-action" aria-label="追加">
          <Plus className="h-4 w-4" />
        </Button>
      </Labeled>
    </DemoRow>
  );
}

/** loading / disabled の状態表現（loading は Spinner + 自動 disabled）。 */
export function ButtonStatesDemo() {
  return (
    <DemoRow>
      <Labeled label="loading=true（Spinner + 自動不活性）">
        <Button loading>送信</Button>
      </Labeled>
      <Labeled label="disabled（opacity-50）">
        <Button disabled>送信</Button>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: 主要=塗り / 副次=背景なし / 削除=destructive を variant で選ぶだけ。 */
export function ButtonUsageGoodDemo() {
  return (
    <DemoRow>
      <Labeled label="主要 → default">
        <Button>送信</Button>
      </Labeled>
      <Labeled label="副次 → sp-action">
        <Button variant="sp-action">新規登録</Button>
      </Labeled>
      <Labeled label="削除 → destructive">
        <Button variant="destructive">削除</Button>
      </Labeled>
    </DemoRow>
  );
}

/**
 * だめな例: hex 直書き・個別 class での見た目作り込み。
 * ここは規約違反を見せる展示のため、意図的に inline style で hex を直書きしている（実装で真似しない）。
 */
export function ButtonUsageBadDemo() {
  return (
    <DemoRow>
      <Labeled label="bg-[#...] の hex 直書き">
        <button
          type="button"
          style={{
            background: '#1fb6a2',
            color: '#fff',
            height: '2.5rem',
            padding: '0 1rem',
            borderRadius: '0.1875rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          送信
        </button>
      </Labeled>
      <Labeled label="画面ごとの個別作り込み（角丸・影が別物）">
        <button
          type="button"
          style={{
            background: '#4a6cf7',
            color: '#fff',
            height: '2.25rem',
            padding: '0 1.25rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        >
          保存
        </button>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例（ボタン色規約）: 塗り主要=緑 / 背景なし副次=ink。基準= Desk 送信・新規登録。 */
export function ButtonColorGoodDemo() {
  return (
    <DemoRow>
      <Labeled label="塗りの主要 → 緑 var(--sp-accent-teal)">
        <Button>送信</Button>
      </Labeled>
      <Labeled label="背景なしの副次 → ink 文字（hover で --sp-accent-soft）">
        <Button variant="sp-action">新規登録</Button>
      </Labeled>
      <Labeled label="destructive → 赤（不変）">
        <Button variant="destructive">破棄</Button>
      </Labeled>
    </DemoRow>
  );
}

/**
 * だめな例（ボタン色規約）: feature ごとに色を選ぶ・hex 直書き。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function ButtonColorBadDemo() {
  return (
    <DemoRow>
      <Labeled label="「設定画面だから青」と feature で色を選ぶ">
        <button
          type="button"
          style={{
            background: '#2f5ed8',
            color: '#fff',
            height: '2.5rem',
            padding: '0 1rem',
            borderRadius: '0.1875rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          保存
        </button>
      </Labeled>
      <Labeled label="#1fb6a2 を hex 直書き（トークン不参照）">
        <button
          type="button"
          style={{
            background: '#1fb6a2',
            color: '#fff',
            height: '2.5rem',
            padding: '0 1rem',
            borderRadius: '0.1875rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          保存
        </button>
      </Labeled>
    </DemoRow>
  );
}
