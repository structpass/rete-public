#!/usr/bin/env node
// cmn-0240: globals.css と画面側コードのトークン誤用を機械検出する検査。
//
// 検出する 2 種類の書き間違い:
//   1. 存在しないトークンの参照 — `var(--x)` で参照しているのに、どこにも定義が無い。
//      CSS はその宣言を黙って捨てる（エラーにならず、見た目だけが壊れる）。
//   2. HSL triplet の包み忘れ — `--warning: 38 91% 50%` のような triplet 定義は
//      `hsl(var(--warning))` と包んで初めて色になる。包まず color 系プロパティへ渡すと
//      宣言ごと破棄される（cmn-0255 で直したのと同じ壊れ方）。
//
// 同じ壊れ方が dsk-0419 → cmn-0255 と 3 度発生し、そのつど人が目で見つけて直してきた。
// 4 度目を取り逃さないよう、既存の check-*.mjs 群と同じ型で機械検出する。
//
// 見る範囲は globals.css だけではない。画面側のコード（.ts/.tsx）の Tailwind 任意値記法
// （text-[var(--x)] / bg-[var(--x)] など）も同じ検査に掛ける。CSS 側だけを見ると
// projects-screen.tsx の text-[var(--sp-tone-red)] のような同型欠陥を取り逃すため。
//
// 既知の未解消分は ALLOWLIST へ「なぜ許すのか」と返済先（cmn-0334）または注入元
// （画面側の inline style / setProperty）を添えて載せる。載せた分は返済（定義 or 参照除去）
// された時点で検査が赤くなり、名簿から外すまで通らない（run-script-tests.mjs の
// 「死んだ除外の検知」と同じ型）。
//
// 未対応のエッジ（現リポに実例が無いため対応せず、記録のみ。cmn-0240 対応履歴参照）:
// - 大文字の VAR( は参照として拾わない（CSS は case-insensitive だが、実リポに使用なし）
// - hsla( は hsl() 除去に掛からない（偽の赤が出うる。実リポに hsla 使用なし）
// - TSX 側はコメント・文字列を剥がさず走査（--x をコメントに書くと定義/参照扱いになる）
// - 別名定義が var(--b, <fallback>) 形だと triplet 集合に閉じない
// - CSS 定義の収集は行頭アンカー 1 行前提（値の途中改行・行末コメント付き定義は拾えない）

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');

export const CSS_PATH = join('packages', 'frontend', 'src', 'app', 'globals.css');
export const TSX_ROOT = join('packages', 'frontend', 'src');

// 許可名簿: トークン名 -> { reason, repay?, inject? }
// - repay: 返済先チケット。定義 or 参照除去（= 返済）されたら検査が赤くなって名簿から外させる。
// - inject: 注入元（画面側の inline style / setProperty）。値を流し込む正常な使い方。
export const ALLOWLIST = {
  '--keyword-left': {
    reason:
      'desk-filter-toolbar.tsx:54 が header.style.setProperty で注入し、globals.css の ' +
      '.desk-filter-bar（padding-left の中央寄せ）が参照する。変数未設定時は静的フォールバックで描画される。',
    inject: 'desk-filter-toolbar.tsx:54',
  },
  '--desk-rte-min-rows': {
    reason:
      'rich-text-editor.tsx:128 が inline style（["--desk-rte-min-rows" as string]）で注入し、' +
      '.desk-rte の最小行数として使う。',
    inject: 'rich-text-editor.tsx:128',
  },
  '--lvl': {
    reason: 'files-tree.tsx:120,172,234 が inline style で注入し、ツリーの段階 indent として使う。',
    inject: 'files-tree.tsx:120',
  },
};

