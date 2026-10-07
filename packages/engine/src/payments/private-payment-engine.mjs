import {PRIVATE_RESOURCE_FLOORS,PRIVATE_RESOURCE_POLICY,PRIVATE_PROOF_WORKER_RSS_LIMIT} from '../crypto/private-resource-policy.mjs';
/** Fixed-profile PC18 private payment, owned synthetic local assets only.
 * Importing is inert. The public entrypoint accepts no endpoint, executable,
 * key, destination, amount, witness or proof. IPC and HTTP use only sanitized
 * checkpoints. This is owner-independent availability on a trusted common OS,
 * not hostile-host isolation or restart of the authority or chain runtimes.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, open } from 'node:fs/promises';
import { readFileSync, statfsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnedNativeRuntime } from '../chains/shared/native-runtime.mjs';
import { createOwnedSolanaRuntime, base58Decode } from '../chains/solana/solana-runtime.mjs';
import { projectRoot } from '../chains/shared/runtime-harness.mjs';
import { createDisposableNativeIssuerLifetime } from '../notes/private-native-certificate.mjs';
import { createCurrentFinalityAuthority, FINALITY_PROFILE_NAME } from '../finality/private-finality-authority.mjs';
import { deployPrivateAssemblyNativePool, assertPrivateSnapshotCanonical } from '../assembly/private-assembly-runtime.mjs';
import { captureAssemblyEvmReceipt } from '../assembly/private-assembly-evm-audit.mjs';
import { launchAssemblyProcess, createAssemblyFrameDecoder, encodeAssemblyFrame, validateAssemblyProofPackage, assemblyPackageDigest } from '../assembly/private-assembly-actors.mjs';
import { createAssemblyNativeDispatch, assemblyFieldInventory, assemblyEvmProof, assemblyProofDigest } from '../assembly/private-assembly-native-dispatch.mjs';
import { policyCommitment } from '../notes/private-note-encoding.mjs';
import { PrivateNoteTree, noteWordsToHash, PRIVATE_POOL_INPUT_WORDS, ZERO_NOTE_HASH, applyPrivateNoteCapacityTransition } from '../notes/private-note-tree.mjs';
import { importRecipientInvoice } from '../recipients/private-recipient-custody.mjs';
import { createRecipientPayoutRecovery } from '../recovery/private-payout-recovery.mjs';
import { createOwnerRefundWithdrawalRecovery } from '../recovery/private-owner-refund-recovery.mjs';
import { launchOwnerRefundProcess } from '../recovery/private-owner-refund-process.mjs';
import { validateOwnerRefundOpening } from '../recovery/private-owner-refund-custody.mjs';
import { createOwnerRefundSettlementReconciler } from '../recovery/private-owner-refund-settlement.mjs';


export const PRIVATE_PAYMENT_PROFILE = 'PC18_EXACT_LOCAL_V1';
export const PRIVATE_PAYMENT_AMOUNTS = Object.freeze({ reserveWei: '1000000000000000', payoutWei: '500000000000000', solLamports: '3000000', btcSats: '100000' });
const NATIVE_FAKE_FUNDS_ONLY = Symbol('PC18_OWNED_LOCAL_FAKE_FUNDS_ONLY');
const stamp = () => process.hrtime.bigint().toString();
const sha = value => createHash('sha256').update(value).digest('hex');
const pref = value => `0x${Buffer.from(value).toString('hex')}`;
const safeCode = error => /^[A-Z][A-Z0-9_]{1,100}$/.test(error?.code ?? '') ? error.code : /^[A-Z][A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : 'PRIVATE_PAYMENT_OPERATION_FAILED';
export function resourceSnapshot() { const s = statfsSync(projectRoot), m = process.memoryUsage(); return { availableRAM: Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) * 1024, freeDisk: s.bavail * s.bsize, controllerRSS: m.rss, controllerExternal: m.external, controllerArrayBuffers: m.arrayBuffers }; }
export function resourceGuard() { const r = resourceSnapshot(); assert.ok(r.availableRAM >= PRIVATE_RESOURCE_FLOORS.availableRAM, 'PC18_AVAILABLE_RAM_FLOOR'); assert.ok(r.freeDisk >= PRIVATE_RESOURCE_FLOORS.freeDisk, 'PC18_DISK_FLOOR'); return r; }

const phases = new Set(['PREPARING','FUNDING','AUTHORIZING','OWNER_RELEASED','SOL_PENDING','SOL_FINALIZED','BTC_PENDING','BTC_CONFIRMED','SETTLING','WITHDRAWING','COMPLETED','FAILED','RECOVERABLE','RECOVERING','REFUNDABLE','REFUNDING','REFUNDED']);
const owners = new Set(['PREPARING','PACKAGES_ACKNOWLEDGED','EXIT_CONFIRMED']);
const settlements = new Set(['NOT_FUNDED','FUNDED','PAYOUT_NOTES_ISSUED','RECOVERY_NOTE_ISSUED','UNKNOWN']);
const exposures = new Set(['NONE','MAY_HAVE_SUBMITTED','SIGNED_RETAINED','OBSERVED']);
const payoutStates = new Set(['PENDING','ISSUED','WITHDRAWN']);
const cleanups = new Set(['NOT_STARTED','RUNNING','COMPLETED','FAILED','RETAINED']);
const ownerRefundStates = new Set(['NONE','WAITING','ELIGIBLE','NOTE_ISSUED','WITHDRAWN','UNKNOWN','UNAVAILABLE']);
export const PRIVATE_REFUND_RECOVERY_MARGIN_MS = 35 * 60_000;
export const PRIVATE_REFUND_LIFETIME_MAX_MS = 3 * 60 * 60_000;
const emptyOwnerRefund = () => ({state:'NONE',amountWei:null,claimEpoch:null,eligibleAt:null});
const recoveryStates = new Set(['NONE','AVAILABLE','RUNNING','COMPLETED','UNAVAILABLE']);
/** Exact allowlist. No arbitrary observation text, native IDs or proof material. */
export function sanitizePrivatePaymentSummary(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'PRIVATE_PAYMENT_SUMMARY');
  assert.ok(phases.has(value.phase) && ['RUNNING','STOPPED'].includes(value.engineState), 'PRIVATE_PAYMENT_SUMMARY_PHASE');
  assert.ok(owners.has(value.ownerState) && settlements.has(value.settlementState), 'PRIVATE_PAYMENT_SUMMARY_STATE');
  assert.ok(cleanups.has(value.cleanupState) && ['LIVE','RETAINED_HISTORY'].includes(value.observation), 'PRIVATE_PAYMENT_SUMMARY_CLEANUP');
  assert.ok(/^[A-Z][A-Z0-9_]{0,79}$/.test(value.progressCode), 'PRIVATE_PAYMENT_PROGRESS_CODE');
  assert.ok(recoveryStates.has(value.recoveryState ?? 'NONE'), 'PRIVATE_PAYMENT_RECOVERY_STATE');
  const ownerRefund = { ...(value.ownerRefund ?? emptyOwnerRefund()) };
  assert.deepEqual(Object.keys(ownerRefund).sort(), ['amountWei','claimEpoch','eligibleAt','state'], 'PRIVATE_PAYMENT_OWNER_REFUND_FIELDS');
  assert.ok(ownerRefundStates.has(ownerRefund.state), 'PRIVATE_PAYMENT_OWNER_REFUND_STATE');
  assert.ok(ownerRefund.amountWei === null || ownerRefund.amountWei === PRIVATE_PAYMENT_AMOUNTS.reserveWei, 'PRIVATE_PAYMENT_OWNER_REFUND_AMOUNT');
  assert.ok(ownerRefund.claimEpoch === null || typeof ownerRefund.claimEpoch === 'string' && /^(0|[1-9][0-9]{0,15})$/.test(ownerRefund.claimEpoch), 'PRIVATE_PAYMENT_OWNER_REFUND_CUTOFF');
  assert.ok(ownerRefund.eligibleAt === null || typeof ownerRefund.eligibleAt === 'string' && new Date(ownerRefund.eligibleAt).toISOString() === ownerRefund.eligibleAt, 'PRIVATE_PAYMENT_OWNER_REFUND_TIME');
  if(ownerRefund.state === 'NONE') assert.ok(ownerRefund.amountWei === null && ownerRefund.claimEpoch === null && ownerRefund.eligibleAt === null, 'PRIVATE_PAYMENT_OWNER_REFUND_EMPTY');
  else assert.ok(ownerRefund.amountWei === PRIVATE_PAYMENT_AMOUNTS.reserveWei && ownerRefund.claimEpoch !== null && ownerRefund.eligibleAt !== null, 'PRIVATE_PAYMENT_OWNER_REFUND_BINDING');
  const exposure = {}, payouts = {};
  for (const role of ['evm','sol','btc']) { assert.ok(exposures.has(value.exposure?.[role]), 'PRIVATE_PAYMENT_EXPOSURE'); exposure[role] = value.exposure[role]; }
  for (const role of ['sol','btc']) {
    const p = value.payouts?.[role]; assert.ok(payoutStates.has(p?.state) && (p.amountWei === null || p.amountWei === PRIVATE_PAYMENT_AMOUNTS.payoutWei), 'PRIVATE_PAYMENT_PAYOUT');
    assert.equal(p.state === 'PENDING', p.amountWei === null, 'PRIVATE_PAYMENT_PAYOUT_AMOUNT');
    payouts[role] = { state: p.state, amountWei: p.amountWei };
  }
  if (value.phase === 'RECOVERABLE') assert.ok(value.engineState === 'STOPPED' && value.cleanupState === 'RETAINED' && value.observation === 'LIVE' && value.recoveryState === 'AVAILABLE' && value.settlementState === 'PAYOUT_NOTES_ISSUED' && value.ownerState === 'EXIT_CONFIRMED' && ['sol','btc'].every(role=>value.exposure[role]==='OBSERVED'&&['ISSUED','WITHDRAWN'].includes(payouts[role].state)), 'PRIVATE_PAYMENT_RECOVERABLE_STATE');
  if (value.phase === 'REFUNDABLE') assert.ok(value.engineState === 'STOPPED' && value.cleanupState === 'RETAINED' && value.observation === 'LIVE' && value.ownerState === 'EXIT_CONFIRMED' && ['WAITING','ELIGIBLE','NOTE_ISSUED','UNKNOWN'].includes(ownerRefund.state), 'PRIVATE_PAYMENT_REFUNDABLE_STATE');
  if (value.phase === 'REFUNDED') assert.ok(ownerRefund.state === 'WITHDRAWN' && value.settlementState === 'RECOVERY_NOTE_ISSUED', 'PRIVATE_PAYMENT_REFUND_INCOMPLETE');
  if (['NOTE_ISSUED','WITHDRAWN'].includes(ownerRefund.state)) assert.ok(value.settlementState === 'RECOVERY_NOTE_ISSUED' && ['sol','btc'].every(role=>payouts[role].state === 'PENDING'), 'PRIVATE_PAYMENT_REFUND_CLAIM_CONFLICT');
  if (value.phase === 'COMPLETED') assert.ok(['sol','btc'].every(role => payouts[role].state === 'WITHDRAWN'), 'PRIVATE_PAYMENT_INCOMPLETE_PAYOUTS');
  const result = { phase: value.phase, progressCode: value.progressCode, engineState: value.engineState, ownerState: value.ownerState, settlementState: value.settlementState, exposure, payouts, cleanupState: value.cleanupState, observation: value.observation, recoveryState: value.recoveryState ?? 'NONE', ownerRefund };
  if (value.errorCode !== undefined) { assert.ok(/^[A-Z][A-Z0-9_]{1,100}$/.test(value.errorCode), 'PRIVATE_PAYMENT_ERROR_CODE'); result.errorCode = value.errorCode; }
  return result;
}
export function validatePrivatePaymentRequest(options) {
  assert.ok(options && typeof options === 'object' && !Array.isArray(options), 'PRIVATE_PAYMENT_REQUEST');
  assert.ok(Object.keys(options).every(k => ['operationId','profile','onCheckpoint','signal'].includes(k)), 'PRIVATE_PAYMENT_REQUEST_FIELDS');
  assert.match(options.operationId, /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/, 'PRIVATE_PAYMENT_OPERATION_ID');
  assert.equal(options.profile, PRIVATE_PAYMENT_PROFILE, 'PRIVATE_PAYMENT_PROFILE');
  assert.equal(typeof options.onCheckpoint, 'function', 'PRIVATE_PAYMENT_CHECKPOINT_REQUIRED');
  if (options.signal !== undefined) assert.ok(options.signal instanceof AbortSignal, 'PRIVATE_PAYMENT_SIGNAL');
}
const initialSummary = () => ({ phase: 'PREPARING', progressCode: 'PREPARING', engineState: 'RUNNING', ownerState: 'PREPARING', settlementState: 'NOT_FUNDED', exposure: { evm:'NONE', sol:'NONE', btc:'NONE' }, payouts: { sol:{ state:'PENDING',amountWei:null }, btc:{ state:'PENDING',amountWei:null } }, cleanupState:'NOT_STARTED', observation:'LIVE', recoveryState:'NONE', ownerRefund:emptyOwnerRefund() });

/** Shared positive paid-flow coordinator. Drivers are trusted in-process code;
 * no test hook or driver crosses the production worker IPC boundary. Harness
 * controls, where requested, remain in its own driver rather than user payments.
 */
export async function completeAssemblyPaidPayment(driver, { solAlready = false } = {}) {
  if (!solAlready) await driver.execute('sol', await driver.readiness('sol'));
  await driver.assertOwnerExited();
  await driver.join();
  await driver.execute('btc', await driver.readiness('btc'));
  const terminal = await driver.terminal();
  for (const role of ['sol','btc']) await driver.permit(role, terminal);
  await driver.claim(terminal);
  const withdrawals = [];
  for (const role of ['sol','btc']) withdrawals.push(await driver.withdraw(role));
  assert.equal(withdrawals.reduce((sum, w) => sum + BigInt(w.amount), 0n), BigInt(PRIVATE_PAYMENT_AMOUNTS.reserveWei), 'PRIVATE_PAYMENT_EXACT_TOTAL');
  return withdrawals;
}

/** Trusted host injection is solely a module-level host test seam; not an IPC,
 * HTTP, environment or request option. Production always selects owned host. */
