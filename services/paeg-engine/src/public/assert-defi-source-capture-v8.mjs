/** Mechanical preservation after an Original capture, never authorization.
 * Only the caller's genuine read-recovery owner can supply the authenticated
 * checkpoint. Source's own validator checks every signature and signed grant. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const init='ORIGINAL_PUBLIC_SEPOLIA_DEFI_TARGET_ROW_V8',sourceInit='ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_ROW_V8';
const dynamic=new Set(['ORIGINAL_PUBLIC_SEPOLIA_DEFI_COMMAND_ROW_V8','ORIGINAL_PUBLIC_SEPOLIA_DEFI_APPROVAL_ROW_V8','ORIGINAL_PUBLIC_SEPOLIA_DEFI_TEST_LIQUIDITY_ROW_V8']);
export function assertPublicSepoliaDefiSourceCaptureV8(before,after,checkpoint,targetPlans){
 assert.ok(Number.isSafeInteger(before.revision)&&before.revision>=0&&Number.isSafeInteger(after.revision)&&after.revision>=before.revision);
 assert.deepEqual({...after,revision:before.revision,operations:before.operations},before,'PAEG_DEFI_SOURCE_CONFIGURATION_CHANGED');
 assert.equal(after.configurationSHA256,checkpoint.identity,'PAEG_DEFI_SOURCE_ORIGINAL_IDENTITY');assert.equal(after.revision,checkpoint.revision,'PAEG_DEFI_SOURCE_ORIGINAL_REVISION');assert.equal(createHash('sha256').update(JSON.stringify(after.operations)).digest('hex'),checkpoint.dataSHA256,'PAEG_DEFI_SOURCE_ORIGINAL_CHECKPOINT');
 assert.ok(after.operations.length>=before.operations.length,'PAEG_DEFI_SOURCE_REMOVED_OPERATION');
 for(let index=0;index<before.operations.length;index++){
  const a=before.operations[index],b=after.operations[index];
  for(const field of ['id','profile','command','policySHA256'])assert.deepEqual(b[field],a[field],'PAEG_DEFI_SOURCE_ORIGINAL_OPERATION_CHANGED');
  if(a.transaction!==null)assert.deepEqual(b.transaction,a.transaction,'PAEG_DEFI_SOURCE_ORIGINAL_TRANSACTION_CHANGED');
  else if(b.transaction!==null)assert.ok([init,sourceInit].includes(a.profile),'PAEG_DEFI_SOURCE_UNEXPECTED_INITIALIZATION');
  if(a.signed!==null)assert.deepEqual(b.signed,a.signed,'PAEG_DEFI_SOURCE_ORIGINAL_SIGNATURE_CHANGED');
  if(['FINALIZED','REVERTED'].includes(a.phase))assert.equal(b.phase,a.phase,'PAEG_DEFI_SOURCE_TERMINAL_PHASE_CHANGED');
 }
 for(const row of after.operations.slice(before.operations.length))assert.ok([init,sourceInit].includes(row.profile)||dynamic.has(row.profile),'PAEG_DEFI_SOURCE_UNEXPECTED_NEW_OPERATION');
 const protocolProfiles={AAVE_STATIC:'ORIGINAL_AAVE_SEPOLIA_INITIALIZATION_V4',MORPHO_V2:'ORIGINAL_MORPHO_V2_SEPOLIA_INITIALIZATION_V4'};
 assert.equal(after.operations.filter(row=>row.profile===init).length,14,'PAEG_DEFI_SOURCE_EXACT_INITIALIZATION_COUNT');
 for(const [protocol,profile]of Object.entries(protocolProfiles)){
  const rows=after.operations.filter(row=>row.profile===init&&row.command.profile===profile);assert.equal(rows.length,7,'PAEG_DEFI_SOURCE_COMPLETE_INITIALIZATION_REQUIRED');
  assert.deepEqual(rows.map(row=>row.command.index).sort((a,b)=>a-b),[0,1,2,3,4,5,6],'PAEG_DEFI_SOURCE_INITIALIZATION_SET');
  for(const row of rows){assert.equal(row.command.plan.planSHA256,targetPlans[protocol],'PAEG_DEFI_SOURCE_ORIGINAL_TARGET_PLAN');assert.equal(row.phase,'FINALIZED','PAEG_DEFI_SOURCE_INITIALIZATION_FINALITY');assert.ok(row.signed&&row.receipt,'PAEG_DEFI_SOURCE_ORIGINAL_INITIALIZATION_RECEIPT');}
 }
 const sourceRows=after.operations.filter(row=>row.profile===sourceInit);assert.equal(sourceRows.length,3,'PAEG_DEFI_SOURCE7_COMPLETE_INITIALIZATION_REQUIRED');
 assert.match(targetPlans.SOURCE7,/^[0-9a-f]{64}$/);const start=BigInt(sourceRows[0].command.plan.startNonce);for(const [index,row] of sourceRows.entries()){assert.equal(row.command.plan.planSHA256,targetPlans.SOURCE7,'PAEG_DEFI_SOURCE7_ORIGINAL_PLAN');assert.equal(row.command.constructor.nonce,(start+BigInt(index)).toString());assert.equal(row.phase,'FINALIZED','PAEG_DEFI_SOURCE7_INITIALIZATION_FINALITY');assert.ok(row.signed&&row.receipt,'PAEG_DEFI_SOURCE7_INITIALIZATION_RECEIPT');}
 return Object.freeze({preservedOperations:before.operations.length,operations:after.operations.length,initializationOperations:17,dynamicOperations:after.operations.filter(row=>dynamic.has(row.profile)).length});
}
