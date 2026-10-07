import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  NATIVE_ABI_SCHEMAS, NATIVE_INPUT_WORDS, NATIVE_SOURCE_NAMES, NATIVE_SOURCE_PINS,
  nativeStaticArguments, nativeStaticCalldata, nativeProofCalldata,
  predictNativeCreateAddress, deriveNativeHubDomain, deriveNativeRuntimeCode,
  assertNativeRuntimeCode, buildNativeDeploymentPlan, validateNativeSystemSources,
  compileNativeSystem, deployNativeSystem,
} from '../../../../src/execution/native/dispatch/native-deployment.mjs';
import { publicKeccak256 } from '../../../../src/cohorts/private-cohort-public-native.mjs';
import { nativeQuorumRegistryCommitment } from '../../../../src/evidence/native-quorum.mjs';

const zero32 = `0x${'00'.repeat(32)}`, address = n => `0x${n.toString(16).padStart(40, '0')}`;
const digest = n => `0x${n.toString(16).padStart(64, '0')}`;
const word = n => BigInt(n).toString(16).padStart(64, '0');
const hash = data => createHash('sha256').update(data).digest('hex');
const tuple = components => ({ type: 'tuple', components });
const quorum = { type: 'tuple[3]', components: NATIVE_ABI_SCHEMAS.quorumSignature };
const tupleSignature = '(uint8,uint8,bytes32,bytes32)[3]';
const canonical = input => input.type.startsWith('tuple')
  ? `(${input.components.map(canonical).join(',')})${input.type.slice(5)}` : input.type;
function methodArtifact(name, inputs) {
  const signature = `${name}(${inputs.map(canonical).join(',')})`;
  const selector = publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
  return { signature, artifact: { abi: [{ type: 'function', name, inputs }], evm: { methodIdentifiers: { [signature]: selector } } } };
}
function health() {
  return { healthFrom: '100', healthUntil: '120', healthSignatures: [0, 1, 3].map(i => ({
    signerIndex: String(i), v: '27', r: digest(i + 1), s: digest(i + 2),
  })) };
}

test('CREATE predictions match public Ethereum vectors and canonical nonce boundaries', () => {
  const sender = '0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0';
  assert.equal(predictNativeCreateAddress(sender, 0), '0xcd234a471b72ba2f1ccf0a70fcaba648a5eecd8d');
  assert.equal(predictNativeCreateAddress(sender, 1), '0x343c43a37d37dff08ae8c4a11544c718abb4fcf8');
  assert.equal(predictNativeCreateAddress(sender, 2), '0xf778b86fa74e846c4f0a1fbd1335fe81c00a0c91');
  for (const [nonce, rlp] of [[127n, `d694${sender.slice(2)}7f`], [128n, `d794${sender.slice(2)}8180`],
    [256n, `d894${sender.slice(2)}820100`]]) {
    assert.equal(predictNativeCreateAddress(sender, nonce), `0x${publicKeccak256(Buffer.from(rlp, 'hex')).subarray(12).toString('hex')}`);
  }
  for (const nonce of [-1, -0, Number.MAX_SAFE_INTEGER + 1, '01', 1n << 64n])
    assert.throws(() => predictNativeCreateAddress(sender, nonce), /NATIVE_ABI/);
});

test('hub domain uses packed prefix, uint256 chain id, 20-byte address and bytes32 domain', () => {
  const hub = address(17), domain = digest(29);
  const encoded = Buffer.concat([Buffer.from([0x30]), Buffer.from(word(31337), 'hex'),
    Buffer.from(hub.slice(2), 'hex'), Buffer.from(domain.slice(2), 'hex')]);
  assert.equal(encoded.length, 85);
  assert.equal(deriveNativeHubDomain('31337', hub, domain), `0x${hash(encoded)}`);
  assert.notEqual(deriveNativeHubDomain('31338', hub, domain), deriveNativeHubDomain('31337', hub, domain));
});

