/** Initial local product realm, born before any device D26. Fixed original
 * V2/V5 factories supply every economic capability. Input is infrastructure
 * plus one explicitly paired public device key; never a note/root, account DTO,
 * SQL executor, signer, proof or callback. Local values are not mainnet assets. */
import assert from 'node:assert/strict';
import { randomBytes, createPublicKey } from 'node:crypto';
import { mkdir, mkdtemp, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../../../../proofs/src/catalog.mjs';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { normalizeMobileOrigin } from '../../../../mobile-protocol/src/authorization.mjs';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { createOwnedNativeEconomicReceiverV2, createOwnedNativeEconomicGraphRuntimeV2 }
  from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { createOwnedLocalNativeValueOperatorBootstrap } from '../operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { deployNativeValueDevSystemV5 } from '../deployments/native-value/native-value-system-v2.mjs';
import { loadNativeValueDevDeploymentArtifactsV5 } from '../deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { NATIVE_VALUE_DEV_RELEASE_V5 } from '../releases/native-value/native-value-dev-release-v5.mjs';
import { createNativeValueOwnerProcess } from '../../../../custody/src/processes/native-value-owner-process-v2.mjs';
import { createNativeValueExecution, assertOwnedNativeValueExecution } from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import { createNativeValueAccountAuthority, assertOwnedNativeValueAccountAuthority } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import { createNativeValueManualGraphAccountSession } from '../../api/accounts/flat-manual-graph-session.mjs';
import { createPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 } from '../../api/mobile/paired-original-account-actor-v2.mjs';
import { createDeviceOwnerDepositBridgeV1 } from '../../accounts/authority/device-owner-deposit-bridge-v1.mjs';
import { createDeviceOwnerReservationBridgeV1 } from '../../accounts/authority/device-owner-reservation-bridge-v1.mjs';
import { createDeviceOwnerExecutionBridgeV1 } from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
import { assertOwnedNativeValueProviderCustody } from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import { createPairedDeviceAccountTlsServerV1 } from '../../api/mobile/paired-original-account-http-v2.mjs';
import { prepareOriginalNativeDeviceLocalProviderV1 } from './native-device-local-provider-v1.mjs';
const fresh = () => randomBytes(32).toString('hex');
export const ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1 = 'ORIGINAL_NATIVE_DEVICE_LOCAL_OPERATOR_V1';
const local = join(ROOT, '.local/original-device-local-operator-v1');
const requiredSources = Object.freeze([
  'wallet-platform/modules/ops/native-device-local-operator-v1.mjs',
  'wallet-platform/modules/ops/native-device-local-provider-v1.mjs',
  'workspace-module/apps/platform/src/original-device-local-operator-v1.mjs',
  'workspace-module/apps/platform/src/run-original-device-local-v1.mjs',
]);
export function originalNativeDeviceLocalConfigurationPathV1() {
  assert.equal(arguments.length, 0); return join(local, 'operator.json');
}
function configuration(input) {
  exactRecord(input, ['origin', 'devicePublicKey', 'tls']);
  const origin = normalizeMobileOrigin(input.origin), devicePublicKey = input.devicePublicKey;
  assert.ok(typeof devicePublicKey === 'string' && /^04[0-9a-f]{128}$/.exec(devicePublicKey)?.[0] === devicePublicKey,
    'NATIVE_DEVICE_PRODUCT_DEVICE_KEY');
  createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(devicePublicKey.slice(2, 66), 'hex').toString('base64url'),
    y: Buffer.from(devicePublicKey.slice(66), 'hex').toString('base64url') } });
  exactRecord(input.tls, ['certificate', 'privateKey']);
  for (const name of ['certificate', 'privateKey']) assert.ok(typeof input.tls[name] === 'string'
    && Buffer.byteLength(input.tls[name]) > 0 && Buffer.byteLength(input.tls[name]) <= 16384, 'NATIVE_DEVICE_PRODUCT_TLS');
  return { origin, devicePublicKey, tls: { certificate: input.tls.certificate, privateKey: input.tls.privateKey } };
}
/** Internal installation from actual bootstrap references. JSON/copies cannot
 * satisfy account/executor/provider brands; the actor validates the original
 * PREPARED session approval before any route is installed. No operation runs. */
