/** Initial local product realm, born before any device D26. Fixed original
 * V2/V5 factories supply every economic capability. Input is infrastructure
 * plus one explicitly paired public device key; never a note/root, account DTO,
 * SQL executor, signer, proof or callback. Local values are not mainnet assets. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, mkdtemp, lstat, realpath, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT, FLAT } from '../../../../proofs/src/catalog.mjs';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { createOwnedNativeEconomicReceiverV2, createOwnedNativeEconomicGraphRuntimeV2 }
  from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { createOwnedLocalNativeValueOperatorBootstrap } from '../operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { deployNativeValueDevSystemV5 } from '../deployments/native-value/native-value-system-v2.mjs';
import { loadNativeValueDevDeploymentArtifactsV5 } from '../deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { NATIVE_VALUE_DEV_RELEASE_V5 } from '../releases/native-value/native-value-dev-release-v5.mjs';
import { createNativeValueOwnerProcess } from '../../../../custody/src/processes/native-value-owner-process-v2.mjs';
import { createNativeValueExecution, assertOwnedNativeValueExecution } from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import { createNativeEconomicNoteAccountAuthorityV1,createNativeLiveArmedNoteAccountAuthorityV1, assertOwnedNativeValueAccountAuthority } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import { createNativeValueManualGraphAccountSession, createOriginalSessionWalletEconomicStateV1 } from '../../api/accounts/flat-manual-graph-session.mjs';
import { createPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 } from '../../api/mobile/paired-original-account-actor-v2.mjs';
import { createDeviceOwnerDepositBridgeV1 } from '../../accounts/authority/device-owner-deposit-bridge-v1.mjs';
import { createDeviceOwnerReservationBridgeV1 } from '../../accounts/authority/device-owner-reservation-bridge-v1.mjs';
import { createDeviceOwnerExecutionBridgeV1 } from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
import { assertOwnedNativeValueProviderCustody } from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import { createPairedDeviceAccountTlsServerV1, createPairedDurableDeviceAccountTlsServerV1 } from '../../api/mobile/paired-original-account-http-v2.mjs';
import { createOriginalDeviceDurableDispatchV1 } from '../../api/mobile/original-device-durable-dispatch-v1.mjs';
import { prepareOriginalNativeDeviceLocalProviderV1, prepareOriginalNativeDeviceObservedLocalProviderV1 } from './native-device-local-provider-v1.mjs';
import { normalizeOriginalNativeDeviceLocalConfigurationV1, assertOriginalNativeDeviceLocalColdStartV1,
  prepareOriginalNativeDeviceLocalRestartV1, bindOriginalNativeDeviceLocalRestartV1, captureOriginalNativeDeviceLocalRestartV1,
  originalNativeDeviceLocalCaptureStateV1, closeOriginalNativeDeviceLocalRestartAuthorityV1, readOriginalNativeDeviceLocalCaptureRequestV1 }
  from './native-device-local-restart-v1.mjs';
import {createOriginalNativeDeviceLocalObservedClocksV1,createOriginalNativeDeviceLiveArmedObservedClocksV1,refreshOriginalNativeDeviceLocalObservedClockV1} from './native-device-local-observed-clock-v1.mjs';
import {createOriginalNativeDeviceLiveRecoveryProducerV1} from './native-device-local-live-recovery-v1.mjs';
import {prepareOriginalNativeDeviceLiveArmedRestartV1,originalNativeLiveArmedRestartAuthorityV1,bindOriginalNativeDeviceLiveArmedRestartV1,captureOriginalNativeDeviceLiveArmedRestartV1,originalNativeDeviceLiveArmedCaptureStateV1,closeOriginalNativeDeviceLiveArmedAuthorityV1,originalNativeDeviceLiveArmedConfigurationPathV1} from './native-device-live-armed-restart-v1.mjs';
const fresh = () => randomBytes(32).toString('hex');
export const ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1 = 'ORIGINAL_NATIVE_DEVICE_LOCAL_OPERATOR_V1';
const local = join(ROOT, '.local/original-device-local-operator-v1');
const requiredSources = Object.freeze([
  'wallet-platform/modules/ops/native-device-local-operator-v1.mjs',
  'wallet-platform/modules/ops/native-device-local-provider-v1.mjs',
  'wallet-platform/modules/ops/native-device-local-restart-v1.mjs',
]);
// These exact current product callers are consumers outside the original
// compiler allowlist. Their literals live in this V5-authenticated backend;
// no caller path/hash or expanded release-contract root is admitted.
const reviewedCallers = Object.freeze([
  Object.freeze({"path":"apps/platform/src/run-original-device-live-armed-v1.mjs","bytes":4784,"sha256":"47f77fa07ee1ee45bcf6265a54d0dfc7472a26b50e2eaa70ca5ba1cc19bd6f5f"}),
  Object.freeze({"path":"apps/platform/src/original-device-local-operator-v1.mjs","bytes":4723,"sha256":"634dde47c535e6dc8c8675f4f60bb8c5810c209ab929cd6155740b706d33c74e"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-local-v1.mjs","bytes":208,"sha256":"b46e992f973d8dde44f217b1739308e43a0ee03f5bffda5b7c2ccffe49d0c422"}),
  Object.freeze({"path":"apps/platform/src/original-device-local-caller-v1.mjs","bytes":7461,"sha256":"64d8e74211d8b109b812068a7bbb6ad22b385688431d779ec1ceb9d585396fa7"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-local-reopen-v1.mjs","bytes":238,"sha256":"cfd3176249afa1b3369f89f4056f1dd28fc9c89e2fe8296147367b8c4a1c2b10"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-live-recovery-v1.mjs","bytes":256,"sha256":"6f88ae522b6a56ec98f0a4b5b19d902396c9b05d71ca730b59e60e5a6b9c0faa"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-durable-local-v1.mjs","bytes":236,"sha256":"bf5617909a7646ad6b8ff95875a700fafd4b9fcca6f8cd234535c17f40567693"}),
  Object.freeze({"path":"apps/platform/src/original-device-schema-v1.mjs","bytes":5173,"sha256":"e88ab9c4b9faeff24b4ac1b118f9b78546edbb15d6429784f713c314a643e20a"}),
  Object.freeze({"path":"apps/platform/src/database-pool.mjs","bytes":1058,"sha256":"3f5362721b6b5dab4f6b4a038663a2523c6fe2fa376d6f3fbc2ffb3f55aa3062"}),
  Object.freeze({"path":"apps/platform/src/privacy-key-v1.mjs","bytes":1698,"sha256":"6ded05ce522dda4b60bdb40d5cb287c4d1a5614a1c9715308bd8b89722c66de7"}),
]);
async function assertReviewedLocalProductCallers() {
  const directory = resolve(FLAT, '../../..');
  assert.equal(await realpath(directory), directory, 'NATIVE_DEVICE_PRODUCT_CALLER_ROOT_ALIAS');
  for (const row of reviewedCallers) {
    let path = directory;
    for (const part of row.path.split('/')) {
      path = join(path, part);
      assert.equal((await lstat(path)).isSymbolicLink(), false, 'NATIVE_DEVICE_PRODUCT_CALLER_ALIAS');
    }
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      assert.ok(before.isFile() && before.nlink === 1 && before.size === row.bytes,
        'NATIVE_DEVICE_PRODUCT_CALLER_PHYSICAL_PIN');
      const bytes = await handle.readFile(), after = await handle.stat(), named = await lstat(path);
      for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
        assert.ok(before[field] === after[field] && before[field] === named[field], 'NATIVE_DEVICE_PRODUCT_CALLER_CHANGED');
      assert.equal(named.isSymbolicLink(), false);
      assert.equal(bytes.length, row.bytes, 'NATIVE_DEVICE_PRODUCT_CALLER_PHYSICAL_PIN');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, 'NATIVE_DEVICE_PRODUCT_CALLER_RAW_PIN');
    } finally { await handle.close(); }
  }
}
export function originalNativeDeviceLocalConfigurationPathV1() {
  assert.equal(arguments.length, 0); return join(local, 'operator.json');
}
const configuration = normalizeOriginalNativeDeviceLocalConfigurationV1;
/** Internal installation from actual bootstrap references. JSON/copies cannot
 * satisfy account/executor/provider brands; the actor validates the original
 * PREPARED session approval before any route is installed. No operation runs. */
