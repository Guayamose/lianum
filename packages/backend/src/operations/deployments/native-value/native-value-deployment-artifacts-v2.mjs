/** Read-only fixed-release loader. It cannot compile, prove, start a node, accept
 * caller paths/pins, or mint system ownership. A private bundle brand is issued
 * only after every fixed file, ABI, source, program, key and artifact join passes. */
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ROOT, FLAT, GOLDEN, CANDIDATE, relation, NOIR_VERSION, SETTINGS } from '@lianum/proofs/catalog';
import { assertABI, circuitIdentity, loadCompiled, loadPrepared, versionDirectory } from '@lianum/proofs/tooling/tooling';
import { NATIVE_VALUE_ADMISSION_SPEC, NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256, assertNativeValueCompiledIdentity } from '@lianum/proofs/native-value/metadata/native-value-v2-profile';
import { inspectRetainedNodeArtifactsForPreparationV1 } from '@lianum/proofs/tooling/retained-node-artifacts-v1';
import { loadProofProfile } from '@lianum/proofs/execution/proof-worker';
import { GENERIC_COMPILER_PIN, deriveGenericVerifierImmutables } from '@lianum/engine/execution/local/local-deployment';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';
import { frozenInput, cloneInput } from '@lianum/components/plain-input';
import { NATIVE_VALUE_WALLET_HOST_SOURCE_PINS_V4 as NATIVE_VALUE_HOST_SOURCE_PINS } from '../../releases/native-value/native-value-wallet-host-source-pins-v4.mjs';
import { verifyToolchain, verifyCRS } from '@lianum/proofs/toolchain/wallet-resources';
import { NATIVE_VALUE_RELEASE, NATIVE_VALUE_RELEASE_SCHEMA, NATIVE_VALUE_SOURCE_CLOSURE,
  NATIVE_VALUE_REQUIRED_ARTIFACTS } from '../../releases/native-value/native-value-wallet-release-v4.mjs';
import { inspectNativeValueDevMobileDependenciesV5 } from '../../releases/native-value/native-value-dev-source-pins-v5.mjs';
import { NATIVE_VALUE_DEV_RELEASE_V5 } from '../../releases/native-value/native-value-dev-release-v5.mjs';
import { validateNativeValueDevReleaseV5, nativeValueDevRetainedMetadataV5, nativeValueDevDigestV5, validateNativeValueDevPinnedBytesV5,
  NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5, NATIVE_VALUE_DEV_RETAINED_SHA256_V5,
  NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5, NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5, NATIVE_VALUE_DEV_LEDGER_KIND_V5,
  NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5, NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5, validateNativeValueDevProducedLedgerDescriptorV5, validateNativeValueDevLedgerReceiptV5 }
  from '../../releases/native-value/native-value-dev-release-contract-v5.mjs';
import { inspectProducedW39ConsumerArtifactsV5 as inspectProducedW39ArtifactsV5 } from './native-value-dev-w39-consumer-artifacts-v5.mjs';
import { inspectProducedW39ArtifactsV5 as inspectCurrentW39CompilerArtifactsV5 } from './native-value-dev-w39-artifacts-v5.mjs';
import { inspectPublishedW39ReuseArtifactsV6 } from './native-value-dev-w39-reused-artifacts-v6.mjs';
import { isDevelopmentWorkspacePackageLabelV1 } from '../../releases/native-value/workspace-package-source-v1.mjs';
const issued = new WeakSet();
const ADMISSION_PREPARED_ROOT = '/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/drafts/native-value-verifier-preparation';
const ADMISSION_COMPILE_ROOT = '/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/drafts/generic-native-admission-compile';
const ADMISSION_READER_PIN = Object.freeze({path:'admission-prepared/read-native-value-artifacts.mjs',sha256:'5e1ea4272221d8790a93bb1ab4c0399c1a475bfc23ea87a1676cd7202549ef63'});
const ADMISSION_DRIVER_PIN = Object.freeze({path:'admission-prepared/driver-source-manifest.json',sha256:'09ffe3beb3a3024e65f36aeaa4b80d32e6a2a43a31d20e3f7bb63ea54e091d3e'});
const sha = b => createHash('sha256').update(b).digest('hex');
export const NATIVE_VALUE_VERIFIER_ORDER = frozenInput([
  ['authorization',16],['reservation',58],['dependency',42],['ready',50],['admission',84],['node',32],
  ['settlement',138],['recovery',41],['deposit_balance',26],['withdraw_balance',39],['withdraw',39],['deposit_intent',27],
]);
export const NATIVE_VALUE_LEDGER_ROLES = frozenInput({
  hub:['native-value-v2/PrivateFlatReceiptHubNativeValueV2.sol','PrivateFlatReceiptHubNativeValueV2'],
  pool:['PrivateFlatAssetNotePool.sol','PrivateFlatAssetNotePool'],
  poseidon2Domains:['crypto/Poseidon2Domains.sol','Poseidon2Domains'],hubCodec:['FlatHubCodec.sol','FlatHubCodec'],
});
export const NATIVE_VALUE_LEDGER_SOURCES = Object.freeze(['FlatHubCodec.sol','FlatVerifierSet.sol',
  'PrivateFlatAssetNotePool.sol','crypto/Poseidon2.sol','crypto/Poseidon2Domains.sol',
  'native-value-v2/FlatNativeValueRegistryV2.sol','native-value-v2/PrivateFlatReceiptHubNativeValueV2.sol']);
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v)
  ? '['+v.map(canonical).join(',')+']' : '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest = v => sha(canonical(v));
