/** Pure incoming-note validation. Only the privately branded observer may feed
 * this branch in production. It never establishes provider reimbursement. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {decodeDepositIntentInputs} from '../../../backend/src/execution/account/preparation/deposit-intent.mjs';
import {decodePrivateExternalDeliveryCall} from '../../../backend/src/defi/delivery/private-external-delivery.mjs';
import {flatOwnerIdentity,flatOwnerSnapshot,ownerCopy,ownerDigest,FLAT_OWNER_OBSERVATION_TRUST} from '../signing/flat-owner-custody.mjs';
export const FLAT_OWNER_EXTERNAL_D27_DELIVERY_V1 = 'FLAT_OWNER_EXTERNAL_D27_DELIVERY_V1';
const hex=(value,bytes=32)=>assert.ok(typeof value==='string'&&new RegExp(`^[0-9a-f]{${bytes*2}}$`).test(value),'EXTERNAL_INCOMING_HEX');
const uint=value=>{assert.ok(typeof value==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(value),'EXTERNAL_INCOMING_UINT');const n=BigInt(value);assert.ok(n<(1n<<256n));return n;};
const same=(left,right)=>assert.deepEqual(left,right);
export function inspectExternalIncomingLedgerV1(input,identity) {
  const o=ownerCopy(input),id=flatOwnerIdentity(identity);
  assert.ok(id.assetBinding,'EXTERNAL_INCOMING_TOKEN_REQUIRED');
  exactRecord(o,['kind','identitySHA256','transaction','receipt','chainContext','before','after','stateAdvanced','delivery','deliveryEvent','assetObservation']);
  assert.equal(o.kind,FLAT_OWNER_EXTERNAL_D27_DELIVERY_V1);assert.equal(o.identitySHA256,ownerDigest(id));
  const tx=o.transaction,d=o.delivery;
  exactRecord(tx,['hash','from','to','value','calldata','chainId','nonce','gas','gasPrice']);
  hex(tx.hash);hex(tx.from,20);hex(tx.to,20);for(const key of ['value','chainId','nonce','gas','gasPrice'])uint(tx[key]);
  assert.equal(tx.value,'0');
  assert.ok(typeof tx.calldata==='string'&&/^0x(?:[0-9a-f]{2})+$/.test(tx.calldata));
  const calldataSHA256=createHash('sha256').update(Buffer.from(tx.calldata.slice(2),'hex')).digest('hex');
  exactRecord(o.receipt,['transactionHash','blockHash','blockNumber','status']);
  assert.equal(o.receipt.transactionHash,tx.hash);assert.equal(o.receipt.status,1);hex(o.receipt.blockHash);assert.ok(uint(o.receipt.blockNumber)>0n);
  exactRecord(o.chainContext,['genesisHash','parentBlockHash','minimumConfirmations','classification']);
  hex(o.chainContext.genesisHash);hex(o.chainContext.parentBlockHash);
  assert.equal(o.chainContext.minimumConfirmations,'1');assert.equal(o.chainContext.classification,FLAT_OWNER_OBSERVATION_TRUST);
  exactRecord(d,['identity','protocolKind','fee','descriptor','receiptCommitment','publicInputs']);
  const call=decodePrivateExternalDeliveryCall({calldata:tx.calldata,identity:d.identity,protocolKind:d.protocolKind,fee:d.fee});
  assert.equal(call.descriptor,d.descriptor);assert.equal(call.receiptCommitment,d.receiptCommitment);
  same(call.plan.ownerPublicInputs,d.publicInputs);const statement=decodeDepositIntentInputs(d.publicInputs);
  for(const [key,value] of Object.entries({chainId:tx.chainId,router:tx.to,solver:tx.from,targetPool:id.pool,
    outputAsset:id.assetBinding.token,scope:id.domain.scope,policy:id.domain.policy}))assert.equal(d.identity[key],value,'EXTERNAL_INCOMING_DOMAIN');
  assert.equal(call.plan.route.outputAmount,statement.amount);
  const before=flatOwnerSnapshot(o.before,id),after=flatOwnerSnapshot(o.after,id),b=before.publicState,a=after.publicState,q=uint(statement.amount);
  assert.ok(q>0n);assert.equal(o.chainContext.parentBlockHash,before.raw.blockHash);assert.equal(o.receipt.blockHash,after.raw.blockHash);
  assert.ok(BigInt(after.raw.timestamp)>=BigInt(before.raw.timestamp));
  for(const [start,end]of [[statement.validFrom,statement.validUntil],[call.plan.route.validFrom,call.plan.route.validUntil]])
    assert.ok(BigInt(after.raw.timestamp)>=BigInt(start)&&BigInt(after.raw.timestamp)<BigInt(end),'EXTERNAL_INCOMING_WINDOW');
  assert.equal(BigInt(a.sequence),BigInt(b.sequence)+1n);
  assert.ok(!before.commitments.includes('0x'+statement.output),'EXTERNAL_INCOMING_ALREADY_INSERTED');
  same(after.commitments,[...before.commitments,'0x'+statement.output]);same(after.nullifiers,before.nullifiers);same(after.roots,[...before.roots,a.root]);
  assert.equal(a.leaves,b.leaves+1);assert.equal(a.spent,b.spent);assert.equal(a.spentDigest,b.spentDigest);
  assert.equal(a.liveReservations,b.liveReservations);assert.equal(a.outputCapacity,b.outputCapacity+1);
  for(const key of ['backedAmount','actualAssetBalance'])assert.equal(BigInt(a[key]),BigInt(b[key])+q);
  for(const key of ['surplus','unrelatedNative'])assert.equal(a[key],b[key]);
  same(o.stateAdvanced,{address:id.pool,transactionHash:tx.hash,blockHash:o.receipt.blockHash,sequence:a.sequence,root:a.root,spent:a.spentDigest,leaves:a.leaves,consumed:a.spent});
  const event=o.deliveryEvent;
  exactRecord(event,['address','transactionHash','blockHash','position','descriptor','ownerOutput','receiptCommitment','inputSpent','outputAmount']);
  assert.equal(event.address,tx.to);assert.equal(event.transactionHash,tx.hash);assert.equal(event.blockHash,o.receipt.blockHash);
  assert.ok(Number.isSafeInteger(event.position)&&event.position>=0);assert.equal(event.descriptor,d.descriptor);
  assert.equal(event.ownerOutput,statement.output);assert.equal(event.receiptCommitment,d.receiptCommitment);assert.equal(event.outputAmount,statement.amount);
  const spent=uint(event.inputSpent);assert.ok(spent>0n&&spent<=uint(call.plan.route.maximumInput));
  const movement=o.assetObservation;
  exactRecord(movement,['kind','token','codeHash','pool','inputAsset','inputCodeSHA256','router','solver','before','after']);
  for(const [key,value]of Object.entries({kind:'PRIVATE_EXTERNAL_D27_INCOMING',token:id.assetBinding.token,codeHash:id.assetBinding.codeHash,pool:id.pool,
    inputAsset:d.identity.inputAsset,inputCodeSHA256:d.identity.inputCode,router:tx.to,solver:tx.from}))assert.equal(movement[key],value);
  const balances=['poolOutput','solverInput','routerInput','routerOutput','solverAllowance','protocolAllowance','poolAllowance'];
  for(const [phase,snapshot]of [['before',before],['after',after]]){exactRecord(movement[phase],['blockHash',...balances]);assert.equal(movement[phase].blockHash,snapshot.raw.blockHash);balances.forEach(key=>uint(movement[phase][key]));assert.equal(movement[phase].poolOutput,snapshot.publicState.actualAssetBalance);}
  assert.equal(uint(movement.after.poolOutput),uint(movement.before.poolOutput)+q);
  assert.equal(uint(movement.before.solverInput),uint(movement.after.solverInput)+spent);
  for(const key of ['routerInput','routerOutput'])assert.equal(movement.after[key],movement.before[key]);
  assert.equal(movement.before.solverAllowance,call.plan.route.maximumInput);assert.equal(movement.after.solverAllowance,'0');
  for(const phase of ['before','after'])for(const key of ['protocolAllowance','poolAllowance'])assert.equal(movement[phase][key],'0');
  return {transactionHash:tx.hash,blockHash:o.receipt.blockHash,postRoot:a.root,postSequence:a.sequence,calldataSHA256,
    trust:FLAT_OWNER_OBSERVATION_TRUST,assetObservationSHA256:ownerDigest(movement),observationSHA256:ownerDigest(o),
    descriptorCommitment:d.descriptor,receiptKeyCommitment:d.receiptCommitment};
}

/** The private owner adds original job/proof/opening identity before invoking
 * the same ledger validator used by the branded incoming observer. */
