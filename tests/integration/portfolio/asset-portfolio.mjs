/** Local application acceptance for real-backed token and vault-share notes.
 * The vault action is explicitly public fixture setup. Private conversion and
 * PAEG DeFi composability are not inferred from subsequent private deposits. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEvm } from '@lianum/engine/execution/local/local-evm';
import { nativeStaticCalldata } from '../../../packages/backend/src/execution/native/dispatch/native-deployment.mjs';
import { createGenericAccountKeeper } from '@lianum/engine/accounts/keeper';
import { ROOT } from '@lianum/proofs/catalog';
import { hash } from '@lianum/proofs/tooling/tooling';
import { createFlatOwnerProcess } from '../../../packages/backend/src/custody/processes/flat-owner-process.mjs';
import { deployBackedAssets, loadBackedAssetDeploymentArtifacts } from '../../../packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs';
import { deployFlatSystem } from '../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { createLocalFlatOperator } from '../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { createOwnedPoolAsset } from '../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs';
import { createOwnedBackedVault, assertOwnedBackedVaultReceipt } from '../../../packages/backend/src/defi/vaults/owned-backed-vault.mjs';
import { createPrivateVaultPortfolioView } from '../../../packages/backend/src/defi/vaults/private-vault-position.mjs';
import { createOwnedPrivateVaultExit } from '@lianum/backend/defi/withdrawal';
import { createFlatSystemStateReader } from '../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { encodeFlatTransaction } from '../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { createFlatAccountAuthority } from '../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatPortfolioAuthority } from '../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { createFlatAccountSession } from '@lianum/backend/accounts/session';
import { startFlatAccountHttp } from '@lianum/backend/accounts/http';
import { assetPortfolioSourcePins } from '../runners/source-pins.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../fixtures/runners/owned-flat-fixture.mjs';

const bare = value => value.slice(2);
const safeCode = error => /^[A-Z][A-Z0-9_]{2,160}$/.exec(error?.code ?? error?.message ?? '')?.[0]
  === (error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'FLAT_ASSET_PORTFOLIO_FAILED';

async function main() {
  assert.equal(process.argv.length, 2); assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.deepEqual(process.execArgv, []); assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])), join(ROOT, 'integration/run-asset-portfolio.mjs'));
  const lock = JSON.parse(readFileSync(join(ROOT, '.local/asset-portfolio/active.lock')));
  assert.equal(lock.pid, process.ppid);
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, '.local/asset-portfolio/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit');
  const proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 }); mkdirSync(proofDirectory, { mode: 0o700 });
  const began = performance.now();
  const result = { format: 'FLAT_WALLET_ASSET_PORTFOLIO_RESULT_V1', runId: lock.runId,
    startedAt: new Date().toISOString(), phase: 'starting', success: false,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, sourcePins: assetPortfolioSourcePins(),
    stages: [], proofs: [], transactions: [], accountRequests: [],
    cleanup: { closedEvm: false, closedBitcoin: null, closedSolana: null },
    nativeRuntimesStarted: { bitcoin: false, solana: false },
    keeperRestart: false, nodeRestart: false, privateConversionAcceptance: false,
    privateDeFiComposabilityAcceptance: false, systemicPrivacyAcceptance: false, fullWalletAcceptance: false,
    disclosure: ['Two genuine contract-backed assets in one local account journal; no cross-asset amount sum.',
      'Vault deposit/redeem and funding approvals are explicit public fixture actions, not private PAEG conversion.',
      'The original EVM, authority/portfolio keepers and credentials survive disposable coordinator and owner-child restarts.',
      'All value is fictitious. Common-host custody, controlled local time and local RPC trust remain.'] };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const stage = async name => { result.phase = name;
    result.stages.push({ name, at: new Date().toISOString(), elapsedMilliseconds: performance.now() - began });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n'); };
  let runtime, assets, system, portfolio, keeper, session, http, vaultActor, vaultExit, closed = false, interrupted = false;
  const owners = [], accounts = [], operators = [], capabilities = [], readers = [];
  const publicProofs = new Map();
  async function audit() {
    if (runtime) {
      writeFixturePrivate(join(privateDirectory, 'evm.json'), { metadata: runtime.metadata,
        transactions: runtime.transactions, receipts: runtime.receipts });
      result.transactions = runtime.receipts.map(item => ({ label: item.label,
        transactionHash: item.receipt.transactionHash, status: item.receipt.status, gasUsed: item.gasUsed }));
    }
    save();
  }
  function onProof(index) { return async ({ label, relation, proof }) => {
    const payload = Buffer.isBuffer(proof.proof) ? Buffer.from(proof.proof) : Buffer.from(proof.proof, 'hex');
    const name = `${String(result.proofs.length + 1).padStart(3, '0')}-asset-${index}-${label}`;
    const inputs = fixtureJSON(proof.publicInputs);
    writeFileSync(join(proofDirectory, name + '.bin'), payload, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(proofDirectory, name + '.inputs.json'), inputs, { flag: 'wx', mode: 0o600 });
    result.proofs.push({ label, assetIndex: index, relation, file: name,
      proofSHA256: hash(payload), publicInputsSHA256: hash(inputs), evidence: proof.evidence ?? proof.metrics });
    publicProofs.set(index + ':' + label, { proof: payload.toString('hex'), publicInputs: proof.publicInputs }); save();
  }; }
  async function cleanup() {
    if (closed) return; closed = true;
    await Promise.allSettled(accounts.map(account => account.abort()));
    if (http) await http.close().catch(() => {}); else if (session) await session.close().catch(() => {});
    else await keeper?.close().catch(() => {});
    try { portfolio?.close(); } catch {}
    for (const account of accounts) await account.close().catch(() => {});
    for (const owner of owners) await owner.close().catch(() => {});
    for (const operator of operators) { try { operator.close(); } catch {} }
    if (runtime) {
      try { result.cleanup.evm = await runtime.close(); result.cleanup.closedEvm = result.cleanup.evm.stopped === true; }
      catch { result.cleanup.closedEvm = false; }
    }
  }
  const stop = () => {
    if (interrupted) return; interrupted = true;
    result.interruption = { at: new Date().toISOString(), phase: result.phase }; result.success = false;
    void audit().catch(() => {}).then(cleanup).finally(() => {
      result.phase = 'failed'; result.errorCode = 'FLAT_ASSET_PORTFOLIO_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN'; save(); process.exit(2);
    });
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  async function request(action, body = {}) {
    const response = await fetch(http.origin + '/api/flat-account/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: http.origin, 'x-flat-account-token': http.clientAccess.token },
      body: JSON.stringify(body) });
    assert.equal(response.status, 202, 'FLAT_PORTFOLIO_HTTP_ADMISSION');
    assert.equal((await response.json()).admitted, true);
    const view = await session.idle(); result.accountRequests.push({ action, requestId: body.requestId ?? null,
      lastAdmission: view.admissions.at(-1), phase: view.phase }); save(); return view;
  }
  function row(view, requestId) { const row = view.requests.find(item => item.requestId === requestId);
    assert.ok(row, 'FLAT_PORTFOLIO_REQUEST_MISSING'); return row; }
  async function ownerView() {
    const response = await fetch(http.origin + '/api/flat-account/owner', {
      headers: { Origin: http.origin, 'x-flat-owner-token': http.ownerAccess.token } });
    assert.equal(response.status, 200, 'FLAT_PORTFOLIO_OWNER_VIEW'); return response.json();
  }
  try {
    save(); await stage('start-one-owned-local-evm'); runtime = await createLocalEvm();
    await stage('deploy-pinned-token-vault-and-private-pools');
    assets = await deployBackedAssets(runtime, { domain: '0x' + freshFixtureId(), runtimeId: '0x' + freshFixtureId(), supply: '1000000' });
    for (const asset of [assets.token, assets.vault]) capabilities.push(await createOwnedPoolAsset({ runtime,
      deployment: asset.deployment, symbol: asset.symbol, decimals: asset.decimals, kind: 'ERC20' }));
    for (let signerIndex = 0; signerIndex < 4; signerIndex++) operators.push(createLocalFlatOperator({ signerIndex }));
    system = await deployFlatSystem(runtime, { deploymentDomain: '0x' + freshFixtureId(), registryEpoch: '1',
      rulesRoot: '0x' + hash('fixed-note-only-no-native-adapter-members'), attesterKeys: operators.map(operator => operator.publicKey),
      pools: capabilities.map(assetCapability => ({ assetCapability, policy: '0x' + freshFixtureId(), deploymentDomain: '0x' + freshFixtureId() })) });
    assert.equal(system.asset, null); assert.throws(() => system.assetBalance(runtime.accounts[0]), /AMBIGUOUS_AGGREGATE_ASSET/);
    vaultActor = await createOwnedBackedVault({ runtime, deployment: assets.backedVaultDeployment,
      sender: bare(runtime.accounts[0]), receiver: bare(runtime.accounts[0]) });
    await stage('actual-public-vault-deposit-produces-backed-shares');
    const deposit = await vaultActor.prepare({ kind: 'deposit', amount: '400', minimumOutput: '400', deadline: String((await runtime.time()) + 240n) });
    const deposited = await vaultActor.execute(deposit.reference); assertOwnedBackedVaultReceipt(vaultActor, deposited);
    writeFixturePrivate(join(privateDirectory, 'vault-deposit.json'), deposited);
    const count = runtime.transactions.length;
    await vaultActor.reopen(); await vaultActor.execute(deposit.reference); await vaultActor.reconcile(deposit.reference);
    assert.equal(runtime.transactions.length, count, 'FLAT_PORTFOLIO_DUPLICATE_VAULT_DEPOSIT');
    assert.equal(await capabilities[1].balance(runtime.accounts[0]), 400n);
    result.actualVaultDeposit = { underlying: '400', shares: '400', duplicateNoEffect: true, privatePAEGAction: false }; await audit();

    const amounts = ['600', '400'];
    for (let index = 0; index < 2; index++) {
      const pool = system.pools[index], asset = index === 0 ? assets.token : assets.vault;
      // Explicit fixture setup only. The authority never silently grants an
      // allowance or retries approval as though it were a deposit.
      await runtime.send('fixture-exact-pool-allowance-' + index, { to: asset.address,
        data: nativeStaticCalldata(loadBackedAssetDeploymentArtifacts().artifacts[index ? 'vault' : 'token'],
          'approve(address,uint256)', [pool.address, amounts[index]]) });
      assert.equal(await capabilities[index].allowance(system.sender, pool.address), BigInt(amounts[index]));
      const ownerDirectory = join(privateDirectory, 'owner-' + index); mkdirSync(ownerDirectory, { mode: 0o700 });
      const owner = await createFlatOwnerProcess({ runtime, system, poolIndex: index, directory: ownerDirectory,
        password: freshFixtureId(), create: true, checkpoint: null,
        onCheckpoint: value => writeFixturePrivate(join(ownerDirectory, 'checkpoint.json'), value) });
      owners.push(owner);
      accounts.push(await createFlatAccountAuthority({ runtime, system, poolIndex: index, owner, nativeExecution: null,
        accountId: 'backed_asset_' + index, journalId: 'backed_asset_journal_' + index },
      { onProof: onProof(index), onPrivateAudit: audit, onStage: value => stage('asset-' + index + '-' + value.stage) }));
      readers.push(await createFlatSystemStateReader({ runtime, system, poolIndex: index }));
    }
    portfolio = createFlatPortfolioAuthority({ runtime, system, accounts: accounts.map((account, poolIndex) => ({ account, poolIndex })),
      accountId: 'backed_private_portfolio', journalId: 'backed_portfolio_journal' });
    keeper = await createGenericAccountKeeper({ config: portfolio.config,
      journal: { path: join(privateDirectory, 'portfolio.vault'), password: freshFixtureId() }, authority: portfolio.authority });
    vaultExit = await createOwnedPrivateVaultExit({ runtime, system, poolIndex: 1, account: accounts[1], vault: vaultActor });
    const privatePositionView = createPrivateVaultPortfolioView({ runtime, portfolio, vault: vaultActor,
      shareAssetId: accounts[1].assetId, underlyingAssetId: accounts[0].assetId });
    session = await createFlatAccountSession({ keeper, ownerHandoff: { ownerView: privatePositionView } });
    http = await startFlatAccountHttp({ session, port: 0 });
    for (let index = 0; index < 2; index++) {
      await stage('deposit-private-asset-' + index + '-through-one-account-api');
      const ref = freshFixtureId(), requestId = 'asset_top_up_' + index;
      await owners[index].owner.prepareDeposit({ amount: amounts[index], epoch: String((await runtime.time()) / 600n),
        exitRecipient: bare(index === 0 ? runtime.accounts[3] : runtime.accounts[0]) });
      await accounts[index].ownerActions.registerTopUp(ref);
      await request('prepare', { requestId, kind: 'TOP_UP', ownerOperationRef: ref, assetId: accounts[index].assetId });
      assert.equal(row(await request('execute', { requestId }), requestId).state, 'CONFIRMED');
      const sent = runtime.transactions.length;
      await request('execute', { requestId }); assert.equal(runtime.transactions.length, sent);
      assert.equal(await capabilities[index].allowance(system.sender, system.pools[index].address), 0n);
    }
    const funded = await ownerView(); assert.equal(funded.status, 'LIVE'); assert.equal(funded.coherent, true);
    assert.deepEqual(funded.assets.map(asset => asset.asset.symbol), ['PALT', 'BLTV']);
    assert.deepEqual(funded.assets.map(asset => asset.balances.available), amounts);
    assert.deepEqual(funded.assets.map(asset => asset.backing.held), amounts);
    assert.equal(funded.positions[0].status, 'LIVE');
    assert.equal(funded.positions[0].availableShares, '400');
    assert.equal(funded.positions[0].estimatedRedeemableUnderlying, '400');
    assert.equal(funded.positions[0].underlyingSpendable, false);
    result.privatePortfolioFunded = { assets: funded.assets.map(asset => ({ symbol: asset.asset.symbol,
      available: asset.balances.available, backing: asset.backing, disposition: asset.requests[0].disposition })),
      position: funded.positions[0], coherent: true };
    await stage('reject-cross-asset-proof-without-value-movement');
    const tokenProof = publicProofs.get('0:flat-account-deposit');
    const beforeWrong = await capabilities[1].balance(system.pools[1].address);
    await runtime.send('reject-token-proof-in-share-pool', { to: system.pools[1].address,
      data: encodeFlatTransaction('depositBalance', tokenProof) }, '0x0', 'PUBLIC_DOMAIN');
    assert.equal(await capabilities[1].balance(system.pools[1].address), beforeWrong);
    result.crossAssetProofRejected = true; await audit();

    await stage('restart-owners-and-disposable-portfolio-coordinator');
    for (const owner of owners) await owner.suspend();
    const absent = await ownerView(); assert.equal(absent.status, 'UNAVAILABLE');
    assert.ok(absent.assets.every(asset => asset.balances === null));
    const beforeRestart = runtime.transactions.length;
    await request('restart');
    for (const owner of owners) await owner.restart();
    for (let index = 0; index < 2; index++) await request('reconcile', { requestId: 'asset_top_up_' + index });
    const restored = await ownerView(); assert.equal(restored.status, 'LIVE');
    assert.deepEqual(restored.assets.map(asset => asset.balances.available), amounts);
    assert.equal(runtime.transactions.length, beforeRestart); result.originalPortfolioRestoredWithoutResend = true;
    await stage('exit-original-token-and-share-notes-once');
    for (let index = 0; index < 2; index++) {
      const requestId = 'asset_exit_' + index, ref = freshFixtureId();
      await owners[index].owner.prepareWithdrawal({ role: 'source', epoch: String((await runtime.time()) / 600n) });
      await accounts[index].ownerActions.registerExit(ref, 'source');
      await request('prepare', { requestId, kind: 'EXIT', ownerOperationRef: ref, assetId: accounts[index].assetId });
      assert.equal(row(await request('execute', { requestId }), requestId).state, 'CONFIRMED');
      const sent = runtime.transactions.length; await request('execute', { requestId });
      assert.equal(runtime.transactions.length, sent, 'FLAT_PORTFOLIO_DUPLICATE_EXIT');
    }
    await stage('actual-public-vault-redemption-restores-underlying');
    const redeem = { requestId: 'asset_exit_1', minimumOutput: '400', deadline: String((await runtime.time()) + 240n) };
    const preparedRedemption = await vaultExit.prepare(redeem);
    assert.equal(preparedRedemption.shares, '400'); assert.equal(preparedRedemption.phase, 'READY_TO_REDEEM');
    const redemption = await vaultExit.execute(redeem.requestId); assert.equal(redemption.phase, 'REDEEMED');
    assert.equal(redemption.redeemedUnderlying, '400'); assert.equal(redemption.underlyingPrivateSpendable, false);
    const redeemed = await vaultExit.originalReceipt(redeem.requestId); assertOwnedBackedVaultReceipt(vaultActor, redeemed);
    writeFixturePrivate(join(privateDirectory, 'vault-redeem.json'), redeemed);
    const redeemCount = runtime.transactions.length;
    await vaultExit.reopen(); await vaultExit.prepare(redeem); await vaultExit.reconcile(redeem.requestId); await vaultExit.execute(redeem.requestId);
    assert.equal(runtime.transactions.length, redeemCount);
    result.manualPrivateShareExitRedemption = { ...redemption, originalExitBound: true, duplicateNoEffect: true };
    const position = await vaultActor.observe();
    assert.equal(position.snapshot.totalAssets, '0'); assert.equal(position.snapshot.totalShares, '0');
    assert.equal(await capabilities[0].balance(runtime.accounts[3]), 600n);
    assert.equal(await capabilities[0].balance(runtime.accounts[0]), 999400n);
    const final = await ownerView(); assert.equal(final.status, 'LIVE');
    assert.ok(final.assets.every(asset => asset.balances.available === '0' && asset.backing.held === '0' && asset.backing.liabilities === '0'));
    result.finalPools = [];
    for (const reader of readers) { const view = await reader.read(); result.finalPools.push(view.ledger.publicState);
      assert.equal(view.ledger.publicState.actualAssetBalance, '0'); assert.equal(view.ledger.publicState.backedAmount, '0'); }
    result.actualVaultRedeemed = true; result.privateBackedAssetPortfolioAcceptance = true;
    result.privateExitAccepted = true; result.duplicateNoEffect = true; result.success = true; result.phase = 'completed'; await audit();
  } catch (error) {
    result.failedStage = result.phase; result.phase = 'failed'; result.success = false; result.errorCode = safeCode(error);
    writeFixturePrivate(join(privateDirectory, 'error.json'), { message: String(error.message), stack: String(error.stack),
      cause: error.cause ? { message: String(error.cause.message), stack: String(error.cause.stack) } : null });
    result.lastObservedPools = [];
    for (const reader of readers) { try { result.lastObservedPools.push((await reader.read()).ledger.publicState); } catch {} }
    await audit().catch(() => {});
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (result.cleanup.closedEvm !== true) { result.success = false; result.phase = 'failed'; }
    try { assert.deepEqual(assetPortfolioSourcePins(), result.sourcePins); result.sourceUnchanged = true; }
    catch { result.sourceUnchanged = false; result.success = false; result.phase = 'failed'; }
    result.finishedAt = new Date().toISOString(); result.milliseconds = performance.now() - began; save();
    if (!result.success) process.exitCode = 1;
  }
}
await main();
