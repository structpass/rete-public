// cmn-0397: check-e2e-step-arg-resolution.mjs の単体テスト。
//
// 方針（check-css-tokens.test.mjs の型に倣う）:
//   - 仮ファイル（mkdtemp fixture）で「違反する書き方を入れると落ちる」「是正後の書き方なら緑」の
//     両方向を押さえる。違反 fixture は是正前の実コード（コミット 99bb8d5a 時点の
//     common.steps.ts / org-change.steps.ts）の形をそのまま使う（作文した整形見本だけで通すと、
//     複数行折り返しを読めない実装が緑になる）。
//   - 最後に実リポ（REPO_ROOT）を走査して違反 0 件を固定する（仮ファイルだけを見て
//     緑になる形にしない）。この 0 件が意味を持つのは本体側の fail-closed（探索ゼロは赤）とセット。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REPO_ROOT,
  runChecks,
  findScanError,
  findTopLevelArrow,
  maskSource,
} from './check-e2e-step-arg-resolution.mjs';

/** { 'e2e/steps/x.steps.ts': source } の map から仮リポを作る */
function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'e2e-arg-resolution-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return root;
}

function withFixture(files, fn) {
  const root = makeFixture(files);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- 違反 fixture（是正前の実コードそのまま） --------------------------------------------

// common.steps.ts:88-97（是正前）: 省略記法 1 段 + 呼び出しが 4 行に折り返された形
const VIOLATION_COMMON_ROLE = `
import { When } from '../support/fixtures';

When('自分自身の system-role を {string} に変更しようとする', async ({ world }, role: string) => {
  if (!world.apiCtx) throw new Error('APIRequestContext が未初期化');
  if (!world.currentUserId) {
    throw new Error('currentUserId が未設定 — システムADMIN でログインしてください');
  }
  world.lastResponse = await world.apiCtx.patch(
    \`/api/v1/members/\${world.currentUserId}/system-role\`,
    { data: { role } },
  );
});
`;

// org-change.steps.ts:50-83（是正前・抜粋）: step 登録自体が複数行に折り返された形。
// 送信以外（createAuthenticatedContext / credByEmail / 比較）の素のまま利用は検出対象外だが、
// fixture は実コードの形を保つためそのまま残す。
const VIOLATION_ORG_SEED = `
import { request, expect } from '@playwright/test';
import { Given } from '../support/fixtures';
import { createAuthenticatedContext, BASE_URL, CREDENTIALS, credByEmail } from '../support/auth';

Given(
  'seed ユーザー {string}（パスワード {string}）としてログインし、セッションと自分の id を {string} に保存する',
  async ({ world }, email: string, password: string, key: string) => {
    // auth.ts のセッションキャッシュ（あれば再利用＝throttle 消費 0）→ 無効なら直接ログイン。
    let ctx = await createAuthenticatedContext(email, password);
    let id = await fetchMeId(ctx);

    if (!id) {
      await ctx.dispose();
      ctx = await request.newContext({ baseURL: BASE_URL });
      const res = await ctx.post('/api/v1/auth/login', { data: { email, password } });
      expect(res.status(), \`\${email} のログインが成功すること\`).toBe(200);
      const cred = credByEmail(email);
    }

    world.sessions[key] = ctx;
    if (email === CREDENTIALS.tanaka.email) {
      world.restoreAccountIds.push(id);
    }
    world.apiCtx = ctx;
    world.uniqueNames[key] = id;
  },
);
`;

// org-change.steps.ts:101-110（是正前）
const VIOLATION_ORG_LOGIN_TRY = `
import { request } from '@playwright/test';
import { When } from '../support/fixtures';
import { BASE_URL } from '../support/auth';

When(
  'メール {string}・パスワード {string} でログインを試みる',
  async ({ world }, email: string, password: string) => {
    // 失敗が期待されるログイン試行（ロック後 401 / throttle 窓内では 429）。
    const ctx = await request.newContext({ baseURL: BASE_URL });
    world.auxiliaryContexts.push(ctx);
    world.lastResponse = await ctx.post('/api/v1/auth/login', { data: { email, password } });
  },
);
`;

// ---- テスト: 違反を検出できる（是正前の実コードの形で） -----------------------------------

test('是正前の common.steps.ts の形（省略記法 1 段・4 行折り返し）を検出する', () => {
  withFixture({ 'e2e/steps/common.steps.ts': VIOLATION_COMMON_ROLE }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(errors, []);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].argName, 'role');
    assert.equal(violations[0].kind, 'data-literal');
  });
});

