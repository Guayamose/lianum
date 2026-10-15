/** Fixed ORIGINAL Uniswap target initialization preparation. No key, signing,
 * POST, address/calldata option or caller callback is accepted by this leaf. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nativeRpcV1} from '../../native-wallet/http-v1.mjs';
import {estimateOriginalPagedSepoliaCreateGasV6} from './sepolia-deployment-gas-v6.mjs';
import {readOriginalPagedSepoliaRpcContextV4,readOriginalPagedSepoliaSourceLaneV4,assertOriginalPagedSepoliaSourcePolicyBirthV5} from './sepolia-receiver-rpc-v4.mjs';
import {readOriginalSepoliaUniswapTargetInitializationV4,consumeOriginalSepoliaUniswapTargetInitializationV4} from '../../operations/local/sepolia-uniswap-target-kernel-v4.mjs';
import {sepoliaReceiverCreationUnsignedV4,validateSepoliaReceiverCreationWireV4} from './sepolia-receiver-wire-v4.mjs';
import {sepoliaSourceCallUnsignedV4,validateSepoliaSourceCallWireV4} from './sepolia-source-wire-v4.mjs';

const GLAMSTERDAM=1791294816n,preparations=new WeakMap(),TTL=30000,GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const quantity=v=>{assert.match(v,/^0x(?:0|[1-9a-f][0-9a-f]*)$/);return BigInt(v);},sha=v=>createHash('sha256').update(v).digest('hex');
function state(runtime,token,prepared){
 const s=preparations.get(prepared);assert.ok(s?.runtime===runtime&&s.token===token,'PUBLIC_UNISWAP_ORIGINAL_INITIALIZATION_PREPARATION');
 assert.ok(Date.now()<s.wall+TTL&&performance.now()<s.elapsed+TTL,'PUBLIC_UNISWAP_INITIALIZATION_PREPARATION_EXPIRED');
 const context=readOriginalPagedSepoliaRpcContextV4(runtime),lane=readOriginalPagedSepoliaSourceLaneV4(runtime);
 assert.equal(JSON.stringify(context),JSON.stringify(s.context));assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,s.grant.plan.policySHA256);return s;
}
function unsigned(grant,gas,maximum,tip,head){
 const common={chainId:'11155111',nonce:grant.request.nonce,gasLimit:gas.toString(),maxFeePerGas:maximum.toString(),maxPriorityFeePerGas:tip.toString()};
 return freeze(grant.kind==='CREATE'?{profile:quantity(head.timestamp)>=GLAMSTERDAM?'ORIGINAL_PAGED_SEPOLIA_CREATE_V5':'ORIGINAL_PAGED_SEPOLIA_CREATE_V4',...common,creation:grant.request.creation}:{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_CALL_V4',...common,to:grant.request.to,value:'0',calldata:grant.request.data});
}
function framing(grant,transaction){return grant.kind==='CREATE'?sepoliaReceiverCreationUnsignedV4(transaction):sepoliaSourceCallUnsignedV4(transaction);}
async function identify(runtime,rpc){
 const [chain,genesis]=await Promise.all([rpc('eth_chainId'),rpc('eth_getBlockByNumber',['0x0',false])]);
 assert.equal(chain,'0xaa36a7');assert.equal(genesis?.hash,GENESIS);readOriginalPagedSepoliaRpcContextV4(runtime);
}
async function check(runtime,token,prepared){
 const s=state(runtime,token,prepared);await identify(runtime,s.rpc);const grant=await readOriginalSepoliaUniswapTargetInitializationV4(runtime,token);assert.deepEqual(grant,s.grant,'PUBLIC_UNISWAP_INITIALIZATION_CHANGED');
 const [nonce,balance]=await Promise.all([s.rpc('eth_getTransactionCount',[s.context.account.address,'pending']),s.rpc('eth_getBalance',[s.context.account.address,'pending'])]);
 assert.equal(quantity(nonce).toString(),prepared.transaction.nonce,'PUBLIC_UNISWAP_INITIALIZATION_NONCE');assert.ok(quantity(balance)>=BigInt(prepared.maximumFeeAtomic),'PUBLIC_UNISWAP_INITIALIZATION_INSUFFICIENT_FUNDS');
 await runtime.assertCanonical(prepared.head);assert.deepEqual(await runtime.block(prepared.head.number),prepared.head,'PUBLIC_UNISWAP_INITIALIZATION_CANONICAL_FORK');if(grant.kind==='CREATE')assert.equal(prepared.transaction.profile,quantity(prepared.head.timestamp)>=GLAMSTERDAM?'ORIGINAL_PAGED_SEPOLIA_CREATE_V5':'ORIGINAL_PAGED_SEPOLIA_CREATE_V4','PUBLIC_UNISWAP_INITIALIZATION_CANONICAL_FORK');state(runtime,token,prepared);return s;
}
export async function prepareOriginalSepoliaUniswapTargetInitializationV4(runtime,token){
 assert.equal(arguments.length,2);const wall=Date.now(),elapsed=performance.now(),context=readOriginalPagedSepoliaRpcContextV4(runtime),rpc=nativeRpcV1(context.endpoint),grant=await readOriginalSepoliaUniswapTargetInitializationV4(runtime,token),lane=readOriginalPagedSepoliaSourceLaneV4(runtime);
 assert.equal(context.account.address,grant.plan.account);assert.equal(context.keysetId,grant.plan.keysetId);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,grant.plan.policySHA256);await identify(runtime,rpc);
 const [head,nonce,priority,balance]=await Promise.all([runtime.block(),rpc('eth_getTransactionCount',[context.account.address,'pending']),rpc('eth_maxPriorityFeePerGas'),rpc('eth_getBalance',[context.account.address,'pending'])]);
 assert.equal(quantity(nonce).toString(),grant.request.nonce,'PUBLIC_UNISWAP_INITIALIZATION_NONCE');
 if(grant.kind==='CREATE')assert.equal(await runtime.code(grant.request.expectedAddress),'0x','PUBLIC_UNISWAP_INITIALIZATION_CREATE_EXISTS');
 const request=grant.kind==='CREATE'?{from:context.account.address,data:grant.request.creation,value:'0x0',gasPrice:'0x0'}:{from:context.account.address,to:grant.request.to,data:grant.request.data,value:'0x0',gasPrice:'0x0'};
 const estimate=quantity(grant.kind==='CREATE'?await estimateOriginalPagedSepoliaCreateGasV6(runtime,grant.request.creation,head):await rpc('eth_estimateGas',[request])),gas=(estimate*120n+99n)/100n,tip=quantity(priority),maximum=quantity(head.baseFeePerGas)*2n+tip;
 await runtime.assertCanonical(head);assert.deepEqual(await runtime.block(head.number),head,'PUBLIC_UNISWAP_INITIALIZATION_CANONICAL_FORK');assert.ok(gas>21000n&&gas<=quantity(head.gasLimit)&&gas<=(grant.kind==='CREATE'&&quantity(head.timestamp)>=GLAMSTERDAM?(1n<<32n)-1n:30000000n),'PUBLIC_UNISWAP_INITIALIZATION_GAS_BOUND');assert.ok(maximum>0n&&tip<=maximum);
 const transaction=unsigned(grant,gas,maximum,tip,head),framed=framing(grant,transaction),fee=BigInt(framed.maximumFeeAtomic);
 assert.ok(fee<=BigInt(lane.policy.maximumFeePerTransactionAtomic),'PUBLIC_UNISWAP_INITIALIZATION_TRANSACTION_CEILING');
 const prepared=freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_INITIALIZATION_PREPARED_V4',grant,transaction,head,maximumFeeAtomic:fee.toString(),balanceAtomic:quantity(balance).toString(),funded:quantity(balance)>=fee,unsignedSHA256:sha(Buffer.from(framed.unsignedHex.slice(2),'hex')),signatureIssued:false,broadcasts:0});
 preparations.set(prepared,{runtime,token,context,grant,rpc,wall,elapsed,used:false});await runtime.assertCanonical(head);state(runtime,token,prepared);return prepared;
}
export async function readOriginalSepoliaUniswapTargetInitializationPreparedV4(runtime,token,prepared){
 assert.equal(arguments.length,3);await check(runtime,token,prepared);return prepared;
}
/** The key-store first persists KEY_PENDING for this exact preparation, then
 * invokes this fixed consumer immediately before accessing its protected key. */
