import { CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, assertBeginPayoutAuditReleaseV1 } from '../../../../packages/backend/src/claims/payouts/begin-payout-audit-policy-v1.mjs';
import { BEGIN_PAYOUT_AUDIT_RESULT_V1, assertBeginPayoutAuditResultV1 } from '../payouts/native-claim-begin-payout-audit-policy-v1.mjs';
import { captureBeginPayoutAuditBeforeV1, captureBeginPayoutAuditTerminalV1 } from '../payouts/native-claim-begin-payout-audit-terminal-v1.mjs';
import { CLAIM_LOADED_V3_REAL_RUN_DISABLED, CLAIM_LOADED_V3_PROFILE, assertLoadedV3ProofBoundary, captureLoadedV3RedemptionAudit } from '../inventory/native-claim-loaded-v3-policy.mjs';
import { probeLoadedV3PostDeliveryFacts } from '../inventory/native-claim-loaded-v3-probe.mjs';
import { checkClaimLoadedV3Transfers } from '../inventory/native-claim-loaded-v3-nonce-checks.mjs';
import { ownedClaimControllerJournal } from '../../../../packages/backend/src/claims/controller/controller-journal.mjs';
/** Fixed local custody acceptance profiles: original claim round trips or
 * durable SOL API/keeper restart. All funds/accounts/networks are synthetic. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, LOCAL } from '../../../../packages/proofs/src/catalog.mjs';
import { hash } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { createRoleProofClient } from '../../../../packages/proofs/src/jobs/role-client.mjs';
import { createNativeClaimControllerKeeper, createDurableNativeClaimControllerKeeper,
  createNativeClaimController, createNativeClaimBeginPayoutAuditControllerV1, isNativeClaimBeginPayoutAuditStopV1, consumeNativeClaimBeginPayoutAuditStopV1 } from '../../../../packages/backend/src/claims/controller/controller.mjs';
import { claimDomainCommitment } from '../../../../packages/backend/src/claims/protocol/framing.mjs';
import { auditClaimNativeInventory } from '../../../../packages/backend/src/claims/operations/backing-audit.mjs';
import { auditOwnedSolanaNonceInfrastructure } from '../../../../packages/backend/src/chains/shared/runtime/owned-native-custody.mjs';
import { validateSolanaBindingTransaction } from '../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';
import { validateSolanaNonceBindingTransaction,
  validateSolanaNonceBootstrapTransaction } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { decodeDepositIntentInputs } from '../../../../packages/backend/src/execution/account/preparation/deposit-intent.mjs';
import { createFlatNativeExecution } from '../../../../packages/backend/src/execution/account/execution/flat-native-execution.mjs';
import { preflightFundedClaimGraph, preflightFundedClaimGraphV3 } from '../graph/validation/native-claim-graph-preflight.mjs';
import { LOADED_FACTS_PROFILE, probeLoadedPostDeliveryFacts, assertLoadedFactsProofBoundary }
  from '../inventory/native-claim-loaded-facts-probe.mjs';
import { privateFailureDiagnostic } from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatPortfolioAuthority } from '../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { createNativeClaimPortfolioView } from '../../../../packages/backend/src/claims/operations/portfolio-view.mjs';
import {createOriginalWalletEconomicStateV1} from '../../../../packages/backend/src/accounts/state/original-wallet-economic-state-v1.mjs';
import { createGenericAccountKeeper } from '../../../../packages/engine/src/execution/accounts/generic-account-keeper.mjs';
import { createFlatAccountSession } from '../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { startFlatAccountHttp } from '../../../../packages/backend/src/api/accounts/flat-account-http.mjs';
import { createNativeClaimSession, nativeClaimSessionController } from '../../../../packages/backend/src/api/claims/native-claim-session.mjs';
import { startNativeClaimHttp } from '../../../../packages/backend/src/api/claims/native-claim-http.mjs';
import { createOwnedNativeClaimFixture, createOwnedNativeClaimGraphFixture, createOwnedNativeClaimGraphV3Fixture } from '../../fixtures/claims/lifecycle/owned-native-claim-fixture.mjs';
import { CLAIM_GRAPH_AMOUNTS, runNativeClaimGraphCase, exitAndRedeemClaimGraphPayout }
  from '../graph/flows/native-claim-graph-case.mjs';
import { nativeClaimSourcePins } from './native-claim-source-pins.mjs';
import { nativeClaimRunDirectory, NATIVE_CLAIM_RUN_ROUTES } from './native-claim-run-route.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';

import { CLAIM_GRAPH_V3_REAL_RUN_DISABLED, CLAIM_GRAPH_V3_PROFILE } from '../graph/validation/native-claim-graph-v3-policy.mjs';
import { CLAIM_GRAPH_V3_NATIVE_PROTOCOL, checkClaimGraphV3Bootstrap, checkClaimGraphV3Transfers }
  from '../graph/validation/native-claim-graph-v3-nonce-checks.mjs';
import { NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION,
  NATIVE_INGRESS_V3_KEY_SHA256 } from '../../../../packages/proofs/src/native-ingress/metadata/native-ingress-v3-profile.mjs';

// Open only after the source/checkpoint and affected integration checks finish.
const REAL_NATIVE_RUN_DISABLED = true;
// Each profile creates fresh owned state. Prior two-asset/BTC and SOL refund
// evidence remains separate; this profile never resumes a stopped native node.
// Fixed supervisor identity is the only route selector. No env, argv, request,
// arbitrary worker path, or imported old signed state can select the V3 route.
const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
assert.equal(parent.length, 2);
const parentEntry = realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1]));
const beginPayoutAuditProfile = parentEntry === NATIVE_CLAIM_RUN_ROUTES.beginPayoutAuditV1.entry;
const loadedV3Profile = beginPayoutAuditProfile || parentEntry === NATIVE_CLAIM_RUN_ROUTES.loadedV3.entry;
const ingressV3Profile = loadedV3Profile || parentEntry === NATIVE_CLAIM_RUN_ROUTES.graphV3.entry;
const ACCEPTANCE_PROFILE = beginPayoutAuditProfile ? CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1 : loadedV3Profile ? CLAIM_LOADED_V3_PROFILE
  : ingressV3Profile ? CLAIM_GRAPH_V3_PROFILE : 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE';
const graphProfile = (!loadedV3Profile && ingressV3Profile) || ACCEPTANCE_PROFILE === 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH';
const loadedFactsProfile = loadedV3Profile || ACCEPTANCE_PROFILE === LOADED_FACTS_PROFILE;
const combinedProfile = graphProfile || loadedFactsProfile;
const nonceProfile = combinedProfile || ACCEPTANCE_PROFILE === 'SOLANA_NONCE_DURABLE_API_RESTART';
const durableApiProfile = !loadedFactsProfile && (nonceProfile || ACCEPTANCE_PROFILE === 'SOLANA_DURABLE_API_RESTART');
const durableKeeperProfile = durableApiProfile || loadedFactsProfile;
const selectedAssets = ACCEPTANCE_PROFILE === 'TWO_ASSET_ACCOUNT_REDEMPTION_AND_REFUND' ? [1, 0] : [1];
const bare = value => value.slice(2);
const safeCode = error => String(error?.message ?? '').match(/\b(?:CLAIM|SOLANA|BITCOIN|PW|FLAT|NATIVE|COMMITMENT|COMBINED_OPERATOR|LOCAL_EVM|ROLE_CLIENT)_[A-Z0-9_]+\b/)?.[0]
  ?? (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,160}$/.exec(error.code)?.[0] === error.code
    ? error.code : 'NATIVE_CLAIM_FLOW_FAILED');

async function main() {
  if (beginPayoutAuditProfile) assertBeginPayoutAuditReleaseV1();
  else assert.equal(loadedV3Profile ? CLAIM_LOADED_V3_REAL_RUN_DISABLED
    : ingressV3Profile ? CLAIM_GRAPH_V3_REAL_RUN_DISABLED : REAL_NATIVE_RUN_DISABLED, false,
    'NATIVE_CLAIM_RUN_REQUIRES_FROZEN_CHECKPOINT');
  assert.ok(['SOLANA_REDEMPTION_AND_REFUND', 'TWO_ASSET_ACCOUNT_REDEMPTION_AND_REFUND',
    'SOLANA_DURABLE_API_RESTART', 'SOLANA_NONCE_DURABLE_API_RESTART',
    'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH', CLAIM_GRAPH_V3_PROFILE, LOADED_FACTS_PROFILE, CLAIM_LOADED_V3_PROFILE, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1].includes(ACCEPTANCE_PROFILE));
  assert.equal(process.argv.length, 2); assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.deepEqual(process.execArgv, []); assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const runDirectory = nativeClaimRunDirectory(parentEntry, ACCEPTANCE_PROFILE);
  const lock = JSON.parse(readFileSync(join(ROOT, runDirectory, 'active.lock')));
  assert.equal(lock.pid, process.ppid); assert.equal(lock.attempt, runDirectory + '/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit');
  const proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 }); mkdirSync(proofDirectory, { mode: 0o700 });
  const proofLocations = [{ local: LOCAL, relations: ['native_claim_ingress', 'native_claim_discharge'] },
    ...(ingressV3Profile ? [{ local: NATIVE_INGRESS_V3_LOCAL, relations: [NATIVE_INGRESS_V3_RELATION] }] : [])]
    .map(location => ({ ...location, earlier: new Set(existsSync(join(location.local, 'attempts'))
      ? readdirSync(join(location.local, 'attempts')) : []) }));
  const result = { format: beginPayoutAuditProfile ? BEGIN_PAYOUT_AUDIT_RESULT_V1 : 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1', runId: lock.runId,
    profile: ACCEPTANCE_PROFILE, selectedAssets,
    ...(beginPayoutAuditProfile ? { boundaryReached: false, boundaryAccepted: false, completeRedemption: false } : {}),
    priorSeparateEvidence: 'de8fa0c0-4cda-4396-bc80-775c27fe91c4',
    phase: 'starting', success: false, localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, sourcePins: nativeClaimSourcePins(),
    stages: [], ownerStops: [], claims: [], redemptions: [], proofs: [], transactions: [], accountRequests: [],
    ...(durableApiProfile ? { claimApiRequests: [], keeperRestarts: [] } : {}),
    ...(nonceProfile ? { nativeProtocol: ingressV3Profile ? CLAIM_GRAPH_V3_NATIVE_PROTOCOL : { ingressWireBindingVersion: '1', ingressEffectIndex: '0', ingressMemoPosition: '1',
      payoutWireBindingVersion: '2', payoutAdvanceNoncePosition: '0', payoutEffectIndex: '1', payoutMemoPosition: '2' } } : {}),
    cleanup: { closedEvm: false, closedBitcoin: false, closedSolana: false },
    acceptance: { twoNativeAssetsIssued: false, requestedNativeAssetsIssued: false,
      ownerOfflineIssue: false, originalNotesCreditedOnce: false,
      controllerRestartNoResend: false, coherentPrivateAccount: false, recipientNativeRedemptions: false,
      requestedNativeRedemptions: false,
      expiredOriginalSourceRefund: false, allClaimLiabilitiesClosed: false,
      ...(durableApiProfile ? { keeperProcessRestart: false, keeperCrashRecovery: false,
        durableApiAdmissions: false, durableApiRedemptionDuplicateNoEffect: false } : {}),
      ...(nonceProfile ? { nonceBootstrapFinalized: false, nonceInfrastructureExcluded: false,
        noncePayoutObserved: false, nonceAdvanceBoundToOriginal: false } : {}) },
    independentOperators: false, nativeSelfCustody: false, keeperRestart: false, nativeNodeRestart: false,
    operatorKeyRestart: false, fullHostRestart: false,
    systemicPrivacyAcceptance: false, fullWalletAcceptance: false,
    ...(combinedProfile ? { fullNativeGraphAcceptance: false } : {}),
    ...(ingressV3Profile ? { ingressRelation: NATIVE_INGRESS_V3_RELATION, ingressSourceVersion: NATIVE_INGRESS_V3_SOURCE_VERSION,
      ingressKeySHA256: NATIVE_INGRESS_V3_KEY_SHA256 } : {}),
    disclosure: ['Private ERC20 claim notes are backed by native custody; they are not native self-custody.',
      'The four distinct attester keys, native custodian and RPCs run on one trusted host.',
      loadedFactsProfile ? 'The original V3 keeper and all native/EVM runtimes remain live; no restart campaign is run.'
        : durableApiProfile ? 'Only the encrypted keeper child is restarted; original operator keys and native/EVM runtimes survive.'
        : 'Owner/controller/coordinator restart retains the original keeper and chain runtimes.',
      'Local EVM time is controlled; Bitcoin six confirmations are mined only in isolated regtest.',
      'Public amount/timing/custody/exit links and bounded halt availability remain.'] };
  if (selectedAssets.length === 1) result.disclosure.push(
    'This fresh continuation has no BTC transfer; prior two-asset account and BTC redemption are separate historical evidence, not resumed state.');
  if (durableApiProfile && !graphProfile) result.disclosure.push('This profile covers one SOL deposit and redemption; expired-deposit refund is explicitly excluded.');
  if (nonceProfile) result.disclosure.push(
    ingressV3Profile ? 'Two distinct nonce payers and rent accounts are synthetic infrastructure excluded from claim backing and claim fee totals.'
      : 'The separate nonce payer and rent account are synthetic infrastructure excluded from claim backing and claim fee totals.',
    ingressV3Profile ? 'Durable nonce first-send checks rely on owned RPC and separate surviving depositor and escrow authorities; issuance/discharge require the observed original transaction.'
      : 'Durable nonce first-send checks rely on owned RPC and the surviving escrow authority; discharge requires the observed original transaction.');
  if (graphProfile) result.disclosure.push(
    'The private claim funds the graph payout; native delivery uses separate solver liquidity.',
    'Owner and solver redemptions use the fixed configured local native recipient, not arbitrary public destinations.',
    'The original cutoff remains the recovery boundary; this successful profile does not execute timeout recovery.');
  if (loadedFactsProfile) result.disclosure.push(
    'This loaded facts probe issues one genuine 3M SOL claim, then sends one factual 1M SOL transfer from separate solver liquidity.',
    'It requests genuine graph facts once and retained-fact health/checkpoint; it does not authorize a provider or prove/admit/settle a graph.',
    beginPayoutAuditProfile ? 'Only fresh D27/CI51/W39 are in scope. Successful audit-stop completion intentionally leaves a new 3M pending redemption and 5k reserved fee; no native payout or CO discharge occurs.'
      : 'Only D27/CI and the original owner claim-note withdrawal/CO proofs are in scope; the original 3M claim is redeemed on success.');
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const stage = async name => { result.phase = name; result.stages.push({ name, at: new Date().toISOString() });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n'); };
  let fixture, controller, controllerKeeper, portfolio, accountKeeper, session, http, claimSession, claimHttp, graphExecution, graphCase, closed = false, interrupted = false;
  const accounts = [], owners = [], handoffs = [], deposits = [], proofClients = {};
  let ownerStoppedBeforeGraphNative = false;
  const ingressProverIdentity = freshFixtureId();
  function publicProof(label, relation, proof) {
    const bytes = Buffer.isBuffer(proof.proof) ? proof.proof : Buffer.from(proof.proof, 'hex');
    const inputs = fixtureJSON(proof.publicInputs), name = String(result.proofs.length + 1).padStart(3, '0') + '-' + label;
    writeFileSync(join(proofDirectory, name + '.bin'), bytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(proofDirectory, name + '.inputs.json'), inputs, { flag: 'wx', mode: 0o600 });
    result.proofs.push({ relation, file: name, proofSHA256: hash(bytes), publicInputsSHA256: hash(inputs),
      evidence: proof.evidence ?? proof.metrics ?? null }); save();
  }
  async function audit(event = null) {
    if (event?.errorCode) {
      const diagnostic = privateFailureDiagnostic({ code: event.errorCode, causeCodes: event.errorCauseCodes, auditBudget: event.auditBudget });
      result.failureDiagnostics ??= [];
      if (result.failureDiagnostics.length < 8) result.failureDiagnostics.push({
        stage: /^[a-z0-9-]{1,80}$/.test(event.stage ?? '') ? event.stage : 'private-operation', ...diagnostic });
    }
    if (fixture?.runtime) {
      writeFixturePrivate(join(privateDirectory, 'evm.json'), { metadata: fixture.runtime.metadata,
        transactions: fixture.runtime.transactions, receipts: fixture.runtime.receipts });
      if (ingressV3Profile && fixture.claims) writeFixturePrivate(join(privateDirectory, 'claim-system.json'), {
        configs: fixture.claims.configs, verifierPins: fixture.claims.verifierPins,
        verifiers: Object.fromEntries(Object.entries(fixture.claims.verifiers).map(([role, verifier]) => [role,
          { address: verifier.address, codeHash: verifier.codeHash, source: verifier.source, lineage: verifier.lineage }])) });
      result.transactions = fixture.runtime.receipts.map(item => ({ label: item.label,
        status: item.receipt.status, gasUsed: item.gasUsed }));
      for (const [name, native] of [['bitcoin', fixture.bitcoin], ['solana', fixture.solana]])
        if (native) writeFixturePrivate(join(privateDirectory, name + '.json'), { metadata: native.metadata, transfers: native.transfers });
      if (nonceProfile && fixture.solana) writeFixturePrivate(join(privateDirectory, 'solana-nonce.json'), {
        ...(ingressV3Profile ? { bootstrapByAuthority: fixture.solana.nonceBootstrapByAuthority,
          infrastructureByAuthority: fixture.solana.nonceInfrastructureByAuthority }
          : { bootstrap: fixture.solana.nonceBootstrap, infrastructure: fixture.solana.nonceInfrastructure }),
      });
    }
    if (combinedProfile && fixture?.graphSolana) writeFixturePrivate(join(privateDirectory, 'graph-native.json'), {
      bitcoin: { metadata: fixture.graphBitcoin.metadata, transfers: fixture.graphBitcoin.transfers },
      solana: { metadata: fixture.graphSolana.metadata, transfers: fixture.graphSolana.transfers },
    });
    for (const location of proofLocations) for (const id of (existsSync(join(location.local, 'attempts'))
      ? readdirSync(join(location.local, 'attempts')) : [])) {
      if (location.earlier.has(id)) continue;
      const path = join(location.local, 'attempts', id, 'proof-manifest.json');
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path));
      if (!location.relations.includes(manifest.relation)
        || result.proofs.some(item => item.evidence?.runId === id)) continue;
      if (ingressV3Profile && manifest.relation === 'native_claim_ingress') assert.fail('CLAIM_GRAPH_V3_LEGACY_INGRESS_PROOF');
      if (manifest.relation === NATIVE_INGRESS_V3_RELATION) {
        assert.equal(manifest.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION);
        assert.equal(manifest.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
      }
      const proof = readFileSync(join(location.local, 'attempts', id, 'proof.bin'));
      const inputBytes = readFileSync(join(location.local, 'attempts', id, 'public-inputs.json'));
      const publicInputs = JSON.parse(inputBytes);
      assert.equal(hash(inputBytes), manifest.publicInputsSHA256);
      assert.equal(hash(proof), manifest.proofSHA256); assert.equal(manifest.selfVerified, true);
      publicProof('native-' + manifest.relation + '-' + id, manifest.relation,
        { proof, publicInputs, evidence: { runId: id, relation: manifest.relation,
          sourceVersion: manifest.sourceVersion, keySHA256: manifest.keySHA256, selfVerified: true } });
    }
    save();
  }
  async function openController() {
    controller = await (beginPayoutAuditProfile ? createNativeClaimBeginPayoutAuditControllerV1 : createNativeClaimController)({ runtime: fixture.runtime, claims: fixture.claims,
      observer: fixture.observer, operators: fixture.operators, quorum: fixture.quorum, proofClients,
      keeper: controllerKeeper, ingressProverIdentity });
  }
  async function cleanup() {
    // Signals and the main finally block share the same completion promise.
    // Never report cleanup while a concurrent caller still awaits child exit.
    if (closed) return closed;
    closed = (async () => {
      const report = { components: [], errors: [], closed: false };
      const close = async (name, work) => {
        try { await work(); report.components.push({ name, closed: true }); return true; }
        catch (error) {
          const errorCode = safeCode(error);
          report.components.push({ name, closed: false, errorCode });
          report.errors.push({ name, errorCode }); return false;
        }
      };
      if (claimHttp) await close('claimHttp', () => claimHttp.close());
      if (claimSession) {
        await close('claimSession', () => claimSession.close());
        // A restart replaces the controller inside the session. Read it only
        // after draining admissions, including a last in-flight replacement.
        await close('claimControllerLookup', () => { controller = nativeClaimSessionController(claimSession); });
      }
      if (http) await close('accountHttp', () => http.close());
      if (session) await close('accountSession', () => session.close());
      else if (accountKeeper) await close('accountKeeper', () => accountKeeper.close());
      for (const [index, account] of accounts.entries()) await close('account-' + index, () => account.close());
      if (graphExecution) await close('graphExecution', () => graphExecution.close());
      if (portfolio) await close('portfolio', () => portfolio.close());
      let closedController = !controller, closedKeeper = !controllerKeeper;
      if (controller) closedController = await close('claimController', () => {
        // A failed reopen may already have released the old controller lease.
        if (!controllerKeeper || controllerKeeper.status().controllerOpen) controller.close();
        if (controllerKeeper) assert.equal(controllerKeeper.status().controllerOpen, false, 'NATIVE_CLAIM_CONTROLLER_CLEANUP_INCOMPLETE');
      });
      if (controllerKeeper) closedKeeper = await close('claimKeeper', async () => {
        const observe = () => {
          const status = controllerKeeper.status();
          report.keeper = { closed: status.closed, controllerOpen: status.controllerOpen,
            ...(status.keeperRestart ? { processId: status.keeperProcessId, exitObserved: status.keeperProcessExited } : {}) };
          return status;
        };
        observe();
        try { await controllerKeeper.close(); } finally { observe(); }
        const status = controllerKeeper.status();
        assert.equal(status.closed, true, 'NATIVE_CLAIM_KEEPER_CLEANUP_INCOMPLETE');
        assert.equal(status.controllerOpen, false, 'NATIVE_CLAIM_KEEPER_CLEANUP_INCOMPLETE');
        if (status.keeperRestart) assert.equal(status.keeperProcessExited, true, 'NATIVE_CLAIM_KEEPER_EXIT_NOT_OBSERVED');
      });
      for (const [name, client] of Object.entries(proofClients)) {
        const stopped = await close('proofClient-' + name, () => client.close());
        if (!stopped) await close('proofClientStop-' + name, () => client.stop());
      }
      if (fixture) await close('fixture', async () => {
        result.cleanup = { ...result.cleanup, ...await fixture.close() };
        assert.ok(['closedEvm', 'closedSolana', 'closedBitcoin'].every(key => result.cleanup[key] === true)
          && ['owners', 'resources', 'operators'].every(key => (result.cleanup[key] ?? []).every(item => item.closed === true)),
        'NATIVE_CLAIM_FIXTURE_CLEANUP_INCOMPLETE');
      });
      report.closed = report.errors.length === 0;
      result.cleanup = { ...result.cleanup, closedController, closedKeeper, application: report };
      if (!report.closed) {
        result.success = false; result.phase = 'failed'; result.errorCode ??= 'NATIVE_CLAIM_CLEANUP_FAILED'; process.exitCode = 1;
      }
      return result.cleanup;
    })();
    return closed;
  }
  const stop = () => {
    if (interrupted) return; interrupted = true;
    result.interruption = { at: new Date().toISOString(), phase: result.phase };
    void audit().catch(() => {}).then(cleanup).finally(() => {
      result.phase = 'failed'; result.success = false; result.errorCode = 'NATIVE_CLAIM_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN';
      save(); process.exit(2);
    });
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  async function confirmOriginal(operationId) {
    const original = await controller.privateNativeReceipt({ operationId });
    assert.equal(original.broadcastAttempts, 1, 'NATIVE_CLAIM_ONE_BROADCAST');
    if (original.family === '1') await fixture.bitcoin.confirm(original.nativeId);
    else assert.equal((await fixture.solana.observe(original.nativeId)).status, 'observed', 'NATIVE_CLAIM_SOL_FINALITY');
    return original;
  }
  async function prepareOwner(index, amount, label, until) {
    const owner = await fixture.createOwner(index, label), runtime = fixture.runtime;
    await owner.owner.prepareDepositIntent({ amount, validFrom: String(await runtime.time()), validUntil: until,
      exitRecipient: bare(runtime.accounts[index + 3]) });
    const proof = await owner.ownerProof.proveDepositIntent(); publicProof(label + '-D27', 'deposit_intent', proof);
    const statement = decodeDepositIntentInputs(proof.publicInputs);
    const handoff = await owner.owner.createNativeClaimIngressHandoff({ claimDomain: claimDomainCommitment(fixture.claims.configs[index]),
      ingressProverIdentity, statement });
    const prepared = await controller.prepare({ handoff }); await controller.preposition({ intentId: prepared.intentId });
    return { owner, handoff, prepared, statement };
  }
  async function request(action, body = {}) {
    const response = await fetch(http.origin + '/api/flat-account/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: http.origin, 'x-flat-account-token': http.clientAccess.token }, body: JSON.stringify(body) });
    assert.equal(response.status, 202); assert.equal((await response.json()).admitted, true);
    const view = await session.idle(); result.accountRequests.push({ action, requestId: body.requestId ?? null, phase: view.phase }); save(); return view;
  }
  async function ownerView() {
    const response = await fetch(http.origin + '/api/flat-account/owner', {
      headers: { Origin: http.origin, 'x-flat-owner-token': http.ownerAccess.token } });
    assert.equal(response.status, 200); return response.json();
  }
  async function claimRequest(action, body) {
    const response = await fetch(claimHttp.origin + '/api/native-claims/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: claimHttp.origin,
        'x-native-claim-token': claimHttp.clientAccess.token }, body: JSON.stringify(body) });
    const admission = await response.json(); assert.equal(response.status, 202, admission.error);
    assert.equal(admission.admitted, true); assert.equal(admission.requestId, body.requestId);
    const view = await claimSession.idle(); controller = nativeClaimSessionController(claimSession);
    const request = view.requests.find(row => row.requestId === body.requestId); assert.ok(request);
    result.claimApiRequests.push({ action, requestId: body.requestId, admitted: true,
      duplicate: admission.duplicate === true, state: request.state, errorCode: request.errorCode }); save();
    return { admission, request, view };
  }
  async function claimOwnerView() {
    const response = await fetch(claimHttp.origin + '/api/native-claims/owner', {
      headers: { Origin: claimHttp.origin, 'x-native-owner-token': claimHttp.ownerAccess.token } });
    assert.equal(response.status, 200); return response.json();
  }
  function checkNonceInventory(inventory) {
    const native = fixture.solana, infrastructure = auditOwnedSolanaNonceInfrastructure(inventory.nonceInfrastructure);
    for (const [key, value] of Object.entries(native.nonceInfrastructure)) assert.deepEqual(infrastructure[key], value);
    assert.equal(infrastructure.authorityPublicKey, native.roles.escrow.endpoint);
    assert.equal(inventory.accounts.length, 3);
    assert.deepEqual(inventory.accounts.map(row => row.role).sort(), ['depositor', 'escrow', 'recipient']);
    for (const account of inventory.accounts) {
      assert.notEqual(account.endpoint, infrastructure.payerPublicKey); assert.notEqual(account.endpoint, infrastructure.nonceAccountPublicKey);
    }
    assert.deepEqual(inventory.feeAudit.transfers.map(row => row.nativeId), native.transfers.map(row => row.nativeId));
    assert.ok(!inventory.feeAudit.transfers.some(row => row.nativeId === infrastructure.bootstrapNativeId));
    assert.ok(!native.transfers.some(row => row.nativeId === infrastructure.bootstrapNativeId));
    const funds = auditClaimNativeInventory(inventory, fixture.claims.configs[1], native.roles);
    assert.equal(funds.nativeTotal, inventory.escrow.total);
    assert.equal(funds.nativePrincipalAvailable, '0');
    assert.equal(BigInt(funds.feeReserveAvailable), BigInt(inventory.syntheticPrefunding.amount)
      - BigInt(inventory.feeAudit.escrowActualFees) - BigInt(inventory.escrow.rentExemptMinimum));
    return infrastructure;
  }
  function checkNonceBootstrap(initialInventory) {
    if (ingressV3Profile) {
      assert.equal(fixture.solana.transfers.length, 0);
      result.nonceInfrastructure = checkClaimGraphV3Bootstrap(initialInventory, fixture.solana, fixture.claims.configs[1]);
      result.acceptance.nonceBootstrapFinalized = true; result.acceptance.nonceInfrastructureExcluded = true; return;
    }
    const native = fixture.solana, bootstrap = native.nonceBootstrap, infrastructure = checkNonceInventory(initialInventory);
    const decoded = validateSolanaNonceBootstrapTransaction(bootstrap.nativeWire, bootstrap.intent);
    assert.equal(bootstrap.phase, 'OBSERVED_FINALIZED'); assert.equal(bootstrap.broadcastAttempts, 1);
    assert.equal(decoded.signatureHex, bootstrap.nativeId); assert.equal(decoded.transactionSHA256, bootstrap.transactionSHA256);
    assert.equal(infrastructure.bootstrapNativeId, bootstrap.nativeId); assert.equal(infrastructure.bootstrapTransactionSHA256, bootstrap.transactionSHA256);
    assert.equal(bootstrap.intent.authorityPublicKey, native.roles.escrow.endpoint);
    assert.equal(bootstrap.intent.payerPublicKey, infrastructure.payerPublicKey);
    assert.equal(bootstrap.intent.nonceAccountPublicKey, infrastructure.nonceAccountPublicKey);
    const observed = bootstrap.observation; assert.ok(observed);
    assert.equal(observed.nativeId, bootstrap.nativeId); assert.equal(observed.nativeWire, bootstrap.nativeWire);
    assert.equal(observed.transactionSHA256, bootstrap.transactionSHA256); assert.deepEqual(observed.intent, bootstrap.intent);
    assert.equal(observed.genesis, bare(native.genesisHex)); assert.equal(observed.feeLamports, bootstrap.preparedFee);
    assert.equal(observed.sourceBefore, infrastructure.genesisGrant); assert.equal(observed.sourceAfter, infrastructure.payerBalance);
    assert.equal(observed.recipientBefore, '0'); assert.equal(observed.recipientAfter, infrastructure.bootstrapRentLamports);
    assert.equal(observed.feeLamports, infrastructure.bootstrapFeeLamports);
    assert.equal(native.transfers.length, 0); assert.equal(initialInventory.feeAudit.actualFees, '0');
    result.nonceInfrastructure = { profile: 'SYNTHETIC_NONCE_INFRASTRUCTURE_NOT_USER_BACKING', bootstrapFinalized: true,
      bootstrapBroadcastOnce: true, createInstruction: 0, initializeInstruction: 1, separatePayer: true, escrowAuthority: true,
      claimAccountCount: 3, infrastructureAccountCount: 2, rentExcludedFromUserBacking: true,
      bootstrapFeeExcludedFromClaimFees: true, bootstrapExcludedFromClaimTransfers: true, nonceAdvancedWithObservedPayout: false };
    result.acceptance.nonceBootstrapFinalized = true; result.acceptance.nonceInfrastructureExcluded = true;
  }
  function checkNoncePayout(initialInventory, finalInventory) {
    if (ingressV3Profile) {
      Object.assign(result.nonceInfrastructure, (loadedV3Profile ? checkClaimLoadedV3Transfers : checkClaimGraphV3Transfers)(
        initialInventory, finalInventory, fixture.solana, fixture.claims.configs[1]));
      result.acceptance.nonceIngressObserved = true; result.acceptance.noncePayoutObserved = true;
      result.acceptance.nonceAdvanceBoundToOriginal = true; return;
    }
    const native = fixture.solana, infrastructure = checkNonceInventory(finalInventory);
    const routes = graphProfile ? ['deposit', 'redeem', 'redeem', 'deposit', 'refund'] : ['deposit', 'redeem'];
    assert.deepEqual(native.transfers.map(row => row.route), routes);
    const payoutNonces = new Set();
    for (const row of native.transfers) {
      const ingress = row.route === 'deposit';
      const decoded = ingress ? validateSolanaBindingTransaction(row.nativeWire, row.intent)
        : validateSolanaNonceBindingTransaction(row.nativeWire, row.intent);
      assert.equal(decoded.signatureHex, row.nativeId); assert.equal(decoded.transactionSHA256, row.transactionSHA256);
      assert.equal(row.phase, 'OBSERVED_FINALIZED'); assert.equal(row.broadcastAttempts, 1); assert.ok(row.observation);
      assert.equal(row.observation.nativeWire, row.nativeWire); assert.equal(row.observation.nativeId, row.nativeId);
      assert.equal(row.observation.transactionSHA256, row.transactionSHA256); assert.deepEqual(row.observation.intent, row.intent);
      assert.deepEqual([decoded.wireBindingVersion, decoded.effectIndex, decoded.wireBindingPosition],
        ingress ? ['1', '0', '1'] : ['2', '1', '2']);
      if (ingress) continue;
      assert.equal(row.intent.sourcePublicKey, native.roles.escrow.endpoint);
      assert.equal(row.intent.recipientPublicKey, native.roles[row.route === 'refund' ? 'depositor' : 'recipient'].endpoint);
      assert.equal(row.intent.nonceAccountPublicKey, infrastructure.nonceAccountPublicKey);
      if (payoutNonces.size === 0)
        assert.equal(row.intent.durableNonce, initialInventory.nonceInfrastructure.nonceAccount.durableNonce);
      assert.ok(!payoutNonces.has(row.intent.durableNonce), 'NATIVE_CLAIM_PAYOUT_NONCE_REUSE');
      payoutNonces.add(row.intent.durableNonce);
      // A final account difference alone is not payout evidence: every wire
      // above was observed finalized and its original ticket was discharged.
      assert.notEqual(infrastructure.nonceAccount.durableNonce, row.intent.durableNonce);
      assert.ok(BigInt(finalInventory.nativeHead.slot) >= BigInt(row.observation.transactionSlot));
    }
    assert.equal(payoutNonces.size, graphProfile ? 3 : 1);
    result.nonceInfrastructure.nonceAdvancedWithObservedPayout = true;
    result.acceptance.noncePayoutObserved = true; result.acceptance.nonceAdvanceBoundToOriginal = true;
  }
  async function crashAndRecoverKeeper(depositRequest, issued) {
    await claimSession.idle();
    const before = { evm: fixture.runtime.transactions.length, native: fixture.solana.transfers.length,
      original: await controller.privateNativeReceipt({ operationId: issued.intentId }) };
    const pid = controllerKeeper.status().keeperProcessId;
    assert.ok(Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid, 'NATIVE_CLAIM_OWNED_KEEPER_PID');
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    assert.equal(realpathSync(argv[0]), realpathSync(process.execPath));
    assert.deepEqual(argv.slice(1), ['--max-old-space-size=384',
      join(ROOT, 'wallet-platform/modules/native-claims/record-store-process.mjs'), '--claim-record-worker']);
    assert.match(readFileSync(`/proc/${pid}/status`, 'utf8'), new RegExp(`^PPid:\\s+${process.pid}$`, 'm'));
    assert.equal(controllerKeeper.status().keeperProcessId, pid);
    // The last authenticated read completed before this exact owned child is
    // killed. Recovery must use the durable store; stale locks are never removed.
    process.kill(pid, 'SIGKILL');
    for (let attempt = 0; attempt < 500 && !controllerKeeper.status().uncertain; attempt++)
      await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(controllerKeeper.status().uncertain, true, 'NATIVE_CLAIM_KEEPER_EXIT_REQUIRED');
    const recovered = await claimRequest('restart', { requestId: 'keeper_restart_after_issue' });
    assert.equal(recovered.request.state, 'CONFIRMED', recovered.request.errorCode);
    const status = controllerKeeper.status(); assert.notEqual(status.keeperProcessId, pid);
    assert.equal(status.storageRecovery.openedFromDisk, true); assert.equal(status.requiresExternalEffectReconciliation, false);
    const owner = await claimOwnerView(), retained = owner.deposits.find(row => row.intentId === issued.intentId);
    assert.deepEqual(retained, issued);
    assert.equal(owner.requests.find(row => row.requestId === depositRequest.requestId)?.state, 'CONFIRMED');
    const duplicate = await claimRequest('deposit', depositRequest); assert.equal(duplicate.admission.duplicate, true);
    assert.equal(duplicate.request.state, 'CONFIRMED');
    assert.deepEqual(await controller.privateNativeReceipt({ operationId: issued.intentId }), before.original);
    assert.equal(fixture.runtime.transactions.length, before.evm); assert.equal(fixture.solana.transfers.length, before.native);
    result.keeperRestarts.push({ phase: 'after-issue-idle-sigkill', previousPID: pid, processId: status.keeperProcessId,
      storageOpenedFromDisk: true, originalsReconciled: true, duplicateHadNoEffect: true });
    result.acceptance.keeperCrashRecovery = true; result.acceptance.durableApiAdmissions = true;
    result.keeperRestart = true; save();
  }
  try {
    save(); fixture = await (ingressV3Profile ? createOwnedNativeClaimGraphV3Fixture
      : combinedProfile ? createOwnedNativeClaimGraphFixture : createOwnedNativeClaimFixture)(privateDirectory, { onStage: stage,
      onDeployment: async () => { await audit(); } });
    const { runtime, claims, system } = fixture;
    if (loadedV3Profile) {
      assert.equal(fixture.quorum.collectionProfile, 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3', 'CLAIM_LOADED_V3_COLLECTION_PROFILE');
      result.claimCollectionProfile = fixture.quorum.collectionProfile;
      assert.equal(fixture.quorum.authorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4', 'CLAIM_LOADED_V4_AUTHORIZATION_LIFECYCLE');
      result.claimAuthorizationLifecycleProfile = fixture.quorum.authorizationLifecycleProfile;
      assert.equal(fixture.solana.payoutFinalSendProfile, 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2', 'CLAIM_LOADED_V3_PAYOUT_FINAL_SEND_PROFILE');
      result.payoutFinalSendProfile = fixture.solana.payoutFinalSendProfile;
    }
    if (graphProfile || loadedV3Profile) {
      // Exercise the real registered quorum before creating an owner, proof
      // job or user deposit. A failed readiness preflight cannot strand one.
      await stage('preflight-genuine-graph-attestation-before-funds');
      assert.equal(fixture.owners.length, 0); assert.equal(result.proofs.length, 0);
      const checkpoint = await fixture.graphQuorum.checkpoint({ poolIndex: 1, requestId: freshFixtureId() });
      const health = await fixture.graphQuorum.health({ poolIndex: 1 });
      assert.deepEqual(checkpoint.head, health.head);
      for (const native of [fixture.bitcoin, fixture.solana, fixture.graphBitcoin, fixture.graphSolana])
        assert.equal(native.transfers.length, 0);
      result.graphAttestationPreflight = { checkpoint: true, health: true,
        beforeAnyOwnerOrProof: true, custodyTransfers: 0, graphTransfers: 0,
        noCheckpointTransactionSubmitted: true };
      save();
    }
    const initialNative = [await fixture.bitcoin.inventory(), await fixture.solana.inventory()];
    writeFixturePrivate(join(privateDirectory, 'initial-native.json'), initialNative);
    if (nonceProfile) checkNonceBootstrap(initialNative[1]);
    controllerKeeper = await (durableKeeperProfile ? createDurableNativeClaimControllerKeeper : createNativeClaimControllerKeeper)({ runtime, claims,
      path: join(privateDirectory, durableKeeperProfile ? 'controller.v3' : 'controller.vault'), password: freshFixtureId() });
    for (const role of ['claim_ingress', 'claim_discharge']) proofClients[role] = createRoleProofClient(role);
    await openController();
    const amounts = ['100000', '3000000'];
    const expectedBalances = amounts.map((amount, index) => selectedAssets.includes(index) ? amount : '0');
    for (const index of [0, 1].filter(index => !selectedAssets.includes(index)))
      owners[index] = await fixture.createOwner(index, 'unfunded-asset-' + index);
    // Exercise the affected SOL path before spending proof work on BTC. Asset
    // arrays retain their canonical BTC/SOL indices throughout the account API.
    for (const index of selectedAssets) {
      await stage('preposition-owner-native-claim-' + index);
      const item = await prepareOwner(index, amounts[index], 'asset-' + index, String((await runtime.time()) + 86400n));
      owners[index] = item.owner; handoffs[index] = item.handoff; deposits[index] = item.prepared;
      await item.owner.suspend(); assert.equal(item.owner.report().available, false);
      result.ownerStops.push({ assetIndex: index, phase: 'before-first-native-transfer', at: new Date().toISOString() }); save();
      await stage('execute-original-native-deposit-' + index);
      await controller.ingress({ intentId: item.prepared.intentId }); await confirmOriginal(item.prepared.intentId);
      if (!loadedFactsProfile && index === selectedAssets.at(-1)) {
        const before = [fixture.bitcoin.transfers.length, fixture.solana.transfers.length];
        const original = await controller.privateNativeReceipt({ operationId: item.prepared.intentId });
        const pid = durableApiProfile ? controllerKeeper.status().keeperProcessId : null;
        controller.close();
        if (durableApiProfile) await controllerKeeper.restart();
        await openController();
        if (durableApiProfile) {
          await controller.reconcileAll({});
          const status = controllerKeeper.status(); assert.notEqual(status.keeperProcessId, pid);
          assert.equal(status.storageRecovery.openedFromDisk, true); assert.equal(status.requiresExternalEffectReconciliation, false);
          assert.deepEqual(await controller.privateNativeReceipt({ operationId: item.prepared.intentId }), original);
          result.keeperRestarts.push({ phase: 'before-issue-clean-restart', previousPID: pid, processId: status.keeperProcessId,
            storageOpenedFromDisk: true, originalsReconciled: true });
          result.acceptance.keeperProcessRestart = true;
        } else await controller.reconcile({ operationId: item.prepared.intentId });
        assert.deepEqual([fixture.bitcoin.transfers.length, fixture.solana.transfers.length], before);
        result.acceptance.controllerRestartNoResend = true;
      }
      await stage('prove-and-issue-original-native-claim-' + index);
      let issued;
      if (durableApiProfile) {
        claimSession = await createNativeClaimSession({ controller, accountId: 'durable_native_claim_sol',
          ownerIdentitySHA256: item.handoff.select().ownerIdentitySHA256,
          claimDomain: claimDomainCommitment(claims.configs[index]), caller: runtime.accounts[index + 3] });
        claimHttp = await startNativeClaimHttp({ session: claimSession, port: 0 });
        const depositRequest = { requestId: 'original_sol_deposit', intentId: item.prepared.intentId };
        const admitted = await claimRequest('deposit', depositRequest);
        assert.equal(admitted.admission.duplicate, undefined); assert.equal(admitted.request.state, 'CONFIRMED', admitted.request.errorCode);
        const owner = await claimOwnerView(); issued = owner.deposits.find(row => row.intentId === item.prepared.intentId);
        assert.ok(issued?.submission); assert.equal(issued.status, 'ISSUED');
        assert.equal(item.owner.report().available, false);
        writeFixturePrivate(join(privateDirectory, 'durable-native-owner-after-issue.json'), owner);
        await stage('recover-idle-issued-keeper-after-exact-sigkill');
        await crashAndRecoverKeeper(depositRequest, issued);
      } else issued = await controller.issue({ intentId: item.prepared.intentId, handoff: item.handoff });
      assert.equal(issued.status, 'ISSUED'); assert.equal(item.owner.report().available, false);
      result.claims.push({ assetIndex: index, amount: amounts[index], status: issued.status, ownerAbsent: true });
      await item.owner.restart(); await item.owner.owner.reconcileDepositIntent(issued.submission);
      const sent = runtime.transactions.length; await item.owner.owner.reconcileDepositIntent(issued.submission);
      assert.equal(runtime.transactions.length, sent); await audit();
    }
    result.acceptance.twoNativeAssetsIssued = selectedAssets.length === 2;
    result.acceptance.requestedNativeAssetsIssued = true; result.acceptance.ownerOfflineIssue = true;
    result.acceptance.originalNotesCreditedOnce = true;
    if (loadedFactsProfile) {
      result.loadedFactsProbe = await (loadedV3Profile ? probeLoadedV3PostDeliveryFacts : probeLoadedPostDeliveryFacts)({ fixture, controller,
        proofRelations: result.proofs.map(proof => proof.relation), privateDirectory, stage, audit });
      save();
    }
    if (graphProfile) {
      await stage('preflight-funded-claim-graph-before-u-s');
      result.fundedGraphAttestationPreflight = await (ingressV3Profile ? preflightFundedClaimGraphV3 : preflightFundedClaimGraph)(fixture, result.proofs.map(proof => proof.relation));
      await audit();
    }
    await stage('expose-two-custodial-assets-in-private-account');
    if (graphProfile) graphExecution = await createFlatNativeExecution({ runtime, system, poolIndex: 1,
      bitcoin: fixture.graphBitcoin, solana: fixture.graphSolana, quorum: fixture.graphQuorum }, {
      onProof: async ({ label, relation, proof }) => publicProof('graph-' + label, relation, proof),
      onPrivateAudit: audit, onStage: value => stage(value.stage),
    });
    for (let index = 0; index < 2; index++) accounts.push(await createFlatAccountAuthority({ runtime, system, poolIndex: index,
      owner: owners[index], nativeExecution: graphProfile && index === 1 ? graphExecution : null, accountId: 'native_claim_' + index, journalId: 'native_claim_journal_' + index },
    { onProof: async ({ label, relation, proof }) => publicProof('asset-' + index + '-' + label, relation, proof),
      onPrivateAudit: audit,
      onStage: async event => {
        if (!graphProfile || event.stage !== 'OWNER_SUSPENDED_BEFORE_NATIVE') return;
        assert.equal(index, 1); assert.equal(owners[index].report().available, false);
        assert.equal(owners[index].report().childExited, true);
        assert.equal(fixture.graphSolana.transfers.length, 0);
        assert.equal(fixture.graphBitcoin.transfers.length, 0);
        ownerStoppedBeforeGraphNative = true;
        result.ownerStops.push({ assetIndex: index, phase: 'after-reservation-before-graph-native',
          ownerAbsent: true, noNativeGraphEffectYet: true, at: new Date().toISOString() });
        save();
      },
    }));
    portfolio = createFlatPortfolioAuthority({ runtime, system, accounts: accounts.map((account, poolIndex) => ({ account, poolIndex })),
      accountId: 'private_native_claims', journalId: 'private_native_claim_journal' });
    accountKeeper = await createGenericAccountKeeper({ config: portfolio.config,
      journal: { path: join(privateDirectory, 'account.vault'), password: freshFixtureId() }, authority: portfolio.authority });
    const portfolioView = createNativeClaimPortfolioView({ runtime, claims, observer: fixture.observer, quorum: fixture.quorum, portfolio });
    session = await createFlatAccountSession({ keeper: accountKeeper, ownerHandoff: { ownerView: portfolioView } });
    const economicState=await createOriginalWalletEconomicStateV1({catalogues:[],nativeAccounts:[],wrappedPortfolios:[],
      claimPortfolios:[{runtime,view:portfolioView,session}],journal:{path:join(privateDirectory,'native-claim-observations.vault'),password:freshFixtureId()}});
    http = await startFlatAccountHttp({ session, port: 0, economicState });
    const originalEconomicResponse=await fetch(http.origin+'/api/flat-account/economic-state',{headers:{Origin:http.origin,'x-flat-owner-token':http.ownerAccess.token}});
    assert.equal(originalEconomicResponse.status,200);const originalEconomic=await originalEconomicResponse.json();
    assert.equal(originalEconomic.capabilities.underlyingCredit,false);
    assert.deepEqual(originalEconomic.rows.map(row=>row.asset.symbol),portfolio.registry.map(asset=>asset.symbol));
    assert.ok(originalEconomic.rows.every(row=>row.component==='NATIVE_CLAIM'));
    const funded = await ownerView();
    writeFixturePrivate(join(privateDirectory, 'funded-private-portfolio.json'), funded);
    assert.equal(funded.status, 'LIVE'); assert.equal(funded.coherent, true);
    assert.deepEqual(funded.assets.map(asset => asset.balances.available), expectedBalances);
    assert.deepEqual(funded.assets.map(asset => asset.asset.symbol), ['CBTC', 'CSOL']);
    assert.ok(funded.nativeClaims.every(asset => asset.nativeSelfCustody === false && asset.underlyingSpendable === false));
    assert.ok(funded.nativeClaims.every(asset => asset.custodyObservation === 'CURRENT_QUORUM'),
      'NATIVE_CLAIM_FUNDED_PORTFOLIO_CUSTODY_UNAVAILABLE');
    result.privatePortfolio = { assetCount: funded.assets.length, coherent: true,
      custodialClaimLabels: funded.nativeClaims.every(item => item.kind === 'CUSTODIAL_NATIVE_CLAIM'),
      custodyObservations: funded.nativeClaims.map(item => item.custodyObservation) };
    result.acceptance.coherentPrivateAccount = true;
    if (!loadedFactsProfile) {
      await request('restart');
      for (const owner of owners) { await owner.suspend(); await owner.restart(); }
      assert.deepEqual((await ownerView()).assets.map(asset => asset.balances.available), expectedBalances);
    }
    if (graphProfile) {
      graphCase = await runNativeClaimGraphCase({ fixture, owner: owners[1], account: accounts[1], execution: graphExecution,
        request, ownerView, stage, audit, privateDirectory,
        onProof: async ({ label, relation, proof }) => publicProof(label, relation, proof) });
      assert.equal(ownerStoppedBeforeGraphNative, true, 'NATIVE_CLAIM_GRAPH_OWNER_STOP_BEFORE_NATIVE');
      graphCase.report.ownerStoppedBeforeNative = true;
      result.claimFundedGraph = graphCase.report; save();
    }
    for (const index of [...selectedAssets].sort()) {
      await stage('exit-original-claim-note-and-redeem-native-' + index);
      const requestId = 'native_claim_exit_' + index, ref = freshFixtureId();
      const exitRole = graphProfile ? 'change' : 'source';
      const exitAmount = graphProfile ? CLAIM_GRAPH_AMOUNTS.change : amounts[index];
      await owners[index].owner.prepareWithdrawal({ role: exitRole, epoch: String((await runtime.time()) / 600n) });
      await accounts[index].ownerActions.registerExit(ref, exitRole);
      await request('prepare', { requestId, kind: 'EXIT', ownerOperationRef: ref, assetId: accounts[index].assetId });
      const exit = await request('execute', { requestId }); assert.equal(exit.requests.find(row => row.requestId === requestId)?.state, 'CONFIRMED');
      const count = runtime.transactions.length; await request('execute', { requestId }); assert.equal(runtime.transactions.length, count);
      if (durableApiProfile) {
        const redemption = { requestId: 'original_sol_redemption', amount: exitAmount, maxFee: claims.configs[index].refundMaxFee };
        let response = await claimRequest('redeem', redemption), owner = await claimOwnerView();
        assert.equal(owner.tickets.length, 1); const ticket = owner.tickets[0];
        assert.equal(ticket.kind, 'REDEEM'); assert.equal(ticket.amount, exitAmount);
        if (response.request.state !== 'CONFIRMED') {
          assert.equal(response.request.state, 'RECONCILIATION_REQUIRED');
          assert.ok(response.request.errorCode === null || response.request.errorCode === 'CLAIM_NATIVE_FINALITY_UNRESOLVED',
            response.request.errorCode ?? 'NATIVE_CLAIM_PENDING_FINALITY_REQUIRED');
          assert.equal(ticket.status, 'UNKNOWN');
          const original = await controller.privateNativeReceipt({ operationId: ticket.ticketId });
          assert.equal(original.broadcastAttempts, 1);
          assert.equal(fixture.solana.transfers.find(row => row.nativeId === original.nativeId)?.route, 'redeem');
          await confirmOriginal(ticket.ticketId);
          response = await claimRequest('resume', { requestId: redemption.requestId }); owner = await claimOwnerView();
        }
        assert.equal(response.request.state, 'CONFIRMED', response.request.errorCode);
        assert.equal(owner.tickets.find(row => row.ticketId === ticket.ticketId)?.status, 'DISCHARGED');
        const nativeCount = [fixture.bitcoin.transfers.length, fixture.solana.transfers.length], evmCount = runtime.transactions.length;
        const duplicate = await claimRequest('redeem', redemption); assert.equal(duplicate.admission.duplicate, true);
        assert.equal(duplicate.request.state, 'CONFIRMED');
        assert.equal((await claimRequest('resume', { requestId: redemption.requestId })).request.state, 'CONFIRMED');
        assert.deepEqual([fixture.bitcoin.transfers.length, fixture.solana.transfers.length], nativeCount);
        assert.equal(runtime.transactions.length, evmCount, 'NATIVE_CLAIM_DUPLICATE_BURN_OR_PAYOUT');
        writeFixturePrivate(join(privateDirectory, 'durable-native-owner-after-redemption.json'), await claimOwnerView());
        result.acceptance.durableApiRedemptionDuplicateNoEffect = true;
      } else {
        if (beginPayoutAuditProfile) {
          await owners[index].suspend();
          assert.equal(owners[index].report().available, false); assert.equal(owners[index].report().childExited, true);
          result.ownerStops.push({ assetIndex: index, phase: 'after-source-exit-before-audit-redemption', ownerAbsent: true, childExited: true });
          save();
        }
        const redemption = { requestId: freshFixtureId(), claimDomain: claimDomainCommitment(claims.configs[index]),
          caller: runtime.accounts[index + 3], amount: amounts[index], maxFee: claims.configs[index].refundMaxFee };
        const ticket = await controller.requestRedemption(redemption), burnCount = runtime.transactions.length;
        assert.equal((await controller.requestRedemption(redemption)).ticketId, ticket.ticketId);
        assert.equal(runtime.transactions.length, burnCount, 'NATIVE_CLAIM_DUPLICATE_BURN');
        if (loadedV3Profile) {
          // Preserve the consumed REDEEM audit even if a later payout stage
          // fails. Project only the existing safe fields from the live journal.
          const retained = await ownedClaimControllerJournal(controllerKeeper, runtime, claims).read();
          result.redemptionAuthorization = captureLoadedV3RedemptionAudit(retained.evm);
          save();
        }
        if (beginPayoutAuditProfile) {
          // No extra quorum/native warmup after REDEEM. The original controller
          // owns the one-use stop; neither a callback nor token selects it here.
          captureBeginPayoutAuditBeforeV1(fixture, controller);
          let stopped;
          try { await controller.payout({ ticketId: ticket.ticketId }); }
          catch (error) {
            // Preserve every real earlier failure and its diagnostic context.
            if (!isNativeClaimBeginPayoutAuditStopV1(controller, error)) throw error;
            stopped = error;
          }
          result.beginPayoutAudit = consumeNativeClaimBeginPayoutAuditStopV1(controller, stopped);
          result.boundaryReached = true;
          const terminal = await captureBeginPayoutAuditTerminalV1(fixture, controller, result.beginPayoutAudit);
          writeFixturePrivate(join(privateDirectory, 'final-native.json'), terminal.inventories);
          writeFixturePrivate(join(privateDirectory, 'final-graph-balances.json'), terminal.graphBalances);
          result.auditTerminal = terminal.public; result.boundaryAccepted = true; result.completeRedemption = false;
          result.finalNativeInventoryCaptured = true; result.finalGraphBalancesReobserved = true;
          await audit(); assertBeginPayoutAuditResultV1(result);
          assert.deepEqual(nativeClaimSourcePins(), result.sourcePins, 'NATIVE_CLAIM_SOURCE_CHANGED');
          result.success = true; result.phase = 'completed';
          return; // Original finally owns cleanup; no beginPayout, native key/send or CO path follows.
        }
        let paid = await controller.payout({ ticketId: ticket.ticketId });
        if (paid.status !== 'DISCHARGED') { await confirmOriginal(ticket.ticketId); paid = await controller.payout({ ticketId: ticket.ticketId }); }
        assert.equal(paid.status, 'DISCHARGED');
        const nativeCount = [fixture.bitcoin.transfers.length, fixture.solana.transfers.length], evmCount = runtime.transactions.length;
        await controller.payout({ ticketId: ticket.ticketId });
        assert.deepEqual([fixture.bitcoin.transfers.length, fixture.solana.transfers.length], nativeCount);
        assert.equal(runtime.transactions.length, evmCount);
      }
      result.redemptions.push({ assetIndex: index, amount: exitAmount, status: 'DISCHARGED', duplicateHadNoEffect: true });
      await audit();
    }
    result.acceptance.recipientNativeRedemptions = selectedAssets.length === 2;
    result.acceptance.requestedNativeRedemptions = true;
    if (graphProfile) {
      await exitAndRedeemClaimGraphPayout({ fixture, graphCase, controller, stage, audit, confirmOriginal, privateDirectory,
        onProof: async ({ label, relation, proof }) => publicProof(label, relation, proof) });
      result.redemptions.push({ assetIndex: 1, amount: CLAIM_GRAPH_AMOUNTS.payout, role: 'solver',
        status: 'DISCHARGED', duplicateHadNoEffect: true });
      result.claimFundedGraph = graphCase.report; save();
    }
    if (!loadedFactsProfile && (!durableApiProfile || graphProfile)) {
      await stage('return-expired-unissued-original-sol-deposit');
      const expiring = await prepareOwner(1, '2000000', 'refund', String((await runtime.time()) + 600n));
      await expiring.owner.suspend(); await controller.ingress({ intentId: expiring.prepared.intentId });
      await confirmOriginal(expiring.prepared.intentId);
      await runtime.advanceTo(BigInt(expiring.statement.validUntil) + 1n);
      const voided = await controller.voidDeposit({ intentId: expiring.prepared.intentId });
      assert.equal(voided.status, 'REFUND_PENDING'); assert.ok(voided.ticketId);
      let refunded = await controller.payout({ ticketId: voided.ticketId });
      if (refunded.status !== 'DISCHARGED') { await confirmOriginal(voided.ticketId); refunded = await controller.payout({ ticketId: voided.ticketId }); }
      assert.equal(refunded.status, 'DISCHARGED'); assert.equal(expiring.owner.report().available, false);
      const nativeCount = fixture.solana.transfers.length, transactionCount = runtime.transactions.length;
      assert.equal((await controller.voidDeposit({ intentId: expiring.prepared.intentId })).ticketId, voided.ticketId);
      assert.equal((await controller.payout({ ticketId: voided.ticketId })).status, 'DISCHARGED');
      assert.equal(fixture.solana.transfers.length, nativeCount);
      assert.equal(runtime.transactions.length, transactionCount);
      result.expiredDepositRefund = { amount: '2000000', originalCutoff: expiring.statement.validUntil,
        ownerAbsent: true, originalTicketDischarged: true, duplicateHadNoEffect: true };
      result.acceptance.expiredOriginalSourceRefund = true;
    }
    const final = await fixture.observer.read(); await fixture.observer.assertCurrent(final);
    for (const gateway of final.gateways) {
      for (const field of ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees'])
        assert.equal(gateway[field], '0', 'NATIVE_CLAIM_FINAL_LIABILITY_' + field);
      assert.equal(gateway.activePayout, '0'.repeat(64));
    }
    result.finalClaimState = final.gateways.map(gateway => ({ claimDomain: gateway.claimDomain,
      wrapperSupply: gateway.wrapperSupply, pendingRedemptions: gateway.pendingRedemptions,
      pendingRefunds: gateway.pendingRefunds, heldUnissued: gateway.heldUnissued, reservedFees: gateway.reservedFees,
      intentCount: gateway.intentCount, ticketCount: gateway.ticketCount }));
    const finalNative = [await fixture.bitcoin.inventory(), await fixture.solana.inventory()];
    writeFixturePrivate(join(privateDirectory, 'final-native.json'), finalNative);
    if (nonceProfile) checkNoncePayout(initialNative[1], finalNative[1]);
    assert.equal(BigInt(finalNative[0].accounts.find(a => a.role === 'recipient').total)
      - BigInt(initialNative[0].accounts.find(a => a.role === 'recipient').total), BigInt(expectedBalances[0]));
    assert.equal(BigInt(finalNative[1].accounts.find(a => a.role === 'recipient').total)
      - BigInt(initialNative[1].accounts.find(a => a.role === 'recipient').total), 3000000n);
    const bitcoinEffects = selectedAssets.includes(0) ? 2 : 0;
    const solanaEffects = graphProfile ? 5 : (durableApiProfile || loadedFactsProfile) ? 2 : 4;
    assert.equal(fixture.bitcoin.transfers.length, bitcoinEffects); assert.equal(fixture.solana.transfers.length, solanaEffects);
    result.nativeEffects = { bitcoin: bitcoinEffects, solana: solanaEffects, eachBroadcastOnce: [...fixture.bitcoin.transfers, ...fixture.solana.transfers]
      .every(row => row.broadcastAttempts === 1) };
    assert.equal(result.nativeEffects.eachBroadcastOnce, true);
    result.acceptance.allClaimLiabilitiesClosed = true; await audit();
    if (loadedFactsProfile) {
      (loadedV3Profile ? assertLoadedV3ProofBoundary : assertLoadedFactsProofBoundary)(result.proofs.map(proof => proof.relation), 'redeemed');
      assert.deepEqual(fixture.graphSolana.transfers.map(row => [row.phase, row.broadcastAttempts, row.intent.lamports]),
        [['OBSERVED_FINALIZED', 1, '1000000']]);
      assert.equal(fixture.graphBitcoin.transfers.length, 0);
      assert.deepEqual(final.gateways.map(gateway => [gateway.intentCount, gateway.ticketCount]), [['0', '0'], ['1', '1']]);
      if (loadedV3Profile) {
        const retained = await ownedClaimControllerJournal(controllerKeeper, runtime, claims).read();
        result.redemptionAuthorization = captureLoadedV3RedemptionAudit(retained.evm);
        result.finalNativeInventoryCaptured = true;
        const originalGraph = fixture.graphSolana.transfers[0];
        const graphBalances = { solver: await fixture.graphSolana.balance(fixture.graphSolana.solver),
          recipient: await fixture.graphSolana.balance(fixture.graphSolana.recipients[0]) };
        assert.equal(graphBalances.solver, originalGraph.observation.sourceAfter);
        assert.equal(graphBalances.recipient, originalGraph.observation.recipientAfter);
        writeFixturePrivate(join(privateDirectory, 'final-graph-balances.json'), graphBalances);
        result.finalGraphBalancesReobserved = true;
      }
      result.loadedFactsProbe.ownerClaimFullyRedeemed = true;
      result.loadedFactsProbe.success = true;
    }
    if (ingressV3Profile && graphProfile) result.fullNativeGraphAcceptance = true;
    assert.deepEqual(nativeClaimSourcePins(), result.sourcePins, 'NATIVE_CLAIM_SOURCE_CHANGED');
    result.success = true; result.phase = 'completed';
  } catch (error) {
    result.success = false; result.phase = 'failed'; result.errorCode = safeCode(error);
    result.causeCode = error.cause ? safeCode(error.cause) : null;
    const diagnostic = privateFailureDiagnostic(error);
    result.errorCauseCodes = diagnostic.causeCodes;
    if (diagnostic.auditBudget) result.errorAuditBudget = diagnostic.auditBudget;
    writeFixturePrivate(join(privateDirectory, 'error-location.json'), {
      errorCode: result.errorCode, causeCode: result.causeCode,
      frames: String(error.stack ?? '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 12),
      causeFrames: String(error.cause?.stack ?? '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 12),
    });
    if (error.fixtureCleanup) result.cleanup = error.fixtureCleanup;
    try { await audit(); } catch { result.finalAuditUnavailable = true; }
    process.exitCode = 1;
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (result.success && !['closedEvm', 'closedSolana', 'closedBitcoin'].every(key => result.cleanup[key] === true)) {
      result.success = false; result.phase = 'failed'; result.errorCode = 'NATIVE_CLAIM_CLEANUP_FAILED'; process.exitCode = 1;
    }
    if (beginPayoutAuditProfile && !result.success) result.boundaryAccepted = false;
    if (loadedFactsProfile && result.loadedFactsProbe) result.loadedFactsProbe.success = result.success;
    if (ingressV3Profile && graphProfile) result.fullNativeGraphAcceptance = result.success;
    save(); process.stdout.write(JSON.stringify({ phase: result.phase, success: result.success, errorCode: result.errorCode ?? null }) + '\n');
  }
}
await main();
