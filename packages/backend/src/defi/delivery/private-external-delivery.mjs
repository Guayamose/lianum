/** Owner D27-bound external protocol route codec. No signer, send or credit.
 * Intended path: wallet-platform/modules/defi-adapters/private-external-delivery.mjs.
 * Receiving original pool remains the proof verifier and backing authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exactRecord} from '../../execution/encoding/commitments.mjs';
import {decodeDepositIntentInputs} from '../../execution/account/preparation/deposit-intent.mjs';
import {publicKeccak256} from '../../../../engine/src/cohorts/private-cohort-public-native.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ID=['chainId','router','solver','inputAsset','outputAsset','protocol','targetPool','inputCode','outputCode','protocolCode','poolCode','scope','policy'];
function hex(v,n){assert.ok(typeof v==='string'&&new RegExp(`^[0-9a-f]{${n*2}}$`).test(v)&&v.length===n*2,'CANONICAL_HEX');return v;}
function integer(v,bits){assert.ok(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v));const n=BigInt(v);assert.equal(n.toString(),v);assert.ok(n<(1n<<BigInt(bits)));return n;}
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const address=v=>{hex(v,20);assert.notEqual(v,'0'.repeat(40));return v.padStart(64,'0');};
export function preparePrivateExternalDelivery(input){
 exactRecord(input,['identity','protocolKind','fee','route','ownerPublicInputs']);
 const id=input.identity,r=input.route;exactRecord(id,ID);exactRecord(r,['maximumInput','outputAmount','validFrom','validUntil']);
 assert.ok(integer(id.chainId,256)>0n);assert.notEqual(id.inputAsset,id.outputAsset);
 for(const k of ['inputCode','outputCode','protocolCode','poolCode','scope','policy'])hex(id[k],32);
 assert.ok(integer(r.maximumInput,128)>0n);assert.ok(integer(r.outputAmount,64)>0n);
 assert.ok(integer(r.validFrom,64)<integer(r.validUntil,64));
 const statement=decodeDepositIntentInputs(input.ownerPublicInputs);
 assert.equal(statement.scope,id.scope);assert.equal(statement.policy,id.policy);assert.equal(statement.amount,r.outputAmount);
 assert.ok(BigInt(statement.validFrom)<=BigInt(r.validFrom)&&BigInt(r.validUntil)<=BigInt(statement.validUntil),'ORIGINAL_OWNER_WINDOW');
 let protocolBinding;
 if(input.protocolKind==='UNISWAP_V3_EXACT_OUTPUT_SINGLE'){
  assert.ok(['100','500','3000','10000'].includes(input.fee));
  protocolBinding=sha(Buffer.from(sha('UNISWAP_V3_EXACT_OUTPUT_SINGLE')+word(input.fee),'hex'));
 }else{
  assert.ok(['METAMORPHO_V1_EXACT_SHARE_MINT','AAVE_V3_STATIC_EXACT_SHARE_MINT'].includes(input.protocolKind));assert.equal(input.fee,null);assert.equal(id.protocol,id.outputAsset);
  protocolBinding=sha(input.protocolKind);
 }
 const words=[sha('LIANUM/EXTERNAL/EXACT-OUTPUT/1'),word(id.chainId),...['router','solver','inputAsset','outputAsset','protocol','targetPool'].map(k=>address(id[k])),
  ...['inputCode','outputCode','protocolCode','poolCode','scope','policy'].map(k=>id[k]),protocolBinding,
  ...['maximumInput','outputAmount','validFrom','validUntil'].map(k=>word(r[k])),statement.output];
 return Object.freeze({schema:'PRIVATE_EXTERNAL_DELIVERY_OWNER_PLAN_V1',descriptor:sha(Buffer.from(words.join(''),'hex')),
  protocolKind:input.protocolKind,ownerOutput:statement.output,outputAmount:r.outputAmount,maximumInput:r.maximumInput,
  validFrom:r.validFrom,validUntil:r.validUntil,proofAccepted:false,privateBalanceCredited:false,
  guarantee:'LEDGER_ATOMIC_PROTOCOL_ACTION_AND_ORIGINAL_PRIVATE_POOL_DEPOSIT',
  publicExposure:Object.freeze(['protocol','inputAsset','outputAsset','amounts','timing','solver','depositCommitment']),
  graphSettlementEstablished:false});
}

/** Calldata only; receipt commitment must come from the original registered leg.
 * Passing this codec does not grant a dispatch capability or establish a proof. */
export function encodePrivateExternalDelivery(input){
 assert.equal(arguments.length,1);const selector=publicKeccak256(Buffer.from('deliver(bytes32,bytes32,(uint128,uint64,uint64,uint64),bytes,bytes32[])')).subarray(0,4).toString('hex');
 exactRecord(input,['plan','receiptCommitment','proof']);
 hex(selector,4);hex(input.receiptCommitment,32);assert.notEqual(input.receiptCommitment,'0'.repeat(64));
 assert.ok(typeof input.proof==='string'&&input.proof.length>0&&input.proof.length<=131072
   &&input.proof.length%2===0&&/^[0-9a-f]+$/.test(input.proof),'CANONICAL_PROOF_BYTES');
 const prepared=preparePrivateExternalDelivery(input.plan),route=input.plan.route;
 const proofBody=word(input.proof.length/2)+input.proof.padEnd(Math.ceil(input.proof.length/64)*64,'0');
 const publicBody=word(27)+input.plan.ownerPublicInputs.map(word).join('');
 const heads=[input.receiptCommitment,prepared.descriptor,...['maximumInput','outputAmount','validFrom','validUntil'].map(k=>word(route[k])),word(8*32),word(8*32+proofBody.length/2)];
 return Object.freeze({descriptor:prepared.descriptor,calldata:'0x'+selector+heads.join('')+proofBody+publicBody,
  ownerOutput:prepared.ownerOutput,proofAccepted:false,dispatchAuthorized:false});
}

