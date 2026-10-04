'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';
import { LoginNetworkCanvas } from './login-network-canvas';

/**
 * ログイン画面（rete-login-0001）。
 * 背景は .app-sidebar と同系のソフトメタルグラデ、カードはガラスパネル相当
 * （半透明＋ぼかし＋明縁）。背景キャンバスには Rete の意義を表す回転ネットワーク
 * （rete-login-0006）。認証ロジックは LoginForm に委譲する。
 */
export function LoginView() {
  return (
    <main className="login-metal-page flex min-h-screen items-center justify-center px-4">
      <LoginNetworkCanvas />
      <Card className="login-metal-card w-full max-w-sm shadow-none">
        <CardHeader className="space-y-1.5 text-center">
          <CardTitle className="text-xl tracking-tight text-[var(--sp-text-warm)]">
            Rete Login
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
