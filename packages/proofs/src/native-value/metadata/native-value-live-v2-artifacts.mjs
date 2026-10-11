/** Fixed read-only role artifact loader. It neither weakens the original complete
 * five-proof reader nor accepts caller-selected files, keys, sources or profiles.
 * Proving additionally requires BOTH reviewed releases and the complete bundle. */
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, FLAT, CANDIDATE, GOLDEN, SETTINGS } from '../../catalog.mjs';
import { regular, hash, assertABI } from '../../tooling/tooling.mjs';
import { NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256, assertNativeValueCompiledIdentity } from './native-value-v2-profile.mjs';
import { NATIVE_VALUE_LIVE_V2_SPEC, NATIVE_VALUE_LIVE_V2_SOURCE_VERSION,
  NATIVE_VALUE_LIVE_V2_KEY_SHA256, NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256 } from './native-value-live-v2-profile.mjs';
import { NATIVE_VALUE_LIVE_V2_RELEASE, NATIVE_VALUE_LIVE_V2_RELEASE_SCHEMA } from './native-value-wallet-role-release-v4.mjs';
import { NATIVE_VALUE_WALLET_ROLE_SOURCE_PINS_V4 as NATIVE_VALUE_LIVE_V2_SOURCE_PINS } from './native-value-wallet-role-source-pins-v4.mjs';
import { inspectNativeValueAdmissionReaderPins, loadNativeValueDeploymentArtifacts } from '../../../../backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { NATIVE_VALUE_RELEASE } from '../../../../backend/src/operations/releases/native-value/native-value-wallet-release-v4.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
const PREPARED=resolve(ROOT,'../../drafts/native-value-verifier-preparation');
const DRIVER=join(PREPARED,'layout/omnichain-flat-profile/flat-wallet/proof-workers');
const hexWord=i=>'0x'+BigInt(i).toString(16).padStart(64,'0');
export function assertNativeValueLiveSourcePins() {
  assert.equal(arguments.length,0,'NV2_SOURCE_NO_OPTIONS');
  assert.ok(NATIVE_VALUE_LIVE_V2_SOURCE_PINS.length>0,'NV2_SOURCE_CLOSURE_REQUIRED');
  assert.equal(new Set(NATIVE_VALUE_LIVE_V2_SOURCE_PINS.map(p=>p.path)).size,NATIVE_VALUE_LIVE_V2_SOURCE_PINS.length,'NV2_SOURCE_DUPLICATE');
  for(const entry of NATIVE_VALUE_LIVE_V2_SOURCE_PINS) {
    exactRecord(entry,['path','sha256']);
    const roots=[['golden/',GOLDEN],['candidate/',CANDIDATE],['flat/',FLAT]],root=roots.find(([p])=>entry.path.startsWith(p));
    const name=root?entry.path.slice(root[0].length):entry.path;
    assert.ok(name&&!name.startsWith('/')&&!name.split('/').some(p=>!p||p==='.'||p==='..'),'NV2_SOURCE_PATH');
    assert.equal(hash(regular(join(root?.[1]??ROOT,name))),entry.sha256,'NV2_SOURCE_PIN');
  }
  return hash(JSON.stringify(NATIVE_VALUE_LIVE_V2_SOURCE_PINS));
}
/** Public, read-only inspection is deliberately separate from proof authority.
 * Calling it never satisfies either release gate or mints an owned capability. */
