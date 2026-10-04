import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  REQUIRED_SCRIPTS,
  parseWorkspacePatterns,
  expandPattern,
  isDirEntry,
  listWorkspacePackages,
  findMissingScripts,
} from './check-workspace-scripts.mjs';

test('parseWorkspacePatterns: packages 配下のパターンを引用符なしで返す', () => {
  const patterns = parseWorkspacePatterns('packages:\n  - \'packages/*\'\n  - "tools/cli"\n');
  assert.deepEqual(patterns, ['packages/*', 'tools/cli']);
});

test('parseWorkspacePatterns: コメント行と空行を無視する', () => {
  const patterns = parseWorkspacePatterns("# comment\npackages:\n\n  - 'packages/*' # 本体\n");
  assert.deepEqual(patterns, ['packages/*']);
});

test('parseWorkspacePatterns: packages ブロックの後ろの別キーは読まない', () => {
  const patterns = parseWorkspacePatterns(
    "packages:\n  - 'packages/*'\nonlyBuiltDependencies:\n  - sharp\n",
  );
  assert.deepEqual(patterns, ['packages/*']);
});

test('parseWorkspacePatterns: パターンが 0 件なら throw する（fail-closed）', () => {
  assert.throws(
    () => parseWorkspacePatterns('onlyBuiltDependencies:\n  - sharp\n'),
    /1 件も読めませんでした/,
  );
});

test('expandPattern: 未対応パターン（globstar / 除外 / 中間ワイルドカード）は throw する', () => {
  assert.throws(() => expandPattern('packages/**'), /globstar/);
  assert.throws(() => expandPattern('!packages/legacy'), /除外パターン/);
  assert.throws(() => expandPattern('packages/*/src'), /末尾/);
});

test('expandPattern: dir/* を実ディレクトリへ展開する', () => {
  const root = mkdtempSync(join(tmpdir(), 'cws-expand-'));
  try {
    mkdirSync(join(root, 'packages', 'a'), { recursive: true });
    mkdirSync(join(root, 'packages', 'b'), { recursive: true });
    writeFileSync(join(root, 'packages', 'note.txt'), 'not a dir');
    const dirs = expandPattern('packages/*', root).map((dir) => dir.replace(root, ''));
    assert.equal(dirs.length, 2);
    assert.ok(dirs.every((dir) => /a$|b$/.test(dir)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('expandPattern: 存在しないディレクトリは空配列（throw しない）', () => {
  const root = mkdtempSync(join(tmpdir(), 'cws-empty-'));
  try {
    assert.deepEqual(expandPattern('packages/*', root), []);
    assert.deepEqual(expandPattern('tools/cli', root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('expandPattern: symlink の実体がディレクトリなら列挙対象になる（cmn-0337）', () => {
  const root = mkdtempSync(join(tmpdir(), 'cws-symlink-'));
  try {
    mkdirSync(join(root, 'packages', 'real'), { recursive: true });
    // Windows ではディレクトリ symlink 作成に特権が要るため junction を使う（実体がディレクトリなら
    // isSymbolicLink() も true になる）。作成できなければスキップ（CI は Linux なので必ず通る）。
    try {
      symlinkSync(join(root, 'packages', 'real'), join(root, 'packages', 'link'), 'junction');
    } catch {
      return;
    }
    const dirs = expandPattern('packages/*', root).map((dir) => dir.replace(root, ''));
    assert.ok(
      dirs.includes(join('/packages', 'link')),
      `symlink が列挙に含まれる: ${dirs.join(', ')}`,
    );
    assert.ok(dirs.includes(join('/packages', 'real')), `実体が含まれる: ${dirs.join(', ')}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isDirEntry: 実体がファイルの symlink はディレクトリとして扱わない（cmn-0337）', () => {
  const root = mkdtempSync(join(tmpdir(), 'cws-symfile-'));
  try {
    writeFileSync(join(root, 'target.txt'), 'x');
    try {
      symlinkSync(join(root, 'target.txt'), join(root, 'link.txt'), 'file');
    } catch {
      return;
    }
    const [link] = readdirSync(root, { withFileTypes: true }).filter((e) => e.name === 'link.txt');
    assert.equal(isDirEntry(link, root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI: 実際に起動して正常終了する（cmn-0337・実行されないコードを残さない）', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const result = spawnSync(process.execPath, [join(here, 'check-workspace-scripts.mjs')], {
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `CLI が非 0 終了しました: ${result.status} ${result.stderr?.slice(0, 500)}`,
  );
});

test('listWorkspacePackages: package.json を持つディレクトリだけを列挙する', () => {
  const root = mkdtempSync(join(tmpdir(), 'cws-list-'));
  try {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    mkdirSync(join(root, 'packages', 'app'), { recursive: true });
    mkdirSync(join(root, 'packages', 'scratch'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'app', 'package.json'),
      JSON.stringify({ name: '@x/app', scripts: { 'test:cov': 'vitest' } }),
    );
    const packages = listWorkspacePackages({ root });
    assert.equal(packages.length, 1);
    assert.equal(packages[0].name, '@x/app');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findMissingScripts: 必須 script の未定義を検出する（新規パッケージの書き漏れ）', () => {
  const failures = findMissingScripts([
    {
      name: '@x/full',
      dir: '/x/full',
      scripts: { 'test:cov': 'a', 'type-check': 'b', 'lint:check': 'c' },
    },
    { name: '@x/new', dir: '/x/new', scripts: { build: 'tsc' } },
  ]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, '@x/new');
  assert.deepEqual(failures[0].missing, ['test:cov', 'type-check', 'lint:check']);
});

test('findMissingScripts: script の値が文字列でない場合も未定義として扱う', () => {
  const failures = findMissingScripts([
    { name: '@x/odd', dir: '/x/odd', scripts: { 'test:cov': null } },
  ]);
  assert.deepEqual(failures[0].missing, REQUIRED_SCRIPTS);
});

test('（実データ）rete の全 workspace パッケージが必須 script を定義している', () => {
  const packages = listWorkspacePackages();
  assert.ok(packages.length > 0, 'workspace パッケージが 1 件以上解決されること');
  const failures = findMissingScripts(packages);
  assert.deepEqual(
    failures,
    [],
    `必須 script が未定義のパッケージがあります: ${JSON.stringify(failures, null, 2)}`,
  );
});
