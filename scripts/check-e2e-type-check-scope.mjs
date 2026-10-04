#!/usr/bin/env node
// cmn-0272 項目2: e2e の TypeScript 型検査対象が「steps / support / ui / playwright.config.ts」を
// 全て含むことを保証する検査。
//
// 背景: e2e は pnpm workspace の外（packages/* だけが workspace）に置かれた独立 npm パッケージで、
// ルートの type-check は pnpm --filter "./packages/**" で packages/ 配下しか走らない＝e2e は CI で
// 独自の type-check ステップが必要だった（cmn-0256）。ところが e2e/tsconfig.json の include が
// 何を含むかは「書いて終わり」で検査がなく、include を縮める（例: "include": ["steps/**/*.ts"]）と
// ui/sso.spec.ts や playwright.config.ts の型退行が CI 緑のまま忍び込む。
//
// ここで固定するのは「e2e/tsconfig.json の include が、指定された 4 経路を全て含む」という不変条件。
// 逆に「4 経路を抜くと落ちる」「4 経路を含めると緑」の両方向を node --test で担保する。
//
// Node 標準モジュールのみで動く（依存インストール前に動かせる）＝既存の scripts/*.test.mjs と同方針。

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');
export const E2E_TSCONFIG = join(REPO_ROOT, 'e2e', 'tsconfig.json');

/**
 * e2e の型検査対象が必ず含まなければならない相対パス（tsconfig.json 起点）。
 * それぞれ「実体が存在するか」と「include glob に含まれるか」の両方を検査する。
 */
export const REQUIRED_E2E_PATHS = ['steps', 'support', 'ui', 'playwright.config.ts'];

/**
 * tsconfig.json の include 配列を読む。include が未指定なら TypeScript 既定のグロブを返す。
 * exclude はここでは無視（include が広すぎても include glob が守られていれば本検査の範囲外）。
 * 注: tsconfig.json は標準 JSON 構文（コメント非対応）として読む。コメントを足したい場合は
 * 別ファイル（例: tsconfig.extras.json）を分離すること。
 */
export function readInclude(tsconfigPath) {
  const raw = readFileSync(tsconfigPath, 'utf8');
  const parsed = JSON.parse(raw);
  const include = parsed.include;
  if (!Array.isArray(include)) return ['**/*']; // TypeScript 既定
  return include.map(String);
}

/**
 * glob マッチの最小実装:
 * - `**` は 0 個以上のセグメントにマッチ
 * - `*` はセグメント内の 0 個以上の文字にマッチ（簡易 regex）
 * - それ以外はリテラル
 * - `{...}` / `?` / `[...]` は非対応（e2e の現行 include にこれらは無い）
 */
export function globMatch(glob, relativePath) {
  if (glob === relativePath) return true;
  if (!glob.includes('**')) {
    const globSegs = glob.split('/');
    const pathSegs = relativePath.split('/');
    if (globSegs.length !== pathSegs.length) return false;
    for (let i = 0; i < globSegs.length; i++) {
      if (!segmentMatch(globSegs[i], pathSegs[i])) return false;
    }
    return true;
  }
  // ** を含むグロブ:
  // 1) 前半部（最初の ** まで）＝パスの先頭セグメント群にマッチするかを見る。
  // 2) 後半部（** の後ろ）＝パスの末尾セグメント群にマッチする位置を後ろから探す。
  const before = glob.split('**')[0];
  const after = glob.split('**').slice(1).join('**');
  const pathSegs = relativePath.split('/');
  let start = 0;
  if (before) {
    const beforeSegs = before.replace(/\/$/, '').split('/').filter(Boolean);
    for (let i = 0; i < beforeSegs.length; i++) {
      if (start + i >= pathSegs.length) return false;
      if (!segmentMatch(beforeSegs[i], pathSegs[start + i])) return false;
    }
    start += beforeSegs.length;
  }
  if (!after) return true;
  const afterSegs = after.replace(/^\//, '').split('/').filter(Boolean);
  for (let end = pathSegs.length; end >= start + afterSegs.length; end--) {
    const tail = pathSegs.slice(end - afterSegs.length, end);
    let ok = true;
    for (let i = 0; i < afterSegs.length; i++) {
      if (!segmentMatch(afterSegs[i], tail[i])) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function segmentMatch(globSeg, pathSeg) {
  if (globSeg === '*') return pathSeg.length > 0;
  if (globSeg === pathSeg) return true;
  if (!globSeg.includes('*')) return false;
  // セグメント内の * を 0 個以上の文字にマッチ（regex 特殊文字は防御的に escape）。
  const escaped = globSeg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(pathSeg);
}

/**
 * requiredPath が include のいずれかの glob にマッチするか。
 * ディレクトリ指定の場合、その配下の .ts ファイル群が include されることを判定する。
 * （仮想的に <dir> + 二重アスタ + 一重アスタ.ts をマッチ対象とする）
 */
export function isPathCovered(include, requiredPath, e2eRoot) {
  const exists = existsSync(join(e2eRoot, requiredPath));
  if (!exists) return { exists: false, covered: false };

  const isDirectory = statSync(join(e2eRoot, requiredPath)).isDirectory();

  // 1) グロブ直接マッチ（ファイル名そのもの or ディレクトリ名そのもの）
  if (include.some((g) => globMatch(g, requiredPath))) {
    return { exists: true, covered: true };
  }

  // 2) ディレクトリ指定なら <dir>/**/*.ts を仮想的にマッチ対象に加え、
  //    「配下の .ts ファイル群が include される」ことを判定する。
  if (isDirectory) {
    const virtualGlob = `${requiredPath}/**/*.ts`;
    if (include.some((g) => globMatch(g, virtualGlob))) {
      return { exists: true, covered: true };
    }
  }

  return { exists: true, covered: false };
}

/**
 * check:repo-invariants から呼ばれるメイン判定。CLI からも直接実行可能。
 */
export function run() {
  const include = readInclude(E2E_TSCONFIG);
  const e2eRoot = join(REPO_ROOT, 'e2e');
  const problems = [];
  for (const required of REQUIRED_E2E_PATHS) {
    const { exists, covered } = isPathCovered(include, required, e2eRoot);
    if (!exists) {
      problems.push(`e2e/${required} が実体として存在しません`);
      continue;
    }
    if (!covered) {
      problems.push(
        `e2e/tsconfig.json の include に ${required} をカバーする glob がありません（include=${JSON.stringify(include)}）`,
      );
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  - ${problem}`);
    throw new Error(
      `e2e の type-check 対象に必須パス ${REQUIRED_E2E_PATHS.join(' / ')} が含まれていません`,
    );
  }
  console.log(`OK: e2e type-check 対象に ${REQUIRED_E2E_PATHS.length} 経路を含む`);
}

// CLI エントリ（`node check-e2e-type-check-scope.mjs` で実行された時のみ走らせる）。
// テスト時は test ランナーが import する経路なので、副作用を避けるためにガードする。
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  try {
    run();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
