/** Fixed ORIGINAL seven-rule DeFi Mixed Source constructor preparation. No key, signing,
 * POST, address/calldata option or caller callback is accepted by this leaf. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nativeRpcV1} from '../../native-wallet/http-v1.mjs';
import {estimateOriginalPagedSepoliaCreateGasV6} from './sepolia-deployment-gas-v6.mjs';
import {readOriginalPagedSepoliaRpcContextV4,readOriginalPagedSepoliaSourceLaneV4,assertOriginalPagedSepoliaSourcePolicyBirthV5} from './sepolia-receiver-rpc-v4.mjs';
import {readOriginalSepoliaDefiMixedSourceInitializationV8,consumeOriginalSepoliaDefiMixedSourceInitializationV8} from '../../operations/local/sepolia-defi-mixed-source-kernel-v8.mjs';
import {sepoliaReceiverCreationUnsignedV4,validateSepoliaReceiverCreationWireV4} from './sepolia-receiver-wire-v4.mjs';

const GLAMSTERDAM=1791294816n,preparations=new WeakMap(),TTL=30000,GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const quantity=v=>{assert.match(v,/^0x(?:0|[1-9a-f][0-9a-f]*)$/);return BigInt(v);},sha=v=>createHash('sha256').update(v).digest('hex');
function state(runtime,token,prepared){
 const s=preparations.get(prepared);assert.ok(s?.runtime===runtime&&s.token===token,'PUBLIC_DEFI_ORIGINAL_MIXED_INITIALIZATION_PREPARATION');
 assert.ok(Date.now()<s.wall+TTL&&performance.now()<s.elapsed+TTL,'PUBLIC_DEFI_MIXED_INITIALIZATION_PREPARATION_EXPIRED');
 const context=readOriginalPagedSepoliaRpcContextV4(runtime),lane=readOriginalPagedSepoliaSourceLaneV4(runtime);
 assert.equal(JSON.stringify(context),JSON.stringify(s.context));assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,s.grant.plan.policySHA256);return s;
}
function unsigned(grant,gas,maximum,tip,head){
 const common={chainId:'11155111',nonce:grant.constructor.nonce,gasLimit:gas.toString(),maxFeePerGas:maximum.toString(),maxPriorityFeePerGas:tip.toString()};
 return freeze({profile:quantity(head.timestamp)>=GLAMSTERDAM?'ORIGINAL_PAGED_SEPOLIA_CREATE_V5':'ORIGINAL_PAGED_SEPOLIA_CREATE_V4',...common,creation:grant.constructor.creation});
}
function framing(grant,transaction){return sepoliaReceiverCreationUnsignedV4(transaction);}
async function identify(runtime,rpc){
 const [chain,genesis]=await Promise.all([rpc('eth_chainId'),rpc('eth_getBlockByNumber',['0x0',false])]);
 assert.equal(chain,'0xaa36a7');assert.equal(genesis?.hash,GENESIS);readOriginalPagedSepoliaRpcContextV4(runtime);
}
async function check(runtime,token,prepared){
 const s=state(runtime,token,prepared);await identify(runtime,s.rpc);const grant=await readOriginalSepoliaDefiMixedSourceInitializationV8(runtime,token);assert.deepEqual(grant,s.grant,'PUBLIC_DEFI_MIXED_INITIALIZATION_CHANGED');
 const [nonce,balance]=await Promise.all([s.rpc('eth_getTransactionCount',[s.context.account.address,'pending']),s.rpc('eth_getBalance',[s.context.account.address,'pending'])]);
 assert.equal(quantity(nonce).toString(),prepared.transaction.nonce,'PUBLIC_DEFI_MIXED_INITIALIZATION_NONCE');assert.ok(quantity(balance)>=BigInt(prepared.maximumFeeAtomic),'PUBLIC_DEFI_MIXED_INITIALIZATION_INSUFFICIENT_FUNDS');
 await runtime.assertCanonical(prepared.head);assert.deepEqual(await runtime.block(prepared.head.number),prepared.head,'PUBLIC_DEFI_MIXED_INITIALIZATION_CANONICAL_FORK');if(true)assert.equal(prepared.transaction.profile,quantity(prepared.head.timestamp)>=GLAMSTERDAM?'ORIGINAL_PAGED_SEPOLIA_CREATE_V5':'ORIGINAL_PAGED_SEPOLIA_CREATE_V4','PUBLIC_DEFI_MIXED_INITIALIZATION_CANONICAL_FORK');state(runtime,token,prepared);return s;
}
export async function prepareOriginalSepoliaDefiMixedSourceInitializationV8(runtime,token){
 assert.equal(arguments.length,2);const wall=Date.now(),elapsed=performance.now(),context=readOriginalPagedSepoliaRpcContextV4(runtime),rpc=nativeRpcV1(context.endpoint),grant=await readOriginalSepoliaDefiMixedSourceInitializationV8(runtime,token),lane=readOriginalPagedSepoliaSourceLaneV4(runtime);
 assert.equal(context.account.address,grant.constructor.sender);assert.equal(context.keysetId,grant.plan.keysetId);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,grant.plan.policySHA256);await identify(runtime,rpc);
 const [head,nonce,priority,balance]=await Promise.all([runtime.block(),rpc('eth_getTransactionCount',[context.account.address,'pending']),rpc('eth_maxPriorityFeePerGas'),rpc('eth_getBalance',[context.account.address,'pending'])]);
 assert.equal(quantity(nonce).toString(),grant.constructor.nonce,'PUBLIC_DEFI_MIXED_INITIALIZATION_NONCE');
 assert.equal(await runtime.code(grant.constructor.expectedAddress),'0x','PUBLIC_DEFI_MIXED_INITIALIZATION_CREATE_EXISTS');
 const estimate=quantity(await estimateOriginalPagedSepoliaCreateGasV6(runtime,grant.constructor.creation,head)),gas=(estimate*120n+99n)/100n,tip=quantity(priority),maximum=quantity(head.baseFeePerGas)*2n+tip;
 await runtime.assertCanonical(head);assert.deepEqual(await runtime.block(head.number),head,'PUBLIC_DEFI_MIXED_INITIALIZATION_CANONICAL_FORK');assert.ok(gas>21000n&&gas<=quantity(head.gasLimit)&&gas<=(quantity(head.timestamp)>=GLAMSTERDAM?(1n<<32n)-1n:30000000n),'PUBLIC_DEFI_MIXED_INITIALIZATION_GAS_BOUND');assert.ok(maximum>0n&&tip<=maximum);
 const transaction=unsigned(grant,gas,maximum,tip,head),framed=framing(grant,transaction),fee=BigInt(framed.maximumFeeAtomic);
 assert.ok(fee<=BigInt(lane.policy.maximumFeePerTransactionAtomic),'PUBLIC_DEFI_MIXED_INITIALIZATION_TRANSACTION_CEILING');
 const prepared=freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_INITIALIZATION_PREPARED_V8',grant,transaction,head,maximumFeeAtomic:fee.toString(),balanceAtomic:quantity(balance).toString(),funded:quantity(balance)>=fee,unsignedSHA256:sha(Buffer.from(framed.unsignedHex.slice(2),'hex')),signatureIssued:false,broadcasts:0});
 preparations.set(prepared,{runtime,token,context,grant,rpc,wall,elapsed,used:false});await runtime.assertCanonical(head);state(runtime,token,prepared);return prepared;
}
export async function readOriginalSepoliaDefiMixedSourceInitializationPreparedV8(runtime,token,prepared){
 assert.equal(arguments.length,3);await check(runtime,token,prepared);return prepared;
}
/** The key-store first persists KEY_PENDING for this exact preparation, then
 * invokes this fixed consumer immediately before accessing its protected key. */
