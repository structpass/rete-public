'use client';

import { Plus, Settings } from 'lucide-react';

interface DeskTaskToolbarProps {
  /** 新規登録ボタン押下時のハンドラ（タスク新規登録モードを開く / C-新規）。 */
  onCreate: () => void;
  /** 分類設定ボタン押下時のハンドラ（分類マスタ設定モーダルを開く / rete-desk-0140）。 */
  onOpenCategorySettings: () => void;
}

/**
 * タスク明細の新規登録ツールバー（モック desk/index.html .desk-task-tree-toolbar 移植）。
 * 検索/フィルタトールバー直下・右寄せに「分類設定」「新規登録」ボタンを置く。新規登録は onCreate
 * （タスク新規登録モード / data-left-view="detail" is-creating の TaskCreateOverlay）、
 * 分類設定は onOpenCategorySettings（CategorySettingsDialog・新規登録の左隣 / rete-desk-0140）。
 */
export function DeskTaskToolbar({ onCreate, onOpenCategorySettings }: DeskTaskToolbarProps) {
  return (
    <div className="desk-task-tree-toolbar">
      <button
        type="button"
        className="desk-task-new-btn"
        title="分類設定"
        aria-label="分類設定"
        onClick={onOpenCategorySettings}
      >
        <Settings className="desk-task-new-btn-icon h-3.5 w-3.5" aria-hidden="true" />
        <span>分類設定</span>
      </button>
      <button
        type="button"
        className="desk-task-new-btn"
        title="新規登録"
        aria-label="新規登録"
        onClick={onCreate}
      >
        <Plus className="desk-task-new-btn-icon h-3.5 w-3.5" aria-hidden="true" />
        <span>新規登録</span>
      </button>
    </div>
  );
}
