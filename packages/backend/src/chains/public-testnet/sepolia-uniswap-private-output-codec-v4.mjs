/** Pure fixed PUBLIC Router02/D27 framing. A valid DTO or proof-shaped byte
 * string never creates an original D27, READY, signer or balance capability. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {decodeDepositIntentInputs} from '@lianum/engine/execution/inputs/deposit-intent';
const ID=['chainId','router','solver','inputAsset','outputAsset','protocol','targetPool','inputCode','outputCode','protocolCode','poolCode','scope','policy'];
const ROUTE=['maximumInput','outputAmount','validFrom','validUntil'],KIND='UNISWAP_ROUTER02_SEPOLIA_EXACT_OUTPUT_PRIVATE_V4';
const fixed={inputAsset:'fff9976782d46cc05630d1f6ebab18b2324d6b14',outputAsset:'94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8',protocol:'3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e',inputCode:'9bbda01ae25d1f2b4171918cc6280a5769d6d6fc5500ed01e2143697902df4e1',outputCode:'583644aee778ddb688d4b61116b6259ef417b1a094dc8f8a578e0cfc099f4519',protocolCode:'e18dacff07368baa9974b34f1039c31726d374cd0838c7969232b9f287590562'};
const exact=(v,keys)=>{assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Reflect.ownKeys(v).sort(),keys.slice().sort());for(const k of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'),'SEPOLIA_UNISWAP_CODEC_DATA');};
const sha=v=>createHash('sha256').update(v).digest('hex'),hex=(v,bytes)=>{assert.ok(typeof v==='string'&&v.length===bytes*2&&new RegExp('^[0-9a-f]{'+bytes*2+'}$').test(v),'SEPOLIA_UNISWAP_CODEC_HEX');return v;};
const uint=(v,bits,positive=false)=>{assert.ok(typeof v==='string'&&v.length<=78&&/^(0|[1-9][0-9]*)$/.test(v));const n=BigInt(v);assert.equal(n.toString(),v);assert.ok(n<1n<<BigInt(bits)&&(!positive||n>0n),'SEPOLIA_UNISWAP_CODEC_UINT');return n;},word=v=>BigInt(v).toString(16).padStart(64,'0');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;},SELECTOR=publicKeccak256(Buffer.from('deliver(bytes32,bytes32,(uint128,uint64,uint64,uint64),bytes,bytes32[])')).subarray(0,4).toString('hex');
export function prepareSepoliaUniswapPrivateOutputPlanV4(input){
 assert.equal(arguments.length,1);exact(input,['identity','route','ownerPublicInputs']);const id=input.identity,r=input.route;exact(id,ID);exact(r,ROUTE);assert.equal(id.chainId,'11155111','SEPOLIA_UNISWAP_CODEC_CHAIN');
 for(const name of ['router','solver','inputAsset','outputAsset','protocol','targetPool']){hex(id[name],20);assert.notEqual(id[name],'0'.repeat(40));}
 assert.equal(new Set(['router','solver','inputAsset','outputAsset','protocol','targetPool'].map(k=>id[k])).size,6,'SEPOLIA_UNISWAP_CODEC_DISTINCT');
 for(const name of ['inputCode','outputCode','protocolCode','poolCode','scope','policy']){hex(id[name],32);assert.notEqual(id[name],'0'.repeat(64));}for(const [name,value]of Object.entries(fixed))assert.equal(id[name],value,'SEPOLIA_UNISWAP_FIXED_'+name);
 uint(r.maximumInput,128,true);uint(r.outputAmount,64,true);assert.ok(uint(r.validFrom,64)<uint(r.validUntil,64));
 const owner=decodeDepositIntentInputs(input.ownerPublicInputs);assert.equal(owner.scope,id.scope);assert.equal(owner.policy,id.policy);assert.equal(owner.amount,r.outputAmount);assert.ok(BigInt(owner.validFrom)<=BigInt(r.validFrom)&&BigInt(r.validUntil)<=BigInt(owner.validUntil),'SEPOLIA_UNISWAP_OWNER_WINDOW');
 const words=[sha('LIANUM/EXTERNAL/EXACT-OUTPUT/1'),word(id.chainId),...['router','solver','inputAsset','outputAsset','protocol','targetPool'].map(k=>id[k].padStart(64,'0')),
  ...['inputCode','outputCode','protocolCode','poolCode','scope','policy'].map(k=>id[k]),sha(KIND),...ROUTE.map(k=>word(r[k])),owner.output];
 assert.equal(words.length,20);return freeze({profile:'SEPOLIA_UNISWAP_PRIVATE_OUTPUT_PLAN_DATA_V4',descriptor:sha(Buffer.from(words.join(''),'hex')),protocolKind:KIND,ownerOutput:owner.output,
  maximumInput:r.maximumInput,outputAmount:r.outputAmount,validFrom:r.validFrom,validUntil:r.validUntil,transactionValueWei:r.maximumInput,fee:'3000',proofAccepted:false,dispatchAuthorized:false,privateBalanceCredited:false});
}
export function encodeSepoliaUniswapPrivateOutputCallV4(input){
 assert.equal(arguments.length,1);exact(input,['plan','receiptCommitment','proof']);hex(input.receiptCommitment,32);assert.notEqual(input.receiptCommitment,'0'.repeat(64));assert.ok(typeof input.proof==='string'&&input.proof.length>0&&input.proof.length<=131072&&input.proof.length%2===0&&/^[0-9a-f]+$/.test(input.proof),'SEPOLIA_UNISWAP_PROOF_BYTES');
 const prepared=prepareSepoliaUniswapPrivateOutputPlanV4(input.plan),body=word(input.proof.length/2)+input.proof.padEnd(Math.ceil(input.proof.length/64)*64,'0'),inputs=word(27)+input.plan.ownerPublicInputs.map(word).join('');
 return freeze({descriptor:prepared.descriptor,ownerOutput:prepared.ownerOutput,calldata:'0x'+SELECTOR+[input.receiptCommitment,prepared.descriptor,...ROUTE.map(k=>word(input.plan.route[k])),word(256),word(256+body.length/2)].join('')+body+inputs,
  transactionValueWei:prepared.transactionValueWei,proofAccepted:false,dispatchAuthorized:false});
}
export function decodeSepoliaUniswapPrivateOutputCallV4(input){
 assert.equal(arguments.length,1);exact(input,['calldata','identity']);assert.ok(typeof input.calldata==='string'&&input.calldata.length<=262146&&/^0x(?:[0-9a-f]{2})+$/.test(input.calldata));const raw=input.calldata.slice(2);assert.equal(raw.slice(0,8),SELECTOR);const body=raw.slice(8),at=i=>body.slice(i*64,(i+1)*64);assert.ok(body.length>=9*64);
 const receiptCommitment=at(0),claimed=at(1),route=Object.fromEntries(ROUTE.map((k,i)=>[k,BigInt('0x'+at(i+2)).toString()]));assert.equal(BigInt('0x'+at(6)),256n,'SEPOLIA_UNISWAP_PROOF_OFFSET');
 const length=BigInt('0x'+at(8));assert.ok(length>0n&&length<=65536n);const padded=Math.ceil(Number(length)/32)*32,offset=256+32+padded;assert.equal(BigInt('0x'+at(7)),BigInt(offset));assert.equal(body.length,(offset+32+27*32)*2,'SEPOLIA_UNISWAP_NO_TRAILING_CALLDATA');
 const proof=body.slice(9*64,9*64+Number(length)*2);assert.equal(body.slice(9*64+Number(length)*2,offset*2),'0'.repeat((padded-Number(length))*2),'SEPOLIA_UNISWAP_ZERO_PADDING');assert.equal(BigInt('0x'+body.slice(offset*2,(offset+32)*2)),27n);
 const ownerPublicInputs=Array.from({length:27},(_,i)=>BigInt('0x'+body.slice((offset+32+i*32)*2,(offset+64+i*32)*2)).toString()),plan={identity:structuredClone(input.identity),route,ownerPublicInputs};
 const encoded=encodeSepoliaUniswapPrivateOutputCallV4({plan,receiptCommitment,proof});assert.equal(encoded.descriptor,claimed);assert.equal(encoded.calldata,input.calldata);
 return freeze({plan,receiptCommitment,proof,descriptor:claimed,ownerOutput:encoded.ownerOutput,transactionValueWei:route.maximumInput,proofAccepted:false,dispatchAuthorized:false});
}
export function decodeSepoliaUniswapPrivateOutputEventV4(input){
 assert.equal(arguments.length,1);exact(input,['address','topics','data','call']);const call=input.call;assert.equal(input.address,'0x'+call.plan.identity.router);assert.ok(Array.isArray(input.topics)&&input.topics.length===2);assert.equal(input.topics[0],'0x'+publicKeccak256(Buffer.from('Delivered(bytes32,bytes32,bytes32,uint256,uint64,uint32,uint64)')).toString('hex'));assert.equal(input.topics[1],'0x'+call.receiptCommitment);assert.match(input.data,/^0x[0-9a-f]{384}$/);
 const words=Array.from({length:6},(_,i)=>input.data.slice(2+i*64,66+i*64));assert.equal(words[0],call.descriptor);assert.equal(words[1],call.ownerOutput);const spent=BigInt('0x'+words[2]),amount=BigInt('0x'+words[3]),index=BigInt('0x'+words[4]),sequence=BigInt('0x'+words[5]);assert.ok(spent>0n&&spent<=BigInt(call.plan.route.maximumInput));assert.equal(amount,BigInt(call.plan.route.outputAmount));assert.ok(index<64n&&sequence>0n&&sequence<1n<<64n);
 return freeze({profile:'SEPOLIA_UNISWAP_PRIVATE_OUTPUT_EVENT_DATA_V4',receiptCommitment:call.receiptCommitment,descriptor:call.descriptor,ownerOutput:call.ownerOutput,inputSpent:spent.toString(),outputAmount:amount.toString(),leafIndex:index.toString(),poolSequence:sequence.toString(),chainInclusionEstablished:false,privateBalanceCredited:false});
}