/** Strict inverse used by a future owned canonical-receipt observer. This pure
 * function validates bytes, not chain inclusion, finality or reimbursement. */
export function decodePrivateExternalDeliveryCall(input){
 exactRecord(input,['calldata','identity','protocolKind','fee']);
 const data=input.calldata;assert.ok(typeof data==='string'&&data.length<=262146&&data.startsWith('0x'));
 const raw=data.slice(2);assert.equal(Buffer.from(raw,'hex').toString('hex'),raw);assert.ok(raw.length>=8+8*64);
 const selector=publicKeccak256(Buffer.from('deliver(bytes32,bytes32,(uint128,uint64,uint64,uint64),bytes,bytes32[])')).subarray(0,4).toString('hex');
 assert.equal(raw.slice(0,8),selector,'FIXED_EXTERNAL_SELECTOR');const body=raw.slice(8),at=i=>body.slice(i*64,(i+1)*64);
 const receiptCommitment=at(0),claimedDescriptor=at(1);assert.notEqual(receiptCommitment,'0'.repeat(64));
 const route=Object.fromEntries(['maximumInput','outputAmount','validFrom','validUntil'].map((k,i)=>[k,BigInt('0x'+at(i+2)).toString()]));
 assert.equal(BigInt('0x'+at(6)),256n,'FIXED_PROOF_OFFSET');
 const proofLength=BigInt('0x'+at(8));assert.ok(proofLength>0n&&proofLength<=65536n);
 const proofWords=Math.ceil(Number(proofLength)/32),publicOffset=256+32+proofWords*32;
 assert.equal(BigInt('0x'+at(7)),BigInt(publicOffset),'FIXED_PUBLIC_OFFSET');
 const proofStart=9*64,proof=body.slice(proofStart,proofStart+Number(proofLength)*2);
 assert.equal(body.slice(proofStart+Number(proofLength)*2,publicOffset*2),'0'.repeat(proofWords*64-Number(proofLength)*2),'ZERO_ABI_PADDING');
 assert.equal(body.length,(publicOffset+32+27*32)*2,'NO_TRAILING_CALLDATA');
 assert.equal(BigInt('0x'+body.slice(publicOffset*2,(publicOffset+32)*2)),27n,'D27_ARRAY_LENGTH');
 const ownerPublicInputs=Array.from({length:27},(_,i)=>BigInt('0x'+body.slice((publicOffset+32+i*32)*2,(publicOffset+64+i*32)*2)).toString());
 const plan={identity:input.identity,protocolKind:input.protocolKind,fee:input.fee,route,ownerPublicInputs};
 const prepared=preparePrivateExternalDelivery(plan);assert.equal(prepared.descriptor,claimedDescriptor,'EXACT_EXTERNAL_DESCRIPTOR');
 assert.equal(encodePrivateExternalDelivery({plan,receiptCommitment,proof}).calldata,data,'CANONICAL_EXTERNAL_CALLDATA');
 return Object.freeze({plan:Object.freeze({...plan,identity:Object.freeze(Object.fromEntries(ID.map(k=>[k,input.identity[k]]))),route:Object.freeze(route),ownerPublicInputs:Object.freeze(ownerPublicInputs)}),receiptCommitment,proof,
  descriptor:prepared.descriptor,ownerOutput:prepared.ownerOutput,chainInclusionEstablished:false});
}

export function decodePrivateExternalDeliveryEvent(input){
 exactRecord(input,['address','topics','data','call']);const {call}=input;
 assert.equal(input.address,'0x'+call.plan.identity.router,'ORIGINAL_EXTERNAL_ROUTER');
 assert.ok(Array.isArray(input.topics)&&input.topics.length===2);
 const topic='0x'+publicKeccak256(Buffer.from('Delivered(bytes32,bytes32,bytes32,uint256,uint64)')).toString('hex');
 assert.equal(input.topics[0],topic);assert.equal(input.topics[1],'0x'+call.receiptCommitment);
 assert.ok(typeof input.data==='string'&&input.data.length===2+4*64&&/^0x[0-9a-f]+$/.test(input.data));
 const words=Array.from({length:4},(_,i)=>input.data.slice(2+i*64,2+(i+1)*64));
 assert.equal(words[0],call.descriptor);assert.equal(words[1],call.ownerOutput);
 const spent=BigInt('0x'+words[2]),output=BigInt('0x'+words[3]);
 assert.ok(spent>0n&&spent<=BigInt(call.plan.route.maximumInput));assert.equal(output,BigInt(call.plan.route.outputAmount));
 return Object.freeze({descriptor:words[0],ownerOutput:words[1],receiptCommitment:call.receiptCommitment,inputSpent:spent.toString(),outputAmount:output.toString(),chainInclusionEstablished:false});
}
