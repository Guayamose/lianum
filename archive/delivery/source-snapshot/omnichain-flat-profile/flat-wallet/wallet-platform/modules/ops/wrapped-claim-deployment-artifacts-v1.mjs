import { inspectWrappedInstallationSourcesV2 } from '../../../integration/wrapped-installation-source-inspector-v2.mjs';
/** Read-only fixed-release loader. It cannot compile, prove, start a node, accept
 * caller paths/pins, or mint system ownership. A private bundle brand is issued
 * only after every fixed file, ABI, source, program, key and artifact join passes. */
import assert from 'node:assert/strict';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ROOT, FLAT, GOLDEN, CANDIDATE, relation, NOIR_VERSION, SETTINGS } from '../../../proof-workers/catalog.mjs';
import { assertABI, circuitIdentity, loadCompiled, loadPrepared, versionDirectory } from '../../../proof-workers/tooling.mjs';
import { NATIVE_VALUE_ADMISSION_SPEC, NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256, assertNativeValueCompiledIdentity } from '../../../proof-workers/native-value-v2-profile.mjs';
import { loadProofProfile } from '../../../../../omnichain-product/src/paeg/proof-worker.mjs';
import { GENERIC_COMPILER_PIN, deriveGenericVerifierImmutables } from '../../../../../omnichain-product/src/paeg/local-deployment.mjs';
import { exactRecord, fixedArray } from '../paeg/commitments.mjs';
import { frozenInput, cloneInput } from '../paeg/readiness-inputs.mjs';
import { NATIVE_VALUE_WALLET_HOST_SOURCE_PINS_V4 as NATIVE_VALUE_HOST_SOURCE_PINS } from './native-value-wallet-host-source-pins-v4.mjs';
import { verifyToolchain, verifyCRS } from '../../../../../omnichain-product/experiments/private-core-proof/wallet-notes/resources.mjs';
import { NATIVE_VALUE_SOURCE_CLOSURE } from './native-value-wallet-release-v4.mjs';
import { WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1, WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1,
  WRAPPED_CLAIM_RELEASE_SCHEMA_V1, WRAPPED_CLAIM_REQUIRED_ARTIFACTS_V1 } from './wrapped-claim-release-v1.mjs';
import { loadWrappedClaimProofArtifactsV1, assertWrappedClaimProofArtifactsV1 } from './wrapped-claim-proof-artifacts-v1.mjs';
const issued = new WeakSet();
const ADMISSION_PREPARED_ROOT = resolve(ROOT, '../../drafts/native-value-verifier-preparation');
const ADMISSION_COMPILE_ROOT = resolve(ROOT, '../../drafts/generic-native-admission-compile');
const ADMISSION_READER_PIN = Object.freeze({path:'admission-prepared/read-native-value-artifacts.mjs',sha256:'5e1ea4272221d8790a93bb1ab4c0399c1a475bfc23ea87a1676cd7202549ef63'});
const ADMISSION_DRIVER_PIN = Object.freeze({path:'admission-prepared/driver-source-manifest.json',sha256:'09ffe3beb3a3024e65f36aeaa4b80d32e6a2a43a31d20e3f7bb63ea54e091d3e'});
const sha = b => createHash('sha256').update(b).digest('hex');
export const WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1 = frozenInput([
  ['authorization',16],['reservation',58],['dependency',42],['ready',50],['admission',84],['node',32],
  ['settlement',138],['recovery',41],['deposit_balance',26],['withdraw_balance',39],['withdraw',39],['deposit_intent',27],
]);
export const WRAPPED_CLAIM_LEDGER_ROLES_V1 = frozenInput({
  hub:['wrapped-claim-v1/PrivateFlatReceiptHubWrappedClaimV1.sol','PrivateFlatReceiptHubWrappedClaimV1'],
  pool:['PrivateFlatAssetNotePool.sol','PrivateFlatAssetNotePool'],
  poseidon2Domains:['crypto/Poseidon2Domains.sol','Poseidon2Domains'],hubCodec:['FlatHubCodec.sol','FlatHubCodec'],
});
export const WRAPPED_CLAIM_LEDGER_SOURCES_V1 = Object.freeze(['FlatHubCodec.sol','FlatVerifierSet.sol',
  'PrivateFlatAssetNotePool.sol','crypto/Poseidon2.sol','crypto/Poseidon2Domains.sol',
  'native-value-v2/FlatNativeValueRegistryV2.sol','wrapped-claim-v1/PrivateFlatReceiptHubWrappedClaimV1.sol']);
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v)
  ? '['+v.map(canonical).join(',')+']' : '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest = v => sha(canonical(v));
