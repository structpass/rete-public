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
import { addUserGroupMember, createUserGroup, deleteUserGroup } from '../lib/groups-api';
import { fetchMembers } from '../lib/members-api';
import { apiErrorMessage } from '../lib/api-error';

/**
 * 管理グループの作成サブ画面（set-0188・system ADMIN 専用・/settings/groups/new）。
 * 一覧画面は作成欄を持たず、作成は本画面でグループ名と所属ユーザーを決めてから行う。
 * 所属ユーザーは作成前は画面内に保持し、グループ作成後に 1 件ずつ member として登録する。
 *
 * 作成と所属登録は backend に一括 API が無いため 2 段になる。所属登録が途中で失敗した時は
 * 作成済みグループを削除して巻き戻す（部分作成を残さない）。巻き戻しにも失敗した時だけ、
 * グループが作成済みであることを利用者へ明示する。
 */
class GroupCreatePartialFailureError extends Error {}

export function GroupCreateScreen() {
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === Role.ADMIN;
  const router = useRouter();

  const [name, setName] = useState('');
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { run } = useAsyncAction();

  useMountedFetch(
    async (alive) => {
      if (!isAdmin) return;
      try {
        const list = await fetchMembers();
        if (alive()) setAccounts(list);
      } catch (err) {
        if (alive()) toast.error(apiErrorMessage(err, 'ユーザー一覧の読み込みに失敗しました'));
      } finally {
        if (alive()) setLoading(false);
      }
    },
    [isAdmin],
  );

  const trimmedName = name.trim();

  async function handleCreate() {
    if (!trimmedName) return;
    await run(
      async () => {
        const created = await createUserGroup({ name: trimmedName });
        try {
          for (const accountId of selectedAccountIds) {
            await addUserGroupMember({ groupId: created.id, accountId });
          }
        } catch (err) {
          // 作成は成功済みのため、所属登録の失敗は作成を巻き戻してから報告する
          // （部分作成を残すと、再実行で同名グループがもう1件できる）。
          try {
            await deleteUserGroup(created.id);
          } catch {
            throw new GroupCreatePartialFailureError(
              `管理グループ「${created.name}」は作成されましたが、所属ユーザーの登録に失敗しました。一覧から開いて所属を設定し直してください。`,
            );
          }
          throw err;
        }
        toast.success(`管理グループ「${created.name}」を作成しました`);
        router.push('/settings/groups');
      },
      {
        onBusyChange: setSaving,
        onError: (err) =>
          toast.error(
            err instanceof GroupCreatePartialFailureError
              ? err.message
              : apiErrorMessage(err, '作成に失敗しました'),
          ),
      },
    );
  }

  if (sessionLoading) return null;
  if (!isAdmin) {
    return (
      <main className="sp-page" style={{ overflowY: 'auto' }}>
        <PageTitle title="管理グループを作成" />
      </main>
    );
  }

  return (
    <main className="sp-page" style={{ overflowY: 'auto' }}>
      <PageTitle title="管理グループを作成" />
      <p className="mb-3 text-sm text-[var(--sp-text-warm-mute)]">
        <Link className="text-[var(--sp-accent-red)] underline" href="/settings/groups">
          管理グループ一覧
        </Link>
        へ戻る
      </p>

      <GroupFormCard name={name} onNameChange={setName} nameDisabled={saving}>
        {loading ? (
          <p className="text-sm text-[var(--sp-text-warm-mute)]">読み込み中…</p>
        ) : (
          <GroupMemberPicker
            accounts={accounts}
            selectedAccountIds={selectedAccountIds}
            disabled={saving}
            onAdd={(accountId) => setSelectedAccountIds((cur) => [...cur, accountId])}
            onRemove={(accountId) =>
              setSelectedAccountIds((cur) => cur.filter((id) => id !== accountId))
            }
          />
        )}

        <FormActions>
          {/* キャンセルは背景なし系（ghost）で統一する（v2-224。オーバーレイのキャンセルと同じ字面）。 */}
          <FormButton
            variant="ghost"
            onClick={() => router.push('/settings/groups')}
            disabled={saving}
          >
            キャンセル
          </FormButton>
          <FormButton
            variant="primary"
            onClick={handleCreate}
            loading={saving}
            disabled={!trimmedName}
          >
            作成
          </FormButton>
        </FormActions>
      </GroupFormCard>
    </main>
  );
}