export function validateFlatOwnerExternalIncomingV1(input,operation,state,inclusion=operation.submission) {
  const o=ownerCopy(input),id=flatOwnerIdentity(state.identity);
  assert.equal(operation.kind,'deposit_intent');assert.ok(operation.proof&&inclusion&&id.assetBinding,'EXTERNAL_INCOMING_ORIGINAL_INTENT_REQUIRED');
  exactRecord(inclusion,['transactionHash','calldataSHA256']);hex(inclusion.transactionHash);hex(inclusion.calldataSHA256);
  const d=o.delivery,call=decodePrivateExternalDeliveryCall({calldata:o.transaction.calldata,identity:d.identity,protocolKind:d.protocolKind,fee:d.fee});
  assert.equal(call.proof,operation.proof.proof,'EXTERNAL_INCOMING_ORIGINAL_PROOF');
  same(call.plan.ownerPublicInputs,operation.publicInputs);same(decodeDepositIntentInputs(call.plan.ownerPublicInputs),operation.statement);
  assert.equal(operation.statement.output,state.notes.source.commitment,'EXTERNAL_INCOMING_ORIGINAL_OPENING');
  assert.equal(operation.statement.amount,state.notes.source.opening.value,'EXTERNAL_INCOMING_ORIGINAL_OPENING');
  const confirmation=inspectExternalIncomingLedgerV1(o,id);
  assert.equal(confirmation.transactionHash,inclusion.transactionHash,'EXTERNAL_INCOMING_ORIGINAL_SUBMISSION');
  assert.equal(confirmation.calldataSHA256,inclusion.calldataSHA256,'EXTERNAL_INCOMING_CALLDATA');
  return confirmation;
}