test('hub and pool constructor tuples encode every fixed field in compiler schema order', () => {
  const hub = { deploymentDomain: digest(1), registryEpoch: '7', rulesRoot: digest(2), admissionVerifier: address(3),
    admissionVerifierCodeHash: digest(4), pools: [address(5), address(6)], poolCodeHashes: [digest(7), digest(8)],
    attesterX: [9n, 10n, 11n, 12n], attesterY: [13n, 14n, 15n, 16n] };
  const encoded = nativeStaticArguments([tuple(NATIVE_ABI_SCHEMAS.hubDeployment)], [hub]);
  assert.equal((encoded.length - 2) / 2, 17 * 32);
  assert.equal(encoded, `0x${[1, 7, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(word).join('')}`);
  const pool = Object.fromEntries(NATIVE_ABI_SCHEMAS.poolDeployment.map(({ name, type }, i) => [name,
    type === 'address' ? address(i + 1) : digest(i + 1)]));
  assert.equal(nativeStaticArguments([tuple(NATIVE_ABI_SCHEMAS.poolDeployment)], [pool]),
    `0x${Array.from({ length: 14 }, (_, i) => word(i + 1)).join('')}`);
  assert.throws(() => nativeStaticArguments([tuple(NATIVE_ABI_SCHEMAS.hubDeployment)], [{ ...hub, ignored: 1 }]), /TUPLE_FIELDS/);
  assert.throws(() => nativeStaticArguments([tuple(NATIVE_ABI_SCHEMAS.hubDeployment)], [{ ...hub, pools: [address(5)] }]), /FIXED_ARRAY/);
});

test('static encoding rejects unknown schemas, dynamic arrays, sparse arrays, ranges and getter properties', () => {
  assert.throws(() => nativeStaticArguments([tuple([{ name: 'admin', type: 'address' }])], [{ admin: address(1) }]), /UNKNOWN_TUPLE_SCHEMA/);
  assert.throws(() => nativeStaticArguments([{ type: 'bytes32[]' }], [[]]), /UNSUPPORTED_STATIC/);
  assert.throws(() => nativeStaticArguments([{ type: 'uint8' }], [256]), /UINT_RANGE/);
  assert.throws(() => nativeStaticArguments([{ type: 'bool' }], [1]), /BOOLEAN/);
  assert.throws(() => nativeStaticArguments([{ type: 'bytes32[2]' }], [new Array(2)]), /FIXED_ARRAY/);
  const signature = { signerIndex: '0', v: '27', r: digest(1), get s() { throw new Error('must not invoke getter'); } };
  assert.throws(() => nativeStaticArguments([tuple(NATIVE_ABI_SCHEMAS.quorumSignature)], [signature]), /TUPLE_FIELDS/);
});

test('canonical tuple method selectors are cross-checked, rather than trusted from an artifact', () => {
  const { artifact, signature } = methodArtifact('verifyFinalityHealth', [{ type: 'uint64' }, { type: 'uint64' }, quorum]);
  const h = health();
  const encoded = nativeStaticCalldata(artifact, signature, [h.healthFrom, h.healthUntil, h.healthSignatures]);
  assert.equal((encoded.length - 10) / 2, 14 * 32);
  assert.equal(signature, `verifyFinalityHealth(uint64,uint64,${tupleSignature})`);
  const bad = structuredClone(artifact); bad.evm.methodIdentifiers[signature] = '00000000';
  assert.throws(() => nativeStaticCalldata(bad, signature, [h.healthFrom, h.healthUntil, h.healthSignatures]), /SELECTOR_MISMATCH/);
});

