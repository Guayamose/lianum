/** Original read-only Aave Sepolia venue. Caller data cannot create the private
 * brand. RPC/provider trust and Aave upgrades remain explicit; no signer access,
 * private proof, protocol deployment or credited private balance is issued. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertOriginalPagedSepoliaReceiverRuntimeV4,readOriginalPagedSepoliaRpcContextV4} from '../../public-testnet/sepolia-receiver-rpc-v4.mjs';
import {nativeRpcV1} from '../../../native-wallet/http-v1.mjs';
import {readFixedAaveSepoliaPrimaryDataV4} from '../../../operations/deployments/defi/aave-sepolia-primary-v4.mjs';
const fixed=readFixedAaveSepoliaPrimaryDataV4(),owned=new WeakMap(),a=fixed.addresses;
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const sha=v=>createHash('sha256').update(v).digest('hex');
const address=v=>{assert.match(v,/^0x[0-9a-f]{40}$/);assert.notEqual(v,'0x'+'0'.repeat(40));return v;};
const word=v=>BigInt(v).toString(16).padStart(64,'0'),aw=v=>address(v).slice(2).padStart(64,'0');
function words(v,count){assert.ok(typeof v==='string'&&new RegExp('^0x[0-9a-f]{'+count*64+'}$').test(v),'AAVE_PUBLIC_ABI_WORDS');return Array.from({length:count},(_,i)=>v.slice(2+i*64,66+i*64));}
const uint=v=>BigInt('0x'+words(v,1)[0]),addr=v=>{const w=words(v,1)[0];assert.equal(w.slice(0,24),'0'.repeat(24),'AAVE_PUBLIC_ABI_ADDRESS');return address('0x'+w.slice(24));};
function state(venue){const s=owned.get(venue);assert.ok(s&&!s.closed,'AAVE_SEPOLIA_ORIGINAL_VENUE');assertOriginalPagedSepoliaReceiverRuntimeV4(s.runtime);return s;}
async function checkCode(s,row,head){const code=await s.runtime.code(row.address,head.number);assert.ok(code!=='0x','AAVE_SEPOLIA_CODE_MISSING');assert.equal(sha(Buffer.from(code.slice(2),'hex')),row.sha256,'AAVE_SEPOLIA_CODE_CHANGED');}
async function snapshot(s,tag,shares='1000000',holder=null){
 const r=s.runtime,head=await r.block(tag);await r.assertCanonical(head);const call=(to,data)=>r.call({to,data},head.number);
 const reads=await Promise.allSettled([
  ...Object.entries(fixed.pins).map(([address,p])=>checkCode(s,{address,...p},head)),
  ...Object.entries(fixed.proxies).flatMap(([address,p])=>[s.rpc('eth_getStorageAt',[address,fixed.proxySlot,head.number]),checkCode(s,{address:p.implementation,...p},head)]),
  call(a.factory,'0xed5d0f58'+aw(a.underlying)),call(a.factory,'0x7535d246'),call(a.wrapper,'0x7535d246'),
  call(a.wrapper,'0xa0c1f15e'),call(a.wrapper,'0x38d52e0f'),call(a.wrapper,'0x313ce567'),
  call(a.aToken,'0x7535d246'),call(a.aToken,'0xb16a19de'),call(a.provider,'0x026b1d5f'),
  call(a.pool,'0x35ea6a75'+aw(a.underlying)),call(a.pool,'0xc44b11f7'+aw(a.underlying)),
  call(a.wrapper,'0x2c4e722e'),call(a.wrapper,'0xb3d7f6b9'+word(shares)),call(a.wrapper,'0x4cdad506'+word(shares)),
  call(a.underlying,'0x70a08231'+aw(a.aToken)),
  ...(holder?[call(a.wrapper,'0x70a08231'+aw(holder)),call(a.wrapper,'0xd905777e'+aw(holder))]:[])
 ]);
 const failed=reads.find(row=>row.status==='rejected');if(failed)throw failed.reason;
 const values=reads.map(row=>row.value);let offset=Object.keys(fixed.pins).length;
 for(const p of Object.values(fixed.proxies)){assert.equal(addr(values[offset]),p.implementation,'AAVE_SEPOLIA_PROXY_CHANGED');offset+=2;}
 const v=values.slice(offset);
 assert.deepEqual([addr(v[0]),addr(v[1]),addr(v[2]),addr(v[3]),addr(v[4]),uint(v[5]),addr(v[6]),addr(v[7]),addr(v[8])],
  [a.wrapper,a.pool,a.pool,a.aToken,a.underlying,6n,a.pool,a.underlying,a.pool],'AAVE_SEPOLIA_OFFICIAL_RELATIONSHIPS');
 const reserve=words(v[9],15),configuration=uint(v[10]);assert.equal(BigInt('0x'+reserve[0]),configuration,'AAVE_SEPOLIA_RESERVE_CONFIGURATION');
 assert.equal(addr('0x'+reserve[8]),a.aToken,'AAVE_SEPOLIA_ORIGINAL_RESERVE');
 assert.equal((configuration>>48n)&255n,6n,'AAVE_SEPOLIA_RESERVE_DECIMALS');
 const active=((configuration>>56n)&1n)===1n,frozen=((configuration>>57n)&1n)===1n,paused=((configuration>>60n)&1n)===1n;
 const rate=uint(v[11]),maximumInput=uint(v[12]),minimumAssets=uint(v[13]),liquidity=uint(v[14]),n=BigInt(shares),ray=10n**27n;
 assert.ok(rate>=ray,'AAVE_SEPOLIA_INCOME_INDEX');assert.equal(maximumInput,(n*rate+ray-1n)/ray,'AAVE_SEPOLIA_PREVIEW_MINT');assert.equal(minimumAssets,n*rate/ray,'AAVE_SEPOLIA_PREVIEW_REDEEM');
 if(holder){assert.ok(uint(v[16])<=uint(v[15]),'AAVE_SEPOLIA_WITHDRAWABLE_SHARES');assert.ok(uint(v[16])*rate/ray<=liquidity,'AAVE_SEPOLIA_WITHDRAWABLE_LIQUIDITY');}
 await r.assertCanonical(head);assertOriginalPagedSepoliaReceiverRuntimeV4(r);
 return freeze({profile:'ORIGINAL_AAVE_SEPOLIA_READONLY_SNAPSHOT_V4',networkId:fixed.networkId,chainId:fixed.chainId,genesis:fixed.genesis,
  head:{number:head.number,hash:head.hash,timestamp:head.timestamp},addresses:a,pins:fixed.pins,proxies:fixed.proxies,configuration:configuration.toString(),
  reserve:{active,frozen,paused},shareDecimals:6,underlyingDecimals:6,shares,rate:rate.toString(),maximumInputAtomic:maximumInput.toString(),estimatedUnderlyingAtomic:minimumAssets.toString(),underlyingLiquidityAtomic:liquidity.toString(),
  position:holder?{holder,heldShares:uint(v[15]).toString(),maximumRedeemableShares:uint(v[16]).toString()}:null,
  trust:'RPC_PROVIDER',independentConsensus:false,financialAuthority:false,privateBalanceCredited:false,tokenValue:'TESTNET_NO_MONETARY_VALUE'});
}
export async function createOriginalAaveSepoliaVenueV4(runtime){
 assert.equal(arguments.length,1);assertOriginalPagedSepoliaReceiverRuntimeV4(runtime);const context=readOriginalPagedSepoliaRpcContextV4(runtime);
 assert.equal(runtime.metadata.evmGenesis,fixed.genesis);assert.equal(context.account.networkId,fixed.networkId);
 const s={runtime,rpc:nativeRpcV1(context.endpoint),closed:false},venue=Object.freeze({profile:'ORIGINAL_AAVE_SEPOLIA_READONLY_V4'});
 await snapshot(s,'finalized');owned.set(venue,s);return venue;
}
export function assertOriginalAaveSepoliaVenueV4(runtime,venue){assert.equal(arguments.length,2);assert.strictEqual(state(venue).runtime,runtime,'AAVE_SEPOLIA_ORIGINAL_RUNTIME');}
export async function readOriginalAaveSepoliaVenueV4(venue,tag='finalized'){
 assert.ok(arguments.length===1||arguments.length===2);assert.ok(['latest','finalized'].includes(tag)||/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(tag),'AAVE_SEPOLIA_BLOCK_TAG');return snapshot(state(venue),tag);
}
export async function quoteOriginalAaveSepoliaSharesV4(venue,shares){
 assert.equal(arguments.length,2);assert.match(shares,/^[1-9][0-9]{0,19}$/);assert.ok(BigInt(shares)>=BigInt(fixed.minimumShares)&&BigInt(shares)<=0xffffffffffffffffn,'AAVE_SEPOLIA_SHARE_LIMIT');
 const view=await snapshot(state(venue),'latest',shares);assert.ok(view.reserve.active&&!view.reserve.frozen&&!view.reserve.paused,'AAVE_SEPOLIA_SUPPLY_UNAVAILABLE');
 return freeze({profile:'ORIGINAL_AAVE_SEPOLIA_SHARE_QUOTE_V4',view,quoteIsAuthorization:false,privateOutputPrepared:false});
}
export async function readOriginalAaveSepoliaPublicPositionV4(venue,holder,shares,tag='finalized'){
 assert.ok(arguments.length===3||arguments.length===4);address(holder);assert.match(shares,/^(0|[1-9][0-9]{0,19})$/);assert.ok(BigInt(shares)<=0xffffffffffffffffn,'AAVE_SEPOLIA_SHARE_LIMIT');
 assert.ok(['latest','finalized'].includes(tag)||/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(tag),'AAVE_SEPOLIA_BLOCK_TAG');return snapshot(state(venue),tag,shares,holder);
}
export function closeOriginalAaveSepoliaVenueV4(venue){assert.equal(arguments.length,1);state(venue).closed=true;}