test('是正前の org-change seed step（複数行折り返しの登録）を検出する', () => {
  withFixture({ 'e2e/steps/org-change.steps.ts': VIOLATION_ORG_SEED }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(errors, []);
    assert.deepEqual(violations.map((v) => v.argName).sort(), ['email', 'password']);
  });
});

test('是正前の org-change ログイン試行 step を検出する', () => {
  withFixture({ 'e2e/steps/org-change.steps.ts': VIOLATION_ORG_LOGIN_TRY }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(errors, []);
    assert.deepEqual(violations.map((v) => v.argName).sort(), ['email', 'password']);
  });
});

test('省略記法より深い入れ子（{ data: { user: { role } } }）も検出する', () => {
  const src = `
import { When } from '../support/fixtures';
When('入れ子 {string}', async ({ world }, role: string) => {
  world.lastResponse = await world.apiCtx.post('/api/v1/x', { data: { user: { role } } });
});
`;
  withFixture({ 'e2e/steps/nested.steps.ts': src }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(errors, []);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].argName, 'role');
  });
});

test('明示の値位置（{ data: { newRole: role } }）を検出する', () => {
  const src = `
import { When } from '../support/fixtures';
When('値位置 {string}', async ({ world }, role: string) => {
  world.lastResponse = await world.apiCtx.post('/api/v1/x', { data: { newRole: role } });
});
`;
  withFixture({ 'e2e/steps/value.steps.ts': src }, (root) => {
    const { violations } = runChecks({ root });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].argName, 'role');
    assert.equal(violations[0].form, 'value');
  });
});

test('HTTP 呼び出しの第 1 引数が素の引数そのもの（.get(urlPath)）を検出する', () => {
  const src = `
import { When } from '../support/fixtures';
When('GET {string} を素で叩く', async ({ world }, urlPath: string) => {
  world.lastResponse = await world.apiCtx.get(urlPath);
});
`;
  withFixture({ 'e2e/steps/rawget.steps.ts': src }, (root) => {
    const { violations } = runChecks({ root });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].argName, 'urlPath');
    assert.equal(violations[0].kind, 'http-get');
  });
});

// ---- テスト: 正しい書き方を誤検知しない --------------------------------------------------

test('キー位置の引数名（{ data: { email: u.email } }・mfa.steps.ts の実コード形）は違反ではない', () => {
  const src = `
import { When } from '../support/fixtures';
import { credByEmail } from '../support/auth';
When('パスワードでログインし MFA チャレンジを受ける {string}', async ({ world }, email: string) => {
  const u = credByEmail(email);
  world.lastResponse = await world.apiCtx.post('/api/v1/auth/login', {
    data: { email: u.email, password: u.password },
  });
});
`;
  withFixture({ 'e2e/steps/mfa.steps.ts': src }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(errors, []);
    assert.deepEqual(violations, []);
  });
});