export async function installOriginalNativeDeviceLocalServiceV1(input) {
  assert.equal(arguments.length, 1);
  exactRecord(input, ['runtime', 'system', 'owner', 'account', 'nativeExecution', 'session', 'approval', 'provider', 'configuration']);
  const { runtime, system, owner, account, nativeExecution, session, approval, provider } = input;
  const selected = configuration(input.configuration);
  assertOwnedNativeValueAccountAuthority(account, { runtime, system, poolIndex: 0, owner });
  assertOwnedNativeValueExecution(nativeExecution, { runtime, system, poolIndex: 0 });
  exactRecord(provider, ['nativePreparation', 'invoiceSignatures', 'custody', 'recipient', 'deliveryRiskSalt']);
  assertOwnedNativeValueProviderCustody(provider.custody, { runtime, system, poolIndex: 0 });
  let actor, depositBridge, reservationBridge, executionBridge, transport;
  try {
    actor = await createPairedOriginalAccountActorV2({ session, approval, owner,
      origin: selected.origin, devicePublicKey: selected.devicePublicKey });
    const original = { actor, account, owner, runtime, system, poolIndex: 0 };
    depositBridge = await createDeviceOwnerDepositBridgeV1(original);
    reservationBridge = await createDeviceOwnerReservationBridgeV1({ ...original,
      nativePreparation: provider.nativePreparation, invoiceSignatures: provider.invoiceSignatures });
    executionBridge = await createDeviceOwnerExecutionBridgeV1({ account, reservationBridge, nativeExecution,
      providers: [{ slot: 0, custody: provider.custody, deliveryRiskSalt: provider.deliveryRiskSalt }], runtime, system, poolIndex: 0 });
    transport = await createPairedDeviceAccountTlsServerV1({ depositBridge, reservationBridge, executionBridge, tls: selected.tls });
    return Object.freeze({ transport, actor, depositBridge, reservationBridge, executionBridge,
      descriptor: pairedOriginalAccountActorDescriptorV2(actor) });
  } catch (error) {
    const failures = [];
    for (const resource of [transport, executionBridge, reservationBridge, depositBridge, actor])
      try { await resource?.close(); } catch (failure) { failures.push(failure); }
    if (failures.length) throw new AggregateError([error, ...failures], 'NATIVE_DEVICE_PRODUCT_INSTALL_CLEANUP_UNCONFIRMED', { cause: error });
    throw error;
  }
}
/** The platform's fixed caller uses this constructor, not the internal install
 * input. Its source must be in the same reviewed physical V5 publication. */
