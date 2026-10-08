import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {base58Encode,base58Decode} from '../../../../src/chains/solana/runtime/owned-solana-runtime.mjs';
import {claimActionFrame,claimBackingFrame,CLAIM_ACTION_FIELDS,CLAIM_BACKING_FIELDS} from '../../../../src/claims/authorization/permits.mjs';
import {NATIVE_SPL_CUSTODY_V1,NATIVE_SPL_CUSTODY_SOURCE_REVIEW_V1,NATIVE_SPL_CUSTODY_COMPILED_RELEASE_V1,nativeSplAssetCommitmentV1,encodeNativeSplAuthorizeV1,encodeNativeSplAuthorizeMessageV1,encodeNativeSplSwapMessageV1,decodeNativeSplInventoryV1} from '../../../../src/chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),b32=n=>n.toString(16).padStart(64,'0'),pk=n=>base58Encode(Buffer.from(b32(n),'hex'));
function fixture(){
 const claimDomain=b32(1),action={action:'6',operationId:b32(2),revision:'1',amount:'100',destinationCommitment:b32(3),maxFee:'5000',nullifier:b32(4),wireBindingCommitment:b32(5),routeCommitment:b32(6),claimSequence:'7',hubSequence:'8'};
 const message={claimDomain,custodyInventoryDomain:b32(9),actionDigest:hash(claimActionFrame(claimDomain,action)),expectedClaimSequence:'7',hubStateSequence:'8',revocationState:b32(10),wrapperSupply:'200',pendingRedemptions:'100',pendingRefunds:'0',heldUnissued:'0',unknownExposure:'0',nativePrincipalAvailable:'300',feeReserveAvailable:'10000',reservedFeesAfter:'5000',inventoryCommitment:b32(11),obligationsCommitment:b32(12),validFrom:'1000',validUntil:'1030'};
 return {claimDomain,action,permit:{message,indexes:[0,1,3],signatures:['11'.repeat(64),'22'.repeat(64),'33'.repeat(64)]}};
}
function rawFrame(tag,frame,widths){const bytes=Buffer.from(tag,'ascii');assert.ok(frame.subarray(4,4+bytes.length).equals(bytes));let at=4+bytes.length;const out=[];for(const width of widths){assert.equal(frame.readUInt32BE(at),width);at+=4;out.push(frame.subarray(at,at+width));at+=width;}assert.equal(at,frame.length);return Buffer.concat(out);}
test('new SPL wire preserves exact original action/backing bytes and native 1232-byte cap',()=>{
 const f=fixture(),data=encodeNativeSplAuthorizeV1(f);assert.equal(data.length,878);
 const af=claimActionFrame(f.claimDomain,f.action),bf=claimBackingFrame(f.permit.message);
 const actionParts=rawFrame('LIANUM/PAEG/native-claim-action/1',af,[32,...CLAIM_ACTION_FIELDS.map(x=>x[1])]).subarray(32);
 const backingParts=rawFrame('LIANUM/PAEG/native-claim-backing-permit/1',bf,CLAIM_BACKING_FIELDS.map(([,t])=>t==='b32'?32:Number(t.slice(1))/8));
 assert.ok(data.subarray(2,203).equals(actionParts));assert.ok(data.subarray(203,683).equals(backingParts));assert.deepEqual([...data.subarray(683,686)],[0,1,3]);
 const wire=encodeNativeSplAuthorizeMessageV1({...f,payer:pk(21),config:pk(22),vault:pk(23),ticket:pk(24),blockhash:pk(25)});assert.ok(wire.message.length+65<=1232);
 const old=structuredClone(f);old.action.amount='101';assert.throws(()=>encodeNativeSplAuthorizeV1(old),/SPL_ORIGINAL_ACTION_BINDING/);
 const expired=structuredClone(f);expired.permit.message.validUntil='1031';assert.throws(()=>encodeNativeSplAuthorizeV1(expired),/CLAIM_PERMIT_WINDOW/);
 const unknown=structuredClone(f);unknown.permit.message.unknownExposure='1';assert.throws(()=>encodeNativeSplAuthorizeV1(unknown),/SPL_UNKNOWN_PRINCIPAL_FENCE/);
 const reversed=structuredClone(f);reversed.permit.indexes=[1,0,3];assert.throws(()=>encodeNativeSplAuthorizeV1(reversed),/SPL_ORIGINAL_QUORUM_INDEXES/);
 assert.equal(NATIVE_SPL_CUSTODY_SOURCE_REVIEW_V1,null);assert.equal(NATIVE_SPL_CUSTODY_COMPILED_RELEASE_V1,null);
 // Dummy signature bytes above are codec metadata, never a cryptographic/native acceptance.
});
test('SPL principal is actual token amount, separately from SOL rent and fees',()=>{
 const p=NATIVE_SPL_CUSTODY_V1,c=Buffer.alloc(p.configBytes),t=Buffer.alloc(165);c.write('LNSPL001');c.writeBigUInt64BE(300n,592);Buffer.from(b32(7),'hex').copy(c,72);Buffer.from(nativeSplAssetCommitmentV1({genesis:b32(7),config:pk(21),vault:pk(22)}),'hex').copy(c,104);Buffer.from(b32(2),'hex').copy(c,136);Buffer.from(b32(3),'hex').copy(c,168);
 base58Decode(p.mint,32).copy(t);Buffer.from(b32(21),'hex').copy(t,32);t.writeBigUInt64LE(300n,64);t[108]=1;
 const input={config:pk(21),vault:pk(22),configOwner:p.program,vaultOwner:p.tokenProgram,configData:c.toString('hex'),vaultData:t.toString('hex'),feeLamports:'1000000',feeRentMinimum:'2000',tickets:[]};
 const got=decodeNativeSplInventoryV1(input);assert.equal(got.nativePrincipalAvailable,'300');assert.equal(got.feeReserveAvailable,'998000');assert.equal(got.principalUnit,'SPL_USDC_BASE_UNIT');assert.equal(got.feeUnit,'SOL_LAMPORT');assert.equal(got.privateCreditEstablished,false);
 t.writeBigUInt64LE(301n,64);assert.throws(()=>decodeNativeSplInventoryV1({...input,vaultData:t.toString('hex')}),/SPL_OBSERVED_PRINCIPAL_BACKING/);
 assert.throws(()=>decodeNativeSplInventoryV1({...input,vaultOwner:p.program}));
 const swap=encodeNativeSplSwapMessageV1({payer:pk(21),config:pk(22),vault:pk(23),receipt:pk(24),source:pk(25),refund:pk(26),blockhash:pk(27),wireKeyCommitment:b32(28),amount:'100',quotedOutput:'130'});assert.ok(swap.message.length+65<=1232);
});
test('observed live tickets sum to reserved principal and never become free principal',()=>{
 const p=NATIVE_SPL_CUSTODY_V1,c=Buffer.alloc(p.configBytes),t=Buffer.alloc(165),ticket=Buffer.alloc(p.ticketBytes);c.write('LNSPL001');c.writeBigUInt64BE(100n,592);c.writeBigUInt64BE(80n,600);
 Buffer.from(b32(7),'hex').copy(c,72);Buffer.from(nativeSplAssetCommitmentV1({genesis:b32(7),config:pk(21),vault:pk(22)}),'hex').copy(c,104);
 base58Decode(p.mint,32).copy(t);Buffer.from(b32(21),'hex').copy(t,32);t.writeBigUInt64LE(100n,64);t[108]=1;
 ticket.write('LNSPT001');Buffer.from(b32(21),'hex').copy(ticket,8);Buffer.from(b32(99),'hex').copy(ticket,40);ticket.writeBigUInt64BE(80n,120);
 const value={config:pk(21),vault:pk(22),configOwner:p.program,vaultOwner:p.tokenProgram,configData:c.toString('hex'),vaultData:t.toString('hex'),feeLamports:'10000',feeRentMinimum:'2000',tickets:[{address:pk(31),owner:p.program,data:ticket.toString('hex')}]};
 const got=decodeNativeSplInventoryV1(value);assert.equal(got.nativePrincipalAvailable,'100');assert.equal(got.nativePrincipalReserved,'80');assert.equal(got.nativePrincipalFree,'20');
 assert.throws(()=>decodeNativeSplInventoryV1({...value,tickets:[]}),/SPL_COMPLETE_RESERVED_TICKET_PRINCIPAL/);
 assert.throws(()=>decodeNativeSplInventoryV1({...value,tickets:[...value.tickets,...value.tickets]}),/SPL_DUPLICATE_TICKET/);
 c.writeBigUInt64BE(101n,600);assert.throws(()=>decodeNativeSplInventoryV1({...value,configData:c.toString('hex')}),/SPL_AUTHORIZED_PRINCIPAL_OVERALLOCATED/);
});
