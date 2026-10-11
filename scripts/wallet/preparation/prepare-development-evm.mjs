/** Offline public build for a NEW local laboratory. Never creates historical
 * reports, root keys, nodes or witnesses. The deployment loader independently
 * checks the reviewed deterministic manifest and every source/key/artifact. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, GOLDEN, relation } from '../../../packages/proofs/src/catalog.mjs';
import { hash, regular, jsonBytes, resourceModuleURL, circuitIdentity, versionDirectory,
  loadCompiled, loadPrepared } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { compileSoliditySources } from '../../../packages/proofs/src/tooling/solidity-compiler.mjs';
import { FLAT_BUILD_PIN, FLAT_VERIFIER_ORDER } from '../../../packages/backend/src/operations/deployments/system/deployment-plan.mjs';
import { EVM_VAULT_ROUTER_BUILD_PIN } from '../../../packages/backend/src/operations/deployments/defi/deploy-evm-vault-router.mjs';
import { deriveGenericVerifierImmutables } from '../../../packages/engine/src/execution/local/local-deployment.mjs';
import { NATIVE_SOURCE_PINS } from '../../../packages/backend/src/execution/native/dispatch/native-deployment.mjs';
import { loadProofProfile } from '../../../packages/proofs/src/execution/proof-worker.mjs';

assert.equal(process.argv.length, 2, 'DEVELOPMENT_EVM_FIXED_INVOCATION');
assert.deepEqual(process.execArgv, [], 'DEVELOPMENT_EVM_NO_EXEC_ARGUMENTS');
const directory = join(ROOT, '.local/development-evm/v1');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const digest = value => hash(canonical(value));
function publish(path, bytes) {
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  if (existsSync(path)) assert.ok(regular(path).equals(Buffer.from(bytes)), 'DEVELOPMENT_EVM_EXISTING_BUILD_CHANGED');
  else writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  return hash(bytes);
}
function deterministic(compiled) {
  const { milliseconds, ...stable } = compiled;
  return stable;
}
function compileFixed(path, sourceMap, profile) {
  if (existsSync(path)) {
    const compiled = JSON.parse(regular(path));
    assert.equal(compiled.profile, profile);
    assert.deepEqual(compiled.sources, Object.keys(sourceMap).sort()
      .map(name => { const source=sourceMap[name]; return ({ name, sha256: source.sha256, bytes: Buffer.byteLength(source.content) }); }));
    return compiled;
  }
  const compiled = deterministic(compileSoliditySources(sourceMap, { profile }));
  publish(path, jsonBytes(compiled));
  return compiled;
}
const helpers = await import(resourceModuleURL);
const toolchain = helpers.verifyToolchain(), crs = helpers.verifyCRS();
const sourceMap = Object.fromEntries(Object.entries(FLAT_BUILD_PIN.sources).map(([name,[expected]]) => {
  const content = regular(join(ROOT,'contracts',name)).toString('utf8');
  assert.equal(hash(content),expected,'DEVELOPMENT_EVM_LEDGER_SOURCE_PIN');
  return [name,{content,sha256:expected}];
}));
const ledgerPath = join(directory,'ledger/compiled.json');
const ledger = compileFixed(ledgerPath,sourceMap,'standard');
for (const [name,[,expected]] of Object.entries(FLAT_BUILD_PIN.sources))
  assert.equal(digest(ledger.sourceASTs[name]),expected,'DEVELOPMENT_EVM_LEDGER_AST_PIN');
for (const [source,name,expected] of Object.values(FLAT_BUILD_PIN.artifacts))
  assert.equal(digest(ledger.contracts[source][name]),expected,'DEVELOPMENT_EVM_LEDGER_ARTIFACT_PIN');
const manifest = { format:'LIANUM_DEVELOPMENT_EVM_BUILD_V1',
  classification:'REBUILT_PUBLIC_ARTIFACTS_FOR_NEW_LOCAL_LAB_NOT_HISTORICAL_ACCEPTANCE',
  ledgerSHA256:hash(regular(ledgerPath)), toolchain, crs, contracts:[],
  nativeNodesStarted:false, proofGenerated:false, historicalReportsRecreated:false };
const legacyPaths = { deposit_balance:'experiments/private-core-proof/wallet-notes/.local/prepared/deposit_balance.sol',
  withdraw_balance:'experiments/private-core-proof/wallet-notes/.local/prepared/withdraw_balance.sol',
  withdraw:'evidence/m15-notes-proof/withdraw.sol' };
for (const [role,publicWords] of FLAT_VERIFIER_ORDER) {
  const name = role === 'withdraw' ? 'withdraw_output' : role;
  let sourceBytes,lineage;
  if (Object.hasOwn(legacyPaths,role)) {
    sourceBytes=regular(join(GOLDEN,legacyPaths[role]));
    assert.equal(hash(sourceBytes),NATIVE_SOURCE_PINS[role],'DEVELOPMENT_EVM_LEGACY_SOURCE_PIN');
    lineage={soliditySHA256:hash(sourceBytes),reuse:'EXACT_GOLDEN_V17_SOURCE'};
    if(role!=='withdraw') lineage={...lineage,...loadProofProfile(role).publicPins};
    else lineage.acceptanceReference='Retained source only; this new laboratory must establish its own proof acceptance';
  } else {
    const spec=relation(role),identity=circuitIdentity(spec,toolchain),sourceVersion=hash(JSON.stringify(identity));
    const context={spec,toolchain,identity,sourceVersion,directory:versionDirectory(spec,sourceVersion)};
    const compiled=await loadCompiled(context),prepared=await loadPrepared(context,compiled,crs);
    sourceBytes=prepared.solidity;
    lineage={sourceVersion,abiSHA256:hash(JSON.stringify(compiled.program.abi)),
      bytecodeSHA256:compiled.manifest.bytecodeSHA256,keySHA256:hash(prepared.key),
      soliditySHA256:hash(sourceBytes),keyBytes:prepared.key.length};
  }
  const filename=name+'.sol',roleDirectory=join(directory,'verifiers',name);
  publish(join(roleDirectory,filename),sourceBytes);
  const compiledPath=join(roleDirectory,'compiled.json');
  const compiled=compileFixed(compiledPath,{[filename]:{content:sourceBytes.toString('utf8'),sha256:hash(sourceBytes)}},'verifier');
  const ast=compiled.sourceASTs[filename],contracts=compiled.contracts[filename];
  const immutableNames={};
  function visit(value) {
    if (!value||typeof value!=='object') return;
    if(value.nodeType==='VariableDeclaration'&&value.mutability==='immutable') immutableNames[value.id]=value.name;
    for(const child of Object.values(value)) if(Array.isArray(child)) child.forEach(visit); else visit(child);
  }
  visit(ast);
  const row={relation:name,source:filename,publicWords,lineage,sourceSHA256:hash(sourceBytes),
    compiler:compiled.compiler,settings:compiled.settings,immutableNames,
    immutableValues:deriveGenericVerifierImmutables(ast,publicWords),
    artifacts:Object.entries(contracts).map(([name,item])=>({name,
      runtimeBytes:item.evm.deployedBytecode.object.length/2,creationBytes:item.evm.bytecode.object.length/2,
      runtimeHexTemplateSHA256:hash(item.evm.deployedBytecode.object),links:item.evm.bytecode.linkReferences})),
    compiledSHA256:hash(regular(compiledPath))};
  assert.ok(row.artifacts.every(item=>item.runtimeBytes<=24576&&item.creationBytes<=49152),'DEVELOPMENT_EVM_SIZE_LIMIT');
  publish(join(roleDirectory,'manifest.json'),jsonBytes(row));
  manifest.contracts.push(row);
  console.log(JSON.stringify({prepared:role,keySHA256:lineage.keySHA256??null}));
}
const pin=EVM_VAULT_ROUTER_BUILD_PIN,source=regular(join(ROOT,'contracts/fixtures',pin.source));
assert.equal(hash(source),pin.sourceSHA256,'DEVELOPMENT_EVM_ROUTER_SOURCE_PIN');
const routerDirectory=join(directory,'router');
const router=compileFixed(join(routerDirectory,'compiled.json'),{[pin.source]:{content:source.toString('utf8'),sha256:hash(source)}},'standard');
assert.equal(digest(router.sourceASTs[pin.source]),pin.sourceASTSHA256,'DEVELOPMENT_EVM_ROUTER_AST_PIN');
assert.equal(digest(router.contracts[pin.source][pin.contract]),pin.artifactSHA256,'DEVELOPMENT_EVM_ROUTER_ARTIFACT_PIN');
manifest.routerSHA256=hash(regular(join(routerDirectory,'compiled.json')));
const manifestSHA256=publish(join(directory,'manifest.json'),jsonBytes(manifest));
console.log(JSON.stringify({directory,manifestSHA256,ledgerSHA256:manifest.ledgerSHA256,
  routerSHA256:manifest.routerSHA256,nativeNodesStarted:false,proofGenerated:false,historicalReportsRecreated:false}));

// Check the independently reviewed release before any lab may deploy it.
const { loadFlatDeploymentArtifacts } = await import('../../../packages/backend/src/operations/deployments/system/deployment-artifacts.mjs');
const { loadEvmVaultRouterDeploymentArtifacts } = await import('../../../packages/backend/src/operations/deployments/defi/deploy-evm-vault-router.mjs');
const verified=await loadFlatDeploymentArtifacts();
loadEvmVaultRouterDeploymentArtifacts();
console.log(JSON.stringify({reviewed:true,verifiers:Object.keys(verified.verifiers).length,classification:verified.provenance.classification}));
