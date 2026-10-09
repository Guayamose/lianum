/** Pure metadata validation. Accepting data here never issues an artifact,
 * deployment, wallet, owner or account capability. Actual files and brands are
 * checked exclusively by the fixed loader in the genuine artifact module. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GENERIC_COMPILER_PIN } from '../../../../../engine/src/execution/local/local-deployment.mjs';
import { exactRecord, fixedArray } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { NATIVE_VALUE_RELEASE, NATIVE_VALUE_SOURCE_CLOSURE } from './native-value-wallet-release-v4.mjs';
import { NATIVE_VALUE_WALLET_HOST_SOURCE_PINS_V4 } from './native-value-wallet-host-source-pins-v4.mjs';
import { NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5, NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5 } from './native-value-dev-mobile-package-pins-v5.mjs';
import { validateW39DevDescriptorV5 } from './native-value-dev-w39-contract-v5.mjs';
export const NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5 = '.local/development-native-value-ledger/v5/compiled.json';
export const NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5 = '.local/development-native-value-ledger/v5/receipt.json';
export const NATIVE_VALUE_DEV_LEDGER_KIND_V5 = 'NEW_SOLIDITY_LEDGER_WITH_EXACT_ORIGINAL_COMPONENT_IDENTITIES';
export const NATIVE_VALUE_DEV_SCHEMA_V5 = 'LIANUM_NATIVE_VALUE_RETAINED_ARTIFACT_DEV_RELEASE_V5';
export const NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5 = 'c1f9b420205bd8c67c77d5802c25be80461f1f58ecefcdec4278373a4fb3fad1';
export const NATIVE_VALUE_DEV_RETAINED_SHA256_V5 = '1395e94fa1e3c7d0ff6ca3d57f3ab04474a33373870a286a8c75c9f53752b690';
export const NATIVE_VALUE_DEV_W39_ADAPTER_SHA256_V5 = '8b3d3adddb9e7d0064a40744cb3b0e0e37bf2028728c3e07b5489b58acd05376';
export const NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5 = Object.freeze([
  'development-root/dev',
  'development-tooling/dev',
  'development-tooling/native_value_ledger.py',
  'development-tooling/native_value_w39.py',
  'development-tooling/native_artifact_tasks.py',
  'development-tooling/ledger_owned_processes.py',
  'development-tooling/paired_original_account_lab.py',
  'development-tooling/osaka_lab.py',
  'development-tooling/workspace.py',
  'development-tooling/import_paths.py',
  'development-config/layout.json',
]);
export const NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5 = Object.freeze([
  'workspace-module/apps/platform/src/run-original-native-source-v1.mjs',
  'workspace-module/experiments/wallet/native-ingress-v3/fixtures/synthetic-ingress-v3.mjs',
  'workspace-module/packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs',
  'workspace-module/packages/backend/src/claims/protocol/framing.mjs',
  'workspace-module/packages/backend/src/claims/protocol/inputs.mjs',
  'workspace-module/packages/backend/src/execution/account/preparation/readiness-inputs.mjs',
  'workspace-module/packages/backend/src/execution/encoding/commitments.mjs',
  'workspace-module/packages/backend/src/execution/encoding/statements.mjs',
  'workspace-module/packages/engine/src/chains/shared/runtime-harness.mjs',
  'workspace-module/packages/engine/src/chains/solana/solana-runtime.mjs',
  'workspace-module/packages/engine/src/evidence/native-evidence.mjs',
  'workspace-module/packages/engine/src/evidence/native-quorum.mjs',
  'workspace-module/packages/engine/src/execution/graph/funded-graph.mjs',
  'workspace-module/packages/engine/src/execution/graph/graph.mjs',
  'workspace-module/packages/engine/src/execution/native/dispatch/native-admission.mjs',
  'workspace-module/packages/engine/src/execution/native/dispatch/native-capsules.mjs',
  'workspace-module/packages/engine/src/execution/native/state/native-receipt.mjs',
  'workspace-module/packages/engine/src/execution/native/state/native-state.mjs',
  'workspace-module/packages/engine/src/native/native-bitcoin.mjs',
  'workspace-module/packages/engine/src/notes/private-native-certificate.mjs',
  'workspace-module/packages/engine/src/notes/private-note-encoding.mjs',
  'workspace-module/packages/engine/src/notes/private-note-tree.mjs',
  'workspace-module/packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs',
  'workspace-module/packages/proofs/src/catalog.mjs',
  'workspace-module/packages/proofs/src/jobs/trusted-jobs.mjs',
]);
export const NATIVE_VALUE_DEV_REQUIRED_HOST_ROOTS_V5 = Object.freeze([
  ...NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5,
  ...NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5,
  'proof-workers/native-claims-parent-death.py',
  'integration/run-paired-native-note-v2.mjs',
  'integration/paired-native-note-flow-v2.mjs',
  'integration/paired-native-note-policy-v2.mjs',
  'integration/paired-native-note-source-pins-v2.mjs',
  'integration/native-flow-supervisor.mjs',
  'wallet-platform/modules/ops/native-value-dev-release-contract-v5.mjs',
  'wallet-platform/modules/ops/native-value-dev-source-pins-v5.mjs',
  'wallet-platform/modules/ops/native-value-dev-producer-v5.mjs',
  'scripts/prepare-development-native-value-ledger-v5.mjs',
  'scripts/prepare-development-native-value-w39-v5.mjs',
  'wallet-platform/modules/ops/native-value-dev-w39-contract-v5.mjs',
  'wallet-platform/modules/ops/native-value-dev-w39-artifacts-v5.mjs',
  'wallet-platform/modules/ops/native-value-dev-mobile-package-pins-v5.mjs',
  'mobile-app/package.json', 'mobile-app/package-lock.json',
  'mobile-app/src/api/original-account-api-v2.mjs',
  'mobile-app/src/custody/original-account-lease-v2.mjs',
  'mobile-app/src/custody/signing.mjs',
  'mobile-protocol-workspace/package.json',
  ...NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5.rawFiles.map(row => row.path),
  'wallet-platform/modules/ops/native-value-wallet-release-v4.mjs',
  'wallet-platform/modules/ops/native-value-wallet-host-source-pins-v4.mjs',
  'wallet-platform/modules/ops/native-value-deployment-artifacts-v2.mjs',
  'wallet-platform/modules/ops/native-value-system-v2.mjs',
  'wallet-platform/modules/mobile/paired-original-account-actor-v2.mjs',
  'wallet-platform/modules/mobile/paired-original-account-http-v2.mjs',
  'mobile-core/native-value-owner-process-v2.mjs',
  'proof-workers/native-value-live-v2-role-process.mjs',
  'proof-workers/native-value-live-v2-worker.mjs',
  'mobile-protocol/src/original-account-review-v2.mjs',
]);
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
export const nativeValueDevDigestV5 = value => createHash('sha256').update(canonical(value)).digest('hex');
const hash = value => assert.match(value, /^[0-9a-f]{64}$/, 'NATIVE_VALUE_DEV_HASH');
export function nativeValueDevRetainedMetadataV5() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_METADATA_NO_OPTIONS');
  const original = cloneInput(NATIVE_VALUE_RELEASE);
  assert.equal(nativeValueDevDigestV5(original), NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
    'NATIVE_VALUE_DEV_HISTORICAL_RELEASE_CHANGED');
  const retained = Object.fromEntries(['schema', 'sourceClosureSHA256', 'toolchain', 'crs', 'ledger', 'verifiers']
    .map(key => [key, original[key]]));
  assert.equal(nativeValueDevDigestV5(retained), NATIVE_VALUE_DEV_RETAINED_SHA256_V5,
    'NATIVE_VALUE_DEV_ORIGINAL_LINEAGE_CHANGED');
  return frozenInput(retained);
}
export function validateNativeValueDevReleaseV5(input) {
  assert.equal(arguments.length, 1, 'NATIVE_VALUE_DEV_VALIDATOR_NO_OPTIONS');
  const record = cloneInput(input);
  exactRecord(record, ['schema', 'historicalReleaseSHA256', 'compilationSourceClosureSHA256',
    'retainedMetadataSHA256', 'w39AdapterManifestSHA256', 'publicMobilePackagesSHA256', 'hostSourceClosureSHA256', 'sourceFiles',
    'retained', 'producedLedger', 'producedW39', 'scope']);
  assert.equal(record.schema, NATIVE_VALUE_DEV_SCHEMA_V5, 'NATIVE_VALUE_DEV_SCHEMA');
  assert.equal(record.historicalReleaseSHA256, NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
    'NATIVE_VALUE_DEV_HISTORICAL_RELEASE');
  assert.equal(record.compilationSourceClosureSHA256, NATIVE_VALUE_SOURCE_CLOSURE,
    'NATIVE_VALUE_DEV_COMPILATION_IS_HISTORICAL');
  assert.equal(record.retainedMetadataSHA256, NATIVE_VALUE_DEV_RETAINED_SHA256_V5,
    'NATIVE_VALUE_DEV_RETAINED_METADATA');
  assert.equal(record.w39AdapterManifestSHA256, NATIVE_VALUE_DEV_W39_ADAPTER_SHA256_V5,
    'NATIVE_VALUE_DEV_W39_ADAPTER');
  assert.equal(record.publicMobilePackagesSHA256, NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5, 'NATIVE_VALUE_DEV_PUBLIC_MOBILE_PACKAGES');
  assert.equal(nativeValueDevDigestV5(NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5), NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5, 'NATIVE_VALUE_DEV_PUBLIC_MOBILE_PACKAGE_TABLE_CHANGED');
  assert.deepEqual(record.retained, nativeValueDevRetainedMetadataV5(), 'NATIVE_VALUE_DEV_EXACT_ORIGINAL_LINEAGE');
  assert.equal(nativeValueDevDigestV5(record.retained), record.retainedMetadataSHA256);
  validateNativeValueDevProducedLedgerDescriptorV5(record.producedLedger);
  validateW39DevDescriptorV5(record.producedW39);
  exactRecord(record.scope, ['localOnly', 'claimsEnabled', 'proofAcceptanceEstablished',
    'mobileNoteCustodyEstablished', 'nativeGraphAcceptanceEstablished']);
  assert.deepEqual(record.scope, { localOnly: true, claimsEnabled: false, proofAcceptanceEstablished: false,
    mobileNoteCustodyEstablished: false, nativeGraphAcceptanceEstablished: false }, 'NATIVE_VALUE_DEV_SCOPE');
  assert.ok(Array.isArray(record.sourceFiles) && record.sourceFiles.length <= 2048, 'NATIVE_VALUE_DEV_SOURCE_COUNT');
  fixedArray(record.sourceFiles, record.sourceFiles.length);
  const seen = new Set();
  for (const row of record.sourceFiles) {
    exactRecord(row, ['path', 'sha256']);
    assert.equal(typeof row.path, 'string');
    assert.ok(row.path.length <= 512 && row.path.length > 0 && !row.path.startsWith('/')
      && !row.path.split('/').some(part => !part || part === '.' || part === '..'), 'NATIVE_VALUE_DEV_SOURCE_PATH');
    assert.ok(!row.path.startsWith('flat/flat-wallet/') && !row.path.startsWith('flat/candidate-poseidon/'), 'NATIVE_VALUE_DEV_SOURCE_ALIAS');
    if (row.path.startsWith('development-')) assert.ok(NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5.includes(row.path),
      'NATIVE_VALUE_DEV_FIXED_DEVELOPMENT_SOURCE_ONLY');
    if (row.path.startsWith('workspace-module/')) assert.ok(NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5.includes(row.path),
      'NATIVE_VALUE_DEV_FIXED_WORKSPACE_MODULE_ONLY');
    assert.notEqual(row.path, 'wallet-platform/modules/ops/native-value-dev-release-v5.mjs',
      'NATIVE_VALUE_DEV_NO_SELF_PIN');
    hash(row.sha256); assert.ok(!seen.has(row.path), 'NATIVE_VALUE_DEV_DUPLICATE_SOURCE'); seen.add(row.path);
  }
  assert.deepEqual(record.sourceFiles.map(row => row.path), [...seen].sort(), 'NATIVE_VALUE_DEV_SOURCE_ORDER');
  for (const path of [...NATIVE_VALUE_WALLET_HOST_SOURCE_PINS_V4.map(row => row.path),
    ...NATIVE_VALUE_DEV_REQUIRED_HOST_ROOTS_V5]) assert.ok(seen.has(path), 'NATIVE_VALUE_DEV_COMPLETE_FIXED_HOST_ROOTS');
  hash(record.hostSourceClosureSHA256);
  assert.equal(nativeValueDevDigestV5(record.sourceFiles), record.hostSourceClosureSHA256,
    'NATIVE_VALUE_DEV_HOST_SOURCE_CLOSURE');
  assert.notEqual(record.hostSourceClosureSHA256, record.compilationSourceClosureSHA256,
    'NATIVE_VALUE_DEV_HOST_NOT_NOIR_LINEAGE');
  return frozenInput(record);
}

/** Pure raw-byte join used for the fixed development source rows. It reads no
 * paths and issues no authority. Only the loader supplies filesystem bytes. */