function hash(h) { assert.match(h,/^[0-9a-f]{64}$/,'NATIVE_VALUE_ARTIFACT_HASH'); return h; }
function bytes(path, maximum = 128*1024*1024) {
  // Resolve only fixed release entries under the installed wallet; reject every
  // symlink component, traversal, absolute path and oversized artifact.
  assert.equal(typeof path,'string'); assert.ok(path.length && !path.startsWith('/') && !path.split('/').some(p=>!p||p==='.'||p==='..'),'NATIVE_VALUE_ARTIFACT_PATH');
  const roots=[['golden/',GOLDEN],['candidate/',CANDIDATE],['flat/',FLAT],['admission-prepared/',ADMISSION_PREPARED_ROOT],['admission-compile/',ADMISSION_COMPILE_ROOT]];
  const selected=roots.find(([prefix])=>path.startsWith(prefix));let p=selected?.[1]??ROOT;const parts=(selected?path.slice(selected[0].length):path).split('/'); for (const part of parts) { p=join(p,part); assert.ok(!lstatSync(p).isSymbolicLink(),'NATIVE_VALUE_ARTIFACT_SYMLINK'); }
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
function loadLedger(release) {
  const pin=release.ledger;exactRecord(pin,['compiled','settingsSHA256','sources','artifacts']);
  const compilation=json(pin.compiled);compiler(compilation,pin.settingsSHA256);
  exactRecord(pin.sources,WRAPPED_CLAIM_LEDGER_SOURCES_V1);exactRecord(compilation.sourceASTs,WRAPPED_CLAIM_LEDGER_SOURCES_V1);
  fixedArray(compilation.sources,WRAPPED_CLAIM_LEDGER_SOURCES_V1.length);const sourceMap={};
  for(const name of WRAPPED_CLAIM_LEDGER_SOURCES_V1) {
    const p=pin.sources[name];exactRecord(p,['sourceSHA256','astSHA256']);const b=bytes('contracts/'+name);
    assert.equal(sha(b),hash(p.sourceSHA256),'NATIVE_VALUE_ARTIFACT_LEDGER_SOURCE');
    assert.deepEqual(compilation.sources.filter(r=>r.name===name),[{name,sha256:p.sourceSHA256,bytes:b.length}],'NATIVE_VALUE_ARTIFACT_LEDGER_RECORD');
    assert.equal(digest(compilation.sourceASTs[name]),hash(p.astSHA256),'NATIVE_VALUE_ARTIFACT_AST');
    assert.equal(compilation.sourceASTs[name].absolutePath,name);sourceMap[name]={content:b.toString(),sha256:p.sourceSHA256};
  }
  exactRecord(pin.artifacts,Object.keys(WRAPPED_CLAIM_LEDGER_ROLES_V1));const artifacts={},immutableNames={};
  for(const [role,[source,name]]of Object.entries(WRAPPED_CLAIM_LEDGER_ROLES_V1)) {
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

async function loadVerifier(pin,role,words,release) {
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
    const compiled=role==='admission'?fixed.compiled:await loadCompiled(context);
    const prepared=role==='admission'?fixed.prepared:await loadPrepared(context,compiled,release.crs);
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
export const WRAPPED_CLAIM_VERIFIER_ORDER_V1 = frozenInput([
  ...WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1, ['CI51', 51], ['CO42', 42],
]);
const CLAIM_CONTRACT_ROLES = Object.freeze({
  nativeClaimCodec:['native-claims/NativeClaimCodec.sol','NativeClaimCodec'],
  nativeClaimValidation:['native-claims/NativeClaimValidation.sol','NativeClaimValidation'],
  token:['native-claims/NativeClaimToken.sol','NativeClaimToken'],
  gateway:['native-claims/NativeClaimGateway.sol','NativeClaimGateway'],
  authority:['native-claims/NativeClaimAuthority.sol','NativeClaimAuthority'],
});
const CLAIM_CONTRACT_SOURCES = Object.freeze(['FlatHubCodec.sol','FlatVerifierSet.sol',
  'crypto/Poseidon2.sol','crypto/Poseidon2Domains.sol',
  ...['Codec','Validation','Token','Gateway','Authority','Interfaces','Types','VerifierSet'].map(name=>'native-claims/NativeClaim'+name+'.sol')]);
function loadClaimContracts(pin) {
  exactRecord(pin,['compiled','settingsSHA256','sources','artifacts']);
  const compilation=json(pin.compiled);compiler(compilation,pin.settingsSHA256);
  exactRecord(pin.sources,CLAIM_CONTRACT_SOURCES);exactRecord(compilation.sourceASTs,CLAIM_CONTRACT_SOURCES);
  fixedArray(compilation.sources,CLAIM_CONTRACT_SOURCES.length);const sourceMap={};
  for(const name of CLAIM_CONTRACT_SOURCES) {
    const p=pin.sources[name];exactRecord(p,['sourceSHA256','astSHA256']);const b=bytes('contracts/'+name);
    assert.equal(sha(b),hash(p.sourceSHA256),'WRAPPED_CLAIM_CURRENT_CONTRACT_SOURCE');
    assert.deepEqual(compilation.sources.filter(r=>r.name===name),[{name,sha256:p.sourceSHA256,bytes:b.length}]);
    assert.equal(digest(compilation.sourceASTs[name]),hash(p.astSHA256),'WRAPPED_CLAIM_CONTRACT_AST');
    assert.equal(compilation.sourceASTs[name].absolutePath,name);sourceMap[name]={content:b.toString(),sha256:p.sourceSHA256};
  }
  exactRecord(pin.artifacts,Object.keys(CLAIM_CONTRACT_ROLES));const artifacts={};
  for(const [role,[source,name]] of Object.entries(CLAIM_CONTRACT_ROLES)) {
    const artifact=compilation.contracts[source]?.[name];assert.ok(artifact);size(artifact);
    contract(compilation.sourceASTs[source],name,role.startsWith('nativeClaim')?'library':'contract');
    assert.deepEqual(artifact.evm.deployedBytecode.immutableReferences,{},'WRAPPED_CLAIM_STORAGE_ONLY_CONTRACT');
    assert.equal(digest(artifact),hash(pin.artifacts[role]),'WRAPPED_CLAIM_EXACT_CONTRACT_ARTIFACT');artifacts[role]=artifact;
  }
  return {compilation,sourceMap,artifacts,provenance:{compiledSHA256:pin.compiled.sha256,
    classification:'SOURCE_COMPILER_RUNTIME_PINS_NOT_DEPLOYMENT'}};
}
// The literal reviewed release must cover every prior host source plus all
// newly executable combined-host modules. There is no caller source table.
const REQUIRED_COMBINED_FILES = Object.freeze([
  'ops/wrapped-claim-system-v1.mjs','ops/wrapped-claim-deployment-plan-v1.mjs',
  'ops/wrapped-claim-graph-plan-v1.mjs','ops/wrapped-claim-deployment-checks-v1.mjs',
  'ops/wrapped-claim-deployment-artifacts-v1.mjs','ops/wrapped-claim-custody-bootstrap-v1.mjs',
  'ops/wrapped-claim-proof-artifacts-v1.mjs','ops/wrapped-claim-operator-bootstrap-v1.mjs',
  'ops/wrapped-claim-graph-operators-v1.mjs','ops/wrapped-claim-graph-inventory-v1.mjs',
  'ops/wrapped-claim-combined-operators-v1.mjs','ops/shared-custody-allocation-v1.mjs',
  'paeg/wrapped-claim-system-state-v1.mjs','native-claims/wrapped-owned-state-v1.mjs',
  'native-claims/registry-envelope-v2.mjs','native-claims/inputs-registry-v2.mjs',
  'native-claims/inputs-nonce-registry-v3.mjs','native-claims/current-custody-audit-v2.mjs',
  'native-claims/facts-collector-registry-v2.mjs','native-claims/operational-registration-v2.mjs',
  'native-claims/wrapped-operators-v1.mjs','native-claims/wrapped-controller-v1.mjs',
  'native-claims/wrapped-controller-journal-v1.mjs','native-claims/wrapped-ingress-deployment-v1.mjs',
  'native-claims/wrapped-evm-dispatch-gate-v1.mjs',
].map(name=>'wallet-platform/modules/'+name));
function sourceAbsolute(path) {
  const roots=[['golden/',GOLDEN],['candidate/',CANDIDATE],['flat/',FLAT],['admission-prepared/',ADMISSION_PREPARED_ROOT],['admission-compile/',ADMISSION_COMPILE_ROOT]];
  const selected=roots.find(([prefix])=>path.startsWith(prefix));
  return resolve(selected?.[1]??ROOT,selected?path.slice(selected[0].length):path);
}
const WRAPPED_DEPLOYMENT_SOURCE_BOUNDARIES_V2 = Object.freeze([
  "proof-workers/native-value-wallet-role-source-pins-v4.mjs",
  "proof-workers/native-value-wallet-role-release-v4.mjs",
  "integration/native-wallet-real-release-v4.mjs",
  "wallet-platform/modules/ops/wrapped-claim-release-v1.mjs",
  "wallet-platform/modules/ops/wrapped-wallet-release-v1.mjs",
  "wallet-platform/modules/ops/native-value-wallet-host-source-pins-v4.mjs",
  "wallet-platform/modules/ops/native-value-wallet-release-v4.mjs",
  "integration/wrapped-installation-source-inspector-v2.mjs"
]);
function completeSources(entries) {
  inspectWrappedInstallationSourcesV2();
  const anchors=new Set(WRAPPED_DEPLOYMENT_SOURCE_BOUNDARIES_V2.map(sourceAbsolute));
  assert.ok(Array.isArray(entries)&&entries.length>0);fixedArray(entries,entries.length);
  const paths=new Set(entries.map(row=>{exactRecord(row,['path','sha256']);hash(row.sha256);assert.ok(!anchors.has(sourceAbsolute(row.path)),'WRAPPED_DEPLOYMENT_BOUNDARY_IN_INNER_ROWS');assert.ok(!['proof-workers/native-value-wallet-role-source-pins-v4.mjs','proof-workers/native-value-wallet-role-release-v4.mjs'].map(sourceAbsolute).includes(sourceAbsolute(row.path)),'WRAPPED_DEPLOYMENT_DEFERRED_NATIVE_ROLE_ROW');return row.path;}));
  assert.equal(paths.size,entries.length,'WRAPPED_CLAIM_DUPLICATE_HOST_PIN');
  for(const path of [...NATIVE_VALUE_HOST_SOURCE_PINS.map(row=>row.path),...REQUIRED_COMBINED_FILES,
    ...['wrapped-claim-worker-v1.mjs','wrapped-claim-run-bounded-v1.mjs','wrapped-claim-profile-v1.mjs',
      'wrapped-claim-role-process-v1.mjs','wrapped-claim-client-v1.mjs','wrapped-claim-tooling-v1.mjs',
      'wrapped-claim-constraint-batches-v1.json','wrapped-claim-abi-source-v1.json'].map(name=>'proof-workers/'+name)])
    if(!anchors.has(sourceAbsolute(path)))assert.ok(paths.has(path),'WRAPPED_CLAIM_COMPLETE_HOST_SOURCE_'+path);
  const covered=new Map(entries.map(entry=>[sourceAbsolute(entry.path),entry]));
  assert.equal(covered.size,entries.length,'WRAPPED_CLAIM_SOURCE_ALIAS');
  for(const entry of entries)pinned(entry);
  // Follow every literal static/dynamic local import from the new executable
  // entrypoints. Four payload anchors are bound by the outer manifest; the
  // one root-bearing bootstrap is independently installed outside that manifest.
  const seen=new Set();
  function visit(path) {
    path=resolve(path);if(anchors.has(path)||seen.has(path))return;seen.add(path);
    const entry=covered.get(path);assert.ok(entry,'WRAPPED_CLAIM_UNPINNED_IMPORT_'+path);
    const content=pinned(entry).toString('utf8');
    if(!path.endsWith('.mjs'))return;
    for(const match of content.matchAll(/(?:\bfrom\s+|^\s*import\s+|\bimport\s*\(\s*)(['"])([^'"]+)\1/gm)) {
      const specifier=match[2];if(specifier.startsWith('node:'))continue;
      // This pre-existing proof helper is not imported by deployment. Its two
      // fixed vendor dependencies are independently covered by the original
      // toolchain/API/vendor audit authenticated by the wrapped proof loader.
      if(path===resolve(GOLDEN,'experiments/private-core-proof/wallet-notes/prover.mjs')
        && ['@noir-lang/noir_js','@aztec/bb.js'].includes(specifier))continue;
      assert.ok(specifier.startsWith('.'),'WRAPPED_CLAIM_FIXED_LOCAL_IMPORT');
      visit(resolve(dirname(path),specifier));
    }
  }
  for(const path of REQUIRED_COMBINED_FILES)visit(sourceAbsolute(path));
}
export function assertWrappedClaimDeploymentArtifactsV1(bundle) {
  inspectWrappedInstallationSourcesV2();
  assert.ok(issued.has(bundle),'WRAPPED_CLAIM_ORIGINAL_DEPLOYMENT_ARTIFACTS_REQUIRED');
}
export async function loadWrappedClaimDeploymentArtifactsV1() {
  assert.equal(arguments.length,0,'WRAPPED_CLAIM_DEPLOYMENT_ARTIFACT_NO_OPTIONS');inspectWrappedInstallationSourcesV2();
  if(WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1===null || WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1===null)
    throw Object.assign(new Error('WRAPPED_CLAIM_ACTIVATION_ARTIFACTS_ABSENT'),{
      code:'WRAPPED_CLAIM_ACTIVATION_ARTIFACTS_ABSENT',blockers:WRAPPED_CLAIM_REQUIRED_ARTIFACTS_V1});
  const release=cloneInput(WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1), operational=cloneInput(WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1);
  exactRecord(release,['schema','sourceClosureSHA256','sourceFiles','toolchain','crs','ledger','contracts','verifiers','proofReleaseSHA256']);
  exactRecord(operational,['schema','sourceClosureSHA256','deploymentReleaseSHA256','proofReleaseSHA256']);
  assert.equal(release.schema,WRAPPED_CLAIM_RELEASE_SCHEMA_V1);assert.equal(operational.schema,release.schema);
  assert.equal(digest(release),hash(operational.deploymentReleaseSHA256),'WRAPPED_CLAIM_OPERATIONAL_DEPLOYMENT_JOIN');
  assert.equal(release.proofReleaseSHA256,hash(operational.proofReleaseSHA256),'WRAPPED_CLAIM_OPERATIONAL_PROOF_JOIN');
  assert.equal(digest(release.sourceFiles),hash(release.sourceClosureSHA256),'WRAPPED_CLAIM_COMPLETE_SOURCE_DIGEST');
  assert.equal(release.sourceClosureSHA256,hash(operational.sourceClosureSHA256));completeSources(release.sourceFiles);
  assert.deepEqual(verifyToolchain(),release.toolchain,'WRAPPED_CLAIM_TOOLCHAIN');
  assert.deepEqual(verifyCRS(),release.crs,'WRAPPED_CLAIM_CRS');
  const ledger=loadLedger(release),contracts=loadClaimContracts(release.contracts);
  // Shared Solidity dependencies must be literally the same source bytes and AST
  // payload, preventing graph and custody compilation disagreement.
  for(const name of Object.keys(ledger.sourceMap).filter(name=>Object.hasOwn(contracts.sourceMap,name)))
    assert.deepEqual(ledger.sourceMap[name],contracts.sourceMap[name],'WRAPPED_CLAIM_SHARED_CONTRACT_SOURCE');
  exactRecord(release.verifiers,WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1.map(([r])=>r));const verifiers={};
  for(const [role,words] of WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1)
    verifiers[role]=await loadVerifier(release.verifiers[role],role,words,release);
  const proof=await loadWrappedClaimProofArtifactsV1();assertWrappedClaimProofArtifactsV1(proof);
  assert.equal(proof.proofReleaseSHA256,release.proofReleaseSHA256,'WRAPPED_CLAIM_ORIGINAL_PROOF_RELEASE');
  assert.deepEqual(proof.toolchain,release.toolchain,'WRAPPED_CLAIM_ALL14_SAME_TOOLCHAIN');
  assert.deepEqual(proof.crs,release.crs,'WRAPPED_CLAIM_ALL14_SAME_CRS');
  exactRecord(proof.verifiers,['CI51','CO42']);
  for(const role of ['CI51','CO42']) {
    const {sourceBytes,...entry}=proof.verifiers[role];verifiers[role]=entry;
    assert.equal(entry.lineage.publicWords,role==='CI51'?51:42,'WRAPPED_CLAIM_EXACT_CLAIM_WIDTH');
  }
  exactRecord(verifiers,WRAPPED_CLAIM_VERIFIER_ORDER_V1.map(([r])=>r));
  completeSources(release.sourceFiles);
  assert.deepEqual(verifyToolchain(),release.toolchain,'WRAPPED_CLAIM_TOOLCHAIN_CHANGED');
  assert.deepEqual(verifyCRS(),release.crs,'WRAPPED_CLAIM_CRS_CHANGED');
  const bundle=frozenInput({ledger,contracts,verifiers,provenance:{schema:release.schema,
    releaseSHA256:digest(release),sourceClosureSHA256:release.sourceClosureSHA256,
    proofReleaseSHA256:proof.proofReleaseSHA256,toolchain:release.toolchain,crs:release.crs,
    claimsEnabled:true,graphPublicWords:84,proofAcceptanceEstablished:false,independentVKHashRecomputed:false}});
  inspectWrappedInstallationSourcesV2();issued.add(bundle);return bundle;
}
