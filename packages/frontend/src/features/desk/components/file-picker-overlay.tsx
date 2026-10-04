'use client';

import { useMemo, useState } from 'react';
import { DndContext } from '@dnd-kit/core';
import { X } from 'lucide-react';
import { OverlayDialog } from '@/components/ui/overlay-dialog';
import { Spinner } from '@/components/ui/spinner';
import { useFileBrowser } from '@/features/files/hooks/use-file-browser';
import { useFileSort } from '@/features/files/hooks/use-file-sort';
import { buildFileRows } from '@/features/files/lib/rows';
import { FileTopbar } from '@/features/files/components/file-topbar';
import { FilesTree } from '@/features/files/components/files-tree';
import { FileList } from '@/features/files/components/file-list';
import type { FileItem } from '@/features/files/lib/types';
import type { AttachmentSource } from '../hooks/use-pending-attachments';
import { FilePickerLocal } from './file-picker-local';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { DEFAULT_CHANNEL_ID } from '@rete/shared';
import { useDeskSpace } from '../hooks/desk-space-context';

type PickerTab = 'local' | 'repo';

/** ピッカーモードでは選択チェックを使わないため、FileList へ渡す no-op 選択スタブ。 */
const NO_SELECTION = { has: () => false, toggle: () => {} };
const EMPTY_FILE_ITEMS: FileItem[] = [];

/**
 * ファイルピッカー（FL-3 添付）。Files ページと**同一デザイン**のツリー＋一覧 UI（[ファイル] タブ）と、
 * ローカル PC から取り込んで添付する [ローカル] タブの 2 タブ構成（rete-desk-0077 / 0078）。
 *
 * [ファイル] タブは files の実コンポーネント（FileTopbar / FilesTree / FileList）を picker モードで再利用し、
 * 独自簡易 UI を持たない（デザイン二重化の解消・単一ソース）。操作系（アップロード/削除/共有ボタン・選択
 * チェック・D&D）は出さず、行クリック 1 回でファイル添付・フォルダ遷移する。D&D フックの文脈確保のため
 * 一覧域は無効の DndContext で包む。
 *
 * 添付対象は「ファイル」のみ（フォルダは潜るだけ）。タブ間でフォルダナビ状態（useFileBrowser）を共有し、
 * [ローカル] タブの取り込み先は [ファイル] タブで選択中のフォルダになる。
 *
 * focus trap・ESC・背景 inert 隔離は共通部品 OverlayDialog に委譲する（fil-0059/fil-0064）。
 */
