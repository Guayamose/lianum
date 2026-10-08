/** Original owned validator + one signed public swap, not private ingress. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
import {createOwnedJupiterPublicBankV1,assertOwnedJupiterPublicBankV1} from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs';
import {assertJupiterPublicFixtureSourceReviewV1,assertJupiterPublicSwapSourceReviewV1} from '../../../../packages/backend/src/operations/deployments/defi/jupiter-official-material-v1.mjs';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
import {jupiterOrcaPublicSwapSourcePinsV1} from './jupiter-orca-public-swap-source-pins-v1.mjs';
import {JUPITER_SWAP_RESULT_V1,JUPITER_SWAP_PROFILE_V1,assertJupiterSwapObservationAgreementV1,assertJupiterOrcaPublicSwapResultV1} from './jupiter-orca-public-swap-policy-v1.mjs';
const FLOW='.local/jupiter-orca-public-swap-v1';
assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.argv[1]),fileURLToPath(import.meta.url));
assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.LANG,'C.UTF-8');assert.equal(process.env.PATH,'/usr/bin:/bin');
const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parent.length,2);
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),join(ROOT,'integration/run-jupiter-orca-public-swap-v1.mjs'));
const lock=JSON.parse(readFileSync(join(ROOT,FLOW,'active.lock')));assert.equal(lock.pid,process.ppid);
assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(lock.attempt,FLOW+'/attempt-'+lock.runId);
const directory=join(ROOT,lock.attempt),began=performance.now(),sourcePins=jupiterOrcaPublicSwapSourcePinsV1();
const result={format:JUPITER_SWAP_RESULT_V1,profile:JUPITER_SWAP_PROFILE_V1,runId:lock.runId,phase:'starting',success:false,
 localOnly:true,fakeFundsOnly:true,publicNetwork:false,sourcePins,sourceUnchanged:false,supervisor:{supervisorPID:process.ppid,workerPID:process.pid},
 proofs:[],files:{},signatureCount:0,broadcastCount:0,publicSwapEstablished:false,privateCreditEstablished:false,systemMemoClaimLaneEnabled:false,
 privateGraphAcceptance:false,fullWalletAcceptance:false,cleanup:{closedSolana:false,errors:[]}};
let bank=null,interrupted=null;const save=()=>writeFixturePrivate(join(directory,'result.json'),result);
const active=()=>assert.equal(interrupted,null,'JUPITER_SWAP_INTERRUPTED');
const onTerm=()=>{interrupted??='SIGTERM';void bank?.close().catch(()=>{});},onInt=()=>{interrupted??='SIGINT';void bank?.close().catch(()=>{});};
process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);save();
try{
 assertJupiterPublicFixtureSourceReviewV1();assertJupiterPublicSwapSourceReviewV1();active();
 result.phase='start-original-public-bank';save();bank=await createOwnedJupiterPublicBankV1();assertOwnedJupiterPublicBankV1(bank);active();
 result.solanaPID=bank.metadata.processId;result.beforeBank=await bank.inspect();writeFixturePrivate(join(directory,'bank-before.json'),result.beforeBank);
 result.phase='one-original-signature-and-durable-broadcast';save();const sendBegan=performance.now();let observed=await bank.swapOnce();
 while(observed.status==='pending'&&performance.now()-sendBegan<300000){active();await new Promise(done=>setTimeout(done,200));observed=await bank.observeSwap();}
 active();assert.ok(performance.now()-sendBegan<300000,'JUPITER_SWAP_FINALITY_BUDGET_EXPIRED');assert.equal(observed.status,'observed','JUPITER_SWAP_FINALITY_UNRESOLVED');assert.equal(observed.broadcastAttempts,1);
 result.phase='reobserve-original-wire-without-send';result.observation=observed;save();
 result.duplicateObservation=await bank.swapOnce();assertJupiterSwapObservationAgreementV1(observed,result.duplicateObservation);
 result.reconciledObservation=await bank.observeSwap();assertJupiterSwapObservationAgreementV1(result.duplicateObservation,result.reconciledObservation);
 const records=bank.swaps;assert.equal(records.length,1);const {nativeEvidenceJSON,...record}=records[0];assert.equal(typeof nativeEvidenceJSON,'string');
 writeFixturePrivate(join(directory,'native-evidence.json'),JSON.parse(nativeEvidenceJSON));writeFixturePrivate(join(directory,'native-record.json'),record);
 result.originalRecord=record;result.signatureCount=records.length;result.broadcastCount=record.broadcastAttempts;
 result.afterBank=await bank.inspect();result.native=bank.metadata;writeFixturePrivate(join(directory,'bank-after.json'),result.afterBank);
 result.publicSwapEstablished=true;
}catch(error){result.phase='failed';result.success=false;result.errorCode=/^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message??'')?error.message:'JUPITER_PUBLIC_SWAP_FAILED';
 writeFixturePrivate(join(directory,'error-private.json'),{code:error?.code??null,message:String(error?.message??error),stack:String(error?.stack??'')});process.exitCode=1;
}finally{
 try{if(bank){const records=bank.swaps;writeFixturePrivate(join(directory,'signed-attempts.json'),records.map(({nativeEvidenceJSON,...row})=>row));
   writeFixturePrivate(join(directory,'runtime-metadata.json'),bank.metadata);
   for(const row of records)if(row.nativeEvidenceJSON)writeFixturePrivate(join(directory,'native-evidence.json'),JSON.parse(row.nativeEvidenceJSON));}}
 catch(error){result.phase='failed';result.errorCode??='JUPITER_SWAP_PRIVATE_RETENTION_FAILED';process.exitCode=1;}
 try{if(bank){result.cleanup.solana=await bank.close();assert.equal(result.cleanup.solana.ownedProcessStopped,true);assert.equal(result.cleanup.solana.forced,false);
   assert.equal(result.cleanup.solana.syntheticKeysAndLedgerRemoved,true);result.cleanup.closedSolana=true;}}
 catch(error){result.cleanup.errors.push(/^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message??'')?error.message:'JUPITER_SWAP_CLEANUP_FAILED');result.phase='failed';process.exitCode=1;}
 try{active();assert.deepEqual(jupiterOrcaPublicSwapSourcePinsV1(),sourcePins,'JUPITER_SWAP_SOURCE_CHANGED');result.sourceUnchanged=true;
  writeFixturePrivate(join(directory,'source-pins.json'),sourcePins);
  for(const name of ['bank-before.json','bank-after.json','native-evidence.json','native-record.json','source-pins.json','signed-attempts.json','runtime-metadata.json']){
   const raw=regular(join(directory,name));result.files[name]={bytes:raw.length,sha256:hash(raw)};}
  if(result.phase!=='failed'&&result.cleanup.closedSolana&&result.cleanup.errors.length===0){result.phase='completed';result.success=true;assertJupiterOrcaPublicSwapResultV1(result);}
 }catch(error){result.phase='failed';result.success=false;result.errorCode??=/^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message??'')?error.message:'JUPITER_SWAP_FINAL_EVIDENCE_FAILED';
  writeFixturePrivate(join(directory,'error-cleanup-private.json'),{code:error?.code??null,message:String(error?.message??error),stack:String(error?.stack??'')});process.exitCode=1;}
 result.interrupted=interrupted;result.elapsedMilliseconds=performance.now()-began;save();process.off('SIGTERM',onTerm);process.off('SIGINT',onInt);
}
