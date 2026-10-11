/** Fixed constructor/current-ledger verifier for the new-profile factory.
 * Ordinary exports perform checks only; no callbacks and no ownership mint. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalField } from '@lianum/components/encoding/commitments';
import { assertOwnedPoolAsset } from '../../../chains/shared/contracts/owned-pool-asset.mjs';
import { nativeStaticArguments } from '../../../execution/native/dispatch/native-deployment.mjs';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { SEMANTIC_PROFILE } from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
const ZERO32='0x'+'00'.repeat(32),ZERO_ADDRESS='0x'+'00'.repeat(20);
const sha=b=>createHash('sha256').update(b).digest('hex');
const keccak=code=>'0x'+publicKeccak256(Buffer.from(code.slice(2),'hex')).toString('hex');
const encodedWords=values=>nativeStaticArguments(values.map(()=>({type:'uint256'})),values);
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
async function unchangedHead(runtime, header) {
  await runtime.assertCanonical(header);
  const current = await runtime.block();
  assert.equal(current.number, header.number, 'NATIVE_VALUE_DEPLOY_HEAD_CHANGED');
  assert.equal(current.hash, header.hash, 'NATIVE_VALUE_DEPLOY_HEAD_CHANGED');
}
async function expectedCodeAt(runtime, record, block) {
  const actual = await runtime.code(record.address, block);
  assert.equal(actual.toLowerCase(), record.expectedCode, 'NATIVE_VALUE_DEPLOY_COMPLETE_RUNTIME_MISMATCH');
  assert.equal(keccak(actual), record.codeHash, 'NATIVE_VALUE_DEPLOY_RUNTIME_HASH_MISMATCH');
}
function rawWords(raw, count) {
  assert.match(raw, /^0x(?:[0-9a-f]{64})*$/, 'NATIVE_VALUE_DEPLOY_RETURN_WORDS');
  assert.equal(raw.length, 2 + 64 * count, 'NATIVE_VALUE_DEPLOY_RETURN_LENGTH');
  return Array.from({ length: count }, (_, i) => '0x' + raw.slice(2 + i * 64, 66 + i * 64));
}
function legacyEmptyTree() {
  const nodes = Array(128).fill(ZERO32);
  for (let index = 63; index > 0; index--) nodes[index] = '0x' + sha(Buffer.from('01' + nodes[index * 2].slice(2) + nodes[index * 2 + 1].slice(2), 'hex'));
  return nodes;
}
async function emptyP2Tree(library, domain, kind, block) {
  const nodes = Array(128).fill(ZERO32);
  let empty = await library.call('emptyLeaf(uint256,uint256)', [domain, kind], block);
  canonicalField(rawWords(empty, 1)[0].slice(2));
  for (let index = 64; index < 128; index++) nodes[index] = empty;
  for (let level = 1; level <= 6; level++) {
    empty = await library.call('nodeHash(uint256,uint256,uint256,uint256,uint256)', [domain, kind, level, empty, empty], block);
    canonicalField(rawWords(empty, 1)[0].slice(2));
    const start = 64 >> level;
    for (let index = start; index < 2 * start; index++) nodes[index] = empty;
  }
  return nodes;
}

export async function verifyNativeValueConstructorStorage(runtime, hub, pools, libraries, verifiers, generatedLibraries, plan) {
  const header = await runtime.block(), block = header.number;
  const expect = async (target, signature, args, values) => {
    assert.equal((await target.call(signature, args, block)).toLowerCase(), encodedWords(values), 'NATIVE_VALUE_DEPLOY_STORAGE_' + signature);
  };
  for (const target of [hub, ...pools, ...Object.values(libraries), ...Object.values(verifiers), ...generatedLibraries])
    await expectedCodeAt(runtime, target, block);
  const configWords = plan.verifierSet.pins.flatMap(pin => [pin.verifier, pin.codeHash]);
  configWords.push(plan.verifierSet.poseidon2Domains, plan.verifierSet.poseidon2DomainsCodeHash,
    plan.verifierSet.hubCodec, plan.verifierSet.hubCodecCodeHash);
  for (const [key, value] of Object.entries({ ...plan.hub.immutableValues,
    pool0CodeHash: plan.pools[0].codeHash, pool1CodeHash: plan.pools[1].codeHash })) {
    // This private immutable is authenticated by the full expected runtime.
    if (key !== 'claimAuthorityCodeHash') await expect(hub, key + '()', [], [value]);
  }
  await expect(hub, 'verifierConfiguration()', [], configWords);
  for (let index = 0; index < 4; index++) {
    const key = plan.registry.quorum.keys[index];
    const signer = '0x' + publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex');
    await expect(hub, 'attester(uint8)', [index], ['0x' + key.x, '0x' + key.y, signer]);
  }
  for (const name of ['totalReservedTagCapacity', 'spentTagCount', 'spentTagSequence', 'revokedCount',
    'revocationSequence', 'halted', 'revocationOverflowDigest', 'revocationOverflowCount', 'checkpointCount'])
    await expect(hub, name + '()', [], [0]);
  await expect(hub, 'stateSequence()', [], [2]);
  // The named new-profile getter must agree; the private zero claim hash is
  // already authenticated in every expected runtime byte and constructor word.
  assert.equal(plan.hub.immutableValues.claimAuthority,ZERO_ADDRESS);
  assert.equal(plan.hub.immutableValues.claimAuthorityCodeHash,ZERO32);
  const text=Buffer.from(SEMANTIC_PROFILE);
  const encodedString='0x'+encodedWords([32,text.length]).slice(2)+text.toString('hex').padEnd(Math.ceil(text.length/32)*64,'0');
  assert.equal(await hub.call('NATIVE_VALUE_PROFILE()',[],block),encodedString,'NATIVE_VALUE_DEPLOY_PROFILE');
  const zero64 = Array(64).fill(ZERO32), legacy = legacyEmptyTree();
  await expect(hub, 'spentTagList()', [], zero64); await expect(hub, 'revokedList()', [], zero64);
  await expect(hub, 'checkpointTreeNodes()', [], legacy);
  await expect(hub, 'checkpointRoot()', [], [legacy[1]]);
  await expect(hub, 'acceptedCheckpointRoots(bytes32)', [legacy[1]], [1]);
  const spentTagDigest = '0x' + sha(Buffer.from('31' + plan.hubDomain.slice(2) + '00000000' + '00'.repeat(32 * 64), 'hex'));
  await expect(hub, 'spentTagDigest()', [], [spentTagDigest]);
  for (const [index, pool] of pools.entries()) {
    const projected = plan.pools[index], domain = projected.domainCommitment;
    for (const [name, value] of Object.entries(projected.immutableValues)) await expect(pool, name + '()', [], [value]);
    await expect(pool, 'verifierConfiguration()', [], configWords);
    await expect(pool, 'EPOCH_SECONDS()', [], [600]);
    for (const name of ['backedAmount', 'leafCount', 'spentCount', 'liveReservations', 'outputCapacity',
      'stateSequence', 'authorizationLeafCount', 'transitionInProgress']) await expect(pool, name + '()', [], [0]);
    await expect(pool, 'canonicalBacking()', [], [0, 0, 0, 0, 0, 0]);
    assertOwnedPoolAsset(runtime, pool.assetCapability);
    const backing = await pool.assetCapability.read({ holder: pool.address, blockNumber: block });
    assert.equal(backing.blockHash, header.hash, 'NATIVE_VALUE_DEPLOY_ASSET_BLOCK_HASH');
    assert.equal(backing.balance, '0', 'NATIVE_VALUE_DEPLOY_UNFUNDED_ASSET');
    assert.equal(await runtime.balance(pool.address, block), 0n, 'NATIVE_VALUE_DEPLOY_UNFUNDED_POOL');
    await expect(pool, 'treeNodes()', [], legacy); await expect(pool, 'currentRoot()', [], [legacy[1]]);
    await expect(pool, 'spentList()', [], zero64); await expect(pool, 'noteLeaves()', [], zero64);
    await expect(pool, 'rootHistoryCount()', [], [1]);
    await expect(pool, 'rootHistory()', [], [legacy[1], ...zero64]);
    await expect(pool, 'acceptedRoots(bytes32)', [legacy[1]], [1]);
    const spentDigest = '0x' + sha(Buffer.from('02' + projected.scope.slice(2) + '00000000' + '00'.repeat(32 * 64), 'hex'));
    const rootHistoryDigest = '0x' + sha(Buffer.from('18' + projected.scope.slice(2) + '00000001'
      + legacy[1].slice(2) + '00'.repeat(32 * 64), 'hex'));
    await expect(pool, 'spentDigest()', [], [spentDigest]);
    await expect(pool, 'rootHistoryDigest()', [], [rootHistoryDigest]);
    const authNodes = await emptyP2Tree(libraries.poseidon2Domains, domain, 0, block);
    await expect(pool, 'authorizationTreeNodes()', [], authNodes);
    await expect(pool, 'authorizationRoot()', [], [authNodes[1]]);
    await expect(pool, 'authorizationRootHistoryCount()', [], [1]);
    await expect(pool, 'authorizationRootHistory()', [], [authNodes[1], ...zero64]);
    await expect(pool, 'acceptedAuthorizationRoots(bytes32)', [authNodes[1]], [1]);
    await expect(hub, 'isRegisteredPool(address)', [pool.address], [1]);
    await expect(hub, 'poolDomain(address)', [pool.address], [domain]);
    await expect(hub, 'domainPool(bytes32)', [domain], [pool.address]);
    await expect(hub, 'reservedTagCapacityByPool(address)', [pool.address], [0]);
    const receiptNodes = await emptyP2Tree(libraries.poseidon2Domains, domain, 2, block);
    const revokedDigest = await libraries.poseidon2Domains.call('revokedDigest(uint256,bytes32,bytes32[64],uint256)',
      [domain, plan.hubDomain, zero64, 0], block);
    canonicalField(rawWords(revokedDigest, 1)[0].slice(2));
    const evidence = await libraries.poseidon2Domains.call('evidenceState(uint256,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256))',
      [domain, { hubDomain: plan.hubDomain, registryCommitment: plan.registryCommitment, receiptRoot: receiptNodes[1],
        receiptCount: 0, revokedDigest, revokedCount: 0, revocationSequence: 0 }], block);
    canonicalField(rawWords(evidence, 1)[0].slice(2));
    await expect(hub, 'receiptTreeNodes(bytes32)', [domain], receiptNodes);
    await expect(hub, 'receiptRoot(bytes32)', [domain], [receiptNodes[1]]);
    await expect(hub, 'receiptCount(bytes32)', [domain], [0]);
    await expect(hub, 'revokedDigest(bytes32)', [domain], [revokedDigest]);
    await expect(hub, 'evidenceState(bytes32)', [domain], [evidence]);
    await expect(hub, 'evidenceStateCount(bytes32)', [domain], [1]);
    await expect(hub, 'evidenceStateHistory(bytes32)', [domain], [evidence, ...Array(128).fill(ZERO32)]);
    await expect(hub, 'acceptedReceiptRoots(bytes32,bytes32)', [domain, receiptNodes[1]], [1]);
    await expect(hub, 'recordedEvidenceStates(bytes32,bytes32)', [domain, evidence], [1]);
    await expect(hub, 'evidenceStateRevocationSequence(bytes32,bytes32)', [domain, evidence], [0]);
    await expect(hub, 'isUsable(bytes32,bytes32)', [domain, evidence], [1]);
  }
  await unchangedHead(runtime, header); return freeze({ blockNumber: header.number, blockHash: header.hash,
    constructorStorageMatched: true, completeRuntimesMatched: true, poolsUnfunded: true });
}