test('health proof calldata uses a 512-byte head and correct dynamic offsets, padding and signatures', () => {
  const { artifact, signature } = methodArtifact('admit', [{ type: 'bytes' }, { type: 'bytes32[]' },
    { type: 'uint64' }, { type: 'uint64' }, quorum]);
  const proof = Buffer.alloc(33, 0xab), h = health();
  const encoded = Buffer.from(nativeProofCalldata(artifact, signature, proof, ['7', '9'], h).slice(10), 'hex');
  const at = offset => BigInt(`0x${encoded.subarray(offset, offset + 32).toString('hex')}`);
  assert.equal(at(0), 512n); assert.equal(at(32), 608n);
  assert.equal(at(64), 100n); assert.equal(at(96), 120n);
  assert.equal(at(128), 0n); assert.equal(at(160), 27n);
  assert.equal(at(384), 3n); assert.equal(at(416), 27n);
  assert.equal(at(512), 33n); assert.deepEqual(encoded.subarray(544, 577), proof);
  assert.ok(encoded.subarray(577, 608).every(byte => byte === 0));
  assert.equal(at(608), 2n); assert.equal(at(640), 7n); assert.equal(at(672), 9n);
  assert.equal(encoded.length, 704);
  const outOfOrder = health(); outOfOrder.healthSignatures.reverse();
  assert.throws(() => nativeProofCalldata(artifact, signature, proof, [], outOfOrder), /SIGNER_ORDER/);
  assert.throws(() => nativeProofCalldata(artifact, signature, proof, [], { ...h, trusted: true }), /HEALTH_FIELDS/);
  const highS = health(); highS.healthSignatures[0].s = `0x${'ff'.repeat(32)}`;
  assert.throws(() => nativeProofCalldata(artifact, signature, proof, [], highS), /SIGNATURE_LOW_S/);
});

test('legacy and guarded proof heads remain exact and reject unintended extensions', () => {
  const verifier = methodArtifact('verify', [{ type: 'bytes' }, { type: 'bytes32[]' }]);
  const raw = nativeProofCalldata(verifier.artifact, verifier.signature, Buffer.from([1]), [2n]).slice(10);
  assert.equal(raw.slice(0, 128), word(64) + word(128));
  assert.throws(() => nativeProofCalldata(verifier.artifact, verifier.signature, Buffer.alloc(0), [], {}), /UNEXPECTED_PROOF_OPTIONS/);
  const guarded = methodArtifact('reserveGenericGuarded', [{ type: 'bytes' }, { type: 'bytes32[]' }, { type: 'uint64' }, { type: 'bytes32' }]);
  const encoded = nativeProofCalldata(guarded.artifact, guarded.signature, Buffer.alloc(0), [], { expectedSequence: '5', expectedPostRoot: digest(7) }).slice(10);
  assert.equal(encoded.slice(0, 256), [128, 160, 5, 7].map(word).join(''));
  assert.throws(() => nativeProofCalldata(guarded.artifact, guarded.signature, Buffer.alloc(0), []), /RESERVE_GUARDS/);
});

test('runtime derivation substitutes only checked references and checks every deployed byte', () => {
  const artifact = { evm: { deployedBytecode: { object: `60${'00'.repeat(32)}61${'00'.repeat(32)}00`,
    linkReferences: {}, immutableReferences: { 4: [{ start: 1, length: 32 }], 9: [{ start: 34, length: 32 }] } } } };
  const options = { artifact, immutableNames: { 4: 'domain', 9: 'verifier' }, immutableValues: { domain: digest(17), verifier: address(3) } };
  const expected = `0x60${word(17)}61${word(3)}00`;
  assert.equal(deriveNativeRuntimeCode(options), expected);
  assert.equal(deriveNativeRuntimeCode({ ...options, immutableNames: { ...options.immutableNames, 12: '$MSMSize' },
    immutableValues: { ...options.immutableValues, $MSMSize: 99 } }), expected,
  'declared constructor constants optimized out of runtime need no artificial byte patch');
  assert.equal(assertNativeRuntimeCode({ ...options, actualCode: expected }).exactRuntimeMatch, true);
  for (const actualCode of [expected.replace(/^0x60/, '0x61'), `${expected.slice(0, -2)}01`, expected.slice(0, -2)])
    assert.throws(() => assertNativeRuntimeCode({ ...options, actualCode }), /EXACT_DEPLOYED_RUNTIME/);
  assert.throws(() => deriveNativeRuntimeCode({ ...options, immutableValues: { ...options.immutableValues, unused: 1 } }), /IMMUTABLE_VALUE_FIELDS/);
  const overlap = structuredClone(artifact); overlap.evm.deployedBytecode.immutableReferences[9][0].start = 2;
  assert.throws(() => deriveNativeRuntimeCode({ ...options, artifact: overlap }), /RUNTIME_OVERLAP/);
  const width = structuredClone(artifact); width.evm.deployedBytecode.immutableReferences[9][0].length = 20;
  assert.throws(() => deriveNativeRuntimeCode({ ...options, artifact: width }), /IMMUTABLE_WIDTH/);
  const nonzero = structuredClone(artifact); nonzero.evm.deployedBytecode.object = `6001${'00'.repeat(31)}61${'00'.repeat(32)}00`;
  assert.throws(() => deriveNativeRuntimeCode({ ...options, artifact: nonzero }), /TEMPLATE_NOT_ZERO/);
});

