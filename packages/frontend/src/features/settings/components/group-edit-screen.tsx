'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Role } from '@rete/shared';
import { useSession } from '@/features/auth';
import { useAsyncAction } from '@/hooks/use-async-action';
import { useMountedFetch } from '@/hooks/use-mounted-fetch';
import { FormActions, FormButton, PageTitle } from './primitives';
import { GroupFormCard } from './group-form-card';
import { GroupMemberPicker } from './group-member-picker';
import {
  addUserGroupMember,
  fetchUserGroupMembers,
  fetchUserGroups,
  removeUserGroupMember,
  updateUserGroup,
} from '../lib/groups-api';
import { fetchMembers } from '../lib/members-api';
import { apiErrorMessage } from '../lib/api-error';

/**
 * 管理グループの編集サブ画面（set-0188・system ADMIN 専用・/settings/groups/[id]）。
 * 一覧画面は改名欄・メンバー編集欄を持たず、編集は本画面でグループ名と所属ユーザーを決める。
 * グループ名は「保存」で確定、所属ユーザーの追加・除外は操作ごとに即時反映する。
 */
export function GroupEditScreen({ groupId }: { groupId: string }) {
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === Role.ADMIN;
  const router = useRouter();

  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const { run } = useAsyncAction();

  useMountedFetch(
    async (alive) => {
      if (!isAdmin) return;
      try {
        // 単一グループ取得 API は無いため、一覧（システム ADMIN 専用・全件が現役）から対象を引く。
        const [groups, accountList] = await Promise.all([fetchUserGroups(), fetchMembers()]);
        const group = groups.find((g) => g.id === groupId);
        if (!group) {
          if (alive()) setNotFound(true);
          return;
        }
        const members = await fetchUserGroupMembers(groupId);
        if (!alive()) return;
        setName(group.name);
        setOriginalName(group.name);
        setAccounts(accountList);
        setSelectedAccountIds(members.map((m) => m.accountId));
      } catch (err) {
        if (alive()) toast.error(apiErrorMessage(err, '管理グループの読み込みに失敗しました'));
      } finally {
        if (alive()) setLoading(false);
      }
    },
    [isAdmin, groupId],
  );

  const trimmedName = name.trim();
  const nameChanged = trimmedName !== '' && trimmedName !== originalName;

  async function handleSave() {
    if (!nameChanged) return;
    await run(
      async () => {
        await updateUserGroup(groupId, { name: trimmedName });
        toast.success('管理グループ名を更新しました');
        router.push('/settings/groups');
      },
      {
        onBusyChange: setSaving,
        onError: (err) => toast.error(apiErrorMessage(err, '更新に失敗しました')),
      },
    );
  }

  async function handleAddMember(accountId: string) {
    await run(
      async () => {
        await addUserGroupMember({ groupId, accountId });
        setSelectedAccountIds((cur) => (cur.includes(accountId) ? cur : [...cur, accountId]));
        toast.success('所属ユーザーを追加しました');
      },
      {
        onBusyChange: setMemberBusy,
        onError: (err) => toast.error(apiErrorMessage(err, '所属ユーザーの追加に失敗しました')),
      },
    );
  }

  async function handleRemoveMember(accountId: string) {
    await run(
      async () => {
        await removeUserGroupMember(groupId, accountId);
        setSelectedAccountIds((cur) => cur.filter((id) => id !== accountId));
        toast.success('所属ユーザーを除外しました');
      },
      {
        onBusyChange: setMemberBusy,
        onError: (err) => toast.error(apiErrorMessage(err, '所属ユーザーの除外に失敗しました')),
      },
    );
  }

  const backLink = (
    <p className="mb-3 text-sm text-[var(--sp-text-warm-mute)]">
      <Link className="text-[var(--sp-accent-red)] underline" href="/settings/groups">
        管理グループ一覧
      </Link>
      へ戻る
    </p>
  );

  if (sessionLoading) return null;
  if (!isAdmin) {
    return (
      <main className="sp-page" style={{ overflowY: 'auto' }}>
        <PageTitle title="管理グループを編集" />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="sp-page" style={{ overflowY: 'auto' }}>
        <PageTitle title="管理グループを編集" />
        <p className="text-sm text-[var(--sp-text-warm-mute)]">読み込み中…</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="sp-page" style={{ overflowY: 'auto' }}>
        <PageTitle title="管理グループを編集" />
        {backLink}
        <p className="text-sm text-[var(--sp-text-warm-mute)]">管理グループが見つかりません。</p>
      </main>
    );
  }

  return (
    <main className="sp-page" style={{ overflowY: 'auto' }}>
      <PageTitle title="管理グループを編集" />
      {backLink}

      <GroupFormCard name={name} onNameChange={setName} nameDisabled={saving}>
        <GroupMemberPicker
          accounts={accounts}
          selectedAccountIds={selectedAccountIds}
          disabled={memberBusy || saving}
          onAdd={(accountId) => void handleAddMember(accountId)}
          onRemove={(accountId) => void handleRemoveMember(accountId)}
        />

        <FormActions>
          <FormButton
            variant="secondary"
            onClick={() => router.push('/settings/groups')}
            disabled={saving}
          >
            一覧へ戻る
          </FormButton>
          <FormButton
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={!nameChanged}
          >
            保存
          </FormButton>
        </FormActions>
      </GroupFormCard>
    </main>
  );
}
