'use client';

/**
 * Files タグ付与オーバーレイ（rete-files-0006/0033/0034 / fil-0048）。
 * 対象数で挙動を出し分ける:
 * - **1 件（ファイル/フォルダ）= 置換（REPLACE）**: 現在の付与集合を初期選択にし、保存時に集合全体を送る
 *   （backend の setFileTags / setFolderTags と一致）。共通 TagPickerOverlay を使う。
 * - **複数（ファイル/フォルダ混在）= 3状態 add/remove（fil-0048）**: 各タグを ON=全対象付与済 /
 *   OFF=全対象未付与 / 混在=一部付与 の 3 状態で表示。クリックで off→on→off / mixed→on→off をトグル。
 *   保存時 ON 化したタグを addTagIds、OFF 化したタグを removeTagIds として 1 リクエストで送る
 *   （1 トランザクション）。混在のまま触らなかったタグは各対象の現状を維持（巻き込み変更しない）。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Minus, Tags } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/error-utils';
import { OverlayCloseButton, OverlayDialog } from '@/components/ui/overlay-dialog';
import { OverlayHeader } from '@/components/ui/overlay-header';
import { Spinner } from '@/components/ui/spinner';
import { TagIcon } from '@/components/tags/tag-icon';
import { TagPickerOverlay } from '@/components/tags/tag-picker-overlay';
import { assignTagsBatch, setFileTags, setFolderTags } from '../lib/api';
import type { FileItem } from '../lib/types';
import type { UseTagMasterResult } from '../hooks/use-tag-master';

/** チェック状態（3状態）: on=全対象付与済 / off=全対象未付与 / mixed=一部付与 */
type CheckState = 'on' | 'off' | 'mixed';

export function TagAssignOverlay({
  targets,
  master,
  onClose,
  onApplied,
}: {
  /** 付与対象（ファイル/フォルダ・複数可）。1 件＝置換 / 複数＝3状態 add/remove。 */
  targets: FileItem[];
  master: UseTagMasterResult;
  onClose: () => void;
  onApplied: () => void;
}) {
  const single = targets.length === 1;

  if (single) {
    return (
      <SingleTagAssignOverlay
        target={targets[0]}
        master={master}
        onClose={onClose}
        onApplied={onApplied}
      />
    );
  }

  return (
    <MultiTagAssignOverlay
      targets={targets}
      master={master}
      onClose={onClose}
      onApplied={onApplied}
    />
  );
}