test('library self-address guard and EIP-170 limits are enforced before deployment', () => {
  const artifact = { evm: { deployedBytecode: { object: `73${'00'.repeat(20)}301400`, linkReferences: {}, immutableReferences: {} } } };
  assert.equal(deriveNativeRuntimeCode({ artifact, isLibrary: true, deployedAddress: address(99) }), `0x73${address(99).slice(2)}301400`);
  const tooBig = { evm: { deployedBytecode: { object: '00'.repeat(24577), linkReferences: {}, immutableReferences: {} } } };
  assert.throws(() => deriveNativeRuntimeCode({ artifact: tooBig }), /EIP170_SIZE/);
  assert.throws(() => deriveNativeRuntimeCode({ artifact: tooBig, isLibrary: true, deployedAddress: address(1) }), /EIP170_SIZE/);
});

// Pure byte-template fixture only. It cannot receive a compilation capability
// and is never compiled, sent to an EVM, or presented as an actual verifier.
function planFixture() {
  const hubNames = ['deploymentDomain', 'hubDomain', 'registryCommitment', 'registryEpoch', 'rulesRoot',
    'admissionVerifier', 'admissionVerifierCodeHash', 'pool0', 'pool1'];
  const poolNames = ['asset', 'deploymentDomain', 'policy', 'assetCodeHash', 'assetIdentity', 'scope',
    ...['depositBalanceVerifier', 'withdrawBalanceVerifier', 'withdrawVerifier', 'reserveGenericVerifier',
      'recoverGenericVerifier', 'fulfillGenericVerifier'].flatMap(name => [name, `${name}CodeHash`]),
    'receiptHub', 'receiptHubCodeHash', 'hubDomain', 'registryCommitment'];
  const artifact = (names, schema) => ({ abi: [{ type: 'constructor', inputs: [tuple(schema)] }], evm: {
    deployedBytecode: { object: names.map(() => `7f${'00'.repeat(32)}`).join('') + '00', linkReferences: {},
      immutableReferences: Object.fromEntries(names.map((_, i) => [i + 1, [{ start: 33 * i + 1, length: 32 }]])) },
  } });
  const compilation = { output: { contracts: {
    [NATIVE_SOURCE_NAMES.hub]: { PrivateNativeReceiptHub: artifact(hubNames, NATIVE_ABI_SCHEMAS.hubDeployment) },
    [NATIVE_SOURCE_NAMES.pool]: { PrivateGenericNativeAssetNotePool: artifact(poolNames, NATIVE_ABI_SCHEMAS.poolDeployment) },
  } }, immutableNames: {
    [NATIVE_SOURCE_NAMES.hub]: Object.fromEntries(hubNames.map((name, i) => [i + 1, name])),
    [NATIVE_SOURCE_NAMES.pool]: Object.fromEntries(poolNames.map((name, i) => [i + 1, name])),
  } };
  // SEC2's generator and successive public multiples, no signing keys.
  const keys = [
    ['79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'],
    ['c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5', '1ae168fea63dc339a3c58419466ceaeef7f632653266d0e1236431a950cfe52a'],
    ['f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9', '388f7b0f632de8140fe337e62a37f3566500a99934c2231b6cb9fd7584b8e672'],
    ['e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13', '51ed993ea0d455b75642e2098ea51448d967ae33bfbdfe40cfe97bdc47739922'],
  ].map(([x, y]) => ({ x, y: y.padStart(64, '0') }));
  return { compilation, chainId: '31337', sender: address(55), nextNonce: '20', deploymentDomain: digest(7), registryEpoch: '8',
    rulesRoot: digest(9), attesterKeys: keys, pools: [{ policy: digest(11), deploymentDomain: digest(12) },
      { policy: digest(13), deploymentDomain: digest(14) }], asset: address(0), assetCodeHash: zero32,
    verifiers: Object.fromEntries(Object.keys(NATIVE_INPUT_WORDS).map((mode, i) => [mode, { address: address(100 + i), codeHash: digest(1000 + i) }])) };
}

