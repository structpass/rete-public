import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./run-tests-agent.mjs', import.meta.url));

function runInline(source, { env = process.env } = {}) {
  return spawnSync(process.execPath, [runner, '--', process.execPath, '-e', source], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
    windowsHide: true,
  });
}

test('成功時は大量の通過ログを捨て、集計だけを返す', () => {
  const result = runInline(
    `for (let i = 0; i < 500; i++) console.log('passing-line-' + i);
     console.log('Test Suites: 20 passed, 20 total');
     console.log('Tests: 500 passed, 500 total');`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[test:agent] PASS/);
  assert.match(result.stdout, /Test Suites: 20 passed, 20 total/);
  assert.match(result.stdout, /Tests: 500 passed, 500 total/);
  assert.doesNotMatch(result.stdout, /passing-line-1(?:\D|$)/);
  assert.ok(result.stdout.trim().split(/\r?\n/).length <= 4, result.stdout);
});

test('agent既定経路と通常testの段構成がドリフトしていない', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts.test,
    'pnpm run build:shared && pnpm run check:repo-invariants && pnpm --filter "./packages/**" test',
  );
});

test('成功でも警告は隠さない', () => {
  const result = runInline(
    `console.error('DeprecationWarning: synthetic warning');
     console.log('Tests: 1 passed, 1 total');`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /warnings=1/);
  assert.match(result.stdout, /DeprecationWarning: synthetic warning/);
});

test('失敗時は終了コード、末尾の失敗内容、完全ログの場所を返す', () => {
  const result = runInline(
    `for (let i = 0; i < 300; i++) console.log('noise-' + i);
     console.log('Tests: 300 total');
     console.log('✖ failing tests:');
     console.error('Error: synthetic failure');
     process.exit(7);`,
  );

  assert.equal(result.status, 7, result.stderr);
  assert.match(result.stderr, /\[test:agent] FAIL exit=7/);
  assert.match(result.stderr, /Tests: 300 total/);
  assert.match(result.stderr, /Error: synthetic failure/);
  assert.doesNotMatch(result.stderr, /noise-299/);

  const match = result.stderr.match(/full_log=([^\r\n]+)/);
  assert.ok(match, result.stderr);
  const logPath = match[1].trim();
  assert.equal(existsSync(logPath), true, logPath);
  assert.match(readFileSync(logPath, 'utf8'), /noise-0/);
  assert.match(readFileSync(logPath, 'utf8'), /Error: synthetic failure/);
  rmSync(dirname(logPath), { recursive: true, force: true });
});