test('入口で解決してから使う是正後の形は緑（解決済みの値・リテラル・定数からの組み立て）', () => {
  // 是正後の実コード（common.steps.ts / org-change.steps.ts）と同じ形
  const src = `
import { request } from '@playwright/test';
import { When } from '../support/fixtures';
import { BASE_URL } from '../support/auth';
import { resolvePlaceholders as resolveVars } from './common.steps';

When(
  '自分自身の system-role を {string} に変更しようとする',
  async ({ world }, roleArg: string) => {
    const role = resolveVars(roleArg, world.uniqueNames);
    world.lastResponse = await world.apiCtx.patch(
      \`/api/v1/members/\${world.currentUserId}/system-role\`,
      { data: { role } },
    );
  },
);

When(
  'メール {string}・パスワード {string} でログインを試みる',
  async ({ world }, emailArg: string, passwordArg: string) => {
    const email = resolveVars(emailArg, world.uniqueNames);
    const password = resolveVars(passwordArg, world.uniqueNames);
    const ctx = await request.newContext({ baseURL: BASE_URL });
    world.lastResponse = await ctx.post('/api/v1/auth/login', { data: { email, password } });
  },
);

When('GET {string} を叩く', async ({ world }, path: string) => {
  const resolved = resolveVars(path, world.uniqueNames);
  world.lastResponse = await world.apiCtx.get(resolved);
});
`;
  withFixture({ 'e2e/steps/fixed.steps.ts': src }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(errors, []);
    assert.deepEqual(violations, []);
  });
});

// ---- テスト: fail-closed（探索ゼロは違反 0 件でも赤） -------------------------------------

test('e2e/steps/ に .ts が 1 本も無ければ赤', () => {
  withFixture({ 'e2e/steps/.gitkeep': '' }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(violations, []);
    assert.ok(errors.some((e) => /1 本も見つかりません/.test(e)));
  });
});

test('step 登録を 1 件も拾えなければ赤', () => {
  withFixture({ 'e2e/steps/empty.steps.ts': 'export const nothing = 1;\n' }, (root) => {
    const { errors } = runChecks({ root });
    assert.ok(errors.some((e) => /step 登録を 1 件も拾えません/.test(e)));
  });
});

test('引数名を 1 つも集められなければ赤', () => {
  const src = `
import { When } from '../support/fixtures';
When('引数なし', async ({ world }) => {
  world.lastResponse = await world.apiCtx.get('/api/v1/auth/me');
});
`;
  withFixture({ 'e2e/steps/noargs.steps.ts': src }, (root) => {
    const { errors } = runChecks({ root });
    assert.ok(errors.some((e) => /引数名を 1 つも集められません/.test(e)));
  });
});

// ---- 実リポ回帰 -----------------------------------------------------------------------

test('現行の rete リポジトリが違反ゼロで通る（探索ゼロ判定とセットで意味を持つ）', () => {
  const { violations, errors, stats } = runChecks({ root: REPO_ROOT });
  assert.deepEqual(errors, []);
  assert.deepEqual(
    violations,
    [],
    '実リポで素の引数の無解決素通しを検出しました。step の入口で resolvePlaceholders を通してください',
  );
  // 走査量が実体と桁で乖離したら探索の壊れを疑う（2026-08-10 時点: 3 ファイル / 41 step / 引数 53）
  assert.ok(stats.files >= 3, `走査ファイル数が少なすぎます: ${stats.files}`);
  assert.ok(stats.steps >= 30, `拾った step 数が少なすぎます: ${stats.steps}`);
});

// ---- cmn-0414: sync arrow callback の検出 ---------------------------------------------

test('sync arrow callback（async なし）の素の引数を検出する（cmn-0414）', () => {
  const src = `
import { When } from '../support/fixtures';
When('sync でも素通し {string}', ({ world }, urlPath: string) => {
  world.lastResponse = world.apiCtx.get(urlPath);
});
`;
  withFixture({ 'e2e/steps/sync.steps.ts': src }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(errors, []);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].argName, 'urlPath');
    assert.equal(violations[0].kind, 'http-get');
  });
});

test('sync arrow callback で解決済みの値を使う書き方は緑（cmn-0414）', () => {
  const src = `
import { When } from '../support/fixtures';
When('sync でも解決済み {string}', ({ world }, pathArg: string) => {
  const path = pathArg.replace('{{', '').replace('}}', '');
  world.lastResponse = world.apiCtx.get(path);
});
`;
  withFixture({ 'e2e/steps/sync-fixed.steps.ts': src }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.deepEqual(errors, []);
    assert.deepEqual(violations, []);
  });
});

