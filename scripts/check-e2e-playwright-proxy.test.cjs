const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const core = path.join(root, 'e2e/node_modules/playwright-core');
const source = path.join(core, 'lib/server/utils/network.js');
const patch = path.join(__dirname, 'playwright-core@1.55.1-proxy-tls.patch');
const agentSource = path.join(core, 'lib/utilsBundleImpl/index.js');
const alpnPatch = path.join(__dirname, 'playwright-core@1.55.1-proxy-alpn.patch.json');
const helper = import(pathToFileURL(path.join(__dirname, 'apply-e2e-playwright-proxy-patch.mjs')));

function fixture() {
  const directory = fs.mkdtempSync(
    path.join(process.env.RETE_SECURITY_TMP || os.tmpdir(), 'rete-pw-guard-'),
  );
  const packages = {};
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'e2e/node_modules', name, 'package.json')),
    );
    const dir = path.join(directory, 'e2e/node_modules', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
    packages['node_modules/' + name] = { version: pkg.version };
  }
  packages[''] = { devDependencies: { '@playwright/test': '1.55.1' } };
  fs.writeFileSync(path.join(directory, 'e2e/package.json'), JSON.stringify(packages['']));
  fs.writeFileSync(path.join(directory, 'e2e/package-lock.json'), JSON.stringify({ packages }));
  const target = path.join(
    directory,
    'e2e/node_modules/playwright-core/lib/server/utils/network.js',
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let bytes = fs.readFileSync(source, 'utf8');
  bytes = bytes.replace(
    '      options.agent = new import_utilsBundle.HttpsProxyAgent(parsedProxyURL);\n',
    '      options.agent = new import_utilsBundle.HttpsProxyAgent(parsedProxyURL);\n      options.rejectUnauthorized = false;\n',
  );
  fs.writeFileSync(target, bytes);
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.copyFileSync(patch, path.join(directory, 'scripts', path.basename(patch)));
  fs.copyFileSync(alpnPatch, path.join(directory, 'scripts', path.basename(alpnPatch)));
  const agentTarget = path.join(
    directory,
    'e2e/node_modules/playwright-core/lib/utilsBundleImpl/index.js',
  );
  fs.mkdirSync(path.dirname(agentTarget), { recursive: true });
  fs.writeFileSync(
    agentTarget,
    fs
      .readFileSync(agentSource, 'utf8')
      .replace('r.ALPNProtocols=["http/1.1"]', 'r.ALPNProtocols=["http 1.1"]'),
  );
  return { directory, target, agentTarget };
}

function dispose(directory) {
  const parent = fs.realpathSync(process.env.RETE_SECURITY_TMP || os.tmpdir());
  assert.equal(path.dirname(fs.realpathSync(directory)), parent);
  assert(path.basename(directory).startsWith('rete-pw-guard-'));
  fs.rmSync(directory, { recursive: true, force: true });
}

test('exact installed source is patched and strict application is idempotent', async () => {
  const { applyPlaywrightProxyPatch, gitBlob, PATCHED_NETWORK_BLOB, PATCHED_AGENT_BLOB } =
    await helper;
  assert.equal(gitBlob(fs.readFileSync(source)), PATCHED_NETWORK_BLOB);
  assert.equal(gitBlob(fs.readFileSync(agentSource)), PATCHED_AGENT_BLOB);
  assert.equal(applyPlaywrightProxyPatch(root).patch, 'already-verified');
  const { directory, target, agentTarget } = fixture();
  try {
    const fixturePatch = path.join(directory, 'scripts', path.basename(patch));
    fs.writeFileSync(fixturePatch, fs.readFileSync(fixturePatch, 'utf8').replace(/\n/g, '\r\n'));
    const fixtureAlpnPatch = path.join(directory, 'scripts', path.basename(alpnPatch));
    fs.writeFileSync(
      fixtureAlpnPatch,
      fs.readFileSync(fixtureAlpnPatch, 'utf8').replace(/\n/g, '\r\n'),
    );
    assert.equal(applyPlaywrightProxyPatch(directory).patch, 'applied-and-verified');
    const first = fs.readFileSync(target);
    assert.equal(gitBlob(first), PATCHED_NETWORK_BLOB);
    const firstAgent = fs.readFileSync(agentTarget);
    assert.equal(gitBlob(firstAgent), PATCHED_AGENT_BLOB);
    assert.equal(applyPlaywrightProxyPatch(directory).patch, 'already-verified');
    assert.deepEqual(fs.readFileSync(target), first);
    assert.deepEqual(fs.readFileSync(agentTarget), firstAgent);
  } finally {
    dispose(directory);
  }
});

