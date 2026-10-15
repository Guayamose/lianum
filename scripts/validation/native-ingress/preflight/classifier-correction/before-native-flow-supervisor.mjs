import { PREFLIGHT_REAL_RUN_DISABLED, PREFLIGHT_RESULT, assertNativeIngressV3PreflightResult, preflightForbiddenProcess, PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED, PRODUCTION_PREFLIGHT_RESULT, assertNativeIngressV3ProductionPreflightResult, productionPreflightForbiddenProcess } from './native-ingress-v3-preflight-policy.mjs';
/** Linux supervisor for two fixed local application flows. Importing this module
 * performs no native, compiler, proof, key-generation or installation work. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync,
  renameSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT, GOLDEN, LOCAL as PROOF_LOCAL, LIMITS as PROOF_LIMITS } from '../proof-workers/catalog.mjs';
import { PRIVATE_RESOURCE_POLICY, PRIVATE_RESOURCE_FLOORS,
  PRIVATE_PROOF_WORKER_RSS_LIMIT } from '../../../omnichain-product/src/private-resource-policy.mjs';
import { nativeFlowSourcePins, accountRecoverySourcePins, assetPortfolioSourcePins, evmVaultSourcePins } from './source-pins.mjs';
import { nativeClaimSourcePins } from './native-claim-source-pins.mjs';
import { UNFUNDED_HEALTH_REAL_RUN_DISABLED, UNFUNDED_HEALTH_RESULT, assertUnfundedHealthResult, unfundedHealthProcessFailure }
  from './native-claim-unfunded-health-policy.mjs';

// Private, fixed catalog: neither public entry accepts a profile or options.
// Paths, result formats, source roots and budgets cannot come from a request.
const FLOW_PROFILES = Object.freeze({
  nativeIngressV3ProductionPreflight: Object.freeze({
    entry: join(ROOT, 'integration/run-native-ingress-v3-production-preflight.mjs'),
    worker: join(ROOT, 'integration/native-ingress-v3-production-preflight-worker.mjs'),
    local: join(ROOT, '.local/native-ingress-v3-production-preflight'),
    resultFormat: PRODUCTION_PREFLIGHT_RESULT,
    resourcesFormat: 'LIANUM_NATIVE_INGRESS_V3_PRODUCTION_PREFLIGHT_RESOURCES_V1',
    lockFormat: 'LIANUM_NATIVE_INGRESS_V3_PRODUCTION_PREFLIGHT_LOCK_V1',
    attemptFormat: 'LIANUM_NATIVE_INGRESS_V3_PRODUCTION_PREFLIGHT_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_ZERO_DEPOSIT_ONE_PRODUCTION_ROLE_PROOF',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeIngressV3Preflight: Object.freeze({
    entry: join(ROOT, 'integration/run-native-ingress-v3-preflight.mjs'),
    worker: join(ROOT, 'integration/native-ingress-v3-preflight-worker.mjs'),
    local: join(ROOT, '.local/native-ingress-v3-preflight'),
    resultFormat: PREFLIGHT_RESULT,
    resourcesFormat: 'LIANUM_NATIVE_INGRESS_V3_PREFLIGHT_RESOURCES_V1',
    lockFormat: 'LIANUM_NATIVE_INGRESS_V3_PREFLIGHT_LOCK_V1',
    attemptFormat: 'LIANUM_NATIVE_INGRESS_V3_PREFLIGHT_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_ZERO_USER_DEPOSIT_INGRESS_V3_PREFLIGHT',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaimUnfundedHealth: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-unfunded-health.mjs'),
    worker: join(ROOT, 'integration/native-claim-unfunded-health-worker.mjs'),
    local: join(ROOT, '.local/native-claim-unfunded-health'),
    resultFormat: UNFUNDED_HEALTH_RESULT,
    resourcesFormat: 'FLAT_WALLET_UNFUNDED_CLAIM_HEALTH_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_UNFUNDED_CLAIM_HEALTH_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_UNFUNDED_CLAIM_HEALTH_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_UNFUNDED_CLAIM_HEALTH_ONLY',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaims: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-flow.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-flow'),
    resultFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_NATIVE_CLAIM_FLOW',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaimGraph: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-graph-flow.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-graph-flow'),
    resultFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_NATIVE_CLAIM_GRAPH_FLOW',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaimLoadedFacts: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-loaded-facts-probe.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-loaded-facts-probe'),
    resultFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_LOADED_FACTS_PROBE_ONLY',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  evmVault: Object.freeze({
    entry: join(ROOT, 'integration/run-evm-vault-flow.mjs'),
    worker: join(ROOT, 'integration/evm-vault-flow.mjs'),
    local: join(ROOT, '.local/evm-vault-flow'),
    resultFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_EVM_VAULT_FLOW',
    sourcePins: evmVaultSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  nativeFlow: Object.freeze({
    entry: join(ROOT, 'integration/run-native-flow.mjs'),
    worker: join(ROOT, 'integration/native-flow.mjs'),
    local: join(ROOT, '.local/native-flow'),
    resultFormat: 'FLAT_WALLET_NATIVE_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_NATIVE_FLOW',
    sourcePins: nativeFlowSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  accountRecovery: Object.freeze({
    entry: join(ROOT, 'integration/run-account-recovery.mjs'),
    worker: join(ROOT, 'integration/account-recovery.mjs'),
    local: join(ROOT, '.local/account-recovery'),
    resultFormat: 'FLAT_WALLET_ACCOUNT_RECOVERY_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_ACCOUNT_RECOVERY_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_ACCOUNT_RECOVERY_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_ACCOUNT_RECOVERY_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_ACCOUNT_RECOVERY',
    sourcePins: accountRecoverySourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  assetPortfolio: Object.freeze({
    entry: join(ROOT, 'integration/run-asset-portfolio.mjs'),
    worker: join(ROOT, 'integration/asset-portfolio.mjs'),
    local: join(ROOT, '.local/asset-portfolio'),
    resultFormat: 'FLAT_WALLET_ASSET_PORTFOLIO_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_ASSET_PORTFOLIO_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_ASSET_PORTFOLIO_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_ASSET_PORTFOLIO_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_ASSET_PORTFOLIO',
    sourcePins: assetPortfolioSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
});
function assertFixedProfile(profile) {
  assert.ok(Object.values(FLOW_PROFILES).includes(profile),
    'NATIVE_FIXED_FLOW_PROFILE');
}
const CLEAN_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' });
const HASH = data => createHash('sha256').update(data).digest('hex');
const live = process => !/^[ZX]$/.test(process.state);
const METRICS = Object.freeze(['availableRAMBytes', 'freeDiskBytes', 'supervisorRSSBytes',
  'mainWorkerRSSBytes', 'descendantRSSBytes', 'ownedGroupRSSBytes', 'maximumProofWorkerRSSBytes']);
export const NATIVE_FLOW_LIMITS = Object.freeze({
  minimumAvailableRAMBytes: PRIVATE_RESOURCE_FLOORS.availableRAM,
  minimumFreeDiskBytes: PRIVATE_RESOURCE_FLOORS.freeDisk,
  maximumProofOrMainRSSBytes: PRIVATE_PROOF_WORKER_RSS_LIMIT,
  sampleMilliseconds: PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds,
  totalMilliseconds: 90 * 60 * 1000,
  cleanupReserveMilliseconds: 15000,
  killGraceMilliseconds: PROOF_LIMITS.killGraceMilliseconds,
  maximumOutputBytes: 4 * 1024 * 1024,
  maximumResultBytes: 8 * 1024 * 1024,
});

function integer(value) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, 'NATIVE_RESOURCE_INTEGER');
  return value;
}
function safeCode(error) {
  return typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
    ? error.code : 'UNCLASSIFIED_ERROR';
}
function failureCode(error) {
  return typeof error?.message === 'string' && /^(?:NATIVE|ENVELOPE|PW)_[A-Z0-9_]{1,100}$/.test(error.message)
    ? error.message : 'NATIVE_SUPERVISOR_ERROR';
}
function readRegular(path, maximumBytes = NATIVE_FLOW_LIMITS.maximumResultBytes) {
  assert.equal(realpathSync(path), resolve(path), 'NATIVE_FILE_SYMLINK');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    assert.ok(before.isFile() && before.size <= BigInt(maximumBytes), 'NATIVE_REGULAR_FILE_SIZE');
    const bytes = readFileSync(fd), after = fstatSync(fd, { bigint: true });
    assert.ok(bytes.length <= maximumBytes && before.size === after.size
      && before.mtimeNs === after.mtimeNs, 'NATIVE_FILE_CHANGED');
    return bytes;
  } finally { closeSync(fd); }
}
function ensureDirectory(path, profile) {
  assertFixedProfile(profile);
  assert.ok(path === join(ROOT, '.local') || path === profile.local || path.startsWith(profile.local + sep),
    'NATIVE_FIXED_OUTPUT_DIRECTORY');
  const missing = []; let ancestor = path;
  while (!existsSync(ancestor)) { missing.push(ancestor); ancestor = dirname(ancestor); }
  assert.equal(realpathSync(ancestor), ancestor, 'NATIVE_OUTPUT_ANCESTOR_SYMLINK');
  assert.ok(lstatSync(ancestor).isDirectory(), 'NATIVE_OUTPUT_ANCESTOR_DIRECTORY');
  for (const directory of missing.reverse()) mkdirSync(directory, { mode: 0o700 });
  assert.equal(realpathSync(path), path, 'NATIVE_OUTPUT_DIRECTORY_SYMLINK');
  const stat = lstatSync(path);
  assert.ok(stat.isDirectory() && (stat.mode & 0o077) === 0, 'NATIVE_PRIVATE_OUTPUT_DIRECTORY');
}
function writeExclusive(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); return fstatSync(fd); }
  finally { closeSync(fd); }
}
const json = value => JSON.stringify(value, null, 2) + '\n';

export function assertNativeFlowRunId(value) {
  assert.ok(typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),
  'NATIVE_RUN_ID');
  return value;
}

/** Pure /proc parser used by the monitor and isolated tests. Names in stat may
 * contain spaces and parentheses; never split the comm field on whitespace. */
