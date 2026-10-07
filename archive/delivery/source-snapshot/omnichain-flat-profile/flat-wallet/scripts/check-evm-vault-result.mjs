/** Read-only consistency check of retained actual EVM vault run artifacts.
 * Starts no backend, proof, compiler, node, RPC, signing or transaction. The
 * original failed result/resources/private audit are never rewritten. Only
 * bounded findings, counts, toy amounts and hashes leave the private records.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, FLAT, LOCAL } from '../proof-workers/catalog.mjs';
import { hash } from '../proof-workers/tooling.mjs';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from '../wallet-platform/modules/paeg/transaction-codec.mjs';
import { decodeStatement, joinReservation, joinAdmission, joinSettlement } from '../wallet-platform/modules/paeg/statements.mjs';
import { assertSignedEvmTransaction } from '../wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs';
import { nativeFactIdentity } from '../wallet-platform/modules/chain-adapters/native-receipt-binding.mjs';
import { decodeEvmVaultDeliveryCall, validateEvmVaultDeliveryReceipt } from '../wallet-platform/modules/chain-adapters/evm-vault-delivery.mjs';
import { BACKED_ASSET_BUILD_PIN } from '../wallet-platform/modules/ops/deploy-backed-assets.mjs';
import { EVM_VAULT_ROUTER_BUILD_PIN } from '../wallet-platform/modules/ops/deploy-evm-vault-router.mjs';
import { decodeWalletPoolInputs } from '../../../omnichain-product/src/private-wallet-note-encoding.mjs';
import { deriveNativeRuntimeCode } from '../../../omnichain-product/src/paeg/native-deployment.mjs';
import { publicKeccak256 } from '../../../omnichain-product/src/private-cohort-public-native.mjs';

const runId = '6b9eddb6-a534-45ea-963c-025c413d69a9';
const directory = join(ROOT, '.local/evm-vault-flow/attempt-' + runId);
const bytes = name => readFileSync(join(directory, name));
const read = name => JSON.parse(bytes(name));
const bare = value => value.slice(2);
const result = read('result.json'), resources = read('resources.json'), frozen = read('source-snapshot-manifest.json');
const immutableFiles = ['result.json', 'resources.json', 'source-pins.json', 'private-audit/evm.json',
  'private-audit/error.json', 'private-audit/latest-application.json'];
const originalHashes = new Map(immutableFiles.map(name => [name, hash(bytes(name))]));
assert.equal(result.runId, runId); assert.equal(resources.runId, runId); assert.equal(frozen.runId, runId);
assert.equal(result.phase, 'failed'); assert.equal(result.success, false);
assert.equal(result.privateVaultGraphAcceptance, false);
assert.equal(result.failedStage, 'restart-solver-payout-custody-and-exit-once');
assert.equal(result.errorCode, 'ERR_ASSERTION');
assert.equal(resources.phase, 'failed'); assert.equal(resources.resultAccepted, false);
assert.equal(resources.failure, 'NATIVE_WORKER_EXIT_FAILURE');
assert.equal(hash(bytes('result.json')), resources.workerResult.sha256);
assert.equal(bytes('result.json').length, resources.workerResult.bytes);
assert.equal(result.localOnly, true); assert.equal(result.fakeFundsOnly, true); assert.equal(result.publicNetwork, false);
assert.equal(result.sourceUnchanged, true); assert.equal(resources.sourceClosureUnchanged, true);
assert.deepEqual(result.sourcePins, resources.sourcePins); assert.deepEqual(result.sourcePins, read('source-pins.json'));
assert.equal(hash(bytes('source-pins.json')), resources.sourcePinsSHA256);
assert.equal(frozen.sourceFiles.length, 124); assert.equal(frozen.sourceFiles.length, result.sourcePins.local.length);
assert.equal(new Set(frozen.sourceFiles.map(item => item.source)).size, 124);
for (const pin of result.sourcePins.local) {
  const saved = frozen.sourceFiles.find(item => item.source === pin.path); assert.ok(saved);
  assert.equal(saved.sha256, pin.sha256); assert.equal(saved.bytes, pin.bytes);
  const retained = bytes('source-snapshot/' + saved.file);
  assert.equal(retained.length, pin.bytes); assert.equal(hash(retained), pin.sha256);
  // Decoder dependencies still match the archived closure. The harness itself
  // may contain the disclosed future-call repair; that is not historical proof.
  if (pin.path !== 'flat-wallet/integration/evm-vault-flow.mjs')
    assert.equal(hash(readFileSync(join(FLAT, pin.path))), pin.sha256, 'UNCHANGED_CHECKER_DEPENDENCY');
}

const proofs = new Map(), proofEvidence = [];
let flatProofCount = 0, legacyProofCount = 0;
for (const entry of result.proofs) {
  const proof = bytes('public-proofs/' + entry.file + '.bin');
  const inputBytes = bytes('public-proofs/' + entry.file + '.inputs.json');
  assert.equal(hash(proof), entry.proofSHA256); assert.equal(hash(inputBytes), entry.publicInputsSHA256);
  const publicInputs = JSON.parse(inputBytes), packet = { proof: proof.toString('hex'), publicInputs };
  assert.ok(!proofs.has(entry.label)); proofs.set(entry.label, packet);
  if (entry.evidence.runId) {
    flatProofCount++;
    const path = join(LOCAL, 'attempts', entry.evidence.runId);
    const workerBytes = name => readFileSync(join(path, name));
    const manifestBytes = workerBytes('proof-manifest.json'), manifest = JSON.parse(manifestBytes);
    const worker = JSON.parse(workerBytes('result.json')), supervisor = JSON.parse(workerBytes('resources.json'));
    assert.equal(hash(manifestBytes), entry.evidence.manifestSHA256);
    for (const value of [manifest, worker, supervisor]) {
      assert.equal(value.runId, entry.evidence.runId); assert.equal(value.jobId, entry.evidence.jobId);
      assert.equal(value.relation, entry.relation);
    }
    for (const value of [manifest, worker]) {
      assert.equal(value.proofSHA256, entry.proofSHA256); assert.equal(value.keySHA256, entry.evidence.keySHA256);
      assert.equal(value.selfVerified, true);
    }
    assert.equal(worker.proofGenerated, true); assert.equal(worker.phase, 'completed');
    assert.equal(supervisor.phase, 'completed'); assert.equal(supervisor.exitCode, 0);
    assert.equal(supervisor.signal, null); assert.equal(supervisor.failure, null);
    assert.equal(hash(workerBytes('proof.bin')), entry.proofSHA256);
    assert.deepEqual(JSON.parse(workerBytes('public-inputs.json')), publicInputs);
    assert.equal(hash(workerBytes('public-inputs.json')), manifest.publicInputsSHA256);
    proofEvidence.push({ relation: entry.relation, proofSHA256: entry.proofSHA256,
      publicInputsSHA256: entry.publicInputsSHA256, backendVerified: true,
      manifestSHA256: hash(manifestBytes), workerResultSHA256: hash(workerBytes('result.json')),
      workerResourcesSHA256: hash(workerBytes('resources.json')) });
  } else {
    legacyProofCount++;
    const evidence = entry.evidence;
    assert.equal(evidence.phase, 'completed'); assert.equal(evidence.acceptedResult, true);
    assert.equal(evidence.exit.code, 0); assert.equal(evidence.exit.signal, null);
    assert.equal(evidence.worker.mode, entry.relation); assert.equal(evidence.worker.verified, true);
    assert.equal(evidence.worker.zeroKnowledgeEnabled, true);
    assert.equal(evidence.worker.proofSHA256, entry.proofSHA256);
    assert.equal(evidence.worker.publicInputCount, publicInputs.length);
    assert.equal(evidence.worker.proofBytes, proof.length);
    proofEvidence.push({ relation: entry.relation, proofSHA256: entry.proofSHA256,
      publicInputsSHA256: entry.publicInputsSHA256, backendVerified: true });
  }
}
assert.equal(proofs.size, 15); assert.equal(flatProofCount, 11); assert.equal(legacyProofCount, 4);

// Decode dynamic ABI offsets independently of encodeFlatTransaction.
function body(data, selector) {
  assert.equal(data.slice(2, 10), selector);
  const raw = Buffer.from(data.slice(10), 'hex');
  const word = offset => { assert.ok(offset >= 0 && offset + 32 <= raw.length);
    return raw.subarray(offset, offset + 32).toString('hex'); };
  const uint = offset => { const value = BigInt('0x' + word(offset));
    assert.ok(value <= BigInt(Number.MAX_SAFE_INTEGER)); return Number(value); };
  const proofAt = base => {
    const proofStart = base + uint(base), inputsStart = base + uint(base + 32);
    const proofLength = uint(proofStart), inputLength = uint(inputsStart);
    assert.ok(proofStart + 32 + proofLength <= raw.length && inputsStart + 32 + inputLength * 32 <= raw.length);
    return { proof: raw.subarray(proofStart + 32, proofStart + 32 + proofLength).toString('hex'),
      publicInputs: Array.from({ length: inputLength }, (_, index) => BigInt('0x' + word(inputsStart + 32 + index * 32)).toString()) };
  };
  return { uint, word, proofAt };
}
const audit = read('private-audit/evm.json'), matched = new Set();
assert.equal(audit.transactions.length, 57); assert.deepEqual(audit.receipts, audit.transactions);
assert.equal(result.transactions.length, 57);
for (const tx of audit.transactions) {
  assert.equal(tx.phase, 'mined'); assert.equal(tx.receipt.status, '0x1');
  assert.equal(tx.transactionHash, tx.receipt.transactionHash);
  const summary = result.transactions.filter(row => row.transactionHash === tx.transactionHash);
  assert.equal(summary.length, 1); assert.equal(summary[0].status, '0x1');
  assert.equal(summary[0].blockHash, tx.receipt.blockHash); assert.equal(summary[0].label, tx.label);
}
function transaction(label, prefix = false) {
  const rows = audit.transactions.filter(item => prefix ? item.label.startsWith(label) : item.label === label);
  assert.equal(rows.length, 1, 'EXACT_ONE_RETAINED_TRANSACTION'); return rows[0];
}
function match(actual, label) {
  assert.ok(proofs.has(label)); assert.ok(!matched.has(label));
  assert.deepEqual(actual, proofs.get(label), 'EXACT_INCLUDED_PROOF_PACKET'); matched.add(label);
}
function flatBody(tx, method) { return body(tx.request.data, FLAT_TRANSACTION_METHODS[method].selector); }
const deposit = transaction('flat-account-deposit'), reserve = transaction('flat-account-reservation');
match(flatBody(deposit, 'depositBalance').proofAt(0), 'flat-account-deposit');
assert.equal(deposit.request.data, encodeFlatTransaction('depositBalance', proofs.get('flat-account-deposit')));
let call = flatBody(reserve, 'reserveGenericGuarded');
match(call.proofAt(call.uint(0)), 'owner-envelope'); match(call.proofAt(call.uint(32)), 'flat-account-reservation');
assert.equal(reserve.request.data, encodeFlatTransaction('reserveGenericGuarded', {
  authorization: proofs.get('owner-envelope'), reservation: proofs.get('flat-account-reservation'),
  expectedSequence: String(call.uint(64)), expectedPostRoot: '0x' + call.word(96) }));
joinReservation(decodeStatement('authorization', proofs.get('owner-envelope').publicInputs),
  decodeStatement('reservation', proofs.get('flat-account-reservation').publicInputs));
const admission = transaction('flat-execution-admission-', true), settlement = transaction('flat-execution-settlement-', true);
call = flatBody(admission, 'admit');
for (const [index, name] of ['dependency', 'readiness', 'admission'].entries())
  match(call.proofAt(call.uint(32 * (index + 1))), 'leg-0-' + name);
joinAdmission(...['dependency', 'ready', 'admission'].map((relation, index) =>
  decodeStatement(relation, proofs.get('leg-0-' + ['dependency', 'readiness', 'admission'][index]).publicInputs)));
call = flatBody(settlement, 'fulfillGeneric');
match(call.proofAt(call.uint(0)), 'global-fulfillment');
const arrayBase = call.uint(32);
for (let slot = 0; slot < 4; slot++)
  match(call.proofAt(arrayBase + call.uint(arrayBase + slot * 32)), 'slot-' + slot + '-completion');
joinSettlement(Array.from({ length: 4 }, (_, slot) => decodeStatement('node', proofs.get('slot-' + slot + '-completion').publicInputs)),
  decodeStatement('settlement', proofs.get('global-fulfillment').publicInputs));
const exits = ['change', 'source'].map(role => {
  const label = 'flat-account-withdraw_' + role, tx = transaction(label);
  match(flatBody(tx, 'withdrawBalance').proofAt(0), label);
  assert.equal(tx.request.data, encodeFlatTransaction('withdrawBalance', proofs.get(label))); return tx;
});
for (const tx of [reserve, settlement, exits[0]]) assert.equal(tx.request.to, deposit.request.to);

// Recover the descriptor identity from the original constructor arguments and
// retained pinned compiler output, solely to decode the actual signed call.
function compilation(path, expected) {
  const raw = readFileSync(join(ROOT, path)); assert.equal(hash(raw), expected); return JSON.parse(raw);
}
const assetsBuild = compilation('.local/backed-assets/v1/compiled.json', BACKED_ASSET_BUILD_PIN.compiledSHA256);
const routerBuild = compilation('.local/evm-vault-router/v1/compiled.json', EVM_VAULT_ROUTER_BUILD_PIN.compiledSHA256);
const tokenCreation = transaction('deploy fixed backed asset PrivateAssetTestToken');
const vaultCreation = transaction('deploy fixed backed asset BackedTestVault');
const routerCreation = transaction('deploy fixed PrivateVaultDeliveryRouter');
const constructorFields = ['solver', 'asset', 'vault', 'targetPool', 'assetCodeSHA256', 'vaultCodeSHA256',
  'targetPoolCodeSHA256', 'genesisHash', 'ledgerNamespace', 'vaultDomain', 'vaultRuntimeId', 'targetDomain', 'targetScope', 'targetPolicy'];
const constructor = routerCreation.request.data.slice(2 + EVM_VAULT_ROUTER_BUILD_PIN.creationBytes * 2);
assert.equal(constructor.length, constructorFields.length * 64);
const configuration = Object.fromEntries(constructorFields.map((key, index) => [key,
  '0x' + constructor.slice(index * 64 + (index < 4 ? 24 : 0), (index + 1) * 64)]));
const tokenArtifact = assetsBuild.contracts['PrivateAssetTestToken.sol'].PrivateAssetTestToken;
const vaultArtifact = assetsBuild.contracts['BackedTestVault.sol'].BackedTestVault;
const routerArtifact = routerBuild.contracts['PrivateVaultDeliveryRouter.sol'].PrivateVaultDeliveryRouter;
assert.equal(tokenCreation.request.data.slice(2, 2 + BACKED_ASSET_BUILD_PIN.token.creationBytes * 2), tokenArtifact.evm.bytecode.object);
assert.equal(vaultCreation.request.data.slice(2, 2 + BACKED_ASSET_BUILD_PIN.vault.creationBytes * 2), vaultArtifact.evm.bytecode.object);
assert.equal(routerCreation.request.data.slice(2, 2 + EVM_VAULT_ROUTER_BUILD_PIN.creationBytes * 2), routerArtifact.evm.bytecode.object);
assert.equal(configuration.asset, tokenCreation.receipt.contractAddress); assert.equal(configuration.vault, vaultCreation.receipt.contractAddress);
assert.equal(configuration.targetPool, exits[1].request.to); assert.equal(configuration.genesisHash, audit.metadata.evmGenesis);
const tokenCode = '0x' + tokenArtifact.evm.deployedBytecode.object;
const vaultValues = { asset: configuration.asset, assetCodeSHA256: configuration.assetCodeSHA256,
  genesisHash: configuration.genesisHash, domain: configuration.vaultDomain, runtimeId: configuration.vaultRuntimeId };
assert.equal(vaultCreation.request.data.slice(2 + BACKED_ASSET_BUILD_PIN.vault.creationBytes * 2),
  Object.values(vaultValues).map(value => bare(value).padStart(64, '0')).join(''));
const vaultCode = deriveNativeRuntimeCode({ artifact: vaultArtifact, deployedAddress: configuration.vault,
  immutableNames: BACKED_ASSET_BUILD_PIN.vault.immutableNames, immutableValues: vaultValues });
const codeSHA = value => hash(Buffer.from(bare(value), 'hex'));
assert.equal(codeSHA(tokenCode), bare(configuration.assetCodeSHA256));
assert.equal(codeSHA(vaultCode), bare(configuration.vaultCodeSHA256));
const assetIdentity = (address, code) => hash(Buffer.from('24' + BigInt(31337).toString(16).padStart(64, '0')
  + bare(address) + publicKeccak256(Buffer.from(bare(code), 'hex')).toString('hex'), 'hex'));
const asset = assetIdentity(configuration.asset, tokenCode), shares = assetIdentity(configuration.vault, vaultCode);
const routerCode = deriveNativeRuntimeCode({ artifact: routerArtifact, deployedAddress: routerCreation.receipt.contractAddress,
  immutableNames: EVM_VAULT_ROUTER_BUILD_PIN.immutableNames,
  immutableValues: { ...configuration, assetIdentity: '0x' + asset, shareIdentity: '0x' + shares } });
const identity = { chainId: '31337', adapterVersion: '1', routerVersion: '1',
  ...Object.fromEntries(Object.entries(configuration).map(([key, value]) => [key, bare(value)])),
  router: bare(routerCreation.receipt.contractAddress), routerCodeSHA256: codeSHA(routerCode), assetIdentity: asset, shareIdentity: shares };
const delivery = transaction('gated EVM vault delivery');
assert.equal(audit.transactions.filter(tx => tx.signed).length, 1);
const signed = assertSignedEvmTransaction(delivery.signed.nativeWire, delivery.prepared.transaction);
assert.equal(signed.nativeId, delivery.transactionHash); assert.equal(signed.nativeId, delivery.signed.nativeId);
assert.equal(signed.transactionSHA256, delivery.signed.transactionSHA256);
assert.equal(signed.unsignedWire, delivery.prepared.unsignedWire);
assert.equal(signed.data, delivery.request.data); assert.equal(signed.from, delivery.request.from);
assert.equal(signed.to, delivery.request.to); assert.equal(signed.value, '0');
assert.equal(delivery.prepared.genesis, audit.metadata.evmGenesis);
const decoded = decodeEvmVaultDeliveryCall(delivery.request.data, identity);
match({ proof: decoded.proof, publicInputs: decoded.descriptor.publicInputs.map(value => BigInt('0x' + value).toString()) }, 'target-deposit-intent');
const receipt = delivery.receipt;
const effect = validateEvmVaultDeliveryReceipt({ transactionHash: bare(receipt.transactionHash),
  blockNumber: BigInt(receipt.blockNumber).toString(), blockHash: bare(receipt.blockHash),
  blockTimestamp: BigInt(receipt.blockTimestamp).toString(), status: '1', from: bare(receipt.from), to: bare(receipt.to),
  value: signed.value, input: signed.data, logs: receipt.logs.map(log => ({ address: bare(log.address),
    topics: log.topics.map(bare), data: bare(log.data), logIndex: BigInt(log.logIndex).toString(), removed: log.removed })) },
{ descriptor: decoded.descriptor, receiptKeyCommitment: decoded.receiptKeyCommitment, proof: decoded.proof });
assert.equal(effect.assetAmount, '100'); assert.equal(effect.shareAmount, '100'); assert.equal(effect.effectIndex, '0');
assert.equal(effect.wireBindingKind, '3'); assert.equal(effect.wireBindingPosition, '0');
const gid = nativeFactIdentity({ family: '3', genesis: identity.genesisHash, asset: identity.shareIdentity,
  transactionId: bare(signed.nativeId) + '0'.repeat(64), effectIndex: effect.effectIndex });
assert.match(gid, /^[0-9a-f]{64}$/);
assert.equal(matched.size, 14);

const solver = proofs.get('vault-solver-payout');
const error = read('private-audit/error.json');
assert.match(error.message, /COMMITMENT_EXACT_FIELDS/); assert.match(error.message, /metrics/);
assert.match(error.stack, /encodeFlatTransaction/);
assert.throws(() => encodeFlatTransaction('withdrawBalance', { ...solver, metrics: {} }), /COMMITMENT_EXACT_FIELDS/);
const correctedSolverCalldata = encodeFlatTransaction('withdrawBalance', { proof: solver.proof, publicInputs: solver.publicInputs });
assert.deepEqual(body(correctedSolverCalldata, FLAT_TRANSACTION_METHODS.withdrawBalance.selector).proofAt(0), solver);
assert.ok(!audit.transactions.some(tx => tx.request.data === correctedSolverCalldata || tx.request.data.includes(solver.proof)));
assert.ok(!audit.transactions.some(tx => !tx.label.startsWith('deploy ') && /solver-payout|redeem|refund|recover|reject-/i.test(tx.label)));
assert.equal(existsSync(join(directory, 'private-audit/vault-redemption.json')), false);
assert.equal(result.solverPayoutRecoveredAndExitedOnce, undefined);
assert.equal(result.privateExitsAndUnderlyingRedemption, undefined);
assert.equal(result.finalPools, undefined);

const depositStatement = decodeWalletPoolInputs('deposit_balance', proofs.get('flat-account-deposit').publicInputs);
const withdrawalStatements = ['flat-account-withdraw_change', 'flat-account-withdraw_source', 'vault-solver-payout']
  .map(label => decodeWalletPoolInputs('withdraw_balance', proofs.get(label).publicInputs));
assert.equal(depositStatement.amount, '500');
assert.deepEqual(withdrawalStatements.map(statement => statement.amount), ['380', '100', '120']);
assert.notEqual(withdrawalStatements[0].nullifier, withdrawalStatements[2].nullifier);
assert.equal(withdrawalStatements[2].recipient, configuration.solver);

// Reconcile token balances/supply from every successful retained Transfer log.
// This is an artifact ledger, not a new live-chain balance or consensus check.
const transferTopic = '0x' + publicKeccak256(Buffer.from('Transfer(address,address,uint256)')).toString('hex');
const zero = '0x' + '0'.repeat(40), ledgers = new Map();
for (const token of [configuration.asset, configuration.vault]) ledgers.set(token, { balances: new Map(), supply: 0n, minted: 0n, burned: 0n });
for (const tx of audit.transactions) for (const log of tx.receipt.logs) {
  if (!ledgers.has(log.address) || log.topics[0] !== transferTopic) continue;
  assert.equal(log.removed, false); assert.equal(log.transactionHash, tx.transactionHash);
  assert.equal(log.topics.length, 3); assert.match(log.data, /^0x[0-9a-f]{64}$/);
  const ledger = ledgers.get(log.address), from = '0x' + log.topics[1].slice(-40), to = '0x' + log.topics[2].slice(-40), amount = BigInt(log.data);
  if (from === zero) { ledger.supply += amount; ledger.minted += amount; }
  else { ledger.balances.set(from, (ledger.balances.get(from) ?? 0n) - amount); assert.ok(ledger.balances.get(from) >= 0n); }
  if (to === zero) { ledger.supply -= amount; ledger.burned += amount; }
  else ledger.balances.set(to, (ledger.balances.get(to) ?? 0n) + amount);
}
const balance = (token, owner) => (ledgers.get(token).balances.get(owner) ?? 0n).toString();
assert.equal(balance(configuration.asset, deposit.request.to), '120');
assert.equal(balance(configuration.vault, exits[1].request.to), '0');
assert.equal(balance(configuration.asset, configuration.vault), '100');
assert.equal(balance(configuration.asset, configuration.solver), '0');
assert.equal(balance(configuration.asset, withdrawalStatements[0].recipient), '380');
assert.equal(balance(configuration.vault, withdrawalStatements[1].recipient), '100');
assert.equal(ledgers.get(configuration.vault).supply.toString(), '100');
assert.equal(ledgers.get(configuration.vault).minted.toString(), '100');
assert.equal(ledgers.get(configuration.vault).burned.toString(), '0');
assert.equal(result.lastObservedPools.length, 2);
assert.deepEqual(result.lastObservedPools.map(pool => pool.backedAmount), ['120', '0']);
assert.deepEqual(result.lastObservedPools.map(pool => pool.actualAssetBalance), ['120', '0']);
assert.deepEqual(result.lastObservedPools.map(pool => pool.spent), [3, 1]);
assert.deepEqual(result.lastObservedPools.map(pool => pool.outputCapacity), [4, 0]);
for (const pool of result.lastObservedPools) {
  assert.equal(pool.surplus, '0'); assert.equal(pool.unrelatedNative, '0'); assert.equal(pool.liveReservations, 0);
}

assert.equal(result.sourceFundingConfirmed, true); assert.equal(result.targetOwnerExitedBeforeDelivery, true);
assert.equal(result.actualGlobalClaim.sourceOwnerAbsent, true); assert.equal(result.actualGlobalClaim.targetOwnerAbsent, true);
assert.equal(result.originalNotesRecoveredOnce, true); assert.deepEqual(result.nativeEffects, { evmVault: 1 });
assert.equal(result.privatePortfolioAfterConversion.coherent, true);
assert.deepEqual(result.privatePortfolioAfterConversion.assets.map(item => [item.symbol, item.available]), [['PALT', '380'], ['BLTV', '100']]);
assert.deepEqual(result.privatePortfolioAfterConversion.position, { availableShares: '100', estimatedRedeemableUnderlying: '100', underlyingSpendable: false });
const stage = name => { const rows = result.stages.filter(row => row.name === name); assert.equal(rows.length, 1); return Date.parse(rows[0].at); };
assert.ok(stage('account-0-OWNER_SUSPENDED_BEFORE_NATIVE') < stage('dispatch-native-leg-0'));
assert.ok(stage('dispatch-native-leg-0') < stage('native-delivered-0'));
assert.ok(stage('native-delivered-0') < stage('submit-global-fulfillment'));
assert.ok(stage('submit-global-fulfillment') < Date.parse(result.actualGlobalClaim.at));
assert.ok(Date.parse(result.actualGlobalClaim.at) < stage('restart-owner-custody-and-account-reconcile-original-note'));
assert.ok(stage('restart-owner-custody-and-account-reconcile-original-note') < stage('exit-source-change-and-original-target-shares'));
assert.ok(BigInt(reserve.receipt.blockNumber) < BigInt(delivery.receipt.blockNumber));
assert.ok(BigInt(delivery.receipt.blockNumber) < BigInt(admission.receipt.blockNumber));
assert.ok(BigInt(admission.receipt.blockNumber) < BigInt(settlement.receipt.blockNumber));
assert.ok(BigInt(settlement.receipt.blockNumber) < BigInt(exits[0].receipt.blockNumber));
assert.ok(BigInt(exits[0].receipt.blockNumber) < BigInt(exits[1].receipt.blockNumber));
assert.equal(result.accountRequests.filter(row => row.action === 'restart').length, 1);
assert.equal(result.accountRequests.filter(row => row.action === 'reconcile').length, 1);
for (const request of result.accountRequests) { assert.equal(request.lastAdmission.state, 'SUCCEEDED'); assert.equal(request.lastAdmission.errorCode, null); }
for (const key of ['partialDeliveryRecoveryAcceptance', 'systemicPrivacyAcceptance', 'independentOperators',
  'realClockFinalityAcceptance', 'performanceTargetAchieved', 'fullWalletAcceptance', 'keeperRestart', 'nodeRestart']) assert.equal(result[key], false);
for (const key of ['recipients', 'providers', 'operators']) assert.ok(result.cleanup[key].every(item => item.closed));
for (const key of ['sourceOwner', 'targetOwner']) {
  assert.equal(result.cleanup[key].closed, true); assert.equal(result.cleanup[key].status.childExited, true);
}
assert.equal(result.cleanup.closedEvm, true); assert.equal(result.cleanup.closedEvmStatus.exitObserved, true);
assert.equal(result.cleanup.closedEvmStatus.exitCode, 0); assert.equal(result.cleanup.closedEvmStatus.stopped, true);
assert.equal(resources.ownedGroupCleanupConfirmed, true); assert.equal(resources.lockReleased, true);
assert.equal(resources.withinTotalDeadline, true); assert.equal(resources.groupSignals.length, 0);
for (const name of ['ownedGroupLiveCount', 'liveProofWorkers', 'mainWorkerRSSBytes', 'ownedGroupRSSBytes']) assert.equal(resources.finalResources[name], 0);
assert.ok(resources.resourceSummary.availableRAMBytes.minimum >= resources.resourcePolicy.floors.availableRAM);
assert.ok(resources.resourceSummary.freeDiskBytes.minimum >= resources.resourcePolicy.floors.freeDisk);
assert.ok(resources.resourceSummary.maximumProofWorkerRSSBytes.maximum <= resources.resourcePolicy.proofWorkerRSSLimit);
assert.ok(resources.resourceSummary.mainWorkerRSSBytes.maximum <= resources.limits.maximumProofOrMainRSSBytes);
assert.equal(resources.resourcePolicy.strictKernelLimit, false);

for (const [name, digest] of originalHashes) assert.equal(hash(bytes(name)), digest, 'ORIGINAL_EVIDENCE_IMMUTABLE');
const evidence = {
  format: 'FLAT_EVM_VAULT_EXISTING_ARTIFACT_CHECK_V1', recordedAt: new Date().toISOString(), runId,
  classification: 'ACTUAL_PRIVATE_CONVERSION_AND_OWNER_EXITS_WITH_UNSUBMITTED_SOLVER_EXIT',
  readOnlyExistingRun: true, newBackendProofCompilationRuntimeOrTransaction: false,
  originalOutcome: { phase: result.phase, success: false, privateVaultGraphAcceptance: false,
    supervisorResultAccepted: false, failedStage: result.failedStage, errorCode: result.errorCode,
    failureReason: 'Exact proof transport rejected the extra metrics field before solver exit submission' },
  sourceFilesMatched: 124, sourceSnapshotArchiveSHA256: frozen.sourceArchiveSHA256,
  sourceSnapshotManifestSHA256: hash(bytes('source-snapshot-manifest.json')),
  proofs: { generatedAndBackendVerified: 15, flat: flatProofCount, legacy: legacyProofCount,
    actualIncludedPacketsMatched: 14, solverExitProofUnsubmitted: 1, artifacts: proofEvidence },
  included: { sourceD26: 1, ownerU: 1, reservationS: 1, nestedRouterD27: 1,
    dependencyP: 1, readinessR: 1, admissionI: 1, completionN: 4, settlementT: 1, ownerW39: 2 },
  native: { signedDeliveries: 1, canonicalWireAndSenderMatched: true, exactCalldataMatched: true,
    receiptKeyAndDescriptorMatchedToFirstEvent: true, nestedD27Matched: true, effectIndex: 0,
    bindingKind: 3, bindingPosition: 0, nativeGidRecomputed: true,
    secretAdmissionNullifierBindingIndependentlyRechecked: false },
  narrowAcceptance: { originalGenericPrivateConversionIncluded: true,
    originalOwnerNotesReconciledOnce: true, sourceChangeAndTargetShareExitsIncluded: true,
    ownersOfflineAtNativeDeliveryAndGlobalClaim: true, ownerAndAccountRestartRecorded: true,
    solverExitIncluded: false, underlyingRedemptionExecuted: false, allBackingExhausted: false,
    refundOrRecoveryAcceptance: false, fullWalletAcceptance: false, systemicPrivacyAcceptance: false },
  toyAmounts: { units: 'minimal units; PALT and BLTV decimals = 6', sourceDeposit: '500',
    sourceChangeExited: '380', solverPayoutStillBacked: '120', deliveredAndExitedShares: '100',
    sourcePoolBacking: '120', targetPoolBacking: '0', vaultUnderlying: '100', vaultShareSupply: '100',
    targetOwnerExternalShares: '100', solverExternalPALT: '0', activeReservations: 0 },
  repair: { retainedSolverProofSerializesWithExplicitProjection: true,
    extraMetricsFieldReproducesExactCodecRejection: true,
    projectedCallSubmitted: false, deployedSolverExitAcceptanceEstablished: false },
  resources: { cleanupConfirmed: true, finalOwnedGroupLiveCount: 0, lockReleased: true,
    withinTotalDeadline: true, limitsWereMeasuredNotKernelEnforced: true,
    minimumAvailableRAMBytes: resources.resourceSummary.availableRAMBytes.minimum,
    minimumFreeDiskBytes: resources.resourceSummary.freeDiskBytes.minimum,
    peakMainWorkerRSSBytes: resources.resourceSummary.mainWorkerRSSBytes.maximum,
    peakProofWorkerRSSBytes: resources.resourceSummary.maximumProofWorkerRSSBytes.maximum,
    peakAggregateOwnedGroupRSSBytes: resources.resourceSummary.ownedGroupRSSBytes.maximum,
    elapsedMilliseconds: resources.elapsedMilliseconds },
  files: immutableFiles.map(path => ({ path, sha256: originalHashes.get(path), bytes: bytes(path).length,
    private: path === 'result.json' || path.startsWith('private-audit/') })),
  limitations: [
    'Independent artifact consistency classification; the immutable overall run and supervisor remain failed.',
    'Historical state, once-only owner reconciliation and offline chronology rely on the original trusted owned harness records.',
    'GID is recomputed from the original EVM wire identity and first event; secret-to-admission-nullifier linkage is not re-proven from retained private witnesses.',
    'One local fake-value EVM, public router action/amount/K, controlled clock, one local confirmation and common-host observers.',
    'No new backend verification, live chain observation, native consensus proof, external cryptographic audit, arbitrary DeFi, seven-chain or full-wallet acceptance.',
    'No included solver exit, replay rejection, redemption, refund/recovery or exhaustion of all backing is established by this attempt.'
  ]
};
const output = join(ROOT, 'evidence/evm-vault-actual-artifact-check.json');
if (existsSync(output)) {
  const prior = JSON.parse(readFileSync(output));
  assert.deepEqual({ ...prior, recordedAt: null }, { ...evidence, recordedAt: null }, 'EXISTING_PUBLIC_EVIDENCE_CHANGED');
} else writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFilesMatched: 124, backendVerifiedProofs: 15, includedProofPackets: 14,
  unsubmittedSolverProofs: 1, originalRunSuccess: false, sourcePoolBacking: '120', targetPoolBacking: '0',
  vaultUnderlying: '100', vaultShareSupply: '100', cleanupConfirmed: true }));
