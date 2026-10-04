import { ChangePasswordView } from '@/features/auth';

/**
 * 強制パスワード変更ページ（set-0035・URL: /change-password）。
 * AppShell の横断ゲートが mustChangePassword=true のユーザーをここへ誘導する。
 * AppShell を使わない独立レイアウトのため、変更完了まで他画面へ抜けられない構造に巻き込まれない
 * （login / invite ページと同じ構成）。
 */
export default function Page() {
  return <ChangePasswordView />;
}