export function parseNativeProcStat(pid, text) {
  const end = text.lastIndexOf(') '), first = text.indexOf(' ');
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && end > first
    && text.slice(0, first) === String(pid), 'NATIVE_PROC_STAT');
  const fields = text.slice(end + 2).trim().split(/\s+/);
  assert.ok(fields.length >= 22 && /^[RSDZTWXIKPt]$/.test(fields[0]), 'NATIVE_PROC_STAT_FIELDS');
  const ppid = integer(Number(fields[1])), pgrp = integer(Number(fields[2]));
  const session = integer(Number(fields[3])), startTimeTicks = fields[19];
  assert.match(startTimeTicks, /^\d+$/, 'NATIVE_PROC_START_IDENTITY');
  return { pid, ppid, state: fields[0], pgrp, session, startTimeTicks };
}
function procStat(pid) {
  try { return parseNativeProcStat(pid, readFileSync(`/proc/${pid}/stat`, 'utf8')); }
  catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return null; throw error; }
}
const sameIdentity = (a, b) => a && b && a.pid === b.pid && a.startTimeTicks === b.startTimeTicks;

/** Aggregate RSS is observation only. A validator plus a prover may exceed
 * 3 GiB together while each proof/main process and the host remain in budget. */
export function nativeResourceFailure(sample) {
  for (const name of ['availableRAMBytes', 'freeDiskBytes', 'mainWorkerRSSBytes',
    'maximumProofWorkerRSSBytes', 'supervisorRSSBytes', 'liveProofWorkers']) integer(sample[name]);
  if (sample.availableRAMBytes < NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes) return 'NATIVE_MEMAVAILABLE_FLOOR';
  if (sample.freeDiskBytes < NATIVE_FLOW_LIMITS.minimumFreeDiskBytes) return 'NATIVE_DISK_FLOOR';
  if (sample.mainWorkerRSSBytes > NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes) return 'NATIVE_MAIN_WORKER_RSS_LIMIT';
  if (sample.maximumProofWorkerRSSBytes > NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes) return 'NATIVE_PROOF_WORKER_RSS_LIMIT';
  if (sample.supervisorRSSBytes > NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes) return 'NATIVE_SUPERVISOR_RSS_LIMIT';
  if (sample.liveProofWorkers > 1) return 'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS';
  return null;
}

/** The worker result is untrusted evidence until exit, source and cleanup
 * checks pass. Copy only this fixed public summary into the supervisor report. */
