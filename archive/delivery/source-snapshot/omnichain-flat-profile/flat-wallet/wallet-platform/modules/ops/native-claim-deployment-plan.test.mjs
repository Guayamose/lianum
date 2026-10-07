/** Read-only retained-artifact proposals. No nodes, compiler, prover, sends,
 * signatures, verifier execution or ownership brands are created here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadFlatDeploymentArtifacts } from './deployment-artifacts.mjs';
import { loadNativeClaimArtifacts } from './native-claim-artifacts.mjs';
import { deriveFlatLibraryPlans, FLAT_VERIFIER_ORDER } from './deployment-plan.mjs';
import { buildNativeClaimDeploymentPlan, buildOwnedNativeClaimRules,
  deriveOwnedNativeCurrencyAsset, claimArtifactMethod } from './native-claim-deployment-plan.mjs';
import { claimABIType } from '../native-claims/abi.mjs';
import { assertOwnedNativeClaimBootstrap, assertOwnedNativeClaimSystem,
  createNativeClaimBootstrap } from './deploy-native-claims.mjs';
import { predictNativeCreateAddress } from '../../../../../omnichain-product/src/paeg/native-deployment.mjs';
import { FIELD_MODULUS } from '../paeg/commitments.mjs';
import { claimDomainCommitment, claimVerifierSetCommitment } from '../native-claims/framing.mjs';

const digest = n => BigInt(n).toString(16).padStart(64, '0'), address = n => '0x' + BigInt(n).toString(16).padStart(40, '0');
const hash = value => createHash('sha256').update(value).digest('hex');
let bundle, base;
try { [bundle, base] = await Promise.all([loadNativeClaimArtifacts(), loadFlatDeploymentArtifacts()]); }
catch (error) {
  if (error.code !== 'ENOENT' && error.message !== 'CLAIM_VERIFIER_ARTIFACTS_NOT_PREPARED') throw error;
}
const retained = { skip: bundle && base ? false : 'Requires preserved checked builds; never compiles a replacement' };
const keys = [
  ['79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'],
  ['c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5', '1ae168fea63dc339a3c58419466ceaeef7f632653266d0e1236431a950cfe52a'],
  ['f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9', '388f7b0f632de8140fe337e62a37f3566500a99934c2231b6cb9fd7584b8e672'],
  ['e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13', '51ed993ea0d455b75642e2098ea51448d967ae33bfbdfe40cfe97bdc47739922'],
].map(([x, y]) => ({ x, y: y.padStart(64, '0') }));
// Trace arithmetic tests argument forwarding only and is explicitly not Poseidon2.
const hashFields = async fields => (1n + fields.reduce((n, x, i) => n + x * BigInt(i + 1), 0n)
  % (FIELD_MODULUS - 1n)).toString(16).padStart(64, '0');
function fixture() {
  const rules = buildOwnedNativeClaimRules({ bitcoinGenesis: digest(11), solanaGenesis: digest(12) });
  const libraries = deriveFlatLibraryPlans({ compilation: base.ledger.compilation, sourceMap: base.ledger.sourceMap,
    addresses: { poseidon2Domains: address(201), hubCodec: address(202) } });
  return { bundle: { contracts: bundle.contracts, verifiers: Object.fromEntries(Object.entries(bundle.verifiers)
    .map(([role, { sourceBytes, ...entry }]) => [role, entry])) }, ledger: base.ledger,
    sender: address(50), nextNonce: '20', evmGenesis: digest(99),
    libraries: Object.fromEntries(Object.entries(libraries).map(([role, row]) => [role, { address: row.address, codeHash: row.codeHash }])),
    verifiers: Object.fromEntries(FLAT_VERIFIER_ORDER.map(([role], i) => [role, { address: address(100 + i), codeHash: '0x' + digest(1000 + i) }])),
    configuration: { deploymentDomain: '0x' + digest(7), registryEpoch: '1', rulesRoot: '0x' + rules.root,
      attesterKeys: keys, pools: [0, 1].map(i => ({ policy: '0x' + digest(30 + i), deploymentDomain: '0x' + digest(40 + i) })) },
    rules: rules.rules, inventoryDomains: [digest(51), digest(52)],
    nativeRoles: [0, 1].map(i => Object.fromEntries(['depositor', 'escrow', 'recipient'].map((role, j) => [role,
      { address: 'TEST_ONLY_' + role + i, endpoint: i === 0 ? '0014' + String(j + 1).repeat(40) : String(j + 1).repeat(64) }]))) };
}

test('fixed native currency identity ignores no caller labels and binds family and genesis', () => {
  const input = { family: '1', genesis: digest(1) }, asset = deriveOwnedNativeCurrencyAsset(input);
  assert.equal(asset, deriveOwnedNativeCurrencyAsset(input));
  assert.notEqual(asset, deriveOwnedNativeCurrencyAsset({ family: '2', genesis: input.genesis }));
  assert.notEqual(asset, deriveOwnedNativeCurrencyAsset({ family: '1', genesis: digest(2) }));
  assert.throws(() => deriveOwnedNativeCurrencyAsset({ ...input, asset: digest(9) }), /EXACT_FIELDS/);
  assert.throws(() => deriveOwnedNativeCurrencyAsset({ family: '3', genesis: input.genesis }), /NATIVE_FAMILY/);
  const rules = buildOwnedNativeClaimRules({ bitcoinGenesis: digest(1), solanaGenesis: digest(2) });
  assert.deepEqual(rules.rules.map(rule => [rule.family, rule.minimumConfirmations, rule.maximumEvidenceLifetime, rule.maximumClockSkew]),
    [['1', '6', '300', '30'], ['2', '0', '300', '30']]);
});

test('all claim and ledger CREATE identities and hash cycles resolve before any send', retained, async () => {
  const input = fixture(), plan = await buildNativeClaimDeploymentPlan(input, { hashFields });
  const creates = [...plan.deployments, plan.flatPlan.hub, ...plan.flatPlan.pools];
  assert.equal(creates.length, 16);
  creates.forEach((record, i) => {
    assert.equal(record.nonce, String(20 + i));
    assert.equal(record.address, predictNativeCreateAddress(input.sender, BigInt(20 + i)));
    assert.ok(record.runtimeBytes <= 24576 && (record.creationData.length - 2) / 2 <= 49152);
  });
  assert.equal(new Set(creates.map(record => record.address)).size, creates.length);
  assert.deepEqual(plan.deployments.slice(-5).map(record => record.contractName),
    ['NativeClaimToken', 'NativeClaimToken', 'NativeClaimGateway', 'NativeClaimGateway', 'NativeClaimAuthority']);
  assert.equal(plan.flatPlan.hub.immutableValues.claimAuthority, plan.authority.address);
  assert.equal(plan.flatPlan.hub.immutableValues.claimAuthorityCodeHash, plan.authority.codeHash);
  for (const [i, config] of plan.configs.entries()) {
    assert.equal(config.gateway, plan.gateways[i].address.slice(2));
    assert.equal(config.gatewayCodeHash, plan.gateways[i].codeHash.slice(2));
    assert.equal(config.wrapper, plan.wrappers[i].address.slice(2));
    assert.equal(config.wrapperCodeHash, plan.wrappers[i].codeHash.slice(2));
    assert.equal(config.poolCodeHash, plan.flatPlan.pools[i].codeHash.slice(2));
    assert.equal(config.hubCodeHash, plan.flatPlan.hub.codeHash.slice(2));
    assert.equal(config.claimVerifierSetCommitment, claimVerifierSetCommitment(plan.verifierPins));
    assert.equal(plan.gateways[i].claimDomain, '0x' + claimDomainCommitment(config));
    assert.equal(plan.gateways[i].configurationCommitment,
      '0x' + hash(Buffer.from(plan.gateways[i].constructorData.slice(2), 'hex')));
    assert.equal((plan.gateways[i].constructorData.length - 2) / 2, 1536);
    assert.equal(plan.gateways[i].constructorData.slice(2, 66), digest(32));
    assert.equal(plan.gateways[i].deployment.validationCodeHash, plan.libraries.nativeClaimValidation.codeHash);
    assert.equal(plan.gateways[i].libraries['native-claims/NativeClaimValidation.sol:NativeClaimValidation'], plan.libraries.nativeClaimValidation.address);
    assert.equal(plan.policies[i].hubDomain, plan.flatPlan.hubDomain.slice(2));
  }
  assert.ok(Object.isFrozen(plan.configs[0]) && Object.isFrozen(plan.gateways[0].deployment));
});

test('in-flight caller mutations cannot change the snapshotted proposal', retained, async () => {
  const input = fixture(), originalPolicy = input.configuration.pools[0].policy;
  const plan = await buildNativeClaimDeploymentPlan(input, { hashFields: async fields => {
    input.configuration.pools[0].policy = '0x' + digest(800);
    input.nativeRoles[0].escrow.endpoint = '0014' + '99'.repeat(20);
    return hashFields(fields);
  } });
  assert.equal(plan.configs[0].policy, originalPolicy.slice(2));
  assert.equal(plan.gateways[0].deployment.escrowEndpoint, '0x0014' + '2'.repeat(40));
});

test('library facade methods use their compiled nominal struct selectors', retained, () => {
  const artifact = bundle.contracts.artifacts.nativeClaimCodec;
  const method = artifact.abi.find(item => item.type === 'function' && item.name === 'claimDomain');
  const canonical = method.name + '(' + method.inputs.map(claimABIType).join(',') + ')';
  const nominal = 'claimDomain(NativeClaimTypes.Configuration)';
  assert.equal(artifact.evm.methodIdentifiers[canonical], undefined);
  assert.deepEqual(claimArtifactMethod(artifact, canonical), claimArtifactMethod(artifact, nominal));
  assert.equal(claimArtifactMethod(artifact, canonical).selector, artifact.evm.methodIdentifiers[nominal]);
  assert.throws(() => claimArtifactMethod(artifact, 'claimDomain(bytes32)'), /ABI_METHOD/);
});

test('asset relabels, incomplete rule registration, shared inventories and prospective nonce overflow fail closed', retained, async () => {
  for (const change of [input => { input.rules = structuredClone(input.rules); input.rules[0].asset = digest(900); },
    input => { input.configuration.rulesRoot = '0x' + digest(901); },
    input => { input.inventoryDomains[1] = input.inventoryDomains[0]; },
    input => { input.nextNonce = '18446744073709551615'; }]) {
    const input = fixture(); change(input);
    await assert.rejects(buildNativeClaimDeploymentPlan(input, { hashFields }));
  }
});

test('data, copied identities and caller artifact overrides never grant bootstrap authority', async () => {
  for (const value of [undefined, null, {}, { classification: 'OWNED_LOCAL_NATIVE_CLAIM_BOOTSTRAP' }]) {
    assert.throws(() => assertOwnedNativeClaimBootstrap({}, value), /CLAIM_OWNED_BOOTSTRAP_REQUIRED/);
    assert.throws(() => assertOwnedNativeClaimSystem({}, value), /CLAIM_OWNED_SYSTEM_REQUIRED/);
  }
  await assert.rejects(createNativeClaimBootstrap({ runtime: {}, nativeRuntimes: [], journalRoot: '/tmp', artifacts: {} }), /EXACT_FIELDS/);
  await assert.rejects(createNativeClaimBootstrap({ runtime: {}, nativeRuntimes: [{}, {}], journalRoot: '/tmp' }), /OWNED_RUNTIME_CAPABILITY/);
});
