'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-utils';
import { usePasswordPolicy } from '../hooks/use-password-policy';
import { PasswordPolicyChecklist } from './password-policy-checklist';
import { useSessionContext } from './session-provider';
import { changePassword } from '../lib/api';

/**
 * 強制パスワード変更ページのビュー（set-0035・AppShell 外の独立レイアウト）。
 * AppShell の横断ゲートが mustChangePassword=true のユーザーをここへ誘導する。変更完了で context の
 * mustChangePassword を落とし、ゲートを解いて /hub へ戻す。非強制ユーザーの自己変更にも使える（同一フォーム）。
 *
 * inline ポリシー検証は招待受諾と同じ usePasswordPolicy + PasswordPolicyChecklist を再利用（set-0029 共通 UX）。
 * 真の強制境界は backend の PasswordChangeEnforcementGuard（本画面は UX 層）。
 */
export function ChangePasswordView() {
  const router = useRouter();
  const { user, loading, setUser } = useSessionContext();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // アクティブなパスワードポリシーで新パスワードを inline 評価（送信前フィードバック・送信ゲート）。
  const { rules: policyRules, allSatisfied: policySatisfied } = usePasswordPolicy(newPassword);

  // 未ログインはログイン画面へ戻す（session 失効時の保険）。
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const forced = Boolean(user?.mustChangePassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('新しいパスワードが一致しません。');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      // backend が mustChangePassword を落とすため、context の同フラグも即座に false へ（ゲート解除）。
      if (user) setUser({ ...user, mustChangePassword: false });
      toast.success('パスワードを変更しました');
      router.replace('/hub');
    } catch (err) {
      const code = extractErrorCode(err);
      if (code === 'TOO_MANY_REQUESTS') {
        setError('リクエストが多すぎます。しばらく時間をおいてから再試行してください。');
      } else {
        // 現在PW不一致(401)・ポリシー違反/現在PWと同一(422) はサーバ文言をそのまま見せて直せるようにする。
        setError(
          extractErrorMessage(err, 'パスワードの変更に失敗しました。入力内容をご確認ください。'),
        );
      }
      setSubmitting(false);
    }
  }

  // session 復元前は何も描画しない（user 確定後にフォームを出す）。
  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Spinner className="h-5 w-5 text-[var(--sp-text-warm-mute)]" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1.5 text-center">
          <div className="mb-2 flex justify-center">
            <KeyRound className="h-9 w-9 text-[var(--sp-accent-teal)]" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl tracking-tight text-[var(--sp-text-warm)]">
            パスワードの変更
          </CardTitle>
          <p className="text-sm text-[var(--sp-text-warm)]">
            {forced
              ? 'セキュリティのため、続行する前にパスワードを変更してください。'
              : '新しいパスワードを設定してください。'}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormField label="現在のパスワード" htmlFor="current-password" required>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={submitting}
              />
            </FormField>
            <FormField label="新しいパスワード" htmlFor="new-password" required>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
              />
              {newPassword.length > 0 && (
                <PasswordPolicyChecklist rules={policyRules} className="mt-2" />
              )}
            </FormField>
            <FormField label="新しいパスワード（確認）" htmlFor="confirm-password" required>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="もう一度入力"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
              />
            </FormField>

            {error && (
              <p role="alert" className="text-sm text-[var(--sp-accent-red)]">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="sp-primary"
              size="lg"
              className="w-full"
              loading={submitting}
              disabled={
                !policySatisfied ||
                currentPassword.length === 0 ||
                confirmPassword.length === 0 ||
                newPassword !== confirmPassword
              }
            >
              パスワード変更
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
