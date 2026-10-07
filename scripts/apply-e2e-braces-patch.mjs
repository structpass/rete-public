import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyPlaywrightProxyPatch } from './apply-e2e-playwright-proxy-patch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
console.log(JSON.stringify(applyPlaywrightProxyPatch(root)));
const e2e = join(root, 'e2e');
const installed = realpathSync(join(e2e, 'node_modules'));
const lock = JSON.parse(readFileSync(join(e2e, 'package-lock.json'), 'utf8'));
const patch = join(root, 'patches', 'braces@3.0.3.patch');
const targets = Object.entries(lock.packages).filter(([name]) => name.endsWith('/braces'));
assert.ok(targets.length > 0, 'No E2E braces installation recorded');

function git(args) {
  const result = spawnSync('git', ['apply', ...args, patch], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

for (const [name, manifest] of targets) {
  assert.equal(manifest.version, '3.0.3', 'Review a changed E2E braces version before patching');
  assert.ok(name.startsWith('node_modules/'));
  assert.ok(!name.split('/').some((part) => part === '..' || part === '.'));
  const directory = realpathSync(join(e2e, name));
  assert.ok(
    directory.startsWith(installed + sep),
    'E2E dependency must remain inside node_modules',
  );
  const actual = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  assert.equal(actual.name, 'braces');
  assert.equal(actual.version, manifest.version);
  const prefix = relative(root, directory).split(sep).join('/');
  if (git(['--reverse', '--check', '--directory=' + prefix]).status !== 0) {
    const check = git(['--check', '--directory=' + prefix]);
    assert.equal(
      check.status,
      0,
      check.stderr || 'Dependency differs from the complete reviewed patch',
    );
    const apply = git(['--directory=' + prefix]);
    assert.equal(apply.status, 0, apply.stderr || 'E2E dependency patch failed');
  }
  assert.equal(git(['--reverse', '--check', '--directory=' + prefix]).status, 0);
  const require = createRequire(join(directory, 'package.json'));
  const braces = require(join(directory, 'index.js'));
  assert.deepEqual(braces.expand('{a,b}'), ['a', 'b']);
  assert.throws(() => braces.parse('{'.repeat(101) + 'a' + '}'.repeat(101)), SyntaxError);
  console.log(
    JSON.stringify({ dependency: name, version: actual.version, patch: 'applied-and-verified' }),
  );
}

if (process.argv.includes('--test')) {
  const result = spawnSync(
    process.execPath,
    ['--test', join(root, 'scripts', 'check-braces-patch.test.cjs')],
    {
      cwd: root,
      env: { ...process.env, BRACES_PATCH_NPM_ROOT: e2e },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
