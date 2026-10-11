/** Fixed V5 source capsule including physical public client/dependencies and
 * Python launchers. The V5 literal is retained separately, avoiding self hash. */
import assert from 'node:assert/strict';
import {projectRoot} from '@lianum/environment';
import { join } from 'node:path';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { ROOT } from '@lianum/proofs/catalog';
import { verifyAPI, verifyVendor, hash } from '@lianum/proofs/tooling/tooling';
import { captureNativeValueCurrentHostSourcesV6 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-source-pins-v5.mjs';
export function pairedNativeNoteSourcePinsV2() {
  assert.equal(arguments.length, 0, 'PAIRED_NATIVE_NOTE_SOURCE_NO_OPTIONS');
  const local = captureNativeValueCurrentHostSourcesV6();
  const releasePath = join(projectRoot, 'packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs');
  assert.equal(realpathSync(releasePath), releasePath, 'PAIRED_NATIVE_NOTE_FIXED_LITERAL_PATH');
  const before = lstatSync(releasePath);
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size <= 2 * 1024 * 1024,
    'PAIRED_NATIVE_NOTE_FIXED_LITERAL_FILE');
  const bytes = readFileSync(releasePath), after = lstatSync(releasePath);
  for (const key of ['dev','ino','size','mtimeMs','ctimeMs']) assert.equal(after[key], before[key], 'PAIRED_NATIVE_NOTE_LITERAL_CHANGED');
  assert.equal(bytes.length, before.size, 'PAIRED_NATIVE_NOTE_LITERAL_CHANGED');
  return { format: 'LIANUM_PAIRED_NATIVE_NOTE_SOURCE_CAPSULE_V2', local,
    devLiteral: { path: 'wallet-platform/modules/ops/native-value-dev-release-v5.mjs', bytes: bytes.length, sha256: hash(bytes) },
    officialAPI: verifyAPI(), vendor: verifyVendor() };
}
