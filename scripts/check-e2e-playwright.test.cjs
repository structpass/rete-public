const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const e2e = path.resolve(__dirname, '../e2e');
const requireE2e = createRequire(path.join(e2e, 'package.json'));
const manifest = requireE2e('./package.json');
const lock = requireE2e('./package-lock.json');
const core = path.dirname(requireE2e.resolve('playwright-core/package.json'));

test('the installed Playwright trio matches the exact E2E lock and dependency', () => {
  assert.equal(manifest.devDependencies['@playwright/test'], '1.55.1');
  assert.equal(lock.packages[''].devDependencies['@playwright/test'], '1.55.1');
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    assert.equal(requireE2e(`${name}/package.json`).version, '1.55.1');
    assert.equal(lock.packages[`node_modules/${name}`].version, '1.55.1');
  }
});

for (const name of [
  'reinstall_chrome_stable_mac.sh',
  'reinstall_chrome_beta_mac.sh',
  'reinstall_msedge_stable_mac.sh',
  'reinstall_msedge_beta_mac.sh',
  'reinstall_msedge_dev_mac.sh',
]) {
  test(`${name}: curl retains its download and validates certificates`, () => {
    const source = fs.readFileSync(path.join(core, 'bin', name), 'utf8');
    const commands = source.split(/\r?\n/).filter((line) => /^\s*curl\s/.test(line));
    assert.equal(commands.length, 1);
    const tokens = commands[0].trim().split(/\s+/);
    assert(tokens.includes('-o'), 'the installer still writes its downloaded package');
    for (const token of tokens) {
      assert(!/^--insecure(?:=|$)/.test(token), 'curl must validate the certificate');
      assert(!/^-[^-]*k/.test(token), 'curl short options must not include insecure');
    }
    if (name.includes('chrome')) {
      assert(tokens.some((token) => /^https:\/\/dl\.google\.com\//.test(token)));
      assert(source.includes('hdiutil attach'));
    } else {
      assert(tokens.includes('"$1"'), 'Edge retains its caller-supplied artifact URL');
      assert(source.includes('sudo installer -pkg'));
    }
  });
}

test('Edge obtains channel metadata through HTTPS before selecting an artifact', () => {
  const source = fs.readFileSync(path.join(core, 'lib/server/registry/index.js'), 'utf8');
  const start = source.indexOf('async _installMSEdgeChannel(');
  assert(start >= 0);
  const method = source.slice(start, source.indexOf('async _', start + 1));
  assert(method.includes('https://edgeupdates.microsoft.com/api/products'));
  assert(/scriptArgs\.push\(\s*artifact\.location/.test(method));
  // The artifact URL is dynamic; this check makes no claim about a live response.
});
