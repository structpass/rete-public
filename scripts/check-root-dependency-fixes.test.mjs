import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import { verifyMagicastSource, verifyMagicastBytes } from './check-magicast-patch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = path.join(root, 'node_modules/.pnpm');
function copies(name) {
  return fs
    .readdirSync(store)
    .filter((entry) => entry.startsWith(name + '@'))
    .map((entry) => path.join(store, entry, 'node_modules', name))
    .filter((entry) => fs.existsSync(path.join(entry, 'package.json')));
}
function requireAt(directory) {
  return createRequire(path.join(directory, 'package.json'));
}
const versions = {
  'proxy-addr': '2.0.8',
  'source-map-js': '1.2.2',
  'smol-toml': '1.9.0',
  'postcss-selector-parser': '7.1.6',
};
const basic = {
  version: 3,
  sources: ['original.ts'],
  names: [],
  mappings: 'AAAA',
  sourcesContent: ['export default { enabled: true, count: 1 };\n'],
};
const indexed = (line, column = 0, map = basic) => ({
  version: 3,
  sections: [{ offset: { line, column }, map }],
});
const invalid = [
  indexed(10000001),
  indexed(6000000, 0, indexed(6000000)),
  ...[-1, 0.5, '2', Infinity, NaN, null, undefined, Number.MAX_SAFE_INTEGER + 1].flatMap(
    (value) => [
      { version: 3, sections: [{ offset: { line: value, column: 0 }, map: basic }] },
      { version: 3, sections: [{ offset: { line: 0, column: value }, map: basic }] },
    ],
  ),
];

test('every installed target copy and actual caller resolves the exact repaired version', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  for (const [name, version] of Object.entries(versions)) {
    const directories = copies(name);
    assert(directories.length > 0, 'No installed copy: ' + name);
    for (const directory of directories)
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version,
        version,
      );
  }
  assert.equal(manifest.pnpm.patchedDependencies['magicast@0.5.5'], 'patches/magicast@0.5.5.patch');
  assert(
    copies('magicast').some(
      (directory) =>
        JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version === '0.5.5',
    ),
    'The bundled copy must actually be installed and checked',
  );
  for (const [caller, dependency] of [
    ['express', 'proxy-addr'],
    ['postcss', 'source-map-js'],
    ['magicast', 'source-map-js'],
    ['knip', 'smol-toml'],
    ['tailwindcss', 'postcss-selector-parser'],
    ['postcss-nested', 'postcss-selector-parser'],
  ]) {
    for (const directory of copies(caller)) {
      const require = requireAt(directory);
      let dependencyDirectory = path.dirname(require.resolve(dependency));
      while (!fs.existsSync(path.join(dependencyDirectory, 'package.json'))) {
        const parent = path.dirname(dependencyDirectory);
        assert.notEqual(parent, dependencyDirectory);
        dependencyDirectory = parent;
      }
      const actual = JSON.parse(fs.readFileSync(path.join(dependencyDirectory, 'package.json')));
      assert.equal(actual.name, dependency);
      assert.equal(actual.version, versions[dependency], caller + ' actual dependency');
    }
  }
});

function consumerControls(Consumer) {
  for (const map of invalid)
    assert.throws(() => new Consumer(map), /Section offset|required argument/);
  for (const [map, generatedLine, generatedColumn] of [
    [basic, 1, 0],
    [indexed(0), 1, 0],
    [indexed(2, 0), 3, 0],
    [indexed(0, 3), 1, 3],
    [indexed(0, 0, indexed(0)), 1, 0],
  ]) {
    const consumer = new Consumer(map);
    assert.deepEqual(Array.from(consumer.sources), ['original.ts']);
    const records = [];
    consumer.eachMapping((mapping) => records.push(mapping));
    assert.equal(records.length, 1);
    assert.equal(records[0].generatedLine, generatedLine);
    assert.equal(records[0].generatedColumn, generatedColumn);
    assert.equal(records[0].originalLine, 1);
    assert.equal(records[0].originalColumn, 0);
  }
  // Constructor boundary only: never flatten mappings at million-line offsets.
  assert.doesNotThrow(() => new Consumer(indexed(10000000, Number.MAX_SAFE_INTEGER)));
  assert.throws(
    () =>
      new Consumer({
        version: 3,
        sections: [
          { offset: { line: 2, column: 0 }, map: basic },
          { offset: { line: 1, column: 0 }, map: basic },
        ],
      }),
    /ordered/,
  );
  assert.throws(
    () =>
      new Consumer({
        version: 3,
        sections: [{ offset: { line: 0, column: 0 }, url: 'fixture.invalid' }],
      }),
    /url field/,
  );
  const nested = new Consumer(indexed(0, 0, indexed(0)));
  const child = nested._sections[0].consumer;
  let reads = 0;
  Object.defineProperty(child, 'sources', {
    get() {
      reads++;
      return ['first.ts', 'second.ts', 'third.ts'];
    },
  });
  assert.deepEqual(Array.from(nested.sources), ['first.ts', 'second.ts', 'third.ts']);
  assert.equal(reads, 1, 'Read each nested sources getter once');
}

