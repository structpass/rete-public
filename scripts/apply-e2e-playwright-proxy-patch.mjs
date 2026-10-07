import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ORIGINAL_NETWORK_BLOB = 'dc3d4d0e2eba58443f1bbde07b91d345979e4cda';
export const PATCHED_NETWORK_BLOB = 'eeb9d3f064085a4ae2132b7dd7d4b541a51427e4';
const PATCH_BLOB = '24f22657d732fff1d8b022af6a5722f1d52482ee';
export const ORIGINAL_AGENT_BLOB = '09cee8c08f77331af62266033245f98ae567584f';
export const PATCHED_AGENT_BLOB = '8cce6d4be444abc60b97cac2644b51380c3b9b56';
const ALPN_PATCH_BLOB = 'e65d9f5ca3ca8a4a23b9c902b0969625e5162a9e';

export function gitBlob(bytes) {
  return execFileSync('git', ['hash-object', '--stdin'], {
    input: bytes,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

export function applyPlaywrightProxyPatch(checkout) {
  const root = realpathSync(checkout);
  const e2e = realpathSync(join(root, 'e2e'));
  const installed = realpathSync(join(e2e, 'node_modules'));
  const inside = (parent, child) =>
    assert.ok(child.startsWith(parent + sep), 'Dependency path escapes its reviewed directory');
  inside(root, e2e);
  inside(e2e, installed);
  const manifest = JSON.parse(readFileSync(join(e2e, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(e2e, 'package-lock.json'), 'utf8'));
  assert.equal(manifest.devDependencies['@playwright/test'], '1.55.1');
  assert.equal(lock.packages[''].devDependencies['@playwright/test'], '1.55.1');
  const require = createRequire(join(e2e, 'package.json'));
  let directory;
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    const targets = Object.entries(lock.packages).filter(
      ([key]) => key === 'node_modules/' + name || key.endsWith('/node_modules/' + name),
    );
    assert.equal(targets.length, 1, 'Review duplicate Playwright copies before patching');
    const [key, entry] = targets[0];
    assert.equal(key, 'node_modules/' + name, 'Review a changed Playwright layout');
    assert.equal(entry.version, '1.55.1');
    const pkgPath = realpathSync(require.resolve(name + '/package.json'));
    const pkgDir = realpathSync(join(e2e, key));
    inside(installed, pkgDir);
    assert.equal(dirname(pkgPath), pkgDir);
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, name);
    assert.equal(pkg.version, '1.55.1');
    if (name === 'playwright-core') directory = pkgDir;
  }
  const sourcePath = realpathSync(join(directory, 'lib/server/utils/network.js'));
  inside(directory, sourcePath);
  const patchPath = realpathSync(join(root, 'scripts/playwright-core@1.55.1-proxy-tls.patch'));
  inside(root, patchPath);
  const patchBytes = Buffer.from(readFileSync(patchPath, 'utf8').replace(/\r\n/g, '\n'));
  assert.equal(gitBlob(patchBytes), PATCH_BLOB, 'Review a changed patch artifact');
  const before = gitBlob(readFileSync(sourcePath));
  assert.ok(
    [ORIGINAL_NETWORK_BLOB, PATCHED_NETWORK_BLOB].includes(before),
    'Unknown complete Playwright source; refusing mutation',
  );
  const alpnPatchPath = realpathSync(
    join(root, 'scripts/playwright-core@1.55.1-proxy-alpn.patch.json'),
  );
  inside(root, alpnPatchPath);
  const alpnPatchBytes = Buffer.from(readFileSync(alpnPatchPath, 'utf8').replace(/\r\n/g, '\n'));
  assert.equal(gitBlob(alpnPatchBytes), ALPN_PATCH_BLOB, 'Review a changed ALPN patch artifact');
  const alpnPatch = JSON.parse(alpnPatchBytes);
  const agentPath = realpathSync(join(directory, alpnPatch.source));
  inside(directory, agentPath);
  const agentBytes = readFileSync(agentPath);
  const agentBefore = gitBlob(agentBytes);
  assert.ok(
    [ORIGINAL_AGENT_BLOB, PATCHED_AGENT_BLOB].includes(agentBefore),
    'Unknown complete Playwright Agent source; refusing mutation',
  );
  let agentAfter = agentBytes;
  if (agentBefore === ORIGINAL_AGENT_BLOB) {
    const text = agentBytes.toString('utf8');
    assert.equal(text.split(alpnPatch.from).length, 2, 'ALPN patch must match exactly once');
    agentAfter = Buffer.from(text.replace(alpnPatch.from, alpnPatch.to));
  }
  assert.equal(gitBlob(agentAfter), PATCHED_AGENT_BLOB);
  // Preflight both sources and both artifacts before changing either source.
  const prefix = relative(root, directory).split(sep).join('/');
  const apply = (args) => {
    const result = spawnSync(
      'git',
      ['-c', 'core.autocrlf=false', 'apply', ...args, '--directory=' + prefix, '-'],
      { cwd: root, input: patchBytes, encoding: 'utf8', windowsHide: true },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || 'Playwright proxy patch failed');
  };
  if (before === ORIGINAL_NETWORK_BLOB) apply(['--check']);
  if (before === ORIGINAL_NETWORK_BLOB) apply([]);
  if (agentBefore === ORIGINAL_AGENT_BLOB) writeFileSync(agentPath, agentAfter);
  assert.equal(gitBlob(readFileSync(sourcePath)), PATCHED_NETWORK_BLOB);
  assert.equal(gitBlob(readFileSync(agentPath)), PATCHED_AGENT_BLOB);
  return {
    dependency: 'playwright-core',
    version: '1.55.1',
    patch:
      before === PATCHED_NETWORK_BLOB && agentBefore === PATCHED_AGENT_BLOB
        ? 'already-verified'
        : 'applied-and-verified',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    JSON.stringify(
      applyPlaywrightProxyPatch(resolve(dirname(fileURLToPath(import.meta.url)), '..')),
    ),
  );
}
