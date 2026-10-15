/** Fixed, original, READ-ONLY Sepolia Uniswap venues. This owner grants no
 * Source command, READY, signer access, target D27 or private balance credit. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertOriginalPagedSepoliaReceiverRuntimeV4,readOriginalPagedSepoliaRpcContextV4} from './sepolia-receiver-rpc-v4.mjs';
import {nativeRpcV1} from '../../native-wallet/http-v1.mjs';
import {decodeSepoliaUniswapPoolSwapEventV4} from './sepolia-uniswap-codec-v4.mjs';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
const owned=new WeakMap(),GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;},sha=v=>createHash('sha256').update(v).digest('hex');
const address=v=>{assert.match(v,/^0x[0-9a-f]{40}$/);assert.notEqual(v,'0x'+'0'.repeat(40));return v;},word=v=>BigInt(v).toString(16).padStart(64,'0'),aWord=v=>address(v).slice(2).padStart(64,'0');
const resultWords=(v,count)=>{assert.ok(typeof v==='string'&&new RegExp('^0x[0-9a-f]{'+count*64+'}$').test(v),'UNISWAP_PUBLIC_ABI_WORDS');return Array.from({length:count},(_,i)=>v.slice(2+i*64,66+i*64));},one=v=>BigInt('0x'+resultWords(v,1)[0]);
const addressResult=v=>{const w=resultWords(v,1)[0];assert.equal(w.slice(0,24),'0'.repeat(24),'UNISWAP_PUBLIC_ABI_ADDRESS');return address('0x'+w.slice(24));};
const FIXED=freeze({
 factory:{address:'0x0227628f3f023bb0b980b67d528571c95c6dac1c',codeSHA256:'f4e0ac5ddb8b0ed6b47df04645557d13af2a8b7a1bc9583acd08b0788440928b'},
 router:{address:'0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e',codeSHA256:'e18dacff07368baa9974b34f1039c31726d374cd0838c7969232b9f287590562'},
 quoter:{address:'0xed1f6473345f45b75f8179591dd5ba1888cf2fb3',codeSHA256:'41807167ee6769e9848dc88cc44931db2c9d9f3fe320f8c10e5a588722f4496b'},
 input:{address:'0xfff9976782d46cc05630d1f6ebab18b2324d6b14',codeSHA256:'9bbda01ae25d1f2b4171918cc6280a5769d6d6fc5500ed01e2143697902df4e1',symbol:'WETH',decimals:18},
 fee:3000,venues:{
  AAVE_USDC:{output:{address:'0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8',codeSHA256:'583644aee778ddb688d4b61116b6259ef417b1a094dc8f8a578e0cfc099f4519',symbol:'USDC',decimals:6,proxy:null},pool:{address:'0x9799b5edc1aa7d3fad350309b08df3f64914e244',codeSHA256:'755617824919a645475c55213f8a4a58e73b822e2a547e0cb6f834bd90648b76'}},
  CIRCLE_USDC:{output:{address:'0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',codeSHA256:'846efa39d1689bdcffea1cdabe788d0b6f81050c0667ad6444e722aed27f7e86',symbol:'USDC',decimals:6,proxy:{slot:'0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3',implementation:'0xda317c1d3e835dd5f1be459006471acaa1289068',implementationCodeSHA256:'eb2726ec3ac0cb69704b0d37e7076470f47e87c6eaac452f173d58c607b4265f'}},pool:{address:'0x6ce0896eae6d4bd668fde41bb784548fb8f59b50',codeSHA256:'3f9b84f02475e98662ce56e868e7cc67113a70f9c792162f990b34ee73edfc10'}}
 }});
// Pins are an explicit RPC-provider trust assumption. They come from official
// address tables and canonical finalized code readbacks, not independent consensus.
export function readFixedSepoliaUniswapVenueReferencesV4(){assert.equal(arguments.length,0);return FIXED;}
function state(venue){const s=owned.get(venue);assert.ok(s&&!s.closed,'ORIGINAL_SEPOLIA_UNISWAP_VENUE');assertOriginalPagedSepoliaReceiverRuntimeV4(s.runtime);return s;}
async function pin(s,row,tag){const code=await s.runtime.code(row.address,tag);assert.ok(code!=='0x','UNISWAP_PUBLIC_CODE_MISSING');assert.equal(sha(Buffer.from(code.slice(2),'hex')),row.codeSHA256,'UNISWAP_PUBLIC_CODE_CHANGED');}
async function snapshot(s,tag){
 const r=s.runtime,head=await r.block(tag);await r.assertCanonical(head);
 const call=(to,data)=>r.call({to,data},head.number),output=FIXED.venues[s.selection].output,pool=FIXED.venues[s.selection].pool;
 // Await every started read before returning or rejecting.
 const reads=await Promise.allSettled([...[FIXED.factory,FIXED.router,FIXED.quoter,FIXED.input,output,pool].map(row=>pin(s,row,head.number)),
  call(FIXED.router.address,'0xc45a0155'),call(FIXED.router.address,'0x4aa4a4fc'),
  call(FIXED.factory.address,'0x1698ee82'+aWord(FIXED.input.address)+aWord(output.address)+word(FIXED.fee)),
  call(pool.address,'0x0dfe1681'),call(pool.address,'0xd21220a7'),call(pool.address,'0x1a686502'),call(pool.address,'0x3850c7bd'),
  call(FIXED.input.address,'0x313ce567'),call(output.address,'0x313ce567'),
  call(FIXED.input.address,'0x70a08231'+aWord(pool.address)),call(output.address,'0x70a08231'+aWord(pool.address)),
  ...(output.proxy?[s.rpc('eth_getStorageAt',[output.address,output.proxy.slot,head.number]),pin(s,{address:output.proxy.implementation,codeSHA256:output.proxy.implementationCodeSHA256},head.number)]:[])]);
 const failed=reads.find(row=>row.status==='rejected');if(failed)throw failed.reason;const values=reads.map(row=>row.value).slice(6);
 assert.equal(addressResult(values[0]),FIXED.factory.address);assert.equal(addressResult(values[1]),FIXED.input.address);assert.equal(addressResult(values[2]),pool.address,'UNISWAP_PUBLIC_POOL_CHANGED');
 assert.deepEqual([addressResult(values[3]),addressResult(values[4])],[FIXED.input.address,output.address].sort(),'UNISWAP_PUBLIC_POOL_ASSETS');
 const liquidity=one(values[5]),slot=resultWords(values[6],7);assert.ok(liquidity>0n,'UNISWAP_PUBLIC_NO_LIQUIDITY');assert.ok(BigInt('0x'+slot[0])>0n&&BigInt('0x'+slot[0])<1n<<160n&&BigInt('0x'+slot[6])===1n,'UNISWAP_PUBLIC_POOL_LOCKED');
 assert.equal(one(values[7]),18n);assert.equal(one(values[8]),6n);const inputBalance=one(values[9]),outputBalance=one(values[10]);assert.ok(inputBalance>0n&&outputBalance>0n,'UNISWAP_PUBLIC_EMPTY_BALANCES');
 if(output.proxy)assert.equal(addressResult(values[11]),output.proxy.implementation,'UNISWAP_PUBLIC_PROXY_CHANGED');
 await r.assertCanonical(head);assertOriginalPagedSepoliaReceiverRuntimeV4(r);
 return freeze({profile:'ORIGINAL_SEPOLIA_UNISWAP_READONLY_SNAPSHOT_V4',selection:s.selection,networkId:'ethereum-sepolia',chainId:'11155111',genesis:GENESIS,head:{number:head.number,hash:head.hash,timestamp:head.timestamp},
  factory:FIXED.factory,router:FIXED.router,quoter:FIXED.quoter,input:FIXED.input,output,pool,fee:FIXED.fee,liquidity:liquidity.toString(),inputBalance:inputBalance.toString(),outputBalance:outputBalance.toString(),
  trust:'RPC_PROVIDER',independentConsensus:false,financialAuthority:false,privateBalanceCredited:false,tokenValue:'TESTNET_NO_MONETARY_VALUE'});
}
export async function createOriginalPagedSepoliaUniswapVenueV4(runtime,selection){
 assert.equal(arguments.length,2);assertOriginalPagedSepoliaReceiverRuntimeV4(runtime);assert.ok(selection==='AAVE_USDC'||selection==='CIRCLE_USDC','FIXED_SEPOLIA_UNISWAP_SELECTION');
 const context=readOriginalPagedSepoliaRpcContextV4(runtime);assert.equal(runtime.metadata.evmGenesis,GENESIS);assert.equal(context.account.networkId,'ethereum-sepolia');
 const s={runtime,selection,rpc:nativeRpcV1(context.endpoint),closed:false},venue=Object.freeze({profile:'ORIGINAL_SEPOLIA_UNISWAP_READONLY_V4',selection});
 await snapshot(s,'finalized');owned.set(venue,s);return venue;
}
export function assertOriginalPagedSepoliaUniswapVenueV4(runtime,venue){assert.equal(arguments.length,2);assert.equal(state(venue).runtime,runtime,'ORIGINAL_SEPOLIA_UNISWAP_RUNTIME');}
export async function readOriginalPagedSepoliaUniswapVenueV4(venue,tag='finalized'){assert.ok(arguments.length===1||arguments.length===2);assert.ok(['latest','finalized'].includes(tag)||/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(tag),'UNISWAP_PUBLIC_BLOCK_TAG');return snapshot(state(venue),tag);}
export async function quoteOriginalPagedSepoliaUniswapExactOutputV4(venue,outputAtomic){
 assert.equal(arguments.length,2);assert.match(outputAtomic,/^[1-9][0-9]{0,19}$/);const output=BigInt(outputAtomic);assert.ok(output<=0xffffffffffffffffn,'UNISWAP_PUBLIC_OUTPUT_U64');
 const s=state(venue),view=await snapshot(s,'latest');assert.ok(output<=BigInt(view.outputBalance),'UNISWAP_PUBLIC_OUTPUT_BALANCE');
 const raw=await s.runtime.call({to:FIXED.quoter.address,data:'0xbd21704a'+aWord(FIXED.input.address)+aWord(view.output.address)+word(output)+word(FIXED.fee)+word(0)},view.head.number),words=resultWords(raw,4),amountIn=BigInt('0x'+words[0]);
 assert.ok(amountIn>0n&&amountIn<=0xffffffffffffffffffffffffffffffffn,'UNISWAP_PUBLIC_QUOTE_INPUT_U128');await s.runtime.assertCanonical(view.head);state(venue);
 return freeze({profile:'ORIGINAL_SEPOLIA_UNISWAP_READONLY_QUOTE_V4',venue:view,outputAtomic,requiredInputAtomic:amountIn.toString(),sqrtPriceAfterX96:BigInt('0x'+words[1]).toString(),ticksCrossed:BigInt('0x'+words[2]).toString(),quoterGasEstimate:BigInt('0x'+words[3]).toString(),
  inputUnit:'WETH_ATOMIC',outputUnit:'USDC_ATOMIC',quoteIsAuthorization:false,feeBudgetCovered:false,privateOutputPrepared:false});
}
export function closeOriginalPagedSepoliaUniswapVenueV4(venue){assert.equal(arguments.length,1);const s=owned.get(venue);assert.ok(s,'ORIGINAL_SEPOLIA_UNISWAP_VENUE');if(s.closed)return;s.closed=true;}

/** Receipt-local public facts only. A multi-transaction block and later heads
 * are normal. No caller receipt, balance delta, D27 or financial grant is accepted.
 * The future Mixed owner must additionally check its SAME signed wire, router,
 * route/D27/private-output events and durable PAEG READY before accepting delivery. */
