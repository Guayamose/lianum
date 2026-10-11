/** Existing financial capsule plus the fixed portable client modules actually
 * executed by the device-owned D26 step. No caller-selected files/pins. */
import assert from 'node:assert/strict';
import {projectRoot} from '@lianum/environment';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, FLAT } from '@lianum/proofs/catalog';
import { pairedNativeNoteSourcePinsV2 } from './paired-native-note-source-pins-v2.mjs';
const MOBILE = resolve(FLAT, '../../../apps/mobile');
const CLIENT = Object.freeze(['src/api/original-account-api-v2.mjs', 'src/custody/signing.mjs',
  'src/custody/balance-note-codec-v1.mjs', 'src/custody/unissued-deposit-terms-v1.mjs']);
export function deviceOwnerDepositSourcePinsV1() {
  assert.equal(arguments.length, 0, 'DEVICE_DEPOSIT_SOURCE_NO_OPTIONS');
  const original = pairedNativeNoteSourcePinsV2();
  assert.equal(realpathSync(MOBILE), MOBILE);
  const client = CLIENT.map(name => {
    let current = MOBILE;
    for (const part of name.split('/')) { current = join(current, part); assert.equal(lstatSync(current).isSymbolicLink(), false); }
    const before = lstatSync(current); assert.ok(before.isFile() && before.size <= 1024 * 1024);
    const bytes = readFileSync(current), after = lstatSync(current);
    for (const key of ['dev','ino','size','mtimeMs','ctimeMs']) assert.equal(after[key], before[key]);
    assert.equal(bytes.length, before.size);
    return { path: 'mobile-app/' + name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const runner = ['tests/integration/wallet/native/run-device-owner-deposit-v1.mjs', 'tests/integration/wallet/native/device-owner-deposit-flow-v1.mjs'].map(name => {
    const path = join(projectRoot, name); assert.equal(realpathSync(path), path);
    const before = lstatSync(path); assert.ok(before.isFile() && !before.isSymbolicLink() && before.size <= 65536);
    const bytes = readFileSync(path), after = lstatSync(path);
    for (const key of ['dev','ino','size','mtimeMs','ctimeMs']) assert.equal(after[key], before[key]);
    assert.equal(bytes.length, before.size);
    return { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  return { ...original, format: 'LIANUM_DEVICE_OWNER_DEPOSIT_SOURCE_CAPSULE_V1', client, runner };
}
