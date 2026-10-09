/** HOST METADATA ONLY. Synthetic row/receipt bytes below never authenticate a
 * build or issue artifact/account authority. No compiler, backend or chain runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateW39DevCompilerSourceCapsuleV5, nativeValueDevW39CompilerSourcePinsV5,
  assertW39DevOriginalCompilerInputsV5 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-w39-build-dependencies-v5.mjs';
import { validateW39DevPublishedRawFilesV5, inspectProducedW39ConsumerArtifactsV5 }
  from '../../../../packages/backend/src/operations/deployments/native-value/native-value-dev-w39-consumer-artifacts-v5.mjs';
import { validateW39DevActualComponentsV5 } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-dev-w39-artifacts-v5.mjs';
import { W39_DEV_DIRECTORY_V5, W39_DEV_FILES_V5, W39_DEV_KIND_V5, W39_DEV_SOURCE_V5,
  W39_DEV_HISTORICAL_MISSING_V5, W39_DEV_SETTINGS_V5, w39DevOriginalBasisV5, w39DevDigestV5 }
  from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-w39-contract-v5.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const compiler = [{ path: 'scripts/prepare-development-native-value-w39-v5.mjs', sha256: '01'.repeat(32) },
    { path: 'proof-workers/solidity-compiler.mjs', sha256: '02'.repeat(32) }];
  const consumers = [{ path: 'integration/paired-native-note-flow-v2.mjs', sha256: '03'.repeat(32) }];
  const recorded = [...compiler, ...consumers], bytes = Buffer.from(JSON.stringify(recorded, null, 2) + '\n');
  return { compiler, consumers, recorded, bytes, digest: w39DevDigestV5(recorded), rawSHA256: sha(bytes) };
}
function join(f, current = f.compiler) { return validateW39DevCompilerSourceCapsuleV5(current, f.bytes, f.digest, f.rawSHA256); }
test('compiler slice stays joined to original raw capsule while an unrelated financial consumer changes', () => {
  const f = fixture(); assert.equal(join(f), true);
  const consumerNow = [{ ...f.consumers[0], sha256: '04'.repeat(32) }];
  assert.notEqual(w39DevDigestV5([...f.compiler, ...consumerNow]), f.digest);
  assert.equal(join(f), true); // Consumer closure is checked by V5 separately.
});
test('changed compiler dependency or uncaptured new dependency rejects before component consumption', () => {
  const f = fixture(), changed = structuredClone(f.compiler); changed[1].sha256 = '04'.repeat(32);
  assert.throws(() => join(f, changed), /ACTUAL_COMPILER_SOURCE_CHANGED/);
  assert.throws(() => join(f, [...f.compiler, { path: 'caller/new-compiler.mjs', sha256: '04'.repeat(32) }]), /NOT_IN_ORIGINAL_BUILD/);
});
test('recorded capsule requires both published raw bytes and the original canonical receipt digest', () => {
  const f = fixture();
  assert.throws(() => validateW39DevCompilerSourceCapsuleV5(f.compiler, Buffer.concat([f.bytes, Buffer.from(' ')]), f.digest, f.rawSHA256), /RECORDED_RAW_SHA/);
  assert.throws(() => validateW39DevCompilerSourceCapsuleV5(f.compiler, f.bytes, 'ff'.repeat(32), f.rawSHA256), /RECORDED_RECEIPT_JOIN/);
  const changed = structuredClone(f.recorded); changed[0].sha256 = 'ff'.repeat(32);
  const bytes = Buffer.from(JSON.stringify(changed));
  assert.throws(() => validateW39DevCompilerSourceCapsuleV5(f.compiler, bytes, w39DevDigestV5(changed), f.rawSHA256), /RECORDED_RAW_SHA/);
});
test('fixed factories and metadata reject caller options, aliases, traversal and duplicate rows', () => {
  const f = fixture();
  for (const fn of [nativeValueDevW39CompilerSourcePinsV5, assertW39DevOriginalCompilerInputsV5, inspectProducedW39ConsumerArtifactsV5])
    assert.throws(() => fn({ path: '/caller' }), /NO_OPTIONS/);
  assert.throws(() => validateW39DevCompilerSourceCapsuleV5(f.compiler, f.bytes, f.digest, f.rawSHA256, {}), /ARITY/);
  for (const path of ['/caller/compiler.mjs', './scripts/compiler.mjs', 'scripts/../compiler.mjs', 'scripts//compiler.mjs'])
    assert.throws(() => join(f, [{ path, sha256: f.compiler[0].sha256 }]), /FIXED_LABEL/);
  assert.throws(() => join(f, [...f.compiler, f.compiler[0]]), /DUPLICATE_LABEL/);
  const accessor = { ...f.compiler[0] }; let called = 0;
  Object.defineProperty(accessor, 'sha256', { enumerable: true, get() { called++; return 'ff'.repeat(32); } });
  assert.throws(() => join(f, [accessor])); assert.equal(called, 0);
});
test('all eight genuine-build raw files must retain their already published descriptor hashes', () => {
  const files = Object.fromEntries(W39_DEV_FILES_V5.map(name => [name, Buffer.from('synthetic-' + name)]));
  const published = { kind: W39_DEV_KIND_V5, role: 'withdraw',
    files: Object.fromEntries(W39_DEV_FILES_V5.map(name => [name, { path: W39_DEV_DIRECTORY_V5 + '/' + name, sha256: sha(files[name]) }])),
    historicalPin: w39DevOriginalBasisV5().pin, historicalMissing: W39_DEV_HISTORICAL_MISSING_V5,
    historicalArtifactRecovered: false, proofAcceptanceEstablished: false };
  assert.deepEqual(validateW39DevPublishedRawFilesV5(files, published), published);
  for (const name of W39_DEV_FILES_V5) assert.throws(() => validateW39DevPublishedRawFilesV5({ ...files, [name]: Buffer.concat([files[name], Buffer.from('tamper')]) }, published), /PUBLISHED_RAW_CHANGED/);
  assert.throws(() => validateW39DevPublishedRawFilesV5({ ...files, extra: Buffer.from('extra') }, published), /EXACT_RAW_FILES/);
  assert.throws(() => validateW39DevPublishedRawFilesV5(files, published, {}), /ARITY/);
});
test('consumer keeps the original semantic validator and rejects substituted original component bytes', () => {
  // A deliberately corrupt component is stopped by the unchanged original
  // validator. This is a negative host check, not a fabricated valid build.
  const basis = w39DevOriginalBasisV5();
  const generation = { schema: 'LIANUM_NEW_PC15_W39_GENERATION_V9', kind: W39_DEV_KIND_V5, phase: 'completed', role: 'withdraw',
    programSHA256: '01'.repeat(32), originalProgramSHA256: W39_DEV_SOURCE_V5.programSHA256, sourceSHA256: W39_DEV_SOURCE_V5.noirSHA256,
    nargoSHA256: W39_DEV_SOURCE_V5.nargoSHA256, abiSHA256: W39_DEV_SOURCE_V5.abiSHA256, compressedACIRSHA256: W39_DEV_SOURCE_V5.compressedACIRSHA256,
    keySHA256: W39_DEV_SOURCE_V5.keySHA256, keyBytes: 1888, keyHashField: '1', soliditySHA256: W39_DEV_SOURCE_V5.soliditySHA256,
    solidityBytes: 103923, backendPublicWords: 47, publicOffset: 5, publicWords: 39, stats: { numGates: 1, numGatesDyadic: 262144, numAcirOpcodes: 1 },
    settings: W39_DEV_SETTINGS_V5, toolchain: basis.toolchain, crs: basis.crs, maximumPages: 32768, threads: 1,
    keyRecomputedNow: true, sameComputedKeyPassedToGenerator: true, proofGenerated: false };
  assert.throws(() => validateW39DevActualComponentsV5({ programBytes: Buffer.from('{}'), keyBytes: Buffer.alloc(1888), sourceBytes: Buffer.from('wrong'),
    originalProgramBytes: Buffer.from('substituted original'), originalCompiled: {}, compiled: {}, generation }), /ORIGINAL_PROGRAM/);
});