export async function consumeOriginalSepoliaUniswapTargetInitializationPreparedV4(runtime,token,prepared){
 assert.equal(arguments.length,3);const s=state(runtime,token,prepared);assert.ok(!s.used,'PUBLIC_UNISWAP_INITIALIZATION_PREPARATION_CONSUMED');await check(runtime,token,prepared);
 const grant=await consumeOriginalSepoliaUniswapTargetInitializationV4(runtime,token);assert.deepEqual(grant,s.grant);state(runtime,token,prepared);assert.ok(!s.used,'PUBLIC_UNISWAP_INITIALIZATION_PREPARATION_CONSUMED');s.used=true;return prepared;
}
/** Mechanical signed-wire verification for exact fixed initialization DATA.
 * It conveys neither signing authority nor a key-store/runtime capability. */
export function validateSepoliaUniswapTargetInitializationWireV4(grant,transaction,wire){
 assert.equal(arguments.length,3);assert.equal(grant?.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_INITIALIZATION_V4');assert.ok(['CREATE','CALL'].includes(grant.kind));
 assert.equal(transaction.nonce,grant.request.nonce);assert.equal(transaction.chainId,'11155111');
 if(grant.kind==='CREATE'){assert.equal(transaction.creation,grant.request.creation);return validateSepoliaReceiverCreationWireV4(transaction,grant.plan.account,wire);}
 assert.equal(transaction.to,grant.request.to);assert.equal(transaction.calldata,grant.request.data);assert.equal(transaction.value,'0');return validateSepoliaSourceCallWireV4(transaction,grant.plan.account,wire);
}
