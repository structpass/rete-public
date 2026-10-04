#!/usr/bin/env node
/**
 * e2e 高速実行ラッパー（オーバーヘッド削減）
 *
 * `npm test` は毎回 bddgen 生成・fixture reset・HTML レポートを無条件に実行する。
 * この3つはテスト件数に関係なく固定でかかるため、48件規模ではテスト本体より
 * 大きくなる（実測: 41.3s 中 26.1s）。入力が変わっていなければ結果は同じなので、
 * キャッシュでスキップする。
 *
 * スキップ条件（いずれも「変わっていなければ安全」が成立する範囲に限定）:
 *   - bddgen  : features/ と steps/ と playwright.config.ts の内容ハッシュが前回と同一
 *   - reset   : 前回の reset 成功から TTL 以内、かつ DB を触るテストを挟んでいない
 *   - report  : --report を明示した時だけ HTML を出す（既定は list のみ）
 *
 * 安全性: 判定に迷う場合は必ず実行する側に倒す（--force 相当）。
 * ハッシュが取れない・キャッシュが壊れている時も実行する。
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = path.resolve(E2E_DIR, '..');
const CACHE_DIR = path.join(E2E_DIR, '.cache', 'fast');
const STATE_FILE = path.join(CACHE_DIR, 'state.json');
const BDD_OUT = path.join(E2E_DIR, '.cache', 'bdd');

/** reset の再利用 TTL。これを超えたら必ず再実行する（seed が外から汚れた場合の保険）。 */
const RESET_TTL_MS = 30 * 60 * 1000;

const argv = process.argv.slice(2);
const wantReport = argv.includes('--report');
const force = argv.includes('--force');
const passthrough = argv.filter((a) => !['--report', '--force'].includes(a));

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/** ディレクトリ配下のファイル内容を再帰的にハッシュ化する（mtime ではなく内容＝取りこぼし防止）。 */
function hashTree(dir, extraFiles = []) {
  const h = createHash('sha256');
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    // 名前順に固定して、ディレクトリ列挙順の揺れでハッシュが変わらないようにする
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        h.update(path.relative(E2E_DIR, p));
        h.update(fs.readFileSync(p));
      }
    }
  };
  walk(dir);
  for (const f of extraFiles) {
    try {
      h.update(path.relative(E2E_DIR, f));
      h.update(fs.readFileSync(f));
    } catch {
      /* 無ければ無視 */
    }
  }
  return h.digest('hex');
}

function log(msg) {
  process.stdout.write(`[fast] ${msg}\n`);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? E2E_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

// ---------------------------------------------------------------- bddgen
const bddInputHash = hashTree(path.join(E2E_DIR, 'features'), [
  path.join(E2E_DIR, 'playwright.config.ts'),
  path.join(E2E_DIR, 'support', 'fixtures.ts'),
]);
const stepsHash = hashTree(path.join(E2E_DIR, 'steps'));

const state = readState();
const specsExist = fs.existsSync(BDD_OUT) && fs.readdirSync(BDD_OUT).length > 0;

const bddCacheHit =
  !force && specsExist && state.bddInputHash === bddInputHash && state.stepsHash === stepsHash;

if (bddCacheHit) {
  log('bddgen skip（features/steps に変更なし）');
} else {
  log('bddgen 実行');
  run('npx', ['bddgen', 'test']);
}

// ---------------------------------------------------------------- fixture reset
const resetFresh =
  !force && typeof state.resetAt === 'number' && Date.now() - state.resetAt < RESET_TTL_MS;

if (resetFresh) {
  const ageS = Math.round((Date.now() - state.resetAt) / 1000);
  log(`fixture reset skip（${ageS}s 前に成功・TTL 内）`);
} else {
  log('fixture reset 実行');
  run('pnpm', ['--filter', '@rete/backend', 'run', 'reset:e2e-fixtures'], { cwd: REPO_DIR });
  state.resetAt = Date.now();
}

// ---------------------------------------------------------------- playwright
const pwArgs = [
  'playwright',
  'test',
  '--config',
  'playwright.config.ts',
  '--project=authz',
  ...passthrough,
];

log(`playwright 実行（reporter: ${wantReport ? 'list+html' : 'list'}）`);
const pw = spawnSync('npx', pwArgs, {
  cwd: E2E_DIR,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    // config 側がこの値を見て HTML レポートの有無を切り替える
    E2E_REPORTER_MODE: wantReport ? 'html' : 'list',
  },
});

// playwright が落ちても、bddgen キャッシュは入力一致の時に限り更新してよい
if (bddCacheHit === false) {
  state.bddInputHash = bddInputHash;
  state.stepsHash = stepsHash;
}
writeState(state);

process.exit(pw.status ?? 1);
