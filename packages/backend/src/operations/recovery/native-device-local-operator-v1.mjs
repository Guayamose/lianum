/** Initial local product realm, born before any device D26. Fixed original
 * V2/V5 factories supply every economic capability. Input is infrastructure
 * plus one explicitly paired public device key; never a note/root, account DTO,
 * SQL executor, signer, proof or callback. Local values are not mainnet assets. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, mkdtemp, lstat, realpath, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
import { Vault } from '@lianum/engine/crypto/vault';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { createOwnedNativeEconomicReceiverV2, createOwnedNativeEconomicGraphRuntimeV2 }
  from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { createOwnedLocalNativeValueOperatorBootstrap } from '../operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { deployNativeValueDevSystemV5 } from '../deployments/native-value/native-value-system-v2.mjs';
import { createNativeValueOwnerProcess } from '../../custody/processes/native-value-owner-process-v2.mjs';
import { createNativeValueExecution, assertOwnedNativeValueExecution } from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import { createNativeEconomicNoteAccountAuthorityV1,createNativeLiveArmedNoteAccountAuthorityV1, assertOwnedNativeValueAccountAuthority,isOriginalNativePrivateDepositAccountV2,isOriginalNativePrivateExitAccountV2,isOriginalNativePrivateReservationAccountV2,isOriginalNativePrivateWorkerAccountV3 } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import { createNativeValueManualGraphAccountSession, createOriginalSessionWalletEconomicStateV1 } from '../../api/accounts/flat-manual-graph-session.mjs';
import { createPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 } from './native-original-source-lifecycle-v1.mjs';
import { createDeviceOwnerDepositBridgeV1,createOriginalNativePrivateDepositBridgeV2,createOriginalNativePrivateWorkerDepositBridgeV3 } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import { createDeviceOwnerReservationBridgeV1,createOriginalNativePrivateReservationBridgeV2 } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import {createDeviceOwnerExecutionBridgeV1,createOriginalNativePrivateExecutionBridgeV2,createOriginalNativePrivateWorkerExecutionBridgeV3} from '../../accounts/authority/native-value-account-authority-v2.mjs';
import { assertOwnedNativeValueProviderCustody } from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import { createPairedDeviceAccountTlsServerV1, createPairedDurableDeviceAccountTlsServerV1 } from '../../api/mobile/paired-original-account-http-v2.mjs';
import { createOriginalDeviceDurableDispatchV1 } from '../../api/mobile/original-device-durable-dispatch-v1.mjs';
import { prepareOriginalNativeDeviceLocalProviderV1, prepareOriginalNativeDeviceObservedLocalProviderV1 } from './native-device-local-provider-v1.mjs';
import { normalizeOriginalNativeDeviceLocalConfigurationV1, assertOriginalNativeDeviceLocalColdStartV1,
  prepareOriginalNativeDeviceLocalRestartV1, bindOriginalNativeDeviceLocalRestartV1, captureOriginalNativeDeviceLocalRestartV1,
  originalNativeDeviceLocalCaptureStateV1, closeOriginalNativeDeviceLocalRestartAuthorityV1, readOriginalNativeDeviceLocalCaptureRequestV1 }
  from './native-device-local-restart-v1.mjs';
import {assertOriginalNativeDeviceDurableLocalColdStartV1,prepareOriginalNativeDeviceDurableLocalRestartV1,
 bindOriginalNativeDeviceDurableLocalRestartV1,captureOriginalNativeDeviceDurableLocalRestartV1,
 readOriginalNativeDeviceDurableLocalCaptureRequestV1,originalNativeDeviceDurableLocalConfigurationPathV1}
 from './native-device-local-restart-v1.mjs';
import {createOriginalNativeDeviceLocalObservedClocksV1,createOriginalNativeDeviceLiveArmedObservedClocksV1,refreshOriginalNativeDeviceLocalObservedClockV1} from './native-device-local-observed-clock-v1.mjs';
import {createOriginalNativeDeviceLiveRecoveryProducerV1} from './native-device-local-live-recovery-v1.mjs';
import {prepareOriginalNativeDeviceLiveArmedRestartV1,originalNativeLiveArmedRestartAuthorityV1,bindOriginalNativeDeviceLiveArmedRestartV1,captureOriginalNativeDeviceLiveArmedRestartV1,originalNativeDeviceLiveArmedCaptureStateV1,closeOriginalNativeDeviceLiveArmedAuthorityV1,originalNativeDeviceLiveArmedConfigurationPathV1} from './native-device-live-armed-restart-v1.mjs';
const fresh = () => randomBytes(32).toString('hex');
import { ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1, assertOriginalNativeDeviceLocalSourceReviewV1 } from './native-device-source-review-v1.mjs';
export { ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1, assertOriginalNativeDeviceLocalSourceReviewV1 } from './native-device-source-review-v1.mjs';
const local = join(ROOT, '.local/original-device-local-operator-v1');
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
/** Separate fixed private installation; no mode field enters configuration. */
export function installOriginalPrivateNativeDeviceLocalServiceV2(input){assert.equal(arguments.length,1);return installOriginalNativeDeviceService(input,false,true);}
export function installOriginalPrivateNativeNoteServiceV2(input){assert.equal(arguments.length,1);return installOriginalNativeDeviceService(input,false,true,true);}
/** Separate fixed durable/private realm; dispatcher verifies original bridge brands. */
export function installOriginalPrivateNativeNoteDurableServiceV2(input){assert.equal(arguments.length,1);return installOriginalNativeDeviceService(input,true,true,true);}
export function installOriginalPrivateNativeAuthorizedNoteDurableServiceV2(input){assert.equal(arguments.length,1);return installOriginalNativeDeviceService(input,true,true,true,true);}
export function installOriginalPrivateNativeWorkerNoteDurableServiceV3(input){assert.equal(arguments.length,1);return installOriginalNativeDeviceService(input,true,true,true,true,true);}
/** Fixed before-fund private worker/U composition for owned native mobile
 * products. SQL is not an economic grant; original brands/consents/journals
 * remain the same. No durable flag, runtime mode or caller callback is read. */
