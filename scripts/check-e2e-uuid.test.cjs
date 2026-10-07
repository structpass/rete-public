const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const e2e = path.resolve(__dirname, '../e2e');
const lock = JSON.parse(fs.readFileSync(path.join(e2e, 'package-lock.json'), 'utf8'));
const uuidEntries = Object.keys(lock.packages).filter((key) =>
  /(?:^|\/)node_modules\/uuid$/.test(key),
);
const messageEntries = Object.keys(lock.packages).filter((key) =>
  key.endsWith('/@cucumber/messages'),
);

test('the exact npm override covers every locked and installed uuid copy', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(e2e, 'package.json'), 'utf8'));
  assert.equal(manifest.overrides.uuid, '11.1.1');
  assert(uuidEntries.length > 0);
  assert.equal(messageEntries.length, 3);
  for (const entry of uuidEntries) {
    assert.equal(lock.packages[entry].version, '11.1.1');
    const pkg = JSON.parse(fs.readFileSync(path.join(e2e, entry, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '11.1.1');
  }
});

for (const entry of uuidEntries) {
  const base = path.join(e2e, entry);
  const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
  const requireUuid = createRequire(path.join(base, 'package.json'));
  for (const mode of ['require', 'import']) {
    for (const name of ['v3', 'v5', 'v6']) {
      test(`${entry} ${mode} ${name}: bounds reject before writes; valid UUIDs remain`, async () => {
        const api =
          mode === 'require'
            ? requireUuid(base)
            : await import(pathToFileURL(path.join(base, pkg.exports['.'].node.import)).href);
        const invoke = (buffer, offset) =>
          name === 'v6'
            ? api.v6({}, buffer, offset)
            : api[name]('www.widgets.com', api[name].DNS, buffer, offset);
        for (const make of [
          (length) => new Uint8Array(length).fill(0xa5),
          (length) => Buffer.alloc(length, 0xa5),
          (length) => new Array(length).fill(0xa5),
        ]) {
          for (const [length, offset] of [
            [16, -1],
            [16, 1],
            [8, 4],
          ]) {
            const buffer = make(length);
            const before = buffer.slice();
            assert.throws(() => invoke(buffer, offset), RangeError);
            assert.deepEqual(buffer, before);
          }
          const buffer = make(32);
          const before = buffer.slice();
          assert.equal(invoke(buffer, 8), buffer);
          const id = api.stringify(buffer, 8);
          assert(api.validate(id));
          assert.equal(api.version(id), Number(name.slice(1)));
          assert.deepEqual(buffer.slice(0, 8), before.slice(0, 8));
          assert.deepEqual(buffer.slice(24), before.slice(24));
          if (name === 'v3') assert.equal(id, '3d813cbb-47fb-32ba-91df-831e1593ac29');
          if (name === 'v5') assert.equal(id, '21f7f8de-8051-5b89-8680-0195ef798b6a');
        }
      });
    }
  }
}

for (const entry of messageEntries) {
  test(`${entry}: CJS and ESM consumers still generate valid v4 IDs`, async () => {
    const base = path.join(e2e, entry);
    const requireMessages = createRequire(path.join(base, 'package.json'));
    const resolvedUuid = requireMessages.resolve('uuid/package.json');
    assert.equal(JSON.parse(fs.readFileSync(resolvedUuid, 'utf8')).version, '11.1.1');
    const cjs = requireMessages(base);
    const esm = await import(pathToFileURL(path.join(base, 'dist/esm/src/index.js')).href);
    const uuid = requireMessages('uuid');
    for (const messages of [cjs, esm]) {
      const id = messages.IdGenerator.uuid()();
      assert(uuid.validate(id));
      assert.equal(uuid.version(id), 4);
    }
  });
}
