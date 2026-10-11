/** Fixed affected-path validation only: no witnesses, new proofs or node runs.
 * Existing production worker supervisors and all their bounds are unchanged.
 * Reports contain hashes/counts/timings, never A/J/L fields or raw packages.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,relative} from 'node:path';
import {BN254_FR_MODULUS,deflattenFields} from '@aztec/bb.js';
import {readFixedCapability} from '../../../../../packages/backend/src/payments/private-payment-engine.mjs';
import {verifyAssemblyInWorker} from '@lianum/engine/assembly/private-assembly-actors';
import {ASSEMBLY_RECURSIVE_MODES,ASSEMBLY_PUBLIC_WORDS} from '@lianum/engine/assembly/private-assembly-encoding';
import {WALLET_PUBLIC_WORDS} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {PRIVATE_VERIFIER_CRS} from '@lianum/engine/crypto/private-verifier-crs';
import {assemblyVerificationPins} from '../../owner-independent/prover.mjs';
import {walletVerificationPins} from '../../wallet-notes/prover.mjs';
import {verifyCRS,verifyToolchain} from '../../wallet-notes/resources.mjs';
import {project,hash,filePin,guard,resources,capability} from '../common.mjs';

assert.equal(process.argv.length,3,'VA_FIXED_ARGUMENTS');
assert.equal(process.argv[2],'--parent-coordinated-verification-only','VA_PARENT_COORDINATION_REQUIRED');
const here=fileURLToPath(new URL('.',import.meta.url)), at=new Date().toISOString(),runId=at.replace(/[:.]/g,'-');
const reportPath=join(here,'validation-'+runId+'.json');
const report={classification:'EXISTING_CURRENT_MODE_PROOFS_THROUGH_CHANGED_VERIFY_ONLY_WRAPPERS',
  startedAt:at,phase:'starting',results:[],noNewProof:true,noWitnessRead:true,noPrivateTupleExport:true,
  noNativeNodeOrChainAction:true,hostLimitsChanged:false,sourceProfileRegenerated:false,
  freshProductionWorkerPerVerification:true,verifierCRS:PRIVATE_VERIFIER_CRS};
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
const rel=path=>relative(project,path);
const loadPinned=(path,pin)=>{filePin(path,pin);return JSON.parse(readFileSync(path));};
const paths=['src/private-verifier-crs.mjs','experiments/private-core-proof/owner-independent/prover.mjs',
  'experiments/private-core-proof/wallet-notes/prover.mjs','test/private-verifier-crs.test.mjs',rel(fileURLToPath(import.meta.url))];
const unchanged=['src/private-assembly-actors.mjs','experiments/private-core-proof/owner-independent/verify-worker.mjs',
  'experiments/private-core-proof/owner-independent/prove-worker.mjs','experiments/private-core-proof/wallet-notes/one-proof-worker.mjs',
  'experiments/private-core-proof/wallet-notes/resources.mjs','experiments/private-core-proof/native-notes/prover.mjs',
  'experiments/private-core-proof/owner-independent/prepare.mjs','experiments/private-core-proof/wallet-notes/prepare.mjs'];
function proveBranchSourceChecks(){
  const pc18Path=paths[1],walletPath=paths[2];
  const oldPC18=readFileSync(join(here,'source-before',pc18Path),'utf8'),pc18=readFileSync(join(project,pc18Path),'utf8');
  const oldWallet=readFileSync(join(here,'source-before',walletPath),'utf8'),wallet=readFileSync(join(project,walletPath),'utf8');
  assert.equal(hash(oldPC18),'ca38fa0d0b724371631c7afa490fa35c79127de96427ceb10c7fe4b1bd19ceec','VA_ORIGINAL_PC18_SOURCE_PIN');
  assert.equal(hash(oldWallet),'dd239e6786a13589531d9954daa779f59e892d71aa1dd3aaecd6a3e25f3305db','VA_ORIGINAL_WALLET_SOURCE_PIN');
  const importLine="import {initializePrivateVerifierCRS} from '../../../src/private-verifier-crs.mjs';\n";
  const pc18Normalized=pc18.replace(',BN254_G1_GENERATOR}', '}').replace(importLine,'')
    .replace("await initializePrivateVerifierCRS(api,BN254_G1_GENERATOR,readFileSync(crs+'bn254_g2.dat'));",
      "await api.srsInitSrs({pointsBuf:readFileSync(crs+'bn254_g1_compressed.dat'),numPoints:2097152,g2Point:readFileSync(crs+'bn254_g2.dat')});");
  const walletNormalized=wallet.replace(',BN254_G1_GENERATOR}', '}').replace(importLine,'')
    .replace("if(kind==='verify')report.verifierCRS=await initializePrivateVerifierCRS(api,BN254_G1_GENERATOR,readFileSync(CRS+'bn254_g2.dat'));else ",'');
  assert.equal(pc18Normalized,oldPC18,'VA_PC18_ONLY_ALLOWED_DELTA');
  assert.equal(walletNormalized,oldWallet,'VA_WALLET_ONLY_ALLOWED_DELTA');
  const body=source=>source.slice(source.indexOf('async function produceAssembly('),source.indexOf('// Parent-approved bounded native profile:'));
  assert.equal(body(pc18),body(oldPC18),'VA_PC18_PROVE_BODY_UNCHANGED');
  assert.equal((pc18.match(/initializePrivateVerifierCRS\(api/g)??[]).length,1);
  assert.equal((wallet.match(/initializePrivateVerifierCRS\(api/g)??[]).length,1);
  return{pc18ProveAndSelfVerificationByteIdentical:true,walletProveAndSelfVerificationUnchanged:true,
    fullCRSIntegrityLoopsUnchanged:true,onlyImportsAndVerifierInitializationChanged:true,
    originalPC18SHA256:hash(oldPC18),originalWalletSHA256:hash(oldWallet)};
}
async function verifyOne({mode,label,record,folder,proofName,inputName,artifacts,pins,family}){
  report.phase='verify-'+mode;save();guard();
  const proofPath=join(folder,proofName),inputPath=join(folder,inputName);
  filePin(proofPath,artifacts[proofName]);filePin(inputPath,artifacts[inputName]);
  const proof=readFileSync(proofPath),publicInputs=JSON.parse(readFileSync(inputPath));
  let vkFields,proofFields;
  try{
    assert.equal(hash(proof),record.proofSHA256,'VA_PROOF_PIN');
    assert.equal(hash(JSON.stringify(publicInputs)),record.publicInputsSHA256,'VA_INPUT_PIN');
    assert.equal(proof.length,record.proofBytes,'VA_COMPLETE_PROOF_SIZE');
    assert.equal(publicInputs.length,(family==='pc18'?ASSEMBLY_PUBLIC_WORDS:WALLET_PUBLIC_WORDS)[mode],'VA_STATEMENT_COUNT');
    if(ASSEMBLY_RECURSIVE_MODES.includes(mode)){
      vkFields=pins.vkFields;proofFields=deflattenFields(proof);
      assert.equal(vkFields.length,115,'VA_FULL_VK_FIELDS');assert.equal(proofFields.length,458,'VA_FULL_PROOF_FIELDS');
      const vk=readFileSync(join(project,'experiments/private-core-proof/owner-independent/.local/prepared',mode+'.vk'));
      assert.deepEqual(vkFields.map(BigInt),deflattenFields(vk).map(BigInt),'VA_COMPLETE_VK_BYTE_FIELDS');
      for(const field of [...vkFields,...proofFields,...publicInputs])assert.ok(BigInt(field)>=0n&&BigInt(field)<BN254_FR_MODULUS,'VA_FIELD_RANGE');
    }
    const began=performance.now(),verified=await verifyAssemblyInWorker(mode,{proof,publicInputs,...(vkFields?{vkFields,proofFields}:{})},label),wallMilliseconds=performance.now()-began;
    assert.equal(verified,true,'VA_GENUINE_MODE_REJECTED');
    const result={family,mode,label:record.label,target:pins.target,verified,workerExitedBeforeReturn:true,wallMilliseconds,
      verificationKeySHA256:pins.keySHA256,circuitSHA256:pins.circuitSHA256,proofSHA256:record.proofSHA256,
      publicInputsSHA256:record.publicInputsSHA256,proofBytes:proof.length,publicInputCount:publicInputs.length,
      recursiveVKFields:vkFields?.length??0,recursiveProofFields:proofFields?.length??0,
      proofFile:rel(proofPath),inputFile:rel(inputPath)};
    if(family==='wallet'){
      const dir=join(project,'evidence/m23-wallet-proof-attempts'),names=readdirSync(dir).filter(name=>name.endsWith('-'+label+'.json'));
      assert.equal(names.length,1,'VA_WALLET_REPORT_UNIQUE');const path=join(dir,names[0]),metrics=JSON.parse(readFileSync(path));
      assert.equal(metrics.phase,'completed');assert.equal(metrics.proofGenerated,false);assert.equal(metrics.operation,'verify');
      assert.equal(metrics.maximumPages,32768);assert.equal(metrics.crs.points,2097152);
      assert.deepEqual(metrics.verifierCRS,PRIVATE_VERIFIER_CRS);assert.deepEqual(metrics.crs,report.crsIntegrity);
      result.metricsFile=rel(path);result.metricsFileSHA256=hash(readFileSync(path));
      result.wrapperMilliseconds=metrics.totalMilliseconds;result.backendVerificationMilliseconds=metrics.verificationMilliseconds;
    }
    report.results.push(result);save();console.log(JSON.stringify({mode,label:record.label,verified,wallMilliseconds}));
  }finally{proof.fill(0);publicInputs.fill('0');vkFields?.fill('0');proofFields?.fill('0');}
}
try{
  report.before=guard();report.sourceChecks=proveBranchSourceChecks();
  report.sources=Object.fromEntries(paths.map(path=>[path,filePin(join(project,path))]));
  report.unchangedSources=Object.fromEntries(unchanged.map(path=>[path,filePin(join(project,path))]));
  const abFile=join(project,'experiments/private-core-proof/verifier-latency/verification-ab-2026-10-03T11-22-07-141Z.json');
  report.priorTargetAndNegativeComparison={file:rel(abFile),...filePin(abFile,{sha256:'16e2c1b2c71926fd51404253efd75f1bccc63c17ad8e6f9e32e4bdeb83de25f7'})};
  report.toolchain=verifyToolchain();report.crsIntegrity=verifyCRS();
  const fixed=await readFixedCapability(),current=loadPinned(join(project,capability.current),{sha256:capability.currentSHA256});
  const legacy=loadPinned(join(project,capability.original),{sha256:capability.originalSHA256});
  assert.equal(current.previousCapabilitySHA256,capability.originalSHA256);assert.equal(current.reusedProofs[0].from,capability.originalRun);
  report.currentPC18Capability={file:capability.current,sha256:capability.currentSHA256,legacyFile:capability.original,legacySHA256:capability.originalSHA256};
  for(const record of fixed.proofs){
    const isCurrent=record.mode.endsWith('_ready'),source=isCurrent?current:legacy;
    const folder=join(project,'evidence',isCurrent?'m18-readiness-v2':'m18-capability',isCurrent?current.runId:capability.originalRun);
    const pins=assemblyVerificationPins([record.mode])[record.mode];
    assert.equal(pins.keySHA256,record.verificationKeySHA256);assert.equal(pins.circuitSHA256,record.circuitSHA256);
    await verifyOne({mode:record.mode,label:'mincrs-'+runId+'-'+record.mode,record,folder,
      proofName:record.label+'/proof.bin',inputName:record.label+'/public-inputs.json',artifacts:source.artifacts,pins,family:'pc18'});
  }
  assert.equal(report.results.length,8,'VA_ALL_PC18_MODES');
  const walletFolder=join(project,'evidence/m23-wallet-capability/2026-10-03T07-20-22-656Z'),walletFile=join(walletFolder,'report.json');
  const wallet=loadPinned(walletFile,{sha256:'6bef4b0de32b91d38c56c2e98972b0f595ff760f230ac3f5566ff5535404870d'});
  assert.equal(wallet.phase,'completed');assert.equal(wallet.proofs.length,4);assert.equal(wallet.runtimeCleanup.completed,true);
  for(const [name,pin]of Object.entries(wallet.artifacts)){assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'));filePin(join(walletFolder,name),pin);}
  report.walletCapability={file:rel(walletFile),sha256:hash(readFileSync(walletFile))};
  for(const [i,record]of wallet.proofs.entries()){
    const pins=walletVerificationPins([record.mode])[record.mode];assert.deepEqual(pins,wallet.walletVerificationPins[record.mode]);
    await verifyOne({mode:record.mode,label:'mincrs-'+runId+'-wallet-'+i,record,folder:walletFolder,
      proofName:'public-proofs/'+record.label+'.bin',inputName:'public-proofs/'+record.label+'.inputs.json',artifacts:wallet.artifacts,pins,family:'wallet'});
  }
  for(const [path,pin]of Object.entries({...report.sources,...report.unchangedSources}))filePin(join(project,path),pin);
  report.affectedChecksPassed=report.results.length===12&&report.results.every(x=>x.verified);report.phase='completed';
}catch(error){
  report.failedPhase=report.phase;report.phase='failed';
  const first=String(error.message).split('\n',1)[0];
  report.failure={name:error.name,code:typeof error.code==='string'?error.code:undefined,message:/^[A-Z][A-Z0-9_]+$/.test(first)?first:'VALIDATION_FAILURE_DETAILS_WITHHELD'};
  process.exitCode=1;
}finally{
  report.after=resources();report.completedAt=new Date().toISOString();save();
  console.log(JSON.stringify({report:rel(reportPath),phase:report.phase,results:report.results.length,sha256:hash(readFileSync(reportPath)),failure:report.failure}));
}
