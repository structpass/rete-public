import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  REPO_ROOT,
  collectCssDefinitions,
  collectCssReferences,
  collectLiteralTriplets,
  resolveTriplets,
  findCssTripletViolations,
  collectTsxDefinitions,
  collectTsxReferences,
  findTsxTripletViolations,
  runChecks,
} from './check-css-tokens.mjs';

/** fixture ルートを作り、相対 path -> 内容 のファイル群を書き込む。 */
function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'cct-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const BASE_CSS = `:root {
  --info: 210 85% 45%;
  --sp-tone-blue: var(--info);
  --background: 215 20% 95%;
}
.usage {
  background: hsl(var(--sp-tone-blue));
  color: hsl(var(--background));
}
`;

const BASE_TSX = `export function Panel() {
  return <div className="bg-[hsl(var(--info))] text-[hsl(var(--background))]">ok</div>;
}
`;

// ---- ユニット: 定義・triplet・別名解決 ------------------------------------------------

test('collectCssDefinitions: --name: の定義を名前と行番号で収集する', () => {
  const defs = collectCssDefinitions(BASE_CSS);
  assert.deepEqual([...defs.keys()], ['--info', '--sp-tone-blue', '--background']);
  assert.equal(defs.get('--sp-tone-blue').value, 'var(--info)');
  assert.equal(defs.get('--info').line, 2);
});

test('collectLiteralTriplets: 「数字 数字% 数字%」形式だけを triplet と判定する', () => {
  const defs = new Map([
    ['--info', { value: '210 85% 45%' }],
    ['--border', { value: '220 13% 91% / 0.5' }],
    ['--sp-tone-blue', { value: 'var(--info)' }],
    ['--nav-fg', { value: 'hsl(220 46% 18%)' }],
    ['--plain', { value: '#fff' }],
  ]);
  const triplets = collectLiteralTriplets(defs);
  assert.ok(triplets.has('--info'));
  assert.ok(triplets.has('--border')); // / alpha 付きも triplet
  assert.ok(!triplets.has('--sp-tone-blue')); // 別名はリテラルではない
  assert.ok(!triplets.has('--nav-fg')); // hsl() で包まれている
  assert.ok(!triplets.has('--plain'));
});

test('resolveTriplets: 別名（--a: var(--b)）を辿って triplet 集合を閉じる', () => {
  const defs = new Map([
    ['--info', { value: '210 85% 45%' }],
    ['--sp-tone-blue', { value: 'var(--info)' }],
    ['--sp-tone-teal', { value: 'var(--sp-tone-blue)' }], // 推移
    ['--plain', { value: '#fff' }],
  ]);
  const triplets = resolveTriplets(collectLiteralTriplets(defs), defs);
  assert.ok(triplets.has('--info'));
  assert.ok(triplets.has('--sp-tone-blue'));
  assert.ok(triplets.has('--sp-tone-teal'));
  assert.ok(!triplets.has('--plain'));
});

test('findCssTripletViolations: hsl() で包まず色プロパティへ渡す行を検出する', () => {
  const css = `
:root {
  --info: 210 85% 45%;
  --sp-tone-blue: var(--info);
}
.bad {
  background: var(--info);
}
.bad2 {
  border: 1px solid var(--sp-tone-blue);
}
.bad3 {
  background-color: var(--info);
}
.bad4 {
  outline-color: var(--info);
}
.ok {
  background: hsl(var(--info));
  color: var(--background);
}
.alias-def {
  --sp-tone-orange: var(--info);
}
`;
  const defs = collectCssDefinitions(css);
  const triplets = resolveTriplets(collectLiteralTriplets(defs), defs);
  const violations = findCssTripletViolations(css, triplets);
  assert.deepEqual(violations, [
    { token: '--info', line: 7 },
    { token: '--sp-tone-blue', line: 10 },
    { token: '--info', line: 13 },
    { token: '--info', line: 16 },
  ]);
});

test('findCssTripletViolations: 複数行にまたがる var() 内の triplet 裸参照も検出する', () => {
  const css = `:root {
  --info: 210 85% 45%;
}
.bad {
  background: var(
    --info,
    #fff
  );
}
`;
  const defs = collectCssDefinitions(css);
  const triplets = resolveTriplets(collectLiteralTriplets(defs), defs);
  const violations = findCssTripletViolations(css, triplets);
  assert.deepEqual(violations, [{ token: '--info', line: 5 }]);
});

test('findCssTripletViolations: 別名の定義行自体は違反にしない（custom property の定義）', () => {
  const css = `:root {
  --info: 210 85% 45%;
  --sp-tone-blue: var(--info);
}`;
  const defs = collectCssDefinitions(css);
  const triplets = resolveTriplets(collectLiteralTriplets(defs), defs);
  assert.deepEqual(findCssTripletViolations(css, triplets), []);
});

test('collectCssReferences: コメント・文字列内の var() は参照に数えない', () => {
  const css = `/* var(--ghost) はコメント */