// triplet 形式の値（hsl() で包まれていない「数字 数字% 数字%」）。/ alpha 付きも許す。
const TRIPLET_VALUE_RE = /^[\d.]+(?:\s+[\d.]+%){2}(?:\s*\/\s*[^;]+)?$/;
// 色を取るプロパティ（ルール2 の対象）。custom property の定義行（--x: ...）は含まれない。
// background-color / outline-color / box-shadow 等も含める（cmn-0240 review HIGH: 取りこぼし防止）。
// border[\w-]* は border-radius も含むが、triplet を長さへ渡すのは同様に壊れるバグなので検出してよい。
const COLOR_PROPERTY_RE =
  /^\s*(?:background(?:-color)?|color|border[\w-]*|outline(?:-color)?|box-shadow|text-shadow|caret-color|accent-color|fill|stroke|text-decoration-color|column-rule-color)\s*:/;
// 画面側の色系 Tailwind 任意値記法（text- は色か文字サイズかは値で決まるが、triplet は色専用）。
// variant 形（border-t-[...] / from-[...] / ring-[...] 等）も含める（cmn-0240 review MEDIUM）。
const TSX_COLOR_BRACKET_RE =
  /\b(?:text|bg|border[\w-]*|from|via|to|ring|outline|decoration|divide|accent|caret|fill|stroke|shadow)-\[([^\]]*)\]/g;

// CSS のコメントと文字列リテラルを「改行を保った空白」へ置換する（報告の行番号をズラさない）。
export function stripCssCommentsAndStrings(cssText) {
  return cssText
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

// globals.css の custom property 定義を収集する: name -> { value, line }。
// 1 行 1 定義（:root 内はその形）を前提に、行頭（インデント可）の --name: を拾う。
export function collectCssDefinitions(cssText) {
  const definitions = new Map();
  const lines = cssText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(--[\w-]+)\s*:\s*(.*?)\s*;?\s*$/);
    if (m) definitions.set(m[1], { value: m[2], line: i + 1 });
  }
  return definitions;
}

// triplet リテラル定義（hsl() で包まれていない「数字 数字% 数字%」）の名前集合。
export function collectLiteralTriplets(definitions) {
  const triplets = new Set();
  for (const [name, { value }] of definitions) {
    if (TRIPLET_VALUE_RE.test(value.trim())) triplets.add(name);
  }
  return triplets;
}

// 別名（--a: var(--b)）を辿って triplet 集合を閉じる。
// --sp-tone-blue: var(--info) のような定義行は triplet 集合へ追加するだけで、
// ルール2 の違反にはしない（custom property の定義は「色を取るプロパティ」ではない）。
export function resolveTriplets(literalTriplets, definitions) {
  const triplets = new Set(literalTriplets);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, { value }] of definitions) {
      if (triplets.has(name)) continue;
      const m = value.trim().match(/^var\(\s*(--[\w-]+)\s*\)$/);
      if (m && triplets.has(m[1])) {
        triplets.add(name);
        changed = true;
      }
    }
  }
  return triplets;
}

// コメント・文字列を除いた上で var(--x) 参照を収集する（定義行の var() も参照として数える）。
// 行ベースにしない: var() は複数行にまたがりうる（.file-edit-paused の background: var(↵--sp-warning-bg, ↵...)
// が実例。行単位で切ると 2 行目以降のトークンが「参照ゼロ」になり許可名簿の腐り判定を誤発火させる）。
export function collectCssReferences(cssText) {
  const stripped = stripCssCommentsAndStrings(cssText);
  const refs = [];
  let line = 1;
  let lineStart = 0;
  for (const m of stripped.matchAll(/var\(\s*(--[\w-]+)/g)) {
    // マッチ位置までに進んだ改行ぶん行番号を進める（マッチは index 昇順なので線形で済む）。
    while (lineStart < m.index) {
      const nl = stripped.indexOf('\n', lineStart);
      if (nl === -1 || nl >= m.index) break;
      lineStart = nl + 1;
      line++;
    }
    refs.push({ token: m[1], line });
  }
  return refs;
}

// ルール2（CSS 側）: triplet を hsl() で包まず色プロパティ（background / color / border-* 等）へ
// 直接渡している箇所。hsl() で包まれた var() は正しい使い方なので退避してから探す。
// 値は複数行にまたがりうる（prettier が .file-edit-paused の background を var(↵--x,↵...) へ
// 折り返した実例あり）ため、`;` か `}` まで後続行を連結してから走査する。
export function findCssTripletViolations(cssText, triplets) {
  const violations = [];
  const lines = stripCssCommentsAndStrings(cssText).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(COLOR_PROPERTY_RE);
    if (!m) continue;
    let value = lines[i].slice(m[0].length);
    let j = i;
    while (!/[;}]\s*$/.test(value) && j + 1 < lines.length) {
      j++;
      value += ' ' + lines[j];
    }
    const bare = value.replace(/hsl\([^)]*\)/g, '');
    for (const vm of bare.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (triplets.has(vm[1])) violations.push({ token: vm[1], line: i + 1 });
    }
  }
  return violations;
}

