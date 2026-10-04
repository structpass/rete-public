'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { loginFormSchema, type LoginFormData } from '../lib/validations';
import { MFA_SETUP_PATH } from '../constants';
import {
  completeInteractionFromSession,
  completeInteractionLogin,
  completeInteractionMfa,
  login,
  loginMfa,
  type AccountResponse,
} from '../lib/api';
import { useSessionContext } from './session-provider';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';

export function LoginForm() {
  const router = useRouter();
  const { setUser } = useSessionContext();
  const searchParams = useSearchParams();
  // uid あり = OIDC interaction（RP authorize 中のログイン）。なし = Rete への通常ログイン。
  const uid = searchParams.get('uid');
  const [submitting, setSubmitting] = useState(false);
  // MFA 有効アカウントは password 段階の後に 2 段階目（TOTP/バックアップコード）へ遷移する（R7）。
  // mfaStage=true の間は 6 桁コード入力フォームを表示し、loginMfa で full session を確立する。
  const [mfaStage, setMfaStage] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  // ロックアウト中（連続ログイン失敗で自動ロック・set-0025 P4）に backend が返す文言を画面上に常設表示する。
  // toast は数秒で消えるが、ロックは継続状態のためフォーム上部の固定アラートで「いつまで待てばよいか」を示す（set-0030）。
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  // uid 付きで開かれた時、既に Rete にログイン済みならパスワード無しで自動完了を試みる（シームレス SSO）。
  // 成功すれば provider の authorize 再開 URL へ遷移、未ログインならフォームへフォールバック。
  const [autoAttempting, setAutoAttempting] = useState<boolean>(Boolean(uid));
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  // StrictMode の二重実行や再 mount でも session-login を多重送信しない（interaction を二重消費すると
  // 2 回目が失敗してフォームに落ちるため）。ref で「一度だけ」発火させる。
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (!uid || attemptedRef.current) return;
    attemptedRef.current = true;
    completeInteractionFromSession(uid)
      .then((result) => {
        // 既ログイン → provider の authorize 再開 URL へ遷移（パスワードフォームをちらつかせない）。
        window.location.href = result.redirectTo;
      })
      .catch(() => setAutoAttempting(false)); // 未ログイン等 → 通常のパスワード入力フォームへ
  }, [uid]);

  // ログイン確定後の共通処理。SPA 遷移先（/hub）の AppShell が stale な user=null で /login へ
  // 跳ね返らないよう、確定アカウントを即 context へ反映してから遷移する。
  // enforced かつ MFA 未設定（R8）の場合は設定画面へ誘導する。
  const finishLogin = (account: AccountResponse, options?: { setupRequired?: boolean }) => {
    setUser(account);
    // 強制パスワード変更は最優先（MFA 設定より基礎的な資格情報の更新・set-0035）。
    if (account.mustChangePassword) {
      toast('パスワードの変更が必要です', { icon: '🔑' });
      router.push('/change-password');
      return;
    }
    if (options?.setupRequired) {
      toast('二段階認証の設定が必要です', { icon: '🔐' });
      router.push(MFA_SETUP_PATH);
      return;
    }
    toast.success(`${account.name} としてログインしました`);
    router.push('/hub');
  };

  const onSubmit = async (data: LoginFormData) => {
    setSubmitting(true);
    // 再試行時はロックアウト文言をクリアしてから判定する（解除後の成功・別エラーで古い文言を残さない）。
    setLockedMessage(null);
    try {
      if (uid) {
        const result = await completeInteractionLogin(uid, data.email, data.password);
        if (result.kind === 'mfaRequired') {
          setMfaStage(true);
          setSubmitting(false);
          return;
        }
        // provider が返す URL へ遷移して authorize を再開する（成功後は元の遷移へ抜けるので submitting は戻さない）。
        window.location.href = result.redirectTo;
        return;
      }
      const result = await login(data.email, data.password);
      if (result.kind === 'mfaRequired') {
        // full session 未確立。2 段階目（TOTP/バックアップコード）入力へ切り替える。
        setMfaStage(true);
        setSubmitting(false);
        return;
      }
      finishLogin(result.account, { setupRequired: result.kind === 'mfaSetupRequired' });
    } catch (err) {
      const message = extractErrorMessage(err, 'ログインに失敗しました');
      // ロックアウト（429 / TOO_MANY_REQUESTS）はフォーム上部に常設アラートで残す。それ以外は従来どおり toast。
      if (extractErrorCode(err) === 'TOO_MANY_REQUESTS') {
        setLockedMessage(message);
      } else {
        toast.error(message);
      }
      setSubmitting(false);
    }
  };

  const onSubmitMfa = async (e: FormEvent) => {
    e.preventDefault();
    if (mfaSubmitting) return;
    setMfaSubmitting(true);
    try {
      if (uid) {
        const { redirectTo } = await completeInteractionMfa(uid, mfaCode.trim());
        window.location.href = redirectTo;
        return;
      }
      const account = await loginMfa(mfaCode.trim());
      finishLogin(account);
    } catch (err) {
      toast.error(extractErrorMessage(err, '認証コードが正しくありません'));
      setMfaSubmitting(false);
    }
  };

  if (autoAttempting) {
    return (
      <p className="py-8 text-center text-sm text-[var(--sp-text-warm-mute)]">
        Rete セッションでログイン中…
      </p>
    );
  }

  if (mfaStage) {
    return (
      <form key="mfa" onSubmit={onSubmitMfa} className="space-y-4" noValidate>
        <p className="text-sm text-[var(--sp-text-warm)]">
          認証アプリの 6 桁コード、またはバックアップコードを入力してください。
        </p>
        <FormField label="認証コード" htmlFor="mfa-code" required>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
          />
        </FormField>
        <Button
          type="submit"
          variant="ghost"
          size="lg"
          className="w-full"
          loading={mfaSubmitting}
          disabled={mfaCode.trim().length === 0}
        >
          認証
        </Button>
        <button
          type="button"
          className="w-full text-center text-xs text-[var(--sp-text-warm-mute)] underline-offset-2 hover:underline"
          onClick={() => {
            setMfaStage(false);
            setMfaCode('');
          }}
        >
          メールアドレス入力に戻る
        </button>
      </form>
    );
  }

  return (
    <form key="password" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {lockedMessage && (
        <div
          role="alert"
          className="rounded-md border border-[color:color-mix(in_srgb,var(--sp-accent-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--sp-accent-red)_10%,transparent)] px-3 py-2 text-sm text-[var(--sp-accent-red)]"
        >
          {lockedMessage}
        </div>
      )}
      <FormField label="メールアドレス" htmlFor="email" required error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="admin@rete.local"
          {...register('email')}
        />
      </FormField>
      <FormField label="パスワード" htmlFor="password" required error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
      </FormField>
      <Button type="submit" variant="ghost" size="lg" className="w-full" loading={submitting}>
        ログイン
      </Button>
    </form>
  );
}