/** 1 件選択 = 置換モード（TagPickerOverlay へ委譲・既存挙動を維持）。 */
function SingleTagAssignOverlay({
  target,
  master,
  onClose,
  onApplied,
}: {
  target: FileItem;
  master: UseTagMasterResult;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const initialSelected = (target.tags ?? []).map((t) => t.id);

  const handleConfirm = async (tagIds: string[]) => {
    if (saving) return;
    setSaving(true);
    try {
      if (!target.id) throw new Error('対象 ID が不明です');
      if (target.kind === 'folder') await setFolderTags(target.id, tagIds);
      else await setFileTags(target.id, tagIds);
      toast.success('タグを更新しました');
      onApplied();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, 'タグの更新に失敗しました'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TagPickerOverlay
      tags={master.tags}
      initialSelected={initialSelected}
      loading={master.loading}
      error={Boolean(master.error)}
      saveLabel="保存"
      onConfirm={(ids) => void handleConfirm(ids)}
      onClose={onClose}
    />
  );
}

/**
 * 複数選択 = 3状態 add/remove モード（fil-0048）。
 * 各タグの初期状態を targets の現在付与から算出し、クリックで on/off をトグルする
 * （mixed→on、on→off、off→on）。保存時に add/remove の差分を 1 リクエストで送る。
 */
function MultiTagAssignOverlay({
  targets,
  master,
  onClose,
  onApplied,
}: {
  targets: FileItem[];
  master: UseTagMasterResult;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const fileCount = targets.filter((t) => t.kind === 'file').length;
  const folderCount = targets.length - fileCount;

  // 各タグの初期3状態を targets の現在付与から算出する。算出結果を useRef で保持し差分計算に使う。
  const initialStates = useMemo<Map<string, CheckState>>(() => {
    const map = new Map<string, CheckState>();
    for (const tag of master.tags) {
      const attached = targets.filter((t) => t.tags?.some((tt) => tt.id === tag.id)).length;
      if (attached === 0) map.set(tag.id, 'off');
      else if (attached === targets.length) map.set(tag.id, 'on');
      else map.set(tag.id, 'mixed');
    }
    return map;
  }, [master.tags, targets]);

  const [states, setStates] = useState<Map<string, CheckState>>(initialStates);

  // master.tags ロード前（空）にオーバーレイが開かれると states は空 Map のまま固定され、
  // 付与済みタグが未付与に見える（HIGH）。master が届いた最初の一度だけ初期3状態へ同期する。
  // syncedRef でガードするため、以降のユーザートグル操作は targets 参照変化で巻き戻らない。
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || master.tags.length === 0) return;
    syncedRef.current = true;
    setStates(initialStates);
  }, [master.tags, initialStates]);

  // トグル操作で初期3状態から変わったタグがある間だけ破棄確認を挟む（mdl-0034 規約②）。
  const dirty = Array.from(states).some(
    ([id, state]) => (initialStates.get(id) ?? 'off') !== state,
  );

  const toggle = (id: string) => {
    setStates((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? 'off';
      // off→on、on→off、mixed→on（混在クリックで全 ON、再クリックで全 OFF）
      next.set(id, current === 'on' ? 'off' : 'on');
      return next;
    });
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const addTagIds: string[] = [];
      const removeTagIds: string[] = [];
      for (const [id, current] of states) {
        const initial = initialStates.get(id) ?? 'off';
        // on に変わった（off/mixed→on）: 追加対象
        if (current === 'on' && initial !== 'on') addTagIds.push(id);
        // off に変わった（on/mixed→off）: 解除対象
        if (current === 'off' && initial !== 'off') removeTagIds.push(id);
        // mixed のまま触らなかった → 各対象の現状を維持（送らない）
      }
      if (addTagIds.length === 0 && removeTagIds.length === 0) {
        // 変更なし = キャンセルと同義
        onClose();
        return;
      }
      const fileIds = targets.filter((t) => t.kind === 'file' && t.id).map((t) => t.id as string);
      const folderIds = targets
        .filter((t) => t.kind === 'folder' && t.id)
        .map((t) => t.id as string);
      const res = await assignTagsBatch({ fileIds, folderIds, addTagIds, removeTagIds });
      toast.success(`${res.fileCount + res.folderCount} 件のタグ設定を更新しました`);
      onApplied();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, 'タグの更新に失敗しました'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OverlayDialog
      open
      onClose={onClose}
      ariaLabel="タグ付け"
      width="min(540px, 92vw)"
      dirty={dirty}
    >
      <div className="file-overlay-panel max-h-[calc(100vh-4rem)]">
        <OverlayHeader icon={<Tags className="h-4 w-4" aria-hidden="true" />} title="タグ付け" />
        <div className="file-overlay-body">
          <p className="tag-assign-target">
            <span className="tag-assign-target-label">
              対象（ON=全付与・OFF=全解除・混在=現状維持）
            </span>
            <span className="tag-assign-target-name">
              {targets.length} 件{fileCount > 0 && ` ・ファイル ${fileCount}`}
              {folderCount > 0 && ` ・フォルダ ${folderCount}`}
            </span>
          </p>
          {master.error ? (
            <div className="file-empty">タグの読み込みに失敗しました</div>
          ) : master.loading ? (
            <div className="file-empty">
              <Spinner className="h-4 w-4 inline-block" />
            </div>
          ) : master.tags.length === 0 ? (
            <div className="file-empty">
              タグがまだありません。「タグ管理」から先にタグを作成してください。
            </div>
          ) : (
            <table className="desk-catset-table tag-master-table tag-picker-table">
              <thead>
                <tr>
                  <th className="tag-master-th">タグ名</th>
                </tr>
              </thead>
              <tbody>
                {master.tags.map((t) => {
                  const state = states.get(t.id) ?? 'off';
                  return (
                    <tr key={t.id}>
                      <td className="tag-master-td">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={state === 'on' ? true : state === 'mixed' ? 'mixed' : false}
                          className={cn(
                            'tag-picker-item',
                            state === 'on' && 'is-on',
                            state === 'mixed' && 'is-mixed',
                          )}
                          onClick={() => toggle(t.id)}
                        >
                          <span className="tag-picker-item-main">
                            <TagIcon name={t.icon} size={14} color={t.color} />
                            <span className="tag-picker-item-name">{t.name}</span>
                          </span>
                          <span
                            className={cn(
                              'tag-picker-check',
                              state === 'on' && 'is-on',
                              state === 'mixed' && 'is-mixed',
                            )}
                          >
                            {state === 'on' && <Check className="h-3 w-3" aria-hidden="true" />}
                            {state === 'mixed' && <Minus className="h-3 w-3" aria-hidden="true" />}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="file-overlay-foot tag-picker-foot">
          <OverlayCloseButton className="fo-btn-ghost">キャンセル</OverlayCloseButton>
          <button
            type="button"
            className="fo-btn-primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            保存
          </button>
        </div>
      </div>
    </OverlayDialog>
  );
}
