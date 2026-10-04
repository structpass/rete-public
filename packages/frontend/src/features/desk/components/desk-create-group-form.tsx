'use client';

import type { SpaceDto } from '@rete/shared';
import { SidebarNameForm } from './desk-sidebar-name-form';

/**
 * グループ追加インラインフォーム（CM-2 rete-desk-0144・グループタブの「＋」で開く）。
 * 名前入力 → 確定で onCreate（useCreateSpace.createGroup）を呼び、成功（SpaceDto 返却）で onClose する。
 * 入力 UI 本体は SidebarNameForm（チャネル作成 / 改名と共有・§3 コピペ回避）へ委譲し、本コンポーネントは
 * グループ用の文言（プレースホルダ「グループ名」/ ボタン「作成」）束ねのみを担う。
 */
export function DeskCreateGroupForm({
  onCreate,
  onClose,
  submitting,
}: {
  onCreate: (name: string) => Promise<SpaceDto | null>;
  onClose: () => void;
  submitting: boolean;
}) {
  return (
    <SidebarNameForm
      placeholder="グループ名"
      ariaLabel="グループ名"
      submitLabel="グループ作成"
      onSubmit={onCreate}
      onClose={onClose}
      submitting={submitting}
    />
  );
}
