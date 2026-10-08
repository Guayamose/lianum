/** HOST METADATA ONLY. Rows in the positive fixture deliberately contain dummy
 * raw hashes; no original files, toolchain, prover, runtime or bundle is loaded.
 * Pure validation cannot publish a release or create any private capability. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-mobile-package-pins-v5.mjs';
import { NATIVE_VALUE_DEV_SCHEMA_V5, NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
  NATIVE_VALUE_DEV_RETAINED_SHA256_V5, NATIVE_VALUE_DEV_W39_ADAPTER_SHA256_V5,
  NATIVE_VALUE_DEV_REQUIRED_HOST_ROOTS_V5, NATIVE_VALUE_DEV_LEDGER_KIND_V5,
  NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5, NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5, nativeValueDevRetainedMetadataV5, nativeValueDevDigestV5,
  validateNativeValueDevReleaseV5, validateNativeValueDevPinnedBytesV5 }
  from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-release-contract-v5.mjs';
import { NATIVE_VALUE_WALLET_HOST_SOURCE_PINS_V4 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-wallet-host-source-pins-v4.mjs';
import { NATIVE_VALUE_RELEASE } from '../../../../packages/backend/src/operations/releases/native-value/native-value-wallet-release-v4.mjs';
import * as artifactModule from '../../../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { loadNativeValueDevDeploymentArtifactsV5, inspectRetainedNativeValueArtifactsForDevV5,
  assertNativeValueArtifactBundle } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { deployNativeValueDevSystemV5 } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs';
import { inspectNativeValueDevReleaseV5Candidate } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-producer-v5.mjs';
import { NATIVE_WALLET_REAL_RELEASE_V1, NATIVE_WALLET_UNFUNDED_RELEASE_V1 } from './native-wallet-real-release-v4.mjs';
import { NATIVE_NOTE_WALLET_ACCEPTANCE_RELEASE } from './native-note-wallet-acceptance-v1.mjs';
import { W39_DEV_DIRECTORY_V5, W39_DEV_FILES_V5, W39_DEV_KIND_V5, W39_DEV_HISTORICAL_MISSING_V5, w39DevOriginalBasisV5 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-w39-contract-v5.mjs';
function metadataFixture() {
  const paths = [...new Set([...NATIVE_VALUE_WALLET_HOST_SOURCE_PINS_V4.map(row => row.path),
    ...NATIVE_VALUE_DEV_REQUIRED_HOST_ROOTS_V5])].sort();
  const sourceFiles = paths.map(path => ({ path, sha256: '01'.repeat(32) }));
  const retained = structuredClone(nativeValueDevRetainedMetadataV5());
  return { schema: NATIVE_VALUE_DEV_SCHEMA_V5, historicalReleaseSHA256: NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
    compilationSourceClosureSHA256: retained.sourceClosureSHA256, retainedMetadataSHA256: NATIVE_VALUE_DEV_RETAINED_SHA256_V5,
    w39AdapterManifestSHA256: NATIVE_VALUE_DEV_W39_ADAPTER_SHA256_V5,
    publicMobilePackagesSHA256: NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5,
    hostSourceClosureSHA256: nativeValueDevDigestV5(sourceFiles), sourceFiles, retained,
    producedW39:{kind:W39_DEV_KIND_V5,role:'withdraw',files:Object.fromEntries(W39_DEV_FILES_V5.map(name=>[name,{path:W39_DEV_DIRECTORY_V5+'/'+name,sha256:'08'.repeat(32)}])),historicalPin:w39DevOriginalBasisV5().pin,historicalMissing:W39_DEV_HISTORICAL_MISSING_V5,historicalArtifactRecovered:false,proofAcceptanceEstablished:false},
    producedLedger:{kind:NATIVE_VALUE_DEV_LEDGER_KIND_V5,
      compiled:{path:NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5,sha256:'06'.repeat(32)},
      receipt:{path:NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5,sha256:'07'.repeat(32)},historicalCompiled:retained.ledger.compiled,
      historicalArtifactRecovered:false,settingsSHA256:retained.ledger.settingsSHA256,
      componentPinsSHA256:nativeValueDevDigestV5({sources:retained.ledger.sources,artifacts:retained.ledger.artifacts})},
    scope: { localOnly: true, claimsEnabled: false, proofAcceptanceEstablished: false,
      mobileNoteCustodyEstablished: false, nativeGraphAcceptanceEstablished: false } };
}
test('pure metadata fixture validates only historical identity and current host descriptor shape', () => {
  const original = metadataFixture(), checked = validateNativeValueDevReleaseV5(original);
  assert.deepEqual(checked, original); assert.ok(Object.isFrozen(checked.retained.verifiers));
  assert.throws(() => assertNativeValueArtifactBundle(checked), /FIXED_ARTIFACT_BUNDLE_REQUIRED/);
  assert.throws(() => assertNativeValueArtifactBundle(structuredClone(checked)), /FIXED_ARTIFACT_BUNDLE_REQUIRED/);
});
for (const [name, change] of [
  ['omitted actual Python launcher', row => { row.sourceFiles = row.sourceFiles.filter(p => p.path !== 'development-tooling/paired_original_account_lab.py'); row.hostSourceClosureSHA256 = nativeValueDevDigestV5(row.sourceFiles); }],
  ['unreviewed workspace module', row => { row.sourceFiles.push({path:'workspace-module/packages/backend/caller.mjs',sha256:'01'.repeat(32)}); row.sourceFiles.sort((a,b)=>a.path.localeCompare(b.path)); row.hostSourceClosureSHA256=nativeValueDevDigestV5(row.sourceFiles); }],
  ['physical workspace alias', row => { row.sourceFiles.push({path:'development-root/packages/proofs/src/catalog.mjs',sha256:'01'.repeat(32)}); row.sourceFiles.sort((a,b)=>a.path.localeCompare(b.path)); row.hostSourceClosureSHA256=nativeValueDevDigestV5(row.sourceFiles); }],
  ['unreviewed Python helper', row => { row.sourceFiles.push({path:'development-tooling/caller_helper.py',sha256:'01'.repeat(32)}); row.sourceFiles.sort((a,b)=>a.path.localeCompare(b.path)); row.hostSourceClosureSHA256=nativeValueDevDigestV5(row.sourceFiles); }],
  ['produced ledger caller path', row=>row.producedLedger.compiled.path='caller/compiled.json'],
  ['produced ledger fake historical recovery', row=>row.producedLedger.historicalArtifactRecovered=true],
  ['produced ledger changed original missing pin', row=>row.producedLedger.historicalCompiled.sha256='09'.repeat(32)],
  ['produced ledger different component identities', row=>row.producedLedger.componentPinsSHA256='09'.repeat(32)],
  ['produced ledger altered settings', row=>row.producedLedger.settingsSHA256='09'.repeat(32)],
  ['schema', row => row.schema = 'LIANUM_NATIVE_VALUE_GRAPH_ONLY_RELEASE_V2'],
  ['mobile package pins', row => row.publicMobilePackagesSHA256='05'.repeat(32)],
  ['alias path', row => row.sourceFiles[0].path='flat/flat-wallet/copy.mjs'],
  ['historical release', row => row.historicalReleaseSHA256 = '02'.repeat(32)],
  ['compilation closure', row => row.compilationSourceClosureSHA256 = row.hostSourceClosureSHA256],
  ['current source hash', row => row.sourceFiles[0].sha256 = '03'.repeat(32)],
  ['current source closure', row => row.hostSourceClosureSHA256 = '04'.repeat(32)],
  ['omitted original source', row => { row.sourceFiles.shift(); row.hostSourceClosureSHA256 = nativeValueDevDigestV5(row.sourceFiles); }],
  ['omitted paired actor', row => { row.sourceFiles = row.sourceFiles.filter(p => !p.path.endsWith('/paired-original-account-actor-v2.mjs')); row.hostSourceClosureSHA256 = nativeValueDevDigestV5(row.sourceFiles); }],
  ['duplicate source', row => row.sourceFiles.push(row.sourceFiles[0])],
  ['path traversal', row => row.sourceFiles[0].path = '../outside.mjs'],
  ['self pin', row => { row.sourceFiles.push({path:'wallet-platform/modules/ops/native-value-dev-release-v5.mjs',sha256:'01'.repeat(32)}); row.sourceFiles.sort((a,b)=>a.path.localeCompare(b.path)); row.hostSourceClosureSHA256=nativeValueDevDigestV5(row.sourceFiles); }],
  ['artifact bytecode pin', row => row.retained.ledger.artifacts.hub = '05'.repeat(32)],
  ['compiled artifact raw pin', row => row.retained.ledger.compiled.sha256 = '05'.repeat(32)],
  ['program raw pin', row => row.retained.verifiers.deposit_balance.program.sha256 = '05'.repeat(32)],
  ['ABI lineage pin', row => row.retained.verifiers.deposit_balance.lineage.abiSHA256 = '05'.repeat(32)],
  ['binary VK pin', row => row.retained.verifiers.deposit_balance.key.sha256 = '05'.repeat(32)],
  ['W39 original key', row => row.retained.verifiers.withdraw.key.sha256 = '05'.repeat(32)],
  ['W39 public width', row => row.retained.verifiers.withdraw.lineage.publicWords = 38],
  ['W39 reader manifest', row => row.w39AdapterManifestSHA256 = '05'.repeat(32)],
  ['toolchain', row => row.retained.toolchain.node = 'v99.0.0'],
  ['CRS', row => row.retained.crs.points += 1],
  ['self supplied recomputed lineage', row => { row.retained.verifiers.withdraw.key.sha256='05'.repeat(32); row.retainedMetadataSHA256=nativeValueDevDigestV5(row.retained); }],
  ['economic authority flag', row => row.scope.claimsEnabled = true],
  ['mobile custody flag', row => row.scope.mobileNoteCustodyEstablished = true],
  ['callback field', row => row.loader = () => {}],
]) test('host fixture rejects changed ' + name, () => {
  const row = metadataFixture(); change(row); assert.throws(() => validateNativeValueDevReleaseV5(row));
});
test('fixed raw source join rejects byte mutation without caller filesystem reads', () => {
  const bytes = Buffer.from('HOST_SOURCE_ONLY'), pin = {path:'wallet-platform/modules/mobile/paired-original-account-actor-v2.mjs',
    sha256:createHash('sha256').update(bytes).digest('hex')};
  assert.equal(validateNativeValueDevPinnedBytesV5(pin, bytes), true);
  assert.throws(() => validateNativeValueDevPinnedBytesV5(pin, Buffer.from('HOST_SOURCE_CHANGED')), /RAW_PIN/);
  assert.throws(() => validateNativeValueDevPinnedBytesV5({...pin, sha256:'00'.repeat(32)}, bytes), /RAW_PIN/);
});
test('explicit null publication fixture rejects in the genuine loader/deploy before touching runtime; no caller overrides', async t => {
  // Fixed test-only module mocks keep the default-rejection contract valid after
  // a legitimate source publication. This never edits or activates a release.
  const artifactURL = new URL('../wallet-platform/modules/ops/native-value-deployment-artifacts-v2.mjs', import.meta.url);
  t.mock.module(new URL('../wallet-platform/modules/ops/native-value-dev-release-v5.mjs', import.meta.url).href,
    { namedExports: { NATIVE_VALUE_DEV_RELEASE_V5: null } });
  const nullArtifacts = await import(artifactURL.href + '?host-unpublished-v5');
  t.mock.module(artifactURL.href, { namedExports: { ...artifactModule,
    loadNativeValueDevDeploymentArtifactsV5: nullArtifacts.loadNativeValueDevDeploymentArtifactsV5 } });
  const nullSystem = await import(new URL('../wallet-platform/modules/ops/native-value-system-v2.mjs', import.meta.url).href + '?host-unpublished-v5');
  let touched=0;
  const runtime = new Proxy({}, {get() {touched++; throw new Error('UNEXPECTED_RUNTIME_TOUCH');}});
  await assert.rejects(nullArtifacts.loadNativeValueDevDeploymentArtifactsV5(), /RELEASE_UNPUBLISHED/);
  await assert.rejects(nullSystem.deployNativeValueDevSystemV5({runtime,options:{}}), /RELEASE_UNPUBLISHED/);
  for (const input of [metadataFixture(), {loader:()=>{}}, {manifest:'caller.json'}, {sourceFiles:[]}])
    await assert.rejects(loadNativeValueDevDeploymentArtifactsV5(input), /NO_CALLER_OVERRIDE/);
  await assert.rejects(deployNativeValueDevSystemV5({runtime,options:{},bundle:{}}));
  await assert.rejects(deployNativeValueDevSystemV5({runtime,options:{}}, metadataFixture()), /NO_CALLER_OVERRIDE/);
  assert.equal(touched,0);
});
test('producer and artifact inspection are fixed no-argument APIs and no copied data establishes a brand', async () => {
  await assert.rejects(inspectNativeValueDevReleaseV5Candidate({path:'/tmp/caller'}), /NO_OPTIONS/);
  await assert.rejects(inspectRetainedNativeValueArtifactsForDevV5({manifest:metadataFixture()}), /NO_OPTIONS/);
  assert.throws(() => assertNativeValueArtifactBundle({artifactBundleIssued:true,retained:metadataFixture().retained}), /FIXED_ARTIFACT_BUNDLE_REQUIRED/);
});
test('historical record digest and three historical wallet gates remain unchanged', () => {
  assert.equal(nativeValueDevDigestV5(NATIVE_VALUE_RELEASE), NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5);
  assert.equal(NATIVE_WALLET_REAL_RELEASE_V1,null); assert.equal(NATIVE_WALLET_UNFUNDED_RELEASE_V1,null);
  assert.equal(NATIVE_NOTE_WALLET_ACCEPTANCE_RELEASE,null);
});
