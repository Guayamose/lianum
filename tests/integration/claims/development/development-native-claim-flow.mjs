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
import { runDevelopmentBtcSolGraphCase, exitAndRedeemDevelopmentBtcSolPayout } from './development-btc-sol-graph-case.mjs';
import { DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS, assertBtcSolGraphProofReceipts, assertBtcSolRecipientWithdrawalTelemetry }
  from './development-btc-sol-graph-proof-evidence.mjs';
import { ROOT, LOCAL, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';
import { hash } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { createRoleProofClient } from '../../../../packages/proofs/src/jobs/role-client.mjs';
import { NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 }
  from '../../../../packages/proofs/src/native-ingress/metadata/native-ingress-v3-profile.mjs';
import { createOwnedNativeClaimGraphV3Fixture } from '../../fixtures/claims/lifecycle/owned-native-claim-fixture.mjs';
import { createDurableNativeClaimControllerKeeper, createNativeClaimController }
  from '../../../../packages/backend/src/claims/controller/controller.mjs';
import { claimDomainCommitment } from '../../../../packages/backend/src/claims/protocol/framing.mjs';
import { decodeDepositIntentInputs } from '../../../../packages/backend/src/execution/account/preparation/deposit-intent.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatPortfolioAuthority } from '../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { createNativeClaimPortfolioView } from '../../../../packages/backend/src/claims/operations/portfolio-view.mjs';
import { createGenericAccountKeeper } from '../../../../packages/engine/src/execution/accounts/generic-account-keeper.mjs';
import { createFlatAccountSession } from '../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { startFlatAccountHttp } from '../../../../packages/backend/src/api/accounts/flat-account-http.mjs';
import { createNativeClaimSession, nativeClaimSessionController } from '../../../../packages/backend/src/api/claims/native-claim-session.mjs';
import { startNativeClaimHttp } from '../../../../packages/backend/src/api/claims/native-claim-http.mjs';
import { checkClaimGraphV3Bootstrap, checkClaimGraphV3Inventory } from '../graph/validation/native-claim-graph-v3-nonce-checks.mjs';
import { validateSolanaNonceBindingTransaction } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { DEVELOPMENT_NATIVE_CLAIM_PROFILE, DEVELOPMENT_NATIVE_CLAIM_RESULT } from './development-native-claim-policy.mjs';
import { developmentNativeClaimSourcePins } from './development-native-claim-source-pins.mjs';
import { assertRoleProofReceiptRecords, assertWithdrawalProofTelemetry } from './development-native-claim-proof-evidence.mjs';
import { readDevelopmentNativeClaimReceipts } from './development-native-claim-receipts.mjs';

// The only selector is the source-pinned literal entry/worker pair. There is
// no caller profile, pool, factory, witness or proof-backend option.
const graphWorker = join(ROOT, 'integration/claims/development/development-btc-sol-graph-flow.mjs');
const btcToSol = process.argv[1] !== undefined && realpathSync(process.argv[1]) === graphWorker;
const LOCAL_RUN = btcToSol ? '.local/development-btc-sol-graph-v1' : '.local/development-native-claim-roundtrip-v1';
const selectedAssets = btcToSol ? [0] : [0, 1];
const sourcePins = btcToSol ? developmentBtcSolGraphSourcePins : developmentNativeClaimSourcePins;
const bare = value => value.slice(2);
const code = error => String(error?.message ?? '').match(/\b(?:DEVELOPMENT_CLAIM|CLAIM|SOLANA|BITCOIN|PW|FLAT|NATIVE|ROLE_CLIENT|LOCAL_EVM|COMBINED_OPERATOR)_[A-Z0-9_]+\b/)?.[0]
  ?? 'DEVELOPMENT_CLAIM_FAILED';
export async function runDevelopmentNativeClaimAcceptance() {
  assert.equal(arguments.length, 0, 'DEVELOPMENT_CLAIM_NO_WORKER_OPTIONS');
  assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
  assert.equal(realpathSync(process.argv[1]), btcToSol ? graphWorker : fileURLToPath(import.meta.url));
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT, btcToSol ? 'integration/claims/development/run-development-btc-sol-graph-flow.mjs' : 'integration/claims/development/run-development-native-claim-flow.mjs'));
  const lock = JSON.parse(readFileSync(join(ROOT, LOCAL_RUN, 'active.lock')));
  assert.equal(lock.pid, process.ppid); assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, LOCAL_RUN + '/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit'), proofsDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 }); mkdirSync(proofsDirectory, { mode: 0o700 });
  const result = { format: btcToSol ? DEVELOPMENT_BTC_SOL_GRAPH_RESULT : DEVELOPMENT_NATIVE_CLAIM_RESULT,
    profile: btcToSol ? DEVELOPMENT_BTC_SOL_GRAPH_PROFILE : DEVELOPMENT_NATIVE_CLAIM_PROFILE, runId: lock.runId,
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
      btcToSol ? 'One original CBTC invoice pays a separate solver for an explicitly priced SOL delivery; this establishes no asset parity or FX discovery.'
        : 'Original graph peers supply their required current source coverage but perform no economic graph transfer.'] };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const stage = async name => { result.phase = name; result.stages.push({ name, at: new Date().toISOString() }); save();
    process.stdout.write(JSON.stringify({ stage: name }) + '\n'); };
  let fixture, controllerKeeper, controller, accountKeeper, session, http, claimSession, claimHttp, cleanupPromise, interrupted = false;
  const owners = [], handoffs = [], deposits = [], accounts = [], proofClients = {}, ingressProverIdentity = freshFixtureId();
  const earlier = new Map([LOCAL, NATIVE_INGRESS_V3_LOCAL].map(local => [local,
    new Set(existsSync(join(local, 'attempts')) ? readdirSync(join(local, 'attempts')) : [])]));
  const collected = new Set();
  const originalLegacyTelemetry = join(GOLDEN, 'evidence/paeg-proof-attempts');
  const earlierLegacyTelemetry = new Set(existsSync(originalLegacyTelemetry) ? readdirSync(originalLegacyTelemetry) : []);
  function retainProof(label, relation, proof) {
    const bytes = Buffer.isBuffer(proof.proof) || proof.proof instanceof Uint8Array ? Buffer.from(proof.proof) : Buffer.from(proof.proof, 'hex');
    const name = String(result.proofs.length + 1).padStart(3, '0') + '-' + label, inputs = fixtureJSON(proof.publicInputs);
    let evidence = proof.evidence ?? proof.metrics ?? null;
    if (relation === 'deposit_intent' || (btcToSol && DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS.includes(relation))) {
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
      evidence = (btcToSol && evidence.purpose === 'recipient' ? assertBtcSolRecipientWithdrawalTelemetry : assertWithdrawalProofTelemetry)({ returnedMetrics: evidence, storedMetrics: JSON.parse(telemetry),
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
      ...(btcToSol ? [['graph-bitcoin', fixture?.graphBitcoin], ['graph-solana', fixture?.graphSolana]] : [])]) if (native)
      writeFixturePrivate(join(privateDirectory, name + '.json'), { metadata: native.metadata, transfers: native.transfers });
    for (const [local, previous] of earlier) for (const id of (existsSync(join(local, 'attempts')) ? readdirSync(join(local, 'attempts')) : [])) {
      if (previous.has(id) || collected.has(id)) continue;
      const path = join(local, 'attempts', id, 'proof-manifest.json'); if (!existsSync(path)) continue;
      const manifestBytes = readFileSync(path), manifest = JSON.parse(manifestBytes);
      if (!['native_claim_ingress_v3', 'native_claim_discharge'].includes(manifest.relation)) continue;
      assert.equal(manifest.selfVerified, true);
      if (manifest.relation === 'native_claim_ingress_v3') {
        assert.equal(local, NATIVE_INGRESS_V3_LOCAL); assert.equal(manifest.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION);
        assert.equal(manifest.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
      } else { assert.equal(local, LOCAL); assert.equal(manifest.keySHA256, '0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83'); }
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
  async function claimRequest(action, body, discard = false) {
    const response = await fetch(claimHttp.origin + '/api/native-claims/' + action, { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: claimHttp.origin, 'x-native-claim-token': claimHttp.clientAccess.token }, body: JSON.stringify(body) });
    assert.equal(response.status, 202);
    if (discard) { await response.body.cancel(); result.checks.admittedResponseDiscarded = true; }
    else { const admission = await response.json(); assert.equal(admission.admitted, true); assert.equal(admission.requestId, body.requestId); }
    const view = await claimSession.idle(); controller = nativeClaimSessionController(claimSession);
    const request = view.requests.find(row => row.requestId === body.requestId); assert.ok(request);
    result.claimRequests.push({ action, requestId: body.requestId, state: request.state, errorCode: request.errorCode,
      via: 'ORIGINAL_NATIVE_CLAIM_HTTP', admissionResponseDiscarded: discard }); save(); return request;
  }
  try {
    save(); fixture = await createOwnedNativeClaimGraphV3Fixture(privateDirectory, { onStage: stage, onDeployment: audit });
    const { runtime, claims, system } = fixture, amounts = btcToSol ? ['100000', '0'] : ['100000', '3000000'];
    await stage('registered-original-v4-quorum-before-funds');
    assert.equal(fixture.quorum.authorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4');
    for (const poolIndex of [0, 1]) { const checkpoint = await fixture.graphQuorum.checkpoint({ poolIndex, requestId: freshFixtureId() });
      const health = await fixture.graphQuorum.health({ poolIndex }); assert.deepEqual(checkpoint.head, health.head); }
    assert.equal(result.proofs.length, 0); assert.equal(fixture.owners.length, 0);
    for (const native of [fixture.bitcoin, fixture.solana, fixture.graphBitcoin, fixture.graphSolana]) assert.equal(native.transfers.length, 0);
    result.checks.registeredOriginalQuorumPreflight = true;
    const initialNative = [await fixture.bitcoin.inventory(), await fixture.solana.inventory()];
    result.nonceInfrastructure = checkClaimGraphV3Bootstrap(initialNative[1], fixture.solana, claims.configs[1]);
    result.checks.dualNonceInfrastructureExcluded = true; writeFixturePrivate(join(privateDirectory, 'initial-native.json'), initialNative);
    controllerKeeper = await createDurableNativeClaimControllerKeeper({ runtime, claims, path: join(privateDirectory, 'controller.v3'), password: freshFixtureId() });
    for (const role of ['claim_ingress', 'claim_discharge']) proofClients[role] = createRoleProofClient(role);
    await openController();
    for (const index of selectedAssets) {
      await stage('original-native-ingress-and-private-issuance-' + index);
      const owner = await fixture.createOwner(index, 'asset-' + index); owners[index] = owner;
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
    result.checks.ownerOfflineNativeIngress = true; result.checks.originalNotesCreditedOnce = true;
    await stage('clean-original-keeper-and-controller-restart');
    const countsBeforeRestart = [runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.solana.transfers.length];
    const nativeReceipts = btcToSol ? [await controller.privateNativeReceipt({ operationId: deposits[0].intentId })]
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
    if (btcToSol) {
      // The empty CSOL owner exists only for the original two-pool portfolio;
      // no SOL custody deposit or private SOL note is synthesized.
      owners[1] = await fixture.createOwner(1, 'empty-sol-portfolio');
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
        if (btcToSol && event.stage === 'OWNER_SUSPENDED_BEFORE_NATIVE') {
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
    session = await createFlatAccountSession({ keeper: accountKeeper, ownerHandoff: { ownerView: portfolioView } }); http = await startFlatAccountHttp({ session, port: 0 });
    const funded = await ownerView(); assert.equal(funded.status, 'LIVE'); assert.equal(funded.coherent, true);
    assert.deepEqual(funded.assets.map(asset => asset.balances.available), amounts);
    const restartCount = runtime.transactions.length; await accountRequest('restart');
    for (const owner of owners) { await owner.suspend(); await owner.restart(); }
    assert.deepEqual((await ownerView()).assets.map(asset => asset.balances.available), amounts); assert.equal(runtime.transactions.length, restartCount);
    result.checks.ownerChildAndCoordinatorRestartNoSend = true;
    if (btcToSol) {
      graphCase = await runDevelopmentBtcSolGraphCase({ fixture, owner: owners[0], account: accounts[0], execution: graphExecution,
        request: accountRequest, ownerView, stage, audit, onProof: async event => retainProof('btc-sol-' + event.label, event.relation, event.proof), privateDirectory });
      result.graph = graphCase.report; result.graphExecutionEstablished = true;
    }
    for (const index of selectedAssets) {
      await stage('original-private-exit-and-native-redemption-' + index);
      const exitId = 'development_native_exit_' + index, exitRef = freshFixtureId();
      const exitRole = btcToSol ? 'change' : 'source', exitAmount = btcToSol ? '80000' : amounts[index];
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
        if (btcToSol && reply.errorCode !== null && reply.errorCode !== 'CLAIM_NATIVE_FINALITY_UNRESOLVED') {
          writeFixturePrivate(join(privateDirectory, 'btc-sol-original-redemption-failure.json'), {
            reply, ticket, originalControllerStatus: await controller.status(), nativeRecords: fixture.bitcoin.transfers });
          // Preserve an original audit/authorization failure; a finality label
          // cannot grant permission to resume or refresh its signing fence.
          throw new Error(reply.errorCode);
        }
        assert.equal(reply.state, 'RECONCILIATION_REQUIRED');
        assert.ok(reply.errorCode === null || reply.errorCode === 'CLAIM_NATIVE_FINALITY_UNRESOLVED');
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
    if (btcToSol) {
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
    checkClaimGraphV3Inventory(finalNative[1], fixture.solana, claims.configs[1]);
    assert.deepEqual(fixture.solana.transfers.map(row => row.route), btcToSol ? [] : ['deposit', 'redeem']);
    assert.deepEqual(fixture.bitcoin.transfers.map(row => row.route), btcToSol ? ['deposit', 'redeem', 'redeem'] : ['deposit', 'redeem']);
    for (const row of fixture.bitcoin.transfers) { assert.equal(row.phase, 'OBSERVED_CONFIRMED'); assert.equal(row.broadcastAttempts, 1); assert.equal(row.confirmationMiningAttempts, 1); }
    for (const row of fixture.solana.transfers) {
      const role = row.route === 'deposit' ? 'depositor' : 'escrow', pin = finalNative[1].nonceInfrastructureByAuthority[role];
      const decoded = validateSolanaNonceBindingTransaction(row.nativeWire, row.intent);
      assert.equal(decoded.signatureHex, row.nativeId); assert.equal(decoded.transactionSHA256, row.transactionSHA256);
      assert.equal(row.phase, 'OBSERVED_FINALIZED'); assert.equal(row.broadcastAttempts, 1);
      assert.deepEqual([decoded.wireBindingVersion, decoded.effectIndex, decoded.wireBindingPosition], ['2', '1', '2']);
      assert.equal(row.intent.durableNonce, initialNative[1].nonceInfrastructureByAuthority[role].nonceAccount.durableNonce);
      assert.notEqual(row.intent.durableNonce, pin.nonceAccount.durableNonce); assert.equal(row.observation.nativeWire, row.nativeWire);
    }
    if (btcToSol) {
      assert.deepEqual(finalNative[1].nonceInfrastructureByAuthority, initialNative[1].nonceInfrastructureByAuthority);
      assert.deepEqual(finalNative[1].accounts, initialNative[1].accounts);
      assert.deepEqual(finalNative[1].feeAudit, initialNative[1].feeAudit);
      result.checks.solCustodyAndInfrastructureNeverSpent = true;
      const sourceReader = await createFlatSystemStateReader({ runtime, system, poolIndex: 0 });
      const sourceFinal = await sourceReader.read();
      assert.equal(sourceFinal.ledger.publicState.backedAmount, '0'); assert.equal(sourceFinal.ledger.publicState.actualAssetBalance, '0');
      assert.equal(sourceFinal.ledger.publicState.liveReservations, 0); assert.equal(sourceFinal.state.spentTagCount, '4');
      result.checks.originalGraphBackingClosed = true;
    } else result.checks.dualNonceIngressAndPayoutAdvanced = true;
    result.nativeEffects = { bitcoin: fixture.bitcoin.transfers.length, solana: fixture.solana.transfers.length,
      graphBitcoin: fixture.graphBitcoin.transfers.length, graphSolana: fixture.graphSolana.transfers.length,
      eachBroadcastOnce: [...fixture.bitcoin.transfers, ...fixture.solana.transfers, ...(btcToSol ? fixture.graphSolana.transfers : [])].every(row => row.broadcastAttempts === 1) };
    result.checks.allOriginalLiabilitiesClosed = true; await audit(); result.phase = 'completed'; result.success = true;
  } catch (error) {
    result.failedStage = result.phase; result.phase = 'failed'; result.success = false; result.errorCode = code(error);
    if (error.fixtureCleanup) Object.assign(result.cleanup, error.fixtureCleanup);
    writeFixturePrivate(join(privateDirectory, 'error-private.json'), { message: String(error.message), stack: String(error.stack),
      cause: error.cause ? String(error.cause.stack ?? error.cause.message) : null }); await audit().catch(() => {});
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