for (const directory of copies('source-map-js')) {
  test(
    'official consumer boundary and ordinary APIs: ' +
      path.basename(path.dirname(path.dirname(directory))),
    () => {
      const maps = requireAt(directory)(directory);
      consumerControls(maps.SourceMapConsumer);
      const flat = maps.SourceMapGenerator.fromSourceMap(
        new maps.SourceMapConsumer(basic),
      ).toJSON();
      assert.deepEqual(flat.sources, basic.sources);
      assert.equal(flat.mappings, 'AAAA');
      const node = maps.SourceNode.fromStringWithSourceMap(
        'const fixture = 1;',
        new maps.SourceMapConsumer(basic),
      );
      assert.equal(node.toStringWithSourceMap({ file: 'out.js' }).code, 'const fixture = 1;');
    },
  );
}

const oldDefaultMappings =
  'AAAA,CAAC,CAAC,CAAC,CAAC,CAAC,EAAE,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,EAAE,EAAE,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,EAAE,CAAC,CAAC,CAAC,CAAC,EAAE,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC';
const oldFlatMappings =
  'AAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,IAAA,CAAA';
const oldColumnOffsetMappings =
  'IAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,IAAA,CAAA';
for (const directory of copies('magicast')) {
  if (JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version !== '0.5.5')
    continue;
  const source = path.join(directory, 'dist/builders-CDdrUKLb.js');
  test(
    'complete bundled repair and all seven official consumer contracts: ' +
      path.basename(path.dirname(path.dirname(directory))),
    () => {
      verifyMagicastSource(source);
      const unknown = Buffer.concat([
        fs.readFileSync(source),
        Buffer.from('\n// unknown source\n'),
      ]);
      const snapshot = Buffer.from(unknown);
      assert.throws(() => verifyMagicastBytes(unknown), /Unknown or unpatched/);
      assert.deepEqual(unknown, snapshot);
      const text = fs.readFileSync(source, 'utf8');
      assert.equal(text.match(/^import .*$/gm).length, 1);
      // Expose the actual bundled constructor only in this isolated VM; the public API is tested separately.
      const code =
        text.replace(/^import .*$/m, 'const babelParser = {};').replace(/^export .*$/m, '') +
        '\nrequire_source_map_consumer().SourceMapConsumer;';
      const Consumer = vm.runInNewContext(code, { process, Buffer, console }, { timeout: 1000 });
      consumerControls(Consumer);
    },
  );
  test('public index/core/helpers share repaired generation; ordinary object/string maps and AST edits retain baseline', async () => {
    const api = await import(pathToFileURL(path.join(directory, 'dist/index.js')));
    const core = await import(pathToFileURL(path.join(directory, 'dist/core.js')));
    const helperApi = await import(pathToFileURL(path.join(directory, 'dist/helpers.js')));
    assert(Object.keys(helperApi).length > 0);
    assert.equal(api.generateCode, core.generateCode);
    const helpers = fs.readFileSync(path.join(directory, 'dist/helpers.js'), 'utf8');
    assert.match(helpers, /from "\.\/builders-CDdrUKLb\.js"/);
    const make = () => {
      const node = api.parseModule(basic.sourcesContent[0], { sourceFileName: 'fixture.ts' });
      node.exports.default.count = 2;
      return node;
    };
    for (const [name, map] of [
      ['default', undefined],
      ['flat', basic],
      ['indexed', indexed(0)],
      ['indexed-column', indexed(0, 3)],
    ]) {
      for (const representation of ['object', 'string']) {
        const result = api.generateCode(make(), {
          sourceMapName: 'out.js',
          ...(map
            ? { inputSourceMap: representation === 'object' ? map : JSON.stringify(map) }
            : {}),
        });
        assert.equal(result.code, 'export default { enabled: true, count: 2 };');
        assert.deepEqual(result.map, {
          version: 3,
          sources: [name === 'default' ? 'fixture.ts' : 'original.ts'],
          names: [],
          mappings:
            name === 'default'
              ? oldDefaultMappings
              : name === 'flat'
                ? oldFlatMappings
                : name === 'indexed'
                  ? oldFlatMappings.substring(5)
                  : oldColumnOffsetMappings,
          file: 'out.js',
          sourcesContent: basic.sourcesContent,
        });
      }
    }
    for (const map of invalid)
      for (const value of [map, JSON.stringify(map)])
        assert.throws(
          () => core.generateCode(make(), { sourceMapName: 'out.js', inputSourceMap: value }),
          /Section offset|required argument/,
        );
  });
}

