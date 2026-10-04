/**
 * rete E2E 認証ヘルパー
 *
 * globalSetup で事前生成したセッションクッキーを使い、
 * ログイン API を叩かずに認証済み APIRequestContext を返す。
 * セッション有効性チェックの余分なリクエストは行わない
 * （失効していれば当該テストが 401 で失敗するため検出可能）。
 */

import { request } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';

/**
 * 対象 backend。既定は開発統括ローカルの dev サーバー（:3011）。
 * 隔離チェックアウトの backend など別インスタンスへ向けたい時は E2E_BASE_URL で上書きする
 * （スイート全体が同じ backend を叩く前提なので、ここ1箇所だけを見る）。
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3011';

/** seed に存在する認証情報 */
export const CREDENTIALS = {
  admin: { email: 'admin@rete.local', password: 'ReteAdmin1234!', key: 'admin' },
  /** システム MEMBER（org-change / space-scope の可視・越境シナリオで使用） */
  member: { email: 'of-admin@struct-pass.example', password: 'ReteDemo1234!', key: 'member' },
  /** システム MEMBER（非メンバー PJ のチャネルが見えないこと＝S-SPC-05） */
  whUser: { email: 'wh-user@struct-pass.example', password: 'ReteDemo1234!', key: 'whUser' },
  /** システム MEMBER（異動・脱退で可視が切れること＝org-change） */
  newcomer: { email: 'newcomer@struct-pass.example', password: 'ReteDemo1234!', key: 'newcomer' },
  /** cmn-0139: mfa-login.feature 専用。seed 固定・MFA 無効で焼き込み、シナリオ内 setup→confirm→teardown disable。*/
  mfaUser: { email: 'mfa-user@rete.local', password: 'ReteDemo1234!', key: 'mfaUser' },
  /** cmn-0140: org-change.feature 退職ロック対象。システム ADMIN（bootstrap admin との2名体制でロックしても管理者ゼロにならない）。 */
  tanaka: { email: 'tanaka@struct-pass.example', password: 'ReteDemo1234!', key: 'tanaka' },
} as const;

/** メールアドレスで CREDENTIALS エントリを引く（seed 未存在は throw）。散在していた Object.values(CREDENTIALS).find の単一ソース（cmn-0161）。 */
export function credByEmail(email: string) {
  const c = Object.values(CREDENTIALS).find((x) => x.email === email);
  if (!c) throw new Error(`seed に存在しないメール: ${email}`);
  return c;
}

const SESSION_DIR = path.join(__dirname, '..', '.cache', 'sessions');

/**
 * 事前生成したセッションを使い認証済み APIRequestContext を返す。
 * セッションファイルが無い場合はフォールバックとしてログインして生成する。
 */
export async function createAuthenticatedContext(email: string, password: string) {
  const cred = Object.values(CREDENTIALS).find((c) => c.email === email);
  const key = cred?.key ?? 'unknown';
  const sFile = path.join(SESSION_DIR, `${key}.json`);

  // 保存済みセッションを使う（有効性チェックは省略して余分なリクエストを出さない）
  try {
    const raw = await fs.readFile(sFile, 'utf-8');
    const state = JSON.parse(raw) as {
      cookies: {
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        httpOnly: boolean;
        secure: boolean;
        // Playwright の storageState が書き出す値そのもの。string へ広げると
        // request.newContext({ storageState }) の cookies 型と合わず型検査で落ちる。
        sameSite: 'Strict' | 'Lax' | 'None';
      }[];
    };
    if (state.cookies && state.cookies.length > 0) {
      return await request.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: state.cookies, origins: [] },
      });
    }
  } catch {
    // セッションファイルが無い/壊れている → フォールバック
  }

  // フォールバック: 直接ログイン
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/v1/auth/login', { data: { email, password } });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Login failed for ${email}: ${res.status()} ${body}`);
  }

  // 生成したセッションを保存（次回以降に使う）
  try {
    await fs.mkdir(SESSION_DIR, { recursive: true });
    const saved = await ctx.storageState();
    await fs.writeFile(sFile, JSON.stringify(saved, null, 2), 'utf-8');
  } catch {
    // 保存失敗は無視（テスト自体は続行）
  }

  return ctx;
}
