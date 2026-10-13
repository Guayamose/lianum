import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deviceReservationFixtureV1} from './helpers/device-reservation-fixture-v1.mjs';
import {DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from '../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {DEVICE_EXTERNAL_FLAT_GRAPH_V1} from '../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {nextDeviceDefiOperationV1,deviceDefiAmountToAtomicV1,deviceDefiReceptionWindowV1} from '../../../packages/mobile-protocol/src/device-defi-operation-flow-v1.mjs';

// Public HOST snapshots only: these tests exercise resume decisions, and issue
// no signature, biometric permission, proof, original receipt or chain effect.
const h=value=>createHash('sha256').update(value).digest('hex'),now=100000;
function descriptor(share=false,scope=h('scope'),policy=h('policy'),asset=h('assetIdentity')){
 return {profile:share?DEVICE_EXTERNAL_FLAT_SHARE_V1:DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://localhost:9443',pairingId:h('pair'),devicePublicKey:'04'+'11'.repeat(64),lifetime:h('lifetime'),
  poolTerms:{...Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(k=>[k,h(k).slice(0,['pool','asset','hub'].includes(k)?40:64)])),scope,policy,assetIdentity:asset},assetMetadata:{kind:'ERC20',symbol:share?'SHARE':'USDC',decimals:6}};
}
function noteStatus(d,stage){
 const share=d.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1,jobId=h('deposit'),statement={scope:d.poolTerms.scope,policy:d.poolTerms.policy,amount:'100',output:h('output'),...(share?{validFrom:'1',validUntil:'840'}:{epoch:'1'})},
  consentFields={jobId,depositJobId:jobId,rootId:h('root'),noteRevision:1,recipient:'90'.repeat(20),statement,path:null,witnessSHA256:h('witness'),proofSHA256:h('proof'),publicInputsSHA256:h('inputs')},observed={blockNumber:'1',blockHash:h('block'),timestamp:'1'},
  observation=stage==='CONFIRMED'?{profile:d.profile,jobId,depositJobId:jobId,rootId:consentFields.rootId,commitment:statement.output,amount:statement.amount,recipient:consentFields.recipient,proofSHA256:consentFields.proofSHA256,publicInputsSHA256:consentFields.publicInputsSHA256,transactionHash:h('tx'),calldataSHA256:h('calldata'),receiptBlockHash:h('receipt'),observed,status:'CONFIRMED',canonicalRpcVerifiedBy:'ORIGINAL_BACKEND_OBSERVER',mobileCanonicalRpcVerified:false}:null;
 return {descriptor:d,jobs:[{profile:d.profile,descriptor:d,jobId,mode:share?'deposit_intent':'deposit_balance',stage,consentFields,observation,errorCode:null}],observed,observedAt:now,expiresAt:now+15000,...(share?{note:{state:stage==='CONFIRMED'?'LIVE':'UNISSUED',commitment:statement.output,available:stage==='CONFIRMED'?'100':null,backing:stage==='CONFIRMED'?{held:'100',liabilities:'100',surplus:'0',deficit:'0'}:null}}:{})};
}
function graphStatus(){
 const {consent}=deviceReservationFixtureV1(),statement=consent.statement,d=descriptor(false,statement.scope,statement.policy,statement.asset),
  fields={...Object.fromEntries(['depositJobId','quoteId','jobId','custody','statement','witnessSHA256'].map(k=>[k,consent[k]])),proofSHA256:h('Uproof'),publicInputsSHA256:h('Uinputs')},
  path=leaf=>({root:h('pathRoot'),index:0,leaf,siblings:Array.from({length:6},(_,i)=>h('sibling'+i))}),observed={blockNumber:'1',blockHash:h('block'),timestamp:'1'},
  observation={profile:'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1',transactionHash:h('Stx'),blockHash:h('Sblock'),blockNumber:'1',timestamp:'1',sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,changeCommitment:statement.changeCommitment,reserveCommitment:statement.reserveCommitment,domainCommitment:d.poolTerms.domainCommitment,envelope:h('envelope'),admissionTag:h('tag'),currentHead:observed,changePath:path(statement.changeCommitment),reservePath:path(statement.reserveCommitment)};
 return {profile:DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor:d,jobs:[{profile:DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor:d,reservation:{jobId:consent.jobId,stage:'RESERVED',consentFields:fields,statement,observation,errorCode:null,authorizationSHA256:h('permission')},graph:{stage:'PREPARED',outcome:null,terminal:null},outputs:[]}],observed,observedAt:now,expiresAt:now+15000};
}

