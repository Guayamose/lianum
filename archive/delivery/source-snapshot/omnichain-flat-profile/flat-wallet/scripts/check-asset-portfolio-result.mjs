/** Existing-run artifact consistency only. No runtime, compiler or proof starts. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../proof-workers/catalog.mjs';
import { hash } from '../proof-workers/tooling.mjs';
import { encodeFlatTransaction } from '../wallet-platform/modules/paeg/transaction-codec.mjs';
import { encodeVaultCall, validateVaultReceipt } from '../wallet-platform/modules/defi-adapters/backed-vault.mjs';

const runId = '63b2c636-dd14-4c2b-ab41-7580dfa4e558';
const directory = join(ROOT, '.local/asset-portfolio/attempt-' + runId);
const bytes = name => readFileSync(join(directory, name));
const read = name => JSON.parse(bytes(name));
const result = read('result.json'), resources = read('resources.json'), source = read('source-snapshot-manifest.json');
assert.equal(result.runId, runId); assert.equal(resources.runId, runId);
assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
assert.equal(resources.phase, 'completed'); assert.equal(resources.resultAccepted, true);
assert.equal(resources.failure, null); assert.equal(resources.ownedGroupCleanupConfirmed, true);
assert.equal(resources.sourceClosureUnchanged, true); assert.equal(result.sourceUnchanged, true);
assert.equal(source.sourceFiles.length, result.sourcePins.local.length);
assert.deepEqual(result.sourcePins, read('source-pins.json'));
for (const item of result.sourcePins.local) {
  const saved = source.sourceFiles.find(value => value.source === item.path);
  assert.ok(saved); assert.equal(saved.sha256, item.sha256);
  assert.equal(hash(bytes('source-snapshot/' + saved.file)), item.sha256);
}
for (const field of ['privateBackedAssetPortfolioAcceptance', 'crossAssetProofRejected',
  'originalPortfolioRestoredWithoutResend', 'privateExitAccepted', 'actualVaultRedeemed', 'duplicateNoEffect'])
  assert.equal(result[field], true);
for (const field of ['privateConversionAcceptance', 'privateDeFiComposabilityAcceptance',
  'systemicPrivacyAcceptance', 'fullWalletAcceptance', 'keeperRestart', 'nodeRestart']) assert.equal(result[field], false);
assert.deepEqual(result.nativeRuntimesStarted, { bitcoin: false, solana: false });
assert.equal(result.cleanup.closedEvm, true); assert.equal(result.cleanup.closedBitcoin, null); assert.equal(result.cleanup.closedSolana, null);
assert.equal(result.privatePortfolioFunded.coherent, true);
assert.deepEqual(result.privatePortfolioFunded.assets.map(item => [item.symbol, item.available, item.backing.held]),
  [['PALT', '600', '600'], ['BLTV', '400', '400']]);
const position = result.privatePortfolioFunded.position;
assert.equal(position.availableShares, '400'); assert.equal(position.estimatedRedeemableUnderlying, '400');
assert.equal(position.underlyingSpendable, false); assert.equal(position.privateConversionAccepted, false);
assert.equal(result.finalPools.length, 2);
for (const pool of result.finalPools) {
  for (const key of ['backedAmount', 'actualAssetBalance', 'surplus', 'unrelatedNative']) assert.equal(pool[key], '0');
  assert.equal(pool.spent, 1); assert.equal(pool.liveReservations, 0); assert.equal(pool.outputCapacity, 0);
}
const audit = read('private-audit/evm.json'), packets = [], pools = new Map();
assert.equal(result.proofs.length, 4);
for (const entry of result.proofs) {
  const proof = bytes('public-proofs/' + entry.file + '.bin'), inputs = bytes('public-proofs/' + entry.file + '.inputs.json');
  assert.equal(hash(proof), entry.proofSHA256); assert.equal(hash(inputs), entry.publicInputsSHA256);
  assert.equal(entry.evidence.acceptedResult, true); assert.equal(entry.evidence.worker.verified, true);
  assert.equal(entry.evidence.worker.proofSHA256, entry.proofSHA256);
  const packet = { proof: proof.toString('hex'), publicInputs: JSON.parse(inputs) };
  const method = entry.relation === 'deposit_balance' ? 'depositBalance' : 'withdrawBalance';
  assert.ok(['deposit_balance', 'withdraw_balance'].includes(entry.relation));
  const calldata = encodeFlatTransaction(method, packet);
  const original = audit.transactions.filter(row => row.request.data === calldata && row.receipt?.status === '0x1');
  assert.equal(original.length, 1, 'PORTFOLIO_EXACT_INCLUDED_PACKET');
  const tx = original[0]; assert.equal(tx.phase, 'mined'); assert.equal(tx.request.value, '0x0');
  assert.equal(tx.receipt.transactionHash, tx.transactionHash);
  assert.equal(result.transactions.filter(row => row.transactionHash === tx.transactionHash).length, 1);
  if (method === 'depositBalance') { assert.ok(!pools.has(entry.assetIndex)); pools.set(entry.assetIndex, tx.request.to); }
  else assert.equal(tx.request.to, pools.get(entry.assetIndex));
  packets.push({ assetIndex: entry.assetIndex, relation: entry.relation, transactionHash: tx.transactionHash });
}
assert.notEqual(pools.get(0), pools.get(1));
const rejected = audit.transactions.filter(row => row.label === 'reject-token-proof-in-share-pool');
assert.equal(rejected.length, 1); assert.equal(rejected[0].receipt.status, '0x0');
assert.equal(rejected[0].revert.reason, 'PUBLIC_DOMAIN'); assert.equal(rejected[0].request.to, pools.get(1));
const firstDeposit = packets.find(item => item.assetIndex === 0 && item.relation === 'deposit_balance');
assert.equal(rejected[0].request.data, audit.transactions.find(item => item.transactionHash === firstDeposit.transactionHash).request.data);

for (const kind of ['deposit', 'redeem']) {
  const observed = read('private-audit/vault-' + kind + '.json');
  assert.equal(observed.phase, 'OBSERVED'); assert.equal(observed.privateSpendable, false);
  assert.equal(observed.execution.phase, 'OBSERVED');
  const calldata = '0x' + encodeVaultCall(observed.action);
  const txs = audit.transactions.filter(row => row.request.data === calldata);
  assert.equal(txs.length, 1); assert.equal(txs[0].receipt.status, '0x1');
  assert.equal(txs[0].transactionHash.slice(2), observed.execution.transactionHash);
  const actual = txs[0].receipt, normalized = observed.execution.receipt;
  assert.equal(actual.blockHash.slice(2), normalized.blockHash);
  assert.deepEqual(actual.logs.map(log => ({ address: log.address.slice(2), topics: log.topics.map(value => value.slice(2)),
    data: log.data.slice(2), logIndex: BigInt(log.logIndex).toString(), removed: log.removed })), normalized.logs);
  const receipt = validateVaultReceipt(normalized, observed.action);
  assert.equal(receipt.assets, '400'); assert.equal(receipt.shares, '400');
}
const evidence = { format: 'FLAT_ASSET_PORTFOLIO_EXISTING_ARTIFACT_CHECK_V1', recordedAt: new Date().toISOString(), runId,
  readOnly: true, newRuntimeProofOrCompilation: false, sourceFilesMatched: source.sourceFiles.length,
  actualIncludedProofPacketsMatched: packets.length, originalVaultActionsMatched: 2, crossAssetProofRejected: true,
  privatePortfolioRestoredWithoutResend: true, backedAssets: ['PALT', 'BLTV'], finalBackingByAsset: ['0', '0'],
  privateConversionAcceptance: false, privateDeFiComposabilityAcceptance: false, fullWalletAcceptance: false,
  files: ['result.json', 'resources.json', 'source-pins.json', 'private-audit/evm.json',
    'private-audit/vault-deposit.json', 'private-audit/vault-redeem.json'].map(path => ({ path,
    sha256: hash(bytes(path)), bytes: bytes(path).length, private: path.startsWith('private-audit/') })),
  limit: 'Consistency of retained actual artifacts; historical code/balance checks executed in the owned observer. Not an external cryptographic audit.' };
writeFileSync(join(ROOT, 'evidence/asset-portfolio-actual-artifact-check.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFilesMatched: source.sourceFiles.length, proofPacketsMatched: packets.length,
  vaultActionsMatched: 2, finalBackingByAsset: ['0', '0'] }));
