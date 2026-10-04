'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { OverlayCloseButton } from './overlay-dialog';

/**
 * オーバーレイ共通ヘッダ（cmn-0355）。
 * `file-overlay-head` → `file-overlay-head-title` →（任意アイコン）→ `h2` → `OverlayCloseButton` の
 * 固定マークアップ。5 つのオーバーレイ（タグ管理 / タグ選択 / 送信 / アップロード設定 / タグ付け）で
 * 1 文字違わず複製されていたため共通化した（architecture-invariants §3: 2 モジュール目相当の複製を
 * 3 モジュール目追加前に共通化）。
 *
 * 適用外（構造が違うため・cmn-0355 裁定）:
 * - file-picker-overlay: ヘッダ内が見出しでなくタブ列（role=tablist）
 * - file-edit-overlay: h2 に条件付きクラス（file-edit-head-syncing）と 2 span 構造
 * - favorites-manage-overlay: file-overlay-* を使わない別意匠
 *
 * OverlayCloseButton は OverlayDialog の context（requestClose）に依存するため、
 * 必ず OverlayDialog の children 内で使うこと。
 */
export function OverlayHeader({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <div className="file-overlay-head">
      <div className="file-overlay-head-title">
        {icon && <span className="file-overlay-icon">{icon}</span>}
        <h2>{title}</h2>
      </div>
      <OverlayCloseButton className="file-overlay-close" aria-label="閉じる">
        <X className="h-4 w-4" aria-hidden="true" />
      </OverlayCloseButton>
    </div>
  );
}
