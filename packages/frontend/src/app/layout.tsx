import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Noto_Sans_JP } from 'next/font/google';
import { ToastProvider } from '@/components/providers/toast-provider';
import { SessionProvider } from '@/features/auth';
import './globals.css';
import { extractCspNonce, warnIfCspNonceMissing } from '@/lib/csp-nonce';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], variable: '--font-jp' });

// 全ページを動的描画に固定する（cmn-0298）。CSP nonce はリクエストごとに変わるため、
// 静的 HTML・ISR が残ると nonce 無し（または再利用）の script タグが配信される穴になる。
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Struct Rete - タスク',
  description: 'タスク + チャット連結軸（サテライトシステム）',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // cmn-0351: 実行時に <style> を差し込むライブラリ（goober=トースト / react-colorful /
  // tiptap）へ nonce を渡す配線。middleware が生成した CSP から nonce を抽出し、
  // nonce 付き inline script で window.__nonce__ を設定する（goober が直接読む）。
  // inline script 自身も script-src の nonce で許可される。
  const csp = (await headers()).get('content-security-policy');
  const nonce = csp ? extractCspNonce(csp) : null;
  warnIfCspNonceMissing(csp);
  return (
    <html lang="ja" className={cn(geist.variable, notoSansJP.variable)}>
      <head>
        {nonce && (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{ __html: `window.__nonce__=${JSON.stringify(nonce)};` }}
          />
        )}
      </head>
      <body className="font-sans">
        <SessionProvider>{children}</SessionProvider>
        <ToastProvider />
      </body>
    </html>
  );
}