function hash(h) { assert.match(h,/^[0-9a-f]{64}$/,'NATIVE_VALUE_ARTIFACT_HASH'); return h; }
function bytes(path, maximum = 128*1024*1024) {
  // Resolve only fixed release entries under the installed wallet; reject every
  // symlink component, traversal, absolute path and oversized artifact.
  assert.equal(typeof path,'string'); assert.ok(path.length && !path.startsWith('/') && !path.split('/').some(p=>!p||p==='.'||p==='..'),'NATIVE_VALUE_ARTIFACT_PATH');
  if(path.startsWith('development-'))assert.ok(NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5.includes(path),'NATIVE_VALUE_DEV_FIXED_DEVELOPMENT_SOURCE_ONLY');
  if(path.startsWith('workspace-module/'))assert.ok(NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5.includes(path),'NATIVE_VALUE_DEV_FIXED_WORKSPACE_MODULE_ONLY');
  if(path.startsWith('workspace-package/'))assert.ok(isDevelopmentWorkspacePackageLabelV1(path),'NATIVE_VALUE_DEV_KNOWN_WORKSPACE_PACKAGE');
  const roots=[['workspace-package/',resolve(FLAT,'../../../packages')],['workspace-module/',resolve(FLAT,'../../..')],['development-tooling/',resolve(FLAT,'../../../scripts/development')],['development-config/',resolve(FLAT,'../../../scripts')],['development-root/',resolve(FLAT,'../../..')],['golden/',GOLDEN],['candidate/',CANDIDATE],['flat/',FLAT],['mobile-protocol/',resolve(FLAT,'../mobile-protocol')],['mobile-app/',resolve(FLAT,'../../../apps/mobile')],['mobile-protocol-workspace/',resolve(FLAT,'../../../packages/mobile-protocol')],['admission-prepared/',ADMISSION_PREPARED_ROOT],['admission-compile/',ADMISSION_COMPILE_ROOT]];
  const selected=roots.find(([prefix])=>path.startsWith(prefix));let p=selected?.[1]??ROOT;if(selected&&['workspace-package/','workspace-module/','mobile-protocol/','mobile-app/','mobile-protocol-workspace/','development-tooling/','development-config/','development-root/'].includes(selected[0]))assert.equal(realpathSync(p),p,'NATIVE_VALUE_DEV_FIXED_ROOT_ALIAS');const parts=(selected?path.slice(selected[0].length):path).split('/'); for (const part of parts) { p=join(p,part); assert.ok(!lstatSync(p).isSymbolicLink(),'NATIVE_VALUE_ARTIFACT_SYMLINK'); }
  const s=lstatSync(p); assert.ok(s.isFile() && s.size<=maximum,'NATIVE_VALUE_ARTIFACT_FILE');
  const result=readFileSync(p); assert.equal(result.length,s.size,'NATIVE_VALUE_ARTIFACT_FILE_CHANGED'); return result;
}
function pinned(entry) { exactRecord(entry,['path','sha256']); const b=bytes(entry.path); assert.equal(sha(b),hash(entry.sha256),'NATIVE_VALUE_ARTIFACT_RAW_PIN'); return b; }
function json(entry) { return JSON.parse(pinned(entry)); }
/** Checks the fixed reader AND every imported driver/external source before
 * importing it. This function performs only filesystem reads and grants no brand. */
export function inspectNativeValueAdmissionReaderPins() {
  assert.equal(arguments.length,0,'NATIVE_VALUE_I_READER_NO_OPTIONS');
  pinned(ADMISSION_READER_PIN);const manifest=json(ADMISSION_DRIVER_PIN);
  assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0);
  for(const item of manifest.files){
    const b=pinned({path:'admission-prepared/'+item.path,sha256:item.sha256});assert.equal(b.length,item.bytes,'NATIVE_VALUE_I_DRIVER_SOURCE_BYTES');
  }
  for(const item of manifest.readOnlyExternalFiles){
    // These exact absolute sources belong to the fixed, hash-pinned manifest,
    // never a caller manifest or a directory selected by external content.
    assert.equal(typeof item.path,'string');assert.equal(resolve(item.path),item.path);
    const stat=lstatSync(item.path);assert.ok(stat.isFile()&&!stat.isSymbolicLink());
    const b=readFileSync(item.path);assert.equal(b.length,item.bytes);assert.equal(sha(b),hash(item.sha256),'NATIVE_VALUE_I_EXTERNAL_SOURCE_PIN');
  }
  return Object.freeze({readerSHA256:ADMISSION_READER_PIN.sha256,driverSourceManifestSHA256:ADMISSION_DRIVER_PIN.sha256,sourceFiles:manifest.files.length+manifest.readOnlyExternalFiles.length});
}
async function loadFixedNativeValueAdmission() {
  inspectNativeValueAdmissionReaderPins();
  const module=await import(pathToFileURL(join(ADMISSION_PREPARED_ROOT,'read-native-value-artifacts.mjs')));
  assert.equal(typeof module.loadNativeValueArtifacts,'function');const loaded=await module.loadNativeValueArtifacts();
  assert.equal(loaded.driverSourceManifestSHA256,ADMISSION_DRIVER_PIN.sha256,'NATIVE_VALUE_I_READER_MANIFEST_JOIN');
  inspectNativeValueAdmissionReaderPins();return loaded;
}
/** Read-only original I84 material for the separate V5 consumer. No bundle
 * brand is issued here, and the fixed /workspace reader and all of its proof,
 * source, program, VK and resource joins are retained unchanged. */
