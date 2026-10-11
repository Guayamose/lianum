/** V6 preparation-only reuse of exactly published W39 V9 artifacts.
 * Raw files, original receipts and actual mathematical components are verified.
 * Current launchers are not represented as the producers of the retained build.
 * The V5 financial consumer and V9 original receipt remain separate. */
import assert from 'node:assert/strict';
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, GOLDEN } from '@lianum/proofs/catalog';
import { verifyToolchain, verifyCRS } from '@lianum/components/resources/wallet-resources';
import { frozenInput } from '@lianum/components/plain-input';
import { NATIVE_VALUE_DEV_RELEASE_V5 } from '../../releases/native-value/native-value-dev-release-v5.mjs';
import { W39_DEV_DIRECTORY_V5, W39_DEV_FILES_V5, W39_DEV_SOURCE_V5, W39_DEV_HISTORICAL_MISSING_V5,
  W39_DEV_KIND_V5, w39DevDigestV5, w39DevOriginalBasisV5,
  validateW39DevDescriptorV5, validateW39DevGenerationV5, validateW39DevReceiptV5,
  validateW39DevCompilationReceiptV5 } from '../../releases/native-value/native-value-dev-w39-contract-v5.mjs';
import { validateW39DevCompilerSourceCapsuleV5,
  assertW39DevOriginalCompilerInputsV5 } from '../../releases/native-value/native-value-dev-w39-build-dependencies-v5.mjs';