export async function installOriginalNativeDeviceLocalServiceV1(input) {
  assert.equal(arguments.length, 1);
  return installOriginalNativeDeviceService(input, false);
}
export async function installOriginalNativeDeviceDurableLocalServiceV1(input) {
  assert.equal(arguments.length, 1);
  return installOriginalNativeDeviceService(input, true);
}
async function installOriginalNativeDeviceService(input, durable) {
  exactRecord(input, ['runtime', 'system', 'owner', 'account', 'nativeExecution', 'session', 'approval', 'provider', 'configuration',
    ...(durable ? ['pool', 'privacyKey'] : [])]);
  const { runtime, system, owner, account, nativeExecution, session, approval, provider } = input;
  const selected = configuration(input.configuration);
  assertOwnedNativeValueAccountAuthority(account, { runtime, system, poolIndex: 0, owner });
  assertOwnedNativeValueExecution(nativeExecution, { runtime, system, poolIndex: 0 });
  exactRecord(provider, ['nativePreparation', 'invoiceSignatures', 'custody', 'recipient', 'deliveryRiskSalt']);
  assertOwnedNativeValueProviderCustody(provider.custody, { runtime, system, poolIndex: 0 });
  let actor, depositBridge, reservationBridge, executionBridge, transport, dispatch;
  try {
    actor = await createPairedOriginalAccountActorV2({ session, approval, owner,
      origin: selected.origin, devicePublicKey: selected.devicePublicKey });
    const original = { actor, account, owner, runtime, system, poolIndex: 0 };
    depositBridge = await createDeviceOwnerDepositBridgeV1(original);
    reservationBridge = await createDeviceOwnerReservationBridgeV1({ ...original,
      nativePreparation: provider.nativePreparation, invoiceSignatures: provider.invoiceSignatures });
    executionBridge = await createDeviceOwnerExecutionBridgeV1({ account, reservationBridge, nativeExecution,
      providers: [{ slot: 0, custody: provider.custody, deliveryRiskSalt: provider.deliveryRiskSalt }], runtime, system, poolIndex: 0 });
    if (durable) dispatch = await createOriginalDeviceDurableDispatchV1({ depositBridge, reservationBridge,
      executionBridge, pool: input.pool, privacyKey: input.privacyKey });
    transport = await (durable ? createPairedDurableDeviceAccountTlsServerV1 : createPairedDeviceAccountTlsServerV1)({
      depositBridge, reservationBridge, executionBridge, tls: selected.tls, ...(durable ? { dispatch } : {}) });
    return Object.freeze({ transport, actor, depositBridge, reservationBridge, executionBridge,
      descriptor: pairedOriginalAccountActorDescriptorV2(actor), ...(durable ? { dispatch } : {}) });
  } catch (error) {
    const failures = [];
    for (const resource of [transport, dispatch, executionBridge, reservationBridge, depositBridge, actor])
      try { await resource?.close(); } catch (failure) { failures.push(failure); }
    if (failures.length) throw new AggregateError([error, ...failures], 'NATIVE_DEVICE_PRODUCT_INSTALL_CLEANUP_UNCONFIRMED', { cause: error });
    throw error;
  }
}
/** V5 authenticates these backend consumers. The exact app caller bytes are
 * separately pinned here, outside the immutable compiler/source allowlist. */