export async function runPrivatePaymentWithHostForTest(options, createHost) {
  validatePrivatePaymentRequest(options);
  assert.equal(typeof createHost, 'function', 'PRIVATE_PAYMENT_HOST');
  const state = initialSummary(); let host, fault, checkpointFault, completed = false, reservePriorExposure;
  const guard = () => { if (checkpointFault) throw checkpointFault; if (options.signal?.aborted) throw Object.assign(new Error('PRIVATE_PAYMENT_ABORTED'), { code:'PRIVATE_PAYMENT_ABORTED' }); };
  const publish = async (patch = {}) => {
    Object.assign(state, patch); guard();
    try { await options.onCheckpoint(sanitizePrivatePaymentSummary(state)); }
    catch { checkpointFault = Object.assign(new Error('PRIVATE_PAYMENT_CHECKPOINT_FAILED'), { code:'PRIVATE_PAYMENT_CHECKPOINT_FAILED' }); throw checkpointFault; }
    guard();
  };
  const context = {
    operationId: options.operationId, signal: options.signal, guard, publish,
    update(patch) { Object.assign(state, patch); },
    reserveNotSubmitted() { state.settlementState='NOT_FUNDED';state.ownerRefund=emptyOwnerRefund();state.exposure.evm=reservePriorExposure??state.exposure.evm; },
    reserveReverted() { state.settlementState='NOT_FUNDED';state.ownerRefund=emptyOwnerRefund();state.exposure.evm='OBSERVED'; },
    async beforeEvm(purpose) {
      if(purpose==='reserve')reservePriorExposure=state.exposure.evm;
      state.exposure.evm = 'MAY_HAVE_SUBMITTED';
      if (purpose === 'reserve' || purpose === 'claim') state.settlementState = 'UNKNOWN';
      await publish({ progressCode: purpose === 'reserve' ? 'RESERVE_SUBMISSION_PENDING' : purpose === 'claim' ? 'CLAIM_SUBMISSION_PENDING' : 'EVM_SUBMISSION_PENDING' });
    },
    evmConfirmed(purpose) {
      state.exposure.evm = 'OBSERVED';
      if (purpose === 'reserve') state.settlementState = 'FUNDED';
      if (purpose === 'claim') { state.settlementState = 'PAYOUT_NOTES_ISSUED'; for (const role of ['sol','btc']) state.payouts[role] = { state:'ISSUED',amountWei:PRIVATE_PAYMENT_AMOUNTS.payoutWei }; }
    },
    withdrawalConfirmed(role, amount) {
      assert.ok(['sol','btc'].includes(role));assert.equal(amount,PRIVATE_PAYMENT_AMOUNTS.payoutWei,'PRIVATE_PAYMENT_EXACT_PAYOUT');
      state.payouts[role]={state:'WITHDRAWN',amountWei:amount};
      if(['sol','btc'].every(r=>state.payouts[r].state==='WITHDRAWN'))completed=true;
    },
    async signedRetained(role) { state.exposure[role] = 'SIGNED_RETAINED'; await publish({ progressCode: role === 'sol' ? 'SOL_SIGNED_RETAINED' : 'BTC_SIGNED_RETAINED' }); },
    async beforeNative(role) { state.exposure[role] = 'MAY_HAVE_SUBMITTED'; await publish({ progressCode: role === 'sol' ? 'SOL_SUBMISSION_PENDING' : 'BTC_SUBMISSION_PENDING' }); },
    async observed(role) { state.exposure[role] = 'OBSERVED'; await publish({ progressCode: role === 'sol' ? 'SOL_DELIVERY_OBSERVED' : 'BTC_DELIVERY_OBSERVED' }); },
  };
  try {
    await publish(); host = await createHost(context, NATIVE_FAKE_FUNDS_ONLY); guard();
    await host.prepare();
    await publish({ phase:'PREPARING',progressCode:'RESERVE_PROOF' }); await host.prepareReserve();
    await publish({ phase:'AUTHORIZING',progressCode:'AUTHORIZATION_AND_PACKAGES' }); await host.authorize();
    await publish({ ownerState:'PACKAGES_ACKNOWLEDGED',progressCode:'PACKAGES_ACKNOWLEDGED' });
    await host.releaseOwner();
    await publish({ phase:'OWNER_RELEASED',ownerState:'EXIT_CONFIRMED',progressCode:'OWNER_EXIT_CONFIRMED' });
    await host.assertOwnerExited();
    await publish({ phase:'FUNDING',progressCode:'GUARDED_RESERVE_SUBMISSION' }); await host.reserve();
    assert.equal(state.settlementState, 'FUNDED', 'PRIVATE_PAYMENT_FUNDING_UNCONFIRMED');
    await completeAssemblyPaidPayment({
      async readiness(role) { await publish({phase:role === 'sol' ? 'SOL_PENDING' : 'BTC_PENDING',progressCode:role === 'sol' ? 'SOL_READINESS_PROOF' : 'BTC_READINESS_PROOF'}); return host.readiness(role); },
      async execute(role, readiness) { await host.execute(role, readiness); await publish({ phase:role === 'sol' ? 'SOL_FINALIZED' : 'BTC_CONFIRMED',progressCode:role === 'sol' ? 'SOL_LOCAL_PROOF_RETAINED' : 'BTC_LOCAL_PROOF_RETAINED' }); },
      async assertOwnerExited() { guard(); assert.equal(state.ownerState,'EXIT_CONFIRMED'); await host.assertOwnerExited(); },
      async join() { await publish({progressCode:'JOIN_PROOF'}); await host.join(); },
      async terminal() { await publish({phase:'SETTLING',progressCode:'TERMINAL_PROOF'}); return host.terminal(); },
      async permit(role, terminal) { await publish({progressCode:role === 'sol' ? 'SOL_FRESH_PERMIT' : 'BTC_FRESH_PERMIT'}); await host.permit(role, terminal); },
      async claim(terminal) { await publish({progressCode:'CLAIM'}); await host.claim(terminal); assert.equal(state.settlementState,'PAYOUT_NOTES_ISSUED'); await publish({progressCode:'PAYOUT_NOTES_ISSUED'}); },
      async withdraw(role) {
        await publish({phase:'WITHDRAWING',progressCode:role === 'sol' ? 'SOL_RECIPIENT_WITHDRAWAL' : 'BTC_RECIPIENT_WITHDRAWAL'});
        const result = await host.withdraw(role); assert.equal(result.amount,PRIVATE_PAYMENT_AMOUNTS.payoutWei,'PRIVATE_PAYMENT_EXACT_PAYOUT');
        state.payouts[role] = { state:'WITHDRAWN',amountWei:result.amount };
        // Record economic success synchronously before any ACK can fail.
        if (['sol','btc'].every(r => state.payouts[r].state === 'WITHDRAWN')) completed = true;
        await publish({progressCode:role === 'sol' ? 'SOL_PAYOUT_WITHDRAWN' : 'BTC_PAYOUT_WITHDRAWN'}); return result;
      },
    });
    await host.verifyCompletion();
    completed = true;
  } catch (error) { fault = error; }
  finally {
    state.phase = completed ? 'COMPLETED' : 'FAILED';
    state.progressCode = completed ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED';
    if (fault) state.errorCode = safeCode(fault);
    state.cleanupState = 'RUNNING';
    // Persistence loss must never prevent disposal of owned processes. These
    // final notifications are best effort; no irreversible action follows them.
    try { await publish(); } catch {}
    try { if (host) await host.cleanup(); state.cleanupState = 'COMPLETED'; }
    catch { state.cleanupState = 'FAILED'; state.errorCode ??= 'PRIVATE_PAYMENT_CLEANUP_FAILED'; }
    state.engineState = 'STOPPED'; state.observation = 'RETAINED_HISTORY';
    try { await options.onCheckpoint(sanitizePrivatePaymentSummary(state)); } catch { state.errorCode ??= 'PRIVATE_PAYMENT_CHECKPOINT_FAILED'; }
  }
  return sanitizePrivatePaymentSummary(state);
}

export async function runPrivatePayment(options) { return runPrivatePaymentWithHostForTest(options, createOwnedPaymentHost); }

/** Private authority owned by the long-lived keeper. A disposable coordinator
 * may invoke only these fixed operations; proofs, keys and readiness packages
 * never leave this closure. This factory is inert until an operation is run.
 * createHost is a trusted module test seam, never an IPC/request option. */