function validateResultIdentity(result, supervisorPID, workerPID, profile) {
  assertFixedProfile(profile);
  assert.equal(result?.format, profile.resultFormat, 'NATIVE_RESULT_FORMAT');
  assert.equal(result.localOnly, true, 'NATIVE_RESULT_LOCAL_ONLY');
  assert.equal(result.fakeFundsOnly, true, 'NATIVE_RESULT_FAKE_FUNDS_ONLY');
  assert.equal(result.publicNetwork, false, 'NATIVE_RESULT_PUBLIC_NETWORK');
  assert.equal(result.supervisor?.supervisorPID, supervisorPID, 'NATIVE_RESULT_SUPERVISOR_BINDING');
  assert.equal(result.supervisor?.workerPID, workerPID, 'NATIVE_RESULT_WORKER_BINDING');
}
export function validateNativeResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeFlow);
}
export function validateAccountRecoveryResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.accountRecovery);
}
export function validateAssetPortfolioResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.assetPortfolio);
}
export function validateNativeClaimLoadedFactsResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeClaimLoadedFacts);
}
export function validateNativeClaimUnfundedHealthResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeClaimUnfundedHealth);
}
export function validateNativeIngressV3PreflightResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeIngressV3Preflight);
}
function validateCompletedResult(result, supervisorPID, workerPID, profile) {
  validateResultIdentity(result, supervisorPID, workerPID, profile);
  assert.equal(result.phase, 'completed', 'NATIVE_RESULT_PHASE');
  assert.equal(result.success, true, 'NATIVE_RESULT_SUCCESS');
  for (const key of profile.cleanupKeys)
    assert.equal(result.cleanup?.[key], true, 'NATIVE_RESULT_RUNTIME_CLEANUP');
  let scoped = {};
  if (profile === FLOW_PROFILES.nativeIngressV3ProductionPreflight) scoped = assertNativeIngressV3ProductionPreflightResult(result);
  if (profile === FLOW_PROFILES.nativeIngressV3Preflight) scoped = assertNativeIngressV3PreflightResult(result);
  if (profile === FLOW_PROFILES.nativeClaimUnfundedHealth) scoped = assertUnfundedHealthResult(result);
  if (profile === FLOW_PROFILES.nativeClaimLoadedFacts) {
    assert.equal(result.profile, 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE', 'NATIVE_LOADED_FACTS_RESULT_PROFILE');
    assert.equal(result.fullNativeGraphAcceptance, false, 'NATIVE_LOADED_FACTS_SCOPE');
    assert.equal(result.fullWalletAcceptance, false, 'NATIVE_LOADED_FACTS_SCOPE');
    assert.deepEqual(result.selectedAssets, [1], 'NATIVE_LOADED_FACTS_SCOPE');
    assert.deepEqual(result.proofs?.map(proof => proof.relation),
      ['deposit_intent', 'native_claim_ingress', 'withdraw_balance', 'native_claim_discharge'], 'NATIVE_LOADED_FACTS_PROOFS');
    const probe = result.loadedFactsProbe;
    assert.equal(probe?.scope, 'LOADED_POST_DELIVERY_FACTS_ONLY', 'NATIVE_LOADED_FACTS_SCOPE');
    for (const key of ['success', 'factualChecksPassed', 'ownerClaimFullyRedeemed', 'originalFinalizedOnce', 'retainedOriginalClaimBinding',
      'health', 'checkpoint', 'sameEvmHead', 'custodyUnchanged', 'solverSeparateLiquidity', 'noAttestationTransactionSubmitted'])
      assert.equal(probe[key], true, 'NATIVE_LOADED_FACTS_INCOMPLETE');
    for (const key of ['providerProofs', 'graphSettlement', 'fullNativeGraphAcceptance'])
      assert.equal(probe[key], false, 'NATIVE_LOADED_FACTS_SCOPE');
    assert.equal(probe.issuedClaimAmount, '3000000'); assert.equal(probe.solverNativeAmount, '1000000');
    assert.equal(probe.factsCalls, 1); assert.equal(probe.retainedGraphFactPerSigner, 1);
    assert.equal(result.acceptance?.allClaimLiabilitiesClosed, true, 'NATIVE_LOADED_FACTS_LIABILITIES');
    scoped = { scope: probe.scope, fullNativeGraphAcceptance: false, ownerClaimFullyRedeemed: true };
  }
  return { format: result.format, phase: 'completed', success: true, localOnly: true,
    fakeFundsOnly: true, publicNetwork: false, ...scoped,
    supervisor: { supervisorPID, workerPID },
    cleanup: Object.fromEntries(profile.cleanupKeys.map(key => [key, true])) };
}

export async function runNativeFlowSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeFlow);
}
export async function runAccountRecoverySupervisor() {
  assert.equal(arguments.length, 0, 'ACCOUNT_RECOVERY_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.accountRecovery);
}
export async function runAssetPortfolioSupervisor() {
  assert.equal(arguments.length, 0, 'ASSET_PORTFOLIO_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.assetPortfolio);
}
export async function runEvmVaultSupervisor() {
  assert.equal(arguments.length, 0, 'EVM_VAULT_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.evmVault);
}
export async function runNativeClaimSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_CLAIM_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaims);
}
export async function runNativeClaimGraphSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_CLAIM_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimGraph);
}
export async function runNativeClaimLoadedFactsSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_CLAIM_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimLoadedFacts);
}
export async function runNativeClaimUnfundedHealthSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_UNFUNDED_NO_SUPERVISOR_OPTIONS');
  assert.equal(UNFUNDED_HEALTH_REAL_RUN_DISABLED, false, 'NATIVE_UNFUNDED_RUN_REQUIRES_FROZEN_CHECKPOINT');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimUnfundedHealth);
}
export async function runNativeIngressV3PreflightSupervisor() {
  assert.equal(arguments.length, 0, 'V3_PREFLIGHT_NO_SUPERVISOR_OPTIONS');
  assert.equal(PREFLIGHT_REAL_RUN_DISABLED, false, 'V3_PREFLIGHT_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeIngressV3Preflight);
}
export async function runNativeIngressV3ProductionPreflightSupervisor() {
  assert.equal(arguments.length, 0, 'V3_PRODUCTION_PREFLIGHT_NO_SUPERVISOR_OPTIONS');
  assert.equal(PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED, false, 'V3_PRODUCTION_PREFLIGHT_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeIngressV3ProductionPreflight);
}
async function runFixedFlowSupervisor(profile) {
  assertFixedProfile(profile);
  const { entry: ENTRY, worker: WORKER, local: LOCAL } = profile;
  const LOCK = join(LOCAL, 'active.lock');
  const began = process.hrtime.bigint(), startedAt = new Date().toISOString();
  const elapsed = () => Number(process.hrtime.bigint() - began) / 1e6;
  const runId = assertNativeFlowRunId(randomUUID());
  const attempt = join(LOCAL, `attempt-${runId}`), reportPath = join(attempt, 'resources.json');
  const resultPath = join(attempt, 'result.json'), sourcePath = join(attempt, 'source-pins.json');
  const streams = Object.fromEntries(['stdout', 'stderr'].map(key => [key, { bytes: 0, hash: createHash('sha256') }]));
  const identities = new Map(), history = new Map();
  let report, child, lockIdentity, workerIdentity, sourcePins, failure = null;
  let attemptCreated = false, workerSpawned = false, childExited = false, childClosed = false;
  let groupGone = false, groupOwnershipLost = false, finalGroupMeasurementSucceeded = false;
  let stopping = false, finished = false, finishing = false, termAt = null;
  let monitorTimer, reserveTimer, hardTimer, killTimer, cleanupTimer, resolveCompletion;
  const completion = new Promise(resolveDone => { resolveCompletion = resolveDone; });

  function fail(code, details = {}) {
    failure ??= code;
    if (!report) return;
    report.failure = failure;
    if (!report.failures.some(item => item.code === code))
      report.failures.push({ code, elapsedMilliseconds: elapsed(), at: new Date().toISOString(), ...details });
  }
  function save() {
    if (!report || !attemptCreated) return;
    if (existsSync(reportPath)) readRegular(reportPath);
    const temporary = join(attempt, `resources.tmp-${process.pid}`);
    writeExclusive(temporary, json(report)); renameSync(temporary, reportPath);
  }
  function bestEffortSave() {
    try { save(); return true; }
    catch (error) {
      fail('NATIVE_EVIDENCE_WRITE_FAILURE', { errorCode: safeCode(error) });
      if (report) report.evidenceWriteFailure = safeCode(error);
      return false;
    }
  }
  function classify(pid) {
    if (pid === child.pid) return { role: 'main-worker', proofWorker: false };
    // Used for a label only. Neither command lines nor executable paths leave
    // this function, and they never select a signal target or executable.
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
    const script = argv[1];
    if (['native-ingress-v3-role-process.mjs', 'native-ingress-v3-run-bounded.mjs', 'native-ingress-v3-worker.mjs']
      .some(name => script === join(ROOT, 'proof-workers', name))) return { role: 'native-ingress-v3-proof-process', proofWorker: true };
    if (script === join(ROOT, 'proof-workers/worker.mjs')) return { role: 'flat-proof-worker', proofWorker: true };
    if (script === join(GOLDEN, 'src/paeg/proof-worker.mjs')) return { role: 'golden-note-proof-worker', proofWorker: true };
    if (script === join(ROOT, 'proof-workers/role-process.mjs')) return { role: 'flat-proof-role', proofWorker: false };
    if (script === join(ROOT, 'mobile-core/flat-owner-process.mjs')) return { role: 'flat-owner-role', proofWorker: false };
    if (script === join(GOLDEN, 'src/paeg/native-recipient-process.mjs')
      || script === join(ROOT, 'integration/native-recipient-child.mjs')) return { role: 'recipient-role', proofWorker: false };
    if (script === join(GOLDEN, 'src/paeg/generic-balance-owner-child.mjs')) return { role: 'golden-owner-role', proofWorker: false };
    const executable = basename(readlinkSync(`/proc/${pid}/exe`));
    const runtime = { anvil: 'evm-runtime', bitcoind: 'bitcoin-runtime',
      'bitcoin-cli': 'bitcoin-local-cli', 'solana-test-validator': 'solana-runtime',
      'agave-validator': 'solana-runtime', 'solana-keygen': 'solana-local-keygen' }[executable];
    return { role: runtime ?? 'owned-descendant', proofWorker: false };
  }
  function groupResources() {
    if (!child?.pid || groupGone) return { rssBytes: 0, liveCount: 0, processes: [] };
    const pgid = child.pid;
    assert.ok(Number.isSafeInteger(pgid) && pgid > 1 && pgid !== process.pid, 'NATIVE_OWNED_GROUP_ID');
    const group = [], escaped = [];
    for (const entry of readdirSync('/proc')) {
      if (!/^[1-9]\d*$/.test(entry)) continue;
      const stat = procStat(Number(entry));
      if (!stat) continue;
      const known = identities.get(stat.pid);
      if (known && sameIdentity(known, stat) && (stat.pgrp !== pgid || stat.session !== pgid) && live(stat)) escaped.push(stat);
      if (stat.pgrp === pgid) group.push(stat);
    }
    if (escaped.length || group.some(stat => stat.session !== pgid)) {
      groupOwnershipLost = true;
      if (report) report.escapedOwnedProcesses = escaped;
      throw Error('NATIVE_GROUP_SESSION_CHANGED');
    }
    const leader = group.find(stat => stat.pid === pgid);
    if (leader && (!workerIdentity || !sameIdentity(leader, workerIdentity))) {
      groupOwnershipLost = true; throw Error('NATIVE_WORKER_IDENTITY_CHANGED');
    }
    // An observed process identity must anchor continuity if the leader has
    // exited. Never adopt a reused numeric group merely because its ID matches.
    if (group.length && !leader && !group.some(stat => sameIdentity(stat, identities.get(stat.pid)))) {
      groupOwnershipLost = true; throw Error('NATIVE_GROUP_CONTINUITY_UNCONFIRMED');
    }
    const processes = [];
    for (const stat of group) {
      let status, classification;
      try {
        status = readFileSync(`/proc/${stat.pid}/status`, 'utf8');
        classification = live(stat) ? classify(stat.pid) : { role: history.get(`${stat.pid}:${stat.startTimeTicks}`)?.role ?? 'exited-member', proofWorker: false };
      } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) continue; throw error; }
      const after = procStat(stat.pid);
      if (!after) continue;
      assert.ok(sameIdentity(stat, after) && after.pgrp === pgid && after.session === pgid,
        'NATIVE_MEASURED_PROCESS_CHANGED');
      const rss = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
      assert.ok(rss || !live(after), 'NATIVE_OWNED_RSS_UNAVAILABLE');
      identities.set(after.pid, after);
      processes.push({ ...after, ...classification, rssBytes: integer(rss ? Number(rss[1]) * 1024 : 0) });
    }
    processes.sort((a, b) => a.pid - b.pid);
    if (!processes.length) {
      let absent = false;
      try { process.kill(-pgid, 0); }
      catch (error) { if (error.code === 'ESRCH') absent = true; else throw error; }
      assert.ok(absent, 'NATIVE_GROUP_MEMBERSHIP_SCAN_INCOMPLETE');
      groupGone = true;
    }
    return { rssBytes: integer(processes.reduce((sum, item) => sum + item.rssBytes, 0)),
      liveCount: processes.filter(live).length, processes };
  }
  function assertHeavyLocks() {
    const lockPaths = [[join(PROOF_LOCAL, 'active.lock'), 'pid'], ['/tmp/lianum-paeg-proof-host.lock', 'parentPID']];
    for (const [path, ownerField] of lockPaths) {
      if (!existsSync(path)) continue;
      let value;
      try { value = JSON.parse(readRegular(path, 4096)); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const pid = value[ownerField];
      assert.ok(Number.isSafeInteger(pid) && pid > 1, 'NATIVE_HEAVY_LOCK_OWNER_INVALID');
      const owner = procStat(pid);
      // A role may acquire its lock between the group scan and this read. An
      // unchanged live leader safely anchors that newly born group member.
      const leader = child?.pid ? procStat(child.pid) : null;
      const anchored = sameIdentity(owner, identities.get(pid)) || sameIdentity(leader, workerIdentity);
      if (!owner && !existsSync(path)) continue; // A normally released lock raced its owner's exit.
      assert.ok(child?.pid && owner && owner.pgrp === child.pid && owner.session === child.pid
        && anchored, 'NATIVE_FOREIGN_OR_STALE_HEAVY_LOCK');
      const after = procStat(pid);
      assert.ok(sameIdentity(owner, after) && after.pgrp === child.pid && after.session === child.pid,
        'NATIVE_HEAVY_LOCK_OWNER_CHANGED');
      identities.set(pid, after);
    }
  }
  function assertOtherIntegrationLocks() {
    for (const name of ['envelope-constraints', 'native-constraints', 'completion-constraints', 'pinned-verification', 'verifier-compilation'])
      assert.equal(existsSync(join(PROOF_LOCAL, name + '.lock')), false, 'NATIVE_OTHER_INTEGRATION_LOCK');
    assert.equal(existsSync(join(ROOT, '.local/hash-conformance/active.lock')), false, 'NATIVE_HASH_CONFORMANCE_LOCK');
    assertOtherApplicationLocks();
  }
  function assertOtherApplicationLocks() {
    for (const other of Object.values(FLOW_PROFILES))
      if (other !== profile) assert.equal(existsSync(join(other.local, 'active.lock')), false,
        'NATIVE_OTHER_APPLICATION_LOCK');
  }
  function resources() {
    const memory = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
    assert.ok(memory, 'NATIVE_MEMAVAILABLE_UNAVAILABLE');
    const disk = statfsSync(ROOT, { bigint: true }), diskBytes = disk.bavail * disk.bsize;
    assert.ok(diskBytes <= BigInt(Number.MAX_SAFE_INTEGER), 'NATIVE_DISK_MEASUREMENT_RANGE');
    const group = groupResources(), main = group.processes.find(item => item.pid === child?.pid);
    const proofWorkers = group.processes.filter(item => item.proofWorker && live(item));
    return { at: new Date().toISOString(), elapsedMilliseconds: elapsed(),
      availableRAMBytes: integer(Number(memory[1]) * 1024), freeDiskBytes: integer(Number(diskBytes)),
      supervisorRSSBytes: integer(process.memoryUsage().rss), mainWorkerRSSBytes: main?.rssBytes ?? 0,
      descendantRSSBytes: integer(group.rssBytes - (main?.rssBytes ?? 0)), ownedGroupRSSBytes: group.rssBytes,
      maximumProofWorkerRSSBytes: Math.max(0, ...proofWorkers.map(item => item.rssBytes)),
      liveProofWorkers: proofWorkers.length, ownedGroupLiveCount: group.liveCount, ownedProcesses: group.processes };
  }
  function recordSample(sample) {
    report.samples++; report.latestResources = sample;
    for (const key of METRICS) {
      report.resourceSummary[key].minimum = Math.min(report.resourceSummary[key].minimum, sample[key]);
      report.resourceSummary[key].maximum = Math.max(report.resourceSummary[key].maximum, sample[key]);
    }
    report.peakOwnedGroupLiveCount = Math.max(report.peakOwnedGroupLiveCount, sample.ownedGroupLiveCount);
    for (const item of sample.ownedProcesses) {
      const key = `${item.pid}:${item.startTimeTicks}`, prior = history.get(key);
      if (!prior) history.set(key, { ...item, firstObservedMilliseconds: sample.elapsedMilliseconds,
        lastObservedMilliseconds: sample.elapsedMilliseconds, peakRSSBytes: item.rssBytes });
      else { prior.lastObservedMilliseconds = sample.elapsedMilliseconds;
        prior.peakRSSBytes = Math.max(prior.peakRSSBytes, item.rssBytes); prior.lastState = item.state; }
    }
    report.processHistory = [...history.values()];
  }
  function signalOwnedGroup(signal) {
    if (!child?.pid || groupGone || groupOwnershipLost || !workerIdentity) return false;
    try {
      const sample = resources(); recordSample(sample);
      if (!sample.ownedGroupLiveCount) return true;
      const anchor = sample.ownedProcesses.find(item => live(item) && sameIdentity(item, identities.get(item.pid)));
      assert.ok(anchor, 'NATIVE_SIGNAL_IDENTITY_UNCONFIRMED');
      // Check the same identity immediately before signaling the original
      // spawn-owned group. No discovered PID/group is ever a signal target.
      const current = procStat(anchor.pid);
      assert.ok(sameIdentity(current, anchor) && current.pgrp === child.pid && current.session === child.pid,
        'NATIVE_SIGNAL_IDENTITY_CHANGED');
    } catch (error) {
      fail('NATIVE_SIGNAL_OWNERSHIP_UNCONFIRMED', { errorCode: safeCode(error), classification: failureCode(error) });
      bestEffortSave(); return false;
    }
    const event = { signal, group: child.pid, elapsedMilliseconds: elapsed(), at: new Date().toISOString() };
    report.groupSignals.push(event); bestEffortSave();
    try {
      if (signal === 'SIGTERM' && termAt === null) termAt = elapsed();
      process.kill(-child.pid, signal); event.sent = true;
    } catch (error) {
      event.sent = false; event.errorCode = safeCode(error);
      if (error.code === 'ESRCH') groupGone = true;
      else fail('NATIVE_OWNED_GROUP_SIGNAL_FAILURE', { signal, errorCode: safeCode(error) });
    }
    bestEffortSave(); return event.sent === true || groupGone;
  }
  function escalate() {
    if (finished || groupGone || termAt === null) return;
    const remaining = NATIVE_FLOW_LIMITS.killGraceMilliseconds - (elapsed() - termAt);
    if (remaining > 0) { killTimer = setTimeout(escalate, remaining); return; }
    try { const sample = resources(); recordSample(sample); report.escalationResourceSample = sample; }
    catch (error) { report.escalationSampleError = safeCode(error); }
    signalOwnedGroup('SIGKILL');
  }
  function stop(code, details = {}, measuredSample) {
    fail(code, details);
    if (finished || stopping) { bestEffortSave(); return; }
    stopping = true;
    if (report) report.phase = 'stopping';
    try {
      const sample = measuredSample ?? resources();
      if (!measuredSample) recordSample(sample);
      report.failureResourceSample = sample;
    } catch (error) { if (report) report.failureSampleError = { errorCode: safeCode(error), classification: failureCode(error) }; }
    bestEffortSave();
    if (!child?.pid) { resolveCompletion(); return; }
    signalOwnedGroup('SIGTERM');
    killTimer = setTimeout(escalate, NATIVE_FLOW_LIMITS.killGraceMilliseconds);
    cleanupTimer = setTimeout(() => finalize('NATIVE_CLEANUP_DEADLINE'), NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds);
  }
  function poll() {
    if (finished || finishing || !report) return;
    try {
      const sample = resources(); recordSample(sample);
      const reason = nativeResourceFailure(sample);
      if (reason) stop(reason, {}, sample);
      if (profile === FLOW_PROFILES.nativeIngressV3ProductionPreflight) {
        const forbidden = productionPreflightForbiddenProcess(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if (profile === FLOW_PROFILES.nativeIngressV3Preflight) {
        const forbidden = preflightForbiddenProcess(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if (profile === FLOW_PROFILES.nativeClaimUnfundedHealth) {
        const forbidden = unfundedHealthProcessFailure(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      // Failed proof attempts deliberately retain their lock. That lock is
      // evidence, not an unrelated group we are allowed to stop or clean up.
      if (!stopping && !childExited) { assertHeavyLocks(); assertOtherIntegrationLocks(); }
      if (!bestEffortSave()) stop('NATIVE_EVIDENCE_WRITE_FAILURE', {}, sample);
      if (childExited && sample.ownedGroupLiveCount > 0)
        stop('NATIVE_WORKER_EXITED_WITH_LIVE_DESCENDANTS', {}, sample);
      if (childClosed && sample.ownedGroupLiveCount === 0) resolveCompletion();
    } catch (error) {
      stop('NATIVE_RESOURCE_MONITOR_FAILURE', { errorCode: safeCode(error), classification: failureCode(error) });
    }
  }
  function releaseLock() {
    if (!lockIdentity) return;
    if (child?.pid && (!childClosed || !finalGroupMeasurementSucceeded
      || report?.finalResources?.ownedGroupLiveCount !== 0 || groupOwnershipLost)) {
      if (report) report.lockRetained = true; return;
    }
    try {
      const stat = lstatSync(LOCK), value = JSON.parse(readRegular(LOCK, 4096));
      assert.ok(stat.isFile() && stat.ino === lockIdentity.ino && stat.dev === lockIdentity.dev,
        'NATIVE_LOCK_IDENTITY_CHANGED');
      assert.equal(value.pid, process.pid, 'NATIVE_LOCK_OWNER_CHANGED');
      assert.equal(value.runId, runId, 'NATIVE_LOCK_RUN_CHANGED');
      assert.equal(value.attempt, relative(ROOT, attempt), 'NATIVE_LOCK_ATTEMPT_CHANGED');
      assert.equal(value.supervisorStartTimeTicks, report.supervisorIdentity.startTimeTicks, 'NATIVE_LOCK_START_CHANGED');
      unlinkSync(LOCK); lockIdentity = null; report.lockReleased = true;
    } catch (error) { fail('NATIVE_LOCK_RELEASE_FAILURE', { errorCode: safeCode(error) }); report.lockRetained = true; }
  }
  function finalize(deadlineFailure = null) {
    if (finishing || finished) return;
    finishing = true;
    clearInterval(monitorTimer);
    for (const timer of [reserveTimer, hardTimer, killTimer, cleanupTimer]) clearTimeout(timer);
    if (deadlineFailure) {
      fail(deadlineFailure);
      if (termAt !== null && elapsed() - termAt >= NATIVE_FLOW_LIMITS.killGraceMilliseconds) signalOwnedGroup('SIGKILL');
    }
    if (report) {
      try {
        const sample = resources(); recordSample(sample); report.finalResources = sample;
        finalGroupMeasurementSucceeded = true;
        const reason = nativeResourceFailure(sample); if (reason) fail(reason, { sample });
      } catch (error) { fail('NATIVE_FINAL_RESOURCE_MEASUREMENT_FAILURE', { errorCode: safeCode(error) }); }
      if (!workerSpawned) fail('NATIVE_WORKER_NOT_STARTED');
      else if (!childExited || !childClosed) fail('NATIVE_WORKER_EXIT_OR_CLOSE_NOT_OBSERVED');
      if (profile === FLOW_PROFILES.nativeClaimUnfundedHealth) {
        const forbidden = unfundedHealthProcessFailure([...history.values()]);
        if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.nativeIngressV3ProductionPreflight) {
        const forbidden = productionPreflightForbiddenProcess([...history.values()]); if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.nativeIngressV3Preflight) {
        const forbidden = preflightForbiddenProcess([...history.values()]); if (forbidden) fail(forbidden);
      }
      if (childExited && (report.workerExit.code !== 0 || report.workerExit.signal !== null)) fail('NATIVE_WORKER_EXIT_FAILURE');
      if (childClosed && (report.workerClose.code !== 0 || report.workerClose.signal !== null)) fail('NATIVE_WORKER_CLOSE_FAILURE');
      if (workerSpawned && (!finalGroupMeasurementSucceeded || report.finalResources?.ownedGroupLiveCount !== 0
        || groupOwnershipLost)) fail('NATIVE_OWNED_GROUP_CLEANUP_UNCONFIRMED');
      if (sourcePins) {
        try {
          assert.deepEqual(profile.sourcePins(), sourcePins, 'NATIVE_SOURCE_CLOSURE_CHANGED');
          report.sourceClosureUnchanged = true;
        } catch (error) {
          fail('NATIVE_SOURCE_CLOSURE_CHANGED', { errorCode: safeCode(error), classification: failureCode(error) });
        }
      }
      if (workerSpawned && childClosed) {
        try {
          const bytes = readRegular(resultPath), parsed = JSON.parse(bytes);
          validateResultIdentity(parsed, process.pid, child.pid, profile);
          assert.equal(assertNativeFlowRunId(parsed.runId), runId, 'NATIVE_RESULT_RUN_BINDING');
          assert.deepEqual(parsed.sourcePins, sourcePins, 'NATIVE_RESULT_SOURCE_BINDING');
          const resultMetadata = { runId, path: relative(ROOT, resultPath), bytes: bytes.length, sha256: HASH(bytes) };
          if (parsed.phase === 'failed' && parsed.success === false) {
            report.workerResult = { ...resultMetadata, format: parsed.format, phase: 'failed', success: false,
              errorCode: typeof parsed.errorCode === 'string' && /^[A-Z][A-Z0-9_]{2,160}$/.test(parsed.errorCode)
                ? parsed.errorCode : 'NATIVE_WORKER_REPORTED_UNCLASSIFIED_FAILURE',
              cleanup: Object.fromEntries(['closedEvm', 'closedSolana', 'closedBitcoin']
                .map(key => [key, [true, false, null].includes(parsed.cleanup?.[key]) ? parsed.cleanup[key] : 'unreported'])) };
            fail('NATIVE_WORKER_REPORTED_FAILURE', { classification: report.workerResult.errorCode });
          } else {
            report.workerResult = { ...validateCompletedResult(parsed, process.pid, child.pid, profile), ...resultMetadata };
            report.resultAccepted = !failure;
          }
        } catch (error) {
          fail(!existsSync(resultPath) ? 'NATIVE_WORKER_RESULT_MISSING' : error instanceof SyntaxError
            ? 'NATIVE_WORKER_RESULT_MALFORMED' : 'NATIVE_WORKER_RESULT_REJECTED',
            { errorCode: safeCode(error), classification: failureCode(error) });
        }
      }
      report.output = Object.fromEntries(Object.entries(streams).map(([key, item]) =>
        [key, { bytes: item.bytes, sha256: item.hash.copy().digest('hex') }]));
      report.workerSpawned = workerSpawned; report.workerExitObserved = childExited; report.workerCloseObserved = childClosed;
      report.ownedGroupCleanupConfirmed = finalGroupMeasurementSucceeded
        && report.finalResources.ownedGroupLiveCount === 0 && !groupOwnershipLost;
      report.completedAt = new Date().toISOString(); report.elapsedMilliseconds = elapsed();
      report.withinTotalDeadline = elapsed() < NATIVE_FLOW_LIMITS.totalMilliseconds;
      if (!report.withinTotalDeadline) fail('NATIVE_TOTAL_DEADLINE');
      report.phase = failure ? 'failed' : 'completed';
      // Persist outcome first. An evidence failure preserves the lock so an
      // ambiguous attempt cannot silently be treated as reusable success.
      const saved = bestEffortSave();
      if (saved) releaseLock(); else report.lockRetained = Boolean(lockIdentity);
      report.phase = failure ? 'failed' : 'completed'; report.failure = failure;
      bestEffortSave();
      if (elapsed() >= NATIVE_FLOW_LIMITS.totalMilliseconds) {
        fail('NATIVE_TOTAL_DEADLINE'); report.phase = 'failed'; report.withinTotalDeadline = false; bestEffortSave();
      }
    }
    finished = true; resolveCompletion();
    process.exitCode = failure ? 1 : 0;
    for (const stream of child?.stdio ?? []) stream?.destroy();
    process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
    process.removeListener('uncaughtException', onUncaught); process.removeListener('unhandledRejection', onRejected);
    console.log(JSON.stringify({ phase: report?.phase ?? 'failed', failure,
      runId,
      attempt: attemptCreated ? relative(ROOT, attempt) : null,
      workerFailure: report?.workerResult?.errorCode ?? null,
      resultAccepted: report?.resultAccepted === true, ownedGroupCleanupConfirmed: report?.ownedGroupCleanupConfirmed === true,
      workerExit: report?.workerExit ?? null, workerClose: report?.workerClose ?? null,
      resourceSummary: report?.resourceSummary ?? null }));
    if (deadlineFailure) process.exit(1);
  }
  const onTerm = () => stop('NATIVE_SUPERVISOR_SIGTERM');
  const onInt = () => stop('NATIVE_SUPERVISOR_SIGINT');
  const onUncaught = error => stop('NATIVE_SUPERVISOR_UNCAUGHT_EXCEPTION', { errorCode: safeCode(error), classification: failureCode(error) });
  const onRejected = error => stop('NATIVE_SUPERVISOR_UNHANDLED_REJECTION', { errorCode: safeCode(error), classification: failureCode(error) });

  try {
    assert.equal(process.platform, 'linux', 'NATIVE_LINUX_ONLY');
    assert.equal(process.argv.length, 2, 'NATIVE_NO_CALLER_ARGUMENTS');
    assert.deepEqual(process.execArgv, [], 'NATIVE_NO_NODE_ARGUMENTS');
    assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'NATIVE_NO_NODE_INJECTION');
    assert.equal(realpathSync(ROOT), ROOT, 'NATIVE_REPOSITORY_SYMLINK');
    assert.equal(realpathSync(process.cwd()), ROOT, 'NATIVE_REPOSITORY_CWD_REQUIRED');
    assert.equal(resolve(process.argv[1]), ENTRY, 'NATIVE_EXACT_SUPERVISOR_ENTRY');
    assert.equal(realpathSync(ENTRY), ENTRY, 'NATIVE_ENTRY_SYMLINK');
    assert.equal(NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes, PROOF_LIMITS.availableRAM, 'NATIVE_RAM_POLICY_UNCHANGED');
    assert.equal(NATIVE_FLOW_LIMITS.minimumFreeDiskBytes, PROOF_LIMITS.freeDisk, 'NATIVE_DISK_POLICY_UNCHANGED');
    assert.equal(NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes, PROOF_LIMITS.workerRSS, 'NATIVE_RSS_POLICY_UNCHANGED');
    assert.equal(NATIVE_FLOW_LIMITS.sampleMilliseconds, PROOF_LIMITS.sampleMilliseconds, 'NATIVE_SAMPLE_POLICY_UNCHANGED');
    ensureDirectory(LOCAL, profile);
    assert.equal(existsSync(attempt), false, 'NATIVE_ATTEMPT_ALREADY_EXISTS');
    ensureDirectory(attempt, profile); attemptCreated = true;
    const supervisorIdentity = procStat(process.pid);
    assert.ok(supervisorIdentity, 'NATIVE_SUPERVISOR_IDENTITY');
    report = { format: profile.resourcesFormat,
      classification: profile.classification, phase: 'preflight', startedAt, runId,
      supervisorPID: process.pid, supervisorIdentity, node: process.version, limits: NATIVE_FLOW_LIMITS,
      resourcePolicy: PRIVATE_RESOURCE_POLICY, proofPhaseTimeoutMilliseconds: PROOF_LIMITS.phaseTimeoutMilliseconds,
      environment: CLEAN_ENV, detachedWorker: true, hostLimitsChanged: false,
      timeoutScope: 'one fixed 90-minute flow budget including setup, cleanup and evidence; per-proof budgets unchanged',
      aggregateGroupRSSPolicy: 'measurement only; 3 GiB applies independently to main and each proof worker',
      localOnly: true, fakeFundsOnly: true, publicNetwork: false,
      outputPolicy: 'count and SHA256 only; no raw worker stdout/stderr, argv, environment or witness export',
      samples: 0, peakOwnedGroupLiveCount: 0, resultAccepted: false, failure: null, failures: [], groupSignals: [],
      processHistory: [], resourceSummary: Object.fromEntries(METRICS.map(key =>
        [key, { minimum: Number.MAX_SAFE_INTEGER, maximum: 0 }])) };
    save();
    assert.equal(existsSync(LOCK), false, 'NATIVE_FLOW_LOCK_BUSY');
    assertOtherApplicationLocks();
    lockIdentity = writeExclusive(LOCK, json({ format: profile.lockFormat, pid: process.pid, runId,
      supervisorStartTimeTicks: supervisorIdentity.startTimeTicks, startedAt, attempt: relative(ROOT, attempt) }));
    writeExclusive(join(attempt, 'attempt.json'), json({ format: profile.attemptFormat,
      startedAt, runId, supervisorIdentity, worker: relative(ROOT, WORKER), entry: relative(ROOT, ENTRY),
      limits: NATIVE_FLOW_LIMITS, environment: CLEAN_ENV, localOnly: true, fakeFundsOnly: true, publicNetwork: false }));
    assert.equal(existsSync(WORKER), true, 'NATIVE_WORKER_MISSING');
    assert.equal(realpathSync(WORKER), WORKER, 'NATIVE_WORKER_SYMLINK');
    hardTimer = setTimeout(() => finalize('NATIVE_TOTAL_DEADLINE'), Math.max(0, NATIVE_FLOW_LIMITS.totalMilliseconds - elapsed()));
    reserveTimer = setTimeout(() => stop('NATIVE_DEADLINE_CLEANUP_RESERVE'),
      Math.max(0, NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds - elapsed()));
    const initial = resources(); recordSample(initial); report.initialResources = initial;
    const reason = nativeResourceFailure(initial);
    if (reason) { report.failureResourceSample = initial; fail(reason); }
    assertHeavyLocks();
    assertOtherIntegrationLocks();
    sourcePins = profile.sourcePins();
    writeExclusive(sourcePath, json(sourcePins));
    report.sourcePinsSHA256 = HASH(readRegular(sourcePath)); report.sourcePins = sourcePins;
    save();
    assert.ok(elapsed() < NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds,
      'NATIVE_INITIALIZATION_DEADLINE');
    if (!failure) {
      report.phase = 'starting'; save();
      process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
      process.on('uncaughtException', onUncaught); process.on('unhandledRejection', onRejected);
      child = spawn(process.execPath, [WORKER], { cwd: ROOT, env: CLEAN_ENV, detached: true,
        stdio: ['ignore', 'pipe', 'pipe'] });
      child.once('error', error => stop('NATIVE_WORKER_SPAWN_OR_PROCESS_ERROR', { errorCode: safeCode(error) }));
      child.once('exit', (code, signal) => {
        childExited = true; report.workerExit = { code, signal, elapsedMilliseconds: elapsed() };
        if (code !== 0 || signal !== null) stop('NATIVE_WORKER_EXIT_FAILURE');
        poll();
      });
      child.once('close', (code, signal) => {
        childClosed = true; report.workerClose = { code, signal, elapsedMilliseconds: elapsed() };
        if (code !== 0 || signal !== null) stop('NATIVE_WORKER_CLOSE_FAILURE');
        poll();
      });
      child.once('spawn', () => {
        try {
          workerSpawned = true; workerIdentity = procStat(child.pid);
          assert.ok(workerIdentity && workerIdentity.pgrp === child.pid && workerIdentity.session === child.pid,
            'NATIVE_WORKER_START_IDENTITY');
          identities.set(child.pid, workerIdentity);
          report.workerPID = child.pid; report.workerIdentity = workerIdentity;
          report.ownedProcessGroup = child.pid; report.phase = 'running'; poll();
        } catch (error) { stop('NATIVE_WORKER_IDENTITY_UNOBSERVED', { errorCode: safeCode(error), classification: failureCode(error) }); }
      });
      for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
        stream.on('data', bytes => {
          streams[name].bytes += bytes.length; streams[name].hash.update(bytes);
          report.outputBytes = streams.stdout.bytes + streams.stderr.bytes;
          if (report.outputBytes > NATIVE_FLOW_LIMITS.maximumOutputBytes)
            stop('NATIVE_WORKER_OUTPUT_LIMIT', { observedBytes: report.outputBytes });
        });
        stream.once('error', error => stop('NATIVE_WORKER_OUTPUT_ERROR', { stream: name, errorCode: safeCode(error) }));
      }
      monitorTimer = setInterval(poll, NATIVE_FLOW_LIMITS.sampleMilliseconds);
      await completion;
    }
  } catch (error) {
    fail(failureCode(error), { errorCode: safeCode(error) });
    if (child?.pid && !childClosed) { stop('NATIVE_SUPERVISOR_FAILURE'); await completion; }
  } finally { finalize(); }
  return report;
}