export async function assertOriginalNativeDeviceLocalSourceReviewV1() {
  assert.equal(arguments.length, 0);
  assert.ok(NATIVE_VALUE_DEV_RELEASE_V5 !== null && requiredSources.every(path =>
    NATIVE_VALUE_DEV_RELEASE_V5.sourceFiles.some(row => row.path === path)), 'NATIVE_DEVICE_PRODUCT_SOURCE_REVIEW_REQUIRED');
  await loadNativeValueDevDeploymentArtifactsV5();
  await assertReviewedLocalProductCallers();
}
/** Fixed original NativeNote constructor, before any D26 admission. */
export function createOriginalNativeDeviceLocalOperatorV1(input){assert.equal(arguments.length,1);return createLocalProduct(input,false);}
/** Separate fixed new realm: SQL only fences original device effects. It
 * cannot adopt an old account and has no ordered-capture/reopen contract. */
export function createOriginalNativeDeviceDurableLocalOperatorV1(input){
  assert.equal(arguments.length,1);exactRecord(input,['origin','devicePublicKey','tls','pool','privacyKey']);
  return createLocalProduct({origin:input.origin,devicePublicKey:input.devicePublicKey,tls:input.tls},false,false,
    {pool:input.pool,privacyKey:input.privacyKey});
}
/** Separate original observed realm for live cutoff recovery. It never
 * selects/relabels the old realm or claims post-cutoff Native10 restoration. */