test('reciprocal deployment plan binds future pool hashes without a hub hash fixed-point', () => {
  const input = planFixture(), plan = buildNativeDeploymentPlan(input);
  assert.equal(plan.hub.address, predictNativeCreateAddress(input.sender, 20));
  assert.equal(plan.pools[0].address, predictNativeCreateAddress(input.sender, 21));
  assert.equal(plan.pools[1].address, predictNativeCreateAddress(input.sender, 22));
  assert.equal(plan.registryCommitment, `0x${nativeQuorumRegistryCommitment(plan.registry)}`);
  assert.deepEqual(plan.hub.configuration.poolCodeHashes, plan.pools.map(pool => pool.codeHash));
  for (const pool of plan.pools) {
    assert.equal(pool.configuration.receiptHubCodeHash, plan.hub.codeHash);
    assert.equal(pool.configuration.receiptHub, plan.hub.address);
    assert.equal(pool.configuration.registryCommitment, plan.registryCommitment);
    assert.equal(pool.codeHash, `0x${publicKeccak256(Buffer.from(pool.runtimeCode.slice(2), 'hex')).toString('hex')}`);
  }
  const changed = planFixture(); changed.pools[0].policy = digest(200);
  const another = buildNativeDeploymentPlan(changed);
  assert.equal(plan.hub.runtimeCode, another.hub.runtimeCode);
  assert.notEqual(plan.hub.constructorData, another.hub.constructorData);
  assert.notEqual(plan.pools[0].codeHash, another.pools[0].codeHash);
  assert.equal(plan.pools[1].codeHash, another.pools[1].codeHash);
  assert.equal(Object.isFrozen(plan.pools[0].configuration), true);
});

test('plan rejects network changes, duplicate quorum keys, unexpected verifier fields and circular immutables', () => {
  const input = planFixture();
  assert.throws(() => buildNativeDeploymentPlan({ ...input, chainId: '1' }), /LOCAL_CHAIN/);
  const duplicate = planFixture(); duplicate.attesterKeys[1] = duplicate.attesterKeys[0];
  assert.throws(() => buildNativeDeploymentPlan(duplicate), /DUPLICATE_KEY_X/);
  const arbitrary = planFixture(); arbitrary.verifiers.admission.trusted = true;
  assert.throws(() => buildNativeDeploymentPlan(arbitrary), /VERIFIER_FIELDS/);
  const circular = planFixture();
  circular.compilation.immutableNames[NATIVE_SOURCE_NAMES.hub][9] = 'pool1CodeHash';
  assert.throws(() => buildNativeDeploymentPlan(circular), /IMMUTABLE_VALUE_FIELDS/);
});

test('arbitrary self-pinned sources and runtime objects cannot activate compilation or deployment', async () => {
  const content = 'contract NotAProofVerifier {}';
  const forged = Object.fromEntries([...Object.keys(NATIVE_INPUT_WORDS), 'hub', 'pool'].map(mode => [mode, { content, sha256: hash(content) }]));
  assert.throws(() => validateNativeSystemSources(forged), /SOURCE_LITERAL_PIN/);
  await assert.rejects(compileNativeSystem(forged), /SOURCE_LITERAL_PIN/);
  await assert.rejects(deployNativeSystem({ accounts: [address(1)] }, { compilation: planFixture().compilation }), /OWNED_CAPABILITY_REQUIRED/);
  assert.equal(NATIVE_INPUT_WORDS.admission, 42); assert.equal(NATIVE_INPUT_WORDS.fulfill, 131);
  for (const pin of Object.values(NATIVE_SOURCE_PINS)) assert.ok(pin === null || /^[0-9a-f]{64}$/.test(pin));
});