:root { --a: 1; }
.usage {
  content: "var(--ghost2)";
  color: var(--a);
  margin: var( --a );
}`;
  const refs = collectCssReferences(css);
  assert.deepEqual(refs, [
    { token: '--a', line: 5 },
    { token: '--a', line: 6 }, // var( --a ) の括弧内空白も許容
  ]);
});

test('collectCssReferences: 複数行にまたがる var() も参照として数える', () => {
  const css = `:root { --a: 1; }
.usage {
  background: var(
    --a,
    #fff
  );
}`;
  const refs = collectCssReferences(css);
  assert.deepEqual(refs, [{ token: '--a', line: 3 }]);
});

// ---- ユニット: 画面側 ----------------------------------------------------------------

test('collectTsxDefinitions: inline style と setProperty の注入トークンを収集する', () => {
  const source = `export function A() {
  return <div style={{ '--lvl': 1 } as CSSProperties} />;
}
export function B() {
  return <div style={{ ['--desk-rte-min-rows' as string]: String(3) }} />;
}
export function C() {
  header.style.setProperty('--keyword-left', '12px');
}
`;
  const defs = collectTsxDefinitions(source);
  assert.ok(defs.has('--lvl'));
  assert.ok(defs.has('--desk-rte-min-rows')); // ['--x' as string]: 形式
  assert.ok(defs.has('--keyword-left')); // setProperty 形式
  assert.equal(defs.size, 3);
});

test('collectTsxReferences: Tailwind 任意値記法の var() だけを収集する', () => {
  const source = `export function A() {
  return (
    <div className="text-[var(--sp-text-warm)] bg-[hsl(var(--info))] w-[var(--w)]" />
  );
}
// 素の var() は見ない（model タブ本文の散文対策）
const note = "参考: var(--sp-row-hover) は旧トークン";
`;
  const refs = collectTsxReferences(source);
  assert.deepEqual(refs, [
    { token: '--sp-text-warm', line: 3 },
    { token: '--info', line: 3 }, // hsl() 内でも任意値記法の参照としては数える
    { token: '--w', line: 3 },
  ]);
});

test('findTsxTripletViolations: 色系 bracket で triplet を裸で渡す行を検出する', () => {
  const source = `export function A() {
  return (
    <div
      className="bg-[var(--info)] text-[var(--sp-tone-blue)] border-t-[var(--info)]"
    />
  );
}
export function B() {
  return <div className="bg-[hsl(var(--info))] text-[var(--background)]" />;
}
`;
  const defs = new Map([
    ['--info', { value: '210 85% 45%' }],
    ['--sp-tone-blue', { value: 'var(--info)' }],
  ]);
  const triplets = resolveTriplets(collectLiteralTriplets(defs), defs);
  const violations = findTsxTripletViolations(source, triplets);
  assert.deepEqual(violations, [
    { token: '--info', line: 4 },
    { token: '--sp-tone-blue', line: 4 },
    { token: '--info', line: 4 },
  ]);
});

// ---- runChecks（fixture 統合） --------------------------------------------------------

test('criteria 1: globals.css に未定義トークンの参照を足すと赤になる', () => {
  const root = makeFixture({
    'packages/frontend/src/app/globals.css': BASE_CSS + '\n.bad {\n  color: var(--nope);\n}\n',
    'packages/frontend/src/components/panel.tsx': BASE_TSX,
  });
  try {
    const { violations } = runChecks({ root, allowlist: {} });
    assert.ok(violations.some((v) => v.token === '--nope' && v.kind === '未定義トークン参照'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('criteria 2: 画面側の任意値記法で未定義トークンを参照すると赤になる', () => {
  const root = makeFixture({
    'packages/frontend/src/app/globals.css': BASE_CSS,
    'packages/frontend/src/components/panel.tsx':
      'export function A() {\n  return <div className="text-[var(--nope)]" />;\n}\n',
  });
  try {
    const { violations } = runChecks({ root, allowlist: {} });
    assert.ok(violations.some((v) => v.token === '--nope' && v.kind === '未定義トークン参照'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('criteria 3: triplet を hsl() で包まず色プロパティへ渡すと赤になる（別名経由も）', () => {
  const root = makeFixture({
    'packages/frontend/src/app/globals.css':
      ':root {\n  --info: 210 85% 45%;\n  --sp-tone-blue: var(--info);\n}\n' +
      '.bad {\n  background: var(--info);\n}\n.bad2 {\n  color: var(--sp-tone-blue);\n}\n',
    'packages/frontend/src/components/panel.tsx': BASE_TSX,
  });
  try {
    const { violations } = runChecks({ root, allowlist: {} });
    const tripletKinds = violations.filter((v) => v.kind === 'triplet の包み忘れ');
    assert.deepEqual(tripletKinds.map((v) => v.token).sort(), ['--info', '--sp-tone-blue']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('criteria 4: 許可名簿に載せた分は赤にならない', () => {
  const root = makeFixture({
    'packages/frontend/src/app/globals.css': BASE_CSS + '\n.bad {\n  color: var(--nope);\n}\n',
    'packages/frontend/src/components/panel.tsx': BASE_TSX,
  });
  try {
    const allowlist = { '--nope': { reason: '既知の未解消', repay: 'cmn-9999' } };
    const { violations } = runChecks({ root, allowlist });
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('criteria 5: 許可名簿の項目が定義されたら赤になる（返済後に名簿が残らない）', () => {
  const root = makeFixture({
    'packages/frontend/src/app/globals.css':
      ':root {\n  --nope: 1;\n}\n.usage {\n  color: var(--nope);\n}\n',
    'packages/frontend/src/components/panel.tsx': BASE_TSX,
  });
  try {
    const allowlist = { '--nope': { reason: '既知の未解消', repay: 'cmn-9999' } };
    const { decay } = runChecks({ root, allowlist });
    assert.ok(decay.some((d) => d.token === '--nope' && /定義/.test(d.reason)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('criteria 5: 許可名簿の項目が参照ゼロになったら赤になる', () => {
  const root = makeFixture({
    'packages/frontend/src/app/globals.css': ':root {\n  --a: 1;\n}\n',
    'packages/frontend/src/components/panel.tsx': BASE_TSX,
  });
  try {
    const allowlist = { '--ghost': { reason: 'もう使われないはず', repay: 'cmn-9999' } };
    const { decay } = runChecks({ root, allowlist });
    assert.ok(decay.some((d) => d.token === '--ghost' && /参照されていない/.test(d.reason)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('criteria 6: 正しい書き方（hsl() で包む・定義済み参照）では緑', () => {
  const root = makeFixture({
    'packages/frontend/src/app/globals.css': BASE_CSS,
    'packages/frontend/src/components/panel.tsx': BASE_TSX,
  });
  try {
    const { violations, errors, decay } = runChecks({ root, allowlist: {} });
    assert.deepEqual(violations, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(decay, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('criteria 7: globals.css が見つからないと赤になる（探索ゼロを通過しない）', () => {
  const root = makeFixture({
    'packages/frontend/src/components/panel.tsx': BASE_TSX,
  });
  try {
    const { errors } = runChecks({ root, allowlist: {} });
    assert.ok(errors.some((e) => /globals.css が見つかりません/.test(e)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('criteria 7: 画面側の .ts/.tsx が 0 本だと赤になる', () => {
  const root = makeFixture({
    'packages/frontend/src/app/globals.css': BASE_CSS,
  });
  try {
    const { errors } = runChecks({ root, allowlist: {} });
    assert.ok(errors.some((e) => /1 本も見つかりません/.test(e)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- 実リポ回帰 -----------------------------------------------------------------------

test('criteria 6: 現行の rete リポジトリが違反ゼロで通る（許可名簿掲載分は除く）', () => {
  const { violations, errors, decay } = runChecks({ root: REPO_ROOT });
  assert.deepEqual(errors, []);
  assert.deepEqual(decay, []);
  assert.deepEqual(
    violations,
    [],
    '実リポでトークン誤用を検出しました。直すか ALLOWLIST へ理由つきで載せてください',
  );
});
