import {applicationFlowEntrypoints} from '../runners/application-flow-entrypoints.mjs';
/** Supervised genuine share TOP_UP/EXIT and public MetaMorpho redemption.
 * Source of shares is an explicit public fixture deposit. No private PAEG
 * conversion, public network, new credit or lost-keeper recovery is inferred. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, GOLDEN } from '@lianum/proofs/catalog';
import { hash } from '@lianum/proofs/tooling/tooling';
import { createOwnedLocalEvmV2 } from '../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { evmRuntimeCodeHash } from '../../../packages/backend/src/chains/evm/contracts/evm-code-hash.mjs';
import { createOfficialProtocolFixture } from '../../../packages/backend/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import { createOwnedPoolAsset } from '../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs';
import { deployFlatSystem } from '../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { createLocalFlatOperator } from '../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { createFlatOwnerProcess } from '../../../packages/backend/src/custody/processes/flat-owner-process.mjs';
import { createFlatAccountAuthority } from '../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createGenericAccountKeeper } from '@lianum/engine/accounts/keeper';
import { createFlatAccountSession } from '@lianum/backend/accounts/session';
import { startFlatAccountHttp } from '@lianum/backend/accounts/http';
import { createFlatSystemStateReader } from '../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { createOwnedMetaMorphoVault, assertOwnedMetaMorphoReceipt } from '../../../packages/backend/src/defi/vaults/owned-metamorpho-vault.mjs';
import { createOwnedPrivateVaultExit } from '@lianum/backend/defi/withdrawal';
import { privateMetaMorphoSourcePins } from './private-metamorpho-source-pins.mjs';
import { assertPrivateMetaMorphoProofTelemetry } from './private-metamorpho-proof-evidence.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../fixtures/runners/owned-flat-fixture.mjs';

const bare = value => value.slice(2);
const safeCode = error => /^[A-Z][A-Z0-9_]{2,120}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : 'PRIVATE_METAMORPHO_FLOW_FAILED';
async function main() {
  assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
  assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    applicationFlowEntrypoints.privateMetaMorpho.entry);
  const lock = JSON.parse(readFileSync(join(ROOT, '.local/private-metamorpho-flow/active.lock')));
  assert.equal(lock.pid, process.ppid);
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, '.local/private-metamorpho-flow/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit'),
    proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 }); mkdirSync(proofDirectory, { mode: 0o700 });
  const result = { format: 'LIANUM_PRIVATE_METAMORPHO_FLOW_RESULT_V1', runId: lock.runId,
    startedAt: new Date().toISOString(), phase: 'starting', success: false, localOnly: true,
    fakeFundsOnly: true, publicNetwork: false, sourcePins: privateMetaMorphoSourcePins(),
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, stages: [], proofs: [],
    accountRequests: [], cleanup: { closedEvm: false }, nativeRuntimesStarted: { bitcoin: false, solana: false },
    keeperLossRecoveryEstablished: false, nativeProcessRestartEstablished: false,
    privatePAEGConversionEstablished: false, fullWalletAcceptance: false, checks: {},
    disclosure: ['Original private share account and genuine TOP_UP/EXIT proofs in one fresh fake-value local system.',
      'Shares originate in an explicit public official MetaMorpho deposit; redemption remains public at the original owner address.',
      'Owner child/coordinator restart with surviving original keeper credentials; no lost-keeper or node replacement claim.',
      'The fixture deliberately discards a completed redemption response, then reconciles original receipts without resending.'] };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const stage = async name => { result.phase = name; result.stages.push({ name, at: new Date().toISOString() });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n'); };
  let runtime, protocol, capability, system, owner, account, keeper, session, http, vault, bridge, reader,
    closed = false, interrupted = false;
  const operators = [];
  const telemetryDirectory = join(GOLDEN, 'evidence/paeg-proof-attempts');
  const earlierTelemetry = new Set(existsSync(telemetryDirectory) ? readdirSync(telemetryDirectory) : []);
  async function audit() {
    if (runtime) writeFixturePrivate(join(privateDirectory, 'evm.json'), {
      metadata: runtime.metadata, transactions: runtime.transactions, receipts: runtime.receipts });
    save();
  }
  const onProof = async ({ label, relation, proof }) => {
    const bytes = Buffer.isBuffer(proof.proof) || proof.proof instanceof Uint8Array
      ? Buffer.from(proof.proof) : Buffer.from(proof.proof, 'hex');
    const name = String(result.proofs.length + 1).padStart(3, '0') + '-' + label;
    const inputs = fixtureJSON(proof.publicInputs);
    const originalMetrics = proof.metrics;
    assert.match(originalMetrics.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(earlierTelemetry.has(originalMetrics.id + '.json'), false, 'PRIVATE_METAMORPHO_FRESH_PROOF_ATTEMPT');
    const telemetry = readFileSync(join(telemetryDirectory, originalMetrics.id + '.json'));
    const evidence = assertPrivateMetaMorphoProofTelemetry({ relation, returnedMetrics: originalMetrics,
      storedMetrics: JSON.parse(telemetry), proofSHA256: hash(bytes),
      publicInputsSHA256: hash(JSON.stringify(proof.publicInputs)), telemetrySHA256: hash(telemetry) });
    writeFileSync(join(proofDirectory, name + '.bin'), bytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(proofDirectory, name + '.inputs.json'), inputs, { flag: 'wx', mode: 0o600 });
    result.proofs.push({ label, relation, file: name, proofSHA256: hash(bytes),
      publicInputsSHA256: hash(inputs), evidence }); save();
  };
  async function cleanup() {
    if (closed) return; closed = true;
    await account?.abort().catch(() => {});
    if (http) await http.close().catch(() => {}); else if (session) await session.close().catch(() => {});
    else await keeper?.close().catch(() => {});
    await account?.close().catch(() => {}); await owner?.close().catch(() => {});
    for (const operator of operators) { try { operator.close(); } catch {} }
    if (runtime) try { result.cleanup.evm = await runtime.close({ removeScratch: true });
      result.cleanup.closedEvm = result.cleanup.evm.stopped === true; }
    catch { result.cleanup.closedEvm = false; }
  }
  const stop = () => { if (interrupted) return; interrupted = true;
    result.success = false; result.errorCode = 'PRIVATE_METAMORPHO_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN';
    void audit().catch(() => {}).then(cleanup).finally(() => { result.phase = 'failed'; save(); process.exit(2); }); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  async function request(action, body = {}) {
    const response = await fetch(http.origin + '/api/flat-account/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: http.origin, 'x-flat-account-token': http.clientAccess.token },
      body: JSON.stringify(body) });
    assert.equal(response.status, 202, 'PRIVATE_METAMORPHO_HTTP_ADMISSION');
    assert.equal((await response.json()).admitted, true);
    const view = await session.idle(); result.accountRequests.push({ action, requestId: body.requestId ?? null,
      lastAdmission: view.admissions.at(-1), via: 'ORIGINAL_FLAT_ACCOUNT_HTTP' }); save(); return view;
  }
  function row(view, requestId) { const value = view.requests.find(value => value.requestId === requestId);
    assert.ok(value); return value; }
  async function ownerView() {
    const response = await fetch(http.origin + '/api/flat-account/owner', {
      headers: { Origin: http.origin, 'x-flat-owner-token': http.ownerAccess.token } });
    assert.equal(response.status, 200); return response.json();
  }
  try {
    save(); await stage('fresh-owned-evm-and-official-metamorpho');
    runtime = await createOwnedLocalEvmV2(); protocol = await createOfficialProtocolFixture(runtime);
    const sender = runtime.accounts[0], assets = 1_000_000n;
    const underlyingBefore = (await protocol.read(protocol.first, 'balanceOf', [sender]))[0];
    await protocol.send(protocol.first, 'approve', [protocol.vault.address, assets]);
    await protocol.send(protocol.vault, 'deposit', [assets, sender]);
    const shares = (await protocol.read(protocol.vault, 'balanceOf', [sender]))[0];
    assert.equal(shares, 1_000_000_000_000_000_000n); assert.ok(shares < 1n << 64n);
    assert.equal((await protocol.read(protocol.vault, 'symbol'))[0], 'LMOR');
    assert.equal((await protocol.read(protocol.vault, 'decimals'))[0], 18n);
    capability = await createOwnedPoolAsset({ runtime, kind: 'ERC20', symbol: 'LMOR', decimals: 18,
      deployment: { address: protocol.vault.address, transactionHash: protocol.vault.receipt.transactionHash,
        expectedCode: protocol.vault.code, codeHash: evmRuntimeCodeHash(protocol.vault.code) } });
    const underlyingCapability = await createOwnedPoolAsset({ runtime, kind: 'ERC20', symbol: 'PALT', decimals: 6,
      deployment: { address: protocol.first.address, transactionHash: protocol.first.receipt.transactionHash,
        expectedCode: protocol.first.code, codeHash: evmRuntimeCodeHash(protocol.first.code) } });
    for (let signerIndex = 0; signerIndex < 4; signerIndex++) operators.push(createLocalFlatOperator({ signerIndex }));
    system = await deployFlatSystem(runtime, { deploymentDomain: '0x' + freshFixtureId(), registryEpoch: '1',
      rulesRoot: '0x' + hash('note-only-metamorpho-no-native-graph-members'), attesterKeys: operators.map(value => value.publicKey),
      pools: [underlyingCapability, capability].map(assetCapability => ({ assetCapability,
        policy: '0x' + freshFixtureId(), deploymentDomain: '0x' + freshFixtureId() })) });
    await protocol.send(protocol.vault, 'approve', [system.pools[1].address, shares]);
    const ownerDirectory = join(privateDirectory, 'owner'); mkdirSync(ownerDirectory, { mode: 0o700 });
    owner = await createFlatOwnerProcess({ runtime, system, poolIndex: 1, directory: ownerDirectory,
      password: freshFixtureId(), create: true, checkpoint: null,
      onCheckpoint: value => writeFixturePrivate(join(ownerDirectory, 'checkpoint.json'), value) });
    account = await createFlatAccountAuthority({ runtime, system, poolIndex: 1, owner, nativeExecution: null,
      accountId: 'official_metamorpho_shares', journalId: 'official_metamorpho_share_journal' },
    { onProof, onPrivateAudit: audit, onStage: value => stage('account-' + value.stage) });
    keeper = await createGenericAccountKeeper({ config: account.config,
      journal: { path: join(privateDirectory, 'account.vault'), password: freshFixtureId() }, authority: account.authority });
    session = await createFlatAccountSession({ keeper, ownerHandoff: { ownerView: account.ownerView } });
    http = await startFlatAccountHttp({ session, port: 0 });
    reader = await createFlatSystemStateReader({ runtime, system, poolIndex: 1 });
    vault = await createOwnedMetaMorphoVault({ runtime, protocolFixture: protocol });
    bridge = await createOwnedPrivateVaultExit({ runtime, system, poolIndex: 1, account, vault });
    await stage('genuine-private-share-funding');
    const fundingRef = freshFixtureId(), fundingId = 'metamorpho_share_funding';
    await owner.owner.prepareDeposit({ amount: shares.toString(), epoch: String((await runtime.time()) / 600n), exitRecipient: bare(sender) });
    await account.ownerActions.registerTopUp(fundingRef);
    await request('prepare', { requestId: fundingId, kind: 'TOP_UP', ownerOperationRef: fundingRef, assetId: account.assetId });
    assert.equal(row(await request('execute', { requestId: fundingId }), fundingId).state, 'CONFIRMED');
    const funded = await ownerView(); assert.equal(funded.status, 'LIVE');
    assert.equal(funded.balances.available, shares.toString()); assert.equal(funded.backing.held, shares.toString());
    assert.equal(await capability.balance(system.pools[1].address), shares);
    assert.equal(await capability.allowance(sender, system.pools[1].address), 0n);
    result.checks.originalPrivateShareFunding = true;
    await assert.rejects(bridge.prepare({ requestId: fundingId, minimumOutput: '1', deadline: String((await runtime.time()) + 240n) }), /WITHDRAWAL_REQUIRED/);
    await stage('owner-child-and-disposable-coordinator-restart');
    await owner.suspend(); assert.equal((await ownerView()).status, 'UNAVAILABLE');
    const restartCount = runtime.transactions.length;
    await request('restart'); await owner.restart(); await request('reconcile', { requestId: fundingId });
    assert.equal((await ownerView()).balances.available, shares.toString());
    assert.equal(runtime.transactions.length, restartCount); result.checks.originalNoteRestoredWithoutSend = true;
    await stage('genuine-original-private-share-exit');
    const exitRef = freshFixtureId(), exitId = 'metamorpho_original_share_exit';
    await owner.owner.prepareWithdrawal({ role: 'source', epoch: String((await runtime.time()) / 600n) });
    await account.ownerActions.registerExit(exitRef, 'source');
    await request('prepare', { requestId: exitId, kind: 'EXIT', ownerOperationRef: exitRef, assetId: account.assetId });
    assert.equal(row(await request('execute', { requestId: exitId }), exitId).state, 'CONFIRMED');
    assert.equal(await capability.balance(sender), shares); assert.equal(await capability.balance(system.pools[1].address), 0n);
    result.checks.originalPrivateExitAndBacking = true;
    await stage('original-exit-bound-official-redemption');
    const preview = (await protocol.read(protocol.vault, 'previewRedeem', [shares]))[0]; assert.equal(preview, assets);
    const redemption = { requestId: exitId, minimumOutput: preview.toString(), deadline: String((await runtime.time()) + 240n) };
    const prepared = await bridge.prepare(redemption); assert.equal(prepared.phase, 'READY_TO_REDEEM');
    assert.equal(prepared.shares, shares.toString());
    const redeemStart = runtime.transactions.length;
    // Deliberately discard the completed response. Recovery must use the
    // original journal/receipt and cannot issue a second approval/redemption.
    await bridge.execute(exitId); result.checks.completedResponseDeliberatelyDiscarded = true;
    await bridge.reopen(); const recovered = await bridge.reconcile(exitId);
    assert.equal(recovered.phase, 'REDEEMED'); assert.equal(recovered.redeemedUnderlying, assets.toString());
    assert.equal(recovered.underlyingPrivateSpendable, false);
    await bridge.prepare(redemption); await bridge.execute(exitId); await bridge.reconcile(exitId);
    assert.equal(runtime.transactions.length - redeemStart, 2, 'ONE_APPROVAL_ONE_REDEMPTION');
    const receipt = await bridge.originalReceipt(exitId); assertOwnedMetaMorphoReceipt(vault, receipt);
    writeFixturePrivate(join(privateDirectory, 'original-redemption.json'), receipt);
    const duplicateStart = runtime.transactions.length;
    for (const requestId of [fundingId, exitId]) await request('execute', { requestId });
    assert.equal(runtime.transactions.length, duplicateStart); result.checks.originalJournalRecoveryWithoutResend = true;
    const final = await ownerView(), pool = (await reader.read()).ledger.publicState;
    assert.equal(final.status, 'LIVE'); assert.equal(final.balances.available, '0');
    assert.equal(final.backing.held, '0'); assert.equal(final.backing.liabilities, '0');
    assert.equal(pool.actualAssetBalance, '0'); assert.equal(pool.backedAmount, '0');
    assert.equal(await underlyingCapability.balance(system.pools[0].address), 0n);
    assert.equal((await protocol.read(protocol.first, 'balanceOf', [sender]))[0], underlyingBefore);
    assert.equal((await protocol.read(protocol.vault, 'totalAssets'))[0], 0n);
    assert.equal((await protocol.read(protocol.vault, 'totalSupply'))[0], 0n);
    assert.deepEqual(result.proofs.map(value => value.relation), ['deposit_balance', 'withdraw_balance']);
    result.checks.underlyingRestoredAndPrivateLiabilitiesClosed = true;
    result.accepted = { shares: shares.toString(), underlying: assets.toString(), protocol: 'OFFICIAL_METAMORPHO',
      originalPrivateExitBound: true, publicRedemption: true, nativeProcessRestart: false };
    result.success = true; result.phase = 'completed'; await audit();
  } catch (error) {
    result.failedStage = result.phase; result.phase = 'failed'; result.success = false; result.errorCode = safeCode(error);
    writeFixturePrivate(join(privateDirectory, 'error.json'), { message: String(error.message), stack: String(error.stack) });
    await audit().catch(() => {});
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (!result.cleanup.closedEvm) { result.success = false; result.phase = 'failed'; }
    try { assert.deepEqual(privateMetaMorphoSourcePins(), result.sourcePins); result.sourceUnchanged = true; }
    catch { result.sourceUnchanged = false; result.success = false; result.phase = 'failed'; }
    result.finishedAt = new Date().toISOString(); save(); if (!result.success) process.exitCode = 1;
  }
}
main().catch(error => { process.stderr.write(safeCode(error) + '\n'); process.exitCode = 1; });
