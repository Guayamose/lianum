/** Actual acceptance checks. Only genuine owned runtime/system arguments are
 * usable. No injected loader/RPC, mock, synthetic ownership or trust callback. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertOwnedFlatSystem, describeOwnedFlatPoolRegistry } from '../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { assertLocalEvm } from '../../../packages/backend/src/chains/evm/runtime/local-evm-ownership.mjs';
import { loadAppendOnlyLedgerArtifacts } from '../../../packages/backend/src/operations/deployments/system/append-only-deployment-artifacts.mjs';
import { APPEND_ONLY_BUILD_PIN } from '../../../packages/backend/src/operations/deployments/system/append-only-deployment-plan.mjs';
import { deriveNativeRuntimeCode, nativeStaticArguments, nativeStaticCalldata, predictNativeCreateAddress }
  from '../../../packages/backend/src/execution/native/dispatch/native-deployment.mjs';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { fixtureJSON, freshFixtureId } from '../fixtures/runners/owned-flat-fixture.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const words = values => nativeStaticArguments(values.map(() => ({ type: 'uint256' })), values);
const normalized = value => JSON.parse(fixtureJSON(value));

export function retainedOriginalPoolFacts(view) {
  // Omit the new observed head and the intentionally advancing shared-hub
  // sequence. Preserve all original note/backing/history/receipt/replay facts.
  const state = Object.fromEntries(Object.entries(view.state).filter(([name]) => name !== 'stateSequence'));
  return normalized({ pool: view.poolAddress, domain: view.domain, domainCommitment: view.domainCommitment,
    rawState: view.poolObservation.rawState, rawHistory: view.poolObservation.rawHistory, rawBacking: view.poolObservation.rawBacking,
    authorizationRoots: view.authorizationRoots, authorizationCount: view.authorizationTree.count,
    state, receiptLeaves: view.receiptLeaves, spentTags: view.spentTags, revokedEntries: view.revokedEntries,
    checkpointCount: view.checkpointCount, checkpoints: view.checkpoints,
    commitments: view.ledger.commitments, nullifiers: view.ledger.nullifiers });
}
export async function verifyPoolGenerationRuntimeClosure(runtime, system) {
  assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
  const ledger = loadAppendOnlyLedgerArtifacts(), head = await runtime.block(), evidence = [];
  const links = Object.fromEntries(Object.entries(system.libraries).map(([role, record]) => {
    const [file, contract] = APPEND_ONLY_BUILD_PIN.artifacts[role]; return [file + ':' + contract, record.address];
  }));
  // Reconstruct from the exact retained artifact and observed immutable words,
  // independently of the planner's precomputed runtimeCode string.
  for (const [role, record] of [...Object.entries(system.libraries), ['hub', system.hub], ...system.pools.map(pool => ['pool', pool])]) {
    const artifact = ledger.artifacts[role], names = ledger.immutableNames[role], observed = {};
    for (const name of Object.values(names)) {
      const raw = await record.call(name + '()', [], head.number);
      assert.equal(raw, words([record.immutableValues[name]]), 'POOL_GENERATION_CONSTRUCTOR_IMMUTABLE_' + name);
      observed[name] = raw;
    }
    const guarded = !['hub', 'pool'].includes(role) && /^73(?:00){20}3014/.test(artifact.evm.deployedBytecode.object);
    const rebuilt = deriveNativeRuntimeCode({ artifact, deployedAddress: record.address, libraries: links,
      immutableNames: names, immutableValues: observed, isLibrary: guarded });
    const actual = await runtime.code(record.address, head.number);
    assert.equal(actual, rebuilt, 'POOL_GENERATION_COMPLETE_RUNTIME');
    assert.equal(actual, record.expectedCode, 'POOL_GENERATION_FACTORY_RUNTIME');
    assert.equal(await runtime.keccak(actual), record.codeHash, 'POOL_GENERATION_COMPLETE_CODEHASH');
    assert.ok((actual.length - 2) / 2 <= 24576);
    evidence.push({ role, address: record.address, codeHash: record.codeHash, runtimeSHA256: sha(Buffer.from(actual.slice(2), 'hex')),
      runtimeBytes: (actual.length - 2) / 2, immutableWords: observed, links: artifact.evm.deployedBytecode.linkReferences,
      exactCompleteRuntime: true });
  }
  for (const record of [...Object.values(system.verifiers), ...Object.values(system.generatedLibraries)]) {
    const code = await runtime.code(record.address, head.number);
    assert.equal(code, record.expectedCode); assert.equal(await runtime.keccak(code), record.codeHash);
    assert.ok((code.length - 2) / 2 <= 24576);
    await runtime.checkReceipt(record.receipt);
  }
  for (const record of system.deployments) {
    await runtime.checkReceipt(record.receipt); await runtime.assertCanonical(record.receipt);
    const tx = await runtime.transaction(record.receipt.transactionHash);
    assert.equal(tx.from, system.sender); assert.equal(tx.to, null);
    assert.ok((tx.input.length - 2) / 2 <= 49152);
    assert.equal(record.receipt.contractAddress.toLowerCase(), record.address);
    if (record.creationSHA256) assert.equal(sha(Buffer.from(tx.input.slice(2), 'hex')), record.creationSHA256);
    else assert.equal(tx.input, record.creationData);
  }
  assert.equal(await system.hub.call('MAX_REGISTERED_POOLS()', [], head.number), words([8]));
  assert.equal(await system.hub.call('CAPACITY()', [], head.number), words([64]));
  for (const pool of system.pools) assert.equal(await pool.call('CAPACITY()', [], head.number), words([64]));
  assert.equal((await runtime.block()).hash, head.hash); await runtime.assertCanonical(head);
  return { blockNumber: head.number, blockHash: head.hash, ledger: evidence, verifierCount: 12,
    generatedLibraries: Object.keys(system.generatedLibraries).length, normalEvmLimits: true };
}
export async function registrySnapshot(runtime, system) {
  assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
  const head = await runtime.block(), hub = system.hub, registry = describeOwnedFlatPoolRegistry(runtime, system);
  const globals = {};
  for (const name of ['MAX_REGISTERED_POOLS', 'CAPACITY', 'poolRegistrar', 'pinnedPoolCount', 'registeredPoolCount', 'halted', 'stateSequence'])
    globals[name] = await hub.call(name + '()', [], head.number);
  const pools = [];
  for (const pool of registry.pools) pools.push({ pool: pool.address, codeHash: pool.codeHash,
    domainCommitment: pool.domainCommitment, pin: await hub.call('pinnedPoolCodeHash(address)', [pool.address], head.number),
    domain: await hub.call('poolDomain(address)', [pool.address], head.number),
    domainPool: await hub.call('domainPool(bytes32)', [pool.domainCommitment], head.number),
    successorPin: await hub.call('successorPoolPin(address)', [pool.address], head.number) });
  assert.equal((await runtime.block()).hash, head.hash); await runtime.assertCanonical(head);
  return { head: { number: head.number, hash: head.hash }, globals, pools };
}
export async function checkAppendOnlyRejections(runtime, system, readers) {
  assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
  assert.equal(system.pools.length, 2); assert.equal(readers.length, 2);
  const hub = system.hub, original = system.pools[0], other = system.pools[1];
  assert.notEqual(original.assetIdentity, other.assetIdentity);
  const target = predictNativeCreateAddress(system.sender, await runtime.nonce(system.sender, 'pending'));
  assert.equal(await runtime.code(target), '0x');
  const pin = { pool: target, predecessor: original.address, codeHash: original.codeHash, assetIdentity: original.assetIdentity,
    domainCommitment: '0x' + freshFixtureId(), sourceManifestSHA256: '0x' + system.provenance.sourceManifestSHA256,
    keyManifestSHA256: '0x' + system.provenance.keyManifestSHA256 };
  const before = await registrySnapshot(runtime, system);
  const old = await Promise.all(readers.map(async reader => retainedOriginalPoolFacts(await reader.read())));
  const count = runtime.transactions.length, evidence = [];
  const pinMethod = 'pinSuccessorPool((address,address,bytes32,bytes32,bytes32,bytes32,bytes32))';
  async function reject(label, from, signature, args, expected) {
    const item = hub.artifact.abi.find(item => item.type === 'error' && item.name === expected);
    assert.ok(item && item.inputs.length === 0, 'POOL_GENERATION_ERROR_ABI');
    const selector = '0x' + publicKeccak256(Buffer.from(expected + '()')).subarray(0, 4).toString('hex');
    let rejected = false;
    try { await runtime.call({ from, to: hub.address, data: hub.data(signature, args) }, before.head.number); }
    catch (error) { assert.equal(error.message, 'OWNED_RPC_REMOTE_ERROR'); assert.equal(error.rpcData, selector,
      'POOL_GENERATION_EXACT_REVERT_BYTES_REQUIRED'); rejected = true; }
    assert.equal(rejected, true, 'POOL_GENERATION_EXPECTED_REJECTION');
    assert.deepEqual(await registrySnapshot(runtime, system), before);
    evidence.push({ label, kind: 'READ_ONLY_ETH_CALL_REJECTION_NOT_MINED', expectedError: expected, selector });
  }
  await reject('wrong-registrar', runtime.accounts[1], 'registerPoolDomain(address)', [original.address], 'RegistrarRequired');
  await reject('undeployed-unpinned-registration', system.sender, 'registerPoolDomain(address)', [target], 'PoolNotPinned');
  await reject('occupied-original-duplicate-pin', system.sender, pinMethod, [{ ...pin, pool: original.address }], 'ProspectivePoolRequired');
  await reject('zero-source-manifest', system.sender, pinMethod, [{ ...pin, sourceManifestSHA256: '0x' + '0'.repeat(64) }], 'PoolProvenanceRequired');
  await reject('zero-key-manifest', system.sender, pinMethod, [{ ...pin, keyManifestSHA256: '0x' + '0'.repeat(64) }], 'PoolProvenanceRequired');
  await reject('wrong-predecessor-asset', system.sender, pinMethod, [{ ...pin, predecessor: other.address }], 'PoolSuccessorMismatch');
  await reject('repeated-original-domain', system.sender, pinMethod, [{ ...pin, domainCommitment: original.domainCommitment }], 'PoolSuccessorMismatch');
  // Existing registration is intentionally idempotent, not a fake rejection.
  assert.equal(await runtime.call({ from: system.sender, to: hub.address,
    data: hub.data('registerPoolDomain(address)', [original.address]) }, before.head.number), words([original.domainCommitment]));
  assert.equal(runtime.transactions.length, count); assert.deepEqual(await registrySnapshot(runtime, system), before);
  assert.deepEqual(await Promise.all(readers.map(async reader => retainedOriginalPoolFacts(await reader.read()))), old);
  return { rejections: evidence, originalRegistrationIdempotent: true, stateUnchanged: true, noTransactionsSubmitted: true };
}

/** The private factory deliberately returned no successor capability after the
 * lost acknowledgement. Verify its retained descriptor without fabricating a
 * system or exposing a brand/adoption path. */
