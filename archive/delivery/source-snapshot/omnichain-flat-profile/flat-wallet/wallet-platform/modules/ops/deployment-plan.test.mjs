/** Pure host tests. These read an existing compiler artifact; they never start
 * a compiler, chain, prover, verifier or deployment. The deliberately synthetic
 * pins and trace hash below are usable only as proposal-test data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildFlatDeploymentPlan, deriveFlatLibraryPlans, FLAT_BUILD_PIN, FLAT_VERIFIER_ORDER } from './deployment-plan.mjs';
import { FIELD_MODULUS, PROFILE_FIELD } from '../paeg/commitments.mjs';
import { predictNativeCreateAddress, nativeStaticArguments } from '../../../../../omnichain-product/src/paeg/native-deployment.mjs';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';

const root = new URL('../../../', import.meta.url);
const compiledPath = process.env.FLAT_PLAN_COMPILED_BUNDLE
  ?? new URL(`.local/contracts/${FLAT_BUILD_PIN.attempt}/compiled.json`, root);
let compilation;
try { compilation = JSON.parse(await readFile(compiledPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const requiresBundle = { skip: compilation ? false : 'Requires the preserved reviewed compile artifact; never compiles a replacement' };
const digest = n => '0x' + BigInt(n).toString(16).padStart(64, '0');
const address = n => '0x' + BigInt(n).toString(16).padStart(40, '0');
const keccak = bytes => '0x' + publicKeccak256(Buffer.from(bytes.slice(2), 'hex')).toString('hex');
const sourceMap = compilation ? Object.fromEntries(await Promise.all(Object.keys(FLAT_BUILD_PIN.sources).map(async name => {
  const content = await readFile(new URL('contracts/' + name, root), 'utf8');
  return [name, { content, sha256: createHash('sha256').update(content).digest('hex') }];
}))) : undefined;
// SEC2 public generator multiples. No private keys or signing operation.
const attesterKeys = [
  ['79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'],
  ['c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5', '1ae168fea63dc339a3c58419466ceaeef7f632653266d0e1236431a950cfe52a'],
  ['f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9', '388f7b0f632de8140fe337e62a37f3566500a99934c2231b6cb9fd7584b8e672'],
  ['e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13', '51ed993ea0d455b75642e2098ea51448d967ae33bfbdfe40cfe97bdc47739922'],
].map(([x, y]) => ({ x, y: y.padStart(64, '0') }));
function traceHash(fields) {
  // Deliberately not Poseidon2. This tests exact field forwarding only.
  return (1n + fields.reduce((sum, field, i) => sum + field * BigInt(i + 1), 0n) % (FIELD_MODULUS - 1n)).toString(16).padStart(64, '0');
}
const libraryAddresses = { poseidon2Domains: address(201), hubCodec: address(202) };
function fixture() {
  const libraries = deriveFlatLibraryPlans({ compilation, sourceMap, addresses: libraryAddresses });
  return { compilation, sourceMap, chainId: '31337', sender: address(50), nextNonce: '20',
    deploymentDomain: digest(7), registryEpoch: '8', rulesRoot: digest(9), attesterKeys,
    libraries: Object.fromEntries(Object.entries(libraries).map(([role, value]) => [role, { address: value.address, codeHash: value.codeHash }])),
    verifiers: Object.fromEntries(FLAT_VERIFIER_ORDER.map(([role], i) => [role, { address: address(100 + i), codeHash: digest(1000 + i) }])),
    pools: [{ asset: address(0), assetCodeHash: digest(0), deploymentDomain: digest(11), policy: digest(12) },
      { asset: address(300), assetCodeHash: digest(301), deploymentDomain: digest(13), policy: digest(14) }] };
}

test('all twelve ordered public widths include the absolute deposit and three legacy variants', () => {
  assert.deepEqual(FLAT_VERIFIER_ORDER.map(([role, words]) => role + ':' + words), [
    'authorization:16', 'reservation:58', 'dependency:42', 'ready:50', 'admission:84', 'node:32',
    'settlement:138', 'recovery:41', 'deposit_balance:26', 'withdraw_balance:39', 'withdraw:39', 'deposit_intent:27']);
});

test('library pins use the exact guard-free artifacts and remain bound to configured addresses', requiresBundle, () => {
  const first = deriveFlatLibraryPlans({ compilation, sourceMap, addresses: libraryAddresses });
  const second = deriveFlatLibraryPlans({ compilation, sourceMap, addresses: { poseidon2Domains: address(203), hubCodec: address(204) } });
  for (const role of Object.keys(first)) {
    assert.match(first[role].runtimeCode, /^0x6080604052/);
    assert.equal(first[role].runtimeCode, second[role].runtimeCode);
    assert.equal(first[role].codeHash, keccak(first[role].runtimeCode));
    assert.notEqual(first[role].address, second[role].address);
  }
  assert.equal(first.poseidon2Domains.runtimeBytes, 7598); assert.equal(first.hubCodec.runtimeBytes, 11073);
});

test('exact hub/pool proposal binds all reciprocal runtimes, domains and constructor words', requiresBundle, async () => {
  const input = fixture(), calls = [];
  const plan = await buildFlatDeploymentPlan(input, { hashFields: fields => { calls.push([...fields]); return traceHash(fields); } });
  assert.equal(plan.classification, 'PREDICTED_LOCAL_FLAT_DEPLOYMENT_NOT_CHAIN_OR_PROOF_EVIDENCE');
  assert.equal(plan.hub.address, predictNativeCreateAddress(input.sender, 20));
  assert.deepEqual(plan.pools.map(pool => pool.address), [21, 22].map(nonce => predictNativeCreateAddress(input.sender, nonce)));
  assert.equal(plan.hub.runtimeBytes, 24558); assert.equal(plan.hub.codeHash, keccak(plan.hub.runtimeCode));
  assert.deepEqual(plan.hub.configuration.poolCodeHashes, plan.pools.map(pool => pool.codeHash));
  assert.equal(plan.requiredVerifierLineage.length, 12);
  assert.equal(calls.length, 2); assert.equal(plan.ledgerNamespace, plan.hubDomain);
  const cfgWords = plan.verifierSet.pins.flatMap(pin => [pin.verifier, pin.codeHash]);
  cfgWords.push(plan.verifierSet.poseidon2Domains, plan.verifierSet.poseidon2DomainsCodeHash,
    plan.verifierSet.hubCodec, plan.verifierSet.hubCodecCodeHash);
  const words = values => nativeStaticArguments(values.map(() => ({ type: 'uint256' })), values);
  const hubExpected = [input.deploymentDomain, input.registryEpoch, input.rulesRoot, ...cfgWords,
    ...plan.pools.map(pool => pool.address), ...plan.pools.map(pool => pool.codeHash),
    ...input.attesterKeys.map(key => '0x' + key.x), ...input.attesterKeys.map(key => '0x' + key.y),
    plan.hub.configuration.claimAuthority, plan.hub.configuration.claimAuthorityCodeHash];
  assert.equal(plan.hub.constructorData, words(hubExpected));
  for (const [index, pool] of plan.pools.entries()) {
    assert.equal(pool.runtimeBytes, 22577); assert.equal(pool.codeHash, keccak(pool.runtimeCode));
    assert.equal(pool.configuration.receiptHubCodeHash, plan.hub.codeHash);
    assert.equal(pool.configuration.receiptHub, plan.hub.address);
    assert.equal(pool.constructorData, words([input.pools[index].asset, input.pools[index].deploymentDomain,
      input.pools[index].policy, ...cfgWords, plan.hub.address, plan.hub.codeHash, plan.hubDomain, plan.registryCommitment]));
    const ordered = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'];
    assert.deepEqual(calls[index], [PROFILE_FIELD, 1n, 1n, 14n, ...ordered.flatMap(key => [
      BigInt('0x' + pool.domain[key].slice(0, 32)), BigInt('0x' + pool.domain[key].slice(32))])]);
    assert.equal(pool.domainCommitment, '0x' + traceHash(calls[index]));
    assert.equal(Object.isFrozen(pool.configuration.verifierSet.pins), true);
    assert.ok(pool.creationData.endsWith(pool.constructorData.slice(2)));
    assert.ok((pool.creationData.length - 2) / 2 <= 49152);
  }
  assert.notEqual(plan.pools[0].domainCommitment, plan.pools[1].domainCommitment);
  assert.deepEqual(plan.postDeployment, plan.pools.map(pool => ({ target: plan.hub.address, method: 'registerPoolDomain(address)', pool: pool.address })));
});

test('optional claim authority is embedded in hub and reciprocal pool runtime pins', requiresBundle, async () => {
  const input = fixture();
  const without = await buildFlatDeploymentPlan(input, { hashFields: traceHash });
  assert.equal(BigInt(without.hub.configuration.claimAuthority), 0n);
  assert.equal(BigInt(without.hub.configuration.claimAuthorityCodeHash), 0n);
  input.claimAuthority = { address: '0x' + '73'.repeat(20), codeHash: digest(731) };
  const withClaims = await buildFlatDeploymentPlan(input, { hashFields: traceHash });
  assert.equal(withClaims.hub.configuration.claimAuthority, input.claimAuthority.address);
  assert.equal(withClaims.hub.configuration.claimAuthorityCodeHash, input.claimAuthority.codeHash);
  assert.notEqual(withClaims.hub.codeHash, without.hub.codeHash);
  assert.notEqual(withClaims.pools[0].codeHash, without.pools[0].codeHash);
  assert.equal(withClaims.pools[0].configuration.receiptHubCodeHash, withClaims.hub.codeHash);
  input.claimAuthority.codeHash = '0x' + '00'.repeat(32);
  await assert.rejects(buildFlatDeploymentPlan(input, { hashFields: traceHash }), /ZERO_BYTES32/);
});

test('a changed pool policy changes its runtime and hub constructor without a hash fixed point', requiresBundle, async () => {
  const input = fixture(), initial = await buildFlatDeploymentPlan(input, { hashFields: traceHash });
  input.pools[0].policy = digest(999);
  const changed = await buildFlatDeploymentPlan(input, { hashFields: traceHash });
  assert.equal(initial.hub.runtimeCode, changed.hub.runtimeCode);
  assert.notEqual(initial.hub.constructorData, changed.hub.constructorData);
  assert.notEqual(initial.pools[0].codeHash, changed.pools[0].codeHash);
  assert.equal(initial.pools[1].codeHash, changed.pools[1].codeHash);
  input.verifiers.node.codeHash = digest(1234);
  const verifierChanged = await buildFlatDeploymentPlan(input, { hashFields: traceHash });
  assert.notEqual(changed.verifierSetCommitment, verifierChanged.verifierSetCommitment);
  assert.notEqual(changed.hub.codeHash, verifierChanged.hub.codeHash);
  for (let i = 0; i < 2; i++) assert.notEqual(changed.pools[i].domainCommitment, verifierChanged.pools[i].domainCommitment);
});

test('reviewed source, AST, settings, runtime, links and ABI pins fail closed', requiresBundle, async t => {
  const changes = [
    ['source', data => { data.sourceMap['PrivateFlatReceiptHub.sol'].content += '\n'; }, /SOURCE_PIN/],
    ['AST immutable name', data => { data.compilation.sourceASTs['PrivateFlatReceiptHub.sol'].nodes[0].id += 1; }, /AST_PIN/],
    ['compiler settings', data => { data.compilation.settings.optimizer.runs = 1; }, /SETTINGS_PIN/],
    ['runtime byte', data => { data.compilation.contracts['PrivateFlatReceiptHub.sol'].PrivateFlatReceiptHub.evm.deployedBytecode.object += '00'; }, /ARTIFACT_PIN/],
    ['creation library link', data => { data.compilation.contracts['PrivateFlatAssetNotePool.sol'].PrivateFlatAssetNotePool.evm.bytecode.linkReferences = {}; }, /ARTIFACT_PIN/],
    ['constructor ABI', data => { data.compilation.contracts['PrivateFlatReceiptHub.sol'].PrivateFlatReceiptHub.abi.find(item => item.type === 'constructor').inputs[0].components.reverse(); }, /ARTIFACT_PIN/],
  ];
  for (const [name, mutate, reason] of changes) await t.test(name, async () => {
    const data = structuredClone(fixture()); mutate(data);
    await assert.rejects(buildFlatDeploymentPlan(data, { hashFields: traceHash }), reason);
  });
});

test('invalid chain, nonce, identity, verifier and hash-provider inputs fail before a proposal is returned', requiresBundle, async t => {
  const changes = [
    ['foreign chain', data => { data.chainId = '1'; }, /LOCAL_CHAIN/],
    ['nonce overflow', data => { data.nextNonce = ((1n << 64n) - 3n).toString(); }, /CREATE_NONCE_LIMIT/],
    ['native asset code mismatch', data => { data.pools[0].assetCodeHash = digest(5); }, /ASSET_CODE_IDENTITY/],
    ['missing verifier', data => { delete data.verifiers.node; }, /EXACT_FIELDS/],
    ['zero verifier', data => { data.verifiers.node.address = address(0); }, /ZERO_ADDRESS/],
    ['wrong library runtime', data => { data.libraries.hubCodec.codeHash = digest(7); }, /LIBRARY_RUNTIME_PIN/],
    ['prerequisite collision', data => { data.verifiers.node.address = predictNativeCreateAddress(data.sender, data.nextNonce); }, /ADDRESS_COLLISION/],
    ['contradictory verifier pins', data => { data.verifiers.node.address = data.verifiers.settlement.address; }, /CONTRADICTORY_CODE_PIN/],
    ['contradictory asset/library pins', data => { data.pools[1].asset = data.libraries.hubCodec.address; }, /CONTRADICTORY_CODE_PIN/],
    ['invalid key registry', data => { data.attesterKeys[1] = { ...data.attesterKeys[0] }; }, /DUPLICATE_KEY_X/],
  ];
  for (const [name, mutate, reason] of changes) await t.test(name, async () => {
    const data = structuredClone(fixture()); mutate(data);
    await assert.rejects(buildFlatDeploymentPlan(data, { hashFields: traceHash }), reason);
  });
  await assert.rejects(buildFlatDeploymentPlan(fixture(), { hashFields: () => '0'.repeat(64) }), /NONZERO/);
  await assert.rejects(buildFlatDeploymentPlan(fixture(), { hashFields: () => FIELD_MODULUS.toString(16).padStart(64, '0') }), /FIELD_RANGE/);
  await assert.rejects(buildFlatDeploymentPlan(fixture(), { hashFields: () => '0'.repeat(63) + '1' }), /DUPLICATE_DOMAIN/);
});

test('the async hash provider cannot change the caller data already snapshotted for the plan', requiresBundle, async () => {
  const data = fixture(), expectedPolicy = data.pools[1].policy;
  const plan = await buildFlatDeploymentPlan(data, { hashFields: async fields => {
    data.pools[1].policy = digest(666); data.verifiers.node.codeHash = digest(667); return traceHash(fields);
  } });
  assert.equal(plan.pools[1].configuration.policy, expectedPolicy);
  assert.equal(plan.verifierSet.pins[5].codeHash, digest(1005));
});

test('caller accessors and proxies are rejected without invoking them', requiresBundle, async () => {
  const data = fixture(); let invoked = false;
  Object.defineProperty(data, 'sender', { enumerable: true, get() { invoked = true; return address(50); } });
  await assert.rejects(buildFlatDeploymentPlan(data, { hashFields: traceHash })); assert.equal(invoked, false);
  await assert.rejects(buildFlatDeploymentPlan(new Proxy(fixture(), {}), { hashFields: traceHash }), /PLAIN_DATA/);
});
