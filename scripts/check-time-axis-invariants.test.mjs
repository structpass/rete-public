// cmn-0262: 時間軸まわりの「文章でしか守っていない約束」を機械の検査へ昇格する。
//
// 対象は 3 つ。どれも過去に一度ずつ破られている（＝コメントを読む前提が実測で成立していない）:
//   1. 同名 formatDateTime の重複定義（fil-0111 の CI 落ちの原因構造）。cmn-0253 で
//      features/files/lib/format.ts の JST 固定実装を撤去したが、ガードは当該モジュールの
//      export だけを見る spec で、他所での新規定義・再導入は検出できなかった。
//   2. 同名 formatDate の重複定義（cmn-0278）。dashboard / members / invites の 3 画面に
//      private な同名・別実装が並存していた（cmn-0262 の formatDateTime と同じ取り違え構造）。
//      @/lib/utils へ一本化し、このファイルで再増殖を機械検出する。
//   3. CI workflow への TZ 追加。test.yml のコメントで禁止しているだけで、cmn-0231（b2c1bc3）で
//      実際に TZ: Asia/Tokyo が入った（cmn-0254 で撤去）。
//
// このファイルは check:repo-invariants（install 前・Node 標準モジュールのみ）から走る。
// YAML パーサは使わない（依存ゼロを維持する。狙いは構文解析でなく「入ったら気付く」）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const FRONTEND_SRC = join(REPO_ROOT, 'packages', 'frontend', 'src');
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');

/** 日時整形の唯一の置き場（ここだけが formatDateTime を定義してよい）。 */
const CANONICAL_FILE = join('packages', 'frontend', 'src', 'lib', 'utils.ts');

test('CANONICAL_FILE（lib/utils.ts）が実在する（探索が壊れて 0 件にならない fail-closed）', () => {
  const full = join(REPO_ROOT, CANONICAL_FILE);
  assert.ok(
    existsSync(full),
    `${CANONICAL_FILE} が見つかりません。formatDateTime の正本置き場が移動したか削除されています。` +
      'CANONICAL_FILE 定数と実体の両方を新しい置き場で更新してください。',
  );
});

const SOURCE_EXT = /\.(ts|tsx)$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// ── 文字列退避・復元の共通ヘルパ（cmn-0338: 3・4 の一本化） ─────────────────────────

/** 退避対象: ダブルクォート・シングルクォート・テンプレートリテラル（シングルクォート主体の TS 対応で cmn-0338 追加）。 */
const QUOTED_STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/**
 * 文字列リテラルを一時退避し \0Q<n>\0 へ置換する（コメント除去の前に必ず通す）。
 * リテラル内の /* や # をコメント開始と誤認しないための共通処理（cmn-0275 LOW 5/6）。
 */
function protectQuoted(source) {
  const quoted = [];
  const preserved = source.replace(QUOTED_STRING, (m) => {
    quoted.push(m);
    return `\0Q${quoted.length - 1}\0`;
  });
  return { quoted, preserved };
}

/**
 * 退避した文字列リテラルを元へ戻す。置換文字列を関数形で渡すことで、退避文字列に
 * $& / $` / $' などの置換特殊パターンが含まれても復元が破損しない（cmn-0338 項目 4）。
 */
function restoreQuoted(code, quoted) {
  let out = code;
  quoted.forEach((s, i) => {
    out = out.replace(`\0Q${i}\0`, () => s);
  });
  return out;
}

/**
 * 行単位のコメント除去（YAML の # 用）。リテラル内の # を保護した上で # 以降を落とし、
 * リテラルを復元する。workflow 検査（行単位）と stripComments（ファイル単位）の両方で使う。
 */
