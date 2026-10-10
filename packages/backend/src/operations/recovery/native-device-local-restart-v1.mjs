/** Planned local NativeNote F capture/reopen. Infrastructure and a public job
 * selector are never economic authority. Only the original ten-section issuer,
 * original references, AEAD/CAS and a distinct process can restore the service.
 * No root/opening/key, old DTO, callback, SQL executor or automatic send enters. */
import assert from 'node:assert/strict';
import { constants, lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { open, lstat, realpath, mkdir } from 'node:fs/promises';
import { randomUUID, createPublicKey } from 'node:crypto';
import { normalizeMobileOrigin } from '../../../../mobile-protocol/src/authorization.mjs';
import { join } from 'node:path';
import { ROOT } from '../../../../proofs/src/catalog.mjs';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { assertOwnedNativeValueAccountAuthority } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import { assertOwnedNativeValueExecution } from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import { assertOwnedNativeValueProviderCustody } from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import { assertOwnedNativeRecipientProcess } from '../../../../engine/src/execution/native/recipients/native-recipient-process.mjs';
import { readOriginalSessionWalletEconomicStateV1 } from '../../api/accounts/flat-manual-graph-session.mjs';
import {assertOriginalDeviceDurableDispatchBindingsV1,assertOriginalDeviceDurableRecoveryInfrastructureV1} from '../../api/mobile/original-device-durable-dispatch-v1.mjs';
const local = join(ROOT, '.local/original-device-local-operator-v1');
const durableLocal = join(ROOT, '.local/original-device-durable-local-operator-v1');
const selectLocal = durable => durable ? durableLocal : local;
export function originalNativeDeviceDurableLocalConfigurationPathV1(){
 assert.equal(arguments.length,0);return join(durableLocal,'operator.json');
}
const requestPath = join(local, 'recovery-request.json'), checkpointPath = join(local, 'captured-checkpoint.json');
const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.exec(value)?.[0] === value;
const prepared = new WeakMap();
export function normalizeOriginalNativeDeviceLocalConfigurationV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['origin', 'devicePublicKey', 'tls']);
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
async function privateDirectory(selectedLocal = local) {
  const stat = await lstat(selectedLocal);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && (stat.mode & 0o077) === 0 && await realpath(selectedLocal) === selectedLocal, 'NATIVE_DEVICE_LOCAL_RESTART_PRIVATE_DIRECTORY');
}
async function privateRead(path, selectedLocal = local) {
  await privateDirectory(selectedLocal); const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const before = await handle.stat();
    assert.ok(before.isFile() && before.nlink === 1 && before.uid === process.getuid()
      && (before.mode & 0o777) === 0o600 && before.size > 0 && before.size <= 16384, 'NATIVE_DEVICE_LOCAL_RESTART_PRIVATE_FILE');
    bytes = Buffer.alloc(16385); const read = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat(), named = await lstat(path);
    for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
      assert.ok(before[field] === after[field] && before[field] === named[field], 'NATIVE_DEVICE_LOCAL_RESTART_FILE_CHANGED');
    assert.equal(named.isSymbolicLink(), false); assert.equal(read.bytesRead, before.size);
    return JSON.parse(bytes.subarray(0, read.bytesRead).toString('utf8'));
  } finally { bytes?.fill(0); await handle.close(); }
}
async function publish(value, selectedLocal = local) {
  const checkpointPath = join(selectedLocal,'captured-checkpoint.json');
  await privateDirectory(selectedLocal); const bytes = Buffer.from(JSON.stringify(value) + '\n');
  assert.ok(bytes.length <= 16384);
  const handle = await open(checkpointPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { bytes.fill(0); await handle.close(); }
  const directory = await open(selectedLocal, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await directory.sync(); } finally { await directory.close(); }
  assert.deepEqual(await privateRead(checkpointPath,selectedLocal), value, 'NATIVE_DEVICE_LOCAL_RESTART_PUBLICATION_CHANGED');
}
export function assertOriginalNativeDeviceLocalColdStartV1(){
 assert.equal(arguments.length,0);return assertColdStart(false);
}
export function assertOriginalNativeDeviceDurableLocalColdStartV1(){
 assert.equal(arguments.length,0);return assertColdStart(true);
}
async function assertColdStart(durable) {
  const checkpointPath = join(selectLocal(durable),'captured-checkpoint.json');
  try { await lstat(checkpointPath); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw Error('NATIVE_DEVICE_LOCAL_CAPTURE_EXISTS_USE_FIXED_REOPEN_ENTRY');
}
export function readOriginalNativeDeviceLocalCaptureRequestV1(){
 assert.equal(arguments.length,0);return readCaptureRequest(false);
}
export function readOriginalNativeDeviceDurableLocalCaptureRequestV1(){
 assert.equal(arguments.length,0);return readCaptureRequest(true);
}
function readCaptureRequest(durable) {
 const local=selectLocal(durable),requestPath=join(local,'recovery-request.json');const directory = lstatSync(local);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === process.getuid()
    && (directory.mode & 0o077) === 0 && realpathSync(local) === local, 'NATIVE_DEVICE_LOCAL_RESTART_PRIVATE_DIRECTORY');
  const handle = openSync(requestPath, constants.O_RDONLY | constants.O_NOFOLLOW), bytes = Buffer.alloc(1025);
  try {
    const before = fstatSync(handle);
    assert.ok(before.isFile() && before.nlink === 1 && before.uid === process.getuid()
      && (before.mode & 0o777) === 0o600 && before.size > 0 && before.size <= 1024, 'NATIVE_DEVICE_LOCAL_RESTART_PRIVATE_FILE');
    const count = readSync(handle, bytes, 0, bytes.length, 0), after = fstatSync(handle), named = lstatSync(requestPath);
    for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
      assert.ok(before[field] === after[field] && before[field] === named[field], 'NATIVE_DEVICE_LOCAL_RESTART_FILE_CHANGED');
    assert.equal(named.isSymbolicLink(), false); assert.equal(count, before.size);
    const value = JSON.parse(bytes.subarray(0, count).toString('utf8')); exactRecord(value, ['parentJobId']);
    assert.ok(hex(value.parentJobId), 'NATIVE_DEVICE_LOCAL_RESTART_JOB'); return value.parentJobId;
  } finally { bytes.fill(0); closeSync(handle); }
}
/** Prepare the issuer before serving TLS, so capture itself can fence every
 * original synchronously before its first await. The deadline starts at the
 * constructor entry and is kept verbatim across capture/open; READ cannot renew it. */
export function prepareOriginalNativeDeviceLocalRestartV1(input){
 assert.equal(arguments.length,1);return prepareRestart(input,false);
}
export function prepareOriginalNativeDeviceDurableLocalRestartV1(input){
 assert.equal(arguments.length,1);return prepareRestart(input,true);
}
async function prepareRestart(input,durable) {
  exactRecord(input, ['runtime', 'nativeRuntime', 'bootstrap', 'system', 'owner', 'nativeExecution', 'account', 'session', 'provider', 'deadlineMs']);
  const selected = { ...input }, { runtime, system, owner, nativeExecution, account } = selected;
  assert.ok(Number.isSafeInteger(selected.deadlineMs) && selected.deadlineMs > Date.now()
    && selected.deadlineMs <= Date.now() + 90 * 60 * 1000 - 15000, 'NATIVE_DEVICE_LOCAL_RESTART_ORIGINAL_DEADLINE');
  assertOwnedNativeValueAccountAuthority(account, { runtime, system, poolIndex: 0, owner });
  assertOwnedNativeValueExecution(nativeExecution, { runtime, system, poolIndex: 0 });
  exactRecord(selected.provider, ['nativePreparation', 'invoiceSignatures', 'custody', 'recipient', 'deliveryRiskSalt']);
  assertOwnedNativeValueProviderCustody(selected.provider.custody, { runtime, system, poolIndex: 0 });
  assertOwnedNativeRecipientProcess(selected.provider.recipient);
  const source = await import('../deployments/native-value/native-value-system-v2.mjs');
  const runId = randomUUID(), identity = Object.freeze({ directory: join(ROOT, '.local/native-value-economic-note-recovery-v1',
    'attempt-' + runId, 'private-audit'), runId, sourceSHA256: source.nativeValueOriginalRecoverySourceV1(runtime, system),
    deadlineMs: selected.deadlineMs });
  // The original issuer requires an existing private fixed directory.
  await mkdir(identity.directory, { recursive: true, mode: 0o700 });
  const issuer = await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const coordinator = await import('./native-value-economic-recovery-v1.mjs');
  const authority = await issuer.createNativeEconomicNoteRecoveryAuthorityV1(identity);
  const token = Object.freeze(Object.create(null));
  prepared.set(token, { selected, identity, authority, issuer, coordinator, installed: null,
    phase: 'OPEN', capturePromise: null, selectedJob: null, authorityClose: null, durable });
  return token;
}
export function bindOriginalNativeDeviceLocalRestartV1(token,installed){
 assert.equal(arguments.length,2);return bindRestart(token,installed,false);
}
export function bindOriginalNativeDeviceDurableLocalRestartV1(token,installed){
 assert.equal(arguments.length,2);return bindRestart(token,installed,true);
}
function bindRestart(token,installed,durable) {
 const row = prepared.get(token);
  assert.ok(row && row.phase === 'OPEN' && row.installed === null, 'NATIVE_DEVICE_LOCAL_RESTART_ORIGINAL');
  assert.equal(row.durable,durable,'NATIVE_DEVICE_LOCAL_RESTART_PROFILE_CHANGED');
  exactRecord(installed, ['transport', 'actor', 'depositBridge', 'reservationBridge', 'executionBridge', 'descriptor',...(durable?['dispatch']:[])]);
  if(durable)assert.equal(assertOriginalDeviceDurableDispatchBindingsV1(installed.dispatch,{
   depositBridge:installed.depositBridge,reservationBridge:installed.reservationBridge,executionBridge:installed.executionBridge}),installed.actor);
  row.installed = installed;
}
export function captureOriginalNativeDeviceLocalRestartV1(token,parentJobId){
 assert.equal(arguments.length,2);return captureRestart(token,parentJobId,false);
}
export function captureOriginalNativeDeviceDurableLocalRestartV1(token,parentJobId){
 assert.equal(arguments.length,2);return captureRestart(token,parentJobId,true);
}
function captureRestart(token,parentJobId,durable) {
 assert.ok(hex(parentJobId), 'NATIVE_DEVICE_LOCAL_RESTART_JOB');
  const row = prepared.get(token); assert.ok(row?.installed, 'NATIVE_DEVICE_LOCAL_RESTART_ORIGINAL');
  assert.equal(row.durable,durable,'NATIVE_DEVICE_LOCAL_RESTART_PROFILE_CHANGED');
  if (row.capturePromise) {
    assert.equal(parentJobId, row.selectedJob, 'NATIVE_DEVICE_LOCAL_RESTART_JOB_CHANGED'); return row.capturePromise;
  }
  assert.equal(row.phase, 'OPEN'); assert.ok(Date.now() < row.identity.deadlineMs, 'NATIVE_DEVICE_LOCAL_RESTART_ORIGINAL_DEADLINE');
  const input = row.selected, snapshot = input.nativeExecution.snapshot(parentJobId);
  // Genuine executor state, not a caller terminal DTO. The reopened account
  // independently validates the exact S/F receipts and same paired provider.
  assert.equal(snapshot.reference, parentJobId); assert.equal(snapshot.outcome, 'RECOVERED', 'NATIVE_DEVICE_LOCAL_RESTART_CONFIRMED_F_REQUIRED');
  assert.equal(snapshot.stage, 'RECOVERED'); row.phase = 'CAPTURING'; row.selectedJob = parentJobId;
  let operation;
  try {
    operation = row.coordinator.captureNativeValueEconomicRecoveryV1(row.authority, {
      runtime: input.runtime, nativeRuntime: input.nativeRuntime, bootstrap: input.bootstrap, system: input.system,
      providerCustody: input.provider.custody, owner: input.owner, nativeExecution: input.nativeExecution, account: input.account,
      session: input.session, actor: row.installed.actor, transport: row.installed.transport });
  } catch (error) { operation = Promise.reject(error); }
  // Above, all original HTTP/economic fences already ran in this synchronous
  // call stack. Recipient shutdown cannot race a newly admitted operation.
  operation.catch(() => {});
  row.capturePromise = (async () => {
    let issuerFinished = false;
    try {
      const recipient = await input.provider.recipient.close();
      assert.equal(recipient.exited, true); assert.deepEqual(recipient.exit, { code: 0, signal: null });
      const checkpoint = await operation; issuerFinished = true; // original finish closes issuer/lease
      row.installed.dispatch?.close(); // transport and all economic references already fenced/drained
      const transport = await row.installed.transport.close();
      assert.ok(transport.closed && transport.listenerClosed && transport.ownedSocketsRemaining === 0 && transport.originalDiagnosticsInFlight === 0);
      for (const runtime of [input.runtime, input.nativeRuntime]) {
        assert.equal(runtime.processStatus().stopped, true);
        assert.equal(runtime.lifecycle.find(value => value.event === 'stopped-owned-process')?.forced, false);
      }
      assert.equal(input.owner.report().childExited, true); assert.equal(input.provider.custody.report().closed, true);
      row.phase = 'CAPTURED';
      const value = { schema: durable?'ORIGINAL_DURABLE_LOCAL_NATIVE_NOTE_F_CAPTURE_V1':'ORIGINAL_LOCAL_NATIVE_NOTE_F_CAPTURE_V1', identity: { ...row.identity }, checkpoint: { ...checkpoint },
        descriptor: { ...row.installed.descriptor }, parentJobId, capturedProcessId: process.pid };
      await publish(value,selectLocal(durable)); // exclusive durable locator AFTER actual closures
      return Object.freeze({ closed: true, originalResourcesStopped: true, retainedEncryptedJournals: true,
        plannedCaptureForNewProcess: true, abruptCrashRecoveryEstablished: false });
    } catch (error) {
      // Wait original capture cleanup even if the independent recipient failed.
      let primary = error; try { await operation; issuerFinished = true; } catch (failure) {
        if (failure !== error) primary = new AggregateError([error, failure], 'NATIVE_DEVICE_LOCAL_RESTART_CAPTURE_FAILED', { cause: error });
      }
      row.phase = 'FAILED';
      try { if (!issuerFinished) { row.authorityClose ??= row.issuer.closeNativeEconomicRecoveryAuthorityV1(row.authority); await row.authorityClose; } }
      catch (failure) { throw new AggregateError([primary, failure], 'NATIVE_DEVICE_LOCAL_RESTART_CAPTURE_CLOSE_UNCONFIRMED', { cause: primary }); }
      throw primary;
    }
  })(); row.capturePromise.catch(() => {}); return row.capturePromise;
}
export function originalNativeDeviceLocalCaptureStateV1(token) {
  assert.equal(arguments.length, 1); const row = prepared.get(token); assert.ok(row, 'NATIVE_DEVICE_LOCAL_RESTART_ORIGINAL');
  return Object.freeze({ phase: row.phase, completion: row.capturePromise });
}
export async function closeOriginalNativeDeviceLocalRestartAuthorityV1(token) {
  assert.equal(arguments.length, 1); const row = prepared.get(token); assert.ok(row, 'NATIVE_DEVICE_LOCAL_RESTART_ORIGINAL');
  if (row.phase === 'CAPTURED') return; // original finish already closed issuer
  if (row.capturePromise) return row.capturePromise;
  row.phase = 'CLOSED'; row.authorityClose ??= row.issuer.closeNativeEconomicRecoveryAuthorityV1(row.authority);
  await row.authorityClose;
}
export function readOriginalNativeDeviceLocalRestartLocatorV1(){
 assert.equal(arguments.length,0);return readLocator(false);
}
export function readOriginalNativeDeviceDurableLocalRestartLocatorV1(){
 assert.equal(arguments.length,0);return readLocator(true);
}
async function readLocator(durable){
 const local=selectLocal(durable),value=await privateRead(join(local,'captured-checkpoint.json'),local);
  exactRecord(value, ['schema', 'identity', 'checkpoint', 'descriptor', 'parentJobId', 'capturedProcessId']);
  assert.equal(value.schema, durable?'ORIGINAL_DURABLE_LOCAL_NATIVE_NOTE_F_CAPTURE_V1':'ORIGINAL_LOCAL_NATIVE_NOTE_F_CAPTURE_V1');
  exactRecord(value.identity, ['directory', 'runId', 'sourceSHA256', 'deadlineMs']); exactRecord(value.checkpoint, ['revision', 'commitment']);
  assert.ok(hex(value.parentJobId) && Number.isSafeInteger(value.capturedProcessId) && value.capturedProcessId > 0);
  assert.notEqual(value.capturedProcessId, process.pid, 'NATIVE_DEVICE_LOCAL_RESTART_NEW_PROCESS_REQUIRED');
  return value; // a locator only; original open authenticates every section
}

/** Reopening authenticates current physical V5/source callers before reading
 * the private locator or claiming any section. JSON carries no capability. */
export function reopenOriginalNativeDeviceLocalOperatorV1(input){
 assert.equal(arguments.length,1);return reopen(input,false);
}
export function reopenOriginalNativeDeviceDurableLocalOperatorV1(input){
 assert.equal(arguments.length,1);return reopen(input,true);
}
async function reopen(input,durable) {
 exactRecord(input,durable?['origin','devicePublicKey','tls','pool','privacyKey']:['origin','devicePublicKey','tls']);
 const selected=normalizeOriginalNativeDeviceLocalConfigurationV1({origin:input.origin,devicePublicKey:input.devicePublicKey,tls:input.tls});
 const infrastructure=durable?{pool:input.pool,privacyKey:input.privacyKey}:null;
  const product = await import('./native-device-local-operator-v1.mjs');
  await product.assertOriginalNativeDeviceLocalSourceReviewV1();
  const locator = await readLocator(durable);
  assert.equal(locator.descriptor.origin, selected.origin); assert.equal(locator.descriptor.devicePublicKey, selected.devicePublicKey);
  assert.ok(Date.now() < locator.identity.deadlineMs, 'NATIVE_DEVICE_LOCAL_RESTART_ORIGINAL_DEADLINE');
  if(durable)await assertOriginalDeviceDurableRecoveryInfrastructureV1(infrastructure); // before consuming any original recovery section
  let originals, installed, closing;
  function close() {
    assert.equal(arguments.length, 0); return closing ??= (async () => {
      const failures = [];
      async function stop(work, checked) { try { assert.ok(checked(await work()), 'NATIVE_DEVICE_LOCAL_REOPEN_CLOSE_UNCONFIRMED'); }
        catch (error) { failures.push(error); } }
      if (installed) await stop(() => installed.transport.close(), value => value.closed && value.originalWorkSettled && value.ownedSocketsRemaining === 0);
      try{installed?.dispatch?.close();}catch(error){failures.push(error);}
      if (originals) {
        if (!installed) await stop(async () => { originals.actor.close(); return { closed: true }; }, value => value.closed === true);
        await stop(() => originals.account.abort(), value => value.cancelled === true);
        await stop(() => originals.session.close(), value => value.phase === 'CLOSED');
        await stop(() => originals.account.close(), value => value.closed === true);
        await stop(() => originals.nativeExecution.close(), value => value.closed === true);
        await stop(async () => { await originals.providerCustody.close(); return originals.providerCustody.report(); }, value => value.closed === true);
        await stop(() => originals.owner.close(), value => value.closed && value.childExited);
        await stop(async () => { originals.bootstrap.close(); return { closed: true }; }, value => value.closed === true);
        for (const runtime of [originals.runtime, originals.nativeRuntime]) await stop(() => runtime.close({ removeScratch: false }),
          value => value.stopped && runtime.lifecycle.find(row => row.event === 'stopped-owned-process')?.forced === false);
      }
      selected.tls = null;
      if (failures.length) throw new AggregateError(failures, 'NATIVE_DEVICE_LOCAL_REOPEN_CLOSE_UNCONFIRMED');
      return Object.freeze({ closed: true, originalResourcesStopped: true, retainedEncryptedJournals: true,
        normalCloseRestoresNewProcess: false });
    })();
  }
  try {
    const successor = await import('./native-value-economic-successor-v1.mjs');
    const opened = await successor.reopenOriginalNativeValueEconomicNoteSuccessorV1(locator.identity, locator.checkpoint);
    originals = opened.originals;
    assert.equal(opened.receipt.processId, process.pid); assert.equal(opened.receipt.originalProcessLifetimeDifferent, true);
    assert.equal(opened.receipt.issuerClosed, true); assert.equal(opened.receipt.sourceSHA256, locator.identity.sourceSHA256);
    // The session opener alone restores the authenticated state checkpoint.
    // Legacy captures retain their original branch; never create state on OPEN.
    const economicState = readOriginalSessionWalletEconomicStateV1(originals.session);
    if (economicState !== null) await economicState.observe();
    const service = await import('./native-device-economic-service-v1.mjs');
    // Original private producer independently requires exact pairing, S and F,
    // provider identity, current nullifiers, canonical receipt and deployed U.
    installed = await(durable?service.reinstallOriginalNativeDeviceDurableEconomicServiceV1:service.reinstallOriginalNativeDeviceEconomicServiceV1)({ runtime: originals.runtime, system: originals.system,
      owner: originals.owner, account: originals.account, nativeExecution: originals.nativeExecution,
      providerCustody: originals.providerCustody, actor: originals.actor, tls: selected.tls,...(durable?infrastructure:{}) });
    assert.deepEqual(installed.descriptor, locator.descriptor); assert.equal(installed.parentJobId, locator.parentJobId);
    return Object.freeze({ profile: durable?'ORIGINAL_NATIVE_DEVICE_DURABLE_LOCAL_OPERATOR_V1':product.ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1, origin: installed.transport.url,
      descriptor: installed.descriptor, localFakeValues: true, automaticFunding: false, cloudAuthority: false,
      plannedOriginalFReopen: true, abruptCrashRecoveryEstablished: false, readReconcileWithdrawalOnly: true,...(durable?{durableOriginalAdmission:true}:{}), close });
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'NATIVE_DEVICE_LOCAL_REOPEN_AND_CLOSE_UNCONFIRMED', { cause: error }); }
    throw error;
  }
}