export function createPrivatePaymentAuthority(options, createHost = createOwnedPaymentHost) {
  validatePrivatePaymentRequest(options);
  assert.equal(typeof createHost, 'function', 'PRIVATE_PAYMENT_HOST');
  const state = initialSummary();
  let reservePriorExposure;
  let host, ready, terminal, checkpointFault, disposed = false, claimAttempted = false, recoveryAttempted = false, hostPrepared = false;
  const lifecycle = [];
  const guard = () => {
    if (checkpointFault) throw checkpointFault;
    if (options.signal?.aborted || disposed) throw Object.assign(new Error('PRIVATE_PAYMENT_ABORTED'), { code:'PRIVATE_PAYMENT_ABORTED' });
  };
  const publish = async (patch = {}) => {
    Object.assign(state, patch); guard();
    try { await options.onCheckpoint(sanitizePrivatePaymentSummary(state)); }
    catch { checkpointFault = Object.assign(new Error('PRIVATE_PAYMENT_CHECKPOINT_FAILED'), { code:'PRIVATE_PAYMENT_CHECKPOINT_FAILED' }); throw checkpointFault; }
    guard();
  };
  const context = {
    operationId:options.operationId, signal:options.signal, guard, publish,
    update(patch) { Object.assign(state, patch); },
    reserveNotSubmitted() { state.settlementState='NOT_FUNDED';state.ownerRefund=emptyOwnerRefund();state.exposure.evm=reservePriorExposure??state.exposure.evm; },
    reserveReverted() { state.settlementState='NOT_FUNDED';state.ownerRefund=emptyOwnerRefund();state.exposure.evm='OBSERVED'; },
    async beforeEvm(purpose) {
      if(purpose==='reserve')reservePriorExposure=state.exposure.evm;
      state.exposure.evm = 'MAY_HAVE_SUBMITTED';
      if (['reserve','claim','refund'].includes(purpose)) state.settlementState = 'UNKNOWN';
      if(purpose==='refund')state.ownerRefund.state='UNKNOWN';
      await publish({progressCode:purpose === 'reserve' ? 'RESERVE_SUBMISSION_PENDING' : purpose === 'claim' ? 'CLAIM_SUBMISSION_PENDING' : purpose === 'refund' ? 'REFUND_SUBMISSION_PENDING' : 'EVM_SUBMISSION_PENDING'});
    },
    evmConfirmed(purpose) {
      state.exposure.evm = 'OBSERVED';
      if (purpose === 'reserve') state.settlementState = 'FUNDED';
      if (purpose === 'claim') {
        state.settlementState = 'PAYOUT_NOTES_ISSUED';
        if(state.ownerRefund.state !== 'NONE')state.ownerRefund.state='UNAVAILABLE';
        for (const role of ['sol','btc']) if (state.payouts[role].state !== 'WITHDRAWN') state.payouts[role] = {state:'ISSUED',amountWei:PRIVATE_PAYMENT_AMOUNTS.payoutWei};
      }
      if(purpose === 'refund') { state.settlementState='RECOVERY_NOTE_ISSUED'; if(state.ownerRefund.state!=='WITHDRAWN')state.ownerRefund.state='NOTE_ISSUED'; }
    },
    withdrawalConfirmed(role, amount) {
      assert.ok(['sol','btc'].includes(role), 'PRIVATE_PAYMENT_ROLE');
      assert.equal(amount, PRIVATE_PAYMENT_AMOUNTS.payoutWei, 'PRIVATE_PAYMENT_EXACT_PAYOUT');
      state.payouts[role] = {state:'WITHDRAWN',amountWei:amount};
    },
    ownerRefundConfirmed(amount) {
      assert.equal(amount,PRIVATE_PAYMENT_AMOUNTS.reserveWei,'PRIVATE_PAYMENT_EXACT_OWNER_REFUND');
      assert.ok(['sol','btc'].every(role=>state.payouts[role].state==='PENDING'),'PRIVATE_PAYMENT_REFUND_CLAIM_CONFLICT');
      state.settlementState='RECOVERY_NOTE_ISSUED';state.ownerRefund.state='WITHDRAWN';state.ownerRefund.amountWei=amount;
    },
    async signedRetained(role) { state.exposure[role] = 'SIGNED_RETAINED'; await publish({progressCode:role === 'sol' ? 'SOL_SIGNED_RETAINED' : 'BTC_SIGNED_RETAINED'}); },
    async beforeNative(role) { state.exposure[role] = 'MAY_HAVE_SUBMITTED'; await publish({progressCode:role === 'sol' ? 'SOL_SUBMISSION_PENDING' : 'BTC_SUBMISSION_PENDING'}); },
    async observed(role) { state.exposure[role] = 'OBSERVED'; await publish({progressCode:role === 'sol' ? 'SOL_DELIVERY_OBSERVED' : 'BTC_DELIVERY_OBSERVED'}); },
  };
  const completed = () => ['sol','btc'].every(role => state.payouts[role].state === 'WITHDRAWN');
  const refunded = () => state.ownerRefund.state === 'WITHDRAWN';
  async function reconcilePayouts() {
    if (!host || !claimAttempted || typeof host.reconcilePayouts !== 'function') return;
    const results = await host.reconcilePayouts();
    if (['sol','btc'].every(role => ['READY','WITHDRAWN'].includes(results?.[role]?.state))) context.evmConfirmed('claim');
    for (const role of ['sol','btc']) if (results?.[role]?.state === 'WITHDRAWN') context.withdrawalConfirmed(role, results[role].amount);
  }
  async function reconcileRefund() {
    if(!host?.refundStatus || state.ownerState!=='EXIT_CONFIRMED')return;
    const result=await host.refundStatus();
    if(!result)return;
    if(result.state==='CLAIMED') { claimAttempted=true;context.evmConfirmed('claim');await reconcilePayouts();return; }
    assert.ok(['WAITING','ELIGIBLE','NOTE_ISSUED','WITHDRAWN','UNKNOWN'].includes(result.state),'PRIVATE_PAYMENT_REFUND_STATUS');
    state.ownerRefund={state:result.state,amountWei:PRIVATE_PAYMENT_AMOUNTS.reserveWei,claimEpoch:result.claimEpoch,eligibleAt:result.eligibleAt};
    if(['NOTE_ISSUED','WITHDRAWN'].includes(result.state))context.evmConfirmed('refund');
    if(result.state==='WITHDRAWN')context.ownerRefundConfirmed(result.amount);
    if(['WAITING','ELIGIBLE'].includes(result.state))state.settlementState='FUNDED';
    if(result.state==='UNKNOWN'&&state.settlementState!=='RECOVERY_NOTE_ISSUED')state.settlementState='UNKNOWN';
    return result;
  }
  async function reconcile() { await reconcilePayouts(); if(state.settlementState!=='PAYOUT_NOTES_ISSUED')await reconcileRefund(); }
  async function withdraw(role, recovering) {
    await publish({phase:recovering ? 'RECOVERING' : 'WITHDRAWING',progressCode:role === 'sol' ? 'SOL_RECIPIENT_WITHDRAWAL' : 'BTC_RECIPIENT_WITHDRAWAL'});
    const result = await (recovering ? host.recoverWithdraw(role) : host.withdraw(role));
    context.withdrawalConfirmed(role, result.amount);
    await publish({progressCode:role === 'sol' ? 'SOL_PAYOUT_WITHDRAWN' : 'BTC_PAYOUT_WITHDRAWN'});
  }
  async function beginRefund(recovering) {
    await host.assertOwnerExited();await reconcileRefund();
    assert.ok(recovering ? ['NOTE_ISSUED','WITHDRAWN'].includes(state.ownerRefund.state) : ['WAITING','ELIGIBLE'].includes(state.ownerRefund.state),'PRIVATE_PAYMENT_OWNER_REFUND_UNAVAILABLE');
    assert.notEqual(state.settlementState,'PAYOUT_NOTES_ISSUED','PRIVATE_PAYMENT_REFUND_CLAIM_CONFLICT');
    await publish({phase:'REFUNDING',progressCode:recovering?'VALIDATING_SAME_POOL_REFUND':'WAITING_FOR_OWNER_REFUND_CUTOFF',engineState:'RUNNING',cleanupState:'NOT_STARTED',recoveryState:'NONE'});
  }
  const operations = {
    async prepare() { await publish(); host = await createHost(context,NATIVE_FAKE_FUNDS_ONLY); guard(); await host.prepare(); hostPrepared=true; for(const entry of lifecycle.splice(0))await host.recordCoordinator?.(entry); },
    async prepareReserve() { assert.equal(state.settlementState,'NOT_FUNDED'); await publish({phase:'PREPARING',progressCode:'RESERVE_PROOF'}); await host.prepareReserve(); },
    async reserve() { assert.equal(state.ownerState,'EXIT_CONFIRMED','PRIVATE_PAYMENT_FUNDING_OWNER_REQUIRED'); await host.assertOwnerExited(); await publish({phase:'FUNDING',progressCode:'GUARDED_RESERVE_SUBMISSION'}); await host.reserve(); assert.equal(state.settlementState,'FUNDED','PRIVATE_PAYMENT_FUNDING_UNCONFIRMED'); },
    async authorize() { await publish({phase:'AUTHORIZING',progressCode:'AUTHORIZATION_AND_PACKAGES'}); await host.authorize(); await publish({ownerState:'PACKAGES_ACKNOWLEDGED',progressCode:'PACKAGES_ACKNOWLEDGED'}); },
    async releaseOwner() { await host.releaseOwner(); await publish({phase:'OWNER_RELEASED',ownerState:'EXIT_CONFIRMED',progressCode:'OWNER_EXIT_CONFIRMED'}); },
    async sol() { await publish({phase:'SOL_PENDING',progressCode:'SOL_READINESS_PROOF'}); ready = await host.readiness('sol'); await host.execute('sol',ready); ready = undefined; await publish({phase:'SOL_FINALIZED',progressCode:'SOL_LOCAL_PROOF_RETAINED'}); },
    async join() { assert.equal(state.ownerState,'EXIT_CONFIRMED'); await host.assertOwnerExited(); await publish({progressCode:'JOIN_PROOF'}); await host.join(); },
    async btc() { await publish({phase:'BTC_PENDING',progressCode:'BTC_READINESS_PROOF'}); ready = await host.readiness('btc'); await host.execute('btc',ready); ready = undefined; await publish({phase:'BTC_CONFIRMED',progressCode:'BTC_LOCAL_PROOF_RETAINED'}); },
    async terminal() { await publish({phase:'SETTLING',progressCode:'TERMINAL_PROOF'}); terminal = await host.terminal(); },
    async permitSol() { await publish({progressCode:'SOL_FRESH_PERMIT'}); await host.permit('sol',terminal); },
    async permitBtc() { await publish({progressCode:'BTC_FRESH_PERMIT'}); await host.permit('btc',terminal); },
    async claim() { await publish({progressCode:'CLAIM'}); claimAttempted = true; await host.claim(terminal); terminal = undefined; assert.equal(state.settlementState,'PAYOUT_NOTES_ISSUED'); await publish({progressCode:'PAYOUT_NOTES_ISSUED'}); },
    async withdrawSol() { await withdraw('sol',false); }, async withdrawBtc() { await withdraw('btc',false); },
    async validateRecovery() {
      recoveryAttempted = true;
      await publish({phase:'RECOVERING',progressCode:'VALIDATING_SAME_POOL_PAYOUTS',engineState:'RUNNING',cleanupState:'NOT_STARTED',recoveryState:'RUNNING'});
      await host.assertOwnerExited(); await host.validateRecovery(); await reconcilePayouts();
      assert.equal(state.settlementState,'PAYOUT_NOTES_ISSUED','PRIVATE_PAYMENT_RECOVERY_NOT_ISSUED');
    },
    async recoverSol() { await withdraw('sol',true); }, async recoverBtc() { await withdraw('btc',true); },
    async verify() { await host.verifyCompletion(); assert.ok(completed(),'PRIVATE_PAYMENT_INCOMPLETE_PAYOUTS'); },
    async validateRefund() { await beginRefund(false); },
    async awaitRefundCutoff() {
      for(;;) {
        guard();await reconcileRefund();
        if(state.ownerRefund.state==='ELIGIBLE') { await publish({progressCode:'OWNER_REFUND_ELIGIBLE'});return; }
        assert.equal(state.ownerRefund.state,'WAITING','PRIVATE_PAYMENT_OWNER_REFUND_UNAVAILABLE');
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
    },
    async issueRefund() {
      await reconcileRefund();assert.equal(state.ownerRefund.state,'ELIGIBLE','PRIVATE_PAYMENT_OWNER_REFUND_UNAVAILABLE');
      await publish({progressCode:'OWNER_REFUND_PROOF'});await host.issueRefund();await reconcileRefund();
      assert.equal(state.ownerRefund.state,'NOTE_ISSUED','PRIVATE_PAYMENT_REFUND_ISSUANCE_UNCONFIRMED');
      await publish({progressCode:'OWNER_REFUND_NOTE_ISSUED'});
    },
    async validateRefundRecovery() { await beginRefund(true); },
    async withdrawRefund() {
      await publish({progressCode:'OWNER_REFUND_WITHDRAWAL'});
      const result=await host.withdrawRefund();context.ownerRefundConfirmed(result.amount);
      await publish({progressCode:'OWNER_REFUND_WITHDRAWN'});
    },
    async verifyRefund() { await host.verifyRefund();assert.ok(refunded(),'PRIVATE_PAYMENT_REFUND_INCOMPLETE'); },
  };
  return Object.freeze({
    async execute(operation) { guard(); assert.ok(Object.hasOwn(operations,operation),'PRIVATE_PAYMENT_KEEPER_OPERATION'); await operations[operation](); guard(); },
    summary() { return sanitizePrivatePaymentSummary(state); },
    async recordCoordinator(entry) { if(hostPrepared)await host.recordCoordinator?.(entry);else lifecycle.push(entry); },
    async refundWindow() {
      if(!host?.refundWindow||!['WAITING','ELIGIBLE','NOTE_ISSUED','UNKNOWN'].includes(state.ownerRefund.state))return null;
      const window=await host.refundWindow();assert.ok(Number.isSafeInteger(window.remainingMs)&&window.remainingMs>=0&&window.remainingMs<=PRIVATE_REFUND_LIFETIME_MAX_MS,'PRIVATE_PAYMENT_REFUND_RETENTION_BOUND');return window;
    },
    async advanceToRefundCutoffForTest() { guard();assert.equal(typeof host?.advanceToRefundCutoffForTest,'function','PRIVATE_PAYMENT_REFUND_TEST_SEAM_UNAVAILABLE');return host.advanceToRefundCutoffForTest(); },
    async refreshRefund() {
      guard();if(state.phase!=='REFUNDABLE')return sanitizePrivatePaymentSummary(state);
      const previous=JSON.stringify(state);
      try { await reconcile(); } catch(error) {
        // A transient read failure is not evidence of either terminal branch.
        // Retain the original authority/latch until a later canonical read or
        // the absolute deadline. Checkpoint loss still disposes immediately.
        guard();await host.assertRetainedHealthy?.();state.errorCode=safeCode(error);
        if(state.settlementState!=='RECOVERY_NOTE_ISSUED') { state.ownerRefund.state='UNKNOWN';state.settlementState='UNKNOWN'; }
        await publish({progressCode:'OWNER_REFUND_EVIDENCE_UNAVAILABLE'});return sanitizePrivatePaymentSummary(state);
      }
      if(refunded())return this.cleanup();
      if(state.settlementState==='PAYOUT_NOTES_ISSUED')Object.assign(state,{phase:'RECOVERABLE',progressCode:'PAYOUT_RECOVERY_AVAILABLE',recoveryState:'AVAILABLE'});
      else state.progressCode='OWNER_REFUND_'+state.ownerRefund.state;
      if(previous!==JSON.stringify(state))await publish();
      return sanitizePrivatePaymentSummary(state);
    },
    async finishAttempt(fault, {retain = true} = {}) {
      if (fault) state.errorCode = safeCode(fault); else delete state.errorCode;
      if (!options.signal?.aborted) try { await reconcile(); } catch {}
      if (!completed()&&!refunded()&&retain&&host&&!checkpointFault&&!options.signal?.aborted) {
        if(state.settlementState === 'PAYOUT_NOTES_ISSUED')Object.assign(state,{phase:'RECOVERABLE',progressCode:'PAYOUT_RECOVERY_AVAILABLE',engineState:'STOPPED',cleanupState:'RETAINED',observation:'LIVE',recoveryState:'AVAILABLE'});
        else if(state.ownerState==='EXIT_CONFIRMED'&&['WAITING','ELIGIBLE','NOTE_ISSUED','UNKNOWN'].includes(state.ownerRefund.state))Object.assign(state,{phase:'REFUNDABLE',progressCode:'OWNER_REFUND_'+state.ownerRefund.state,engineState:'STOPPED',cleanupState:'RETAINED',observation:'LIVE',recoveryState:'NONE'});
        else return this.cleanup(fault);
        try { await options.onCheckpoint(sanitizePrivatePaymentSummary(state)); return sanitizePrivatePaymentSummary(state); }
        catch { state.errorCode = 'PRIVATE_PAYMENT_CHECKPOINT_FAILED'; }
      }
      return this.cleanup(fault);
    },
    async cleanup(fault) {
      if (disposed) return sanitizePrivatePaymentSummary(state);disposed = true;
      if (fault) state.errorCode ??= safeCode(fault);
      const ownerDone=refunded();
      if(!ownerDone&&state.ownerRefund.state!=='NONE')state.ownerRefund.state='UNAVAILABLE';
      Object.assign(state,{phase:completed()?'COMPLETED':ownerDone?'REFUNDED':'FAILED',progressCode:completed()?'PAYMENT_COMPLETED':ownerDone?'OWNER_REFUND_COMPLETED':'PAYMENT_FAILED',cleanupState:'RUNNING',recoveryState:completed()?(recoveryAttempted?'COMPLETED':'NONE'):claimAttempted?'UNAVAILABLE':'NONE'});
      try { await options.onCheckpoint(sanitizePrivatePaymentSummary(state)); } catch { state.errorCode ??= 'PRIVATE_PAYMENT_CHECKPOINT_FAILED'; }
      try { if (host) await host.cleanup(); state.cleanupState = 'COMPLETED'; }
      catch { state.cleanupState = 'FAILED'; state.errorCode ??= 'PRIVATE_PAYMENT_CLEANUP_FAILED'; }
      state.engineState = 'STOPPED'; state.observation = 'RETAINED_HISTORY';
      try { await options.onCheckpoint(sanitizePrivatePaymentSummary(state)); } catch { state.errorCode ??= 'PRIVATE_PAYMENT_CHECKPOINT_FAILED'; }
      return sanitizePrivatePaymentSummary(state);
    },
  });
}

/** Private trusted-host helpers. Their values are never IPC/request fields and
 * a projected root is NEVER accepted-root, readiness or refund authority. */
export async function preparePrivateReserveProjection({pool,runtime,reserve,epoch}) {
  const p=validateAssemblyProofPackage(reserve,'reserve').publicInputs;
  assert.equal(noteWordsToHash(p.slice(0,8)),pool.scope,'PRIVATE_PAYMENT_RESERVE_SCOPE');
  assert.equal(noteWordsToHash(p.slice(8,16)),pool.policy,'PRIVATE_PAYMENT_RESERVE_POLICY');
  assert.equal(BigInt(p[16]),BigInt(epoch),'PRIVATE_PAYMENT_RESERVE_EPOCH');
  assert.equal(BigInt(p[17]),BigInt(PRIVATE_PAYMENT_AMOUNTS.reserveWei),'PRIVATE_PAYMENT_EXACT_RESERVE');
  const snapshot=await pool.snapshot();
  assert.equal(snapshot.scope,pool.scope,'PRIVATE_PAYMENT_RESERVE_SCOPE');assert.equal(snapshot.policy,pool.policy,'PRIVATE_PAYMENT_RESERVE_POLICY');
  assert.equal(snapshot.epoch,BigInt(epoch).toString(),'PRIVATE_PAYMENT_RESERVE_EPOCH_CHANGED');
  assert.equal(BigInt(snapshot.blockTimestamp)/600n,BigInt(epoch),'PRIVATE_PAYMENT_RESERVE_EPOCH_CHANGED');
  assert.ok(Number.isSafeInteger(snapshot.leafCount)&&snapshot.leafCount>=0&&snapshot.leafCount<64&&Array.isArray(snapshot.leaves)&&snapshot.leaves.length===64,'PRIVATE_PAYMENT_RESERVE_LEAVES');
  assert.ok(snapshot.leaves.slice(snapshot.leafCount).every(x=>x===ZERO_NOTE_HASH),'PRIVATE_PAYMENT_RESERVE_PADDING');
  assert.match(snapshot.stateSequence,/^(0|[1-9][0-9]*)$/,'PRIVATE_PAYMENT_RESERVE_SEQUENCE');
  assert.ok(BigInt(snapshot.stateSequence)<(1n<<64n)-1n,'PRIVATE_PAYMENT_RESERVE_SEQUENCE');
  assert.equal(snapshot.sequence,snapshot.stateSequence,'PRIVATE_PAYMENT_RESERVE_SEQUENCE');
  const tree=new PrivateNoteTree(snapshot.leaves.slice(0,snapshot.leafCount));
  assert.equal(tree.root,snapshot.root,'PRIVATE_PAYMENT_RESERVE_ROOT');
  applyPrivateNoteCapacityTransition(snapshot,'reserve');
  const reservedCommitment=noteWordsToHash(p.slice(18,26));
  assert.equal(await pool.call('acceptedRoots(bytes32)',[snapshot.root],snapshot.blockNumber),'0x'+'0'.repeat(63)+'1','PRIVATE_PAYMENT_RESERVE_ROOT_NOT_ACCEPTED');
  assert.equal(await pool.call('insertedCommitments(bytes32)',[reservedCommitment],snapshot.blockNumber),ZERO_NOTE_HASH,'PRIVATE_PAYMENT_RESERVE_ALREADY_INSERTED');
  const index=tree.append(reservedCommitment),path=tree.path(index);
  await assertPrivateSnapshotCanonical(runtime,snapshot);
  return immutableFundingValue({snapshot,path,
    guards:{expectedRoot:snapshot.root,expectedSequence:snapshot.stateSequence,expectedPostRoot:tree.root},
    reservedCommitment,epoch:BigInt(epoch).toString(),reservePackageSHA256:assemblyPackageDigest(reserve)});
}
export function assertPrivateReservePrestate(projection,current,nextBlockTime) {
  assert.equal(current.scope,projection.snapshot.scope,'PRIVATE_PAYMENT_RESERVE_SCOPE');assert.equal(current.policy,projection.snapshot.policy,'PRIVATE_PAYMENT_RESERVE_POLICY');
  assert.equal(current.root,projection.guards.expectedRoot,'PRIVATE_PAYMENT_RESERVE_ROOT_CHANGED');
  assert.equal(current.stateSequence,projection.guards.expectedSequence,'PRIVATE_PAYMENT_RESERVE_SEQUENCE_CHANGED');
  assert.equal(current.sequence,current.stateSequence,'PRIVATE_PAYMENT_RESERVE_SEQUENCE_CHANGED');
  assert.equal(current.epoch,projection.epoch,'PRIVATE_PAYMENT_RESERVE_EPOCH_CHANGED');
  assert.equal(BigInt(nextBlockTime)/600n,BigInt(projection.epoch),'PRIVATE_PAYMENT_RESERVE_EPOCH_CHANGED');
  assert.equal(current.leafCount,projection.snapshot.leafCount,'PRIVATE_PAYMENT_RESERVE_LEAVES_CHANGED');
  assert.deepEqual(current.leaves,projection.snapshot.leaves,'PRIVATE_PAYMENT_RESERVE_LEAVES_CHANGED');
}
function assertExactAck(ack,kind,digest) {
  assert.ok(ack&&ack.retained===true,'PRIVATE_PAYMENT_PACKAGE_NOT_RETAINED');
  assert.equal(ack[kind==='authorization'?'mode':'role'],kind,'PRIVATE_PAYMENT_PACKAGE_ACK_ROLE');
  assert.equal(ack.packageSHA256,digest,'PC18_PACKAGE_ACK_MISMATCH');
}
/** One host-lifetime latch. Mathematical projection alone cannot unlock funding.
 * Exact verified-retention ACKs, authenticated original custody, completed owner
 * delivery and observed process/channel closure must all precede the one send. */
function immutableFundingValue(value) {
  const copy=structuredClone(value);const freeze=item=>{if(item&&typeof item==='object'){for(const child of Object.values(item))freeze(child);Object.freeze(item);}return item;};return freeze(copy);
}
export function createPrivateFundingPreparation() {
  let projection,authorizationSHA256,complete=false,custody=false,exit,attempted=false;
  const rolePackages=new Map();
  return Object.freeze({
    reservePrepared(value) { assert.equal(projection,undefined,'PRIVATE_PAYMENT_RESERVE_ALREADY_PREPARED');projection=immutableFundingValue(value); },
    authorizationRetained(pkg,ack,ownerAck) {
      assert.ok(projection&&!authorizationSHA256,'PRIVATE_PAYMENT_AUTHORIZATION_PREPARATION');
      validateAssemblyProofPackage(pkg,'authorization');const a=pkg.publicInputs,digest=assemblyPackageDigest(pkg);
      assert.equal(noteWordsToHash(a.slice(8,16)),projection.snapshot.scope,'PRIVATE_PAYMENT_ORIGINAL_REFUND_SCOPE');
      assert.equal(noteWordsToHash(a.slice(16,24)),projection.snapshot.policy,'PRIVATE_PAYMENT_ORIGINAL_REFUND_POLICY');
      assert.equal(noteWordsToHash(a.slice(24,32)),projection.guards.expectedPostRoot,'PRIVATE_PAYMENT_ORIGINAL_REFUND_ROOT');
      assertExactAck(ack,'authorization',digest);
      assert.deepEqual(ownerAck,{acknowledged:true,role:'assembler'},'PRIVATE_PAYMENT_OWNER_ACK');authorizationSHA256=digest;
    },
    roleRetained(role,digest,ack,ownerAck) {
      assert.ok(projection&&['sol','btc'].includes(role)&&!rolePackages.has(role),'PRIVATE_PAYMENT_ROLE_PREPARATION');
      assert.match(digest,/^[0-9a-f]{64}$/,'PRIVATE_PAYMENT_ROLE_PACKAGE_DIGEST');assertExactAck(ack,role,digest);
      assert.deepEqual(ownerAck,{acknowledged:true,role},'PRIVATE_PAYMENT_OWNER_ACK');rolePackages.set(role,digest);
    },
    custodyAuthenticated() { assert.ok(authorizationSHA256,'PRIVATE_PAYMENT_ORIGINAL_AUTHORIZATION_REQUIRED');custody=true; },
    packagesCompleted(value) {
      assert.ok(authorizationSHA256&&custody&&rolePackages.size===2&&!complete,'PRIVATE_PAYMENT_PACKAGES_INCOMPLETE');
      assert.deepEqual(value,{event:'complete-packages-ready',delivered:['assembler','btc','sol'],authorizationSHA256},'PRIVATE_PAYMENT_PACKAGES_INCOMPLETE');complete=true;
    },
    ownerExited(value) {
      assert.ok(complete&&!exit,'PRIVATE_PAYMENT_PREPARATION_INCOMPLETE');
      assert.equal(value.closed,true,'PC18_OWNER_MUST_EXIT');assert.equal(value.channelsClosed,true,'PC18_OWNER_CHANNELS_MUST_CLOSE');assert.equal(value.writesAfterExit,0,'PC18_OWNER_POST_EXIT_WRITE');
      assert.match(value.exitedAtNs,/^[0-9]+$/,'PRIVATE_PAYMENT_OWNER_EXIT_TIME');exit=Object.freeze({...value});
    },
    beforeSend(reserve) {
      assert.ok(projection&&complete&&custody&&exit&&rolePackages.size===2&&authorizationSHA256,'PRIVATE_PAYMENT_PREPARATION_INCOMPLETE');
      assert.equal(attempted,false,'PRIVATE_PAYMENT_RESERVE_ALREADY_ATTEMPTED');
      assert.equal(assemblyPackageDigest(reserve),projection.reservePackageSHA256,'PRIVATE_PAYMENT_RESERVE_PACKAGE_CHANGED');
      attempted=true;
      return Object.freeze({kind:'private-guarded-funding-preparation-complete',atNs:stamp(),reservePackageSHA256:projection.reservePackageSHA256,authorizationSHA256,
        rolePackages:Object.fromEntries(rolePackages),custodyAuthenticated:true,completePackages:true,owner:exit,guards:projection.guards,epoch:projection.epoch});
    },
  });
}

/** Host-only statement binding, after the unchanged package decoder. EVM ABI
 * words are padded hexadecimal while the original snapshot epoch is decimal;
 * compare scalar values numerically, never their transport spellings. This is
 * not a cryptographic verification substitute. */
export function assertOriginalRefundProofBinding(proof, {scope,policy,epoch,root,reserveNullifier,paymentCommitment}) {
  const p=proof?.publicInputs;
  assert.ok(Array.isArray(p)&&p.length===41,'PRIVATE_PAYMENT_REFUND_INPUTS');
  assert.equal(noteWordsToHash(p.slice(0,8)),scope,'PRIVATE_PAYMENT_REFUND_SCOPE');
  assert.equal(noteWordsToHash(p.slice(8,16)),policy,'PRIVATE_PAYMENT_REFUND_POLICY');
  assert.ok(BigInt(p[16])>=0n&&BigInt(p[16])<1n<<64n,'PRIVATE_PAYMENT_REFUND_EPOCH_RANGE');
  assert.equal(BigInt(p[16]),BigInt(epoch),'PRIVATE_PAYMENT_REFUND_EPOCH');
  assert.equal(noteWordsToHash(p.slice(17,25)),root,'PRIVATE_PAYMENT_ORIGINAL_REFUND_ROOT');
  assert.equal(noteWordsToHash(p.slice(25,33)),reserveNullifier,'PRIVATE_PAYMENT_ORIGINAL_REFUND_NULLIFIER');
  assert.equal(noteWordsToHash(p.slice(33,41)),paymentCommitment,'PRIVATE_PAYMENT_ORIGINAL_REFUND_NOTE');
}

/** Dedicated fd endpoint. Logs inventories and digests, never payload values.
 * No side-channel response is forwarded to an actor's public control stdout.
 */
export function sideEndpoint(stream, { channel, pid, inventory, label }) {
  let serial = 0, closed = false; const pending = new Map();
  const rejectAll = error => { closed = true; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); };
  const decoder = createAssemblyFrameDecoder(reply => {
    const p = pending.get(reply.id); if (!p) return rejectAll(new Error('PC18_SIDE_UNKNOWN_REPLY'));
    pending.delete(reply.id); clearTimeout(p.timer);
    inventory.push({ label, channel, operation: p.operation, inputFields: p.inputFields, outputFields: assemblyFieldInventory(reply.value), ok: reply.ok, atNs: stamp(), ...(reply.ok ? { responseSHA256: assemblyPackageDigest(reply.value) } : { code: safeCode({ code: reply.code }) }) });
    if (reply.ok !== true) return p.reject(Object.assign(new Error(reply.code), { code: reply.code }));
    if (reply.provenance?.pid !== pid || reply.provenance?.channel !== channel || reply.provenance?.operation !== p.operation) return p.reject(new Error('PC18_SIDE_REPLY_PROVENANCE'));
    p.resolve(reply.value);
  }, rejectAll);
  stream.on('data', chunk => decoder.push(chunk)); stream.on('end', () => { decoder.end(); rejectAll(new Error('PC18_SIDE_CLOSED')); }); stream.on('error', rejectAll);
  return Object.freeze({ request(operation, input = null) {
    if (closed || stream.destroyed) return Promise.reject(new Error('PC18_SIDE_CLOSED'));
    const id = `side_${++serial}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('PC18_SIDE_16_MINUTE_BOUND')); }, 960000);
      pending.set(id, { resolve, reject, timer, operation, inputFields: assemblyFieldInventory(input) });
      stream.write(encodeAssemblyFrame({ id, operation, input }), error => { if (error) { clearTimeout(timer); pending.delete(id); reject(error); } });
    });
  } });
}

/** PC17 signing custody is reused unchanged. Only this own-role broker retains
 * its invoice/opening for withdrawal, never an owner key or sibling package.
 */
export async function startRecipient(config, inventory, ownedChildren) {
  const child = spawn(process.execPath, [join(projectRoot, 'src/private-recipient-process.mjs')], { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' } });
  trackOwnedChild(child);ownedChildren.push(child); let serial = 0, readyResolve, readyReject, exitResolve, closed = false; const pending = new Map();
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }); const exited = new Promise(resolve => { exitResolve = resolve; });
  const rejectAll = error => { readyReject(error); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); };
  const decoder = createAssemblyFrameDecoder(reply => {
    if (reply.event) { if (reply.event === 'ready') readyResolve(reply); else readyReject(new Error(reply.code ?? 'PC18_RECIPIENT_STARTUP')); return; }
    const p = pending.get(reply.id); if (!p) return rejectAll(new Error('PC18_RECIPIENT_UNKNOWN_REPLY')); pending.delete(reply.id); clearTimeout(p.timer);
    inventory.push({ actor: 'recipient', role: config.expectedTerms.role, channel: p.channel, operation: p.operation, inputFields: p.inputFields, outputFields: assemblyFieldInventory(reply.value), ok: reply.ok, atNs: stamp(), ...(reply.ok ? { responseSHA256: assemblyPackageDigest(reply.value) } : { code: safeCode({ code: reply.code }) }) });
    if (reply.ok && reply.channel === p.channel) p.resolve(reply.value); else p.reject(Object.assign(new Error(reply.code ?? 'PC18_RECIPIENT_CHANNEL'), { code: reply.code }));
  }, rejectAll, 32 * 1024);
  child.stdout.on('data', chunk => decoder.push(chunk)); child.stdout.on('end', () => decoder.end()); child.stderr.resume(); child.stdin.on('error', () => {}); child.stdio[4].on('error', () => {});
  child.once('error', rejectAll); child.once('close', (code, signal) => { closed = true; rejectAll(new Error('PC18_RECIPIENT_EXIT')); exitResolve({ pid: child.pid, code, signal, exitedAtNs: stamp() }); });
  child.stdio[3].end(JSON.stringify({ mode: 'create', ...config }));
  let startupTimer;
  const start = await Promise.race([ready, new Promise((_, reject) => { startupTimer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('PC18_RECIPIENT_STARTUP_TIMEOUT')); }, 30000); })]).finally(() => clearTimeout(startupTimer));
  const worker = { pid: child.pid, review: start.review,
    provenance() { return {pid:child.pid,closed,channelsClosed:closed&&child.stdio.every(stream=>!stream||stream.destroyed)}; },
    request(operation, input = null, channel = 'owner') {
      assert.ok(!closed, 'PC18_RECIPIENT_STOPPED'); const id = `recipient_${++serial}`;
      return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error('PC18_RECIPIENT_TIMEOUT')); }, 30000); pending.set(id, { resolve, reject, timer, channel, operation, inputFields: assemblyFieldInventory(input) }); (channel === 'operator' ? child.stdio[4] : child.stdin).write(JSON.stringify({ id, operation, input }) + '\n'); });
    },
    async stop() { if (!closed) { await worker.request('shutdown'); child.stdin.end(); } return exited; },
    async terminate() { await stopOwnedChild(child);return exited; },
  };
  return worker;
}


/** The unchanged withdraw backend runs in a separate bounded child, which must
 * exit before another actor starts a proof/verification operation. */
export async function proveRecipientWithdrawal(input, label, ownedChildren) {
  const child = spawn(process.execPath, [join(projectRoot, 'experiments/private-core-proof/owner-independent/note-prove-worker.mjs')], { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' } });
  trackOwnedChild(child);ownedChildren.push(child);
  const encoded = Buffer.from(JSON.stringify({ mode: 'withdraw', input, label, operation: 'prove' }));
  assert.ok(encoded.length <= 4 * 1024 * 1024, 'PC18_WITHDRAW_WORKER_INPUT_LIMIT');
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, logBytes = 0, failure, killTimer;
    const abort = error => { failure ??= error; child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000); };
    const timer = setTimeout(() => abort(new Error('PC18_WITHDRAW_WORKER_TIMEOUT')), 930000);
    const monitoring = setInterval(() => { try { resourceGuard(); } catch(error) { abort(error); } },1000);
    for(const stream of [child.stdout,child.stderr]) stream.on('data', chunk => { logBytes += chunk.length; if(logBytes > 1024 * 1024) abort(new Error('PC18_WITHDRAW_LOG_LIMIT')); });
    child.stdio[3].on('data', chunk => { size += chunk.length; if(size > 2 * 1024 * 1024) abort(new Error('PC18_WITHDRAW_WORKER_RESULT_LIMIT')); else chunks.push(Buffer.from(chunk)); });
    child.stdio[3].on('error',abort);child.stdin.on('error',abort);child.once('error',abort);
    child.once('close',(code,signal)=>{
      clearTimeout(timer);clearTimeout(killTimer);clearInterval(monitoring);encoded.fill(0);
      try {
        if(failure) throw failure;
        const envelope = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        assert.equal(code,0,'PC18_WITHDRAW_WORKER_EXIT');assert.equal(signal,null,'PC18_WITHDRAW_WORKER_EXIT');assert.equal(envelope.ok,true,envelope.code ?? 'PC18_WITHDRAW_WORKER_FAILURE');
        const result=envelope.result;assert.equal(result.metrics?.mode,'withdraw');assert.equal(result.publicInputs?.length,PRIVATE_POOL_INPUT_WORDS.withdraw,'PC18_WITHDRAW_PUBLIC_INPUTS');
        assert.equal(typeof result.proof,'string');const proof=Buffer.from(result.proof,'base64');assert.equal(proof.toString('base64'),result.proof);assert.ok(proof.length>0&&proof.length<=256*1024);
        resolve({proof,publicInputs:result.publicInputs});
      }catch(error){reject(error);}finally{for(const b of chunks)b.fill(0);for(const stream of child.stdio)if(stream&&!stream.destroyed)stream.destroy();}
    });
    child.stdin.end(encoded,()=>encoded.fill(0));
  });
}

export async function snapshotSources(directory) {
  const files = ['src/private-payment-engine.mjs', 'src/private-payment-worker.mjs', 'src/private-payment-keeper.mjs', 'src/private-payment-coordinator.mjs', 'src/private-payout-recovery.mjs', 'src/private-owner-refund-custody.mjs', 'src/private-owner-refund-process.mjs', 'src/private-owner-refund-recovery.mjs', 'src/private-owner-refund-settlement.mjs', 'src/private-exact-note-withdrawal.mjs', 'scripts/integration-private-assembly-native.mjs', 'src/private-assembly-native-dispatch.mjs','src/private-assembly-evm-audit.mjs', 'src/private-assembly-actors.mjs', 'src/private-assembly-owner-process.mjs', 'src/private-assembly-actor-process.mjs', 'src/private-assembly-encoding.mjs', 'src/private-assembly-history.mjs', 'src/private-assembly-revocations.mjs', 'src/private-assembly-runtime.mjs', 'contracts/PrivateAssemblyNativeNotePool.sol', 'src/private-finality-authority.mjs', 'src/private-finality-runtime.mjs', 'src/private-native-certificate.mjs', 'src/private-note-encoding.mjs', 'src/private-note-tree.mjs', 'src/private-recipient-graph.mjs', 'src/private-recipient-custody.mjs', 'src/private-recipient-process.mjs', 'src/vault.mjs', 'src/privacy.mjs', 'src/chains/native-runtime.mjs', 'src/chains/solana-runtime.mjs', 'src/chains/runtime-harness.mjs', 'src/chains/linux-runtime-pins.mjs', 'src/native-bitcoin.mjs', 'experiments/private-core-proof/native-notes/prover.mjs', 'experiments/private-core-proof/owner-independent/prover.mjs', 'experiments/private-core-proof/owner-independent/prove-worker.mjs', 'experiments/private-core-proof/owner-independent/verify-worker.mjs', 'experiments/private-core-proof/owner-independent/note-prove-worker.mjs'];
  async function recurse(relative) { for (const entry of await readdir(join(projectRoot, relative), { withFileTypes: true })) { const file = join(relative, entry.name); if (entry.isDirectory()) await recurse(file); else if (/\.nr$/.test(file)) files.push(file); } }
  await recurse('experiments/private-core-proof/owner-independent/circuits');
  for (const mode of ['authorization','sol_local','btc_local','sol_join','sol_ready','btc_ready','fulfill','refund']) for (const extension of ['json']) files.push(`experiments/private-core-proof/owner-independent/.local/compiled/${mode}.${extension}`);
  for (const mode of ['authorization','sol_local','btc_local','sol_join','sol_ready','btc_ready','fulfill','refund']) for (const extension of ['vk','key.json',...(['authorization','sol_local','btc_local','sol_join'].includes(mode)?['fields.json']:['sol'])]) files.push(`experiments/private-core-proof/owner-independent/.local/prepared/${mode}.${extension}`);
  for (const mode of ['reserve','withdraw']) { files.push(`experiments/private-core-proof/native-notes/.local/compiled/${mode}.json`); for (const extension of ['vk','sol']) files.push(`experiments/private-core-proof/native-notes/.local/prepared/${mode}.${extension}`); }
  const hashes = {};
  files.push('evidence/m22-guarded-reserve-source-profile.json');
  for (const file of files) { const bytes = await readFile(join(projectRoot,file)); const path = join(directory, file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); hashes[file] = { sha256: sha(bytes), bytes: bytes.length }; }
  return hashes;
}

const CAPABILITY_FILE = 'evidence/m18-readiness-v2-2026-10-02T22-08-20-126Z.json';
const CAPABILITY_SHA256 = '6e376e351e5efbf726cb02ad5034e31157a374c68e237862ec923aeea7484672';
const FROZEN_NATIVE_FILE = 'evidence/m18-post-native-review/2026-10-03T02-06-20-857Z/terminal-report.json';
const FROZEN_NATIVE_SHA256 = '0fb709cd4ee19b3270bcc0e202702d1f274cbaf047f32b105bfe54a6d42ec081';
const GUARDED_FUNDING_SOURCE_FILE = 'evidence/m22-guarded-reserve-source-profile.json';
const GUARDED_FUNDING_SOURCE_SHA256 = 'f3572a86386c9fcd71dc04df311dd65b71ec1443fe1b6a96a857adb0b745856e';
/** Explicit immutable reviewed delta over the ORIGINAL native evidence. These
 * two exact source replacements do not claim a new genuine native run and do
 * not remove any old circuit/VK/encoding/policy/other verification source pin. */
export async function loadPrivateGuardedFundingSourcePins(frozen) {
  const bytes=await readFile(join(projectRoot,GUARDED_FUNDING_SOURCE_FILE));
  assert.equal(bytes.length,2452,'PC22_SOURCE_PROFILE_SIZE');assert.equal(sha(bytes),GUARDED_FUNDING_SOURCE_SHA256,'PC22_SOURCE_PROFILE_PIN');
  const profile=JSON.parse(bytes);
  assert.equal(profile.schemaVersion,1,'PC22_SOURCE_PROFILE_VERSION');assert.equal(profile.profile,'PC22_PREAUTHORIZED_GUARDED_FUNDING_V1','PC22_SOURCE_PROFILE');
  assert.equal(profile.classification,'REVIEWED_EXACT_SOURCE_DELTA_WITH_SYNTHETIC_EVM_CONTROLS_NOT_GENUINE_NATIVE_RESULT','PC22_SOURCE_PROFILE_CLASSIFICATION');
  assert.equal(profile.genuineGuardedFundingRunCompleted,false,'PC22_SOURCE_PROFILE_NATIVE_CLAIM');
  assert.deepEqual(profile.baselineNativeReport,{file:FROZEN_NATIVE_FILE,sha256:FROZEN_NATIVE_SHA256},'PC22_SOURCE_PROFILE_BASELINE');
  assert.deepEqual(Object.keys(profile.allowedSourceDeltas).sort(),['contracts/PrivateAssemblyNativeNotePool.sol','src/private-assembly-runtime.mjs'],'PC22_SOURCE_PROFILE_PATHS');
  const overrides={};
  for(const [file,delta]of Object.entries(profile.allowedSourceDeltas)) {
    assert.deepEqual(Object.keys(delta).sort(),['current','previous'],'PC22_SOURCE_PROFILE_DELTA');
    assert.deepEqual(delta.previous,frozen.sources[file],'PC22_SOURCE_PROFILE_PREVIOUS_PIN');
    for(const pin of [delta.previous,delta.current]) {
      assert.deepEqual(Object.keys(pin).sort(),['bytes','sha256'],'PC22_SOURCE_PROFILE_PIN_FIELDS');
      assert.match(pin.sha256,/^[0-9a-f]{64}$/,'PC22_SOURCE_PROFILE_HASH');assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0,'PC22_SOURCE_PROFILE_BYTES');
    }
    overrides[file]=Object.freeze({...delta.current});
  }
  return Object.freeze(overrides);
}


/** Fixed-size streaming integrity check, with no retained whole-file Buffer.
 * The same owned read handle supplies stat and content; the exact byte count,
 * metadata stability and expected SHA-256 must all agree before acceptance.
 * Trusted in-process helper only: paths and pins are never worker IPC fields.
 */
export async function verifyPrivatePaymentFileIntegrity(file, expected, code = 'PC18_FILE_INTEGRITY') {
  assert.ok(Number.isSafeInteger(expected?.bytes) && expected.bytes >= 0, code);
  assert.match(expected.sha256, /^[0-9a-f]{64}$/, code);
  const handle = await open(file, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    assert.ok(before.isFile() && before.size === BigInt(expected.bytes), code);
    const hash = createHash('sha256'); let bytes = 0, maximumChunkBytes = 0;
    for await (const chunk of handle.createReadStream({ highWaterMark: 64 * 1024, autoClose: false })) {
      bytes += chunk.length; maximumChunkBytes = Math.max(maximumChunkBytes, chunk.length);
      assert.ok(bytes <= expected.bytes, code); hash.update(chunk);
    }
    const after = await handle.stat({ bigint: true });
    assert.equal(after.size, before.size, code); assert.equal(after.mtimeNs, before.mtimeNs, code);
    assert.equal(bytes, expected.bytes, code); const digest = hash.digest('hex'); assert.equal(digest, expected.sha256, code);
    return { bytes, sha256: digest, maximumChunkBytes };
  } finally { await handle.close(); }
}

export async function readFixedCapability() {
  const capabilityBytes = await readFile(join(projectRoot,CAPABILITY_FILE));
  assert.equal(sha(capabilityBytes),CAPABILITY_SHA256,'PC18_CAPABILITY_REPORT_PIN');
  const capability = JSON.parse(capabilityBytes);
  assert.equal(capability.phase,'completed','PC18_GENUINE_CAPABILITY_NOT_COMPLETED');
  assert.equal(capability.classification,'GENUINE_REVOCATION_AWARE_V2_READINESS_CAPABILITY_NOT_NATIVE_OWNER_OFFLINE');
  assert.equal(capability.profile,'PC18_READINESS_V2_REVOCATION_COVERAGE');
  const oldRun=capability.reusedProofs?.[0]?.from; assert.match(oldRun,/^[0-9TZ-]+$/);
  const legacyBytes=await readFile(join(projectRoot,'evidence','m18-capability-'+oldRun+'.json')),legacy=JSON.parse(legacyBytes);
  assert.equal(sha(legacyBytes),capability.previousCapabilitySHA256,'PC18_FROZEN_CAPABILITY_HASH');
  assert.equal(legacy.phase,'completed');
  assert.equal(legacy.classification,'GENUINE_RECURSIVE_SYNTHETIC_CAPABILITY_NOT_FUNDED_OR_NATIVE_OWNER_OFFLINE');
  const proofs=['authorization','sol_local','btc_local','sol_join','fulfill','refund'].map(mode=>{const p=legacy.proofs.find(p=>p.mode===mode&&p.verified===true);assert.ok(p,'PC18_UNCHANGED_CAPABILITY_MODE_MISSING');return p;});
  for(const [mode,count,pages]of [['sol_ready',61,32768],['btc_ready',79,65536]]) {
    const p=capability.proofs.find(p=>p.mode===mode&&p.verified===true); assert.ok(p,'PC18_V2_READINESS_MISSING');
    assert.equal(p.publicInputCount,count); assert.equal(p.maximumPages,pages);
    assert.ok(p.workerWallMilliseconds<600000); assert.ok(p.minimumObservedAvailableRAM>=3*1024**3); proofs.push(p);
  }
  assert.ok(capability.pool?.verifiers&&capability.runtimeCleanup?.completed&&legacy.runtimeCleanup?.completed,'PC18_CAPABILITY_DEPLOYMENT_AND_CLEANUP_REQUIRED');
  assert.ok(capability.evmChecks.some(c=>c.mode==='btc_ready'&&c.oldV1RejectedByNewV2));
  for(const [report,folder]of [[capability,join(projectRoot,'evidence','m18-readiness-v2',capability.runId)],[legacy,join(projectRoot,'evidence','m18-capability',oldRun)]]) {
    for(const [name,expected]of Object.entries(report.artifacts)) {
      assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),'PC18_ARTIFACT_PATH');
      const bytes=await readFile(join(folder,name)); assert.equal(bytes.length,expected.bytes); assert.equal(sha(bytes),expected.sha256,'PC18_CAPABILITY_ARTIFACT_HASH');
    }
  }
  for(const proof of proofs) {
    const base=join(projectRoot,'experiments/private-core-proof/owner-independent'), key=JSON.parse(await readFile(join(base,'.local/prepared',proof.mode+'.key.json'),'utf8'));
    assert.equal(key.keySHA256,proof.verificationKeySHA256,'PC18_CAPABILITY_KEY_CHANGED');
    assert.equal(key.circuitSHA256,proof.circuitSHA256,'PC18_CAPABILITY_CIRCUIT_CHANGED');
    assert.equal(sha(await readFile(join(base,'circuits',proof.mode,'src/main.nr'))),proof.sourceSHA256,'PC18_CAPABILITY_SOURCE_CHANGED');
    assert.equal(sha(await readFile(join(base,'.local/prepared',proof.mode+'.vk'))),key.keySHA256,'PC18_COMPLETE_KEY_PIN');
    const compiled=JSON.parse(await readFile(join(base,'.local/compiled',proof.mode+'.json'),'utf8'));
    assert.equal(sha(Buffer.from(compiled.bytecode,'base64')),key.circuitSHA256,'PC18_PROGRAM_KEY_PIN');
  }
  const frozenBytes=await readFile(join(projectRoot,FROZEN_NATIVE_FILE));assert.equal(sha(frozenBytes),FROZEN_NATIVE_SHA256,'PC18_NATIVE_CONTROL_PIN');
  const frozen=JSON.parse(frozenBytes);assert.equal(frozen.phase,'completed','PC18_NATIVE_CONTROL_INCOMPLETE');
  const guardedSourcePins=await loadPrivateGuardedFundingSourcePins(frozen);
  // The exact proven circuits, keys, encoding, policy and verification sources
  // remain pinned. Orchestration may be extracted without pretending its new
  // bytes were the old native execution's source snapshot.
  for(const [file,pin]of Object.entries(frozen.sources)) {
    if (!(/\/circuits\/|\/\.local\/(?:compiled|prepared)\//.test(file) || /(?:private-assembly-(?:encoding|history|revocations|runtime|native-dispatch)|private-finality-(?:authority|runtime)|private-native-certificate|private-note-(?:encoding|tree)|private-recipient-(?:graph|custody))\.mjs$/.test(file) || file === 'contracts/PrivateAssemblyNativeNotePool.sol')) continue;
    const expected=guardedSourcePins[file]??pin;
    const bytes=await readFile(join(projectRoot,file));assert.equal(bytes.length,expected.bytes,'PC18_FIXED_SOURCE_SIZE');assert.equal(sha(bytes),expected.sha256,'PC18_FIXED_CRYPTOGRAPHIC_SOURCE_PIN');
  }
  const crs=join(projectRoot,'experiments/private-core-proof/native-notes/.local/crs/2097152');
  const provenance=JSON.parse(await readFile(join(crs,'provenance.json'),'utf8'));
  for(const record of provenance.records) {
    assert.ok(/^[A-Za-z0-9_.-]+$/.test(record.file),'PC18_CRS_FILE');
    await verifyPrivatePaymentFileIntegrity(join(crs,record.file),record,'PC18_CRS_PIN');
  }
  return { proofs };
}

/** Read-only preparation checks: fixed local files and pinned binaries only.
 * No node, proof, compilation, deployment, side effect or caller configuration.
 */
export async function checkPrivatePaymentPrerequisites() {
  try {
    assert.equal(process.platform,'linux','PRIVATE_PAYMENT_LINUX_ONLY');assert.equal(process.arch,'x64','PRIVATE_PAYMENT_X64_ONLY');
    resourceGuard(); await readFixedCapability();
    const { linuxRuntimePins } = await import('../chains/shared/linux-runtime-pins.mjs');
    const { pinnedBinary } = await import('../chains/shared/runtime-harness.mjs');
    const { solanaLoopbackCompatibilityPin } = await import('../chains/solana/solana-runtime.mjs');
    for(const pin of [...Object.values(linuxRuntimePins),solanaLoopbackCompatibilityPin]) await pinnedBinary(...pin);
    return { ready:true };
  } catch (error) { const code=safeCode(error);throw Object.assign(new Error(/^(PRIVATE_|PC18_)/.test(code)?code:'PRIVATE_PAYMENT_PREREQUISITES_UNAVAILABLE'),{code:/^(PRIVATE_|PC18_)/.test(code)?code:'PRIVATE_PAYMENT_PREREQUISITES_UNAVAILABLE'}); }
}

export async function durablePrivateFile(file, value) {
  const handle=await open(file,'wx',0o600);
  try { await handle.writeFile(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v)+'\n');await handle.sync(); }
  finally { await handle.close(); }
  const directory=await open(dirname(file),'r');try{await directory.sync();}finally{await directory.close();}
}
export async function stopAssemblyActor(control) {
  let timer;
  try { return await Promise.race([control.stop(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('PC18_ACTOR_SHUTDOWN_TIMEOUT')),5000);})]); }
  catch { return control.terminate(); }
  finally { clearTimeout(timer); }
}
/** Retire only the now-unused role proof producer, after the assembler has
 * genuinely verified and ACK-retained its local proof. Surviving native broker,
 * issuer/finality authority and recipient custody are intentionally untouched.
 * Callback injection is a host-test seam, never a production request field.
 */
export async function retainLocalProofAndRetireProducer({ role, producer, assembler, transferPackage, recordResources }) {
  assert.ok(role === 'sol' || role === 'btc', 'PC18_PRODUCER_RETIRE_ROLE');
  const acknowledgement = await transferPackage(producer.side.assembler, 'localProof', assembler.side[role], 'retainLocal');
  assert.equal(acknowledgement.retained, true, 'PC18_LOCAL_ACK_REQUIRED');
  assert.equal(acknowledgement.mode, role + '_local', 'PC18_LOCAL_ACK_ROLE');
  assert.match(acknowledgement.packageSHA256, /^[0-9a-f]{64}$/, 'PC18_LOCAL_ACK_DIGEST');
  await recordResources(role.toUpperCase() + '_PRODUCER_BEFORE_RETIREMENT', producer.control);
  const exit = await stopAssemblyActor(producer.control);
  assert.equal(exit.code, 0, 'PC18_PRODUCER_CLEAN_EXIT');
  const provenance = producer.control.provenance();
  assert.equal(provenance.closed, true, 'PC18_PRODUCER_MUST_EXIT');
  assert.equal(provenance.channelsClosed, true, 'PC18_PRODUCER_CHANNELS_MUST_CLOSE');
  assert.equal(provenance.writesAfterExit, 0, 'PC18_PRODUCER_POST_EXIT_WRITE');
  await recordResources(role.toUpperCase() + '_PRODUCER_AFTER_RETIREMENT', producer.control);
  return acknowledgement;
}

const ownedChildLifetimes = new WeakMap();
function trackOwnedChild(child) {
  let lifetime=ownedChildLifetimes.get(child);if(lifetime)return lifetime;
  let resolve;const closed=new Promise(done=>{resolve=done;});
  lifetime={closed:false,closedPromise:closed,stopping:null};ownedChildLifetimes.set(child,lifetime);
  child.once('close',(code,signal)=>{lifetime.closed=true;resolve({pid:child.pid,code,signal});});
  return lifetime;
}
/** Await actual close, including pipes, and share the same owned termination
 * across abort and cleanup. SIGTERM initiation alone never proves disposal. */
export function stopOwnedChild(child, {forceAfterMs=5000}={}) {
  assert.ok(Number.isSafeInteger(forceAfterMs)&&forceAfterMs>0&&forceAfterMs<=5000,'PRIVATE_PAYMENT_CHILD_STOP_BOUND');
  const lifetime=trackOwnedChild(child);
  if(lifetime.closed)return lifetime.closedPromise;
  if(lifetime.stopping)return lifetime.stopping;
  lifetime.stopping=(async()=>{
    if(child.pid&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
    const timer=setTimeout(()=>{if(!lifetime.closed&&child.pid&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},forceAfterMs);
    try { return await lifetime.closedPromise; } finally { clearTimeout(timer); }
  })();
  return lifetime.stopping;
}

async function createOwnedPaymentHost(context, capability) {
  assert.equal(capability,NATIVE_FAKE_FUNDS_ONLY,'PRIVATE_PAYMENT_LOCAL_CAPABILITY');
  let runtime,solana,pool,issuer,clock,pins,policy,owner,assembler,startEpoch,claimEpoch,authorizedRoot,reserve,reservedCommitment,projection;
  const fundingPreparation=createPrivateFundingPreparation();
  let reserveAttempted=false,reserveConfirmed=false,reserveReverted=false;
  let refundCustody,refundBinding,refundSettlement,refundWithdrawal,refundSigner,refundAttempted=false;
  let clockAnchor,clockAnchorAt,refundDeadlineAt,refundEligibleAt;
  const refundSigners=[];
  let activeHeavy=false,aborted,monitor,auditCount=0,evmReceiptCount=0,sourceHashes;
  const actors=[],recipients=[],children=[],vaults=[],roles={};
  const local=join(projectRoot,'.local','private-payments',context.operationId),auditDir=join(local,'native-audit');
  let directoryOwned=false;
  const guard=()=>{context.guard();if(aborted)throw aborted;resourceGuard();};
  const abort=()=>{aborted??=new Error('PRIVATE_PAYMENT_ABORTED');for(const a of actors)void a.control.terminate().catch(()=>{});for(const c of children)void stopOwnedChild(c).catch(()=>{});for(const signer of refundSigners)void signer.stop().catch(()=>{});};
  const audit=async(label,item)=>{assert.ok(directoryOwned,'PRIVATE_PAYMENT_AUDIT_DIRECTORY');const file=join(auditDir,String(++auditCount).padStart(5,'0')+'-'+label+'.json');await durablePrivateFile(file,item);return file;};
  const recordResources=async(stage,producer)=>{
    const sample=resourceSnapshot();
    if(producer) {
      sample.producerRSS=0;
      if(!producer.provenance().closed) { const status=readFileSync(`/proc/${producer.pid}/status`,'utf8'),match=/VmRSS:\s+(\d+)/.exec(status);assert.ok(match,'PC18_PRODUCER_RESOURCE_SAMPLE');sample.producerRSS=Number(match[1])*1024; }
    }
    // Only bounded numerical memory/disk samples and fixed stage names. No PID,
    // proof statement, native identifier or receipt enters this record.
    await audit('resources',{kind:'private-numeric-resource-sample',stage,...sample});
  };
  const archiveReceipts=async()=>{if(!pool)return;for(const entry of pool.receipts.slice(evmReceiptCount)){await audit('evm',await captureAssemblyEvmReceipt(runtime,entry));evmReceiptCount++;}};
  async function heavy(label, work) {
    guard();assert.equal(activeHeavy,false,'PC18_ONE_HEAVY_ENGINE_ONLY');activeHeavy=true;const started=stamp();
    try { const result=await work();guard();await audit('proof-operation',{kind:'private-proof-operation',label,started,completed:stamp()});return result; }
    finally { activeHeavy=false; }
  }
  function actor(kind,bootstrap) {
    guard();const p=launchAssemblyProcess(kind,bootstrap);actors.push(p);
    return {...p,side:Object.fromEntries(Object.entries(p.channels).map(([channel,stream])=>[channel,sideEndpoint(stream,{channel,pid:p.control.pid,inventory:[],label:kind})]))};
  }
  async function transferPackage(from,operation,to,admit,ownerAck,role) {
    guard();let pkg=await from.request(operation);const ack=await heavy('retain-'+(pkg.mode??pkg.role),()=>to.request(admit,pkg));
    const digest=assemblyPackageDigest(pkg);assert.equal(ack.packageSHA256,digest,'PC18_PACKAGE_ACK_MISMATCH');
    const acknowledged=ownerAck?await ownerAck.request('acknowledgePackage',{packageSHA256:ack.packageSHA256}):undefined;
    if(role)fundingPreparation.roleRetained(role,digest,ack,acknowledged);pkg=undefined;return ack;
  }
  async function submit(label,mode,proof,{value=0n,from=runtime.accounts[2]}={}) {
    // Reserve has its own one-shot guarded path and may never use legacy calldata.
    assert.notEqual(mode,'reserve','PRIVATE_PAYMENT_GUARDED_RESERVE_REQUIRED');
    guard();clock=Math.max(clock,await runtime.time())+1;await runtime.evm('evm_setNextBlockTimestamp',[clock]);
    const purpose=mode==='fulfill'?'claim':mode==='refund'?'refund':'withdraw';
    await context.beforeEvm(purpose);guard();let receipt;
    try {
      receipt=await pool.send(label,{from,to:pool.address,data:pool.proofData(mode,proof.proof,proof.publicInputs),value:'0x'+BigInt(value).toString(16)});
      context.evmConfirmed(purpose); // Preserve confirmed funds/notes if archiving or ACK subsequently fails.
    } finally { await archiveReceipts(); }
    return receipt;
  }
  async function submitAuthority(label,from,method,args) {
    guard();clock++;await runtime.evm('evm_setNextBlockTimestamp',[clock]);await context.beforeEvm('authority');guard();let receipt;
    try { receipt=await pool.send(label,{from,to:pool.address,data:pool.data(method,args)});context.evmConfirmed('authority'); }
    finally { await archiveReceipts(); }
    return receipt;
  }
  // The local chain is otherwise idle. Advance only by elapsed monotonic real
  // time during recovery; the explicit integration seam below is separate.
  async function progressRefundClock() {
    guard();const current=await runtime.time(),realElapsed=Math.floor((performance.now()-clockAnchorAt)/1000);
    const justified=clockAnchor+realElapsed;
    if(justified>current) { await runtime.evm('evm_setNextBlockTimestamp',[justified]);await runtime.evm('evm_mine'); }
    clock=Math.max(clock,await runtime.time());
  }
  async function startRefundSigner() {
    guard();if(refundSigner)await refundSigner.stop();
    refundSigner=launchOwnerRefundProcess({path:refundCustody.path,password:refundCustody.password,expectedBinding:refundBinding});refundSigners.push(refundSigner);
    await refundSigner.ready;
    await audit('owner-refund-signer',{kind:'private-owner-refund-signer-started',pid:refundSigner.pid,pool:pool.address,scope:pool.scope,originalOwner:owner.control.provenance()});
    return refundSigner;
  }
  async function ensureRefundWithdrawal() {
    if(refundWithdrawal)return;
    await host.assertOwnerExited();const signer=await startRefundSigner(),opening=await signer.request('opening');
    await signer.stop();
    refundWithdrawal=createOwnerRefundWithdrawalRecovery({pool,runtime,binding:refundBinding,opening,
      authorize:request=>{guard();return refundSigner.request('authorizeWithdrawal',request);},
      prove:input=>heavy('owner-refund-withdrawal-proof',()=>proveRecipientWithdrawal(input,'wallet-owner-refund-withdraw',children)),
      submit:async proof=>{
        const before=await runtime.balance('0x'+refundBinding.withdrawalRecipient);
        await submit('exact owner refund withdrawal','withdraw',proof);
        assert.equal(await runtime.balance('0x'+refundBinding.withdrawalRecipient)-before,BigInt(PRIVATE_PAYMENT_AMOUNTS.reserveWei),'PRIVATE_PAYMENT_EXACT_OWNER_REFUND_BALANCE');
      },
      persist:result=>audit('owner-refund-withdrawal',{kind:'private-owner-refund-withdrawal-state',...result}),
      onConfirmed:result=>context.ownerRefundConfirmed(result.amount),
    });
  }
  const policyFor=bridge=>{const p=bridge.policy;return{policyId:p.policyId,identityNamespace:p.identityNamespace,genesis:p.chainDomain.genesis,x:p.issuerPublicKey.x,y:p.issuerPublicKey.y};};
  const host={
    async prepare() {
      await checkPrivatePaymentPrerequisites();guard();
      await mkdir(dirname(local),{recursive:true,mode:0o700});await mkdir(local,{mode:0o700});directoryOwned=true;
      await mkdir(auditDir,{mode:0o700});sourceHashes=await snapshotSources(join(local,'source-at-start'));guard();
      context.signal?.addEventListener('abort',abort,{once:true});
      monitor=setInterval(()=>{try{guard();}catch(error){aborted??=error;abort();}},1000);
      const {assemblyVerificationPins}=await import('../../../../experiments/engine/private-core-proof/owner-independent/prover.mjs');pins=assemblyVerificationPins();guard();
      await context.publish({progressCode:'STARTING_OWNED_RUNTIMES'});
      runtime=await createOwnedNativeRuntime(async()=>{guard();});guard();
      solana=await createOwnedSolanaRuntime(()=>{guard();},{ledgerRetentionShreds:1_000_000,ticksPerSlot:64});guard();
      await audit('runtime-bootstrap',{kind:'private-runtime-metadata',evmBitcoin:runtime.metadata,solana:solana.metadata});
      clock=(Math.floor((await runtime.time())/600)+1)*600+10;await runtime.evm('evm_setNextBlockTimestamp',[clock]);await runtime.evm('evm_mine');
      issuer=createDisposableNativeIssuerLifetime({lifetimeId:randomBytes(32).toString('hex'),identityNamespace:randomBytes(32).toString('hex'),mode:'DISPOSABLE_LOCAL_ONLY_NO_RESTART'});
      const solAdapter={genesis:solana.genesis,solver:solana.solver,recipient:solana.recipient,
        transfer:async(...args)=>{guard();return solana.transfer(...args);},
        observe:async(...args)=>{guard();try{return await solana.observe(...args);}catch(error){if(error.observationDiagnostic)await audit('sol-timeout',{kind:'private-solana-timeout',diagnostic:error.observationDiagnostic});throw error;}},
        balance:(...args)=>{guard();return solana.balance(...args);}};
      const btcAdapter={btc:(...args)=>{guard();return runtime.btc(...args);}};
      const bind=(role,callbacks)=>issuer.bind({chain:role.toUpperCase(),genesis:role==='sol'?base58Decode(solana.genesis,32).toString('hex'):runtime.metadata.bitcoinGenesis,minimumConfirmations:role==='sol'?1:6,runtime:role==='sol'?solAdapter:btcAdapter,policyFamilyId:sha(Buffer.from('PC15/notes/immutable-observation-only/1')),epochSeconds:600,nowSeconds:()=>clock,...callbacks});
      const noCall=async()=>{throw Error('PC18_POLICY_BOOTSTRAP_NO_DISPATCH');};
      policy={...Object.fromEntries(['sol','btc'].map(role=>[role,policyFor(bind(role,{authorizeLocalInvocation:noCall,retainSignedDispatch:noCall,archiveCertificate:noCall}))])),minimumBtcConfirmations:6};
      const sources={};for(const mode of ['reserve','withdraw'])sources[mode]=await readFile(join(projectRoot,'experiments/private-core-proof/native-notes/.local/prepared',mode+'.sol'),'utf8');for(const mode of ['sol_ready','btc_ready','fulfill','refund'])sources[mode]=await readFile(join(projectRoot,'experiments/private-core-proof/owner-independent/.local/prepared',mode+'.sol'),'utf8');
      await context.publish({progressCode:'DEPLOYING_PRIVATE_POOL'});
      // Deployment writes are disposable bootstrap, not funding. The callback
      // is awaited after each confirmed deployment and before the next one.
      const guardedRuntime={...runtime,evm:async(method,params)=>{guard();if(method==='eth_sendTransaction'){await context.beforeEvm('deployment');guard();}return runtime.evm(method,params);}};
      pool=await deployPrivateAssemblyNativePool(guardedRuntime,{sources,policy:pref(policyCommitment(policy)),deploymentDomain:pref(randomBytes(32)),solAuthority:runtime.accounts[2],btcAuthority:runtime.accounts[1],onDeployment:async d=>{context.evmConfirmed('deployment');await audit('deployment',d);await context.publish({progressCode:'DEPLOYING_PRIVATE_POOL'});guard();}});
      await archiveReceipts();clock=await runtime.time();startEpoch=BigInt(Math.floor(clock/600));claimEpoch=startEpoch+12n;
      clockAnchor=clock;clockAnchorAt=performance.now();
      const untilCutoff=Number(claimEpoch*600n-BigInt(clock))*1000;
      refundDeadlineAt=clockAnchorAt+untilCutoff+PRIVATE_REFUND_RECOVERY_MARGIN_MS;refundEligibleAt=new Date(Date.now()+untilCutoff).toISOString();
      assert.ok(untilCutoff+PRIVATE_REFUND_RECOVERY_MARGIN_MS<=PRIVATE_REFUND_LIFETIME_MAX_MS,'PRIVATE_PAYMENT_REFUND_RETENTION_BOUND');
      refundCustody={path:join(local,'owner-refund.vault'),password:'synthetic-'+randomBytes(32).toString('hex'),withdrawalRecipient:runtime.accounts[0].slice(2)};vaults.push(refundCustody.path);
      const tokens={sol:randomBytes(32).toString('hex'),btc:randomBytes(32).toString('hex')};
      const btcAddress=await runtime.btc('getnewaddress',['','bech32'],'m9-recipient'),btcInfo=await runtime.btc('getaddressinfo',[btcAddress],'m9-recipient');
      owner=actor('owner',{plan:{scope:pool.scope.slice(2),policy,epoch:startEpoch.toString(),sourceSol:base58Decode(solana.solver,32).toString('hex'),recipientSol:base58Decode(solana.recipient,32).toString('hex'),recipientBtc:sha(Buffer.from(btcInfo.scriptPubKey,'hex')),claimEpoch:claimEpoch.toString(),amountSol:PRIVATE_PAYMENT_AMOUNTS.solLamports,numerator:'1',denominator:'30',budget:PRIVATE_PAYMENT_AMOUNTS.reserveWei,solCompensation:PRIVATE_PAYMENT_AMOUNTS.payoutWei},bridgeTokens:tokens,ownerRefundCustody:refundCustody});await owner.control.ready;
      assembler=actor('assembler',{kind:'assembler',scope:pool.scope.slice(2),policy:pool.policy.slice(2),pins});await assembler.control.ready;
      for(const role of ['sol','btc']) {
        guard();const terms=await owner.side[role].request('terms');assert.equal(terms.value,PRIVATE_PAYMENT_AMOUNTS.payoutWei);assert.equal(terms.descriptor.amount,role==='sol'?PRIVATE_PAYMENT_AMOUNTS.solLamports:PRIVATE_PAYMENT_AMOUNTS.btcSats);
        const vaultPath=join(local,role+'.vault');vaults.push(vaultPath);const withdrawalRecipient=runtime.accounts[role==='sol'?3:4].slice(2);
        const custody={path:vaultPath,password:'synthetic-'+randomBytes(32).toString('hex'),expectedTerms:terms,withdrawalRecipient};
        let recipient=await startRecipient(custody,[],children);recipients.push(recipient);
        const {termsDigest,value,paymentCommitment,localCommitment}=recipient.review;
        await recipient.request('acknowledgeCompensation',{termsDigest,value,paymentCommitment,localCommitment},'operator');
        const invoice=await recipient.request('invoice',terms);importRecipientInvoice(terms,invoice);await owner.side[role].request('acceptInvoice',invoice);
        const producer=actor('producer',{kind:'producer',role,policy,bridgeToken:tokens[role]});await producer.control.ready;
        const service=createAssemblyNativeDispatch({role,bridgeToken:tokens[role],nativeDestination:role==='sol'?solana.recipient:btcAddress,nowSeconds:()=>clock,recipientAck:input=>recipient.request('assertNativeExposureAcknowledged',input),
          archivePrivate:async item=>{
            await audit(role,item); // fsync complete before durable public exposure/ACK.
            if(item.kind==='signed-native-dispatch') { await context.signedRetained(role);guard(); }
          },createBridge:callbacks=>bind(role,callbacks)});
        assert.deepEqual(policyFor(service),policy[role]);service.attachPool(pool,runtime);
        service.attachAuthority(bridge=>createCurrentFinalityAuthority({chain:role.toUpperCase(),bridge,pool,account:runtime.accounts[role==='sol'?2:1],chainId:runtime.metadata.chainId,nowSeconds:()=>clock,submitAuthority,archive:entry=>audit('authority-'+role,entry)}));
        const payoutRecovery=createRecipientPayoutRecovery({pool,runtime,terms,invoice,recipient:withdrawalRecipient,
          authorize:request=>{guard();return recipient.request('authorizeWithdrawal',request);},
          prove:input=>heavy(role+'-withdrawal-proof',()=>proveRecipientWithdrawal(input,'wallet-'+role+'-withdraw',children)),
          submit:async proof=>{
            guard();const account='0x'+withdrawalRecipient,before=await runtime.balance(account);
            await submit(role+' exact recipient withdrawal','withdraw',proof);
            const delta=await runtime.balance(account)-before;assert.equal(delta,BigInt(PRIVATE_PAYMENT_AMOUNTS.payoutWei),'PRIVATE_PAYMENT_EXACT_RECIPIENT_BALANCE');
          },
          persist:result=>audit('payout-'+role,{kind:'private-recipient-payout-state',...result}),
          onConfirmed:result=>context.withdrawalConfirmed?.(role,result.amount),
        });
        roles[role]={
          async retain(){await transferPackage(owner.side[role],'ownPackage',producer.side.owner,'retainPackage',owner.side[role],role);let binding=await producer.side.broker.request('bridgeBinding');service.retainBinding(binding);binding=undefined;},
          async execute(readiness){await host.assertOwnerExited();await context.beforeNative(role);guard();await service.dispatch({bridgeToken:tokens[role],readiness});guard();if(role==='btc')await runtime.btc('generatetoaddress',[6,runtime.miningAddress]);let certificate=await service.certify(tokens[role]);await context.observed(role);await heavy(role+'-local-proof',()=>producer.side.broker.request('proveLocal',{certificate}));certificate=undefined;await retainLocalProofAndRetireProducer({role,producer,assembler,transferPackage,recordResources});},
          async permit(pkg){guard();return service.permit(tokens[role],pkg);},
          async withdraw(){
            guard();const result=await payoutRecovery.recover();
            assert.equal(result.state,'WITHDRAWN','PRIVATE_PAYMENT_PAYOUT_NOT_VERIFIED');
            return {role,amount:result.amount};
          },
          async recoverWithdraw(){
            guard();await recipient.stop();
            recipient=await startRecipient({mode:'recover',...custody},[],children);recipients.push(recipient);
            assert.deepEqual(recipient.review,{role,acknowledged:true,termsDigest,value,paymentCommitment,localCommitment},'PRIVATE_PAYMENT_RECIPIENT_RECOVERY_BINDING');
            return roles[role].withdraw();
          },
          reconcile:()=>payoutRecovery.reconcile(),
          audit:()=>service.audit(),
        };
      }
    },
    async prepareReserve(){
      guard();assert.equal(reserve,undefined,'PRIVATE_PAYMENT_RESERVE_ALREADY_PREPARED');
      reserve=validateAssemblyProofPackage(await heavy('owner-reserve',()=>owner.control.request('proveReserve',{epoch:startEpoch.toString()})),'reserve');
      projection=await preparePrivateReserveProjection({pool,runtime,reserve,epoch:startEpoch.toString()});
      reservedCommitment=projection.reservedCommitment;authorizedRoot=projection.guards.expectedPostRoot;fundingPreparation.reservePrepared(projection);
      await audit('reserve-projection',{kind:'private-unfunded-reserve-projection',atNs:stamp(),guards:projection.guards,epoch:projection.epoch,reservedCommitment,reservePackageSHA256:projection.reservePackageSHA256,blockNumber:projection.snapshot.blockNumber,blockHash:projection.snapshot.blockHash});
      await audit('owner-refund-custody',{kind:'private-owner-refund-custody-persisted-before-funding',encrypted:true,reservedCommitment});
    },
    async authorize(){
      guard();assert.ok(projection&&reserve,'PRIVATE_PAYMENT_RESERVE_PREPARATION_REQUIRED');
      await heavy('owner-authorization',()=>owner.control.request('proveAuthorization',{path:projection.path}));
      let originalAuthorization=validateAssemblyProofPackage(await owner.side.assembler.request('authorization'),'authorization');
      const a=originalAuthorization.publicInputs;
      refundBinding={scope:pool.scope.slice(2),policy:pool.policy.slice(2),budget:PRIVATE_PAYMENT_AMOUNTS.reserveWei,withdrawalRecipient:refundCustody.withdrawalRecipient,cutoff:claimEpoch.toString(),reservedCommitment:reservedCommitment.slice(2),reserveNullifier:noteWordsToHash(a.slice(32,40)).slice(2),paymentCommitment:noteWordsToHash(a.slice(72,80)).slice(2)};
      assert.equal(a[80],refundBinding.cutoff,'PRIVATE_PAYMENT_ORIGINAL_REFUND_CUTOFF');assert.equal(noteWordsToHash(a.slice(24,32)),authorizedRoot,'PRIVATE_PAYMENT_ORIGINAL_REFUND_ROOT');
      const ack=await heavy('retain-authorization',()=>assembler.side.owner.request('retainAuthorization',originalAuthorization));
      const ownerAck=await owner.side.assembler.request('acknowledgePackage',{packageSHA256:ack.packageSHA256});
      fundingPreparation.authorizationRetained(originalAuthorization,ack,ownerAck);
      // Installed before ANY funding attempt; this retains the exact original A
      // and still requires its root to be accepted by the real canonical pool.
      refundSettlement=createOwnerRefundSettlementReconciler({pool,runtime,authorizationInputs:a,reservedCommitment});originalAuthorization=undefined;
      for(const role of ['sol','btc'])await roles[role].retain();
      // Authenticate the actual encrypted original backup against verified A.
      // This temporary recovery-only signer cannot create or substitute a key.
      const signer=await startRefundSigner();
      try { validateOwnerRefundOpening(await signer.request('opening'),refundBinding); }
      finally { const exit=await signer.stop();assert.equal(exit.code,0,'PRIVATE_PAYMENT_CUSTODY_AUTHENTICATION_EXIT'); }
      fundingPreparation.custodyAuthenticated();
      const complete=await owner.control.request('completePackages');fundingPreparation.packagesCompleted(complete);
      await audit('preauthorized-packages',{kind:'private-original-authorization-retained-before-funding',atNs:stamp(),authorizationSHA256:complete.authorizationSHA256,delivered:complete.delivered,custodyAuthenticated:true,refundReconcilerInstalled:true,guards:projection.guards});
    },
    async releaseOwner(){
      guard();const exit=await stopAssemblyActor(owner.control);assert.equal(exit.code,0,'PC18_OWNER_CLEAN_EXIT');await host.assertOwnerExited();
      fundingPreparation.ownerExited(owner.control.provenance());await audit('owner-exit',owner.control.provenance());
    },
    async reserve(){
      try {
      guard();await host.assertOwnerExited();assert.ok(refundSettlement,'PRIVATE_PAYMENT_ORIGINAL_AUTHORIZATION_REQUIRED');
      assert.equal(reserveAttempted,false,'PRIVATE_PAYMENT_RESERVE_ALREADY_ATTEMPTED');
      const current=await pool.snapshot(),nextBlockTime=Math.max(clock,await runtime.time())+1;
      assertPrivateReservePrestate(projection,current,nextBlockTime);await assertPrivateSnapshotCanonical(runtime,current);
      const proof=assemblyEvmProof(reserve),data=pool.guardedReserveData(proof.proof,proof.publicInputs,projection.guards);
      await context.beforeEvm('reserve');guard();
      // This is the private exact latch, not a summary or coordinator assertion.
      // Never refresh the reserve epoch: original descriptors use startEpoch.
      const preparation=fundingPreparation.beforeSend(reserve);await audit('funding-preparation-complete',preparation);
      clock=nextBlockTime;await runtime.evm('evm_setNextBlockTimestamp',[clock]);guard();
      // Recheck after durable preparation/checkpoint work; atomic contract guards
      // close any remaining prestate race. No retry follows an ambiguous result.
      const last=await pool.snapshot();assertPrivateReservePrestate(projection,last,Math.max(clock,(await runtime.time())+1));await assertPrivateSnapshotCanonical(runtime,last);
      reserveAttempted=true;
      context.update({ownerRefund:{state:'UNKNOWN',amountWei:PRIVATE_PAYMENT_AMOUNTS.reserveWei,claimEpoch:refundBinding.cutoff,eligibleAt:refundEligibleAt}});
      const receiptsBefore=pool.receipts.length;
      try {
        await pool.send('exact preauthorized guarded reserve',{from:runtime.accounts[0],to:pool.address,data,value:'0x'+BigInt(PRIVATE_PAYMENT_AMOUNTS.reserveWei).toString(16)});
        const funded=await refundSettlement.reconcile();assert.equal(funded.state,'FUNDED','PRIVATE_PAYMENT_GUARDED_FUNDING_UNCONFIRMED');
        reserveConfirmed=true;context.evmConfirmed('reserve');
        await audit('guarded-reserve-confirmed',{kind:'private-canonical-guarded-reserve',atNs:stamp(),guards:projection.guards,epoch:projection.epoch,owner:owner.control.provenance(),...funded});
      } catch(error) {
        const reverted=pool.receipts.slice(receiptsBefore).find(entry=>entry.request.to===pool.address&&entry.request.data===data&&entry.receipt.status==='0x0');
        if(reverted) {
          const header=await runtime.evm('eth_getBlockByNumber',[reverted.receipt.blockNumber,false]);
          assert.equal(header?.hash,reverted.receipt.blockHash,'PRIVATE_PAYMENT_GUARDED_REVERT_NOT_CANONICAL');
          reserveReverted=true;context.reserveReverted();
          await audit('guarded-reserve-reverted',{kind:'private-canonical-guarded-reserve-reverted',atNs:stamp(),blockNumber:reverted.receipt.blockNumber,blockHash:reverted.receipt.blockHash,guards:projection.guards});
        }
        throw error;
      } finally { await archiveReceipts(); }
      await context.publish({progressCode:'RESERVE_FUNDED'});
      } catch(error) {
        if(!reserveAttempted)context.reserveNotSubmitted();
        throw error;
      }
    },
    async assertOwnerExited(){guard();const p=owner.control.provenance();assert.equal(p.closed,true,'PC18_OWNER_MUST_EXIT');assert.equal(p.channelsClosed,true,'PC18_OWNER_CHANNELS_MUST_CLOSE');assert.equal(p.writesAfterExit,0,'PC18_OWNER_POST_EXIT_WRITE');},
    async readiness(role){guard();assert.equal(reserveConfirmed,true,'PRIVATE_PAYMENT_CONFIRMED_FUNDING_REQUIRED');await host.assertOwnerExited();const snapshot=await pool.snapshot(),start=performance.now();await heavy(role+'-readiness',()=>assembler.control.request('proveReadiness',{role,snapshot,epoch:snapshot.epoch}));assert.ok(performance.now()-start<600000,'PC18_READINESS_TIMING_REDESIGN_REQUIRED');return assembler.side[role].request('readiness');},
    async execute(role,ready){return roles[role].execute(ready);},
    async join(){await heavy('joined-authorization-sol',()=>assembler.control.request('proveJoin'));},
    async terminal(){await recordResources('BEFORE_TERMINAL_FULFILLMENT');await heavy('terminal-fulfillment',async()=>assembler.control.request('proveFulfillment',{epoch:(await pool.snapshot()).epoch}));const pkg=await assembler.control.request('terminalProof');assert.equal(noteWordsToHash(assemblyEvmProof(pkg).publicInputs.slice(17,25)),authorizedRoot,'PC18_ORIGINAL_AUTHORIZATION_ROOT');return pkg;},
    async permit(role,pkg){await roles[role].permit(pkg);},
    async claim(pkg){await submit('recursive terminal and fresh permits issue payouts','fulfill',assemblyEvmProof(pkg));},
    async withdraw(role){return roles[role].withdraw();},
    async recoverWithdraw(role){return roles[role].recoverWithdraw();},
    async reconcilePayouts(){return {sol:await roles.sol.reconcile(),btc:await roles.btc.reconcile()};},
    async assertRetainedHealthy(){guard();},
    async refundStatus(){
      if(!refundSettlement||!reserveAttempted||reserveReverted)return null;
      guard();await host.assertOwnerExited();await progressRefundClock();
      const result=await refundSettlement.reconcile();
      const base={claimEpoch:refundBinding.cutoff,eligibleAt:refundEligibleAt};
      if(result.state==='CLAIMED')return {...base,state:'CLAIMED'};
      if(result.state==='FUNDED')return {...base,state:refundAttempted?'UNKNOWN':BigInt(result.epoch)>=claimEpoch?'ELIGIBLE':'WAITING'};
      if(result.state==='NOTE_ISSUED') {
        await ensureRefundWithdrawal();const withdrawn=await refundWithdrawal.reconcile();
        if(withdrawn.state==='WITHDRAWN')return {...base,state:'WITHDRAWN',amount:withdrawn.amount};
        return {...base,state:'NOTE_ISSUED'};
      }
      return {...base,state:'UNKNOWN'};
    },
    async refundWindow(){return {remainingMs:Math.max(0,Math.ceil(refundDeadlineAt-performance.now()))};},
    async advanceToRefundCutoffForTest(){
      guard();await host.assertOwnerExited();assert.ok(refundSettlement,'PRIVATE_PAYMENT_ORIGINAL_AUTHORIZATION_REQUIRED');
      const before=await runtime.time(),cutoff=Number(claimEpoch*600n);
      if(before<cutoff) { await runtime.evm('evm_setNextBlockTimestamp',[cutoff]);await runtime.evm('evm_mine'); }
      clock=await runtime.time();
      await audit('owner-refund-clock',{kind:'integration-only-accelerated-local-chain-time',before,after:clock,claimEpoch:claimEpoch.toString(),pool:pool.address});
    },
    async issueRefund(){
      guard();assert.equal(refundAttempted,false,'PRIVATE_PAYMENT_REFUND_ALREADY_ATTEMPTED');await host.assertOwnerExited();await progressRefundClock();
      let checked=await refundSettlement.reconcile();assert.equal(checked.state,'FUNDED','PRIVATE_PAYMENT_REFUND_RESERVE_UNAVAILABLE');assert.ok(BigInt(checked.epoch)>=claimEpoch,'PRIVATE_PAYMENT_REFUND_BEFORE_CUTOFF');
      const proofEpoch=checked.epoch;
      await heavy('terminal-owner-refund',()=>assembler.control.request('proveRefund',{epoch:proofEpoch}));
      const pkg=validateAssemblyProofPackage(await assembler.control.request('terminalProof'),'refund'),proof=assemblyEvmProof(pkg);
      assertOriginalRefundProofBinding(proof,{scope:pool.scope,policy:pool.policy,epoch:proofEpoch,root:authorizedRoot,reserveNullifier:'0x'+refundBinding.reserveNullifier,paymentCommitment:'0x'+refundBinding.paymentCommitment});
      checked=await refundSettlement.reconcile();assert.equal(checked.state,'FUNDED','PRIVATE_PAYMENT_REFUND_RESERVE_UNAVAILABLE');assert.equal(checked.epoch,proofEpoch,'PRIVATE_PAYMENT_REFUND_EPOCH_CHANGED');
      assert.equal(Math.floor((Math.max(clock,await runtime.time())+1)/600).toString(),proofEpoch,'PRIVATE_PAYMENT_REFUND_EPOCH_CHANGED');
      // Latch before any possible send and keep it in this surviving authority.
      refundAttempted=true;
      await submit('genuine original authorization refund issues exact owner note','refund',proof);
      checked=await refundSettlement.reconcile();assert.equal(checked.state,'NOTE_ISSUED','PRIVATE_PAYMENT_REFUND_ISSUANCE_UNCONFIRMED');
      await audit('owner-refund-issued',{kind:'private-original-authorization-refund',...checked,owner:owner.control.provenance(),services:{sol:roles.sol.audit(),btc:roles.btc.audit()}});
    },
    async withdrawRefund(){
      guard();await ensureRefundWithdrawal();await startRefundSigner();
      const result=await refundWithdrawal.recover();assert.equal(result.state,'WITHDRAWN','PRIVATE_PAYMENT_OWNER_REFUND_NOT_VERIFIED');return {amount:result.amount};
    },
    async verifyRefund(){
      const status=await host.refundStatus();assert.equal(status.state,'WITHDRAWN','PRIVATE_PAYMENT_OWNER_REFUND_NOT_VERIFIED');
      const final=await pool.snapshot();assert.equal(await runtime.balance(pool.address),0n,'PRIVATE_PAYMENT_POOL_BALANCE');assert.equal(final.liveReservations,0);assert.equal(final.liveOutputNotes,0);
      for(const [file,pin]of Object.entries(sourceHashes))assert.equal(sha(await readFile(join(projectRoot,file))),pin.sha256,'PC18_SOURCE_CHANGED_DURING_RUN');
      await audit('owner-refund-completion',{kind:'private-owner-refund-completion',pool:pool.address,scope:pool.scope,finalState:final,owner:owner.control.provenance(),ownerRefundAmount:PRIVATE_PAYMENT_AMOUNTS.reserveWei,services:{sol:roles.sol.audit(),btc:roles.btc.audit()},nativePrefixRolledBack:false,executorCompensationPaid:false});
    },
    async recordCoordinator(entry){await audit('coordinator',{kind:'private-payment-coordinator-lifecycle',...entry,pool:pool.address,scope:pool.scope,policy:pool.policy,evmGenesis:runtime.metadata.evmGenesis,bitcoinGenesis:runtime.metadata.bitcoinGenesis,solanaGenesis:solana.genesis});},
    async validateRecovery(){
      guard();await host.assertOwnerExited();
      const states=await host.reconcilePayouts();
      for(const role of ['sol','btc'])assert.ok(['READY','WITHDRAWN'].includes(states[role].state),'PRIVATE_PAYMENT_RECOVERY_EVIDENCE_REQUIRED');
      await audit('recovery-authority',{kind:'private-same-authority-recovery',pool:pool.address,scope:pool.scope,policy:pool.policy,owner:owner.control.provenance(),states});
    },
    async verifyCompletion(){
      await host.assertOwnerExited();const final=await pool.snapshot();assert.equal(final.liveReservations,0);assert.equal(final.liveOutputNotes,0);assert.equal(final.solEffectCount,1);assert.equal(final.btcEffectCount,1);assert.equal(await runtime.balance(pool.address),0n);
      const sol=roles.sol.audit(),btc=roles.btc.audit(),exited=BigInt(owner.control.provenance().exitedAtNs);
      assert.ok(exited<BigInt(sol.dispatchEnteredAtNs));assert.ok(BigInt(sol.certifiedAtNs)<BigInt(btc.authorizedAtNs));
      for(const [file,pin]of Object.entries(sourceHashes))assert.equal(sha(await readFile(join(projectRoot,file))),pin.sha256,'PC18_SOURCE_CHANGED_DURING_RUN');
      await audit('completion',{kind:'private-payment-completion',finalState:final,owner:owner.control.provenance(),services:{sol,btc},finalityProfile:FINALITY_PROFILE_NAME});
    },
    async cleanup(){
      clearInterval(monitor);context.signal?.removeEventListener('abort',abort);const failures=[],recipientExits=[];
      for(const signer of refundSigners)try{await signer.stop();}catch(error){failures.push(safeCode(error));}
      for(const recipient of recipients) {
        try { recipientExits.push(await (aborted||context.signal?.aborted?recipient.terminate():recipient.stop())); }
        catch(error) {
          // Abort may arrive after a graceful shutdown request was entered.
          // Its own SIGTERM rejection is not a failed cleanup if the same
          // captured child is subsequently observed fully closed.
          if(aborted||context.signal?.aborted)try{recipientExits.push(await recipient.terminate());}catch(terminationError){failures.push(safeCode(terminationError));}
          else failures.push(safeCode(error));
        }
      }
      for(const actor of actors)try{if(aborted||context.signal?.aborted)await actor.control.terminate();else await stopAssemblyActor(actor.control);}catch{try{await actor.control.terminate();}catch(error){failures.push(safeCode(error));}}
      for(const child of children)try{await stopOwnedChild(child);}catch(error){failures.push(safeCode(error));}
      // Preserve encrypted recipient stores as recovery artifacts. Passwords
      // remain only in this keeper lifetime; its loss is still unrecoverable.
      if(issuer)issuer.close();if(solana)try{await solana.close();}catch(error){failures.push(safeCode(error));}
      if(runtime)try{await runtime.close();}catch(error){failures.push(safeCode(error));}
      if(actors.some(a=>!a.control.provenance().closed))failures.push('PRIVATE_PAYMENT_ACTOR_CLEANUP');
      if(children.some(child=>!ownedChildLifetimes.get(child)?.closed))failures.push('PRIVATE_PAYMENT_CHILD_CLEANUP');
      if(directoryOwned)try{await audit('cleanup',{kind:'private-owned-cleanup',completed:failures.length===0,failures,recipientVaultsRemoved:false,recipientVaultsRetainedEncrypted:true,ownerRefundVaultRetainedEncrypted:Boolean(refundCustody),recipientExits,ownedChildrenClosed:children.every(child=>ownedChildLifetimes.get(child)?.closed===true),actorProcesses:actors.map(a=>a.control.provenance()),privateEvmReceiptCount:evmReceiptCount});}catch(error){failures.push(safeCode(error));}
      assert.equal(failures.length,0,'PRIVATE_PAYMENT_CLEANUP_FAILED');
    },
  };
  return host;
}