export async function inspectOriginalPagedSepoliaUniswapReceiptV4(venue,transactionHash){
 assert.equal(arguments.length,2);assert.match(transactionHash,/^0x[0-9a-f]{64}$/);const s=state(venue),r=s.runtime,receipt=await r.receipt(transactionHash);
 if(receipt===null)return freeze({profile:'SEPOLIA_UNISWAP_PUBLIC_RECEIPT_INSPECTION_V4',status:'UNKNOWN',transactionHash,financialAcceptance:false,privateBalanceCredited:false});
 assert.equal(receipt.transactionHash,transactionHash);await r.checkReceipt(receipt);const [transaction,header,finalized]=await Promise.all([r.transaction(transactionHash),r.block(receipt.blockNumber),r.block('finalized')]);
 assert.ok(transaction&&transaction.hash===transactionHash&&transaction.blockHash===receipt.blockHash&&transaction.blockNumber===receipt.blockNumber,'UNISWAP_PUBLIC_TRANSACTION_RECEIPT');
 assert.equal(header.hash,receipt.blockHash);assert.ok(Array.isArray(header.transactions)&&header.transactions.includes(transactionHash),'UNISWAP_PUBLIC_BLOCK_INCLUSION');
 const view=await snapshot(s,receipt.blockNumber);assert.ok(Array.isArray(receipt.logs)&&receipt.logs.length<=65536,'UNISWAP_PUBLIC_RECEIPT_LOGS');
 const swapTopic='0x'+publicKeccak256(Buffer.from('Swap(address,address,int256,int256,uint160,uint128,int24)')).toString('hex'),seen=new Set(),swaps=[];
 for(const log of receipt.logs){
  assert.equal(log.transactionHash,transactionHash);assert.equal(log.blockHash,receipt.blockHash);assert.equal(log.blockNumber,receipt.blockNumber);assert.equal(log.removed,false,'UNISWAP_PUBLIC_REMOVED_LOG');
  assert.match(log.logIndex,/^0x(?:0|[1-9a-f][0-9a-f]*)$/);assert.ok(!seen.has(log.logIndex),'UNISWAP_PUBLIC_DUPLICATE_LOG_INDEX');seen.add(log.logIndex);
  if(log.address===view.pool.address&&log.topics?.[0]===swapTopic)swaps.push({logIndex:log.logIndex,...decodeSepoliaUniswapPoolSwapEventV4(log)});
 }
 assert.ok(swaps.length>0,'UNISWAP_PUBLIC_NO_SELECTED_POOL_SWAP');
 await r.assertCanonical(header);await r.assertCanonical(finalized);await r.checkReceipt(receipt);state(venue);
 return freeze({profile:'SEPOLIA_UNISWAP_PUBLIC_RECEIPT_INSPECTION_V4',status:BigInt(finalized.number)>=BigInt(receipt.blockNumber)?'FINALIZED':'PENDING_FINALITY',transactionHash,
  block:{number:header.number,hash:header.hash,timestamp:header.timestamp},finalizedHead:{number:finalized.number,hash:finalized.hash},venue:view,swaps,
  gasUsed:BigInt(receipt.gasUsed).toString(),effectiveGasPrice:BigInt(receipt.effectiveGasPrice).toString(),trust:'RPC_PROVIDER',independentConsensus:false,financialAcceptance:false,privateBalanceCredited:false});
}