export async function inspectRetainedNativeValueAdmissionForDevV5() {
 assert.equal(arguments.length,0,'NATIVE_VALUE_DEV_I84_INSPECT_NO_OPTIONS');
 return loadFixedNativeValueAdmission();
}
const EXPECTED_I_CASES = Object.freeze([{"name": "positive-ethereum", "expected": "accept"}, {"name": "positive-base", "expected": "accept"}, {"name": "positive-arbitrum", "expected": "accept"}, {"name": "positive-bnb", "expected": "accept"}, {"name": "unknown-source-predicate", "expected": "reject"}, {"name": "nonzero-inactive-tron-version", "expected": "reject"}, {"name": "nonzero-inactive-tron-policy", "expected": "reject"}, {"name": "wrong-registry-epoch", "expected": "reject"}, {"name": "wrong-profile-version", "expected": "reject"}, {"name": "unsupported-chain-id", "expected": "reject"}, {"name": "wrong-finality-policy", "expected": "reject"}, {"name": "wrong-trace-policy", "expected": "reject"}, {"name": "wrong-obligation", "expected": "reject"}, {"name": "wrong-profile-path", "expected": "reject"}, {"name": "wrong-source-path", "expected": "reject"}, {"name": "wrong-source-position", "expected": "reject"}, {"name": "wrong-source-identity", "expected": "reject"}, {"name": "wrong-wire-key", "expected": "reject"}, {"name": "wrong-original-wire-digest", "expected": "reject"}, {"name": "wrong-native-family", "expected": "reject"}, {"name": "wrong-native-gid-padding", "expected": "reject"}, {"name": "wrong-native-effect-index", "expected": "reject"}, {"name": "wrong-source-endpoint", "expected": "reject"}, {"name": "wrong-destination-endpoint", "expected": "reject"}, {"name": "zero-native-value", "expected": "reject"}, {"name": "wrong-custody-term", "expected": "reject"}, {"name": "wrong-evidence-expiry", "expected": "reject"}, {"name": "not-finalized", "expected": "reject"}, {"name": "ancestry-bound", "expected": "reject"}, {"name": "missing-execution-evidence", "expected": "reject"}, {"name": "wrong-owner-action", "expected": "reject"}, {"name": "wrong-provider-signature", "expected": "reject"}, {"name": "wrong-quorum-signature", "expected": "reject"}, {"name": "wrong-loss-acceptance", "expected": "reject"}, {"name": "wrong-receipt-secret", "expected": "reject"}, {"name": "wrong-payout-linkage", "expected": "reject"}, {"name": "wrong-ready-seal", "expected": "reject"}, {"name": "wrong-historical-checkpoint", "expected": "reject"}, {"name": "wrong-current-revocation-sequence", "expected": "reject"}, {"name": "invalid-current-vector-padding", "expected": "reject"}, {"name": "positive-tron", "expected": "accept"}, {"name": "tron-wrong-permission-policy", "expected": "reject"}, {"name": "tron-wrong-tapos-policy", "expected": "reject"}, {"name": "tron-wrong-finality-policy", "expected": "reject"}, {"name": "tron-unsupported-lifetime", "expected": "reject"}, {"name": "tron-wrong-family", "expected": "reject"}, {"name": "tron-int63-overflow", "expected": "reject"}, {"name": "tron-identity-padding", "expected": "reject"}, {"name": "tron-nonzero-inactive-evm", "expected": "reject"}, {"name": "tron-current-gid-revoked-correct-public-state", "expected": "reject"}].map(Object.freeze));
/** Pure validation seam over actual worker result/resource reports. No authority
 * is minted here. Reports used by the loader are themselves fixed raw-file pins. */
export function validateNativeValueConstraintReports(reports,identity) {
  fixedArray(reports,2);let rows=[];const runs=new Set();
  reports.forEach(({result,resources},index)=>{
    const mode=index===0?'constraints-first40':'constraints-last10';
    for(const report of [result,resources]) {
      assert.equal(report.phase,'completed');assert.equal(report.mode,mode);assert.equal(report.relation,'admission_native_value_v2');
      assert.equal(report.profile,'LIANUM_PAEG_P2_V1');assert.equal(report.hostLimitsChanged,false);
    }
    assert.equal(result.runId,resources.runId);assert.ok(!runs.has(result.runId));runs.add(result.runId);
    assert.equal(resources.exitCode,0);assert.equal(resources.failure,null);assert.deepEqual(resources.failures,[]);
    assert.equal(result.sourceVersion,identity.sourceVersion);assert.equal(result.artifactSHA256,identity.programSHA256);
    assert.equal(result.compiledManifestSHA256,identity.compiledManifestSHA256);
    assert.equal(result.bytecodeSHA256,identity.bytecodeSHA256);
    assert.equal(sha(JSON.stringify(result.identity)),identity.sourceVersion);
    assert.deepEqual(result.toolchain,identity.toolchain);
    assert.equal(resources.runtimePinsSHA256,result.runtimePinsSHA256);
    assert.deepEqual(result.actualCompiled,{compiledManifestSHA256:identity.compiledManifestSHA256,artifactSHA256:identity.programSHA256,bytecodeSHA256:result.bytecodeSHA256});
    assert.equal(result.constraintBackendDestroyed,true);assert.equal(result.keyGenerated,false);assert.equal(result.proofGenerated,false);assert.equal(result.witnessPersisted,false);
    assert.equal(result.constraintCasesCompleted,index===0?40:10);fixedArray(result.constraints,result.constraintCasesCompleted);rows.push(...result.constraints);
  });
  assert.deepEqual(rows.map(({name,expected})=>({name,expected})),EXPECTED_I_CASES,'NATIVE_VALUE_ARTIFACT_EXACT_CONSTRAINT_CASES');
  for(const row of rows) {
    assert.equal(row.accepted,row.expected==='accept','NATIVE_VALUE_ARTIFACT_CONSTRAINT_OUTCOME');
    if(row.expected!=='accept') {
      assert.equal(row.failureLayer,'constraint','NATIVE_VALUE_ARTIFACT_HOST_REJECTION_NOT_CONSTRAINT');
      assert.equal(row.constraintOrigin.origin,'structured-acvm-execution-error');assert.equal(row.constraintOrigin.category,'unsatisfied-constraint');
    }
  }
  return true;
}
function assertNativeValueConstraintReports(pins,identity) {
  fixedArray(pins,2);const reports=pins.map(pin=>{exactRecord(pin,['result','resources']);return {result:json(pin.result),resources:json(pin.resources)};});
  validateNativeValueConstraintReports(reports,identity);
}