function stripLineComment(line) {
  const { quoted, preserved } = protectQuoted(line);
  return restoreQuoted(preserved.replace(/#.*$/, ''), quoted);
}

/**
 * コメントを落とす（TS/TSX）。判定前に必ず通す。
 * 「撤去した private 実装」を旧シグネチャ付きで書き残すコメントが各所にあり（dashboard-view /
 * members-screen / files/lib/format.ts）、素の走査だと解説文へ当たって検査が偽陽性で赤くなる。
 * 文字列リテラル内の /* や # をコメント開始と誤認しないよう、クォート文字列を
 * 一時退避してからコメントを落とし、戻す（cmn-0275 LOW 5/6）。
 */
function stripComments(source) {
  const { quoted, preserved } = protectQuoted(source);
  const out = preserved
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
  return restoreQuoted(out, quoted);
}

// ── 定義検出の正規表現（module scope の単一定義・cmn-0338 項目 2 で一本化） ────────────

/**
 * formatDateTime 定義の検出（関数宣言・const への関数代入・メソッド定義・オブジェクトプロパティ形）。
 * formatDateTimeWithSeconds のような別名は対象外（語境界で切る）。
 * (?:[^()]|\([^)]*\))* は括弧を含む引数（opts?: { tz?: string } 等）も拾いつつ、改行を跨がない。
 * 戻り値の型部 (?::[^\r\n]*)? は行内限定（cmn-0338 項目 1）: 型宣言のシグネチャ＋後続の別関数
 * （interface 内シグネチャ改行 + function foo() { 等）を定義として誤検出しない。
 */
const DEFINITION =
  /(?:function\s+formatDateTime\s*[(<]|(?:const|let|var)\s+formatDateTime\s*[:=]|^\s*(?:static\s+|public\s+|private\s+|protected\s+|async\s+)*formatDateTime\s*\((?:[^()]|\([^)]*\))*\)\s*(?::[^\r\n]*)?\{|[{,]\s*formatDateTime\s*:)/m;

/** formatDate 版（cmn-0278）。formatDateTime と同型の検出パターン。 */
const DATE_DEFINITION =
  /(?:function\s+formatDate\s*[(<]|(?:const|let|var)\s+formatDate\s*[:=]|^\s*(?:static\s+|public\s+|private\s+|protected\s+|async\s+)*formatDate\s*\((?:[^()]|\([^)]*\))*\)\s*(?::[^\r\n]*)?\{|[{,]\s*formatDate\s*:)/m;

test('frontend src に formatDateTime の定義が lib/utils.ts 以外へ増えていない', () => {
  const files = walk(FRONTEND_SRC);

  // 探索が壊れて 0 件になったら緑にしない（fail-closed）。
  assert.ok(
    files.length > 0,
    `${FRONTEND_SRC} に .ts/.tsx が 1 本も見つかりません（探索が壊れています）`,
  );

  // 関数宣言・const への関数代入・クラス/オブジェクトのメソッド定義・オブジェクトプロパティ形まで拾う。
  // formatDateTimeWithSeconds のような別名は対象外（語境界で切る）。
  // (?:[^()]|\([^)]*\))* は括弧を含む引数（opts?: { tz?: string } 等）も拾いつつ、改行を跨がない
  // （code-reviewer HIGH: 行頭の formatDateTime(iso); 呼び出し＋後続の function foo() { を誤検出する回帰を封止）。
  // [{,]\s*formatDateTime\s*: はオブジェクトリテラル内のキー定義（{ formatDateTime: と , formatDateTime: の両方）を
  // 拾う（cmn-0275 MEDIUM 5）。正規表現の実体は module scope の DEFINITION（cmn-0338 で一本化）。

  const offenders = [];
  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    if (rel.split(sep).join('/') === CANONICAL_FILE.split(sep).join('/')) continue;
    const source = stripComments(readFileSync(file, 'utf8'));
    if (DEFINITION.test(source)) offenders.push(rel);
  }

  assert.deepEqual(
    offenders,
    [],
    '同名 formatDateTime が lib/utils.ts の外で定義されています＝時間軸の取り違えの温床（fil-0111 の原因構造）。' +
      '\n該当: ' +
      offenders.join(', ') +
      '\n日時整形は @/lib/utils の formatDateTime / formatDateTimeWithSeconds へ寄せてください。' +
      'JST 固定など別の時間軸が要る場合も画面側へ private 実装を置かず、lib/utils.ts へ formatDateTimeJst のような' +
      '明示名で追加します（同名の再導入は禁止）。',
  );
});

test('frontend src に formatDate の定義が lib/utils.ts 以外へ増えていない (cmn-0278)', () => {
  const files = walk(FRONTEND_SRC);

  // 探索が壊れて 0 件になったら緑にしない（fail-closed）。
  assert.ok(
    files.length > 0,
    `${FRONTEND_SRC} に .ts/.tsx が 1 本も見つかりません（探索が壊れています）`,
  );

  // formatDateTime と同じパターン family。関数宣言・const への関数代入・メソッド定義・オブジェクト
  // プロパティ形まで拾う。formatDateTimeWithSeconds のような別名は対象外（語境界で切る）。
  // 括弧を含む引数（opts?: { tz?: string } 等）も拾いつつ、改行は跨がない（code-reviewer HIGH の回帰封止）。
  // オブジェクトリテラル内キー（{ formatDate: } / , formatDate: ）も拾う。
  // 正規表現の実体は module scope の DATE_DEFINITION（cmn-0338 で一本化）。

  const offenders = [];
  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    if (rel.split(sep).join('/') === CANONICAL_FILE.split(sep).join('/')) continue;
    const source = stripComments(readFileSync(file, 'utf8'));
    if (DATE_DEFINITION.test(source)) offenders.push(rel);
  }

  assert.deepEqual(
    offenders,
    [],
    '同名 formatDate が lib/utils.ts の外で定義されています＝日付整形の取り違えの温床（cmn-0278）。' +
      '\n該当: ' +
      offenders.join(', ') +
      '\n日付整形は @/lib/utils の formatDate へ寄せてください。' +
      'JST 固定など別の時間軸が要る場合も画面側へ private 実装を置かず、lib/utils.ts へ明示名で追加します' +
      '（同名の再導入は禁止）。',
  );
});

test('CI workflow に TZ が設定されていない', () => {
  const files = readdirSync(WORKFLOWS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  assert.ok(
    files.length > 0,
    `${WORKFLOWS_DIR} に workflow の yml が 1 本も見つかりません（探索が壊れています）`,
  );

  const offenders = [];
  for (const name of files) {
    // CRLF で分ける（改行を \n だけで切ると行末に \r が残り、JS の `.` は \r に当たらないため
    // 行末コメントの除去 `#.*$` が丸ごと空振りする＝解説コメントを拾って偽陽性になる）。
    const lines = readFileSync(join(WORKFLOWS_DIR, name), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      // 文字列リテラル内の # をコメント開始と誤認しないよう、クォート文字列を一時退避してから
      // # コメントを落とし、戻す（cmn-0275 LOW 5 / cmn-0338 で stripLineComment へ一本化）。
      const code = stripLineComment(line);
      if (!code.trim()) return;
      // 見るのは (a) env / with マップのキー `TZ:`（引用符付き・flow map の `{TZ:` を含む）と
      // (b) シェル代入 `TZ=`（`echo "TZ=..." >> $GITHUB_ENV` のような引用符内も含む）の双方。
      // 素朴に (^|\s) だけで区切ると "TZ=... / 'TZ': / {TZ: が丸ごと素通りする（cmn-0262 レビュー実測）。
      // flow map の `,` 区切り（`env: {FOO: 1, TZ: x}`）も拾う（cmn-0275 LOW 4）。
      if (/(?:^|[\s;,{"'])TZ["']?\s*[:=]/.test(code)) {
        offenders.push(`${name}:${i + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'CI workflow に TZ が設定されています（cmn-0254 で撤去した設定の再追加）。' +
      '\n該当: ' +
      offenders.join(' / ') +
      '\nrunner の既定（UTC）のままにしてください。JST へ揃えると backend / shared のテストで' +
      '「閲覧者ローカル表示」と「Asia/Tokyo 固定表示」が一致し、取り違えを検出できなくなります' +
      '（開発統括判断 2026-07-29 / fil-0111）。日時テストが CI だけ赤くなる時は、workflow でなく' +
      'テスト側の時間軸を直します（理由の詳細は .github/workflows/test.yml 冒頭のコメント）。',
  );
});

// ── 正規表現の単体テスト（cmn-0275: 取りこぼし 4 形の検出を固定 / cmn-0278: formatDate 追補） ──
// 正規表現の実体は module scope の DEFINITION / DATE_DEFINITION（cmn-0338 で一本化・逐語コピーなし）。

test('DEFINITION: オブジェクトプロパティ形（{ formatDateTime: (iso) => ... }）を検出する', () => {
  const cases = [
    'const helpers = { formatDateTime: (iso) => new Date(iso) }',
    'const fns = {\n  formatDateTime: (iso: string) => {\n    return new Date(iso);\n  }\n}',
    'const obj = {\n  foo: 1,\n  formatDateTime: (iso) => new Date(iso),\n}',
  ];
  for (const c of cases) {
    assert.ok(DEFINITION.test(c), `検出できませんでした: ${c}`);
  }
});

test('DEFINITION: 引数に括弧を含むメソッド形を検出する', () => {
  // メソッド定義の引数部にオブジェクト型（{...}）を含んでも (?:[^()]|\([^)]*\))* で跨げる
  const cases = [
    '  formatDateTime(iso: string, opts?: { tz?: string }): string {',
    '  static formatDateTime(iso: string, opts?: { tz?: string }): string {',
  ];
  for (const c of cases) {
    assert.ok(DEFINITION.test(c), `検出できませんでした: ${c}`);
  }
});

test('DEFINITION: 行頭呼び出し＋後続の関数定義を誤検出しない（改行跨ぎの回帰・code-reviewer HIGH）', () => {
  // [\s\S]*? は括弧跨ぎで遡行し「formatDateTime(iso); 呼び出し」を定義として誤検出した（新規導入の退行）。
  // 括弧対応版は引数の閉じ括弧で固定され、直後に { が要るため呼び出し＋別関数定義では失敗する。
  const nonCases = [
    'formatDateTime(iso, "local");\nfunction foo() {',
    'formatDateTime(iso);\nconst bar = () => 1;',
    'formatDateTime(iso) => {\n  return iso;\n}',
  ];
  for (const c of nonCases) {
    assert.ok(!DEFINITION.test(c), `誤検出: ${c}`);
  }
});

test('DEFINITION: 無関係な型宣言シグネチャ＋後続関数を誤検出しない（cmn-0338 項目 1・行内限定）', () => {
  // 戻り値の型部が [\s\S]*? だと改行を跨いで「interface の formatDateTime シグネチャ＋後続の
  // 別 function」の組み合わせを定義として誤検出した（プローブで再現）。行内限定 (?::[^\r\n]*)?
  // へ差し替え、型宣言シグネチャだけでは { に到達しないことを固定する。
  const nonCases = [
    'interface Fmt {\n  formatDateTime(iso: string): string;\n}\nfunction foo() {',
    'type Fmt = {\n  formatDateTime(iso: string): string;\n};\nexport const bar = () => 1;',
  ];
  for (const c of nonCases) {
    assert.ok(!DEFINITION.test(c), `誤検出: ${c}`);
  }
  // 正例は従来どおり検出される（関数定義の戻り値型は行内に収まる）。
  assert.ok(
    DEFINITION.test('function formatDateTime(iso: string): string {'),
    '正例が検出できない',
  );
});

test('DEFINITION: 既存の検出パターンが壊れていない', () => {
  const cases = [
    'function formatDateTime(iso: string): string {',
    'const formatDateTime = (iso: string) => {',
    'let formatDateTime: (iso: string) => string',
    'const formatDateTime: Formatter = (iso) => {',
  ];
  for (const c of cases) {
    assert.ok(DEFINITION.test(c), `既存パターンが検出できません: ${c}`);
  }
});

test('DATE_DEFINITION: オブジェクトプロパティ形（{ formatDate: (iso) => ... }）を検出する', () => {
  const cases = [
    'const helpers = { formatDate: (iso) => new Date(iso) }',
    'const fns = {\n  formatDate: (iso: string) => {\n    return new Date(iso);\n  }\n}',
    'const obj = {\n  foo: 1,\n  formatDate: (iso) => new Date(iso),\n}',
  ];
  for (const c of cases) {
    assert.ok(DATE_DEFINITION.test(c), `検出できませんでした: ${c}`);
  }
});

test('DATE_DEFINITION: 引数に括弧を含むメソッド形を検出する', () => {
  const cases = [
    '  formatDate(iso: string, opts?: { tz?: string }): string {',
    '  static formatDate(iso: string, opts?: { tz?: string }): string {',
  ];
  for (const c of cases) {
    assert.ok(DATE_DEFINITION.test(c), `検出できませんでした: ${c}`);
  }
});

test('DATE_DEFINITION: 行頭呼び出し＋後続の関数定義を誤検出しない（改行跨ぎの回帰・code-reviewer HIGH）', () => {
  const nonCases = ['formatDate(iso);\nfunction foo() {'];
  for (const c of nonCases) {
    assert.ok(!DATE_DEFINITION.test(c), `誤検出: ${c}`);
  }
});

test('DATE_DEFINITION: 無関係な型宣言シグネチャ＋後続関数を誤検出しない（cmn-0338 項目 1・行内限定）', () => {
  const nonCases = [
    'interface Fmt {\n  formatDate(iso: string): string;\n}\nfunction foo() {',
    'type Fmt = {\n  formatDate(iso: string): string;\n};\nexport const bar = () => 1;',
  ];
  for (const c of nonCases) {
    assert.ok(!DATE_DEFINITION.test(c), `誤検出: ${c}`);
  }
  assert.ok(
    DATE_DEFINITION.test('function formatDate(iso: string): string {'),
    '正例が検出できない',
  );
});

test('DATE_DEFINITION: 既存の検出パターンが壊れていない', () => {
  const cases = [
    'function formatDate(iso: string): string {',
    'const formatDate = (iso: string) => {',
    'let formatDate: (iso: string) => string',
    'const formatDate: Formatter = (iso) => {',
  ];
  for (const c of cases) {
    assert.ok(DATE_DEFINITION.test(c), `既存パターンが検出できません: ${c}`);
  }
});

test('DATE_DEFINITION: formatDateTime 等の別名には誤反応しない（語境界）', () => {
  // 同一語境界で切るため、formatDateTime / formatDateJst / formatDateWithSeconds 等は
  // formatDate とは別物として対象外。
  const nonCases = [
    'function formatDateTime(iso: string): string {',
    'const formatDateJst = (iso: string) => iso;',
    'export const formatDateWithSeconds = (date: string | null | undefined) => "";',
  ];
  for (const c of nonCases) {
    assert.ok(!DATE_DEFINITION.test(c), `誤検出: ${c}`);
  }
});

const TZ_REGEX = /(?:^|[\s;,{"'])TZ["']?\s*[:=]/;

test('TZ: flow map のカンマ区切り（{FOO: 1, TZ: x}）を検出する', () => {
  assert.ok(TZ_REGEX.test('env: {FOO: 1, TZ: Asia/Tokyo}'));
  assert.ok(TZ_REGEX.test('with: {key: val, "TZ": "UTC"}'));
});

test('TZ: 既存の検出パターンが壊れていない', () => {
  assert.ok(TZ_REGEX.test('TZ: Asia/Tokyo'));
  assert.ok(TZ_REGEX.test('  TZ=UTC'));
  assert.ok(TZ_REGEX.test('{"TZ":"Asia/Tokyo"}'));
  assert.ok(TZ_REGEX.test("'TZ': 'UTC'"));
  assert.ok(TZ_REGEX.test(';TZ=foo'));
});

test('TZ: コメント除去（引用符内の # を保護）', () => {
  const line = 'run: echo "#deploy TZ=Asia/Tokyo" >> $GITHUB_ENV';
  const code = stripLineComment(line);
  assert.ok(TZ_REGEX.test(code), '引用符内の # の後ろにある TZ がコメント除去で失われました');
});

test('TZ: 本物のコメント行内の TZ は検出しない（# 行頭コメントを除外）', () => {
  // 行全体がコメントの場合は検出しない
  const line = '# TZ: UTC is not allowed — this is a comment';
  const code = stripLineComment(line);
  assert.ok(!TZ_REGEX.test(code), '行頭コメント (#) 内の TZ を誤検出しています');
});

test('TZ: コード本体の TZ 設定はコメントがあっても検出する', () => {
  // コードの一部として TZ が書かれ、行末にコメントがあるケースは検出する（実体はコード）
  const line = '  TZ: UTC  # 補足コメント';
  const code = stripLineComment(line);
  assert.ok(TZ_REGEX.test(code), 'コード本体の TZ 設定は検出すべきです');
});

test('stripComments: 文字列リテラル内の /* を保護する', () => {
  const source = 'const url = "https://example.com/*/api";\n// real comment\nconst x = 1;';
  const out = stripComments(source);
  assert.ok(
    out.includes('"https://example.com/*/api"'),
    '文字列内の /* が保護されず URL が破損しました',
  );
  assert.ok(!out.includes('real comment'), '// コメント行が除去されていません');
});

test('QUOTED_STRING: シングルクォート・テンプレートリテラルも退避する（cmn-0338 項目 3）', () => {
  // rete の TS はシングルクォート主体（prettier 設定）なので、`const x = '/*'` の文字列で
  // コメント除去が壊れないこと（ダブルクォート限定だと '/*' がコメント開始と誤認される）。
  const { quoted, preserved } = protectQuoted("const x = '/*';\nconst y = `#TZ=UTC`;");
  assert.equal(quoted.length, 2, 'シングルクォートとテンプレートリテラルの 2 つが退避される');
  assert.ok(!preserved.includes("'/*'"), 'シングルクォート文字列が退避されていない');
  assert.ok(!preserved.includes('`#TZ=UTC`'), 'テンプレートリテラルが退避されていない');
  assert.equal(restoreQuoted(preserved, quoted), "const x = '/*';\nconst y = `#TZ=UTC`;");
});

test('restoreQuoted: 置換特殊パターン（$& 等）を含む文字列の復元が破損しない（cmn-0338 項目 4）', () => {
  // replace の文字列引数は $& / $` / $' を展開してしまう。関数形なら退避文字列が
  // どんな置換特殊パターンを含んでいてもそのまま復元される。
  const tricky = '"a$&b"';
  const { quoted, preserved } = protectQuoted(`const x = ${tricky};`);
  const restored = restoreQuoted(preserved, quoted);
  assert.equal(restored, `const x = ${tricky};`);
});
