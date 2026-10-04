#!/usr/bin/env node
// cmn-0397: e2e の step が「シナリオ由来の素の引数」を置換（resolvePlaceholders）を通さないまま
// 通信へ渡していないかを検査する。
//
// 背景: E2E シナリオは {{key}} プレースホルダを送信前に実値へ置き換える規律だが、置き換えは
// step ごとに手書きで、書き忘れても誰も気づかない（今日の値がたまたま {{ }} を含まないため
// 動いているだけ）。後からその引数へ {{ }} 付きの値を渡した瞬間、`{{userId}}` という文字列の
// まま送信され、原因の分かりにくい失敗になる。人の注意ではなく検査で止める。
//
// 検出規則（cmn-0376 の設計で確定した形）:
//   1. e2e/steps/**/*.ts の Given/When/Then 登録から callback の引数名を集める
//      （第 1 引数は fixture の分割代入なので除外＝`({}, _url)` の形も含む）。
//   2. callback 本文の `{ data: ... }` リテラルの「値位置」に引数名が現れたら違反
//      （`: NAME` / 省略記法 `{ NAME }` / それより深い入れ子も見る。キー位置 `NAME:` は違反ではない）。
//   3. `.get|post|patch|put|delete(` の第 1 引数が引数名そのものなら違反。
//
// 検出できない範囲（設計で明示）: step 引数を別関数へ渡し、その関数の中で送信する経路
// （例: createAuthenticatedContext → support/auth.ts）。「入口で 1 度解決」を守れば渡る値は
// 解決済みになるため、関数越しの追跡は本検査の範囲外とする。support/ 配下も同様
// （step の引数という概念が無く、同じ規則を当てても意味が定まらない）。Playwright の
// `params:` / `form:` / `multipart:` 経由も現行 e2e/steps/** に該当ゼロのため見ない。
// さらに、ローカルエイリアス（const url = arg; としてから使う）、テンプレートリテラルによる
// 組み立て、function 形 callback（async function を渡す）は追跡しない。sync arrow callback は
// 検出対象（cmn-0397 から async 必須ゲートを外したため）。regex リテラルは字句マスクを崩す
// 構造だけ走査エラーへ倒し、妥当な regex は検出の外側（maskSource はブランクしない＝
// 除算誤認でも隠す量は同ライン内に閉じる）。
//
// fail-closed: 走査したファイル数・拾った step 数・集めた引数名の総数のいずれかが 0 なら、
// 違反 0 件でも失敗（探し方を間違えて 1 本も読んでいない状態が緑で素通るのを防ぐ。
// check-css-tokens.mjs の探索ゼロ判定と同型）。
//
// Node 標準モジュールのみで動く（依存インストール前に動かせる）＝既存の scripts/*.test.mjs と同方針。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');

const STEP_KEYWORDS = ['Given', 'When', 'Then'];
const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete', 'head', 'fetch'];

