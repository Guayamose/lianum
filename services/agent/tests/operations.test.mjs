import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {secp256k1} from '@noble/curves/secp256k1.js';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as A from '@lianum/mobile-protocol/device/paged-agent-v4';
import * as T from '@lianum/mobile-protocol/device/paged-automation-v4';
import {createDevicePagedAgentSavedOperationV4} from '@lianum/sdk/agent/operation';
import {openAgentStore} from '../../../packages/agent/src/store.mjs';
import {createAgentOperations} from '../../../packages/agent/src/operations.mjs';
import {runAgentTool} from '../../../packages/agent/src/tools.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex'),hex=bytes=>Buffer.from(bytes).toString('hex');
function fixture(t,observer){
 const directory=mkdtempSync(join(tmpdir(),'lianum-op-'));let at=Date.now(),store=openAgentStore({directory,now:()=>at});const deviceKey=new Uint8Array(32);deviceKey[31]=1;const publicKey=hex(secp256k1.getPublicKey(deviceKey,false)),state=store.ensure(publicKey),origin='https://localhost:9444',seconds=Math.floor(at/1000);
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin,pairingId:'host-agent-tracking',devicePublicKey:publicKey,deadlineMs:at+3600000,chainId:'11155111',chainDeadlineSeconds:String(seconds+3600),...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,hash(k)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))});
 const connection={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n',certificateSHA256:hash('cert')}};state.sessionId='host_session';state.context={network:'testnet'};state.connections=[connection];store.save(state.owner,state);
 const terms={budget:'1',fundingNotBefore:String(seconds),fundingValidUntil:String(seconds+300),settleBefore:String(seconds+900)},nodes=[{id:'payment-1',networkId:'ethereum-sepolia',recipient:'0x'+'a'.repeat(40),amountAtomic:'1000',providerPayoutAtomic:'1',dependsOn:[]}];
 const proposal=runAgentTool(store,state,{type:'function_call',name:'propose_payments',arguments:{terms,nodes},turn_id:'host_turn',call_id:'host_call'});assert.equal(proposal.success,true);const id=proposal.output.operationId,operation=store.operation(state.owner,id),descriptorSHA256=A.devicePagedAgentDescriptorSHA256V4(descriptor),automation=T.normalizeDevicePagedAutomationTermsV4({profile:T.DEVICE_PAGED_AUTOMATION_V4,descriptorSHA256,graphId:'paged-graph-'+'a'.repeat(32),rootId:hash('root'),revision:1,authorizationRoot:hash('auth'),reserveNullifier:hash('reserve'),budget:'1',nodes:'1',settleBefore:terms.settleBefore,quoteRoot:hash('quote'),maxCommands:8,expiresAt:at+3600000}),readerPublicKey=operation.proposal.proposal.agentPublicKey;
 const grant={profile:A.DEVICE_PAGED_AGENT_READ_GRANT_V4,descriptorSHA256,terms:automation,readerPublicKey,maximumReads:7,grantId:A.devicePagedAgentReadGrantIdV4(descriptorSHA256,automation,readerPublicKey,7)},readerGrant={grant,signature:hex(secp256k1.sign(A.devicePagedAgentReadGrantMessageV4(grant),deviceKey,{prehash:true,lowS:true}))},record=createDevicePagedAgentSavedOperationV4(connection,operation.proposal,readerGrant,'CONFIRMED');let reads=0,phase='RESERVED';
 const observe=observer??(async()=>({grantId:grant.grantId,readsUsed:++reads,progress:{profile:A.DEVICE_PAGED_AGENT_PROGRESS_V4,descriptorSHA256,graphId:automation.graphId,rootId:automation.rootId,revision:1,authorizationRoot:automation.authorizationRoot,reserveNullifier:automation.reserveNullifier,phase,pending:false,automation:{terms:automation,commandsUsed:phase==='FULFILLED'?5:1,revoked:false},execution:{completed:phase==='FULFILLED'?'1':'0',total:'1',currentNodeId:null},observed:{blockHash:'0x'+hash('block'),blockNumber:'1',timestamp:String(Math.floor(Date.now()/1000)),issuedAt:Date.now(),expiresAt:Date.now()+15000},current:true}}));
 const make=()=>createAgentOperations({store,observe,origin,now:()=>at});let worker=make();t.after(async()=>{await worker.close();store.close();deviceKey.fill(0);rmSync(directory,{recursive:true,force:true});});
 return {state,id,record,get store(){return store;},get worker(){return worker;},phase:value=>phase=value,advance:ms=>at+=ms,get reads(){return reads;},async restart(){await worker.close();store.close();store=openAgentStore({directory,now:()=>at});worker=make();}};
}
test('only a genuine finite device grant links a proposal; verified progress survives restart and completes once',async t=>{
 const f=fixture(t);assert.equal(f.store.operations(f.state.owner)[0].status,'PROPOSED');const tampered=structuredClone(f.record);tampered.readerGrant.signature='00'.repeat(64);assert.throws(()=>f.worker.register(f.state,{record:tampered}));assert.equal(f.store.operations(f.state.owner)[0].tracking,'NOT_REGISTERED');
 f.worker.register(f.state,{record:f.record});assert.equal(f.store.operations(f.state.owner)[0].status,'AUTHORIZATION_UNCONFIRMED','phone confirmation is not a chain receipt');await f.worker.tick();assert.equal(f.store.operations(f.state.owner)[0].status,'RUNNING');assert.equal(f.reads,1);
 await f.restart();f.advance(30001);f.phase('FULFILLED');await f.worker.tick();await f.worker.tick();assert.equal(f.reads,2);assert.equal(f.store.operations(f.state.owner)[0].status,'COMPLETED');assert.equal(f.store.operations(f.state.owner)[0].tracking,'FINISHED');assert.equal(f.store.messages(f.state.owner).filter(m=>m.text.includes('Todos los pagos')).length,1);assert.equal(f.store.notifications(f.state.owner).length,2);
});
test('repeated unknown progress stops after three attempts without announcing payment failure',async t=>{
 let attempts=0;const f=fixture(t,async()=>{attempts++;throw Error('unavailable');});f.worker.register(f.state,{record:f.record});for(let i=0;i<4;i++){await f.worker.tick();f.advance(120001);}assert.equal(attempts,3);assert.equal(f.store.operations(f.state.owner)[0].tracking,'NEEDS_REVIEW');assert.equal(f.store.operations(f.state.owner)[0].status,'AUTHORIZATION_UNCONFIRMED');assert.equal(f.store.messages(f.state.owner).length,1);
 f.worker.control(f.state,'/retry',{id:f.id});await f.worker.tick();assert.equal(attempts,4);f.worker.control(f.state,'/stop',{id:f.id});f.advance(120001);await f.worker.tick();assert.equal(attempts,4);assert.equal(f.store.operations(f.state.owner)[0].tracking,'STOPPED');
});
test('expired read permission never calls the observer or claims that the payment expired',async t=>{
 const f=fixture(t);f.worker.register(f.state,{record:f.record});f.advance(3600001);await f.worker.tick();assert.equal(f.reads,0);assert.equal(f.store.operations(f.state.owner)[0].tracking,'EXPIRED');assert.equal(f.store.operations(f.state.owner)[0].status,'AUTHORIZATION_UNCONFIRMED');
});
