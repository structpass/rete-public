'use client';

import { useCallback, useState } from 'react';
import type { FileEditTarget, FileItem, ShareTarget } from '../lib/types';

export type FileOverlay = 'send' | 'settings' | 'tags' | 'tagAssign' | 'edit' | null;

export interface UseFileOverlaysResult {
  overlay: FileOverlay;
  /** 共有オーバーレイの宛先（チャット / タスク）。overlay==='send' の時のみ意味を持つ。 */
  shareTarget: ShareTarget;
  /**
   * タグ付けオーバーレイの対象（ファイル/フォルダ・複数 / rete-files-0033/0034）。overlay==='tagAssign' の時のみ意味を持つ。
   * 1 件＝置換（REPLACE）/ 複数＝追加（ADD）でオーバーレイ側が挙動を出し分ける。
   */
  assignTargets: FileItem[];
  /** 編集オーバーレイの対象ファイル（FF）。overlay==='edit' の時のみ意味を持つ。 */
  editTarget: FileEditTarget | null;
  openSend: (target: ShareTarget) => void;
  openSettings: () => void;
  /** タグマスタ管理オーバーレイを開く。 */
  openTagMaster: () => void;
  /** 指定の対象（ファイル/フォルダ・複数可）のタグ付けオーバーレイを開く。 */
  openTagAssign: (targets: FileItem[]) => void;
  /** 指定ファイルの編集オーバーレイ（DL→編集→再アップ）を開く（FF・お気に入りファイル★ deep link）。 */
  openEdit: (target: FileEditTarget) => void;
  close: () => void;
}

/**
 * 共有 / 設定 / タグ系オーバーレイの排他表示（同時に 1 枚まで・二重オーバーレイ禁止）。
 * ESC で閉じる（モック keydown 移植）。
 */
export function useFileOverlays(): UseFileOverlaysResult {
  const [overlay, setOverlay] = useState<FileOverlay>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget>('chat');
  const [assignTargets, setAssignTargets] = useState<FileItem[]>([]);
  const [editTarget, setEditTarget] = useState<FileEditTarget | null>(null);

  const openSend = useCallback((target: ShareTarget) => {
    setShareTarget(target);
    setOverlay('send');
  }, []);
  const openSettings = useCallback(() => setOverlay('settings'), []);
  const openTagMaster = useCallback(() => setOverlay('tags'), []);
  const openTagAssign = useCallback((targets: FileItem[]) => {
    if (targets.length === 0) return;
    setAssignTargets(targets);
    setOverlay('tagAssign');
  }, []);
  const openEdit = useCallback((target: FileEditTarget) => {
    setEditTarget(target);
    setOverlay('edit');
  }, []);
  const close = useCallback(() => setOverlay(null), []);

  // Esc 閉じは各オーバーレイ（files 配下は全て共通 primitive の OverlayDialog）が自前で担う。ここでの window keydown
  // 直閉じは dirty 破棄確認（mdl-0034 規約②）を素通りして状態ごと破棄してしまうため撤去した。

  return {
    overlay,
    shareTarget,
    assignTargets,
    editTarget,
    openSend,
    openSettings,
    openTagMaster,
    openTagAssign,
    openEdit,
    close,
  };
}
