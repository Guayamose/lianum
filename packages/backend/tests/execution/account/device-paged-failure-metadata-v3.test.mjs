/** Filesystem boundary HOST. Actual diagnostic producer; no proof or finance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as environment from '@lianum/environment';
const directory=await mkdtemp(join(tmpdir(),'lianum-failure-metadata-'));
mock.module('@lianum/environment',{exports:{...environment,resourceRoot(name){assert.equal(name,'engine');return directory;}}});
const {retainDevicePagedFailureMetadataV3}=await import('../../../src/operations/local/device-paged-failure-metadata-v3.mjs');
test('wrapped Original worker code is retained separately without private error data',async t=>{
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const first=Error('PAGED_GRAPH_ORIGINAL_PROOF_FAILED');Object.defineProperty(first,'originalProofCode',{value:'PAEG_PAGED_WORKER_RSS'});first.witness='PRIVATE_TEST_WITNESS_SENTINEL';retainDevicePagedFailureMetadataV3(first,'GRAPH_RECIPIENT');
 const second=Error('PRIVATE_TEST_WITNESS_SENTINEL');Object.defineProperty(second,'originalProofCode',{value:'PAEG_PAGED_WORKER_RSS\nPRIVATE_TEST_WITNESS_SENTINEL'});retainDevicePagedFailureMetadataV3(second,'GRAPH_RECIPIENT');
 let getterCalls=0;const third=Error('PAGED_GRAPH_ORIGINAL_PROOF_FAILED');Object.defineProperty(third,'originalProofCode',{get(){getterCalls++;return 'PAEG_PAGED_WORKER_RSS';}});retainDevicePagedFailureMetadataV3(third,'GRAPH_RECIPIENT');
 const path=join(directory,'evidence/paeg-proof-attempts'),files=await readdir(path),rows=[];assert.equal(files.length,3);for(const file of files){const text=await readFile(join(path,file),'utf8');assert.ok(!text.includes('PRIVATE_TEST_WITNESS_SENTINEL'));assert.equal((await stat(join(path,file))).mode&0o777,0o600);rows.push(JSON.parse(text));}
 assert.equal(rows.filter(row=>row.originalProofCode==='PAEG_PAGED_WORKER_RSS').length,1);assert.equal(rows.filter(row=>row.originalProofCode===null).length,2);assert.equal(rows.find(row=>row.originalProofCode!==null).code,'PAGED_GRAPH_ORIGINAL_PROOF_FAILED');assert.equal(getterCalls,0);
});


// PROPOSED real transport -> original Error -> existing private metadata path.
test('RPC rejection reaches existing GRAPH_HTTP metadata without retaining provider bytes',async t=>{
 const {nativeRpcV1}=await import('../../../src/native-wallet/http-v1.mjs'),reason='STALE_EPOCH',word=n=>BigInt(n).toString(16).padStart(64,'0'),data='0x08c379a0'+word(32)+word(reason.length)+Buffer.from(reason).toString('hex').padEnd(64,'0'),events=[];
 t.after(()=>rm(directory,{recursive:true,force:true}));t.mock.method(console,'error',(...args)=>events.push(args));
 t.mock.method(globalThis,'fetch',async(_url,options)=>Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,error:{code:3,message:'PRIVATE_MESSAGE_SENTINEL',data}}));
 let failure;try{await nativeRpcV1('https://rpc.invalid')('eth_call',[{data:'PRIVATE_CALLDATA_SENTINEL'}]);}catch(error){failure=error;}
 assert.ok(failure);retainDevicePagedFailureMetadataV3(failure,'GRAPH_HTTP');
 const files=await readdir(join(directory,'evidence/paeg-proof-attempts')),texts=await Promise.all(files.map(file=>readFile(join(directory,'evidence/paeg-proof-attempts',file),'utf8'))),rows=texts.map(JSON.parse),row=rows.find(row=>row.rpcContractRejection?.reason==='STALE_EPOCH');assert.ok(row);assert.equal(row.code,'NATIVE_WALLET_RPC_FAILED');assert.equal(row.stage,'GRAPH_HTTP');
 for(const text of [...texts,...events.map(row=>JSON.stringify(row))]){assert.ok(!text.includes('PRIVATE_MESSAGE_SENTINEL'));assert.ok(!text.includes('PRIVATE_CALLDATA_SENTINEL'));assert.ok(!text.includes(data));}assert.equal(events.length,1);
});

test('fixed proof-window rejection survives ERR_ASSERTION without exposing assertion values',async t=>{
 t.after(()=>rm(directory,{recursive:true,force:true}));
 let error;try{assert.ok(false,'PAGED_DEVICE_NOTE_EPOCH_TOO_SHORT');}catch(e){error=e;}
 error.actual='PRIVATE_ASSERTION_SENTINEL';retainDevicePagedFailureMetadataV3(error,'GRAPH_HTTP');
 const texts=await Promise.all((await readdir(join(directory,'evidence/paeg-proof-attempts'))).map(file=>readFile(join(directory,'evidence/paeg-proof-attempts',file),'utf8')));
 assert.ok(texts.map(JSON.parse).some(row=>row.code==='PAGED_DEVICE_NOTE_EPOCH_TOO_SHORT'));
 assert.ok(texts.every(text=>!text.includes('PRIVATE_ASSERTION_SENTINEL')));
});

test('a large assertion diff preserves its bounded reason and source frame without private values',async t=>{
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const reason='PAGED_UNRESERVED_WITHDRAWAL_AUTHORITY_CHANGED',secret='PRIVATE_LARGE_JOURNAL_DIFF_SENTINEL';
 const error=new assert.AssertionError({actual:{value:secret},expected:{value:'other'},operator:'deepStrictEqual',message:reason});
 error.message=reason+'\n'+secret.repeat(5000);
 error.stack='AssertionError: '+error.message+'\n    at unreservedWithdrawalV27 (file://'+environment.projectRoot+'/packages/backend/src/accounts/authority/device-paged-note-authority-v3.mjs:277:10)';
 retainDevicePagedFailureMetadataV3(error,'GRAPH_HTTP');
 const texts=await Promise.all((await readdir(join(directory,'evidence/paeg-proof-attempts'))).map(file=>readFile(join(directory,'evidence/paeg-proof-attempts',file),'utf8'))),row=texts.map(JSON.parse).find(row=>row.code===reason);
 assert.ok(row);assert.deepEqual(row.frames,[{path:'packages/backend/src/accounts/authority/device-paged-note-authority-v3.mjs',line:277,column:10}]);
 assert.ok(texts.every(text=>!text.includes(secret)));
});
