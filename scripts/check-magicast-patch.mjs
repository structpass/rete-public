import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gitBlob } from './apply-e2e-playwright-proxy-patch.mjs';

export const PATCHED_MAGICAST_BLOB = 'de8b4180743bdc85ae12b8e2fdd81f7e24666685';

export function verifyMagicastSource(source) {
  verifyMagicastBytes(readFileSync(source));
}

export function verifyMagicastBytes(bytes) {
  assert.equal(
    gitBlob(bytes),
    PATCHED_MAGICAST_BLOB,
    'Unknown or unpatched complete magicast source; reinstall the reviewed native patch',
  );
}