function contract(ast,name,kind) {
  assert.equal(ast?.nodeType,'SourceUnit');const found=ast.nodes.filter(n=>n.nodeType==='ContractDefinition'&&n.name===name);
  assert.equal(found.length,1,'NATIVE_VALUE_ARTIFACT_CONTRACT'); assert.equal(found[0].contractKind,kind);return found[0];
}
function immutables(ast,name) {
  const found=contract(ast,name,'contract').nodes.filter(n=>n.nodeType==='VariableDeclaration'&&n.mutability==='immutable');
  const result=Object.fromEntries(found.map(n=>{assert.ok(n.stateVariable&&Number.isSafeInteger(n.id));return [n.id,n.name];}));
  assert.equal(Object.keys(result).length,found.length);assert.equal(new Set(Object.values(result)).size,found.length);return result;
}
function size(artifact) {
  for(const [kind,limit] of [['bytecode',49152],['deployedBytecode',24576]]) {
    const b=artifact.evm[kind].object;assert.equal(typeof b,'string');assert.ok(b.length>0&&b.length%2===0&&b.length/2<=limit,'NATIVE_VALUE_ARTIFACT_EVM_SIZE');
  }
}
function compiler(compilation,settingsSHA256) {
  assert.equal(compilation.classification,'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.deepEqual(compilation.compiler,GENERIC_COMPILER_PIN,'NATIVE_VALUE_ARTIFACT_COMPILER');
  assert.equal(digest(compilation.settings),hash(settingsSHA256),'NATIVE_VALUE_ARTIFACT_SETTINGS');
  assert.equal(compilation.settings.evmVersion,'cancun');
}
function loadLedger(release, compiledPin = release.ledger.compiled) {
  const pin=release.ledger;exactRecord(pin,['compiled','settingsSHA256','sources','artifacts']);
  const compilation=json(compiledPin);return validateLedgerCompilation(compilation,pin);
}
function validateLedgerCompilation(compilation,pin) {
  compiler(compilation,pin.settingsSHA256);
  exactRecord(pin.sources,NATIVE_VALUE_LEDGER_SOURCES);exactRecord(compilation.sourceASTs,NATIVE_VALUE_LEDGER_SOURCES);
  fixedArray(compilation.sources,NATIVE_VALUE_LEDGER_SOURCES.length);const sourceMap={};
  for(const name of NATIVE_VALUE_LEDGER_SOURCES) {
    const p=pin.sources[name];exactRecord(p,['sourceSHA256','astSHA256']);const b=bytes('contracts/'+name);
    assert.equal(sha(b),hash(p.sourceSHA256),'NATIVE_VALUE_ARTIFACT_LEDGER_SOURCE');
    assert.deepEqual(compilation.sources.filter(r=>r.name===name),[{name,sha256:p.sourceSHA256,bytes:b.length}],'NATIVE_VALUE_ARTIFACT_LEDGER_RECORD');
    assert.equal(digest(compilation.sourceASTs[name]),hash(p.astSHA256),'NATIVE_VALUE_ARTIFACT_AST');
    assert.equal(compilation.sourceASTs[name].absolutePath,name);sourceMap[name]={content:b.toString(),sha256:p.sourceSHA256};
  }
  exactRecord(pin.artifacts,Object.keys(NATIVE_VALUE_LEDGER_ROLES));const artifacts={},immutableNames={};
  for(const [role,[source,name]]of Object.entries(NATIVE_VALUE_LEDGER_ROLES)) {
    const artifact=compilation.contracts[source]?.[name];assert.ok(artifact,'NATIVE_VALUE_ARTIFACT_LEDGER_MISSING');
    assert.equal(digest(artifact),hash(pin.artifacts[role]),'NATIVE_VALUE_ARTIFACT_LEDGER_PIN');size(artifact);artifacts[role]=artifact;
    if(['hub','pool'].includes(role))immutableNames[role]=immutables(compilation.sourceASTs[source],name);
  }
  assert.equal(Object.keys(immutableNames.hub).length,15);assert.equal(Object.keys(immutableNames.pool).length,17);
  return {compilation,sourceMap,artifacts,immutableNames};
}
function keyHeader(key,values,words) {
  assert.equal(key.length,59*32,'NATIVE_VALUE_ARTIFACT_KEY_BYTES');const word=i=>BigInt('0x'+key.subarray(i*32,(i+1)*32).toString('hex'));
  assert.equal(word(0),BigInt(values.$LOG_N));assert.equal(1n<<word(0),BigInt(values.$N));
  assert.equal(word(1),BigInt(words+8));assert.equal(word(1),BigInt(values.$NUM_PUBLIC_INPUTS));assert.equal(word(2),5n);
}

// Exact original W39 adapter. Only this distinct legacy role preserves its
// original source name and generation-report schema; there is no generic bypass.
const ORIGINAL_W39_ROOT = resolve(ROOT, '../../drafts/native-value-genuine-deployment-artifacts/w39-adapter');
const ORIGINAL_W39_MANIFEST_SHA256 = '8b3d3adddb9e7d0064a40744cb3b0e0e37bf2028728c3e07b5489b58acd05376';
function inspectOriginalW39Adapter() {
  assert.equal(realpathSync(ORIGINAL_W39_ROOT),ORIGINAL_W39_ROOT,'NATIVE_VALUE_W39_ADAPTER_ROOT');
  const manifestPath=join(ORIGINAL_W39_ROOT,'source-manifest.json');
  assert.ok(lstatSync(manifestPath).isFile()&&!lstatSync(manifestPath).isSymbolicLink());
  const raw=readFileSync(manifestPath);assert.equal(sha(raw),ORIGINAL_W39_MANIFEST_SHA256,'NATIVE_VALUE_W39_ADAPTER_MANIFEST');
  const manifest=JSON.parse(raw);
  assert.deepEqual(manifest.files.map(p=>p.path),['read-original-w39.mjs','original-file-pins.mjs','compiler-pin.mjs','verifier-ast.mjs']);
  for(const p of manifest.files){const file=join(ORIGINAL_W39_ROOT,p.path);assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink());const b=readFileSync(file);assert.equal(b.length,p.bytes);assert.equal(sha(b),p.sha256,'NATIVE_VALUE_W39_ADAPTER_SOURCE');}
}
async function loadOriginalW39Verifier(pin,words,release) {
  assert.equal(pin?.lineage?.kind,'GENUINE_ORIGINAL_W39_RECORDS_ARRAY_AND_RETAINED_COMPILER','NATIVE_VALUE_W39_EXPLICIT_ORIGINAL_EVIDENCE_KIND');
  assert.equal(words,39);inspectOriginalW39Adapter();
  const reader=await import(pathToFileURL(join(ORIGINAL_W39_ROOT,'read-original-w39.mjs')));
  const fixed=reader.loadOriginalW39Artifacts();reader.assertOriginalW39Artifacts(fixed);
  assert.deepEqual(pin,fixed.releasePin,'NATIVE_VALUE_W39_EXACT_ORIGINAL_RELEASE_PINS');
  assert.deepEqual(release.toolchain,fixed.toolchain,'NATIVE_VALUE_W39_ORIGINAL_TOOLCHAIN');
  inspectOriginalW39Adapter();return fixed.verifier;
}