// 画面側の定義集合: inline style（style={{ '--x': ... }} / ['--x' as string]: ...）と
// style.setProperty('--x', ...) による注入。②（画面側）の未定義判定にだけ使い、
// ①（globals.css）の定義集合や許可名簿の腐り判定には加えない。
export function collectTsxDefinitions(source) {
  const defs = new Set();
  for (const m of source.matchAll(/['"](--[\w-]+)['"](\s+as\s+\w+)?\s*\]?\s*:/g)) {
    defs.add(m[1]);
  }
  for (const m of source.matchAll(/setProperty\(\s*['"](--[\w-]+)['"]/g)) {
    defs.add(m[1]);
  }
  return defs;
}

// 画面側の参照集合: Tailwind 任意値記法（text-[var(--x)] など）の bracket 内 var() のみ。
// 素の var() は見ない: model タブ本文（features/model/content/*.ts）に CSS 例が散文として
// 書かれており、素で走らせると誤検知する（ui-components.ts:1070 / ui.ts:593 で実測）。
export function collectTsxReferences(source) {
  const refs = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\[[^\]]*var\(\s*(--[\w-]+)/g)) {
      refs.push({ token: m[1], line: i + 1 });
    }
  }
  return refs;
}

// ルール2（画面側）: 色系 bracket（text- / bg- / border-）内で triplet を hsl() で包まず参照。
export function findTsxTripletViolations(source, triplets) {
  const violations = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(TSX_COLOR_BRACKET_RE)) {
      const bare = m[1].replace(/hsl\([^)]*\)/g, '');
      for (const vm of bare.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (triplets.has(vm[1])) violations.push({ token: vm[1], line: i + 1 });
      }
    }
  }
  return violations;
}

// packages/frontend/src 配下の .ts/.tsx を列挙する（.d.ts は対象外）。
export function listSourceFiles(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        TSX_EXTENSIONS.has(extname(entry.name)) &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(full);
      }
    }
  };
  walk(rootDir);
  return files;
}

const TSX_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * 検査を実行する。戻り値:
 * - violations: { kind, file, line, token } — ルール1 / ルール2 の違反
 * - decay:      { token, reason } — 許可名簿の腐り（返済済みなのに名簿に残っている）
 * - errors:     string[] — 探索ゼロなど検査自体の不成立（これも赤）
 */