for (const directory of copies('proxy-addr')) {
  test('proxy false/numeric hop and mapped/native subnet controls preserve client selection', () => {
    const proxy = requireAt(directory)(directory);
    for (const remote of ['203.0.113.4', '::ffff:203.0.113.4', '2001:db8::4']) {
      const req = {
        connection: { remoteAddress: remote },
        headers: { 'x-forwarded-for': '198.51.100.8, 192.0.2.7' },
      };
      assert.equal(
        proxy(req, () => false),
        remote,
      );
      assert.deepEqual(
        proxy.all(req, () => false),
        [remote],
      );
      assert.equal(
        proxy(req, (_, index) => index < 1),
        '192.0.2.7',
      );
    }
    const subnet = proxy.compile('192.0.2.0/24');
    assert(subnet('192.0.2.8'));
    assert(subnet('::ffff:192.0.2.8'));
    assert.equal(subnet('198.51.100.8'), false);
    for (const range of ['::ffff:10.0.0.0/8', ['::ffff:10.0.0.0/8', '192.0.2.0/24']]) {
      const trust = proxy.compile(range);
      assert.equal(trust('203.0.113.7'), false);
      assert.equal(trust('::ffff:203.0.113.7'), false);
    }
    const mappedRange = proxy.compile('::ffff:10.0.0.0/104');
    assert(mappedRange('10.1.2.3'));
    assert(mappedRange('::ffff:10.1.2.3'));
  });
}

for (const directory of copies('smol-toml')) {
  test('TOML CJS/ESM ordinary date/table/prototype/BigInt and bounded flat keys', async () => {
    const require = requireAt(directory),
      cjs = require(directory),
      esm = await import(pathToFileURL(path.join(directory, 'dist/index.js')));
    for (const api of [cjs, esm]) {
      const parsed = api.parse('title="ordinary"\n[server]\nports=[8080,8081]\nenabled=true\n');
      assert.equal(Object.getPrototypeOf(parsed), null);
      assert.equal(Object.getPrototypeOf(parsed.server), null);
      assert.equal(parsed.title, 'ordinary');
      assert.deepEqual(parsed.server.ports, [8080, 8081]);
      assert.equal(parsed.server.enabled, true);
      assert.equal(
        api.parse('when=1979-05-27T07:32:00Z').when.toISOString(),
        '1979-05-27T07:32:00.000Z',
      );
      assert.throws(() => api.parse('large=9007199254740992'), /integer/i);
      assert.equal(
        api.parse('large=9007199254740992', { integersAsBigInt: true }).large,
        9007199254740992n,
      );
      const data = api.parse('__proto__.safe=5\nconstructor="value"');
      assert.equal(Object.hasOwn(data, '__proto__'), true);
      assert.equal(data.__proto__.safe, 5);
      assert.equal(data.constructor, 'value');
      const document = Array.from({ length: 4096 }, (_, index) => 'k' + index + '=1').join('\n');
      assert.equal(Object.keys(api.parse(document)).length, 4096);
    }
  });
}

for (const directory of copies('postcss-selector-parser')) {
  test('selector AST mutation/private unesc and ordinary flat serialization', () => {
    const require = requireAt(directory),
      parser = require(directory);
    for (const selector of [
      '.foo:hover > .bar::before',
      'svg|a[href^="https"]:not(.hidden)',
      ':merge(.group):hover .group-hover\\:block',
      ':is(.a,#b) > &:nth-child(2n + 1)',
      '.w-1\\/2',
      '&:hover, & > .child',
    ])
      assert.equal(parser().processSync(selector), selector);
    const ast = parser().astSync('.a .b');
    ast.walkClasses((node) => {
      if (node.value === 'b') node.value = 'c';
    });
    assert.equal(String(ast), '.a .c');
    const unesc = require(path.join(directory, 'dist/util/unesc.js'));
    assert.equal((unesc.default || unesc)('w-1\\/2'), 'w-1/2');
    const repeated = '.a'.repeat(2048);
    assert.equal(parser().processSync(repeated), repeated);
  });
}
