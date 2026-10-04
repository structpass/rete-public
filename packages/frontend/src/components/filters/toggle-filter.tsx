'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { useOutsideClose } from '@/hooks/use-outside-close';

/**
 * フィルタ popover の開閉状態 + outside-click / ESC で閉じる共通ロジック（desk-filter-toolbar.tsx から
 * hom-0080 で共有モジュールへ抽出。§3 コピペ禁止＝Desk のポップオーバー型フィルタをタグ管理でも
 * 再利用するため）。MultiSelectFilter（ステータス/担当者/分類）/ ToggleFilter / DueRangeFilter が
 * desk-filter-toolbar.tsx 側で引き続き共有する。
 *
 * dsk-0358: outside-click / Esc の document 監視を `useOutsideClose` 共通 hook に集約（DeskMemberPicker
 * の floating 版も同じ hook を使う）。これにより Desk 内の浮遊 UI 閉じ挙動を一貫化する。
 */
export function useFilterPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose({ active: open, refs: [ref], onClose: () => setOpen(false) });
  return { open, setOpen, ref };
}

/**
 * トグル型フィルタ（モック .desk-filter-toggle-popup 移植）。2 系統 API：
 *
 * - `flash=false`（既定）: チップ click で popover を開く2段階（chat アーカイブ用／既存挙動）。
 * - `flash=true`: 1クリックで onToggle() を直接呼ぶ。ポップアップ/リストは一切表示しない
 *   （ON/OFF トグルのみのフィルタはチップの is-active 状態＝mdl-0033 右上赤丸ドットで識別）。
 *
 * ポップオーバーは `createPortal` で document.body 直下へ描画（trigger の bounding rect から
 * 座標算出）。`.file-overlay-panel`（overflow:hidden 祖先）に内包される tag-master-overlay
 * 呼び出しでもクリップされない（hom-0080）。
 *
 * dsk-0403 改訂: 旧 `instant` prop を `flash` へ rename。常時表示インラインスイッチ
 *（.desk-filter-icon-switch）と `.has-inline-switch` クラスを撤去（ON 可視化は mdl-0033 共通
 * 仕様の右上赤丸ドットへ復帰）。
 * dsk-0436 改訂: flash=true 時の一過性 flash popup（.is-flash・約 650ms の装飾 popup）を撤去。
 *   ON/OFF トグルのみのフィルタはリストを一切出さず、クリック時の UI 変化（is-active）だけで
 *   状態を識別する（開発統括指示「ON、OFF の切り替えしかないものはリストを出さず、フィルタ項目の
 *   UI 変化で識別できる」）。
 */
export function ToggleFilter({
  Icon,
  label,
  switchLabel,
  active,
  onToggle,
  flash = false,
}: {
  Icon: LucideIcon;
  label: string;
  switchLabel: string;
  active: boolean;
  onToggle: () => void;
  /**
   * true = 1クリックで onToggle() を直接呼ぶ（ポップアップ/リストは表示しない・is-active で識別）。
   * false（既定）= 従来の2段階ポップオーバー（chip click → popover 内 switch で切替）。
   * dsk-0403: 顛末チップ（Desk chat/task）／タグ管理 Archive chip で true。
   * dsk-0436: flash popup（一過性のリスト）は撤去。
   * 旧 `instant` prop（常時表示インラインスイッチ方式）は撤去。
   */
  flash?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // 2-step popover 用 position & outside-click 監視（flash=true 時は open 常に false なので no-op）。
  useLayoutEffect(() => {
    if (!open || flash) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, flash]);
  // dsk-0358: outside-click / Esc の document 監視は useOutsideClose 共通 hook に集約
  // （trigger + popup の 2 ref を含む）。portal 起因で body 直下への click 露出が
  // useFilterPopover より大きいため、dsk-0310 の body/documentElement ガードが hook 内で効く。
  // flash 時は popover 自体を持たないため open は常に false のまま＝無条件で no-op。
  useOutsideClose({ active: open, refs: [triggerRef, popupRef], onClose: () => setOpen(false) });

  return (
    <div
      className={cn('desk-filter-icon', active && 'is-active')}
      data-value={active ? 'on' : 'off'}
      ref={triggerRef}
    >
      <button
        type="button"
        className="desk-filter-icon-btn"
        aria-haspopup={flash ? undefined : 'dialog'}
        aria-expanded={flash ? undefined : open}
        role={flash ? 'switch' : undefined}
        aria-checked={flash ? active : undefined}
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          if (flash) {
            onToggle();
          } else {
            setOpen((v) => !v);
          }
        }}
      >
        <Icon className="desk-filter-icon-svg h-4 w-4" aria-hidden="true" />
        <span className="desk-filter-icon-label">{label}</span>
      </button>
      {!flash &&
        open &&
        createPortal(
          <div
            ref={popupRef}
            className="desk-filter-toggle-popup"
            data-value={active ? 'on' : 'off'}
            role="dialog"
            aria-label={label}
            // dsk-0403: portal の position:fixed は CSS 由来だが、tag-master overlay panel
            //（animation 由来の transform で stacking context を作る）の内側に居ると
            // 「CSS position:fixed + portal document.body」の組み合わせでも containing block
            // が panel に固定され hidden で隠れる事例を実機で確認。style で明示的に
            // position: fixed と高 z-index を与え、ancestor の transform/contain を
            // 確実に回避する（chat 側は元から問題なし・防御策）。
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10100 }}
          >
            <span className="desk-filter-toggle-label">{switchLabel}</span>
            <button
              type="button"
              className="desk-filter-toggle-switch"
              role="switch"
              aria-checked={active}
              aria-label={switchLabel}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
