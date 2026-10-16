/** Readonly corroboration of retained executor collection. DATA here never
 * issues a Source command, note signer, proof slot or automation permission. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
import * as A from '@lianum/mobile-protocol/device/paged-automation-v5';
import * as XP from '@lianum/mobile-protocol/device/paged-executor-payout-v5';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {readSepoliaExecutorPayoutTermsDataV5} from '../../chains/public-testnet/sepolia-executor-payout-fees-v5.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
/** Caller has already reconstructed the same OWNER with the Original readonly
 * recovery validator. Keep only signed terms/public graph DATA, never keys. */
export function readPagedExecutorPayoutCurrentContextDataV5(identity,descriptor,graph,automation){
 if(automation?.terms?.profile!==A.DEVICE_PAGED_AUTOMATION_V5)return null;
 const terms=A.normalizeDevicePagedAutomationTermsAnyV5(automation.terms),consent=C.normalizeDevicePagedGraphConsentV3(automation.consent);
 assert.equal(consent.action,'START_AUTOMATION');assert.deepEqual(consent.descriptor,descriptor);assert.equal(terms.descriptorSHA256,sha(JSON.stringify(descriptor)));
 for(const k of ['graphId','rootId','revision']){assert.equal(terms[k],graph[k]);assert.equal(consent[k],graph[k]);}
 for(const k of ['authorizationRoot','reserveNullifier','budget','nodes','settleBefore'])assert.equal(terms[k],graph.public[k]);
 assert.equal(consent.authorizationRoot,terms.authorizationRoot);assert.equal(consent.commandSHA256,sha(JSON.stringify(A.devicePagedAutomationRequestFromTermsV5(terms))));
 assert.match(automation.signature,/^[0-9a-f]{128}$/);const r=BigInt('0x'+automation.signature.slice(0,64)),s=BigInt('0x'+automation.signature.slice(64));assert.ok(r>0n&&r<order&&s>0n&&s<=order/2n,'PAGED_EXECUTOR_PAYOUT_CURRENT_SIGNATURE');
 const pub=descriptor.devicePublicKey,key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')}});assert.ok(verify('sha256',C.devicePagedGraphPermissionMessageV3(consent),{key,dsaEncoding:'ieee-p1363'},Buffer.from(automation.signature,'hex')),'PAGED_EXECUTOR_PAYOUT_CURRENT_SIGNATURE');
 return Object.freeze(structuredClone({identity,descriptor,graph:{graphId:graph.graphId,rootId:graph.rootId,revision:graph.revision,phase:graph.phase,public:graph.public,outputsCommitment:graph.outputsCommitment},terms}));
}
function withdrawalInputs(calldata){
 assert.match(calldata,/^0x[0-9a-f]+$/);assert.equal(calldata.slice(2,10),publicKeccak256(Buffer.from('withdraw(bytes,bytes32[])')).subarray(0,4).toString('hex'));
 const data=calldata.slice(10),word=at=>{assert.ok(Number.isSafeInteger(at)&&at>=0&&at+64<=data.length,'PAGED_EXECUTOR_PAYOUT_CURRENT_ABI');return BigInt('0x'+data.slice(at,at+64));},offset=word(64);assert.ok(offset<=BigInt(data.length/2)&&offset%32n===0n);const start=Number(offset)*2;assert.equal(word(start),39n);assert.equal(start+64+39*64,data.length,'PAGED_EXECUTOR_PAYOUT_CURRENT_ABI');return P.normalizeDevicePagedPublicInputsV3('withdraw',Array.from({length:39},(_,i)=>word(start+64+i*64).toString()));
}
export function assertPagedExecutorPayoutCurrentCommandDataV5(command,context){
 const metadata=readSepoliaExecutorPayoutTermsDataV5(command);if(metadata===null)return null;
 assert.ok(context&&command.identity===context.identity,'PAGED_EXECUTOR_PAYOUT_CURRENT_ORIGINAL_OWNER');const {terms,graph,descriptor}=context,plan=terms.executorPayouts;
 assert.equal(graph.phase,'FULFILLED','PAGED_EXECUTOR_PAYOUT_CURRENT_NOT_ISSUED');assert.equal(command.to,descriptor.pool);assert.equal(command.expiresAt,Math.min(terms.expiresAt,plan.collectBy));
 const planSHA256=XP.devicePagedExecutorPayoutPlanHashV5(plan),item=plan.payouts.find(p=>p.nullifier===metadata.nullifier);assert.ok(item,'PAGED_EXECUTOR_PAYOUT_CURRENT_ORIGINAL_NOTE');
 assert.deepEqual(metadata,{profile:'ORIGINAL_PAGED_EXECUTOR_PAYOUT_COMMAND_V5',collectionId:sha('LIANUM/EXECUTOR-PAYOUT-COLLECTION/5\n'+JSON.stringify([context.identity,terms.authorizationRoot,planSHA256])),planSHA256,quoteRoot:terms.quoteRoot,id:item.id,ordinal:item.ordinal,commitment:item.commitment,nullifier:item.nullifier,amountAtomic:item.amountAtomic,beneficiary:plan.beneficiary,maximumFeeAtomic:item.maximumFeeAtomic,maximumTotalFeeAtomic:plan.maximumTotalFeeAtomic,collectBy:plan.collectBy});
 const inputs=withdrawalInputs(command.data);assert.equal(P.devicePagedWordsHexV3(inputs,0),descriptor.scope);assert.equal(P.devicePagedWordsHexV3(inputs,8),descriptor.policy);assert.equal(P.devicePagedWordsHexV3(inputs,17),graph.outputsCommitment);assert.equal(P.devicePagedWordsHexV3(inputs,25),item.nullifier);assert.equal(inputs[33],item.amountAtomic);assert.equal('0x'+P.devicePagedWordsHexV3(inputs,34,5),plan.beneficiary);
 return Object.freeze({metadata,inputs});
}
/** Historical expiry is not a reason to discard a signed wire. This only
 * observes issued roots and spend state; live K keeps key/POST deadlines. */
export async function corroboratePagedExecutorPayoutCurrentDataV5(rpc,head,row,context){
 const checked=assertPagedExecutorPayoutCurrentCommandDataV5(row.command,context);if(checked===null)return;
 const call=(name,arg)=>rpc.call({to:context.descriptor.pool,data:'0x'+publicKeccak256(Buffer.from(name)).subarray(0,4).toString('hex')+arg},head.number),word=v=>'0x'+BigInt(v).toString(16).padStart(64,'0');
 assert.equal(await call('graphOutcomes(bytes32)',context.terms.authorizationRoot),word(2),'PAGED_EXECUTOR_PAYOUT_CURRENT_NOT_ISSUED');assert.equal(await call('acceptedSparseOutputRoots(bytes32)',context.graph.outputsCommitment),word(1),'PAGED_EXECUTOR_PAYOUT_CURRENT_NOT_ISSUED');const spent=await call('spentNullifiers(bytes32)',checked.metadata.nullifier);assert.ok(spent===word(0)||spent===word(1));if(row.receipt?.status==='0x1')assert.equal(spent,word(1),'PAGED_EXECUTOR_PAYOUT_CURRENT_NOT_SPENT');await rpc.assertCanonical(head);
}