for (const kind of [
  'unknown-source',
  'unknown-agent-source',
  'patch-drift',
  'alpn-patch-drift',
  'manifest-version',
  'lock-version',
  'duplicate-core',
  'installed-version',
  'source-escape',
  'agent-source-escape',
]) {
  test(`${kind}: strict guard rejects before changing source`, async () => {
    const { applyPlaywrightProxyPatch } = await helper;
    const { directory, target, agentTarget } = fixture();
    const lockPath = path.join(directory, 'e2e/package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath));
    let outside;
    try {
      if (kind === 'unknown-source') fs.appendFileSync(target, '\n// unreviewed mutation\n');
      if (kind === 'unknown-agent-source')
        fs.appendFileSync(agentTarget, '\n// unreviewed mutation\n');
      if (kind === 'alpn-patch-drift')
        fs.appendFileSync(path.join(directory, 'scripts', path.basename(alpnPatch)), '\n ');
      if (kind === 'patch-drift')
        fs.appendFileSync(path.join(directory, 'scripts', path.basename(patch)), '\n# changed\n');
      if (kind === 'manifest-version')
        fs.writeFileSync(
          path.join(directory, 'e2e/package.json'),
          JSON.stringify({ devDependencies: { '@playwright/test': '1.59.1' } }),
        );
      if (kind === 'lock-version') {
        lock.packages['node_modules/playwright-core'].version = '1.59.1';
        fs.writeFileSync(lockPath, JSON.stringify(lock));
      }
      if (kind === 'duplicate-core') {
        lock.packages['node_modules/example/node_modules/playwright-core'] = { version: '1.55.1' };
        fs.writeFileSync(lockPath, JSON.stringify(lock));
      }
      if (kind === 'installed-version') {
        const pkgPath = path.join(directory, 'e2e/node_modules/playwright-core/package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath));
        pkg.version = '1.59.1';
        fs.writeFileSync(pkgPath, JSON.stringify(pkg));
      }
      if (kind === 'source-escape') {
        const originalDirectory = path.dirname(target),
          externalDirectory = path.join(directory, 'outside');
        assert(originalDirectory.startsWith(directory + path.sep));
        fs.renameSync(originalDirectory, externalDirectory);
        fs.symlinkSync(externalDirectory, originalDirectory, 'junction');
        outside = path.join(externalDirectory, 'network.js');
      }
      if (kind === 'agent-source-escape') {
        const originalDirectory = path.dirname(agentTarget),
          externalDirectory = path.join(directory, 'outside');
        assert(originalDirectory.startsWith(directory + path.sep));
        fs.renameSync(originalDirectory, externalDirectory);
        fs.symlinkSync(externalDirectory, originalDirectory, 'junction');
        outside = path.join(externalDirectory, 'index.js');
      }
      const before = fs.readFileSync(target);
      const agentBefore = fs.readFileSync(agentTarget);
      assert.throws(() => applyPlaywrightProxyPatch(directory));
      assert.deepEqual(fs.readFileSync(target), before);
      assert.deepEqual(fs.readFileSync(agentTarget), agentBefore);
      if (outside)
        assert.deepEqual(fs.readFileSync(outside), kind === 'source-escape' ? before : agentBefore);
    } finally {
      dispose(directory);
    }
  });
}

for (const alreadyFixed of ['network', 'agent']) {
  test(`mixed ${alreadyFixed} already-fixed state is verified before patching the other source`, async () => {
    const { applyPlaywrightProxyPatch, gitBlob, PATCHED_NETWORK_BLOB, PATCHED_AGENT_BLOB } =
      await helper;
    const { directory, target, agentTarget } = fixture();
    try {
      fs.copyFileSync(
        alreadyFixed === 'network' ? source : agentSource,
        alreadyFixed === 'network' ? target : agentTarget,
      );
      assert.equal(applyPlaywrightProxyPatch(directory).patch, 'applied-and-verified');
      assert.equal(gitBlob(fs.readFileSync(target)), PATCHED_NETWORK_BLOB);
      assert.equal(gitBlob(fs.readFileSync(agentTarget)), PATCHED_AGENT_BLOB);
      assert.equal(applyPlaywrightProxyPatch(directory).patch, 'already-verified');
    } finally {
      dispose(directory);
    }
  });
}

test('actual bundled Agent uses standard default ALPN and preserves explicit custom values', () => {
  const { HttpsProxyAgent } = require(path.join(core, 'lib/utilsBundle.js'));
  for (const options of [
    { host: 'localhost', port: 1234, protocol: 'https:' },
    { host: 'localhost', port: 1234, secureProxy: true },
  ]) {
    const agent = new HttpsProxyAgent(options);
    assert.deepEqual(agent.proxy.ALPNProtocols, ['http/1.1']);
    agent.destroy();
  }
  for (const explicit of [['custom-fixture'], [], undefined]) {
    const agent = new HttpsProxyAgent({
      host: 'localhost',
      port: 1234,
      protocol: 'https:',
      ALPNProtocols: explicit,
    });
    assert.equal(agent.proxy.ALPNProtocols, explicit);
    agent.destroy();
  }
  const ordinary = new HttpsProxyAgent('http://localhost:1234');
  assert.equal(Object.hasOwn(ordinary.proxy, 'ALPNProtocols'), false);
  ordinary.destroy();
});

test('actual shared TLS boundary and ordinary controls through bounded loopback', () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'playwright-proxy-loopback.cjs'),
      root,
      path.join(__dirname, 'playwright-proxy-fixtures.json'),
      'fixed',
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: path.join(__dirname, 'playwright-proxy-test-ca.pem'),
      },
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert(proof.noExternalOriginOrInstaller);
  assert(proof.closedSockets);
  assert(proof.records.length >= 40);
});

test('actual Edge metadata failure stops installation and explicit TLS policy reaches bundled Agent', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'playwright-proxy-edge.cjs'), root],
    { windowsHide: true, encoding: 'utf8', timeout: 10000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert(proof.failureStopsInstaller);
  assert(proof.normalMetadataRetained);
  assert(proof.noSocketsOrInstaller);
});
