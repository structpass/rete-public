'use client';

import type { ReactNode } from 'react';
import { UserCog } from 'lucide-react';
import { FormCard, FormLabel } from './primitives';

/**
 * 管理グループのフォーム外枠（set-0188）。
 * 作成サブ画面と編集サブ画面で共有する。枠・説明文・グループ名入力・「所属ユーザー」見出しまでを持ち、
 * 所属ユーザーの編集部品と確定ボタンは children で受ける（作成は作成時に一括反映、編集は操作ごとに
 * 即時反映と、確定の意味が画面ごとに違うため）。
 */
export function GroupFormCard({
  name,
  onNameChange,
  nameDisabled,
  children,
}: {
  name: string;
  onNameChange: (value: string) => void;
  /** グループ名入力を編集不可にする（保存中など）。 */
  nameDisabled: boolean;
  children: ReactNode;
}) {
  return (
    <FormCard
      icon={<UserCog className="h-4 w-4" aria-hidden="true" />}
      title="グループ"
      description="管理グループはユーザーを束ねるだけの器です。組織・プロジェクト・チャネルへの参加先は所属管理で設定します。"
    >
      <div style={{ marginBottom: '0.875rem' }}>
        <FormLabel htmlFor="group-name">グループ名</FormLabel>
        <input
          id="group-name"
          type="text"
          className="sp-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={80}
          disabled={nameDisabled}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <h4 className="mb-2 text-sm font-medium text-[var(--sp-text-warm)]">所属ユーザー</h4>
      {children}
    </FormCard>
  );
}