export async function inspectNativeValueLiveArtifacts() {
  assert.equal(arguments.length,0,'NV2_ARTIFACT_NO_OPTIONS');
  const closure=assertNativeValueLiveSourcePins();inspectNativeValueAdmissionReaderPins();
  const catalog=await import(pathToFileURL(join(DRIVER,'catalog.mjs')));
  const tooling=await import(pathToFileURL(join(DRIVER,'tooling.mjs')));
  const helpers=await import(tooling.resourceModuleURL),toolchain=helpers.verifyToolchain(),crs=helpers.verifyCRS();
  const spec=catalog.relation(NATIVE_VALUE_LIVE_V2_SPEC.name),identity=tooling.circuitIdentity(spec,toolchain);
  const sourceVersion=hash(JSON.stringify(identity));
  const context={spec,identity,sourceVersion,toolchain,directory:tooling.versionDirectory(spec,sourceVersion)};
  assertNativeValueCompiledIdentity(context);
  const compiled=await tooling.loadCompiled(context),statistics=await tooling.loadStats(context,compiled);
  const prepared=await tooling.loadPrepared(context,compiled,crs);
  assert.equal(hash(compiled.programBytes),NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256,'NV2_ACCEPTED_PROGRAM');
  assertABI(NATIVE_VALUE_LIVE_V2_SPEC,compiled.program);
  assert.equal(prepared.manifestSHA256,NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256,'NV2_ACCEPTED_KEY_MANIFEST');
  assert.equal(hash(prepared.key),NATIVE_VALUE_LIVE_V2_KEY_SHA256,'NV2_ACCEPTED_KEY');
  assert.equal(statistics.manifest.stats.numGatesDyadic,2097152,'NV2_ACTUAL_DYADIC21');
  assert.deepEqual(prepared.manifest.settings,SETTINGS);assert.equal(prepared.manifest.maximumPages,65536);
  assert.equal(prepared.manifest.threads,1);assert.equal(prepared.manifest.actualKeyPublicCount,92);
  const words=Array.from({length:3},(_,i)=>'0x'+prepared.key.subarray(i*32,(i+1)*32).toString('hex'));
  assert.deepEqual(words,[21,92,5].map(hexWord),'NV2_KEY_HEADER');
  inspectNativeValueAdmissionReaderPins();assert.equal(assertNativeValueLiveSourcePins(),closure,'NV2_SOURCE_CHANGED');
  return {classification:'FIXED_KEY_PROGRAM_INSPECTION_NOT_PROVING_OR_DEPLOYMENT_AUTHORITY',
    sourceVersion,program:compiled.program,compressed:compiled.compressed,key:prepared.key,crs,
    keySHA256:NATIVE_VALUE_LIVE_V2_KEY_SHA256,keyManifestSHA256:prepared.manifestSHA256,
    compiledManifestSHA256:compiled.manifestSHA256,artifactSHA256:hash(compiled.programBytes),
    bytecodeSHA256:compiled.manifest.bytecodeSHA256,stats:statistics.manifest.stats,sourceClosure:closure};
}
export async function loadNativeValueLiveArtifacts() {
  assert.equal(arguments.length,0,'NV2_RELEASE_NO_OPTIONS');
  assert.ok(NATIVE_VALUE_LIVE_V2_RELEASE&&NATIVE_VALUE_RELEASE,'NV2_REVIEWED_COHERENT_RELEASE_REQUIRED');
  const release=NATIVE_VALUE_LIVE_V2_RELEASE;
  exactRecord(release,['schema','sourceClosure','sourceVersion','keySHA256','keyManifestSHA256','deploymentReleaseSHA256']);
  assert.equal(release.schema,NATIVE_VALUE_LIVE_V2_RELEASE_SCHEMA);
  assert.equal(release.sourceVersion,NATIVE_VALUE_LIVE_V2_SOURCE_VERSION);
  assert.equal(release.keySHA256,NATIVE_VALUE_LIVE_V2_KEY_SHA256);
  assert.equal(release.keyManifestSHA256,NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256);
  assert.equal(release.deploymentReleaseSHA256,hash(JSON.stringify(NATIVE_VALUE_RELEASE)));
  const artifacts=await inspectNativeValueLiveArtifacts();assert.equal(artifacts.sourceClosure,release.sourceClosure);
  // This still requires all five fixed independently verified proofs and all
  // twelve verifier/ledger source, key, compiler and graph-only artifact joins.
  const bundle=await loadNativeValueDeploymentArtifacts();
  const admission=bundle.verifiers.admission;
  assert.equal(admission.lineage.sourceVersion,artifacts.sourceVersion);
  assert.equal(admission.lineage.keySHA256,artifacts.keySHA256);
  return artifacts;
}