// ---------------------------------------------------------------------------
// 字句マスク: コメント・文字列・テンプレートリテラルの中身を空白へ置き換えた複製を作る。
// 以降の波括弧対応・正規表現探索はマスク済みテキスト上で行い、コメント内の `data:` や
// 文字列内の括弧に構造解析が引きずられないようにする（改行は保持＝行番号計算はそのまま）。
// テンプレートリテラルは ${ } の式ごとマスクする（送信の宛先・本文を識別子「そのもの」で
// 渡す形だけを違反とする規則のため、テンプレートによる組み立ては規則の外側）。
// ---------------------------------------------------------------------------
export function maskSource(source) {
  const out = source.split('');
  const blank = (from, to) => {
    for (let i = from; i < to; i++) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  };
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && source[j] !== c) {
        if (source[j] === '\\') j++;
        j++;
      }
      blank(i + 1, Math.min(j, n));
      i = Math.min(j, n) + 1;
      continue;
    }
    if (c === '`') {
      // テンプレートは ${ } 内の波括弧の対応を数えつつ、閉じバッククォートまで丸ごとマスクする
      let j = i + 1;
      let exprDepth = 0;
      while (j < n) {
        const t = source[j];
        if (t === '\\') {
          j += 2;
          continue;
        }
        if (exprDepth === 0 && t === '`') break;
        if (exprDepth === 0 && t === '$' && source[j + 1] === '{') {
          exprDepth = 1;
          j += 2;
          continue;
        }
        if (exprDepth > 0) {
          if (t === '{') exprDepth++;
          else if (t === '}') exprDepth--;
        }
        j++;
      }
      blank(i + 1, Math.min(j, n));
      i = Math.min(j, n) + 1;
      continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * 正規表現リテラルを走査し、字句マスクを壊す regex（引用符・バッククォート・非対応括弧を含む）を
 * 検出したらエラーを返す（cmn-0397・fail-closed）。妥当な regex はブランクせずスキップする。
 *
 * - regex の終端は「エスケープ（\/）・文字クラス（[...]）を考慮した次の /」で判定する。
 * - regex 内の引用符・バッククォート・対応の取れない括弧は、この字句マスクが持つ
 *   文字列/括弧の対応処理を崩す（例: `/['"]/` は maskSource を文字列開始と誤認させ、
 *   以降のコードを巻き込んで空白化する）。検出したら走査エラーへ倒す＝緑で素通ししない。
 * - 対応の取れた括弧（`/[?&]secret=([A-Z2-7]+)/i` 等）は構造解析を崩さないため許容する。
 * - 戻り値: { error: string | null }（error はファイル走査を打ち切るため、1 ファイル 1 件）
 */
export function findScanError(source) {
  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    // コメント・文字列・テンプレートは maskSource と同じ字句規則でスキップする
    // （中身の / を regex と誤認しないため）。
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? n : end;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && source[j] !== c) {
        if (source[j] === '\\') j++;
        j++;
      }
      i = Math.min(j, n) + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let exprDepth = 0;
      while (j < n) {
        const t = source[j];
        if (t === '\\') {
          j += 2;
          continue;
        }
        if (exprDepth === 0 && t === '`') break;
        if (exprDepth === 0 && t === '$' && source[j + 1] === '{') {
          exprDepth = 1;
          j += 2;
          continue;
        }
        if (exprDepth > 0) {
          if (t === '{') exprDepth++;
          else if (t === '}') exprDepth--;
        }
        j++;
      }
      i = Math.min(j, n) + 1;
      continue;
    }
    // 正規表現リテラルの開始候補: / の後に同ライン内で閉じの / が見つかる場合のみ regex とみなす
    // （除算 a / b は閉じの / が無いため regex 扱いしない。`a / b / c` の連続除算は / b / を
    //   regex と誤認しうるが、中身に引用符・非対応括弧が無ければエラーにならない＝実害なし）。
    if (c === '/') {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        const t = source[j];
        if (t === '\\') {
          j += 2;
          continue;
        }
        if (inClass) {
          if (t === ']') inClass = false;
        } else if (t === '[') {
          inClass = true;
        } else if (t === '/' || t === '\n') {
          if (t === '/') closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        const body = source.slice(i + 1, j);
        // マスクを崩すかどうかの判定は文字クラスを区別しない（maskSource は文字クラスを知らず、
        // 引用符・バッククォートを「文字列/テンプレート開始」と誤認して以降を巻き込み空白化するため、
        // `['"]` の引用符も検出対象）。
        //
        // 引用符・括弧のいずれもエスケープを考慮しない＝生文字基準で判定する。maskSource は regex
        // 文脈を知らず、`\'`・`\(`・`\}` 等のエスケープ文字もそのままマスク済みテキストへ残すため、
        // 消費側（findMatching / splitTopLevel）が実際に数える生文字と会計を合わせる必要がある。
        // 引用符（エスケープされた引用符含む）は文字列開始と誤認されてマスクを崩すので常に NG。
        // 括弧は () / {} / [] のそれぞれ対応が取れていれば OK（`\(...\)` のペアはマスク上でも相殺され
        // 実害なし）。`\(` 単独・`\}` 単独は対応が取れず構造解析を崩すので NG。
        let parenDepth = 0;
        let braceDepth = 0;
        let bracketDepth = 0;
        for (const ch of body) {
          if (ch === "'" || ch === '"' || ch === '`') {
            return {
              error: `正規表現リテラルが字句マスクを崩します（引用符・バッククォートを含む: ${body}）`,
            };
          }
          if (ch === '(') parenDepth++;
          else if (ch === ')') parenDepth--;
          else if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
          else if (ch === '[') bracketDepth++;
          else if (ch === ']') bracketDepth--;
          if (parenDepth < 0 || braceDepth < 0 || bracketDepth < 0) {
            return {
              error: `正規表現リテラルが字句マスクを崩します（対応の取れない括弧を含む: ${body}）`,
            };
          }
        }
        if (parenDepth !== 0 || braceDepth !== 0 || bracketDepth !== 0) {
          return {
            error: `正規表現リテラルが字句マスクを崩します（対応の取れない括弧を含む: ${body}）`,
          };
        }
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return { error: null };
}

/** masked[openIdx] が open 文字である前提で、対応する close 文字の index を返す（見つからなければ -1） */
export function findMatching(masked, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === open) depth++;
    else if (masked[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * [from, to) の範囲で「トップレベル（括弧の対応の深さ 0）の =>」を探し、その index を返す
 * （cmn-0397・sync callback 検出用）。見つからなければ -1。callOpen の対応を数えながら進める。
 */
export function findTopLevelArrow(masked, from, to) {
  let depth = 0;
  for (let i = from; i < to; i++) {
    const c = masked[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (depth === 0 && c === '=' && masked[i + 1] === '>') return i;
  }
  return -1;
}

/**
 * closeIdx にある ')' の対応する '(' を後方へ辿って返す（cmn-0397・sync callback の params 括弧）。
 * 見つからなければ -1。
 */
export function matchingBackwardParen(masked, closeIdx) {
  let depth = 0;
  for (let i = closeIdx; i >= 0; i--) {
    const c = masked[i];
    if (c === ')') depth++;
    else if (c === '(') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** index → 1 始まりの行番号 */
function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * 括弧・波括弧・角括弧の深さ 0 で text を区切り文字 sep で分割する（マスク済みテキスト用）。
 * 各断片の text 内開始位置も返す（違反位置から行番号を出すため）。
 */
function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      parts.push({ text: text.slice(start, i), start });
      start = i + 1;
    }
  }
  parts.push({ text: text.slice(start), start });
  return parts;
}

// ---------------------------------------------------------------------------
// step 収集: Given/When/Then 登録から callback の引数名と本文範囲を集める。
// 登録は複数行に折り返される（org-change.steps.ts の実例）ため、1 行前提で読まない。
// ---------------------------------------------------------------------------
export function collectSteps(masked) {
  const steps = [];
  const re = new RegExp(`\\b(${STEP_KEYWORDS.join('|')})\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(masked)) !== null) {
    const callOpen = m.index + m[0].length - 1;
    const callClose = findMatching(masked, callOpen, '(', ')');
    if (callClose === -1) continue;

    // 呼び出し引数の中から callback（async (...) => { ... }）を探す
    const asyncMatch = /\basync\b/.exec(masked.slice(callOpen + 1, callClose));
    let paramsOpen = -1;
    if (asyncMatch) {
      const asyncIdx = callOpen + 1 + asyncMatch.index;
      const candidate = masked.indexOf('(', asyncIdx);
      if (candidate !== -1 && candidate < callClose) paramsOpen = candidate;
    }
    if (paramsOpen === -1) {
      // cmn-0397: async が無い callback（sync arrow）も検出対象にする。Given/When/Then の
      // 第 2 引数以降が「最初のトップレベル =>」を持つ callback かどうかを、
      // 括弧の対応を見ながらトップレベルの => を探し、その直前の params 括弧へ遡る。
      const firstTopArrow = findTopLevelArrow(masked, callOpen + 1, callClose);
      if (firstTopArrow === -1) continue;
      const paramsOpenCandidate = matchingBackwardParen(masked, firstTopArrow);
      if (paramsOpenCandidate === -1) continue;
      paramsOpen = paramsOpenCandidate;
    }
    const paramsClose = findMatching(masked, paramsOpen, '(', ')');
    if (paramsClose === -1) continue;

    // 第 1 引数（fixture の分割代入。`({}, _url)` の形も含む）を除いた引数名を集める
    const paramsText = masked.slice(paramsOpen + 1, paramsClose);
    const argNames = splitTopLevel(paramsText, ',')
      .slice(1)
      .map((p) => {
        const id = /^\s*(\w+)/.exec(p.text);
        return id ? id[1] : null;
      })
      .filter(Boolean);

    // `=>` の後の本文を切り出す（`{ ... }` ブロック形。波括弧対応で複数行を丸ごと取る）
    const arrowIdx = masked.indexOf('=>', paramsClose);
    if (arrowIdx === -1 || arrowIdx > callClose) continue;
    let bodyStart = arrowIdx + 2;
    while (bodyStart < callClose && /\s/.test(masked[bodyStart])) bodyStart++;
    let bodyEnd;
    if (masked[bodyStart] === '{') {
      bodyEnd = findMatching(masked, bodyStart, '{', '}');
      if (bodyEnd === -1) bodyEnd = callClose;
    } else {
      bodyEnd = callClose; // 式形 arrow（現行 steps に無いが防御的に本文扱いする）
    }

    steps.push({ keyword: m[1], regIndex: m.index, argNames, bodyStart, bodyEnd });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// 違反検出
// ---------------------------------------------------------------------------

/**
 * オブジェクトリテラルの中身（外側の { } を除いた文字列）を値位置だけ再帰的に見る。
 * - 省略記法 `{ NAME }` → NAME が引数名なら違反
 * - `key: NAME` → 値位置の NAME が引数名なら違反（キー位置 `NAME:` は見ない）
 * - `key: { ... }` → 入れ子を再帰（省略記法 1 段もそれより深い入れ子も同じ規則で見る）
 * - `...NAME` → スプレッドで素の引数を丸ごと展開する形も違反
 * report(argName, innerIndex, form): innerIndex は maskedInner 内の位置
 */
function inspectObjectLiteral(maskedInner, argNames, report) {
  for (const part of splitTopLevel(maskedInner, ',')) {
    const trimmed = part.text.trim();
    if (!trimmed) continue;

    const spread = /^\s*\.\.\.\s*(\w+)\s*$/.exec(part.text);
    if (spread) {
      if (argNames.includes(spread[1])) report(spread[1], part.start, 'spread');
      continue;
    }

    const colonSplit = splitTopLevel(part.text, ':');
    if (colonSplit.length === 1) {
      // 省略記法（{ NAME }）
      const short = /^\s*(\w+)\s*$/.exec(part.text);
      if (short && argNames.includes(short[1])) report(short[1], part.start, 'shorthand');
      continue;
    }

    // `key: value` — 値位置だけを見る（キー位置は違反ではない）
    const value = colonSplit[1];
    const valueAbs = part.start + value.start;
    // `a: b: c` は TS 型注釈内でしか現れない。2 個目以降の `:` は値の一部として無視する
    const valueText = part.text.slice(value.start);
    const valueTrimmed = valueText.trim();
    if (valueTrimmed.startsWith('{')) {
      const braceIdx = valueText.indexOf('{');
      const closeIdx = findMatching(valueText, braceIdx, '{', '}');
      if (closeIdx !== -1) {
        const inner = valueText.slice(braceIdx + 1, closeIdx);
        inspectObjectLiteral(inner, argNames, (argName, innerIndex, form) =>
          report(argName, valueAbs + braceIdx + 1 + innerIndex, form),
        );
      }
      continue;
    }
    const ident = /^\s*(\w+)\s*$/.exec(valueText);
    if (ident && argNames.includes(ident[1])) report(ident[1], valueAbs, 'value');
  }
}

/** 1 step の本文（masked 全文と範囲）から違反を集める。index は masked 全文基準 */
export function findStepViolations(masked, step) {
  const violations = [];
  const body = masked.slice(step.bodyStart, step.bodyEnd + 1);
  const push = (argName, bodyIndex, kind, form) =>
    violations.push({ argName, absIndex: step.bodyStart + bodyIndex, kind, form });

  // 規則 2: `{ data: ... }` リテラルの値位置
  const dataRe = /\bdata\s*:/g;
  let dm;
  while ((dm = dataRe.exec(body)) !== null) {
    let vi = dm.index + dm[0].length;
    while (vi < body.length && /\s/.test(body[vi])) vi++;
    if (body[vi] === '{') {
      const close = findMatching(body, vi, '{', '}');
      if (close === -1) continue;
      inspectObjectLiteral(body.slice(vi + 1, close), step.argNames, (argName, innerIndex, form) =>
        push(argName, vi + 1 + innerIndex, 'data-literal', form),
      );
    } else {
      // `data: NAME`（オブジェクトを組み立てず素の引数を丸ごと渡す形）
      const ident = /^(\w+)\b/.exec(body.slice(vi));
      if (ident && step.argNames.includes(ident[1])) push(ident[1], vi, 'data-literal', 'value');
    }
  }

  // 規則 3: `.get|post|patch|put|delete(` の第 1 引数が引数名そのもの
  const httpRe = new RegExp(`\\.(${HTTP_METHODS.join('|')})\\s*\\(`, 'g');
  let hm;
  while ((hm = httpRe.exec(body)) !== null) {
    const openIdx = hm.index + hm[0].length - 1;
    const firstArg = /^\s*(\w+)\s*[,)]/.exec(body.slice(openIdx + 1));
    if (firstArg && step.argNames.includes(firstArg[1])) {
      push(firstArg[1], openIdx + 1, `http-${hm[1]}`, 'first-arg');
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 走査本体
// ---------------------------------------------------------------------------

function walkTsFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

/**
 * check:repo-invariants（run-script-tests.mjs 経由の単体テスト）から呼ばれるメイン判定。
 * 戻り値: { violations, errors, stats }
 *   - violations: 検出規則 2 / 3 に当たった箇所（file / line / stepLine / argName / kind / form）
 *   - errors: fail-closed（探索ゼロ）の問題。違反 0 件でもこれが空でなければ赤
 *   - stats: { files, steps, argNames } 走査量の実測
 */
export function runChecks({ root = REPO_ROOT } = {}) {
  const stepsDir = join(root, 'e2e', 'steps');
  const files = walkTsFiles(stepsDir);
  const violations = [];
  const errors = [];
  let stepCount = 0;
  let argNameCount = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // cmn-0397: regex が字句マスクを崩す構造なら、このファイルの走査結果は信用できないため
    // 走査エラーへ倒す（fail-closed）。このファイルの step は集計しない（打ち切る）。
    const { error: scanError } = findScanError(source);
    if (scanError) {
      errors.push(`${relative(root, file).replace(/\\/g, '/')}: ${scanError}`);
      continue;
    }
    const masked = maskSource(source);
    const steps = collectSteps(masked);
    stepCount += steps.length;
    for (const step of steps) {
      argNameCount += step.argNames.length;
      for (const v of findStepViolations(masked, step)) {
        violations.push({
          file: relative(root, file).replace(/\\/g, '/'),
          line: lineAt(source, v.absIndex),
          stepLine: lineAt(source, step.regIndex),
          argName: v.argName,
          kind: v.kind,
          form: v.form,
        });
      }
    }
  }

  // fail-closed: 探索ゼロは違反 0 件でも赤（check-css-tokens.mjs の同型判定）
  if (files.length === 0) {
    errors.push(`e2e/steps/ に .ts が 1 本も見つかりません（探索ゼロは赤・dir=${stepsDir}）`);
  } else if (stepCount === 0) {
    errors.push(
      'e2e/steps/ から Given/When/Then の step 登録を 1 件も拾えませんでした（探索ゼロは赤）',
    );
  } else if (argNameCount === 0) {
    errors.push('step callback の引数名を 1 つも集められませんでした（探索ゼロは赤）');
  }

  return {
    violations,
    errors,
    stats: { files: files.length, steps: stepCount, argNames: argNameCount },
  };
}

export function run({ root = REPO_ROOT } = {}) {
  const { violations, errors, stats } = runChecks({ root });
  for (const e of errors) console.error(`  - ${e}`);
  for (const v of violations) {
    console.error(
      `  - ${v.file}:${v.line} step(:${v.stepLine}) の引数 ${v.argName} が置換を経ずに通信へ渡っています（${v.kind}/${v.form}）`,
    );
  }
  if (errors.length > 0 || violations.length > 0) {
    throw new Error(
      `e2e step の素の引数が無解決で通信へ渡っています（違反 ${violations.length} 件 / 走査エラー ${errors.length} 件）。` +
        'step の入口で resolvePlaceholders を 1 度通し、以後は解決済みの値を使ってください',
    );
  }
  console.log(
    `OK: e2e/steps ${stats.files} ファイル / ${stats.steps} step / 引数 ${stats.argNames} 個を走査し、無解決の素通しゼロ`,
  );
}

// CLI エントリ（テスト時は import 経路なので副作用を避けるためガードする）
// --root=<dir> で走査対象リポジトリを差し替えられる（cmn-0414: run() の throw/OK を fixture で検証するためのテスト用）。
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const rootArg = process.argv.find((a) => a.startsWith('--root='));
  try {
    run({ root: rootArg ? rootArg.slice('--root='.length) : REPO_ROOT });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
