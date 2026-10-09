import {DEVELOPMENT_BTC_SPL_GRAPH_PROFILE,DEVELOPMENT_BTC_SPL_GRAPH_RESULT} from './development-btc-spl-jupiter-policy-v1.mjs';
import {developmentBtcSplJupiterSourcePinsV1} from './development-btc-spl-jupiter-source-pins-v1.mjs';
import {captureOwnedFlatSolanaSourceForSplV1} from '../../../../packages/backend/src/providers/native-provider.mjs';
import {validateNativeSplClaimBindingTransactionV1,decodeNativeSplInventoryV1,NATIVE_SPL_CUSTODY_V1 as SPL} from '../../../../packages/backend/src/chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
/** Fixed fresh development acceptance, launched by its owned supervisor.
 * Original V3 custody/controller authorities and eight genuine proofs in fresh
 * synthetic state. Neither old private evidence nor legacy gates are resumed. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFlatNativeExecution } from '../../../../packages/backend/src/execution/account/execution/flat-native-execution.mjs';
import { createFlatSystemStateReader } from '../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { DEVELOPMENT_BTC_SOL_GRAPH_PROFILE, DEVELOPMENT_BTC_SOL_GRAPH_RESULT } from './development-btc-sol-graph-policy.mjs';
import { developmentBtcSolGraphSourcePins } from './development-btc-sol-graph-source-pins.mjs';
import { runDevelopmentBtcSolGraphCase,runDevelopmentBtcSplSourceGraphCaseV1, exitAndRedeemDevelopmentBtcSolPayout } from './development-btc-sol-graph-case.mjs';
import { DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS, assertBtcSolGraphProofReceipts, assertBtcSolRecipientWithdrawalTelemetry }
  from './development-btc-sol-graph-proof-evidence.mjs';
import { ROOT, LOCAL, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';
import { hash } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { privateFailureDiagnostic } from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import { createRoleProofClient } from '../../../../packages/proofs/src/jobs/role-client.mjs';
import { NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 }
  from '../../../../packages/proofs/src/native-ingress/metadata/native-ingress-v3-profile.mjs';
import { createOwnedNativeClaimGraphV3Fixture,createOwnedNativeSplClaimGraphFixtureV1 } from '../../fixtures/claims/lifecycle/owned-native-claim-fixture.mjs';
import { createDurableNativeClaimControllerKeeper, createNativeClaimController,
  nativeClaimControllerPrivateFinalAuditTimingV1 }
  from '../../../../packages/backend/src/claims/controller/controller.mjs';
import { claimDomainCommitment } from '../../../../packages/backend/src/claims/protocol/framing.mjs';
import { decodeDepositIntentInputs } from '../../../../packages/backend/src/execution/account/preparation/deposit-intent.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatPortfolioAuthority } from '../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { createNativeClaimPortfolioView } from '../../../../packages/backend/src/claims/operations/portfolio-view.mjs';
import {createOriginalWalletEconomicStateV1} from '../../../../packages/backend/src/accounts/state/original-wallet-economic-state-v1.mjs';
import { createGenericAccountKeeper } from '../../../../packages/engine/src/execution/accounts/generic-account-keeper.mjs';
import { createFlatAccountSession } from '../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { startFlatAccountHttp } from '../../../../packages/backend/src/api/accounts/flat-account-http.mjs';
import { createNativeClaimSession, nativeClaimSessionController, nativeClaimSessionPrivateFailures } from '../../../../packages/backend/src/api/claims/native-claim-session.mjs';
import { startNativeClaimHttp } from '../../../../packages/backend/src/api/claims/native-claim-http.mjs';
import { checkClaimGraphV3Bootstrap, checkClaimGraphV3Inventory } from '../graph/validation/native-claim-graph-v3-nonce-checks.mjs';
import { validateSolanaNonceBindingTransaction } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { DEVELOPMENT_NATIVE_CLAIM_PROFILE, DEVELOPMENT_NATIVE_CLAIM_RESULT } from './development-native-claim-policy.mjs';
import { developmentNativeClaimSourcePins } from './development-native-claim-source-pins.mjs';
import { assertRoleProofReceiptRecords, assertWithdrawalProofTelemetry } from './development-native-claim-proof-evidence.mjs';
import { readDevelopmentNativeClaimReceipts } from './development-native-claim-receipts.mjs';
import { claimOperatorPrivateAuditActivity, claimOperatorPrivateAuditMetrics }
  from '../../../../packages/backend/src/claims/operations/operators.mjs';
import { graphOperatorPrivateAuditActivity }
  from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';

// The only selector is the source-pinned literal entry/worker pair. There is
// no caller profile, pool, factory, witness or proof-backend option.
const graphWorker = join(ROOT, 'integration/claims/development/development-btc-sol-graph-flow.mjs');
const btcToSol = process.argv[1] !== undefined && realpathSync(process.argv[1]) === graphWorker;
const splWorker=join(ROOT,'integration/claims/development/development-btc-spl-jupiter-flow-v1.mjs');
const btcToSpl=process.argv[1]!==undefined&&realpathSync(process.argv[1])===splWorker,withGraph=btcToSol||btcToSpl;
const LOCAL_RUN = btcToSpl?'.local/development-btc-spl-jupiter-v1':btcToSol ? '.local/development-btc-sol-graph-v1' : '.local/development-native-claim-roundtrip-v1';
const selectedAssets = withGraph ? [0] : [0, 1];
const sourcePins = btcToSpl?developmentBtcSplJupiterSourcePinsV1:btcToSol ? developmentBtcSolGraphSourcePins : developmentNativeClaimSourcePins;
const bare = value => value.slice(2);
const code = error => String(error?.message ?? '').match(/\b(?:DEVELOPMENT_CLAIM|CLAIM|SOLANA|BITCOIN|PW|FLAT|NATIVE|ROLE_CLIENT|LOCAL_EVM|COMBINED_OPERATOR)_[A-Z0-9_]+\b/)?.[0]
  ?? 'DEVELOPMENT_CLAIM_FAILED';
export async function runDevelopmentNativeClaimAcceptance() {
  assert.equal(arguments.length, 0, 'DEVELOPMENT_CLAIM_NO_WORKER_OPTIONS');
  assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
  assert.equal(realpathSync(process.argv[1]), btcToSpl?splWorker:btcToSol ? graphWorker : fileURLToPath(import.meta.url));
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT, btcToSpl?'integration/claims/development/run-development-btc-spl-jupiter-flow-v1.mjs':btcToSol ? 'integration/claims/development/run-development-btc-sol-graph-flow.mjs' : 'integration/claims/development/run-development-native-claim-flow.mjs'));
  const lock = JSON.parse(readFileSync(join(ROOT, LOCAL_RUN, 'active.lock')));
  assert.equal(lock.pid, process.ppid); assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, LOCAL_RUN + '/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit'), proofsDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 }); mkdirSync(proofsDirectory, { mode: 0o700 });
  const result = { format: btcToSpl?DEVELOPMENT_BTC_SPL_GRAPH_RESULT:btcToSol ? DEVELOPMENT_BTC_SOL_GRAPH_RESULT : DEVELOPMENT_NATIVE_CLAIM_RESULT,
    profile: btcToSpl?DEVELOPMENT_BTC_SPL_GRAPH_PROFILE:btcToSol ? DEVELOPMENT_BTC_SOL_GRAPH_PROFILE : DEVELOPMENT_NATIVE_CLAIM_PROFILE, runId: lock.runId,
    selectedAssets, startedAt: new Date().toISOString(), phase: 'starting', success: false,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, nativeSelfCustody: false, independentOperators: false,
    nativeProcessRestartEstablished: false, keeperLossRecoveryEstablished: false, graphExecutionEstablished: false,
    fullWalletAcceptance: false, sourcePins: sourcePins(),
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, stages: [], proofs: [], redemptions: [],
    accountRequests: [], claimRequests: [], checks: {}, cleanup: { errors: [], closedController: false, closedKeeper: false },
    disclosure: ['Fresh owned BTC/SOL custody, original controller V4 and registered same-host original operators.',
      'Each original native ingress issues a private custodial claim note; its original EXIT precedes native redemption and discharge.',
      'Native custody and operator processes survive coordinator and keeper restart; process-loss recovery is excluded.',
      'One admitted redemption HTTP response is discarded deliberately, then the original journal is resumed without another native send.',
      btcToSpl?'One original CBTC invoice pays SOL to the same validator; that SOURCE alone wraps to WSOL and swaps through original Jupiter/Orca into a distinct six-decimal USDC custodial note. No prefunded WSOL, relabelled SOL backing or customer key reaches the backend.':btcToSol ? 'One original CBTC invoice pays a separate solver for an explicitly priced SOL delivery; this establishes no asset parity or FX discovery.'
        : 'Original graph peers supply their required current source coverage but perform no economic graph transfer.'] };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const stage = async name => { result.phase = name; result.stages.push({ name, at: new Date().toISOString() }); save();
    process.stdout.write(JSON.stringify({ stage: name }) + '\n'); };
  let fixture, controllerKeeper, controller, accountKeeper, session, http, claimSession, claimHttp, cleanupPromise, interrupted = false;
  const owners = [], handoffs = [], deposits = [], accounts = [], proofClients = {}, ingressProverIdentity = freshFixtureId();
  let loadedSolanaMetrics = null;
  const earlier = new Map([LOCAL, NATIVE_INGRESS_V3_LOCAL].map(local => [local,
    new Set(existsSync(join(local, 'attempts')) ? readdirSync(join(local, 'attempts')) : [])]));
  const collected = new Set();
  const originalLegacyTelemetry = join(GOLDEN, 'evidence/paeg-proof-attempts');
  const earlierLegacyTelemetry = new Set(existsSync(originalLegacyTelemetry) ? readdirSync(originalLegacyTelemetry) : []);
  function retainProof(label, relation, proof) {
    const bytes = Buffer.isBuffer(proof.proof) || proof.proof instanceof Uint8Array ? Buffer.from(proof.proof) : Buffer.from(proof.proof, 'hex');
    const name = String(result.proofs.length + 1).padStart(3, '0') + '-' + label, inputs = fixtureJSON(proof.publicInputs);
    let evidence = proof.evidence ?? proof.metrics ?? null;
    if (relation === 'deposit_intent' || (withGraph && DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS.includes(relation))) {
      assert.match(evidence.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.equal(earlier.get(LOCAL).has(evidence.runId), false, 'DEVELOPMENT_CLAIM_FRESH_D27_ATTEMPT');
      const original = join(LOCAL, 'attempts', evidence.runId), manifestBytes = readFileSync(join(original, 'proof-manifest.json'));
      const manifest = JSON.parse(manifestBytes), resourcesBytes = readFileSync(join(original, 'resources.json')),
        resultBytes = readFileSync(join(original, 'result.json'));
      assert.equal(hash(manifestBytes), evidence.manifestSHA256); assert.equal(manifest.relation, relation);
      assert.equal(manifest.runId, evidence.runId); assert.equal(manifest.jobId, evidence.jobId); assert.equal(manifest.selfVerified, true);
      assert.equal(manifest.keySHA256, evidence.keySHA256); assert.equal(manifest.proofSHA256, hash(bytes));
      assert.equal(hash(readFileSync(join(original, 'proof.bin'))), hash(bytes));
      const originalInputs = readFileSync(join(original, 'public-inputs.json'));
      assert.equal(hash(originalInputs), manifest.publicInputsSHA256); assert.deepEqual(JSON.parse(originalInputs), proof.publicInputs);
      evidence = { ...evidence, ...(relation === 'deposit_intent' ? assertRoleProofReceiptRecords : assertBtcSolGraphProofReceipts)({ relation, runId: evidence.runId, jobId: evidence.jobId,
        manifest, result: JSON.parse(resultBytes), resources: JSON.parse(resourcesBytes),
        proofSHA256: hash(bytes), publicInputsSHA256: hash(originalInputs), manifestSHA256: hash(manifestBytes),
        resultSHA256: hash(resultBytes), resourcesSHA256: hash(resourcesBytes) }) };
    } else if (relation === 'withdraw_balance') {
      assert.match(evidence.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.equal(earlierLegacyTelemetry.has(evidence.id + '.json'), false, 'DEVELOPMENT_CLAIM_FRESH_W39_ATTEMPT');
      const telemetry = readFileSync(join(originalLegacyTelemetry, evidence.id + '.json'));
      evidence = (withGraph && evidence.purpose === 'recipient' ? assertBtcSolRecipientWithdrawalTelemetry : assertWithdrawalProofTelemetry)({ returnedMetrics: evidence, storedMetrics: JSON.parse(telemetry),
        proofSHA256: hash(bytes), publicInputsSHA256: hash(JSON.stringify(proof.publicInputs)), telemetrySHA256: hash(telemetry) });
    }
    writeFileSync(join(proofsDirectory, name + '.bin'), bytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(proofsDirectory, name + '.inputs.json'), inputs, { flag: 'wx', mode: 0o600 });
    result.proofs.push({ relation, file: name, proofSHA256: hash(bytes), publicInputsSHA256: hash(inputs),
      evidence }); save();
  }
  async function audit() {
    if (fixture?.runtime) writeFixturePrivate(join(privateDirectory, 'evm.json'), { metadata: fixture.runtime.metadata,
      transactions: fixture.runtime.transactions, receipts: fixture.runtime.receipts });
    for (const [name, native] of [['bitcoin', fixture?.bitcoin], ['solana', fixture?.solana],
      ...(withGraph ? [['graph-bitcoin', fixture?.graphBitcoin], ['graph-solana', fixture?.graphSolana]] : [])]) if (native)
      writeFixturePrivate(join(privateDirectory, name + '.json'), { metadata: native.metadata, transfers: native.transfers });
    for (const [local, previous] of earlier) for (const id of (existsSync(join(local, 'attempts')) ? readdirSync(join(local, 'attempts')) : [])) {
      if (previous.has(id) || collected.has(id)) continue;
      const path = join(local, 'attempts', id, 'proof-manifest.json'); if (!existsSync(path)) continue;
      const manifestBytes = readFileSync(path), manifest = JSON.parse(manifestBytes);
      if (!['native_claim_ingress','native_claim_ingress_v3', 'native_claim_discharge'].includes(manifest.relation)) continue;
      assert.equal(manifest.selfVerified, true);
      if (manifest.relation === 'native_claim_ingress_v3') {
        assert.equal(local, NATIVE_INGRESS_V3_LOCAL); assert.equal(manifest.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION);
        assert.equal(manifest.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
      } else if(manifest.relation==='native_claim_ingress'){assert.equal(btcToSpl,true,'SPL_ORIGINAL_V1_INGRESS_SCOPE');assert.equal(local,LOCAL);assert.equal(manifest.sourceVersion,'c13d5cc0e1be06158727cf933013492fe44efe987d09e4dee9bb9216c04fb418');assert.equal(manifest.keySHA256,fixture.claims.verifiers.CI51.lineage.keySHA256,'SPL_ACTUAL_DEPLOYED_CI51_V1_KEY');}
      else { assert.equal(local, LOCAL); assert.equal(manifest.keySHA256, '0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83'); }
      const proof = readFileSync(join(local, 'attempts', id, 'proof.bin')), inputs = readFileSync(join(local, 'attempts', id, 'public-inputs.json'));
      assert.equal(hash(proof), manifest.proofSHA256); assert.equal(hash(inputs), manifest.publicInputsSHA256);
      const resultBytes = readFileSync(join(local, 'attempts', id, 'result.json')), resourcesBytes = readFileSync(join(local, 'attempts', id, 'resources.json'));
      const receipt = assertRoleProofReceiptRecords({ relation: manifest.relation, runId: id, jobId: manifest.jobId,
        manifest, result: JSON.parse(resultBytes), resources: JSON.parse(resourcesBytes), proofSHA256: hash(proof),
        publicInputsSHA256: hash(inputs), manifestSHA256: hash(manifestBytes), resultSHA256: hash(resultBytes), resourcesSHA256: hash(resourcesBytes) });
      collected.add(id); retainProof(manifest.relation + '-' + id, manifest.relation, { proof, publicInputs: JSON.parse(inputs),
        evidence: receipt });
    }
    save();
  }
  async function openController() { controller = await createNativeClaimController({ runtime: fixture.runtime, claims: fixture.claims,
    observer: fixture.observer, operators: fixture.operators, quorum: fixture.quorum, proofClients,
    keeper: controllerKeeper, ingressProverIdentity }); }
  async function cleanup() {
    cleanupPromise ??= (async () => {
      const close = async (name, work) => { try { await work(); return true; } catch (error) { result.cleanup.errors.push({ name, code: code(error) }); return false; } };
      for (const account of accounts) await close('abortAccountAuthority', () => account.abort());
      if (claimHttp) await close('claimHttp', () => claimHttp.close()); else if (claimSession) await close('claimSession', () => claimSession.close());
      if (http) await close('accountHttp', () => http.close()); else if (session) await close('accountSession', () => session.close());
      else if (accountKeeper) await close('accountKeeper', () => accountKeeper.close());
      for (const account of accounts) await close('accountAuthority', () => account.close());
      if (controller) result.cleanup.closedController = await close('controller', async () => { controller.close();
        assert.equal(controllerKeeper.status().controllerOpen, false); });
      if (controllerKeeper) result.cleanup.closedKeeper = await close('controllerKeeper', async () => { await controllerKeeper.close();
        assert.equal(controllerKeeper.status().closed, true); assert.equal(controllerKeeper.status().keeperProcessExited, true); });
      for (const [role, client] of Object.entries(proofClients)) await close(role, async () => { client.stop(); client.close(); });
      if (fixture) await close('fixture', async () => { Object.assign(result.cleanup, await fixture.close());
        for (const name of ['closedEvm', 'closedBitcoin', 'closedSolana']) assert.equal(result.cleanup[name], true);
        for (const name of ['owners', 'resources', 'operators']) assert.ok(result.cleanup[name].every(row => row.closed === true));
        result.cleanup.evmScratch = await fixture.runtime.close({ removeScratch: true });
        assert.equal(result.cleanup.evmScratch.scratchRemoved, true);
        assert.equal(result.cleanup.bitcoin.result.syntheticWalletsAndLedgerRemoved, true); assert.equal(result.cleanup.bitcoin.result.forced, false);
        assert.equal(result.cleanup.solana.result.syntheticKeysAndLedgerRemoved, true); assert.equal(result.cleanup.solana.result.forced, false); });
      return result.cleanup;
    })(); return cleanupPromise;
  }
  const stop = () => { if (interrupted) return; interrupted = true; for (const client of Object.values(proofClients)) client.stop();
    result.errorCode = 'DEVELOPMENT_CLAIM_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN'; result.success = false;
    void audit().catch(() => {}).then(cleanup).finally(() => { result.phase = 'failed'; save(); process.exit(2); }); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  async function confirmOriginal(operationId) {
    const original = await controller.privateNativeReceipt({ operationId }); assert.equal(original.broadcastAttempts, 1);
    if (original.family === '1') await fixture.bitcoin.confirm(original.nativeId);
    else assert.equal((await fixture.solana.observe(original.nativeId)).status, 'observed');
    return original;
  }
  async function accountRequest(action, body = {}) {
    const response = await fetch(http.origin + '/api/flat-account/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: http.origin, 'x-flat-account-token': http.clientAccess.token }, body: JSON.stringify(body) });
    assert.equal(response.status, 202); assert.equal((await response.json()).admitted, true);
    const view = await session.idle(); result.accountRequests.push({ action, requestId: body.requestId ?? null, via: 'ORIGINAL_FLAT_ACCOUNT_HTTP' }); save(); return view;
  }
  async function ownerView() { const response = await fetch(http.origin + '/api/flat-account/owner', {
    headers: { Origin: http.origin, 'x-flat-owner-token': http.ownerAccess.token } }); assert.equal(response.status, 200); return response.json(); }
  async function claimOwnerView() { const response = await fetch(claimHttp.origin + '/api/native-claims/owner', {
    headers: { Origin: claimHttp.origin, 'x-native-owner-token': claimHttp.ownerAccess.token } }); assert.equal(response.status, 200); return response.json(); }
  // Copies from original private brands only. This never enters an observer,
  // clock, key, journal or current/audit operation and never waits for busy work.
  function loadedSolanaSnapshot() {
    const snapshot = { incomplete: false, claim: [], graph: [] };
    const pick = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field]]));
    const activityFields = ['schema', 'epochScope', 'keyUseEpoch', 'originalHistoriesMeasured',
      'totalKeyInvocationsMeasured', 'authorizationCount', 'signedAuthorizationCount',
      'factCount', 'signedFactCount', 'busy', 'branchClosed', 'branchPoisoned', 'custodyClosed', 'custodyPoisoned'];
    const reportFields = ['schema', 'operationOrdinal', 'wallMilliseconds', 'processUserMicroseconds',
      'processSystemMicroseconds', 'cpuScope', 'wallScope', 'wholeOperationScope', 'finalizationScope',
      'postFenceSamplingAndRetirementNotBudgeted', 'nonCustodyObserverSeparatePhaseNotMeasured',
      'incomplete', 'truncated', 'peakActiveIntervals', 'rpcCounts', 'keyUsageMeasured'];
    const labelFields = ['phase', 'method', 'round', 'invocations', 'measuredIntervals', 'wallMilliseconds',
      'maximumWallMilliseconds', 'processUserMicroseconds', 'processSystemMicroseconds'];
    for (let index = 0; index < 4; index++) {
      const row = { index, activity: null, metrics: null }, graph = { index, activity: null };
      try {
        row.activity = pick(claimOperatorPrivateAuditActivity(fixture.operators[index]),
          [...activityFields, 'retainedBindingCount']);
      } catch { snapshot.incomplete = true; }
      try {
        const metrics = claimOperatorPrivateAuditMetrics(fixture.operators[index]);
        row.metrics = { schema: metrics.schema, collectionIncomplete: metrics.collectionIncomplete,
          reports: metrics.reports.slice(0, 8).map(report => ({ ...pick(report, reportFields),
            labels: report.labels.slice(0, 32).map(label => pick(label, labelFields)) })) };
        if (metrics.collectionIncomplete || metrics.reports.length > 8
          || metrics.reports.some(report => report.labels.length > 32)
          || row.metrics.reports.some(report => report.incomplete || report.truncated)) snapshot.incomplete = true;
      } catch { snapshot.incomplete = true; }
      try { graph.activity = pick(graphOperatorPrivateAuditActivity(fixture.graphOperators[index]), activityFields); }
      catch { snapshot.incomplete = true; }
      if (row.activity?.busy !== false || graph.activity?.busy !== false) snapshot.incomplete = true;
      snapshot.claim.push(row); snapshot.graph.push(graph);
    }
    return snapshot;
  }
  function retainPrepositionFailureMetrics() {
    if (!btcToSpl || !fixture?.operators || !controller
      || !['original-native-ingress-and-private-issuance-0', 'original-native-ingress-and-private-issuance-1'].includes(result.failedStage)) return;
    // Getter-only copies of already retained private samples. Never reenter
    // current/audit/RPC/journal reads or replace the original operation error.
    try {
      const snapshot = loadedSolanaSnapshot();
      const finalAudit = nativeClaimControllerPrivateFinalAuditTimingV1(controller);
      writeFixturePrivate(join(privateDirectory, 'claim-preposition-private-metrics-v1.json'), {
        schema: 'DEVELOPMENT_CLAIM_PREPOSITION_PRIVATE_METRICS_V1', snapshot, finalAudit });
    } catch { /* Diagnostic loss never changes outcome or prevents cleanup. */ }
  }
  function retainLoadedSolanaMetrics(postIdle, requestId) {
    if (!loadedSolanaMetrics || loadedSolanaMetrics.after !== null) return;
    try {
      const after = loadedSolanaSnapshot();
      loadedSolanaMetrics.after = after;
      loadedSolanaMetrics.postIdle = postIdle;
      loadedSolanaMetrics.incomplete ||= !postIdle || after.incomplete;
      loadedSolanaMetrics.newReports = after.claim.map((row, index) => {
        const before = loadedSolanaMetrics.before.claim[index].metrics;
        let baselineOrdinal = before ? before.reports.at(-1)?.operationOrdinal ?? -1 : null;
        if (baselineOrdinal !== null && (!Number.isSafeInteger(baselineOrdinal) || baselineOrdinal < -1)) baselineOrdinal = null;
        const reports = row.metrics?.reports.filter(report => baselineOrdinal === null || report.operationOrdinal > baselineOrdinal) ?? [];
        let missingReports = baselineOrdinal === null ? null : 0;
        let expected = baselineOrdinal === null ? null : baselineOrdinal + 1;
        for (const report of reports) {
          if (!Number.isSafeInteger(report.operationOrdinal) || report.operationOrdinal < 0
            || expected !== null && report.operationOrdinal < expected) {
            loadedSolanaMetrics.incomplete = true; missingReports = null;
          } else if (expected !== null && missingReports !== null) missingReports += report.operationOrdinal - expected;
          expected = report.operationOrdinal + 1;
        }
        if (missingReports === null || missingReports > 0 || !row.metrics) loadedSolanaMetrics.incomplete = true;
        return { index, baselineOrdinal, missingReports, reportOrdinals: reports.map(report => report.operationOrdinal) };
      });
      loadedSolanaMetrics.failures = nativeClaimSessionPrivateFailures(claimSession)
        .filter(failure => failure.requestId === requestId).slice(-8).map(failure => ({
          code: failure.code, causeCode: failure.causeCode, causeCodes: failure.causeCodes,
          ...(failure.auditBudget ? { auditBudget: failure.auditBudget } : {}) }));
      writeFixturePrivate(join(privateDirectory, 'loaded-solana-redemption-metrics-v1.json'), loadedSolanaMetrics);
    } catch { loadedSolanaMetrics.incomplete = true; loadedSolanaMetrics.retentionFailed = true; }
  }
  async function claimRequest(action, body, discard = false) {
    const captureSolana = !btcToSol && action === 'redeem'
      && body.requestId === 'development_native_redemption_1' && loadedSolanaMetrics === null;
    if (captureSolana) {
      const before = loadedSolanaSnapshot();
      loadedSolanaMetrics = { schema: 'DEVELOPMENT_LOADED_SOLANA_REDEMPTION_METRICS_V1',
        authority: 'PRIVATE_DIAGNOSTIC_ONLY', totalKeyInvocationsMeasured: false, rpcCounts: null,
        before, after: null, newReports: [], failures: [], postIdle: false, incomplete: before.incomplete };
    }
    try {
      const response = await fetch(claimHttp.origin + '/api/native-claims/' + action, { method: 'POST', headers: {
        'Content-Type': 'application/json', Origin: claimHttp.origin, 'x-native-claim-token': claimHttp.clientAccess.token }, body: JSON.stringify(body) });
      assert.equal(response.status, 202);
      if (discard) { await response.body.cancel(); result.checks.admittedResponseDiscarded = true; }
      else { const admission = await response.json(); assert.equal(admission.admitted, true); assert.equal(admission.requestId, body.requestId); }
      const view = await claimSession.idle();
      if (captureSolana) retainLoadedSolanaMetrics(true, body.requestId);
      controller = nativeClaimSessionController(claimSession);
      const request = view.requests.find(row => row.requestId === body.requestId); assert.ok(request);
      const privateDiagnostics = nativeClaimSessionPrivateFailures(claimSession).filter(value => value.requestId === body.requestId);
      if (privateDiagnostics.length) writeFixturePrivate(join(privateDirectory, 'claim-failure-' + body.requestId + '.json'),
        { requestId: body.requestId, action, failures: privateDiagnostics });
      result.claimRequests.push({ action, requestId: body.requestId, state: request.state, errorCode: request.errorCode,
        ...(privateDiagnostics.length ? { privateDiagnostics } : {}),
        via: 'ORIGINAL_NATIVE_CLAIM_HTTP', admissionResponseDiscarded: discard }); save(); return request;
    } finally { if (captureSolana) retainLoadedSolanaMetrics(false, body.requestId); }
  }
  try {
    save(); fixture = await (btcToSpl?createOwnedNativeSplClaimGraphFixtureV1:createOwnedNativeClaimGraphV3Fixture)(privateDirectory, { onStage: stage, onDeployment: audit });
    const { runtime, claims, system } = fixture, amounts = withGraph ? ['100000', '0'] : ['100000', '3000000'];
    await stage('registered-original-v4-quorum-before-funds');
    assert.equal(fixture.quorum.authorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4');
    for (const poolIndex of [0, 1]) { const checkpoint = await fixture.graphQuorum.checkpoint({ poolIndex, requestId: freshFixtureId() });
      const health = await fixture.graphQuorum.health({ poolIndex }); assert.deepEqual(checkpoint.head, health.head); }
    assert.equal(result.proofs.length, 0); assert.equal(fixture.owners.length, 0);
    for (const native of [fixture.bitcoin, fixture.solana, fixture.graphBitcoin, fixture.graphSolana]) assert.equal(native.transfers.length, 0);
    result.checks.registeredOriginalQuorumPreflight = true;
    const initialNative = [await fixture.bitcoin.inventory(), await fixture.solana.inventory()];
    if(btcToSpl){assert.equal(claims.nativeSplCustodyProfile,true);assert.equal(claims.registeredRules.length,3);assert.equal(claims.nativeRuntimes.length,2);assert.equal(initialNative[1].escrow.total,'0');const backing=decodeNativeSplInventoryV1(initialNative[1].spl);assert.equal(backing.nativePrincipalAvailable,'0');assert.equal(backing.nativePrincipalReserved,'0');assert.equal(initialNative[1].accounts.find(row=>row.role==='depositor').total,'0');assert.equal(initialNative[1].accounts.find(row=>row.role==='recipient').total,'0');result.checks.distinctUsdcSixDecimalBootstrap=true;}
    else {result.nonceInfrastructure = checkClaimGraphV3Bootstrap(initialNative[1], fixture.solana, claims.configs[1]);result.checks.dualNonceInfrastructureExcluded=true;} writeFixturePrivate(join(privateDirectory, 'initial-native.json'), initialNative);
    controllerKeeper = await createDurableNativeClaimControllerKeeper({ runtime, claims, path: join(privateDirectory, 'controller.v3'), password: freshFixtureId() });
    for (const role of ['claim_ingress', 'claim_discharge']) proofClients[role] = createRoleProofClient(role);
    await openController();
    async function issueOriginalNative(index){
      await stage('original-native-ingress-and-private-issuance-' + index);
      const owner = owners[index]??await fixture.createOwner(index, 'asset-' + index); owners[index] = owner;
      await owner.owner.prepareDepositIntent({ amount: amounts[index], validFrom: String(await runtime.time()),
        validUntil: String((await runtime.time()) + 86400n), exitRecipient: bare(runtime.accounts[index + 3]) });
      const proof = await owner.ownerProof.proveDepositIntent(); retainProof('asset-' + index + '-D27', 'deposit_intent', proof);
      const statement = decodeDepositIntentInputs(proof.publicInputs), handoff = await owner.owner.createNativeClaimIngressHandoff({
        claimDomain: claimDomainCommitment(claims.configs[index]), ingressProverIdentity, statement }); handoffs[index] = handoff;
      const prepared = await controller.prepare({ handoff }); deposits[index] = prepared;
      await controller.preposition({ intentId: prepared.intentId }); await owner.suspend();
      assert.equal(owner.report().available, false); assert.equal(owner.report().childExited, true);
      await controller.ingress({ intentId: prepared.intentId }); await confirmOriginal(prepared.intentId);
      const issued = await controller.issue({ intentId: prepared.intentId, handoff }); assert.equal(issued.status, 'ISSUED');
      assert.equal(owner.report().available, false); await audit();
      await owner.restart(); await owner.owner.reconcileDepositIntent(issued.submission);
      const count = runtime.transactions.length; await owner.owner.reconcileDepositIntent(issued.submission); assert.equal(runtime.transactions.length, count);
    }
    for(const index of selectedAssets)await issueOriginalNative(index);
    result.checks.ownerOfflineNativeIngress = true; result.checks.originalNotesCreditedOnce = true;
    await stage('clean-original-keeper-and-controller-restart');
    const countsBeforeRestart = [runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.solana.transfers.length];
    const nativeReceipts = withGraph ? [await controller.privateNativeReceipt({ operationId: deposits[0].intentId })]
      : await readDevelopmentNativeClaimReceipts(controller, deposits.map(value => value.intentId));
    const previousKeeperPid = controllerKeeper.status().keeperProcessId; controller.close(); controller = null;
    await controllerKeeper.restart(); await openController(); await controller.reconcileAll({});
    assert.notEqual(controllerKeeper.status().keeperProcessId, previousKeeperPid);
    assert.equal(controllerKeeper.status().storageRecovery.openedFromDisk, true);
    assert.equal(controllerKeeper.status().requiresExternalEffectReconciliation, false);
    for (const index of selectedAssets) assert.deepEqual(await controller.privateNativeReceipt({ operationId: deposits[index].intentId }), nativeReceipts[index]);
    assert.deepEqual([runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.solana.transfers.length], countsBeforeRestart);
    result.checks.cleanKeeperRestartNoSend = true;
    let graphExecution = null, graphCase = null;
    if (withGraph) {
      // The empty native owner owner exists only for the original two-pool portfolio;
      // no SOL custody deposit or private SOL note is synthesized.
      owners[1] = await fixture.createOwner(1, btcToSpl?'empty-usdc-portfolio':'empty-sol-portfolio');
      graphExecution = await createFlatNativeExecution({ runtime, system, poolIndex: 0,
        bitcoin: fixture.graphBitcoin, solana: fixture.graphSolana, quorum: fixture.graphQuorum }, {
        onStage: async event => stage('original-btc-sol-' + event.stage),
        onProof: async event => retainProof('btc-sol-' + event.label, event.relation, event.proof), onPrivateAudit: audit });
      fixture.resources.push(graphExecution);
    }
    for (const index of [0, 1]) accounts.push(await createFlatAccountAuthority({ runtime, system, poolIndex: index, owner: owners[index],
      nativeExecution: index === 0 ? graphExecution : null,
      accountId: 'development_claim_' + index, journalId: 'development_claim_journal_' + index }, {
      onProof: async ({ label, relation, proof }) => retainProof('asset-' + index + '-' + label, relation, proof), onPrivateAudit: audit,
      onStage: async event => {
        if (withGraph && event.stage === 'OWNER_SUSPENDED_BEFORE_NATIVE') {
          assert.equal(index, 0); assert.equal(owners[0].report().available, false);
          assert.equal(owners[0].report().childExited, true);
          assert.equal(fixture.graphSolana.transfers.length, 0); assert.equal(fixture.graphBitcoin.transfers.length, 0);
          result.checks.ownerAbsentBeforeAnyNativeGraphSend = true; await stage('original-btc-owner-absent-before-native');
        }
      } }));
    const portfolio = createFlatPortfolioAuthority({ runtime, system, accounts: accounts.map((account, poolIndex) => ({ account, poolIndex })),
      accountId: 'fresh_private_native_claims', journalId: 'fresh_private_native_claim_journal' });
    accountKeeper = await createGenericAccountKeeper({ config: portfolio.config, journal: { path: join(privateDirectory, 'account.vault'), password: freshFixtureId() }, authority: portfolio.authority });
    const portfolioView = createNativeClaimPortfolioView({ runtime, claims, observer: fixture.observer, quorum: fixture.quorum, portfolio });
    session = await createFlatAccountSession({ keeper: accountKeeper, ownerHandoff: { ownerView: portfolioView } });
    const economicState=await createOriginalWalletEconomicStateV1({catalogues:[],nativeAccounts:[],wrappedPortfolios:[],
      claimPortfolios:[{runtime,view:portfolioView,session}],journal:{path:join(privateDirectory,'native-claim-observations.vault'),password:freshFixtureId()}}); http = await startFlatAccountHttp({ session, port: 0, economicState });
    const originalEconomicResponse=await fetch(http.origin+'/api/flat-account/economic-state',{headers:{Origin:http.origin,'x-flat-owner-token':http.ownerAccess.token}});
    assert.equal(originalEconomicResponse.status,200);const originalEconomic=await originalEconomicResponse.json();
    assert.equal(originalEconomic.capabilities.underlyingCredit,false);
    assert.deepEqual(originalEconomic.rows.map(row=>row.asset.symbol),portfolio.registry.map(asset=>asset.symbol));
    assert.ok(originalEconomic.rows.every(row=>row.component==='NATIVE_CLAIM'));
    const funded = await ownerView(); assert.equal(funded.status, 'LIVE'); assert.equal(funded.coherent, true);
    assert.deepEqual(funded.assets.map(asset => asset.balances.available), amounts);
    const restartCount = runtime.transactions.length; await accountRequest('restart');
    for (const owner of owners) { await owner.suspend(); await owner.restart(); }
    assert.deepEqual((await ownerView()).assets.map(asset => asset.balances.available), amounts); assert.equal(runtime.transactions.length, restartCount);
    result.checks.ownerChildAndCoordinatorRestartNoSend = true;
    if (withGraph) {
      graphCase = await (btcToSpl?runDevelopmentBtcSplSourceGraphCaseV1:runDevelopmentBtcSolGraphCase)({ fixture, owner: owners[0], account: accounts[0], execution: graphExecution,
        request: accountRequest, ownerView, stage, audit, onProof: async event => retainProof('btc-sol-' + event.label, event.relation, event.proof), privateDirectory });
      result.graph = graphCase.report; result.graphExecutionEstablished = true;
    }
    if(btcToSpl){
      await stage('original-source-sol-wrap-before-spl-ingress');const sourceToken=await captureOwnedFlatSolanaSourceForSplV1(graphCase.sourceProvider);await fixture.solana.bindOriginalSourceV1(sourceToken);
      amounts[1]=await fixture.solana.quoteOriginalDepositAmountV1();assert.match(amounts[1],/^[1-9][0-9]*$/);selectedAssets.push(1);
      await issueOriginalNative(1);await accountRequest('restart');const credited=await ownerView();assert.deepEqual(credited.assets.map(asset=>asset.balances.available),['80000',amounts[1]]);
      const usdc=credited.nativeClaims[1];assert.equal(usdc.nativeAssetKind,'SOLANA_SPL_USDC');assert.equal(usdc.nativeSymbol,'USDC');assert.equal(usdc.availablePrivateClaims,amounts[1]);assert.equal(usdc.underlyingSpendable,false);assert.equal(usdc.decimals,6);assert.equal(usdc.mint,SPL.mint);
      const native=await fixture.solana.inventory(),funds=decodeNativeSplInventoryV1(native.spl);assert.equal(funds.nativePrincipalAvailable,amounts[1]);assert.equal(funds.nativePrincipalReserved,'0');
      const record=fixture.solana.transfers[0],wire=validateNativeSplClaimBindingTransactionV1(record.nativeWire,record.intent);assert.equal(record.intent.operation,'deposit');assert.equal(record.intent.amount,amounts[1]);assert.equal(wire.signatureHex,record.nativeId);assert.equal(record.phase,'OBSERVED_FINALIZED');assert.equal(record.broadcastAttempts,1);assert.equal(native.accounts.find(row=>row.role==='depositor').total,record.observation.surplusReturned);assert.equal(BigInt(record.observation.actualOutputReceived),BigInt(amounts[1])+BigInt(record.observation.surplusReturned));
      result.spl={asset:'USDC',wrapper:'cUSDC',decimals:6,mint:SPL.mint,custodyProgram:SPL.program,assetCommitment:claims.configs[1].nativeAsset,custodyDomain:claims.configs[1].custodyInventoryDomain,principal:amounts[1],sourceLamports:'10000000',sourceOriginalNativeId:fixture.graphSolana.transfers[0].nativeId,sourceOriginalTransactionSHA256:fixture.graphSolana.transfers[0].transactionSHA256,depositNativeId:record.nativeId,depositTransactionSHA256:record.transactionSHA256,actualInputSpent:record.observation.actualInputSpent,actualOutputReceived:record.observation.actualOutputReceived,publicSurplusReturned:record.observation.surplusReturned,initialPrincipal:'0',distinctSolFeeReserve:true,originalV1VerifierKeySHA256:claims.verifiers.CI51.lineage.keySHA256};
      result.checks.originalSourceOnlyWrapped=true;result.checks.originalJupiterSwapCreditedOnce=true;result.checks.originalUsdcOwnerUpdated=true;await audit();
    }
    for (const index of selectedAssets) {
      await stage('original-private-exit-and-native-redemption-' + index);
      const exitId = 'development_native_exit_' + index, exitRef = freshFixtureId();
      const exitRole = withGraph&&index===0 ? 'change' : 'source', exitAmount = withGraph&&index===0 ? '80000' : amounts[index];
      await owners[index].owner.prepareWithdrawal({ role: exitRole, epoch: String((await runtime.time()) / 600n) });
      await accounts[index].ownerActions.registerExit(exitRef, exitRole);
      await accountRequest('prepare', { requestId: exitId, kind: 'EXIT', ownerOperationRef: exitRef, assetId: accounts[index].assetId });
      const exit = await accountRequest('execute', { requestId: exitId }); assert.equal(exit.requests.find(row => row.requestId === exitId)?.state, 'CONFIRMED');
      const duplicateExitCount = runtime.transactions.length; await accountRequest('execute', { requestId: exitId }); assert.equal(runtime.transactions.length, duplicateExitCount);
      claimSession = await createNativeClaimSession({ controller, accountId: 'development_native_claim_' + index,
        ownerIdentitySHA256: handoffs[index].select().ownerIdentitySHA256, claimDomain: claimDomainCommitment(claims.configs[index]), caller: runtime.accounts[index + 3] });
      claimHttp = await startNativeClaimHttp({ session: claimSession, port: 0 });
      const redemption = { requestId: 'development_native_redemption_' + index, amount: exitAmount, maxFee: claims.configs[index].refundMaxFee };
      let reply = await claimRequest('redeem', redemption, index === 0), view = await claimOwnerView();
      assert.equal(view.tickets.length, 1); const ticket = view.tickets[0]; assert.equal(ticket.kind, 'REDEEM'); assert.equal(ticket.amount, exitAmount);
      if (reply.state !== 'CONFIRMED') {
        if (withGraph && reply.errorCode !== null && reply.errorCode !== 'CLAIM_NATIVE_FINALITY_UNRESOLVED') {
          writeFixturePrivate(join(privateDirectory, 'btc-sol-original-redemption-failure.json'), {
            reply, ticket, originalControllerStatus: await controller.status(), nativeRecords: fixture.bitcoin.transfers });
          // Preserve an original audit/authorization failure; a finality label
          // cannot grant permission to resume or refresh its signing fence.
          throw new Error(reply.errorCode);
        }
        assert.equal(reply.state, 'RECONCILIATION_REQUIRED');
        assert.ok(reply.errorCode === null || reply.errorCode === 'CLAIM_NATIVE_FINALITY_UNRESOLVED',
          reply.errorCode ?? 'DEVELOPMENT_CLAIM_REDEMPTION_OUTCOME_UNRESOLVED');
        assert.equal((await controller.privateNativeReceipt({ operationId: ticket.ticketId })).broadcastAttempts, 1);
        await confirmOriginal(ticket.ticketId); reply = await claimRequest('resume', { requestId: redemption.requestId }); }
      assert.equal(reply.state, 'CONFIRMED', reply.errorCode); view = await claimOwnerView();
      assert.equal(view.tickets.find(row => row.ticketId === ticket.ticketId)?.status, 'DISCHARGED'); await audit();
      const settledCounts = [runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.solana.transfers.length];
      assert.equal((await claimRequest('redeem', redemption)).state, 'CONFIRMED');
      assert.equal((await claimRequest('resume', { requestId: redemption.requestId })).state, 'CONFIRMED');
      assert.equal((await controller.reconcile({ operationId: ticket.ticketId })).status, 'DISCHARGED');
      assert.deepEqual([runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.solana.transfers.length], settledCounts);
      result.redemptions.push({ assetIndex: index, amount: exitAmount, role: exitRole, status: 'DISCHARGED', duplicateNoEffect: true });
      await claimHttp.close(); claimHttp = null; claimSession = null;
    }
    if (withGraph) {
      await exitAndRedeemDevelopmentBtcSolPayout({ fixture, graphCase, controller, stage, audit,
        onProof: async event => retainProof(event.label, event.relation, event.proof), confirmOriginal, privateDirectory });
      result.redemptions.push({ assetIndex: 0, amount: '20000', role: 'solver', status: 'DISCHARGED', duplicateNoEffect: true });
    }
    Object.assign(result.checks, { originalPrivateExitViaHttp: true, originalRedemptionViaHttp: true, originalJournalResumeNoSend: true });
    const final = await fixture.observer.read(); await fixture.observer.assertCurrent(final);
    result.finalClaimState = final.gateways.map(gateway => Object.fromEntries(['wrapperSupply', 'pendingRedemptions', 'pendingRefunds',
      'heldUnissued', 'reservedFees', 'intentCount', 'ticketCount'].map(name => [name, gateway[name]])));
    for (const gateway of final.gateways) { for (const name of ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees']) assert.equal(gateway[name], '0');
      assert.equal(gateway.activePayout, '0'.repeat(64)); }
    const finalPortfolio = await ownerView(); assert.equal(finalPortfolio.status, 'LIVE');
    assert.deepEqual(finalPortfolio.assets.map(asset => asset.balances.available), ['0', '0']);
    const finalNative = [await fixture.bitcoin.inventory(), await fixture.solana.inventory()];
    writeFixturePrivate(join(privateDirectory, 'final-native.json'), finalNative);
    for (const index of [0, 1]) assert.equal(BigInt(finalNative[index].accounts.find(row => row.role === 'recipient').total)
      - BigInt(initialNative[index].accounts.find(row => row.role === 'recipient').total), BigInt(amounts[index]));
    if(btcToSpl){const funds=decodeNativeSplInventoryV1(finalNative[1].spl);assert.equal(funds.nativePrincipalAvailable,'0');assert.equal(funds.nativePrincipalReserved,'0');assert.equal(funds.nativePrincipalFree,'0');assert.ok(BigInt(funds.feeReserveAvailable)>0n);assert.deepEqual(fixture.solana.transfers.map(row=>row.route),['deposit','redeem']);for(const row of fixture.solana.transfers){const wire=validateNativeSplClaimBindingTransactionV1(row.nativeWire,row.intent);assert.equal(wire.signatureHex,row.nativeId);assert.equal(wire.transactionSHA256,row.transactionSHA256);assert.equal(row.phase,'OBSERVED_FINALIZED');assert.equal(row.broadcastAttempts,1);assert.equal(row.observation.nativeWire,row.nativeWire);assert.equal(row.intent.amount,amounts[1]);}result.spl.finalPrincipal='0';result.spl.finalReserved='0';result.spl.finalFeeReserve=funds.feeReserveAvailable;result.spl.finalRecipientPrincipal=finalNative[1].accounts.find(row=>row.role==='recipient').total;result.spl.finalPublicSurplus=finalNative[1].accounts.find(row=>row.role==='depositor').total;assert.equal(result.spl.finalPublicSurplus,result.spl.publicSurplusReturned);result.checks.originalUsdcPayoutAndReservationClosed=true;}
    else {
    checkClaimGraphV3Inventory(finalNative[1], fixture.solana, claims.configs[1]);
    assert.deepEqual(fixture.solana.transfers.map(row => row.route), btcToSol ? [] : ['deposit', 'redeem']);
    for (const row of fixture.solana.transfers) {
      const role = row.route === 'deposit' ? 'depositor' : 'escrow', pin = finalNative[1].nonceInfrastructureByAuthority[role];
      const decoded = validateSolanaNonceBindingTransaction(row.nativeWire, row.intent);
      assert.equal(decoded.signatureHex, row.nativeId); assert.equal(decoded.transactionSHA256, row.transactionSHA256);
      assert.equal(row.phase, 'OBSERVED_FINALIZED'); assert.equal(row.broadcastAttempts, 1);
      assert.deepEqual([decoded.wireBindingVersion, decoded.effectIndex, decoded.wireBindingPosition], ['2', '1', '2']);
      assert.equal(row.intent.durableNonce, initialNative[1].nonceInfrastructureByAuthority[role].nonceAccount.durableNonce);
      assert.notEqual(row.intent.durableNonce, pin.nonceAccount.durableNonce); assert.equal(row.observation.nativeWire, row.nativeWire);
    }
    }
    assert.deepEqual(fixture.bitcoin.transfers.map(row => row.route), withGraph ? ['deposit', 'redeem', 'redeem'] : ['deposit', 'redeem']);
    for (const row of fixture.bitcoin.transfers) { assert.equal(row.phase, 'OBSERVED_CONFIRMED'); assert.equal(row.broadcastAttempts, 1); assert.equal(row.confirmationMiningAttempts, 1); }
    if (withGraph) {
      if(btcToSol){assert.deepEqual(finalNative[1].nonceInfrastructureByAuthority, initialNative[1].nonceInfrastructureByAuthority);assert.deepEqual(finalNative[1].accounts, initialNative[1].accounts);assert.deepEqual(finalNative[1].feeAudit, initialNative[1].feeAudit);result.checks.solCustodyAndInfrastructureNeverSpent=true;}
      const sourceReader = await createFlatSystemStateReader({ runtime, system, poolIndex: 0 });
      const sourceFinal = await sourceReader.read();
      assert.equal(sourceFinal.ledger.publicState.backedAmount, '0'); assert.equal(sourceFinal.ledger.publicState.actualAssetBalance, '0');
      assert.equal(sourceFinal.ledger.publicState.liveReservations, 0); assert.equal(sourceFinal.state.spentTagCount, '4');
      result.checks.originalGraphBackingClosed = true;
    } else result.checks.dualNonceIngressAndPayoutAdvanced = true;
    result.nativeEffects = { bitcoin: fixture.bitcoin.transfers.length, solana: fixture.solana.transfers.length,
      graphBitcoin: fixture.graphBitcoin.transfers.length, graphSolana: fixture.graphSolana.transfers.length,
      eachBroadcastOnce: [...fixture.bitcoin.transfers, ...fixture.solana.transfers, ...(withGraph ? fixture.graphSolana.transfers : [])].every(row => row.broadcastAttempts === 1) };
    result.checks.allOriginalLiabilitiesClosed = true; await audit(); result.phase = 'completed'; result.success = true;
  } catch (error) {
    result.failedStage = result.phase; result.phase = 'failed'; result.success = false; result.errorCode = code(error);
    if (error.fixtureCleanup) Object.assign(result.cleanup, error.fixtureCleanup);
    retainPrepositionFailureMetrics();
    writeFixturePrivate(join(privateDirectory, 'error-private.json'), { message: String(error.message), stack: String(error.stack),
      cause: error.cause ? String(error.cause.stack ?? error.cause.message) : null,
      privateDiagnostic: privateFailureDiagnostic(error, 'NATIVE_CLAIM_OPERATION_FAILED') }); await audit().catch(() => {});
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (result.cleanup.errors.length || !['closedEvm', 'closedBitcoin', 'closedSolana', 'closedController', 'closedKeeper'].every(name => result.cleanup[name] === true)) {
      result.success = false; result.phase = 'failed'; result.errorCode ??= 'DEVELOPMENT_CLAIM_OWNED_CLEANUP_FAILED'; }
    try { assert.deepEqual(sourcePins(), result.sourcePins); result.sourceUnchanged = true; }
    catch { result.sourceUnchanged = false; result.success = false; result.phase = 'failed'; }
    result.finishedAt = new Date().toISOString(); save(); if (!result.success) process.exitCode = 1;
  }
}
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  await runDevelopmentNativeClaimAcceptance();
