import { GroupEditScreen } from '@/features/settings';

/**
 * 設定 › テナント › 管理グループの編集（system ADMIN 専用・set-0188）。
 * Next 15 の動的セグメント params は Promise で渡るため await して id を取り出す。
 */
export default async function SettingsGroupsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GroupEditScreen groupId={id} />;
}
