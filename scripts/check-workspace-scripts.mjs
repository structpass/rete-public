#!/usr/bin/env node
// cmn-0250: pnpm workspace が解決する全パッケージが、CI の判定に使う script を定義しているかを検査する。
//
// 背景: ルートの test:cov / type-check は `pnpm --filter "./packages/**" --sequential <script>` で
// 一括実行しており、script を定義していないパッケージは pnpm が黙って飛ばす（exit 0 のまま）。
// つまり 4 つ目のパッケージを足した時、テスト床も型チェックも一度も走らないまま CI が緑になりうる。
// 判定対象はパッケージ名のハードコードではなく pnpm-workspace.yaml のパターンから自動列挙する
// （列挙を手書きすると、防ごうとしている「追加時の書き漏れ」がそのまま再発する）。
//
// Node 標準モジュールのみで動く = 依存インストール前でも実行できる（既存の制約ドリフト検査と同じ性質）。

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');

// 全パッケージが定義していなければならない script。
// 「CI が全パッケージへ一括実行しており、未定義だと黙って飛ばされる」ものだけを載せる。
// cmn-0339: lint:check を追加した（shared に lint:check を新設した cmn-0339 以前は、
// shared が未定義で CI の Lint check から一度も lint されていなかった＝検査の穴）。
// 将来パッケージが増えても、lint:check 未定義ならここで検出される。
export const REQUIRED_SCRIPTS = ['test:cov', 'type-check', 'lint:check'];

/**
 * pnpm-workspace.yaml の packages: 配下のパターンを列挙する。
 * YAML パーサは使わない（依存インストール前に動かすため）。想定形の外は throw して fail-closed にする。
 */
export function parseWorkspacePatterns(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const patterns = [];
  let inPackages = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (line.trim() === '') continue;

    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;

    const item = line.match(/^\s+-\s*(.+)$/);
    if (item) {
      patterns.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    // インデントの無い行が来たら packages ブロックの終わり。
    if (/^\S/.test(line)) break;
    throw new Error(
      `pnpm-workspace.yaml の packages ブロックに解釈できない行があります: ${rawLine}`,
    );
  }

  if (patterns.length === 0) {
    throw new Error('pnpm-workspace.yaml から packages パターンを 1 件も読めませんでした');
  }
  return patterns;
}

/**
 * パターンを実ディレクトリへ展開する。対応するのは `dir/*` と固定パスのみ。
 * それ以外（globstar・除外パターン等）は「読めたつもりで取りこぼす」ほうが危険なので throw する。
 */
export function expandPattern(pattern, root = REPO_ROOT) {
  if (pattern.startsWith('!')) {
    throw new Error(`除外パターンには未対応です（検査側を拡張してください）: ${pattern}`);
  }
  if (pattern.includes('**')) {
    throw new Error(`globstar パターンには未対応です（検査側を拡張してください）: ${pattern}`);
  }

  const starIndex = pattern.indexOf('*');
  if (starIndex === -1) {
    const dir = join(root, pattern);
    return existsSync(dir) && statSync(dir).isDirectory() ? [dir] : [];
  }
  if (!/\/\*$/.test(pattern)) {
    throw new Error(
      `末尾 '/*' 以外のワイルドカードには未対応です（検査側を拡張してください）: ${pattern}`,
    );
  }

  const parentDir = join(root, pattern.slice(0, -2));
  if (!existsSync(parentDir)) return [];
  return readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => isDirEntry(entry, parentDir))
    .map((entry) => join(parentDir, entry.name))
    .sort();
}

/**
 * ディレクトリとして扱うかどうか（cmn-0337 項目4）。Dirent.isDirectory() は symlink を辿らないため、
 * symlink の実体がディレクトリなら列挙対象にする。実体がファイル（symlink でも）や壊れた
 * symlink の場合は対象にしない（pnpm も実体で判定する）。
 */
export function isDirEntry(entry, parentDir) {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return statSync(join(parentDir, entry.name)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * workspace が解決するパッケージ（package.json を持つディレクトリ）を列挙する。
 * package.json が無いディレクトリは pnpm もパッケージとして扱わないためスキップする。
 */
export function listWorkspacePackages({ root = REPO_ROOT, workspaceFile } = {}) {
  const yamlPath = workspaceFile ?? join(root, 'pnpm-workspace.yaml');
  const patterns = parseWorkspacePatterns(readFileSync(yamlPath, 'utf8'));

  const packages = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const dir of expandPattern(pattern, root)) {
      if (seen.has(dir)) continue;
      const manifestPath = join(dir, 'package.json');
      if (!existsSync(manifestPath)) continue;
      seen.add(dir);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      packages.push({
        dir,
        name: manifest.name ?? dir,
        scripts: manifest.scripts ?? {},
      });
    }
  }
  return packages;
}

/** 必須 script の未定義を列挙する（戻り値が空 = 合格）。 */
export function findMissingScripts(packages, required = REQUIRED_SCRIPTS) {
  return packages
    .map((pkg) => ({
      name: pkg.name,
      dir: pkg.dir,
      missing: required.filter((script) => typeof pkg.scripts[script] !== 'string'),
    }))
    .filter((entry) => entry.missing.length > 0);
}

function main() {
  const packages = listWorkspacePackages();
  if (packages.length === 0) {
    console.error('[check-workspace-scripts] workspace パッケージを 1 件も解決できませんでした');
    process.exit(1);
  }

  const failures = findMissingScripts(packages);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `[check-workspace-scripts] ${failure.name}: script 未定義 ${failure.missing.join(', ')}`,
      );
    }
    console.error('必須 script を定義してください（未定義だと CI の一括実行から黙って外れます）');
    process.exit(1);
  }

  console.log(
    `[check-workspace-scripts] OK: ${packages.length} パッケージすべてに ${REQUIRED_SCRIPTS.join(' / ')} を確認`,
  );
}

// 直接実行されたときだけ main() を走らせる（既存 check-constraint-drift.mjs と同じ判定）。
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main();
}