test('findTopLevelArrow はトップレベルの => だけを返す（cmn-0414）', () => {
  const masked = maskSource(
    "When('text', ({ world }, arg: string) => { world.x = fn((y) => y); });",
  );
  const callOpen = masked.indexOf('(');
  // collectSteps と同じく、開き括弧自体を数えない位置（callOpen + 1）から depth 0 の => を探す
  const arrowIdx = findTopLevelArrow(masked, callOpen + 1, masked.length);
  assert.notEqual(arrowIdx, -1);
  assert.ok(masked.slice(callOpen, arrowIdx).includes('({ world }, arg: string)'));
});

// ---- cmn-0414: regex リテラルの fail-closed -------------------------------------------

test('引用符を含む regex は走査エラーになる（fail-closed・cmn-0414）', () => {
  const { error } = findScanError('const re = /[\'"]/;');
  assert.ok(error, `regex が検出されませんでした: ${JSON.stringify(error)}`);
});

test('バッククォートを含む regex は走査エラーになる（fail-closed・cmn-0414）', () => {
  const { error } = findScanError('const re = /`/;');
  assert.ok(error);
});

test('対応の取れない括弧を含む regex は走査エラーになる（fail-closed・cmn-0414）', () => {
  const { error } = findScanError('const re = /(unclosed/;');
  assert.ok(error);
});

test('妥当な regex（対応の取れた括弧・文字クラス含む）はエラーにならない（cmn-0414）', () => {
  const { error } = findScanError('const m = uri.match(/[?&]secret=([A-Z2-7]+)/i);');
  assert.equal(error, null);
});

test("エスケープされた引用符を含む regex（/a\\'b/ 等）も走査エラーになる（fail-closed・cmn-0414）", () => {
  const { error } = findScanError("const re = /a\\'b/;");
  assert.ok(error, `エスケープ引用符が検出されませんでした: ${JSON.stringify(error)}`);
});

test('エスケープされた単独括弧を含む regex（/\\(/ 等）も走査エラーになる（fail-closed・cmn-0414）', () => {
  // maskSource は \ を regex 文脈として解釈せず、生の ( ) { } をマスク済みテキストへ残すため、
  // 構造解析（findMatching 等）を崩す。エスケープを無視した生文字基準で対応が取れなければ NG。
  const cases = [
    'const re = /\\(/;',
    'const re = /\\)/;',
    'const re = /\\}/;',
    'const re = /\\{/;',
  ];
  for (const src of cases) {
    const { error } = findScanError(src);
    assert.ok(error, `単独エスケープ括弧が検出されませんでした: ${src}`);
  }
});

test('エスケープされた括弧のペア（/\\(foo\\)/ 等）は相殺され許容される（cmn-0414）', () => {
  const { error } = findScanError('const re = /\\(foo\\)/;');
  assert.equal(error, null);
});

test('文字列・コメント内の / を regex と誤認しない（cmn-0414）', () => {
  const src = `
import { BASE_URL } from '../support/auth';
// comment with /api/v1/ inside
const url = '/api/v1/members/000/mfa-reset';
const re = /[?&]secret=([A-Z2-7]+)/i;
`;
  const { error } = findScanError(src);
  assert.equal(error, null);
});

test('regex でマスクが崩れるファイルは runChecks の走査エラーになる（fail-closed・cmn-0414）', () => {
  const src = `
import { When } from '../support/fixtures';
When('regex {string}', async ({ world }, role: string) => {
  const re = /['"]/;
  world.lastResponse = await world.apiCtx.post('/api/v1/x', { data: { role } });
});
`;
  withFixture({ 'e2e/steps/regex.steps.ts': src }, (root) => {
    const { violations, errors } = runChecks({ root });
    assert.ok(
      errors.some((e) => /字句マスクを崩します/.test(e)),
      `regex エラーが検出されませんでした: ${JSON.stringify(errors)}`,
    );
  });
});

// ---- cmn-0414: fetch / head の検出 -----------------------------------------------------