export async function createOriginalNativeDeviceLocalOperatorV1(input) {
  assert.equal(arguments.length, 1); const selected = configuration(input); // detach before first await
  assert.ok(NATIVE_VALUE_DEV_RELEASE_V5 !== null && requiredSources.every(path =>
    NATIVE_VALUE_DEV_RELEASE_V5.sourceFiles.some(row => row.path === path)), 'NATIVE_DEVICE_PRODUCT_SOURCE_REVIEW_REQUIRED');
  await loadNativeValueDevDeploymentArtifactsV5(); // all physical source/artifact pins before allocation/spawn
  let runtime, nativeRuntime, bootstrap, system, owner, nativeExecution, account, joined, provider, installed, closing, ownerPassword, checkpoint;
  function close() {
    assert.equal(arguments.length, 0); return closing ??= (async () => {
    const failures = [], stopped = {};
    const stop = async (name, work, check) => {
      try { const result = await work(); assert.ok(check(result), 'NATIVE_DEVICE_PRODUCT_CLOSE_UNCONFIRMED'); stopped[name] = true; }
      catch (error) { stopped[name] = false; failures.push(error); }
    };
    // Listener fences new admissions and drains SAME admitted work first.
    if (installed) await stop('transport', () => installed.transport.close(), r => r.closed === true
      && r.originalWorkSettled === true && r.ownedSocketsRemaining === 0);
    if (account) await stop('accountAbort', () => account.abort(), r => r.cancelled === true);
    if (joined) await stop('session', () => joined.session.close(), r => r.phase === 'CLOSED');
    if (account) await stop('account', () => account.close(), r => r.closed === true);
    if (nativeExecution) await stop('executor', () => nativeExecution.close(), r => r.closed === true);
    // Original executor releases its lease before provider/recipient shutdown.
    if (provider) {
      await stop('provider', async () => { await provider.custody.close(); return provider.custody.report(); }, r => r.closed === true);
      await stop('recipient', () => provider.recipient.close(), r => r.exited === true && r.exit.code === 0 && r.exit.signal === null);
    }
    if (owner) await stop('owner', () => owner.close(), r => r.closed === true && r.childExited === true);
    if (bootstrap) await stop('bootstrap', async () => { bootstrap.close(); return { closed: true }; }, r => r.closed === true);
    for (const [name, resource] of [['receiver', runtime], ['nativeRuntime', nativeRuntime]]) if (resource)
      await stop(name, () => resource.close({ removeScratch: false }), r => r.stopped === true && resource.lifecycle.filter(row => row.event === 'stopped-owned-process').length === 1
        && resource.lifecycle.find(row => row.event === 'stopped-owned-process').forced === false);
    selected.tls = null;
    if (failures.length) throw new AggregateError(failures, 'NATIVE_DEVICE_PRODUCT_CLOSE_UNCONFIRMED');
    ownerPassword = null; checkpoint = null;
    return Object.freeze({ closed: true, originalResourcesStopped: true, retainedEncryptedJournals: true,
      normalCloseRestoresNewProcess: false, stopped: Object.freeze(stopped) });
  })();
  }
  try {
    runtime = await createOwnedNativeEconomicReceiverV2(); nativeRuntime = await createOwnedNativeEconomicGraphRuntimeV2();
    bootstrap = await createOwnedLocalNativeValueOperatorBootstrap({ nativeRuntimes: [nativeRuntime] });
    system = await deployNativeValueDevSystemV5({ runtime, options: { deploymentDomain: '0x' + fresh(), registryEpoch: '1', bootstrap,
      pools: [0, 1].map(() => ({ policy: '0x' + fresh(), deploymentDomain: '0x' + fresh() })) } });
    const nativeNow = await nativeRuntime.time(), receiverNow = await runtime.time();
    const receiverInitial = nativeNow + 1n - 3n;
    assert.ok(receiverNow <= receiverInitial, 'NATIVE_DEVICE_PRODUCT_INITIAL_CLOCK_ALIGNMENT');
    assert.ok((nativeNow - receiverInitial) * 1000n <= BigInt(bootstrap.metadata.adapterProfiles[0].profile.maximumClockSkewMs));
    assert.equal(nativeRuntime.transactions.length, 0);
    if (receiverNow < receiverInitial) await runtime.advanceTo(String(receiverInitial));
    assert.equal(await runtime.time(), receiverInitial); assert.equal(await nativeRuntime.time(), nativeNow);
    await mkdir(local, { recursive: true, mode: 0o700 });
    const localInfo = await lstat(local);
    assert.ok(localInfo.isDirectory() && !localInfo.isSymbolicLink() && localInfo.uid === process.getuid()
      && (localInfo.mode & 0o077) === 0 && await realpath(local) === local, 'NATIVE_DEVICE_PRODUCT_PRIVATE_DIRECTORY');
    const directory = await mkdtemp(join(local, 'realm-')), ownerDirectory = join(directory, 'owner');
    await mkdir(ownerDirectory, { mode: 0o700 });
    ownerPassword = fresh(); checkpoint = null;
    const checkpointVault = new Vault(join(ownerDirectory, 'operator-checkpoint.vault'));
    owner = await createNativeValueOwnerProcess({ runtime, system, poolIndex: 0, directory: ownerDirectory, password: ownerPassword,
      create: true, checkpoint: null, onCheckpoint: async value => {
        if (checkpoint) assert.deepEqual(await checkpointVault.read(ownerPassword), checkpoint, 'NATIVE_DEVICE_PRODUCT_CHECKPOINT_CHANGED');
        const next = checkpoint ? await checkpointVault.update(ownerPassword, checkpoint.revision, () => ({ checkpoint: value }))
          : await checkpointVault.create({ checkpoint: value }, ownerPassword);
        assert.deepEqual(await checkpointVault.read(ownerPassword), next, 'NATIVE_DEVICE_PRODUCT_CHECKPOINT_CHANGED'); checkpoint = next;
      } });
    // Native executor MUST exist before the account and before any D26 admission.
    nativeExecution = await createNativeValueExecution({ runtime, system, poolIndex: 0, quorum: system.quorum });
    account = await createNativeValueAccountAuthority({ runtime, system, poolIndex: 0, owner, nativeExecution,
      accountId: fresh(), journalId: fresh() });
    joined = await createNativeValueManualGraphAccountSession({ runtime, system, poolIndex: 0, account,
      journal: { path: join(directory, 'account-session.vault'), password: fresh() } });
    const preparation = await account.ownerActions.createManualPreparation(), requestId = 'device_product_' + fresh();
    const reviewed = await preparation.review({ requestId, kind: 'TOP_UP', amount: '500', exitRecipient: runtime.accounts[3].slice(2) });
    const body = await preparation.confirm(); assert.deepEqual(body, reviewed.request);
    const approval = preparation.originalApproval(requestId); assert.deepEqual(joined.bindManualNote(approval), body);
    await joined.session.prepare(body); // durable PREPARED scope; NEVER execute/prove/FUND
    provider = await prepareOriginalNativeDeviceLocalProviderV1({ runtime, system, nativeRuntime, bootstrap });
    installed = await installOriginalNativeDeviceLocalServiceV1({ runtime, system, owner, account, nativeExecution, session: joined.session,
      approval, provider, configuration: selected });
    return Object.freeze({ profile: ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1, origin: installed.transport.url,
      descriptor: installed.descriptor, localFakeValues: true, automaticFunding: false,
      cloudAuthority: false, close });
  } catch (error) {
    try { await close(); } catch (failure) {
      throw new AggregateError([error, failure], 'NATIVE_DEVICE_PRODUCT_START_CLEANUP_UNCONFIRMED', { cause: error });
    }
    throw error;
  }
}