export function createOriginalNativeDeviceLiveRecoveryOperatorV1(input){assert.equal(arguments.length,1);return createLocalProduct(input,true);}
export function createOriginalNativeDeviceLiveArmedRecoveryOperatorV1(input){assert.equal(arguments.length,1);return createLocalProduct(input,true,true);}
async function createLocalProduct(input,liveObserved,liveArmed=false,durable=null) {
  assert.ok(arguments.length>=2&&arguments.length<=4); const selected = configuration(input); // detach before first await
  const restartDeadlineMs = Date.now() + 90 * 60 * 1000 - 15000;
  await assertOriginalNativeDeviceLocalSourceReviewV1();
  if(!liveArmed)await assertOriginalNativeDeviceLocalColdStartV1();
  let clocks, liveProducer;
  let runtime, nativeRuntime, bootstrap, system, owner, nativeExecution, account, joined, provider, installed, closing, ownerPassword, checkpoint, restart;
  function close() {
    assert.equal(arguments.length, 0); return closing ??= (async () => {
    const failures = [], stopped = {};
    if (restart) {
      const state = liveArmed?originalNativeDeviceLiveArmedCaptureStateV1(restart):originalNativeDeviceLocalCaptureStateV1(restart);
      if (state.completion) {
        try { return await state.completion; } catch (error) { failures.push(error); }
      }
    }
    const stop = async (name, work, check) => {
      try { const result = await work(); assert.ok(check(result), 'NATIVE_DEVICE_PRODUCT_CLOSE_UNCONFIRMED'); stopped[name] = true; }
      catch (error) { stopped[name] = false; failures.push(error); }
    };
    // Both admission fences run in this stack before awaiting either drain.
    const liveStop=liveProducer?.close(),transportStop=installed?.transport.close();
    liveStop?.catch(()=>{});transportStop?.catch(()=>{});
    if (liveProducer) await stop('live-recovery', () => liveStop, r => r.closed && r.originalWorkSettled);
    if (installed) await stop('transport', () => transportStop, r => r.closed === true
      && r.originalWorkSettled === true && r.ownedSocketsRemaining === 0);
    if (installed?.dispatch) await stop('durableAdmission', async () => { installed.dispatch.close(); return { closed: true }; }, r => r.closed);
    if (account && (!restart || (liveArmed?originalNativeDeviceLiveArmedCaptureStateV1(restart):originalNativeDeviceLocalCaptureStateV1(restart)).phase === 'OPEN')) await stop('accountAbort', () => account.abort(), r => r.cancelled === true);
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
    if(clocks) await stop('observed-clocks',()=>clocks.close(),r=>r.closed===true);
    for (const [name, resource] of [['receiver', runtime], ['nativeRuntime', nativeRuntime]]) if (resource)
      await stop(name, () => resource.close({ removeScratch: false }), r => r.stopped === true && resource.lifecycle.filter(row => row.event === 'stopped-owned-process').length === 1
        && resource.lifecycle.find(row => row.event === 'stopped-owned-process').forced === false);
    if (restart) await stop('issuer', async () => { await (liveArmed?closeOriginalNativeDeviceLiveArmedAuthorityV1:closeOriginalNativeDeviceLocalRestartAuthorityV1)(restart); return { closed: true }; }, r => r.closed === true);
    selected.tls = null;
    if (failures.length) throw new AggregateError(failures, 'NATIVE_DEVICE_PRODUCT_CLOSE_UNCONFIRMED');
    ownerPassword = null; checkpoint = null;
    return Object.freeze({ closed: true, originalResourcesStopped: true, retainedEncryptedJournals: true,
      normalCloseRestoresNewProcess: false, stopped: Object.freeze(stopped) });
  })();
  }
  try {
    if(liveObserved){clocks=await (liveArmed?createOriginalNativeDeviceLiveArmedObservedClocksV1:createOriginalNativeDeviceLocalObservedClocksV1)();runtime=clocks.runtime;nativeRuntime=clocks.nativeRuntime;}
    else{runtime = await createOwnedNativeEconomicReceiverV2(); nativeRuntime = await createOwnedNativeEconomicGraphRuntimeV2();}
    if(liveArmed)restart=await prepareOriginalNativeDeviceLiveArmedRestartV1();
    bootstrap = await createOwnedLocalNativeValueOperatorBootstrap({ nativeRuntimes: [nativeRuntime] });
    system = await deployNativeValueDevSystemV5({ runtime, options: { deploymentDomain: '0x' + fresh(), registryEpoch: '1', bootstrap,
      pools: [0, 1].map(() => ({ policy: '0x' + fresh(), deploymentDomain: '0x' + fresh() })) } });
    const nativeNow = await nativeRuntime.time(), receiverNow = await runtime.time();
    if(!liveObserved){
    const receiverInitial = nativeNow + 1n - 3n;
    assert.ok(receiverNow <= receiverInitial, 'NATIVE_DEVICE_PRODUCT_INITIAL_CLOCK_ALIGNMENT');
    assert.ok((nativeNow - receiverInitial) * 1000n <= BigInt(bootstrap.metadata.adapterProfiles[0].profile.maximumClockSkewMs));
    assert.equal(nativeRuntime.transactions.length, 0);
    if (receiverNow < receiverInitial) await runtime.advanceTo(String(receiverInitial));
    assert.equal(await runtime.time(), receiverInitial); assert.equal(await nativeRuntime.time(), nativeNow);
    }
    const selectedLocal=liveArmed?resolve(originalNativeDeviceLiveArmedConfigurationPathV1(),'..'):local;
    await mkdir(selectedLocal, { recursive: true, mode: 0o700 });
    const localInfo = await lstat(selectedLocal);
    assert.ok(localInfo.isDirectory() && !localInfo.isSymbolicLink() && localInfo.uid === process.getuid()
      && (localInfo.mode & 0o077) === 0 && await realpath(selectedLocal) === selectedLocal, 'NATIVE_DEVICE_PRODUCT_PRIVATE_DIRECTORY');
    const directory = await mkdtemp(join(selectedLocal, 'realm-')), ownerDirectory = join(directory, 'owner');
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
    const accountInput={runtime,system,poolIndex:0,owner,nativeExecution,accountId:fresh(),journalId:fresh()};
    account=liveArmed?await createNativeLiveArmedNoteAccountAuthorityV1({...accountInput,nativeRuntime,clock:clocks.clock,recoveryAuthority:originalNativeLiveArmedRestartAuthorityV1(restart)}):await createNativeEconomicNoteAccountAuthorityV1(accountInput);
    joined = await createNativeValueManualGraphAccountSession({ runtime, system, poolIndex: 0, account,
      journal: { path: join(directory, 'account-session.vault'), password: fresh() } });
    const preparation = await account.ownerActions.createManualPreparation(), requestId = 'device_product_' + fresh();
    const reviewed = await preparation.review({ requestId, kind: 'TOP_UP', amount: '500', exitRecipient: runtime.accounts[3].slice(2) });
    const body = await preparation.confirm(); assert.deepEqual(body, reviewed.request);
    const approval = preparation.originalApproval(requestId); assert.deepEqual(joined.bindManualNote(approval), body);
    await joined.session.prepare(body); // durable PREPARED scope; NEVER execute/prove/FUND
    if(liveObserved)await refreshOriginalNativeDeviceLocalObservedClockV1(clocks.clock);
    // Same original session owns this encrypted observation state before any
    // listener or capture. PREPARED remains UNKNOWN; this read admits no effect.
    const economicState = await createOriginalSessionWalletEconomicStateV1(joined.session);
    await economicState.observe();
    provider = liveObserved
      ? await prepareOriginalNativeDeviceObservedLocalProviderV1({ runtime, system, nativeRuntime, bootstrap, clock: clocks.clock })
      : await prepareOriginalNativeDeviceLocalProviderV1({ runtime, system, nativeRuntime, bootstrap });
    if(!liveObserved&&!durable) restart = await prepareOriginalNativeDeviceLocalRestartV1({ runtime, nativeRuntime, bootstrap, system, owner,
      nativeExecution, account, session: joined.session, provider, deadlineMs: restartDeadlineMs }); // issuer ready before TLS
    installed = await (durable?installOriginalNativeDeviceDurableLocalServiceV1:installOriginalNativeDeviceLocalServiceV1)({
      runtime, system, owner, account, nativeExecution, session: joined.session, approval, provider, configuration: selected,
      ...(durable?durable:{}) });
    if(!liveObserved&&!durable)bindOriginalNativeDeviceLocalRestartV1(restart, installed);
    else if(liveObserved)liveProducer=createOriginalNativeDeviceLiveRecoveryProducerV1({account,executionBridge:installed.executionBridge,runtime,system,nativeRuntime,clock:clocks.clock});
    if(liveArmed)bindOriginalNativeDeviceLiveArmedRestartV1(restart,{runtime,nativeRuntime,bootstrap,system,owner,nativeExecution,account,session:joined.session,provider,installed,liveProducer,clocks});
    let captureRequest;
    function capture() {
      assert.equal(arguments.length, 0);
      return captureRequest ??= liveArmed?captureOriginalNativeDeviceLiveArmedRestartV1(restart):captureOriginalNativeDeviceLocalRestartV1(restart, readOriginalNativeDeviceLocalCaptureRequestV1());
    }
    if(liveArmed)return Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_LIVE_ARMED_OPERATOR_V1',origin:installed.transport.url,descriptor:installed.descriptor,
      localFakeValues:true,automaticFunding:false,automaticNativeDelivery:false,originalArmRetainedForNewProcess:true,abruptCrashRecoveryEstablished:false,cloudAuthority:false,capture,close});
    if(liveObserved)return Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_LIVE_RECOVERY_OPERATOR_V1',origin:installed.transport.url,descriptor:installed.descriptor,
      localFakeValues:true,automaticFunding:false,automaticNativeDelivery:false,postCutoffRestartEstablished:false,cloudAuthority:false,close});
    if(durable)return Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_DURABLE_LOCAL_OPERATOR_V1',origin:installed.transport.url,
      descriptor:installed.descriptor,localFakeValues:true,automaticFunding:false,durableOriginalAdmission:true,
      newProcessRecoveryEstablished:false,cloudAuthority:false,close});
    return Object.freeze({ profile: ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1, origin: installed.transport.url,
      descriptor: installed.descriptor, localFakeValues: true, automaticFunding: false,
      cloudAuthority: false, capture, close });
  } catch (error) {
    try { await close(); } catch (failure) {
      throw new AggregateError([error, failure], 'NATIVE_DEVICE_PRODUCT_START_CLEANUP_UNCONFIRMED', { cause: error });
    }
    throw error;
  }
}