export async function verifyRetainedProspectivePool(runtime, system) {
  assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
  const registry = describeOwnedFlatPoolRegistry(runtime, system);
  assert.equal(registry.appendFenced, true); assert.equal(registry.pools.length, 3);
  const pending = registry.pools[2], ledger = loadAppendOnlyLedgerArtifacts(), head = await runtime.block();
  const observed = {};
  for (const name of Object.values(ledger.immutableNames.pool)) {
    const raw = await runtime.call({ to: pending.address, data: nativeStaticCalldata(ledger.artifacts.pool, name + '()', []) }, head.number);
    assert.equal(raw, words([pending.immutableValues[name]]), 'POOL_GENERATION_RETAINED_IMMUTABLE_' + name); observed[name] = raw;
  }
  const links = Object.fromEntries(Object.entries(system.libraries).map(([role, record]) => {
    const [source, contract] = APPEND_ONLY_BUILD_PIN.artifacts[role]; return [source + ':' + contract, record.address];
  }));
  const rebuilt = deriveNativeRuntimeCode({ artifact: ledger.artifacts.pool, deployedAddress: pending.address,
    libraries: links, immutableNames: ledger.immutableNames.pool, immutableValues: observed });
  assert.equal(await runtime.code(pending.address, head.number), rebuilt); assert.equal(rebuilt, pending.expectedCode);
  assert.equal(await runtime.keccak(rebuilt), pending.codeHash);
  const creates = runtime.transactions.filter(row => row.label === 'deploy exact append-only successor pool');
  assert.equal(creates.length, 1); const creation = creates[0];
  assert.equal(creation.receipt.status, '0x1'); assert.equal(creation.receipt.contractAddress.toLowerCase(), pending.address);
  assert.equal(creation.request.data, pending.creationData); await runtime.checkReceipt(creation.receipt);
  assert.equal(await system.hub.call('poolDomain(address)', [pending.address], head.number), words([pending.domainCommitment]));
  assert.equal(await system.hub.call('domainPool(bytes32)', [pending.domainCommitment], head.number), words([pending.address]));
  assert.equal((await runtime.block()).hash, head.hash); await runtime.assertCanonical(head);
  return { address: pending.address, codeHash: pending.codeHash, runtimeBytes: (rebuilt.length - 2) / 2,
    immutableWords: observed, allConstructorImmutables: true, completeRuntime: true,
    creationTransactionHash: creation.receipt.transactionHash, generationCapabilityReturned: false };
}