async function loadVerifier(pin,role,words,release,retainedNode=null) {
  assert.ok(retainedNode===null||role==='node','RETAINED_NODE_FIXED_ROLE');
  if(role==='withdraw')return loadOriginalW39Verifier(pin,words,release);
  exactRecord(pin,['source','compiled','settingsSHA256','artifactSHA256','program','key','generation','constraints','lineage']);
  const sourceBytes=pinned(pin.source),compilation=json(pin.compiled);compiler(compilation,pin.settingsSHA256);
  const source=role+'.sol';assert.deepEqual(compilation.sources,[{name:source,sha256:pin.source.sha256,bytes:sourceBytes.length}]);
  exactRecord(compilation.sourceASTs,[source]);exactRecord(compilation.contracts,[source]);
  const ast=compilation.sourceASTs[source];assert.equal(ast.absolutePath,source);contract(ast,'HonkVerifier','contract');
  const names=immutables(ast,'BaseZKHonkVerifier'),values=deriveGenericVerifierImmutables(ast,words),contracts=compilation.contracts[source],artifact=contracts.HonkVerifier;
  assert.equal(digest(artifact),hash(pin.artifactSHA256));for(const item of Object.values(contracts))if(item.evm?.bytecode?.object)size(item);
  const methods=artifact.abi.filter(v=>v.type==='function');assert.equal(methods.length,1);assert.equal(methods[0].name,'verify');
  assert.equal(methods[0].stateMutability,'view');assert.deepEqual(methods[0].inputs.map(v=>v.type),['bytes','bytes32[]']);assert.deepEqual(methods[0].outputs.map(v=>v.type),['bool']);
  assert.deepEqual(artifact.evm.methodIdentifiers,{'verify(bytes,bytes32[])':'ea50d0e4'});
  const constructors=artifact.abi.filter(v=>v.type==='constructor');assert.ok(constructors.length<=1&&constructors.every(v=>v.stateMutability==='nonpayable'&&v.inputs.length===0));
  const programBytes=pinned(pin.program),program=JSON.parse(programBytes),key=pinned(pin.key),generation=json(pin.generation);
  assert.equal(sha(JSON.stringify(program.abi)),pin.lineage.abiSHA256,'NATIVE_VALUE_ARTIFACT_ABI_PIN');
  assert.equal(program.noir_version,NOIR_VERSION,'NATIVE_VALUE_ARTIFACT_NOIR_VERSION');
  const localRole=['authorization','reservation','dependency','ready','admission','node','settlement','recovery','deposit_intent'].includes(role);
  let keyHashField;
  if(localRole) {
    // New I identity belongs only to the already pinned isolated reader. The
    // unchanged historical catalog/tooling never registers or compiles new I.
    const fixed=role==='admission'?await loadFixedNativeValueAdmission():null;
    let spec,identity,sourceVersion,context;
    if(role==='admission') {
      assert.ok(fixed?.compiled&&fixed?.prepared,'NATIVE_VALUE_I_FIXED_READER_OUTPUT_REQUIRED');
      sourceVersion=assertNativeValueCompiledIdentity(fixed.context);spec=NATIVE_VALUE_ADMISSION_SPEC;
      identity=fixed.context.identity;context=fixed.context;
      assert.equal(sha(programBytes),NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256,'NATIVE_VALUE_ACCEPTED_PROGRAM');
      assert.deepEqual(fixed.context.toolchain,release.toolchain);assert.deepEqual(fixed.crs,release.crs);
    } else {
      spec=relation(role);identity=circuitIdentity(spec,release.toolchain);sourceVersion=sha(JSON.stringify(identity));
      context={spec,identity,toolchain:release.toolchain,sourceVersion,directory:versionDirectory(spec,sourceVersion)};
    }
    assert.equal(sourceVersion,pin.lineage.sourceVersion,'NATIVE_VALUE_ARTIFACT_CURRENT_SOURCE');assertABI(spec,program);
    const compiled=role==='admission'?fixed.compiled:retainedNode?.compiled??await loadCompiled(context);
    const prepared=role==='admission'?fixed.prepared:retainedNode?.prepared??await loadPrepared(context,compiled,release.crs);
    assert.equal(compiled.manifestSHA256,pin.lineage.compiledManifestSHA256,'NATIVE_VALUE_ARTIFACT_COMPILED_LINEAGE');
    if(role==='node')assert.equal(prepared.pins.provenanceSHA256,pin.generation.sha256,'NATIVE_VALUE_ARTIFACT_NODE_GENERATION_REPORT');
    else assert.equal(prepared.manifestSHA256,pin.generation.sha256,'NATIVE_VALUE_ARTIFACT_KEY_MANIFEST_LINEAGE');
    assert.equal(prepared.manifestSHA256,pin.lineage.keyManifestSHA256,'NATIVE_VALUE_ARTIFACT_KEY_LINEAGE');
    assert.deepEqual(prepared.manifest,generation);assert.ok(compiled.programBytes.equals(programBytes),'NATIVE_VALUE_ARTIFACT_ACTUAL_PROGRAM');
    assert.ok(prepared.key.equals(key),'NATIVE_VALUE_ARTIFACT_ACTUAL_KEY');assert.ok(prepared.solidity.equals(sourceBytes),'NATIVE_VALUE_ARTIFACT_ACTUAL_GENERATED_SOURCE');
    keyHashField=generation.keyHashField;
    if(role==='admission') {
      assert.equal(pin.lineage.sourceClosureSHA256,NATIVE_VALUE_SOURCE_CLOSURE);
      assertNativeValueConstraintReports(pin.constraints,{programSHA256:sha(programBytes),sourceVersion,compiledManifestSHA256:compiled.manifestSHA256,bytecodeSHA256:compiled.manifest.bytecodeSHA256,toolchain:release.toolchain});
    } else assert.equal(pin.constraints,null,'NATIVE_VALUE_ARTIFACT_UNEXPECTED_CONSTRAINT_OVERRIDE');
  } else {
    // Preserve known retained balance-key loader semantics. The old output
    // withdrawal has source-only lineage in the old deployment, which cannot
    // satisfy this stricter factory. Its reviewed binary/program lineage must
    // be provisioned explicitly; a source-only receipt remains insufficient.
    assert.equal(pin.constraints,null);
    assert.equal(generation.phase,'completed');assert.equal(generation.target,'evm');
    assert.equal(generation.keySHA256,sha(key));assert.equal(generation.soliditySHA256,sha(sourceBytes));
    assert.equal(generation.compiledFileSHA256??generation.artifactSHA256,sha(programBytes));
    assert.equal(generation.circuitSHA256,sha(Buffer.from(program.bytecode,'base64')));
    assert.equal(generation.publicInputWords,words);assert.deepEqual(generation.toolchain,release.toolchain);
    assert.equal(generation.zeroKnowledgeEnabled,true,'NATIVE_VALUE_ARTIFACT_LEGACY_ZK');
    if(role==='deposit_balance'||role==='withdraw_balance') {
      const loaded=loadProofProfile(role);assert.ok(loaded.key.equals(key));assert.deepEqual(loaded.program,program);
      assert.equal(loaded.publicPins.soliditySHA256,sha(sourceBytes));
      assert.equal(loaded.publicPins.provenanceSHA256,pin.generation.sha256);
    } else {
      assert.equal(role,'withdraw');
      assert.equal(generation.mode,'withdraw_output');
      assert.equal(generation.sourceTreeSHA256,pin.lineage.sourceTreeSHA256);
      assert.ok(Array.isArray(generation.sources)&&generation.sources.length>0,'NATIVE_VALUE_ARTIFACT_LEGACY_SOURCE_CLOSURE');
      for(const row of generation.sources)pinned(row);
    }
    keyHashField=generation.keyHashField;
  }
  keyHeader(key,values,words);assert.equal(BigInt(values.$VK_HASH),BigInt(keyHashField),'NATIVE_VALUE_ARTIFACT_VK_AST_JOIN');
  return {source,artifact,contracts,immutableNames:names,immutableValues:values,lineage:{...pin.lineage,keySHA256:sha(key),sourceSHA256:sha(sourceBytes),programSHA256:sha(programBytes),keyHashField,publicWords:words,independentVKHashRecomputed:false,proofAcceptanceEstablished:false}};
}
export function assertNativeValueArtifactBundle(bundle) { assert.ok(issued.has(bundle),'NATIVE_VALUE_FIXED_ARTIFACT_BUNDLE_REQUIRED'); }
export async function loadNativeValueDeploymentArtifacts() {
  assert.equal(arguments.length,0,'NATIVE_VALUE_ARTIFACT_NO_CALLER_OVERRIDE');
  if(NATIVE_VALUE_RELEASE===null)throw Object.assign(new Error('NATIVE_VALUE_ACTIVATION_ARTIFACTS_ABSENT'),{code:'NATIVE_VALUE_ACTIVATION_ARTIFACTS_ABSENT',blockers:NATIVE_VALUE_REQUIRED_ARTIFACTS});
  const release=cloneInput(NATIVE_VALUE_RELEASE);exactRecord(release,['schema','sourceClosureSHA256','sourceFiles','toolchain','crs','ledger','verifiers']);
  assert.equal(release.schema,NATIVE_VALUE_RELEASE_SCHEMA);assert.equal(release.sourceClosureSHA256,NATIVE_VALUE_SOURCE_CLOSURE);
  assert.deepEqual(verifyToolchain(),release.toolchain,'NATIVE_VALUE_ARTIFACT_TOOLCHAIN');
  assert.deepEqual(verifyCRS(),release.crs,'NATIVE_VALUE_ARTIFACT_CRS');
  assert.deepEqual(release.sourceFiles,NATIVE_VALUE_HOST_SOURCE_PINS,'NATIVE_VALUE_ARTIFACT_COMPLETE_SOURCE_CLOSURE');
  for(const entry of NATIVE_VALUE_HOST_SOURCE_PINS)pinned(entry);
  const { ledger, verifiers } = await loadRetainedNativeValueArtifacts(release);
  // Re-read source and artifact pin files after asynchronous consumers cannot
  // replace them with a matching-looking descriptor. No data selects authority.
  for(const entry of NATIVE_VALUE_HOST_SOURCE_PINS)pinned(entry);
  assert.deepEqual(verifyToolchain(),release.toolchain,'NATIVE_VALUE_ARTIFACT_TOOLCHAIN_CHANGED');
  assert.deepEqual(verifyCRS(),release.crs,'NATIVE_VALUE_ARTIFACT_CRS_CHANGED');
  const bundle=frozenInput({ledger,verifiers,provenance:{schema:release.schema,releaseSHA256:digest(release),sourceClosureSHA256:NATIVE_VALUE_SOURCE_CLOSURE,
    toolchain:release.toolchain,crs:release.crs,claimsEnabled:false,proofAcceptanceEstablished:false,independentVKHashRecomputed:false}});
  issued.add(bundle);return bundle;
}

