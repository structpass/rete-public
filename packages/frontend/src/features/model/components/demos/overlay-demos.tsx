'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { OverlayDialog } from '@/components/ui/overlay-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Labeled } from './shared';

/**
 * comp-alert-dialog / comp-overlay-dialog テーマの実描画見本（mdl-0006 Batch C）。
 * 両者は portal で body 直下（z-[10050]）に出るため、ページ内見本は
 * 「静的合成（面クラスを複製 + 実サブコンポーネント再利用）」と「実トリガー起動」の2本立てにする。
 */

/**
 * AlertDialogContent の面クラスを複製した非 portal コンテナ（静的合成用）。
 * クラスは alert-dialog.tsx AlertDialogContent と同期させる
 * （grid w-full max-w-lg gap-4 border bg-white p-6 shadow-lg sm:rounded-lg）。
 */
function StaticAlertPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full max-w-lg gap-4 border bg-white p-6 shadow-lg sm:rounded-lg">
      {children}
    </div>
  );
}

/** AlertDialog の基本構成（Header/Title/Description/Footer/Cancel/Action の静的合成）。 */
export function AlertDialogAnatomyDemo() {
  return (
    // Cancel が context を要求するため provider で包む（portal は使わない静的合成）。
    <AlertDialog open={false} onOpenChange={() => {}}>
      <StaticAlertPanel>
        <AlertDialogHeader>
          <AlertDialogTitle>変更を破棄しますか？</AlertDialogTitle>
          <AlertDialogDescription>編集中の内容は失われます。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction variant="destructive">OK</AlertDialogAction>
        </AlertDialogFooter>
      </StaticAlertPanel>
    </AlertDialog>
  );
}

/** 実物の AlertDialog を起動する見本（Esc / ←→ / Tab / フォーカス復帰をそのまま試せる）。 */
export function AlertDialogLiveDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={() => setOpen(true)}>
        削除確認を開いてみる（実物・最前面に出ます）
      </Button>
      <p className="text-xs text-[var(--sp-text-warm-mute)]">
        Esc で閉じる / ←→・Tab でボタン巡回 / 閉じると元のフォーカス位置へ戻る。
      </p>
      <ConfirmDialog
        open={open}
        message="チケット「API設計」を削除しますか？削除すると元に戻せません。"
        destructive
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

/** 正しい例: 破壊操作は destructive + キャンセル初期フォーカス + 具体的な喪失文言。 */
export function AlertDialogUsageGoodDemo() {
  return (
    <Labeled label="破壊=destructive（赤）・キャンセル=outline が左・何が失われるかを Description に書く">
      <AlertDialog open={false} onOpenChange={() => {}}>
        <StaticAlertPanel>
          <AlertDialogHeader>
            <AlertDialogTitle>コメントを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              削除したコメントと添付ファイルは復元できません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction variant="destructive">OK</AlertDialogAction>
          </AlertDialogFooter>
        </StaticAlertPanel>
      </AlertDialog>
    </Labeled>
  );
}

/**
 * だめな例: 確認モーダルの手組み（破壊操作が主要色・文言曖昧・ボタン順が逆・独自影）。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function AlertDialogUsageBadDemo() {
  return (
    <Labeled label="破壊操作なのに主要色の OK・何が消えるか不明・実行が左（順序も逆）">
      <div
        style={{
          maxWidth: '28rem',
          background: '#ffffff',
          border: '1px solid #999',
          padding: '1.5rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>削除しますか？</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            style={{
              background: '#1fae9c',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
            }}
          >
            OK
          </button>
          <button
            type="button"
            style={{
              background: '#f5f5f5',
              border: '1px solid #ccc',
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
            }}
          >
            やめる
          </button>
        </div>
      </div>
    </Labeled>
  );
}

/** 背景画面のダミー行（オーバーレイ静的合成の下地）。 */
function FakeBackground() {
  return (
    <div className="space-y-2 p-4 text-sm text-[var(--sp-text-warm-2)]">
      <p>背景の画面（表示中は inert + aria-hidden で操作不可になる領域）</p>
      {/* 装飾背景は --sp-paper。--sp-row-stripe は明細縞専用（ユーザーが OFF/変色できる）ため流用しない（mdl-0022） */}
      <div className="h-2 w-3/4 rounded bg-[var(--sp-paper)]" />
      <div className="h-2 w-2/3 rounded bg-[var(--sp-paper)]" />
      <div className="h-2 w-4/5 rounded bg-[var(--sp-paper)]" />
    </div>
  );
}