export function installOriginalPrivateNativeWorkerNoteServiceV3(input){assert.equal(arguments.length,1);return installOriginalNativeDeviceService(input,false,true,true,true,true);}

async function installOriginalNativeDeviceService(input,durable,privateD26=false,privateW39=false,privateU=false,privateWorker=false) {
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
    depositBridge = await (privateWorker||isOriginalNativePrivateWorkerAccountV3(account)?createOriginalNativePrivateWorkerDepositBridgeV3:privateD26||isOriginalNativePrivateDepositAccountV2(account)?createOriginalNativePrivateDepositBridgeV2:createDeviceOwnerDepositBridgeV1)(original);
    reservationBridge = await (privateU||isOriginalNativePrivateReservationAccountV2(account)?createOriginalNativePrivateReservationBridgeV2:createDeviceOwnerReservationBridgeV1)({ ...original,
      nativePreparation: provider.nativePreparation, invoiceSignatures: provider.invoiceSignatures });
    executionBridge = await (privateWorker||isOriginalNativePrivateWorkerAccountV3(account)?createOriginalNativePrivateWorkerExecutionBridgeV3:privateW39||isOriginalNativePrivateExitAccountV2(account)?createOriginalNativePrivateExecutionBridgeV2:createDeviceOwnerExecutionBridgeV1)({ account, reservationBridge, nativeExecution,
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
/** Fixed original NativeNote constructor, before any D26 admission. */
export function createOriginalNativeDeviceLocalOperatorV1(input){assert.equal(arguments.length,1);return createLocalProduct(input,false);}
/** Separate fixed new realm: SQL fences original effects. A planned F capture
 * retains the original ten economic sections; SQL never reconstructs them. */
export function createOriginalNativeDeviceDurableLocalOperatorV1(input){
  assert.equal(arguments.length,1);exactRecord(input,['origin','devicePublicKey','tls','pool','privacyKey']);
  return createLocalProduct({origin:input.origin,devicePublicKey:input.devicePublicKey,tls:input.tls},false,false,
    {pool:input.pool,privacyKey:input.privacyKey});
}
/** Separate original observed realm for live cutoff recovery. It never
 * selects/relabels the old realm or claims post-cutoff Native10 restoration. */
export function createOriginalNativeDeviceLiveRecoveryOperatorV1(input){assert.equal(arguments.length,1);return createLocalProduct(input,true);}
export function createOriginalNativeDeviceLiveArmedRecoveryOperatorV1(input){assert.equal(arguments.length,1);return createLocalProduct(input,true,true);}
/** New original producer fixes private intake BEFORE account admission/funds. */
export function createOriginalPrivateNativeDeviceLocalOperatorV2(input){assert.equal(arguments.length,1);return createLocalProduct(input,false,false,null,true);}
export function createOriginalPrivateNativeNoteOperatorV2(input){assert.equal(arguments.length,1);return createLocalProduct(input,false,false,null,true,true);}
export function createOriginalPrivateNativeNoteDurableOperatorV2(input){assert.equal(arguments.length,1);exactRecord(input,['origin','devicePublicKey','tls','pool','privacyKey']);return createLocalProduct({origin:input.origin,devicePublicKey:input.devicePublicKey,tls:input.tls},false,false,{pool:input.pool,privacyKey:input.privacyKey},true,true);}
export function createOriginalPrivateNativeAuthorizedNoteDurableOperatorV2(input){assert.equal(arguments.length,1);exactRecord(input,['origin','devicePublicKey','tls','pool','privacyKey']);return createLocalProduct({origin:input.origin,devicePublicKey:input.devicePublicKey,tls:input.tls},false,false,{pool:input.pool,privacyKey:input.privacyKey},true,true,true);}
export function createOriginalPrivateNativeWorkerNoteDurableOperatorV3(input){assert.equal(arguments.length,1);exactRecord(input,['origin','devicePublicKey','tls','pool','privacyKey']);return createLocalProduct({origin:input.origin,devicePublicKey:input.devicePublicKey,tls:input.tls},false,false,{pool:input.pool,privacyKey:input.privacyKey},true,true,true,true);}
async function createLocalProduct(input,liveObserved,liveArmed=false,durable=null,privateD26=false,privateW39=false,privateU=false,privateWorker=false) {
  assert.ok(arguments.length>=2&&arguments.length<=8); const selected = configuration(input); // detach before first await
  const restartDeadlineMs = Date.now() + 90 * 60 * 1000 - 15000;
  await assertOriginalNativeDeviceLocalSourceReviewV1();
  if(!liveArmed)await(durable?assertOriginalNativeDeviceDurableLocalColdStartV1:assertOriginalNativeDeviceLocalColdStartV1)();
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
    const selectedLocal=liveArmed?resolve(originalNativeDeviceLiveArmedConfigurationPathV1(),'..'):durable?resolve(originalNativeDeviceDurableLocalConfigurationPathV1(),'..'):local;
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
    if(!liveObserved) restart = await(durable?prepareOriginalNativeDeviceDurableLocalRestartV1:prepareOriginalNativeDeviceLocalRestartV1)({ runtime, nativeRuntime, bootstrap, system, owner,
      nativeExecution, account, session: joined.session, provider, deadlineMs: restartDeadlineMs }); // issuer ready before TLS
    installed = await (privateWorker?installOriginalPrivateNativeWorkerNoteDurableServiceV3:privateU?installOriginalPrivateNativeAuthorizedNoteDurableServiceV2:privateW39?(durable?installOriginalPrivateNativeNoteDurableServiceV2:installOriginalPrivateNativeNoteServiceV2):privateD26?installOriginalPrivateNativeDeviceLocalServiceV2:durable?installOriginalNativeDeviceDurableLocalServiceV1:installOriginalNativeDeviceLocalServiceV1)({
      runtime, system, owner, account, nativeExecution, session: joined.session, approval, provider, configuration: selected,
      ...(durable?durable:{}) });
    if(!liveObserved)(durable?bindOriginalNativeDeviceDurableLocalRestartV1:bindOriginalNativeDeviceLocalRestartV1)(restart, installed);
    else if(liveObserved)liveProducer=createOriginalNativeDeviceLiveRecoveryProducerV1({account,executionBridge:installed.executionBridge,runtime,system,nativeRuntime,clock:clocks.clock});
    if(liveArmed)bindOriginalNativeDeviceLiveArmedRestartV1(restart,{runtime,nativeRuntime,bootstrap,system,owner,nativeExecution,account,session:joined.session,provider,installed,liveProducer,clocks});
    let captureRequest;
    function capture() {
      assert.equal(arguments.length, 0);
      return captureRequest ??= liveArmed?captureOriginalNativeDeviceLiveArmedRestartV1(restart):durable?captureOriginalNativeDeviceDurableLocalRestartV1(restart,readOriginalNativeDeviceDurableLocalCaptureRequestV1()):captureOriginalNativeDeviceLocalRestartV1(restart, readOriginalNativeDeviceLocalCaptureRequestV1());
    }
    if(liveArmed)return Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_LIVE_ARMED_OPERATOR_V1',origin:installed.transport.url,descriptor:installed.descriptor,
      localFakeValues:true,automaticFunding:false,automaticNativeDelivery:false,originalArmRetainedForNewProcess:true,abruptCrashRecoveryEstablished:false,cloudAuthority:false,capture,close});
    if(liveObserved)return Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_LIVE_RECOVERY_OPERATOR_V1',origin:installed.transport.url,descriptor:installed.descriptor,
      localFakeValues:true,automaticFunding:false,automaticNativeDelivery:false,postCutoffRestartEstablished:false,cloudAuthority:false,close});
    if(durable)return Object.freeze({profile:privateWorker?'ORIGINAL_NATIVE_DEVICE_PRIVATE_WORKER_DURABLE_NOTE_OPERATOR_V3':privateU?'ORIGINAL_NATIVE_DEVICE_PRIVATE_AUTHORIZED_DURABLE_NOTE_OPERATOR_V2':privateW39?'ORIGINAL_NATIVE_DEVICE_PRIVATE_DURABLE_NOTE_OPERATOR_V2':'ORIGINAL_NATIVE_DEVICE_DURABLE_LOCAL_OPERATOR_V1',origin:installed.transport.url,
      descriptor:installed.descriptor,localFakeValues:true,automaticFunding:false,durableOriginalAdmission:true,
      plannedOriginalFReopen:true,newProcessRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,cloudAuthority:false,capture,close});
    return Object.freeze({ profile:privateW39?'ORIGINAL_NATIVE_DEVICE_PRIVATE_NOTE_OPERATOR_V2':privateD26?'ORIGINAL_NATIVE_DEVICE_PRIVATE_DEPOSIT_OPERATOR_V2':ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1, origin: installed.transport.url,
      descriptor: installed.descriptor, localFakeValues: true, automaticFunding: false,
      cloudAuthority: false, capture, close });
  } catch (error) {
    try { await close(); } catch (failure) {
      throw new AggregateError([error, failure], 'NATIVE_DEVICE_PRODUCT_START_CLEANUP_UNCONFIRMED', { cause: error });
    }
    throw error;
  }
}