export function runChecks({ root = REPO_ROOT, allowlist = ALLOWLIST } = {}) {
  const cssPath = join(root, CSS_PATH);
  const tsxRoot = join(root, TSX_ROOT);
  const violations = [];
  const decay = [];
  const errors = [];

  if (!existsSync(cssPath)) {
    errors.push(`globals.css が見つかりません（探索ゼロは赤）: ${relative(root, cssPath)}`);
    return { violations, errors, decay };
  }
  const cssText = readFileSync(cssPath, 'utf8');
  const cssFile = relative(root, cssPath);

  const definitions = collectCssDefinitions(cssText);
  const cssRefs = collectCssReferences(cssText);
  const triplets = resolveTriplets(collectLiteralTriplets(definitions), definitions);

  for (const ref of cssRefs) {
    if (!definitions.has(ref.token) && !(ref.token in allowlist)) {
      violations.push({
        kind: '未定義トークン参照',
        file: cssFile,
        line: ref.line,
        token: ref.token,
      });
    }
  }
  for (const v of findCssTripletViolations(cssText, triplets)) {
    violations.push({ kind: 'triplet の包み忘れ', file: cssFile, line: v.line, token: v.token });
  }

  if (!existsSync(tsxRoot)) {
    errors.push(`画面側の走査対象がありません（探索ゼロは赤）: ${relative(root, tsxRoot)}`);
    return { violations, errors, decay };
  }
  const tsxFiles = listSourceFiles(tsxRoot);
  if (tsxFiles.length === 0) {
    errors.push(
      `画面側の .ts/.tsx が 1 本も見つかりません（探索ゼロは赤）: ${relative(root, tsxRoot)}`,
    );
    return { violations, errors, decay };
  }

  const tsxDefs = new Set();
  const tsxRefs = [];
  for (const file of tsxFiles) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(root, file);
    for (const token of collectTsxDefinitions(source)) tsxDefs.add(token);
    for (const ref of collectTsxReferences(source)) tsxRefs.push({ ...ref, file: rel });
    for (const v of findTsxTripletViolations(source, triplets)) {
      violations.push({ kind: 'triplet の包み忘れ', file: rel, line: v.line, token: v.token });
    }
  }

  const known = new Set([...definitions.keys(), ...tsxDefs]);
  for (const ref of tsxRefs) {
    if (!known.has(ref.token) && !(ref.token in allowlist)) {
      violations.push({
        kind: '未定義トークン参照',
        file: ref.file,
        line: ref.line,
        token: ref.token,
      });
    }
  }

  // 許可名簿の腐り検知: ①の定義集合に「定義された」or 参照がゼロになったら赤（criteria 5）。
  // 画面側の inline style 注入は定義集合に入れない（--keyword-left 等の注入 3 件を
  // 「定義された」と誤判定しないため）。参照ゼロは CSS 参照 ∪ 画面側参照の両方で見る。
  const allRefs = [...cssRefs.map((r) => r.token), ...tsxRefs.map((r) => r.token)];
  for (const [name, entry] of Object.entries(allowlist)) {
    if (definitions.has(name)) {
      const repay = entry.repay ? `返済先 ${entry.repay} の定義が入った` : '定義が入った';
      decay.push({ token: name, reason: `${repay}。名簿から外してください` });
    } else if (!allRefs.includes(name)) {
      decay.push({ token: name, reason: 'どこからも参照されていない。名簿から外してください' });
    }
  }

  return { violations, errors, decay };
}

function main() {
  const { violations, errors, decay } = runChecks();
  let failed = false;
  for (const err of errors) {
    console.error(`[check-css-tokens] ${err}`);
    failed = true;
  }
  for (const v of violations) {
    console.error(`[check-css-tokens] ${v.file}:${v.line} ${v.kind}: var(${v.token})`);
    failed = true;
  }
  for (const d of decay) {
    console.error(`[check-css-tokens] 許可名簿 ${d.token}: ${d.reason}`);
    failed = true;
  }
  if (failed) {
    console.error(
      '[check-css-tokens] トークン誤用を検出しました。直すか、やむを得ない分は ALLOWLIST へ理由つきで載せてください',
    );
    process.exit(1);
  }
  console.log('[check-css-tokens] OK: globals.css と画面側のトークン誤用なし');
}

// 直接実行されたときだけ main() を走らせる（既存 check-*.mjs と同じ判定）。
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main();
}