// Private shared validator only. The historical entry retains its exact V4
// fences; the development entry never reuses or changes that host pin table.
async function loadRetainedNativeValueArtifacts(release, producedLedger, producedW39, preparePublishedReuse=false) {
  const retainedNode = preparePublishedReuse ? await inspectRetainedNodeArtifactsForPreparationV1() : null;
  const ledger = loadLedger(release, producedLedger?.compiled ?? release.ledger.compiled);
  exactRecord(release.verifiers, NATIVE_VALUE_VERIFIER_ORDER.map(([role]) => role));
  const verifiers = {};
  for (const [role, words] of NATIVE_VALUE_VERIFIER_ORDER)
    verifiers[role] = role==='withdraw'&&producedW39 ? producedW39.verifier : await loadVerifier(release.verifiers[role], role, words, release, role==='node'?retainedNode:null);
  return { ledger, verifiers, nodeReuseReceipt:retainedNode?.receipt??null };
}
function retainedRawFilesUnchanged(release, producedLedger) {
  // Every path comes from the fixed original record. Re-read the raw artifact,
  // program, binary VK, generation and constraint receipts after async readers.
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && Object.keys(value).length === 2
      && Object.hasOwn(value, 'path') && Object.hasOwn(value, 'sha256')) pinned(value);
    else Object.values(value).forEach(visit);
  }
  visit(producedLedger ? {...release.ledger,compiled:producedLedger.compiled} : release.ledger); visit(release.verifiers);
  if(producedLedger)pinned(producedLedger.receipt);
  for (const name of NATIVE_VALUE_LEDGER_SOURCES)
    assert.equal(sha(bytes('contracts/' + name)), release.ledger.sources[name].sourceSHA256,
      'NATIVE_VALUE_DEV_LEDGER_SOURCE_CHANGED');
  inspectOriginalW39Adapter(); inspectNativeValueAdmissionReaderPins();
}
async function inspectFixedRetainedNativeValueArtifactsV5(compilerEvidenceOnly = false, preparePublishedReuse = false) {
  // The fixed candidate producer can inspect a newly completed compilation before
  // its reviewed publication. Financial loading always requires the published
  // raw descriptor and its unchanged current dependency/receipt joins.
  assert.equal(typeof compilerEvidenceOnly, 'boolean');
  assert.equal(typeof preparePublishedReuse, 'boolean');
  assert.ok(!(compilerEvidenceOnly && preparePublishedReuse), 'NATIVE_VALUE_DEV_SINGLE_INSPECTION_MODE');
  const inspectW39 = preparePublishedReuse ? inspectPublishedW39ReuseArtifactsV6
    : compilerEvidenceOnly ? inspectCurrentW39CompilerArtifactsV5 : inspectProducedW39ArtifactsV5;
  const retained = nativeValueDevRetainedMetadataV5();
  assert.deepEqual(verifyToolchain(), retained.toolchain, 'NATIVE_VALUE_DEV_TOOLCHAIN');
  assert.deepEqual(verifyCRS(), retained.crs, 'NATIVE_VALUE_DEV_CRS');
  const producedLedger = inspectProducedNativeValueLedgerV5();
  const producedW39 = inspectW39();
  const loaded = await loadRetainedNativeValueArtifacts(retained, producedLedger, producedW39, preparePublishedReuse);
  retainedRawFilesUnchanged(retained, producedLedger);
  assert.deepEqual(nativeValueDevRetainedMetadataV5(), retained, 'NATIVE_VALUE_DEV_ORIGINAL_RECORD_CHANGED');
  assert.deepEqual(verifyToolchain(), retained.toolchain, 'NATIVE_VALUE_DEV_TOOLCHAIN_CHANGED');
  assert.deepEqual(verifyCRS(), retained.crs, 'NATIVE_VALUE_DEV_CRS_CHANGED');
  assert.deepEqual(inspectProducedNativeValueLedgerV5(),producedLedger,'NATIVE_VALUE_DEV_PRODUCED_LEDGER_CHANGED');
  assert.deepEqual(inspectW39().descriptor,producedW39.descriptor,'NATIVE_VALUE_DEV_W39_CHANGED_AFTER_ASYNC_READ');
  return { retained, producedLedger, producedW39, ...loaded };
}
/** Read-only producer evidence. No caller input and, crucially, no issued.add:
 * copied inspection records can never satisfy assertNativeValueArtifactBundle. */
