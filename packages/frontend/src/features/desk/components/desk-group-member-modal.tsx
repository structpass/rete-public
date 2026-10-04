'use client';

import { useEffect, useState } from 'react';
import { MembershipScopeType, type SpaceDto } from '@rete/shared';
import type { Account } from '@/features/tasks/lib/api';
import { DeskMembershipScopeModal } from './desk-membership-scope-modal';

interface DeskGroupMemberModalProps {
  open: boolean;
  onClose: () => void;
  group: SpaceDto;
  /** 全アカウント候補（既存メンバーは DeskMembershipScopeModal 内で除外される）。 */
  accounts: Account[];
  /** グループ名の保存（PATCH /spaces/:id）。成功で更新後の SpaceDto を返す。 */
  onRename: (name: string) => Promise<SpaceDto | null>;
  /** アーカイブ開始。確認ダイアログは呼び出し側（desk-sidebar）が出す。 */
  onArchive: () => void;
  /** 改名・アーカイブの送信中（呼び出し側の useUpdateSpace 由来）。 */
  submitting?: boolean;
}

/**
 * グループ設定モーダル（dsk-0364・旧「メンバー設定」から拡張）。
 * サイドバーのグループ行の ✎ から直接開き、グループへの操作（名前を変える / メンバーを追加・削除・
 * 権限変更する / アーカイブする）を 1 画面に集約する。中間の吹き出しメニューは廃止した。
 *
 * メンバー管理は DeskMembershipScopeModal（dsk-0309 で汎用化・PROJECT の参照権限と共用）へ委譲し、
 * グループ固有の「グループ名」「アーカイブ」は headerSlot / footerSlot に差し込む。共用側はスロット
 * 未指定なら何も描かないため、PROJECT（参照権限）の画面構成は変わらない。
 *
 * dialog の aria-label は「${group.name} のグループ設定」（dsk-0306 の「〜のメンバー設定」から改称。
 * 画面の役割が変わったため名前も追従させる）。
 */
export function DeskGroupMemberModal({
  open,
  onClose,
  group,
  accounts,
  onRename,
  onArchive,
  submitting = false,
}: DeskGroupMemberModalProps) {
  const [name, setName] = useState(group.name);

  // 対象グループが差し替わっても同じモーダルが再利用されうるので、入力を持ち越さない。
  useEffect(() => {
    setName(group.name);
  }, [group.id, group.name]);

  const trimmed = name.trim();
  const canSave = trimmed !== '' && trimmed !== group.name && !submitting;

  async function handleRename() {
    if (!canSave) return;
    await onRename(trimmed);
  }

  return (
    <DeskMembershipScopeModal
      open={open}
      onClose={onClose}
      scopeType={MembershipScopeType.GROUP}
      scopeId={group.id}
      scopeLabel="メンバー"
      scopeEntityName={group.name}
      titleText={`${group.name} のグループ設定`}
      ariaLabel={`${group.name} のグループ設定`}
      accounts={accounts}
      canEditRole
      headerSlot={
        <>
          <h3 className="desk-group-manage-subtitle">グループ名</h3>
          <div className="desk-catset-edit">
            <input
              className="desk-catset-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // IME 変換確定の Enter で送信しない（日本語入力の誤送信防止）。
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void handleRename();
              }}
              aria-label="グループ名"
              disabled={submitting}
            />
            <div className="desk-catset-row-actions">
              <button
                type="button"
                className="desk-catset-btn is-primary"
                disabled={!canSave}
                onClick={() => void handleRename()}
              >
                保存
              </button>
            </div>
          </div>
        </>
      }
      footerSlot={
        <>
          <h3 className="desk-group-manage-subtitle">グループをアーカイブ</h3>
          <div className="desk-catset-row-actions">
            <button
              type="button"
              className="desk-catset-btn is-danger"
              disabled={submitting}
              onClick={onArchive}
            >
              アーカイブ
            </button>
          </div>
        </>
      }
    />
  );
}
