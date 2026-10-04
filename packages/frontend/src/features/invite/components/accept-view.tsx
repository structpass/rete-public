'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { acceptInvite } from '@/features/settings/lib/invites-api';
import { apiErrorMessage } from '@/features/settings/lib/api-error';
import { usePasswordPolicy } from '@/features/auth/hooks/use-password-policy';
import { PasswordPolicyChecklist } from '@/features/auth/components/password-policy-checklist';

/** パスワード最小文字数（ログイン設定のデフォルト値に準拠・プレースホルダ表示用）。 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * 招待受諾ページのビュー（公開・未ログイン表示可）。
 * URL クエリ ?token= を読み、氏名 + パスワード登録フォームを表示する。
 * 送信成功後はログイン画面への導線を表示する。
 * AppShell を使わないため認証に巻き込まれない（login ページと同じ独立レイアウト）。
 */
export function AcceptView() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 再送依頼の導線は「招待が無効/期限切れ」系の失敗時だけ出す（論点3）。
  // パスポリシー違反(422)・入力検証・throttle(429) では出さない（再送依頼に化けさせない・code-review HIGH）。
  const [showResendHint, setShowResendHint] = useState(false);

  // アクティブなパスワードポリシーで入力を inline 評価（送信前フィードバック・送信ゲート）。
  const { rules: policyRules, allSatisfied: policySatisfied } = usePasswordPolicy(password);

  // ── クライアント側バリデーション ──
  function validate(): string | null {
    if (!token) return '招待リンクが無効です。メールに記載されたリンクを再度ご確認ください。';
    if (!name.trim()) return '表示名を入力してください。';
    if (password.length < MIN_PASSWORD_LENGTH)
      return `パスワードは ${MIN_PASSWORD_LENGTH} 文字以上で設定してください。`;
    if (password !== confirmPassword) return 'パスワードが一致しません。';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShowResendHint(false);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await acceptInvite(token, name.trim(), password);
      setDone(true);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setError('リクエストが多すぎます。しばらく時間をおいてから再試行してください。');
      } else if (status === 422) {
        // パスワードポリシー違反（422）は token 有効性と無関係。サーバのポリシー違反文言を
        // そのまま見せ、ユーザーがパスワードを直せるようにする（再送依頼に化けさせない・code-review HIGH）。
        setError(
          apiErrorMessage(
            err,
            'パスワードがポリシーを満たしていません。入力内容をご確認ください。',
          ),
        );
      } else {
        // 論点3（案A・列挙防止 invariant）: 失効 / 無効を出し分けず統一メッセージにする。
        // backend は失効/無効の区別を返さない（曖昧統一）ため、ここでも区別せず再送依頼へ導く。
        setError('この招待は無効か期限切れです。管理者に再送を依頼してください。');
        setShowResendHint(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── 完了画面 ──
  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1.5 text-center">
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-10 w-10 text-[var(--sp-accent-teal)]" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl tracking-tight text-[var(--sp-text-warm)]">
              登録が完了しました
            </CardTitle>
            <p className="text-sm text-[var(--sp-text-warm)]">
              アカウントが作成されました。ログインしてご利用ください。
            </p>
          </CardHeader>
          <CardContent>
            <a
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-[0.1875rem] bg-[var(--sp-accent-teal)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--sp-accent-teal-strong)] transition-colors"
            >
              ログイン画面へ
            </a>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ── 無効トークン（token が空）──
  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1.5 text-center">
            <CardTitle className="text-xl tracking-tight text-[var(--sp-text-warm)]">
              招待リンクが無効です
            </CardTitle>
            <p className="text-sm text-[var(--sp-text-warm)]">
              メールに記載されたリンクを再度ご確認いただくか、管理者に再発行を依頼してください。
            </p>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // ── 登録フォーム ──
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1.5 text-center">
          <CardTitle className="text-xl tracking-tight text-[var(--sp-text-warm)]">
            Struct Rete
          </CardTitle>
          <p className="text-sm text-[var(--sp-text-warm)]">アカウントを作成して参加</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormField label="表示名" htmlFor="accept-name" required>
              <Input
                id="accept-name"
                type="text"
                autoComplete="name"
                placeholder="山田 太郎"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </FormField>
            <FormField label="パスワード" htmlFor="accept-password" required>
              <Input
                id="accept-password"
                type="password"
                autoComplete="new-password"
                placeholder={`${MIN_PASSWORD_LENGTH} 文字以上`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
              {password.length > 0 && (
                <PasswordPolicyChecklist rules={policyRules} className="mt-2" />
              )}
            </FormField>
            <FormField label="パスワード（確認）" htmlFor="accept-confirm-password" required>
              <Input
                id="accept-confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="もう一度入力"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
              />
            </FormField>

            {error && (
              <div role="alert" className="space-y-1">
                <p className="text-sm text-[var(--sp-accent-red)]">{error}</p>
                {/* 論点3: 招待無効/期限切れ系の失敗時のみ再送依頼導線を提示（パスワード違反では出さない）。 */}
                {showResendHint && (
                  <p className="text-xs text-[var(--sp-text-warm-mute)]">
                    ログインできない場合は、管理者に招待メールの再送を依頼してください。
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="sp-primary"
              size="lg"
              className="w-full"
              loading={submitting}
              disabled={!policySatisfied}
            >
              アカウント作成
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