export async function inspectRetainedNativeValueArtifactsForDevV5() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_INSPECTION_NO_OPTIONS');
  const loaded = await inspectFixedRetainedNativeValueArtifactsV5(true);
  return frozenInput({ historicalReleaseSHA256: NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
    retainedMetadataSHA256: NATIVE_VALUE_DEV_RETAINED_SHA256_V5,
    producedLedger: loaded.producedLedger, producedW39: loaded.producedW39.descriptor, verifierRoles: Object.keys(loaded.verifiers), artifactBundleIssued: false,
    compilationSourceClosureSHA256: loaded.retained.sourceClosureSHA256,
    toolchain: loaded.retained.toolchain, crs: loaded.retained.crs });
}
/** Successor review data for the already published current W39 build. The
 * existing consumer authenticates its eight raw files, unchanged compiler
 * inputs and original receipts. Current host pins are captured by the producer;
 * this inspection neither issues a bundle nor rewrites build provenance. */
export async function inspectReviewedRetainedNativeValueArtifactsForDevV5() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_REVIEWED_INSPECTION_NO_OPTIONS');
  assert.ok(NATIVE_VALUE_DEV_RELEASE_V5 !== null, 'NATIVE_VALUE_DEV_REVIEWED_PUBLICATION_REQUIRED');
  validateNativeValueDevReleaseV5(NATIVE_VALUE_DEV_RELEASE_V5);
  const loaded = await inspectFixedRetainedNativeValueArtifactsV5();
  return frozenInput({ historicalReleaseSHA256: NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
    retainedMetadataSHA256: NATIVE_VALUE_DEV_RETAINED_SHA256_V5,
    producedLedger: loaded.producedLedger, producedW39: loaded.producedW39.descriptor,
    verifierRoles: Object.keys(loaded.verifiers), artifactBundleIssued: false,
    compilationSourceClosureSHA256: loaded.retained.sourceClosureSHA256,
    toolchain: loaded.retained.toolchain, crs: loaded.retained.crs });
}
/** Exact historical publication metadata for V6 preparation only. This fixed
 * canonical digest authenticates the entire retained V5 publication, including
 * its original public-package table digest, source rows and artifact descriptors.
 * It was reviewed against the unchanged literal at 7999fe2660a366c048a48cf3d2c24fc18954994a.
 * No caller pin, replacement descriptor, filesystem access or bundle is accepted. */
export function validateRetainedNativeValuePublicationV6(input) {
  assert.equal(arguments.length, 1, 'NATIVE_VALUE_DEV_V6_RETAINED_PUBLICATION_ARITY');
  const publication = cloneInput(input);
  assert.equal(nativeValueDevDigestV5(publication),
    'e27b012669b958377a917f7660f2d2b0c75e0f287f09e6481544281271823174',
    'NATIVE_VALUE_DEV_V6_RETAINED_PUBLICATION_CHANGED');
  return frozenInput(publication);
}
/** V6 preparation data only: authenticate retained artifacts for a new source
 * generation. No bundle WeakSet insertion or financial consumer is exposed. */