export function FilePickerOverlay({
  onPick,
  onClose,
  busy = false,
  isDuplicateName,
}: {
  /**
   * ファイル選択時（添付実行）。busy 中の二重発火は呼び出し側ガードに委ねる。
   * source は出所（rete-desk-0108）: [ファイル] タブ選択=`repo`（リンク）/ [ローカル] タブ取り込み=`local`。
   */
  onPick: (fileId: string, fileName: string, source: AttachmentSource) => void;
  onClose: () => void;
  /** 添付処理中（true でファイル選択・閉じるを抑止）。 */
  busy?: boolean;
  /** [ローカル] タブの事前重複チェック（dsk-0290）。[ファイル] タブの同名チェックには関与しない。 */
  isDuplicateName?: (fileName: string) => boolean;
}) {
  const [tab, setTab] = useState<PickerTab>('repo');
  const {
    listRef: pickerTabsRef,
    onMouseOver: onPickerTabMouseOver,
    onMouseLeave: onPickerTabMouseLeave,
    bandStyle: pickerTabHoverBandStyle,
  } = useRowHoverBand<HTMLDivElement>('.file-overlay-tab', 'horizontal');
  // ツリーは器スコープ（ADR 0063・fil-0137）。Desk で開いている channel のリポジトリを出す
  // （DeskSpaceProvider 配下＝チャット/タスクと同じ器。未選択は既定チャネル）。
  const { selectedSpaceId } = useDeskSpace();
  const browser = useFileBrowser(selectedSpaceId ?? DEFAULT_CHANNEL_ID);
  const { sortKey, sortDir, toggleSort } = useFileSort();
  const [search, setSearch] = useState('');

  // busy（添付処理中）は Esc / backdrop クリックいずれでも閉じない（rete-desk-0101 の挙動を維持）。
  const handleClose = () => {
    if (!busy) onClose();
  };

  const items = browser.currentFolder?.items ?? EMPTY_FILE_ITEMS;
  const crumb = browser.currentFolder?.crumb ?? [];
  const rows = useMemo(
    () => buildFileRows(items, sortKey, sortDir, search),
    [items, sortKey, sortDir, search],
  );

  const handlePick = (item: FileItem) => {
    if (busy || !item.id) return;
    // [ファイル] タブ＝既存ファイルへの参照（リンク）として添付する（rete-desk-0108）。
    onPick(item.id, item.name, 'repo');
  };

  return (
    <OverlayDialog open onClose={handleClose} ariaLabel="ファイルを添付" width="min(60rem, 94vw)">
      <div className="file-overlay-panel file-overlay-panel-attach">
        {/* cmn-0355 適用外: ヘッダ内が見出しでなくタブ列（role=tablist）のため OverlayHeader を使わない。 */}
        <div className="file-overlay-head">
          <div
            className="file-overlay-tabs"
            role="tablist"
            aria-label="添付元"
            ref={pickerTabsRef}
            onMouseOver={onPickerTabMouseOver}
            onMouseLeave={onPickerTabMouseLeave}
          >
            {pickerTabHoverBandStyle ? (
              <div
                aria-hidden="true"
                className="file-overlay-tab-hoverband"
                style={pickerTabHoverBandStyle}
              />
            ) : null}
            <button
              type="button"
              role="tab"
              id="picker-tab-local"
              aria-selected={tab === 'local'}
              aria-controls="picker-panel-local"
              className={`file-overlay-tab${tab === 'local' ? ' is-active' : ''}`}
              onClick={() => setTab('local')}
            >
              ローカル
            </button>
            <button
              type="button"
              role="tab"
              id="picker-tab-repo"
              aria-selected={tab === 'repo'}
              aria-controls="picker-panel-repo"
              className={`file-overlay-tab${tab === 'repo' ? ' is-active' : ''}`}
              onClick={() => setTab('repo')}
            >
              ファイル
            </button>
          </div>
          <button
            type="button"
            className="file-overlay-close"
            onClick={handleClose}
            disabled={busy}
            aria-label="閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div
          className="file-overlay-body file-overlay-body-attach"
          role="tabpanel"
          id={`picker-panel-${tab}`}
          aria-labelledby={`picker-tab-${tab}`}
        >
          {tab === 'repo' ? (
            <div className="file-picker-repo">
              <FileTopbar
                crumb={crumb}
                search={search}
                onSearchChange={setSearch}
                onNavigate={browser.selectFolder}
                hideNav
              />
              {/* D&D は使わないが files コンポーネントの useDraggable/useDroppable が文脈を要するため無効化して包む。 */}
              <DndContext>
                <div className="file-layout">
                  <section className="sp-card file-pane-tree">
                    <div className="file-pane-head">
                      <span>リポジトリ</span>
                    </div>
                    {browser.treeError ? (
                      <div className="file-empty">ツリーの読み込みに失敗しました</div>
                    ) : browser.treeLoading ? (
                      <div className="file-empty">
                        <Spinner className="h-4 w-4 inline-block" />
                      </div>
                    ) : (
                      <FilesTree
                        tree={browser.currentTree}
                        currentFolderId={browser.currentFolderId}
                        dndDisabled
                        onSelect={browser.selectFolder}
                      />
                    )}
                  </section>
                  <div className="file-pane-detail">
                    {browser.folderError ? (
                      <section className="sp-card file-list-card">
                        <div className="file-empty">フォルダの読み込みに失敗しました</div>
                      </section>
                    ) : browser.folderLoading && !browser.currentFolder ? (
                      <section className="sp-card file-list-card">
                        <div className="file-empty">
                          <Spinner className="h-4 w-4 inline-block" />
                        </div>
                      </section>
                    ) : !browser.currentFolder ? (
                      <section className="sp-card file-list-card">
                        <div className="file-empty">表示するフォルダがありません</div>
                      </section>
                    ) : (
                      <FileList
                        rows={rows}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onToggleSort={toggleSort}
                        selectedCount={0}
                        selection={NO_SELECTION}
                        dndDisabled
                        onToggleAll={() => {}}
                        pickMode
                        onPick={handlePick}
                        onNavigateFolder={browser.selectFolder}
                      />
                    )}
                  </div>
                </div>
              </DndContext>
            </div>
          ) : (
            <FilePickerLocal
              destFolderId={browser.currentFolderId}
              onPick={(fileId, fileName) => onPick(fileId, fileName, 'local')}
              busy={busy}
              isDuplicateName={isDuplicateName}
            />
          )}
        </div>
      </div>
    </OverlayDialog>
  );
}
