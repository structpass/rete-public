const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const npmRoot = process.env.BRACES_PATCH_NPM_ROOT;
if (npmRoot) assert.equal(path.resolve(npmRoot), path.join(root, 'e2e'));
const micromatch = fs.realpathSync(
  npmRoot
    ? path.join(npmRoot, 'node_modules/micromatch')
    : path.join(root, 'node_modules/.pnpm/node_modules/micromatch'),
);
const dependencyRequire = createRequire(path.join(micromatch, 'package.json'));
const entry = dependencyRequire.resolve('braces');
const braces = dependencyRequire('braces');
const lib = path.join(path.dirname(entry), 'lib');
const baseline = process.env.BRACES_BASELINE
  ? require(path.resolve(process.env.BRACES_BASELINE))
  : null;

function rawTree(depth) {
  const ast = { type: 'root', nodes: [] };
  let parent = ast;
  for (let i = 0; i < depth; i++) {
    const child = { type: 'paren', parent, nodes: [] };
    parent.nodes.push(child);
    parent = child;
  }
  parent.nodes.push({ type: 'text', value: 'x', parent });
  return ast;
}

test('transitive micromatch resolves the registered patch', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.ok(manifest.pnpm.patchedDependencies['braces@3.0.3']);
  assert.match(fs.readFileSync(path.join(lib, 'validate.js'), 'utf8'), /MAX_DEPTH = 100/);
  assert.equal(braces.compile('{a,b}'), '(a|b)');
});

for (const api of ['parse', 'compile', 'expand', 'stringify']) {
  test(`${api}: brace and parenthesis nesting are limited independently of options`, () => {
    for (const [left, right] of [
      ['{', '}'],
      ['(', ')'],
      ['{(', ')}'],
    ]) {
      const input = left.repeat(101) + 'x' + right.repeat(101);
      assert.throws(
        () => braces[api](input, { maxLength: Infinity, rangeLimit: false }),
        SyntaxError,
      );
    }
  });
}

for (const api of ['compile', 'expand', 'stringify']) {
  test(`${api}: non-string AST values cannot bypass structural validation`, () => {
    for (const value of [['x'], { toString: () => 'x' }, 1, null]) {
      const invalid = { type: 'root', nodes: [{ type: 'text', value }] };
      assert.throws(() => braces[api](invalid), SyntaxError);
      assert.throws(() => require(path.join(lib, `${api}.js`))(invalid), SyntaxError);
    }
  });
  test(`${api}: non-object AST nodes cannot bypass structural validation`, () => {
    const callable = function ast() {};
    callable.nodes = [callable];
    for (const invalid of [callable, { nodes: [callable] }, { nodes: [null] }]) {
      assert.throws(() => braces[api](invalid), SyntaxError);
    }
  });
  test(`${api}: raw AST and direct library calls enforce the same depth`, () => {
    assert.doesNotThrow(() => braces[api](rawTree(100)));
    assert.throws(() => braces[api](rawTree(101)), SyntaxError);
    assert.throws(() => require(path.join(lib, `${api}.js`))(rawTree(101)), SyntaxError);
  });
  test(`${api}: nodes cycles are rejected without rejecting parent/prev backreferences`, () => {
    const cyclic = { type: 'root', nodes: [] };
    cyclic.nodes.push(cyclic);
    assert.throws(() => braces[api](cyclic), SyntaxError);
    assert.doesNotThrow(() => braces[api](braces.parse('{a,{b,c}}')));
  });
}

test('parser accepts structural depth 100 and rejects 101 before normalization', () => {
  for (const [left, right] of [
    ['{', '}'],
    ['(', ')'],
  ]) {
    assert.doesNotThrow(() => braces.parse(left.repeat(100) + 'x' + right.repeat(100)));
    assert.throws(() => braces.parse(left.repeat(101) + 'x' + right.repeat(101)), SyntaxError);
  }
  assert.throws(
    () => braces.parse('{1..' + '('.repeat(101) + 'x' + ')'.repeat(101) + ',y}'),
    SyntaxError,
  );
});

test('escaped, quoted and bracketed literal braces do not consume structural depth', () => {
  for (const input of [
    '\\{'.repeat(120),
    '"' + '{'.repeat(120) + '"',
    '[' + '{'.repeat(120) + ']',
  ]) {
    assert.doesNotThrow(() => braces.compile(input));
    if (baseline) assert.equal(braces.compile(input), baseline.compile(input));
  }
});

test('expand rejects cyclic and excessive parent chains', () => {
  const node = { type: 'paren', nodes: [{ type: 'text', value: 'x' }] };
  node.parent = node;
  assert.throws(() => braces.expand({ type: 'root', nodes: [node] }), SyntaxError);
  const child = { type: 'paren', nodes: [] };
  let parent = child;
  for (let i = 0; i < 101; i++) parent = parent.parent = { type: 'paren', nodes: [] };
  parent.parent = { type: 'root', nodes: [] };
  assert.throws(() => braces.expand({ type: 'root', nodes: [child] }), SyntaxError);
});

test('expand validates queue state on external ancestors before flattening', () => {
  let nested = 'q';
  for (let i = 0; i < 102; i++) nested = [nested];
  const cycle = [];
  cycle.push(cycle);
  for (const queue of [[nested], cycle, [{ toString: () => 'q' }]]) {
    const external = { type: 'root', queue };
    const child = {
      type: 'paren',
      parent: external,
      nodes: [{ type: 'text', value: 'x' }],
    };
    assert.throws(() => braces.expand({ type: 'root', nodes: [child] }), SyntaxError);
  }
});

test('ordinary sets, ranges, options and AST subtrees retain baseline behavior', () => {
  const controls = [
    ['a/{b,c}/d', {}],
    ['{a,{b,c}}', {}],
    ['{1..3}', {}],
    ['{01..03}', {}],
    ['{1..5..2}', {}],
    ['{,a,a}', { noempty: true, nodupes: true }],
    ['${a,b}', {}],
    ['@(a|b)', {}],
    ['{a,b}', { escapeInvalid: true }],
    ['./src/**/*.{js,ts,jsx,tsx,mdx}', {}],
  ];
  for (const [input, options] of controls) {
    if (baseline) {
      for (const api of ['compile', 'expand', 'stringify']) {
        assert.deepEqual(braces[api](input, options), baseline[api](input, options));
      }
    } else {
      assert.doesNotThrow(() => braces(input, options));
    }
  }
  assert.deepEqual(braces.expand('a/{b,c}/d'), ['a/b/d', 'a/c/d']);
  assert.deepEqual(braces.expand('{1..5..2}'), ['1', '3', '5']);
  assert.deepEqual(braces.expand('{,a,a}', { noempty: true, nodupes: true }), ['a']);
  assert.throws(() => braces.expand('{1..1001}'), RangeError);
  const subtree = braces.parse('{a,b}').nodes[1];
  assert.equal(braces.compile(subtree), '(a|b)');
});