test('DeFi resumes the same unknown funding and sends a ready destination back to its source',()=>{
 const d=descriptor(),unknown=noteStatus(d,'FUNDING_UNKNOWN');
 assert.equal(nextDeviceDefiOperationV1({descriptor:d,noteStatus:unknown,now}).action,'OBSERVE_D26');
 const proved=noteStatus(d,'PROVED');
 assert.equal(nextDeviceDefiOperationV1({descriptor:d,noteStatus:proved,notePending:{jobId:h('deposit'),action:'FUND_D26'},now}).action,'OBSERVE_D26');
 assert.equal(nextDeviceDefiOperationV1({descriptor:d,noteStatus:proved,now:now+15000}).kind,'REFRESH');
 const target=descriptor(true),ready=noteStatus(target,'PROVED');
 assert.equal(nextDeviceDefiOperationV1({descriptor:target,noteStatus:ready,role:'DESTINATION',hasDestination:true,now}).kind,'OPEN_SOURCE');
 assert.equal(nextDeviceDefiOperationV1({descriptor:d,noteStatus:noteStatus(d,'CONFIRMED'),role:'SOURCE',hasDestination:true,now}).kind,'OPEN_DESTINATION');
});

test('DeFi selects recovery only from fresh chain time and withdraws the backed recovery output',()=>{
 const graph=graphStatus(),d=graph.descriptor;
 assert.equal(nextDeviceDefiOperationV1({descriptor:d,graphStatus:graph,now}).action,'EXECUTE_GRAPH');
 graph.observed.timestamp='900';
 assert.equal(nextDeviceDefiOperationV1({descriptor:d,graphStatus:graph,now}).action,'RECOVER_GRAPH');
 graph.jobs[0].graph.stage='EXECUTION_UNKNOWN';
 assert.equal(nextDeviceDefiOperationV1({descriptor:d,graphStatus:graph,now}).action,'RECONCILE_GRAPH');
 assert.equal(nextDeviceDefiOperationV1({descriptor:d,graphStatus:graph,now:now+15000}).kind,'REFRESH');
 const row=graph.jobs[0],s=row.reservation.statement;
 row.graph={stage:'RECOVERED',outcome:'RECOVERED',terminal:{outcome:'RECOVERED',transactionHash:h('Ttx'),calldataSHA256:h('Tcalldata'),blockHash:h('Tblock'),blockNumber:'2'}};
 row.outputs=[{noteRole:'change',amount:'380',commitment:s.changeCommitment,nullifier:h('changeNullifier'),state:'UNSPENT',available:'380',backing:{held:'500',liabilities:'500',surplus:'0',deficit:'0'}},{noteRole:'recovery',amount:'120',commitment:s.recoveryCommitment,nullifier:h('recoveryNullifier'),state:'UNSPENT',available:'120',backing:{held:'500',liabilities:'500',surplus:'0',deficit:'0'}}];
 const step=nextDeviceDefiOperationV1({descriptor:d,graphStatus:graph,now});assert.equal(step.kind,'PREPARE_OUTPUT_WITHDRAWAL');assert.equal(step.noteRole,'recovery');assert.equal(step.nativePagedAdmission,false);
 row.outputs[1].backing.deficit='1';assert.throws(()=>nextDeviceDefiOperationV1({descriptor:d,graphStatus:graph,now}));
});

test('DeFi human amounts retain all atomic units and reception uses a bounded chain window',()=>{
 assert.equal(deviceDefiAmountToAtomicV1('1,000001',6),'1000001');
 assert.equal(deviceDefiAmountToAtomicV1('0.000000000000000001',18),'1');
 assert.throws(()=>deviceDefiAmountToAtomicV1('1.0000001',6));
 assert.throws(()=>deviceDefiAmountToAtomicV1('1e3',6));
 assert.deepEqual(deviceDefiReceptionWindowV1('6000',900),{validFrom:'6000',validUntil:'6840',settleBefore:'6900'});
 assert.throws(()=>deviceDefiReceptionWindowV1('6000',120));
});