export function validateNativeValueDevPinnedBytesV5(entry, bytes) {
  assert.equal(arguments.length, 2, 'NATIVE_VALUE_DEV_RAW_NO_OPTIONS');
  const pin = cloneInput(entry); exactRecord(pin, ['path', 'sha256']); hash(pin.sha256);
  assert.ok(Buffer.isBuffer(bytes), 'NATIVE_VALUE_DEV_RAW_BYTES');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256, 'NATIVE_VALUE_DEV_RAW_PIN');
  return true;
}

/** New raw-file receipt pointer; original metadata and its absent historical
 * compiled hash remain unchanged. Pure shape validation creates no capability. */
export function validateNativeValueDevProducedLedgerDescriptorV5(input) {
  assert.equal(arguments.length,1,'NATIVE_VALUE_DEV_LEDGER_DESCRIPTOR_NO_OPTIONS');
  const value=cloneInput(input);exactRecord(value,['kind','compiled','receipt','historicalCompiled',
    'historicalArtifactRecovered','settingsSHA256','componentPinsSHA256']);
  assert.equal(value.kind,NATIVE_VALUE_DEV_LEDGER_KIND_V5,'NATIVE_VALUE_DEV_LEDGER_KIND');
  exactRecord(value.compiled,['path','sha256']);exactRecord(value.receipt,['path','sha256']);
  assert.equal(value.compiled.path,NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5,'NATIVE_VALUE_DEV_LEDGER_FIXED_COMPILED_PATH');
  assert.equal(value.receipt.path,NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5,'NATIVE_VALUE_DEV_LEDGER_FIXED_RECEIPT_PATH');
  hash(value.compiled.sha256);hash(value.receipt.sha256);
  const original=nativeValueDevRetainedMetadataV5().ledger;
  assert.deepEqual(value.historicalCompiled,original.compiled,'NATIVE_VALUE_DEV_LEDGER_ORIGINAL_RAW_PIN');
  assert.equal(value.historicalArtifactRecovered,false,'NATIVE_VALUE_DEV_LEDGER_NOT_HISTORICAL_RECOVERY');
  assert.equal(value.settingsSHA256,original.settingsSHA256,'NATIVE_VALUE_DEV_LEDGER_ORIGINAL_SETTINGS');
  assert.equal(value.componentPinsSHA256,nativeValueDevDigestV5({sources:original.sources,artifacts:original.artifacts}),
    'NATIVE_VALUE_DEV_LEDGER_ORIGINAL_COMPONENT_PINS');
  return frozenInput(value);
}
export function validateNativeValueDevLedgerReceiptV5(input,compiledSHA256) {
  assert.equal(arguments.length,2,'NATIVE_VALUE_DEV_LEDGER_RECEIPT_NO_OPTIONS');
  const value=cloneInput(input);exactRecord(value,['schema','classification','phase','compiler','settingsSHA256',
    'inputSHA256','compiledSHA256','sources','sourceASTSHA256','artifactSHA256','historicalCompiled',
    'historicalArtifactRecovered','ledgerSourcesUnchanged','nativeNodesStarted','proofGenerated']);
  const original=nativeValueDevRetainedMetadataV5();
  assert.equal(value.schema,'LIANUM_NEW_NATIVE_VALUE_LEDGER_BUILD_V5');
  assert.equal(value.classification,NATIVE_VALUE_DEV_LEDGER_KIND_V5);assert.equal(value.phase,'completed');
  assert.equal(value.compiledSHA256,compiledSHA256);hash(compiledSHA256);hash(value.inputSHA256);
  assert.deepEqual(value.compiler,GENERIC_COMPILER_PIN,'NATIVE_VALUE_DEV_LEDGER_ORIGINAL_COMPILER');
  // Exact compiler bytes are validated against GENERIC_COMPILER_PIN by the
  // shared real ledger validator. No caller compiler data selects compilation.
  assert.equal(value.settingsSHA256,original.ledger.settingsSHA256);
  assert.deepEqual(value.sources,Object.entries(original.ledger.sources).map(([name,p])=>({name,sha256:p.sourceSHA256})));
  assert.deepEqual(value.sourceASTSHA256,Object.fromEntries(Object.entries(original.ledger.sources).map(([name,p])=>[name,p.astSHA256])));
  assert.deepEqual(value.artifactSHA256,original.ledger.artifacts);assert.deepEqual(value.historicalCompiled,original.ledger.compiled);
  assert.equal(value.historicalArtifactRecovered,false);assert.equal(value.ledgerSourcesUnchanged,true);
  assert.equal(value.nativeNodesStarted,false);assert.equal(value.proofGenerated,false);
  return frozenInput(value);
}