export async function inspectRetainedNativeValueReuseForPreparationV6() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_REUSE_INSPECTION_NO_OPTIONS');
  assert.ok(NATIVE_VALUE_DEV_RELEASE_V5 !== null, 'NATIVE_VALUE_DEV_REUSE_PUBLICATION_REQUIRED');
  const publication = validateRetainedNativeValuePublicationV6(NATIVE_VALUE_DEV_RELEASE_V5);
  const loaded = await inspectFixedRetainedNativeValueArtifactsV5(false, true);
  assert.deepEqual(validateRetainedNativeValuePublicationV6(NATIVE_VALUE_DEV_RELEASE_V5), publication,
    'NATIVE_VALUE_DEV_V6_RETAINED_PUBLICATION_CHANGED');
  return frozenInput({ historicalReleaseSHA256: NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
    retainedMetadataSHA256: NATIVE_VALUE_DEV_RETAINED_SHA256_V5,
    producedLedger: loaded.producedLedger, producedW39: loaded.producedW39.descriptor,
    verifierRoles: Object.keys(loaded.verifiers), reuseReceipt: loaded.producedW39.reuseReceipt,
    nodeReuseReceipt: loaded.nodeReuseReceipt,
    artifactBundleIssued: false, compilationSourceClosureSHA256: loaded.retained.sourceClosureSHA256,
    toolchain: loaded.retained.toolchain, crs: loaded.retained.crs });
}
/** New fixed publication only. Default null stops before toolchain/files/runtime.
 * No manifest, expected pin, bundle or callback is accepted from the caller. */
export async function loadNativeValueDevDeploymentArtifactsV5() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_ARTIFACT_NO_CALLER_OVERRIDE');
  if (NATIVE_VALUE_DEV_RELEASE_V5 === null)
    throw Object.assign(new Error('NATIVE_VALUE_DEV_RELEASE_UNPUBLISHED'), { code: 'NATIVE_VALUE_DEV_RELEASE_UNPUBLISHED' });
  const release = validateNativeValueDevReleaseV5(NATIVE_VALUE_DEV_RELEASE_V5);
  pinned(release.producedLedger.compiled);pinned(release.producedLedger.receipt);
  inspectNativeValueDevMobileDependenciesV5();
  for (const row of release.sourceFiles) validateNativeValueDevPinnedBytesV5(row, bytes(row.path));
  const loaded = await inspectFixedRetainedNativeValueArtifactsV5();
  assert.deepEqual(loaded.producedLedger,release.producedLedger,'NATIVE_VALUE_DEV_REVIEWED_PRODUCED_LEDGER_PIN');
  assert.deepEqual(loaded.producedW39.descriptor,release.producedW39,'NATIVE_VALUE_DEV_REVIEWED_PRODUCED_W39_PIN');
  for (const row of release.sourceFiles) validateNativeValueDevPinnedBytesV5(row, bytes(row.path));
  inspectNativeValueDevMobileDependenciesV5();
  assert.deepEqual(validateNativeValueDevReleaseV5(NATIVE_VALUE_DEV_RELEASE_V5), release,
    'NATIVE_VALUE_DEV_PUBLICATION_CHANGED');
  const bundle = frozenInput({ ledger: loaded.ledger, verifiers: loaded.verifiers,
    provenance: { schema: release.schema, releaseSHA256: nativeValueDevDigestV5(release),
      sourceClosureSHA256: loaded.retained.sourceClosureSHA256,
      compilationSourceClosureSHA256: loaded.retained.sourceClosureSHA256,
      hostSourceClosureSHA256: release.hostSourceClosureSHA256,
      historicalReleaseSHA256: release.historicalReleaseSHA256,
      retainedMetadataSHA256: release.retainedMetadataSHA256,
      publicMobilePackagesSHA256: release.publicMobilePackagesSHA256,
      producedLedger: release.producedLedger, producedW39: release.producedW39, historicalArtifactRecovered: false,
      pc15WithdrawProofAcceptanceEstablished: false,
      toolchain: loaded.retained.toolchain, crs: loaded.retained.crs,
      claimsEnabled: false, proofAcceptanceEstablished: false, independentVKHashRecomputed: false,
      mobileNoteCustodyEstablished: false, nativeGraphAcceptanceEstablished: false } });
  issued.add(bundle); return bundle;
}

/** Pure/data inspection of actual Solc output before a new receipt is written.
 * The private loader validator is shared; this export cannot issue a brand. */
export function validateNativeValueDevLedgerCompilationV5(input) {
  assert.equal(arguments.length,1,'NATIVE_VALUE_DEV_LEDGER_VALIDATOR_NO_OPTIONS');
  const compilation=cloneInput(input),original=nativeValueDevRetainedMetadataV5();
  assert.equal(compilation.profile,'standard','NATIVE_VALUE_DEV_LEDGER_STANDARD_PROFILE');
  validateLedgerCompilation(compilation,original.ledger);
  return true;
}
/** Fixed new files only; no historical raw is fabricated, overwritten or chosen
 * by the caller. Actual AST/artifact/source/ABI/bytecode joins must all pass. */
export function inspectProducedNativeValueLedgerV5() {
  assert.equal(arguments.length,0,'NATIVE_VALUE_DEV_PRODUCED_LEDGER_NO_OPTIONS');
  const compiledBytes=bytes(NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5),compiledSHA256=sha(compiledBytes);
  const receiptBytes=bytes(NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5);
  const compilation=JSON.parse(compiledBytes),receipt=validateNativeValueDevLedgerReceiptV5(JSON.parse(receiptBytes),compiledSHA256);
  validateNativeValueDevLedgerCompilationV5(compilation);
  assert.deepEqual(receipt.compiler,compilation.compiler,'NATIVE_VALUE_DEV_LEDGER_COMPILER_JOIN');
  assert.equal(receipt.settingsSHA256,digest(compilation.settings),'NATIVE_VALUE_DEV_LEDGER_SETTINGS_JOIN');
  const sources=Object.fromEntries(NATIVE_VALUE_LEDGER_SOURCES.map(name=>[name,{content:bytes('contracts/'+name).toString('utf8')}]));
  assert.equal(receipt.inputSHA256,digest({language:'Solidity',sources,settings:compilation.settings}),'NATIVE_VALUE_DEV_LEDGER_FIXED_INPUT');
  const original=nativeValueDevRetainedMetadataV5().ledger;
  const result=validateNativeValueDevProducedLedgerDescriptorV5({kind:NATIVE_VALUE_DEV_LEDGER_KIND_V5,
    compiled:{path:NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5,sha256:compiledSHA256},
    receipt:{path:NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5,sha256:sha(receiptBytes)},
    historicalCompiled:original.compiled,historicalArtifactRecovered:false,settingsSHA256:original.settingsSHA256,
    componentPinsSHA256:digest({sources:original.sources,artifacts:original.artifacts})});
  pinned(result.compiled);pinned(result.receipt);return result;
}
