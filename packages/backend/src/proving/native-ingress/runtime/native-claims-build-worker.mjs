/** Owned public build worker: only original public circuits and a fresh lab build. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { catalog, tools, v3, compiler, engine, helpers, DIRECTORY, STEPS, parse, write, publish,
  replace, fingerprint, co42Artifacts, publicProgramSHA256, reusePriorV3, RETAINED_CONTRACTS, RETAINED_CONTRACTS_SHA }
  from '../tooling/native-claims-build-common.mjs';
for (const name of ['log','info','warn','error','debug','trace']) console[name] = () => {};
globalThis.fetch = async () => { throw Error('NATIVE_REBUILD_OFFLINE_REQUIRED'); };
assert.equal(process.argv.length, 4); assert.deepEqual(process.execArgv, []);
assert.deepEqual(Object.keys(process.env).sort(), ['LANG','PATH']);
assert.equal(process.env.LANG,'C.UTF-8'); assert.equal(process.env.PATH,'/usr/bin:/bin');
const [step, runId] = process.argv.slice(2); assert.ok(STEPS.includes(step)); tools.assertID(runId);
const attempt = join(DIRECTORY, 'attempts', runId), lockPath = join(catalog.LOCAL,'active.lock');
const lock = parse(lockPath); assert.equal(lock.pid, process.ppid); assert.equal(lock.runId,runId);
assert.equal(lock.mode,step); assert.equal(lock.relation,'development_native_claims_v1');
const parentArgs = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
assert.equal(parentArgs.length,2);
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parentArgs[1])),
  join(catalog.ROOT,'scripts/prepare-development-native-claims.mjs'));
assert.equal(realpathSync(`/proc/${process.ppid}/exe`),realpathSync(process.execPath));
assert.equal(realpathSync(process.cwd()),catalog.ROOT);
assert.equal(typeof process.send,'function','NATIVE_REBUILD_PARENT_LIVENESS_CHANNEL');
const pins = parse(join(attempt,'pins.json'));
const report = { format:'LIANUM_DEVELOPMENT_NATIVE_CLAIMS_BUILD_ATTEMPT_V1', step, runId,
  phase:'starting', limits:catalog.LIMITS, settings:catalog.SETTINGS,
  pinsSHA256:tools.hash(tools.regular(join(attempt,'pins.json'))),
  historicalReportsRecreated:false, nativeNodesStarted:false, witnessPersisted:false,
  proofGenerated:false, keyGenerated:false, backendDestroyed:false };
const save = () => replace(join(attempt,'result.json'),report);
process.once('disconnect',()=>{if(report.phase==='completed')return;report.phase='failed';
  report.errorCode='NATIVE_REBUILD_PARENT_DISCONNECTED';try{save();}finally{process.exit(1);}});
const phase = value => { report.phase=value; save(); };
let backend;
const roleDirectory = join(DIRECTORY,'verifiers',v3.NATIVE_INGRESS_V3_SPEC.name);
const compiledPath = join(roleDirectory,'compiled-manifest.json');
const readCompiled = () => {
  const manifest = parse(compiledPath), programBytes=tools.regular(join(roleDirectory,'program.json'));
  assert.deepEqual(manifest.identity,pins.identities.CI51);
  assert.equal(manifest.sourceVersion,v3.NATIVE_INGRESS_V3_SOURCE_VERSION);
  assert.equal(tools.hash(programBytes),manifest.programSHA256);
  const program=JSON.parse(programBytes);tools.assertABI(catalog.CATALOG.native_claim_ingress,program);
  const compressed=Buffer.from(program.bytecode,'base64');assert.equal(compressed.toString('base64'),program.bytecode);
  assert.equal(tools.hash(compressed),manifest.bytecodeSHA256);assert.ok(compressed[0]===31&&compressed[1]===139);
  assert.equal(tools.hash(JSON.stringify(program.abi)),manifest.abiSHA256);
  return {manifest,program,compressed};
};
const canonical = value => value===null||typeof value!=='object'?JSON.stringify(value)
  :Array.isArray(value)?'['+value.map(canonical).join(',')+']'
    :'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
async function initialize() {
  const bb=await tools.loadPinned('@aztec/bb.js');
  backend=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,
    memory:{initial:37,maximum:catalog.MEMORY.standard}});
  return bb;
}
async function destroy() { if(backend){const owned=backend;backend=undefined;await owned.destroy();}report.backendDestroyed=true; }
function compileVerifier(name,bytes,sourceVersion,keySHA256,keyHashField,publicWords,lineage) {
  const source=name+'.sol',directory=join(DIRECTORY,'verifiers',name);
  publish(join(directory,'verifier.sol'),bytes);
  const path=join(directory,'compiled-solidity.json'); let compiled;
  if(existsSync(path)) compiled=parse(path);
  else { const {milliseconds,...stable}=compiler.compileSoliditySources({[source]:{content:bytes.toString('utf8'),sha256:tools.hash(bytes)}},{profile:'verifier'});compiled=stable;write(path,compiled); }
  assert.deepEqual(compiled.sources,[{name:source,sha256:tools.hash(bytes),bytes:bytes.length}]);
  return {compiled,source,directory,lineage,sourceVersion,keySHA256,keyHashField,publicWords};
}
try {
  save();assert.deepEqual(await fingerprint(),pins,'NATIVE_REBUILD_INITIAL_PINS_CHANGED');
  if(step==='compile-v3') {
    reusePriorV3();
    if(existsSync(compiledPath)) readCompiled();
    else {
      phase('compiling-original-v3');
      const noir=await tools.loadPinned('@noir-lang/noir_wasm');
      const {program}=await noir.compile(noir.createFileManager(v3.NATIVE_INGRESS_V3_SPEC.circuit),undefined,()=>{});
      tools.assertABI(catalog.CATALOG.native_claim_ingress,program);
      const bytes=tools.jsonBytes(program),compressed=Buffer.from(program.bytecode,'base64');
      assert.equal(compressed.toString('base64'),program.bytecode);assert.ok(compressed[0]===31&&compressed[1]===139);
      publish(join(roleDirectory,'program.json'),bytes);
      write(compiledPath,{format:'LIANUM_DEVELOPMENT_NATIVE_CLAIMS_COMPILED_V1',
        relation:v3.NATIVE_INGRESS_V3_SPEC.name,sourceVersion:v3.NATIVE_INGRESS_V3_SOURCE_VERSION,
        identity:pins.identities.CI51,programSHA256:tools.hash(bytes),bytecodeSHA256:tools.hash(compressed),
        abiSHA256:tools.hash(JSON.stringify(program.abi)),proofGenerated:false});
    }
    report.compiledManifestSHA256=tools.hash(tools.regular(compiledPath));
  } else if(step==='prepare-v3') {
    const compiled=readCompiled(),keyPath=join(roleDirectory,'key.vk');
    if(existsSync(keyPath)) {
      const manifest=parse(join(roleDirectory,'key-manifest.json'));
      assert.equal(tools.hash(tools.regular(keyPath)),v3.NATIVE_INGRESS_V3_KEY_SHA256);
      assert.equal(manifest.compiledManifestSHA256,tools.hash(tools.regular(compiledPath)));
      assert.deepEqual(manifest.identity,pins.identities.CI51);assert.deepEqual(manifest.crs,pins.crs);
      tools.assertKeyBytes(catalog.CATALOG.native_claim_ingress,tools.regular(keyPath),tools.assertStats(manifest.stats));
      assert.equal(tools.hash(tools.regular(join(roleDirectory,'verifier.sol'))),manifest.soliditySHA256);
      report.reused=true;
    } else {
      phase('initializing-single-wasm');await initialize();
      const circuit={name:v3.NATIVE_INGRESS_V3_SPEC.name,bytecode:gunzipSync(compiled.compressed),verificationKey:new Uint8Array()};
      phase('measuring-actual-stats');
      const result=await backend.circuitStats({circuit,includeGatesPerOpcode:false,settings:catalog.SETTINGS});
      const stats={numGates:result.numGates,numGatesDyadic:result.numGatesDyadic,numAcirOpcodes:result.numAcirOpcodes};
      assert.equal(tools.assertStats(stats),1048576,'NATIVE_REBUILD_V3_ORIGINAL_DYADIC');
      write(join(roleDirectory,'statistics.json'),stats);report.stats=stats;save();
      phase('initializing-original-full-crs');
      assert.deepEqual(helpers.verifyCRS(),pins.crs);
      await backend.srsInitSrs({pointsBuf:tools.regular(helpers.CRS+'bn254_g1_compressed.dat'),
        numPoints:catalog.LIMITS.provingCRSPoints,g2Point:tools.regular(helpers.CRS+'bn254_g2.dat')});
      phase('generating-original-vk');
      const generated=await backend.circuitComputeVk({circuit,settings:catalog.SETTINGS}),key=Buffer.from(generated.bytes);
      report.keyGenerated=true;tools.assertKeyBytes(catalog.CATALOG.native_claim_ingress,key,1048576);
      assert.equal(tools.hash(key),v3.NATIVE_INGRESS_V3_KEY_SHA256,'NATIVE_REBUILD_ORIGINAL_KEY_MATCH');
      assert.equal(generated.hash.length,32);
      const keyHashField=tools.canonicalKeyHash(BigInt('0x'+Buffer.from(generated.hash).toString('hex')).toString());
      phase('generating-genuine-solidity');
      const solidity=(await backend.circuitWriteSolidityVerifier({verificationKey:key,settings:catalog.SETTINGS})).solidityCode;
      assert.equal(typeof solidity,'string');assert.ok(solidity.includes('contract HonkVerifier'));
      assert.match(solidity,/NUMBER_OF_PUBLIC_INPUTS\s*=\s*59;/);
      await destroy();assert.deepEqual(await fingerprint(),pins,'NATIVE_REBUILD_PINS_CHANGED_AFTER_KEY');
      publish(keyPath,key);publish(join(roleDirectory,'verifier.sol'),solidity);
      write(join(roleDirectory,'key-manifest.json'),{format:'LIANUM_DEVELOPMENT_NATIVE_CLAIMS_KEY_V1',
        identity:pins.identities.CI51,sourceVersion:v3.NATIVE_INGRESS_V3_SOURCE_VERSION,
        compiledManifestSHA256:tools.hash(tools.regular(compiledPath)),settings:catalog.SETTINGS,crs:pins.crs,
        stats,keySHA256:tools.hash(key),keyBytes:key.length,keyHashField,publicWords:51,
        actualKeyPublicCount:59,maximumPages:catalog.MEMORY.standard,threads:1,proofGenerated:false,
        soliditySHA256:tools.hash(solidity),solidityBytes:Buffer.byteLength(solidity)});
    }
    report.keySHA256=v3.NATIVE_INGRESS_V3_KEY_SHA256;
  } else if(step==='constraints') {
    const ci51=readCompiled(),co42=await co42Artifacts();phase('initializing-fixture-poseidon');
    await initialize();
    const fixtureModule=await import('../tooling/qualification-cases.mjs');
    const hashFields=async fields=>Buffer.from((await backend.poseidon2Hash({inputs:fields.map(value=>Buffer.from(value.toString(16).padStart(64,'0'),'hex'))})).hash).toString('hex');
    const fixture=await fixtureModule.buildSyntheticGenericIngressV3Fixture({hashFields,
      abis:{native_claim_ingress_v3:ci51.program.abi,native_claim_discharge:co42.compiled.program.abi}});
    assert.equal(fixture.cases.length,40);assert.equal(fixture.cases.filter(c=>c.expected).length,7);
    const {Noir}=await tools.loadPinned('@noir-lang/noir_js'),runners={native_claim_ingress_v3:new Noir(ci51.program),native_claim_discharge:new Noir(co42.compiled.program)};
    report.cases=[];
    for(const item of fixture.cases) {
      phase('checking-original-constraint-'+item.name);let accepted=false;
      try { const output=await runners[item.relation].execute(item.inputs);output.witness.fill(0);accepted=true; }
      catch(error){assert.match(String(error.message),/Cannot satisfy constraint|Unsatisfied constraint|Assertion failed|assertion failed|Failed to solve blackbox|BlackBoxFunctionFailed/,'NATIVE_REBUILD_CONSTRAINT_RUNTIME_FAILURE');}
      report.cases.push({name:item.name,relation:item.relation,expected:item.expected,accepted});save();
      assert.equal(accepted,item.expected,'NATIVE_REBUILD_CONSTRAINT_RESULT');
    }
    await destroy();write(join(DIRECTORY,'constraint-validation.json'),{format:'LIANUM_DEVELOPMENT_NATIVE_CLAIMS_CONSTRAINTS_V1',cases:report.cases,
      actualConstraintExecution:true,proofGenerated:false,witnessPersisted:false,historicalReportsRecreated:false});
  } else {
    phase('validating-retained-contract-compilation');
    const retained=tools.regular(join(catalog.ROOT,RETAINED_CONTRACTS));
    assert.equal(tools.hash(retained),RETAINED_CONTRACTS_SHA);
    const contracts=JSON.parse(retained);
    assert.equal(contracts.profile,'standard');
    for(const record of contracts.sources){const bytes=tools.regular(join(catalog.ROOT,'contracts',record.name));assert.equal(tools.hash(bytes),record.sha256);assert.equal(bytes.length,record.bytes);}
    publish(join(DIRECTORY,'contracts/compiled.json'),retained);
    const co42=await co42Artifacts(),ci51=readCompiled(),key=parse(join(roleDirectory,'key-manifest.json'));
    const values=[compileVerifier('native_claim_ingress_v3',tools.regular(join(roleDirectory,'verifier.sol')),v3.NATIVE_INGRESS_V3_SOURCE_VERSION,v3.NATIVE_INGRESS_V3_KEY_SHA256,key.keyHashField,51,
      {programSHA256:publicProgramSHA256('native_claim_ingress_v3',ci51.program),abiSHA256:ci51.manifest.abiSHA256,bytecodeSHA256:ci51.manifest.bytecodeSHA256,
        compiledMetadataSHA256:tools.hash(JSON.stringify({...ci51.manifest,programSHA256:publicProgramSHA256('native_claim_ingress_v3',ci51.program)})),
        keyMetadataSHA256:tools.hash(JSON.stringify({...key,compiledManifestSHA256:publicProgramSHA256('native_claim_ingress_v3',ci51.program)}))}),
      compileVerifier('native_claim_discharge',co42.prepared.solidity,co42.context.sourceVersion,tools.hash(co42.prepared.key),co42.prepared.manifest.keyHashField,42,
        {programSHA256:publicProgramSHA256('native_claim_discharge',co42.compiled.program),abiSHA256:co42.compiled.manifest.abiSHA256,bytecodeSHA256:co42.compiled.manifest.bytecodeSHA256})];
    const rows=[];
    for(const value of values) {
      const {compiled,source,directory,lineage,sourceVersion,keySHA256,keyHashField,publicWords}=value;
      assert.deepEqual(compiled.compiler,engine.GENERIC_COMPILER_PIN);assert.deepEqual(compiled.settings.optimizer,{enabled:true,runs:1});assert.equal(compiled.settings.viaIR,false);
      const ast=compiled.sourceASTs[source],contracts=compiled.contracts[source],immutableValues=engine.deriveGenericVerifierImmutables(ast,publicWords),immutableNames={};
      const visit=value=>{if(!value||typeof value!=='object')return;if(value.nodeType==='VariableDeclaration'&&value.mutability==='immutable')immutableNames[value.id]=value.name;for(const child of Object.values(value))if(Array.isArray(child))child.forEach(visit);else visit(child);};visit(ast);
      assert.equal(BigInt(immutableValues.$VK_HASH),BigInt(keyHashField));
      assert.deepEqual(contracts.HonkVerifier.evm.methodIdentifiers,{'verify(bytes,bytes32[])':'ea50d0e4'});
      for(const artifact of Object.values(contracts))assert.ok(artifact.evm.bytecode.object.length/2<=49152&&artifact.evm.deployedBytecode.object.length/2<=24576);
      const row={relation:source.slice(0,-4),source,publicWords,sourceVersion,keySHA256,keyHashField,lineage,
        soliditySHA256:tools.hash(tools.regular(join(directory,'verifier.sol'))),compiledSHA256:tools.hash(tools.regular(join(directory,'compiled-solidity.json'))),immutableNames,immutableValues,
        artifacts:Object.fromEntries(Object.entries(contracts).map(([name,artifact])=>[name,tools.hash(canonical(artifact))]))};
      write(join(directory,'verifier-manifest.json'),row);rows.push(row);
    }
    write(join(DIRECTORY,'manifest.json'),{format:'LIANUM_DEVELOPMENT_NATIVE_CLAIMS_BUILD_V2',
      classification:'REBUILT_PUBLIC_ARTIFACTS_FOR_NEW_LOCAL_LAB_NOT_HISTORICAL_ACCEPTANCE',
      toolchain:pins.toolchain,crs:pins.crs,identities:pins.identities,contractsSHA256:RETAINED_CONTRACTS_SHA,
      verifiers:rows,constraintsSHA256:tools.hash(tools.regular(join(DIRECTORY,'constraint-validation.json'))),
      historicalReportsRecreated:false,nativeNodesStarted:false,proofGenerated:false,proofAcceptanceEstablished:false});
    report.manifestSHA256=tools.hash(tools.regular(join(DIRECTORY,'manifest.json')));
  }
  assert.deepEqual(await fingerprint(),pins,'NATIVE_REBUILD_FINAL_PINS_CHANGED');
  report.phase='completed';save();
} catch(error) {
  report.phase='failed';report.errorCode=String(error.message).match(/(?:NATIVE_REBUILD_|PW_)[A-Z0-9_]+/)?.[0]??'NATIVE_REBUILD_WORKER_FAILED';
  save();process.exitCode=1;
} finally { await destroy();save();if(process.connected)process.disconnect(); }
