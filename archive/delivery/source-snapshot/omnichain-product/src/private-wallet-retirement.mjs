/** Settled PC23 operation process retirement. This releases only expendable
 * assembler/recipient OS processes. Original encrypted stores, the surviving
 * host's exact withdrawal objects/latches and shared chain/issuer stay owned by
 * their existing closures. It is not wallet/node restart recovery. */
import assert from 'node:assert/strict';
import {stopAssemblyActor} from './private-payment-engine.mjs';
const clone=value=>structuredClone(value);
const same=(a,b,code)=>assert.deepEqual(a,b,code);
const roles=['sol','btc'];
async function stopRecipient(recipient){
 let timer,exit;
 try{exit=await Promise.race([recipient.stop(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('PC23_RECIPIENT_RETIRE_TIMEOUT')),5000);})]);}
 catch{exit=await recipient.terminate();}
 finally{clearTimeout(timer);}
 const p=recipient.provenance();assert.equal(p.closed,true,'PC23_RECIPIENT_RETIRE_NOT_CLOSED');assert.equal(p.channelsClosed,true,'PC23_RECIPIENT_RETIRE_CHANNELS');
 return{...exit,closed:p.closed,channelsClosed:p.channelsClosed};
}
/** This concrete own-role handle never creates or receives a recovery instance.
 * The existing recovery object calls authorizeWithdrawal only after READY. A
 * retired signer is lazily reopened from its ORIGINAL vault in recover mode,
 * and the authenticated original review must match before any authorization.
 * Read-only reconciliation never invokes this handle or starts a process. */
export function createRetainedWalletRecipient({role,initialRecipient,custody,expectedReview,startRecipient,guard=()=>{}}){
 assert.ok(roles.includes(role),'PC23_RECIPIENT_ROLE');assert.equal(custody.expectedTerms.role,role,'PC23_RECIPIENT_ROLE');assert.equal(typeof startRecipient,'function');assert.equal(typeof guard,'function');
 assert.equal(typeof initialRecipient.provenance,'function','PC23_RECIPIENT_PROVENANCE');
 const config=clone(custody),expected=clone(expectedReview);assert.equal(expected.role,role);assert.equal(expected.acknowledged,true,'PC23_ORIGINAL_COMPENSATION_ACK');
 let current=initialRecipient,busy=false,restarts=0,retirements=0;
 const exclusive=async work=>{assert.equal(busy,false,'PC23_RECIPIENT_LIFECYCLE_BUSY');busy=true;try{return await work();}finally{busy=false;}};
 async function ensure(){
  guard();if(!current.provenance().closed)return current;
  const candidate=await startRecipient({...config,mode:'recover'});
  try{same(candidate.review,expected,'PC23_ORIGINAL_RECIPIENT_RESTORE_BINDING');assert.equal(candidate.provenance().closed,false,'PC23_RECIPIENT_RESTORE_CLOSED');}
  catch(error){await candidate.terminate().catch(()=>{});throw error;}
  current=candidate;restarts++;return current;
 }
 return Object.freeze({
  role,
  authorizeWithdrawal:request=>exclusive(async()=>{const signer=await ensure();return signer.request('authorizeWithdrawal',request);}),
  assertNativeExposureAcknowledged:request=>exclusive(async()=>{guard();assert.equal(current.provenance().closed,false,'PC23_NATIVE_SIGNER_ALREADY_RETIRED');return current.request('assertNativeExposureAcknowledged',request);}),
  restoreOriginal:()=>exclusive(async()=>{await stopRecipient(current);retirements++;await ensure();return{restored:true,role};}),
  retire:()=>exclusive(async()=>{const wasClosed=current.provenance().closed,exit=await stopRecipient(current);if(!wasClosed)retirements++;return{role,...exit,alreadyClosed:wasClosed};}),
  provenance:()=>({role,...current.provenance(),restarts,retirements}),
 });
}
/** Trusted host-only gate. Settlement must be reobserved at the original pool
 * before shutting down anything. A mock callback belongs solely in host tests;
 * production passes the original canonical settlement and payout reconcilers.
 * Neither this function nor signer retirement receives a runtime close method. */
export async function retirePrivateWalletSettledProcesses({assembler,recipients,verifySettled,recordSample=async()=>{},recordRetirement=async()=>{}}){
 assert.equal(typeof verifySettled,'function');assert.equal(typeof recordSample,'function');assert.equal(typeof recordRetirement,'function');assert.deepEqual(Object.keys(recipients).sort(),roles.slice().sort(),'PC23_RETIRE_ROLES');
 const verified=await verifySettled();assert.equal(verified.state,'CLAIMED','PC23_RETIRE_UNSETTLED');
 for(const role of roles)assert.ok(['READY','WITHDRAWN'].includes(verified.payouts?.[role]),'PC23_RETIRE_PAYOUT_UNVERIFIED');
 const processes=()=>({assembler:assembler.provenance(),recipients:Object.fromEntries(roles.map(role=>[role,recipients[role].provenance()]))});
 await recordSample('SETTLED_BEFORE_PROCESS_RETIREMENT',processes());
 const assemblerExit=await stopAssemblyActor(assembler),ap=assembler.provenance();assert.equal(ap.closed,true,'PC23_SETTLED_ASSEMBLER_NOT_CLOSED');assert.equal(ap.channelsClosed,true,'PC23_SETTLED_ASSEMBLER_CHANNELS');assert.equal(ap.writesAfterExit,0,'PC23_SETTLED_ASSEMBLER_POST_EXIT_WRITE');
 const exits={};for(const role of roles)exits[role]=await recipients[role].retire();
 const report={kind:'private-settled-operation-process-retirement',branch:'CLAIMED',assembler:{...assemblerExit,closed:ap.closed,channelsClosed:ap.channelsClosed},recipients:exits,encryptedCustodyRetained:true,originalWithdrawalInstancesRetained:true,sharedAuthorityRetired:false};
 await recordSample('SETTLED_AFTER_PROCESS_RETIREMENT',processes());await recordRetirement(report);return report;
}
