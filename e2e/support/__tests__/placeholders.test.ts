/**
 * cmn-0336: placeholders.ts（`{{key}}` 解決）の Node --test 単体検証。
 *
 * 実行: e2e の `npm run test:unit`（node --experimental-strip-types --test support/__tests__/*.test.ts）
 * → CI では test.yml の e2e 独立 job「Unit test (E2E)」ステップが実行する唯一の経路（cmn-0376）。
 * この経路の存在は scripts/check-ci-workflow.test.mjs が固定している（ステップを消すと赤くなる）。
 *
 * ここが本件の唯一の証明手段なのは、既存 feature の PATCH / PUT と「id を記録する POST」の使用箇所が
 * path も body も `{{}}` を含まず、解決が壊れていても通しの e2e は緑になるため（cmn-0336 の criteria 3）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlaceholders, resolveRequest } from '../placeholders.ts';

const VARS = { themeId: 'th-123', orgName: 'org-abc', taskId: 'tk-9' };

test('path 解決: URL 中の {{key}} を置換する', () => {
  assert.equal(
    resolvePlaceholders('/api/v1/chat/themes/{{themeId}}/messages', VARS),
    '/api/v1/chat/themes/th-123/messages',
  );
  // 1 つの文字列に複数個・キーの重複があっても全て置換する。
  assert.equal(
    resolvePlaceholders('/api/v1/{{themeId}}/{{taskId}}/{{themeId}}', VARS),
    '/api/v1/th-123/tk-9/th-123',
  );
  // {{}} を含まない URL は無変換（既存シナリオへの副作用ゼロ）。
  assert.equal(resolvePlaceholders('/api/v1/organizations', VARS), '/api/v1/organizations');
});

test('body 解決: JSON 文字列の中の {{key}} を置換する', () => {
  assert.equal(
    resolvePlaceholders('{"name":"{{orgName}}","themeId":"{{themeId}}"}', VARS),
    '{"name":"org-abc","themeId":"th-123"}',
  );
});

test('未定義キーは {{key}} のまま残す（typo 検出用の既存契約）', () => {
  assert.equal(
    resolvePlaceholders('/api/v1/tasks/{{unknownId}}', VARS),
    '/api/v1/tasks/{{unknownId}}',
  );
  assert.equal(resolvePlaceholders('{"name":"{{typo}}"}', VARS), '{"name":"{{typo}}"}');
  // 空文字が入っているキーは「未定義」ではないので置換する（?? の意味を || へ弱めない）。
  assert.equal(resolvePlaceholders('/a/{{empty}}/b', { empty: '' }), '/a//b');
});

test('キー文法は \\w+ 限定（ハイフン・ドット入りは未定義ではなく文法非対応で素通り）', () => {
  // 残った {{a-b}} を見て「typo 検出が効いた」と読まれないよう、意図を固定しておく。
  assert.equal(resolvePlaceholders('/a/{{a-b}}', { 'a-b': 'x' }), '/a/{{a-b}}');
  assert.equal(resolvePlaceholders('/a/{{a.b}}', { 'a.b': 'x' }), '/a/{{a.b}}');
});

test('resolveRequest: path と body を必ず両方解決して返す', () => {
  const { path, body } = resolveRequest(
    '/api/v1/chat/themes/{{themeId}}/messages',
    '{"content":"{{orgName}} への連絡","taskId":"{{taskId}}"}',
    VARS,
  );
  assert.equal(path, '/api/v1/chat/themes/th-123/messages');
  assert.deepEqual(body, { content: 'org-abc への連絡', taskId: 'tk-9' });
});

test('resolveRequest: 未定義キーは path / body とも残したまま通す', () => {
  const { path, body } = resolveRequest('/api/v1/x/{{nope}}', '{"k":"{{nope}}"}', VARS);
  assert.equal(path, '/api/v1/x/{{nope}}');
  assert.deepEqual(body, { k: '{{nope}}' });
});

test('resolveRequest: 引用符・バックスラッシュ入りの値を差し込んでも構造が壊れない（cmn-0394 criteria 1）', () => {
  // テンプレート側のエスケープ済み文字列（`\"` / `\\`）と {{key}} が共存しても parse に成功し、
  // 差し込み値が正しく届くことを固定する。差し込む値自体に特殊文字を含む本質ケースは下のテストが担う。
  const { path, body } = resolveRequest(
    '/api/v1/tasks/{{taskId}}',
    '{"title":"a \\"quoted\\" {{taskId}}","note":"back\\\\slash {{taskId}}"}',
    VARS,
  );
  assert.equal(path, '/api/v1/tasks/tk-9');
  assert.deepEqual(body, { title: 'a "quoted" tk-9', note: 'back\\slash tk-9' });
});

test('resolveRequest: 差し込む値自体に引用符・バックスラッシュ・波括弧が含まれても構造が壊れない（cmn-0394 criteria 1・旧実装との差を検出する本質）', () => {
  // 旧実装（文字列置換→JSON.parse）は、vars の値に `"` / `\` / `{` が含まれると
  // 文字列リテラルが壊れて JSON.parse が失敗（or 意図しない構造になる）。新実装は parse 先行なので
  // 値に何が入っても構造は保たれ、その値がそのまま届く。このテストは新旧の差を確実に検出する。
  const r = resolveRequest('/api/v1/x', '{"title":"{{t}}","note":"{{n}}","body":"{{b}}"}', {
    t: 'a"b',
    n: 'back\\slash',
    b: 'braces {x}',
  });
  assert.deepEqual(r.body, { title: 'a"b', note: 'back\\slash', body: 'braces {x}' });
});

test('resolveRequest: 波括弧・波括弧記法を含む値を差し込んでも構造が壊れない（cmn-0394 criteria 1）', () => {
  const { body } = resolveRequest(
    '/api/v1/x',
    '{"pattern":"{{orgName}} {a,b}","raw":"{{taskId}}"}',
    VARS,
  );
  assert.deepEqual(body, { pattern: 'org-abc {a,b}', raw: 'tk-9' });
});

test('resolveRequest: 入れ子になったオブジェクト・配列の奥の文字列にも効く（cmn-0394 criteria 3）', () => {
  const { body } = resolveRequest(
    '/api/v1/x',
    '{"outer":{"inner":[{"name":"{{orgName}}"},{"name":"{{taskId}}"}]},"flat":"{{themeId}}"}',
    VARS,
  );
  assert.deepEqual(body, {
    outer: { inner: [{ name: 'org-abc' }, { name: 'tk-9' }] },
    flat: 'th-123',
  });
});

test('resolveRequest: 文字列以外（数値・真偽値・null）は置換せず型を保存する（cmn-0394 criteria 3）', () => {
  const { body } = resolveRequest(
    '/api/v1/x',
    '{"n":42,"flag":true,"nothing":null,"str":"{{taskId}}"}',
    VARS,
  );
  assert.deepEqual(body, { n: 42, flag: true, nothing: null, str: 'tk-9' });
  assert.equal(typeof body.n, 'number', '数値は number のまま');
  assert.equal(typeof body.flag, 'boolean', '真偽値は boolean のまま');
  assert.equal(body.nothing, null, 'null は null のまま');
});

test('resolveRequest: オブジェクトのキー側は置換しない（範囲を広げない・cmn-0394）', () => {
  const { body } = resolveRequest('/api/v1/x', '{"{{orgName}}":"{{taskId}}"}', VARS);
  // キーは {{orgName}} のまま・値は tk-9 へ置換される
  assert.deepEqual(body, { '{{orgName}}': 'tk-9' });
});

test('resolveRequest: body が JSON オブジェクトでない（配列 / プリミティブ）時は throw（cmn-0394・暗黙 cast の撤去）', () => {
  assert.throws(() => resolveRequest('/api/v1/x', '[1,2,3]', VARS), /JSON オブジェクト/);
  assert.throws(() => resolveRequest('/api/v1/x', '"just a string"', VARS), /JSON オブジェクト/);
  assert.throws(() => resolveRequest('/api/v1/x', '42', VARS), /JSON オブジェクト/);
  assert.throws(
    () => resolveRequest('/api/v1/x', 'null', VARS),
    /\(got null\)/,
    'null は got null と明示',
  );
});

test('resolveRequest: __proto__ キーを持つ body でもプロトタイプを汚さずキーが欠落しない（cmn-0394）', () => {
  const { body } = resolveRequest('/api/v1/x', '{"__proto__":{"x":1},"name":"{{orgName}}"}', VARS);
  // 期待値はリテラル `{ __proto__: ... }` では書けない（プロトタイプ設定になる）ため JSON.parse で作る。
  assert.deepEqual(body, JSON.parse('{"__proto__":{"x":1},"name":"org-abc"}'));
  // プロトタイプ汚染が起きていないこと（{} の prototype が書き換わらない）
  assert.equal(
    (Object.prototype as Record<string, unknown>).polluted,
    undefined,
    'Object.prototype は汚染されない',
  );
});