test('.fetch() の第 1 引数が素の引数そのもの（.fetch(urlPath)）を検出する（cmn-0414）', () => {
  const src = `
import { When } from '../support/fixtures';
When('fetch {string} を素で叩く', async ({ world }, urlPath: string) => {
  world.lastResponse = await world.apiCtx.fetch(urlPath);
});
`;
  withFixture({ 'e2e/steps/rawfetch.steps.ts': src }, (root) => {
    const { violations } = runChecks({ root });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].argName, 'urlPath');
    assert.equal(violations[0].kind, 'http-fetch');
  });
});

test('.head() の第 1 引数が素の引数そのもの（.head(urlPath)）を検出する（cmn-0414）', () => {
  const src = `
import { When } from '../support/fixtures';
When('head {string} を素で叩く', async ({ world }, urlPath: string) => {
  world.lastResponse = await world.apiCtx.head(urlPath);
});
`;
  withFixture({ 'e2e/steps/rawhead.steps.ts': src }, (root) => {
    const { violations } = runChecks({ root });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].argName, 'urlPath');
    assert.equal(violations[0].kind, 'http-head');
  });
});

// ---- cmn-0414: run() / CLI exit 経路 ---------------------------------------------------

test('run() が違反のある fixture で throw する（cmn-0414）', () => {
  const src = `
import { When } from '../support/fixtures';
When('素通し {string}', async ({ world }, urlPath: string) => {
  world.lastResponse = await world.apiCtx.get(urlPath);
});
`;
  withFixture({ 'e2e/steps/raw.steps.ts': src }, (root) => {
    const script = join(import.meta.dirname, 'check-e2e-step-arg-resolution.mjs');
    assert.throws(
      () => execFileSync(process.execPath, [script, `--root=${root}`], { encoding: 'utf8' }),
      /無解決で通信へ渡っています/,
    );
  });
});

test('run() が問題のない fixture で OK を出力し exit 0 になる（cmn-0414）', () => {
  const src = `
import { When } from '../support/fixtures';
When('解決済み {string}', async ({ world }, urlArg: string) => {
  const url = urlArg.replace('{{', '').replace('}}', '');
  world.lastResponse = await world.apiCtx.get(url);
});
`;
  withFixture({ 'e2e/steps/ok.steps.ts': src }, (root) => {
    const script = join(import.meta.dirname, 'check-e2e-step-arg-resolution.mjs');
    const out = execFileSync(process.execPath, [script, `--root=${root}`], { encoding: 'utf8' });
    assert.match(out, /OK: e2e\/steps/);
  });
});

test('CLI が違反 fixture で exit 1、解決済み fixture で exit 0（cmn-0414）', () => {
  const bad = `
import { When } from '../support/fixtures';
When('素通し {string}', async ({ world }, urlPath: string) => {
  world.lastResponse = await world.apiCtx.get(urlPath);
});
`;
  const good = `
import { When } from '../support/fixtures';
When('解決済み {string}', async ({ world }, urlArg: string) => {
  const url = urlArg.replace('{{', '').replace('}}', '');
  world.lastResponse = await world.apiCtx.get(url);
});
`;
  const badRoot = makeFixture({ 'e2e/steps/bad.steps.ts': bad });
  const goodRoot = makeFixture({ 'e2e/steps/good.steps.ts': good });
  const script = join(import.meta.dirname, 'check-e2e-step-arg-resolution.mjs');
  try {
    let badThrew = false;
    try {
      execFileSync(process.execPath, [script, `--root=${badRoot}`], { encoding: 'utf8' });
    } catch {
      badThrew = true;
    }
    assert.ok(badThrew, '違反 fixture は exit 1 であるべき');
    const goodOut = execFileSync(process.execPath, [script, `--root=${goodRoot}`], {
      encoding: 'utf8',
    });
    assert.match(goodOut, /OK: e2e\/steps/);
  } finally {
    rmSync(badRoot, { recursive: true, force: true });
    rmSync(goodRoot, { recursive: true, force: true });
  }
});