import { validateW39DevActualComponentsV5 } from './native-value-dev-w39-artifacts-v5.mjs';
import { validateW39DevPublishedRawFilesV5, inspectW39DevPublicAPIV5 as verifyAPI } from './native-value-dev-w39-consumer-artifacts-v5.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
function raw(name) {
  assert.ok(typeof name === 'string' && !name.startsWith('/') && !name.split('/').some(p => !p || p === '.' || p === '..'), 'W39_CONSUMER_FIXED_PATH');
  const golden = name.startsWith('golden/'), base = golden ? GOLDEN : ROOT;
  assert.equal(realpathSync(base), base, 'W39_CONSUMER_ROOT_ALIAS');
  let path = base;
  for (const part of (golden ? name.slice(7) : name).split('/')) { path = join(path, part); assert.ok(!lstatSync(path).isSymbolicLink(), 'W39_CONSUMER_SYMLINK'); }
  const stat = lstatSync(path); assert.ok(stat.isFile() && stat.size <= 128 * 1024 * 1024, 'W39_CONSUMER_REGULAR_FILE');
  const bytes = readFileSync(path); assert.equal(bytes.length, stat.size, 'W39_CONSUMER_FILE_CHANGED'); return bytes;
}
function original(name) {
  const bytes = raw(W39_DEV_SOURCE_V5[name]); assert.equal(sha(bytes), W39_DEV_SOURCE_V5[name + 'SHA256'], 'W39_CONSUMER_PUBLIC_ORIGINAL_RAW_PIN'); return bytes;
}
/** Original provenance only. Metadata never grants an artifact brand. */
export function validatePublishedW39ReuseCapsuleV6(recordedBytes, receiptDigest, publishedRawSHA256) {
  assert.equal(arguments.length, 3, 'W39_REUSE_CAPSULE_ARITY');
  assert.ok(Buffer.isBuffer(recordedBytes), 'W39_REUSE_CAPSULE_BYTES');
  const recorded = JSON.parse(recordedBytes);
  validateW39DevCompilerSourceCapsuleV5(recorded, recordedBytes, receiptDigest, publishedRawSHA256);
  return frozenInput({ schema: 'LIANUM_W39_RECORDED_SOURCE_CAPSULE_V6',
    rawSHA256: sha(recordedBytes), sourceClosureSHA256: receiptDigest,
    recordedFiles: recorded.length, currentLaunchersClaimedAsOriginal: false, artifactBundleIssued: false });
}
export function inspectPublishedW39ReuseArtifactsV6() {
  assert.equal(arguments.length, 0, 'W39_CONSUMER_INSPECTION_NO_OPTIONS');
  const basis = w39DevOriginalBasisV5(), apiBefore = verifyAPI();
  assert.deepEqual(verifyToolchain(), basis.toolchain); assert.deepEqual(verifyCRS(), basis.crs);
  // Five missing historical originals remain missing. The new build namespace
  // and its genuine recorded capsule are neither rewritten nor reclassified.
  for (const row of W39_DEV_HISTORICAL_MISSING_V5) {
    const path = row.path.startsWith('golden/') ? join(GOLDEN, row.path.slice(7)) : join(ROOT, row.path);
    try { lstatSync(path); assert.fail('W39_CONSUMER_HISTORICAL_MISSING_STATUS_CHANGED'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const compilerInputs = assertW39DevOriginalCompilerInputsV5();
  const inputs = Object.fromEntries(['noir', 'nargo', 'program', 'key', 'solidity', 'compiled'].map(name => [name, original(name)]));
  const files = Object.fromEntries(W39_DEV_FILES_V5.map(name => [name, raw(W39_DEV_DIRECTORY_V5 + '/' + name)]));
  // Existing published W39 provenance authenticates all eight raw files. The
  // obsolete financial source list in that publication is not reused here;
  // the V5 producer/lab independently captures the current whole consumer list.
  const published = validateW39DevPublishedRawFilesV5(files, NATIVE_VALUE_DEV_RELEASE_V5?.producedW39);
  const descriptor = validateW39DevDescriptorV5({ kind: W39_DEV_KIND_V5, role: 'withdraw',
    files: Object.fromEntries(W39_DEV_FILES_V5.map(name => [name, { path: W39_DEV_DIRECTORY_V5 + '/' + name, sha256: sha(files[name]) }])),
    historicalPin: basis.pin, historicalMissing: W39_DEV_HISTORICAL_MISSING_V5,
    historicalArtifactRecovered: false, proofAcceptanceEstablished: false });
  assert.deepEqual(descriptor, published, 'W39_CONSUMER_PUBLISHED_DESCRIPTOR_JOIN');
  const generation = validateW39DevGenerationV5(JSON.parse(files['generation.json']));
  const receipt = validateW39DevReceiptV5(JSON.parse(files['receipt.json']), descriptor);
  // Authenticate the complete original source capsule as historical evidence.
  // Reuse is decided by exact published outputs and original component inputs,
  // not by pretending the current JS/Python launchers compiled retained V9.
  validatePublishedW39ReuseCapsuleV6(files['source-pins.json'], receipt.sourceClosureSHA256, published.files['source-pins.json'].sha256);
  const compilation = validateW39DevCompilationReceiptV5(JSON.parse(files['compilation.json']));
  const compiled = JSON.parse(files['compiled.json']); assert.equal(compilation.compiledSHA256, sha(files['compiled.json']));
  assert.equal(compilation.settingsSHA256, w39DevDigestV5(compiled.settings));
  assert.equal(compilation.sourceASTSHA256, w39DevDigestV5(compiled.sourceASTs)); assert.equal(compilation.artifactsSHA256, w39DevDigestV5(compiled.contracts));
  assert.ok(files['key.vk'].equals(inputs.key)); assert.ok(files['withdraw_output.sol'].equals(inputs.solidity));
  const verifier = validateW39DevActualComponentsV5({ programBytes: files['program.json'], keyBytes: files['key.vk'], sourceBytes: files['withdraw_output.sol'], compiled,
    originalProgramBytes: inputs.program, originalCompiled: JSON.parse(inputs.compiled), generation });
  for (const name of Object.keys(inputs)) assert.ok(original(name).equals(inputs[name]), 'W39_CONSUMER_ORIGINAL_CHANGED');
  for (const name of W39_DEV_FILES_V5) assert.ok(raw(W39_DEV_DIRECTORY_V5 + '/' + name).equals(files[name]), 'W39_CONSUMER_NEW_RAW_CHANGED');
  assert.deepEqual(assertW39DevOriginalCompilerInputsV5(), compilerInputs, 'W39_CONSUMER_COMPILER_INPUTS_CHANGED');
  validatePublishedW39ReuseCapsuleV6(files['source-pins.json'], receipt.sourceClosureSHA256, published.files['source-pins.json'].sha256);
  assert.deepEqual(verifyAPI(), apiBefore); assert.deepEqual(verifyToolchain(), basis.toolchain); assert.deepEqual(verifyCRS(), basis.crs);
  return frozenInput({ descriptor, verifier, receipt, artifactBundleIssued: false,
    reuseReceipt: { schema: 'LIANUM_W39_EXACT_PUBLISHED_REUSE_V6', artifactGeneration: 'V9',
      originalReceiptSHA256: sha(files['receipt.json']), publishedFiles: published.files,
      recordedSourcePinsSHA256: sha(files['source-pins.json']), recordedSourceClosureSHA256: receipt.sourceClosureSHA256,
      originalCompilerInputs: compilerInputs, compiledNow: false, sourceCapsuleRewritten: false,
      historicalArtifactRecovered: false, proofAcceptanceEstablished: false, artifactBundleIssued: false } });
}