export async function consumeOriginalSepoliaDefiMixedSourceInitializationPreparedV8(runtime,token,prepared){
 assert.equal(arguments.length,3);const s=state(runtime,token,prepared);assert.ok(!s.used,'PUBLIC_DEFI_MIXED_INITIALIZATION_PREPARATION_CONSUMED');await check(runtime,token,prepared);
 const grant=await consumeOriginalSepoliaDefiMixedSourceInitializationV8(runtime,token);assert.deepEqual(grant,s.grant);state(runtime,token,prepared);assert.ok(!s.used,'PUBLIC_DEFI_MIXED_INITIALIZATION_PREPARATION_CONSUMED');s.used=true;return prepared;
}
/** Mechanical signed-wire verification for exact fixed initialization DATA.
 * It conveys neither signing authority nor a key-store/runtime capability. */
export function validateSepoliaDefiMixedSourceInitializationWireV8(grant,transaction,wire){
 assert.equal(arguments.length,3);assert.equal(grant?.profile,'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_CONSTRUCTOR_V8');
 assert.equal(transaction.nonce,grant.constructor.nonce);assert.equal(transaction.chainId,'11155111');
 assert.equal(transaction.creation,grant.constructor.creation);return validateSepoliaReceiverCreationWireV4(transaction,grant.constructor.sender,wire);
}
