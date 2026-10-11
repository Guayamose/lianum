/** Durable data contracts. Successful validation never grants runtime or
 * recovery authority: the registry owner still checks original handles. */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { exactRecord } from '@lianum/components/encoding/commitments';

export const WRAPPED_LIFETIME_PROFILE_V1 = 'WRAPPED_FIXED_PRIVATE_LIFETIME_REGISTRY_V1';
export const WRAPPED_LIFETIME_PARTS_V1 = Object.freeze([
  'native-receiver',
  'native-bitcoin',
  'native-solana',
  'native-graph-evm',
  'native-graph-tron',
  'operator-keys',
  'custody-bootstrap',
  'owner-0',
  'owner-1',
  'claim-keeper',
  'wallet',
  'wallet-account-0',
  'wallet-account-1',
  'wallet-execution-0',
  'wallet-execution-1',
  'wallet-graph-keeper',
  'wallet-graph-keeper-0',
  'wallet-graph-keeper-1',
  'wallet-withdrawal',
  'wallet-catalogue',
  'device-external-flat-system',
  'device-external-flat-account-0',
  'device-external-flat-account-1',
  ...Array.from({ length: 4 }, (_, i) => 'device-external-flat-account-multi-' + i),
  ...[
    'wallet-catalogue-keeper',
    'wallet-official-vault',
    'wallet-vault-exit',
    'provider',
    'recipient',
  ].flatMap((family) => Array.from({ length: 8 }, (_, i) => family + '-' + i)),
]);

/** @typedef {{profile: string, directory: string, runId: string,
 * sourceSHA256: string, deadlineMs: number, genesis: string, chainId: string}} LifetimeIdentity
 * @typedef {{revision: number, commitment: string}} LifetimeCheckpoint
 * @typedef {{identity: unknown, privateState: unknown, version: number}} LifetimePart
 * @typedef {{profile: string, identity: LifetimeIdentity,
 * parts: Record<string, LifetimePart>}} LifetimeData
 * @typedef {{revision: number, commitment: string, data: LifetimeData}} LifetimeRecord
 */

/** @typedef {{directory: string, runId: string, sourceSHA256: string, deadlineMs: number}} AttemptIdentity
 * @typedef {AttemptIdentity & {runtime: {metadata: {evmGenesis: string, chainId: string}}}} LifetimeInput
 */
const DEVICE_ATTEMPTS = Object.freeze([
  'device-external-flat-ordered-observation-v1',
  'device-morpho-blue-private-position-v1',
]);

/** Pure namespace policy. The result never authenticates a receiver.
 * @param {string} directory @param {string} runId @param {string} root
 */
export function isDeviceWrappedLifetimeDirectoryV1(directory, runId, root) {
  return DEVICE_ATTEMPTS.some(
    (stem) => directory === join(root, '.local', stem, 'attempt-' + runId, 'private-audit'),
  );
}

/** @param {LifetimeInput} input @param {string} root @returns {AttemptIdentity & {profile: string}} */
export function wrappedLifetimeInputIdentityV1(input, root) {
  exactRecord(input, ['runtime', 'directory', 'runId', 'sourceSHA256', 'deadlineMs']);
  assert.match(
    input.runId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.match(input.sourceSHA256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(input.deadlineMs) && input.deadlineMs > 0);
  assert.ok(
    [
      'wrapped-wallet-fixed-acceptance-v1',
      'wrapped-wallet-fixed-preflight-v1',
      'wrapped-deployment-only-v1',
      'external-defi-owner-cycle-v1',
      ...DEVICE_ATTEMPTS,
    ].some(
      (stem) =>
        input.directory === join(root, '.local', stem, 'attempt-' + input.runId, 'private-audit'),
    ),
    'WRAPPED_LIFETIME_FIXED_ATTEMPT_DIRECTORY',
  );
  return {
    profile: WRAPPED_LIFETIME_PROFILE_V1,
    directory: input.directory,
    runId: input.runId,
    sourceSHA256: input.sourceSHA256,
    deadlineMs: input.deadlineMs,
  };
}

/** Pure data validation shared by the device recovery issuer and namespace tests.
 * Calling this function creates no authority, section token or journal.
 * @param {AttemptIdentity} input @param {string} root
 */
export function deviceWrappedRecoveryIdentityV1(input, root) {
  exactRecord(input, ['directory', 'runId', 'sourceSHA256', 'deadlineMs']);
  assert.match(
    input.runId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(resolve(input.directory), input.directory);
  assert.ok(
    isDeviceWrappedLifetimeDirectoryV1(input.directory, input.runId, root),
    'DEVICE_EXTERNAL_FLAT_FIXED_RECOVERY_ATTEMPT',
  );
  assert.ok(
    typeof input.sourceSHA256 === 'string' &&
      /^[0-9a-f]{64}$/.exec(input.sourceSHA256)?.[0] === input.sourceSHA256,
  );
  assert.ok(Number.isSafeInteger(input.deadlineMs) && input.deadlineMs > 0);
  return { profile: 'DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1', ...input };
}

/** @param {unknown} value @returns {asserts value is Record<string, unknown>} */
function record(value) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
}

/** @param {unknown} value @param {LifetimeIdentity} identity
 * @returns {asserts value is LifetimeRecord}
 */
export function assertWrappedLifetimeRecordV1(value, identity) {
  record(value);
  const data = value.data;
  record(data);
  exactRecord(data, ['profile', 'identity', 'parts']);
  assert.equal(data.profile, WRAPPED_LIFETIME_PROFILE_V1);
  assert.ok(
    isDeepStrictEqual(data.identity, identity),
    'WRAPPED_LIFETIME_PRIVATE_IDENTITY_CHANGED',
  );
  record(data.parts);
  for (const [name, row] of Object.entries(data.parts)) {
    assert.ok(WRAPPED_LIFETIME_PARTS_V1.includes(name));
    record(row);
    exactRecord(row, ['identity', 'privateState', 'version']);
    assert.ok(
      typeof row.version === 'number' && Number.isSafeInteger(row.version) && row.version >= 1,
    );
  }
  assert.ok(
    typeof value.revision === 'number' &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0,
  );
  assert.ok(typeof value.commitment === 'string' && /^[0-9a-f]{64}$/.test(value.commitment));
}

/** @param {LifetimeCheckpoint} value @returns {Readonly<LifetimeCheckpoint>} */
export function wrappedLifetimeCheckpointV1(value) {
  return Object.freeze({ revision: value.revision, commitment: value.commitment });
}
