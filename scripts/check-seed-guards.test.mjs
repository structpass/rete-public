import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const seedDir = fileURLToPath(new URL('../packages/backend/prisma/', import.meta.url));
const compile = (name) =>
  ts.transpileModule(fs.readFileSync(seedDir + name, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
const guardModule = { exports: {} };
vm.runInNewContext(compile('seed-guards.ts'), { exports: guardModule.exports });
const guards = guardModule.exports;
const code = compile('seed.ts');
async function execute(env, real) {
  let finish,
    hashes = 0,
    queries = 0,
    error = '';
  const done = new Promise((r) => {
    finish = r;
  });
  const fakeRequire = (name) => {
    if (name === './seed-guards') return guards;
    if (name === '@prisma/client')
      return {
        PrismaClient: class {
          account = real
            ? new Proxy(real.account, {
                get(target, key) {
                  return (...args) => {
                    queries++;
                    return target[key](...args);
                  };
                },
              })
            : new Proxy(
                {},
                {
                  get() {
                    return () => {
                      queries++;
                      throw Error('UNEXPECTED_DB');
                    };
                  },
                },
              );
          organization = {
            upsert() {
              throw Error('STOP_AFTER_ACCOUNTS');
            },
          };
          $disconnect() {
            finish();
            return Promise.resolve();
          }
        },
        Prisma: {},
        Role: { ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
        ChatThemeStatus: {},
        TaskStatus: {},
        MembershipScopeType: {},
      };
    if (name === '@rete/shared')
      return {
        DEFAULT_ORG_ID: 'audit',
        DEFAULT_PROJECT_ID: 'audit',
        DEFAULT_CHANNEL_ID: 'audit',
        REACTION_EMOJIS: [],
      };
    if (name === '@node-rs/argon2')
      return {
        hash: async (value) => {
          hashes++;
          if (!real) throw Error('STOP_BEFORE_DB');
          return require(name).hash(value);
        },
      };
    if (name.includes('display-name'))
      return { splitDisplayName: () => ({ familyName: 'Test', givenName: 'Fixture' }) };
    if (name.includes('env-validation')) return { validateDatabasePoolLimits: () => null };
    return require(name);
  };
  vm.runInNewContext(code, {
    require: fakeRequire,
    exports: {},
    process: { env, exit() {} },
    console: {
      log() {},
      warn() {},
      error(e) {
        error = e.message;
      },
    },
    Buffer,
  });
  await done;
  return { hashes, queries, error };
}
const unique = {
  SEED_ADMIN_PASSWORD: 'local-audit-admin-unique!',
  SEED_DEMO_PASSWORD: 'local-audit-demo-unique!',
};
for (const nodeEnv of [undefined, 'unexpected', 'production', 'development', 'test']) {
  for (const allow of [undefined, '0', 'false', '1']) {
    test(`full seed environment boundary: ${nodeEnv ?? 'unset'}/${allow ?? 'unset'}`, async () => {
      const r = await execute({ NODE_ENV: nodeEnv, ALLOW_SEED: allow });
      assert.equal(r.hashes > 0, nodeEnv === 'development' || nodeEnv === 'test');
      assert.equal(r.queries, 0);
    });
  }
}
for (const nodeEnv of [undefined, 'unexpected', 'production']) {
  for (const key of ['SEED_ADMIN_PASSWORD', 'SEED_DEMO_PASSWORD']) {
    for (const value of [
      undefined,
      '',
      '   ',
      guards.DEFAULT_ADMIN_PASSWORD,
      guards.DEFAULT_DEMO_PASSWORD,
    ]) {
      test(`full seed rejects nonlocal unsafe input: ${nodeEnv ?? 'unset'}/${key}/${value === undefined ? 'missing' : value.length}`, async () => {
        const r = await execute({ NODE_ENV: nodeEnv, ALLOW_SEED: '1', ...unique, [key]: value });
        assert.equal(r.hashes, 0);
        assert.equal(r.queries, 0);
        assert.ok(r.error.includes(key));
        for (const secret of Object.values(unique)) assert.equal(r.error.includes(secret), false);
      });
    }
  }
  test(`full seed accepts independent nonlocal inputs: ${nodeEnv ?? 'unset'}`, async () => {
    const r = await execute({ NODE_ENV: nodeEnv, ALLOW_SEED: '1', ...unique });
    assert.equal(r.hashes, 1);
    assert.equal(r.queries, 0);
    assert.equal(r.error, 'STOP_BEFORE_DB');
  });
}
test(
  'disposable real DB: new accounts and repeat seed preserve existing password hashes',
  { skip: !process.env.TEST_SEED_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_SEED_DATABASE_URL);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '55435');
    assert.match(url.pathname, /^\/v2_354(?:_[a-f0-9]{8})?$/);
    const { PrismaClient } = require('@prisma/client');
    const client = new PrismaClient({ datasourceUrl: url.href });
    try {
      assert.equal(await client.account.count(), 0, 'Use a fresh disposable DB');
      const first = await execute({ NODE_ENV: 'production', ALLOW_SEED: '1', ...unique }, client);
      assert.equal(first.error, 'STOP_AFTER_ACCOUNTS');
      const rows = await client.account.findMany({ orderBy: { id: 'asc' } });
      assert.equal(rows.length, 8);
      assert.ok(
        await require('@node-rs/argon2').verify(rows[0].passwordHash, unique.SEED_ADMIN_PASSWORD),
      );
      const second = await execute(
        {
          NODE_ENV: 'production',
          ALLOW_SEED: '1',
          SEED_ADMIN_PASSWORD: 'another-local-admin-value!',
          SEED_DEMO_PASSWORD: 'another-local-demo-value!',
        },
        client,
      );
      assert.equal(second.error, 'STOP_AFTER_ACCOUNTS');
      const after = await client.account.findMany({ orderBy: { id: 'asc' } });
      assert.deepEqual(
        after.map((r) => r.passwordHash),
        rows.map((r) => r.passwordHash),
      );
      const rejected = await execute({ NODE_ENV: 'production', ALLOW_SEED: '1' }, client);
      assert.equal(rejected.queries, 0);
    } finally {
      await client.$disconnect();
    }
  },
);