/** OverlayDialog の構成（backdrop + センタリングパネルの静的合成。実物は portal 最前面）。 */
export function OverlayDialogAnatomyDemo() {
  return (
    <div className="relative h-56 overflow-hidden rounded-md border border-[var(--sp-line-warm-2)]">
      <FakeBackground />
      {/* backdrop は実物と同クラス（--sp-overlay-scrim + blur の薄いグレーの曇りガラス） */}
      <div className="absolute inset-0 bg-[var(--sp-overlay-scrim)] backdrop-blur-sm" />
      {/* パネルは位置決めのみ。カード面（枠・影・余白）は children 側が持つ */}
      <div className="absolute left-1/2 top-1/2 w-64 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[var(--sp-line-warm)] bg-white p-4 shadow-lg">
        <div className="text-sm font-semibold text-[var(--sp-text-warm)]">メンバーを招待</div>
        <p className="mt-1 text-xs text-[var(--sp-text-warm-2)]">
          パネル幅は既定 min(420px, 90vw)。カード面は children 側が持つ。
        </p>
      </div>
    </div>
  );
}

/** 実物の OverlayDialog を起動する見本（focus trap / Esc / 背景クリックをそのまま試せる）。 */
export function OverlayDialogLiveDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={() => setOpen(true)}>
        オーバーレイを開いてみる（実物・最前面に出ます）
      </Button>
      <p className="text-xs text-[var(--sp-text-warm-mute)]">
        Tab は内部巡回（focus trap）/ Esc・背景クリックで閉じる / 閉じると元の位置へ復帰。
      </p>
      <OverlayDialog open={open} onClose={() => setOpen(false)} ariaLabel="実描画見本オーバーレイ">
        <div className="rounded-md border border-[var(--sp-line-warm)] bg-white p-5 shadow-lg">
          <div className="text-sm font-semibold text-[var(--sp-text-warm)]">
            実描画見本オーバーレイ
          </div>
          <p className="mt-1 text-xs text-[var(--sp-text-warm-2)]">
            開いている間、背景は inert で操作できない。
          </p>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)}>
              閉じる
            </Button>
          </div>
        </div>
      </OverlayDialog>
    </div>
  );
}

/** 正しい例: 重ね表示は OverlayDialog 1枚・カード面は children 側。 */
export function OverlayDialogUsageGoodDemo() {
  return (
    <Labeled label="オーバーレイは常に1枚。a11y（trap / inert / 復帰）は primitive に任せる">
      <div className="relative h-48 overflow-hidden rounded-md border border-[var(--sp-line-warm-2)]">
        <FakeBackground />
        <div className="absolute inset-0 bg-[var(--sp-overlay-scrim)] backdrop-blur-sm" />
        <div className="absolute left-1/2 top-1/2 w-64 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[var(--sp-line-warm)] bg-white p-4 shadow-lg">
          <div className="text-sm font-semibold text-[var(--sp-text-warm)]">CSV 出力</div>
          <p className="mt-1 text-xs text-[var(--sp-text-warm-2)]">
            詳細→編集の切替も同じ 1 枚の中で入れ替える。
          </p>
        </div>
      </div>
    </Labeled>
  );
}

/**
 * だめな例: 二重オーバーレイ（オーバーレイの上にもう一枚）+ 黒塗り backdrop。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function OverlayDialogUsageBadDemo() {
  return (
    <Labeled label="オーバーレイの上にさらに一枚（二重オーバーレイ禁止）・backdrop も黒塗りで意匠が割れる">
      <div className="relative h-56 overflow-hidden rounded-md border border-[var(--sp-line-warm-2)]">
        <FakeBackground />
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
        <div
          className="absolute left-[38%] top-[45%] w-56 -translate-x-1/2 -translate-y-1/2"
          style={{ background: '#fff', border: '1px solid #999', padding: '1rem' }}
        >
          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>タスク詳細</div>
        </div>
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
        <div
          className="absolute left-[60%] top-[55%] w-56 -translate-x-1/2 -translate-y-1/2"
          style={{ background: '#fff', border: '1px solid #999', padding: '1rem' }}
        >
          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>編集フォーム（2枚目）</div>
        </div>
      </div>
    </Labeled>
  );
}
