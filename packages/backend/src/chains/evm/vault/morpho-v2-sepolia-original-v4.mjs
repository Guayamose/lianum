/** Existing official-factory VaultV2/MorphoBlue read-only venue. The private
 * runtime brand, fixed code and actual canonical getters establish the reader;
 * no caller descriptor, copied snapshot or preview can authorize spending. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertOriginalPagedSepoliaReceiverRuntimeV4,readOriginalPagedSepoliaRpcContextV4} from '../../public-testnet/sepolia-receiver-rpc-v4.mjs';
import {nativeRpcV1} from '../../../native-wallet/http-v1.mjs';
import {readFixedMorphoV2SepoliaPrimaryDataV4} from '../../../operations/deployments/defi/morpho-v2-sepolia-primary-v4.mjs';
const fixed=readFixedMorphoV2SepoliaPrimaryDataV4(),a=fixed.addresses,own=new WeakMap(),ray=10n**18n;
const sha=v=>createHash('sha256').update(v).digest('hex'),freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const address=v=>{assert.match(v,/^0x[0-9a-f]{40}$/);assert.notEqual(v,'0x'+'0'.repeat(40));return v;},word=v=>BigInt(v).toString(16).padStart(64,'0'),aw=v=>address(v).slice(2).padStart(64,'0');
function words(v,count){assert.ok(typeof v==='string'&&new RegExp('^0x[0-9a-f]{'+count*64+'}$').test(v),'MORPHO_V2_CANONICAL_WORDS');return Array.from({length:count},(_,i)=>v.slice(2+i*64,66+i*64));}
const uint=v=>BigInt('0x'+words(v,1)[0]),addr=v=>{const w=words(v,1)[0];assert.equal(w.slice(0,24),'0'.repeat(24));return address('0x'+w.slice(24));};
function state(venue){const s=own.get(venue);assert.ok(s&&!s.closed,'MORPHO_V2_ORIGINAL_VENUE');assertOriginalPagedSepoliaReceiverRuntimeV4(s.runtime);return s;}
async function snapshot(s,tag,shares=fixed.minimumShares,holder=null){
 const r=s.runtime,head=await r.block(tag);await r.assertCanonical(head);const call=(to,data)=>r.call({to,data},head.number),n=BigInt(shares);
 const data=Object.fromEntries(await Promise.all(Object.entries({
  isVault:()=>call(a.factory,'0x5edec50d'+aw(a.vault)),isAdapter:()=>call(a.adapterFactory,'0xd6aebf94'+aw(a.adapter)),
  asset:()=>call(a.vault,'0x38d52e0f'),shareDecimals:()=>call(a.vault,'0x313ce567'),assetDecimals:()=>call(a.underlying,'0x313ce567'),
  adapterFactory:()=>call(a.adapter,'0xc45a0155'),parentVault:()=>call(a.adapter,'0x0fe36536'),adapterAsset:()=>call(a.adapter,'0x38d52e0f'),
  morpho:()=>call(a.adapter,'0xd8fbc833'),irm:()=>call(a.adapter,'0x399e3a50'),adaptersLength:()=>call(a.vault,'0x5aa22bc8'),firstAdapter:()=>call(a.vault,'0x4ef501ac'+word(0)),
  liquidityAdapter:()=>call(a.vault,'0xad468d11'),liquidityData:()=>call(a.vault,'0x2e029228'),marketIdsLength:()=>call(a.adapter,'0xace48b45'),firstMarket:()=>call(a.adapter,'0x779a9683'+word(0)),
  parameters:()=>call(a.morpho,'0x2c3c9157'+fixed.marketId.slice(2)),market:()=>call(a.morpho,'0x5c60e39a'+fixed.marketId.slice(2)),
  totalAssets:()=>call(a.vault,'0x01e1d114'),totalSupply:()=>call(a.vault,'0x18160ddd'),performanceFee:()=>call(a.vault,'0x87788782'),managementFee:()=>call(a.vault,'0xa6f7f5d6'),
  previewMint:()=>call(a.vault,'0xb3d7f6b9'+word(n)),previewRedeem:()=>call(a.vault,'0x4cdad506'+word(n)),
  realAssets:()=>call(a.adapter,'0x56c07573'),expectedSupplyAssets:()=>call(a.adapter,'0x99f7e861'+fixed.marketId.slice(2)),supplyShares:()=>call(a.adapter,'0x6ead54d8'+fixed.marketId.slice(2)),
  idleAssets:()=>call(a.underlying,'0x70a08231'+aw(a.vault)),assetProxy:()=>s.rpc('eth_getStorageAt',[a.underlying,fixed.assetProxy.slot,head.number]),
  ...(holder?{heldShares:()=>call(a.vault,'0x70a08231'+aw(holder)),canReceiveShares:()=>call(a.vault,'0x98c9b49c'+aw(holder)),canSendAssets:()=>call(a.vault,'0x20fe8d58'+aw(holder)),canSendShares:()=>call(a.vault,'0x8e511e4d'+aw(holder)),canReceiveAssets:()=>call(a.vault,'0x0d326b18'+aw(holder))}:{})
 }).map(async([key,get])=>[key,await get()])));
 await Promise.all([...Object.entries(fixed.pins).map(async([to,p])=>{const code=await r.code(to,head.number);assert.equal(sha(Buffer.from(code.slice(2),'hex')),p.sha256,'MORPHO_V2_FIXED_CODE_CHANGED');}),
  (async()=>{assert.equal(addr(data.assetProxy),fixed.assetProxy.implementation,'MORPHO_V2_USDC_PROXY_CHANGED');const code=await r.code(fixed.assetProxy.implementation,head.number);assert.equal(sha(Buffer.from(code.slice(2),'hex')),fixed.assetProxy.codeSHA256,'MORPHO_V2_USDC_IMPLEMENTATION_CHANGED');})()]);
 assert.deepEqual([uint(data.isVault),uint(data.isAdapter),addr(data.asset),uint(data.shareDecimals),uint(data.assetDecimals),addr(data.adapterFactory),addr(data.parentVault),addr(data.adapterAsset),addr(data.morpho),addr(data.irm),uint(data.adaptersLength),addr(data.firstAdapter),addr(data.liquidityAdapter),uint(data.marketIdsLength),data.firstMarket],
  [1n,1n,a.underlying,18n,6n,a.adapterFactory,a.vault,a.underlying,a.morpho,a.irm,1n,a.adapter,a.adapter,1n,fixed.marketId],'MORPHO_V2_ORIGINAL_LINEAGE');
 assert.equal(data.parameters,fixed.marketParameters,'MORPHO_V2_MARKET_PARAMETERS');assert.equal(await r.keccak(data.parameters),fixed.marketId,'MORPHO_V2_MARKET_ID');assert.equal(data.liquidityData,fixed.liquidityData,'MORPHO_V2_ORIGINAL_LIQUIDITY_ROUTE');
 const market=words(data.market,6).map(v=>BigInt('0x'+v));assert.ok(market[0]>=market[2]&&market[4]<=BigInt(head.timestamp)&&market[5]<=ray,'MORPHO_V2_MARKET_ACCOUNTING');
 const realAssets=uint(data.realAssets);assert.equal(realAssets,uint(data.expectedSupplyAssets),'MORPHO_V2_SINGLE_MARKET_BACKING');const sharesInMarket=uint(data.supplyShares);assert.ok(sharesInMarket<=market[1]);
 const liquidity=uint(data.idleAssets)+(realAssets<market[0]-market[2]?realAssets:market[0]-market[2]),maximumInput=uint(data.previewMint),minimumAssets=uint(data.previewRedeem);
 assert.ok(maximumInput>=minimumAssets,'MORPHO_V2_SHARE_ROUNDING');assert.ok(uint(data.performanceFee)<=ray&&uint(data.managementFee)<=ray,'MORPHO_V2_FEES');
 const held=holder?uint(data.heldShares):0n,gates=holder?Object.fromEntries(['canReceiveShares','canSendAssets','canSendShares','canReceiveAssets'].map(k=>{const value=uint(data[k]);assert.ok(value===0n||value===1n);return[k,value===1n];})):null;
 // VaultV2 max* methods deliberately return0. Availability is an explicitly
 // requested share amount bounded by canonical liquidity, holdings and gates;
 // this is not a complete portfolio limit or a grant for an arbitrary receiver.
 const possible=holder&&gates.canSendShares&&gates.canReceiveAssets&&held>=n&&minimumAssets<=liquidity;
 await r.assertCanonical(head);assertOriginalPagedSepoliaReceiverRuntimeV4(r);assert.ok(!s.closed,'MORPHO_V2_VENUE_CLOSED_DURING_READ');
 return freeze({profile:'ORIGINAL_MORPHO_V2_SEPOLIA_READONLY_SNAPSHOT_V4',networkId:fixed.networkId,chainId:fixed.chainId,genesis:fixed.genesis,head:{number:head.number,hash:head.hash,timestamp:head.timestamp},addresses:a,pins:fixed.pins,
  shares,shareDecimals:18,underlyingDecimals:6,maximumNoteShares:fixed.maximumNoteShares,maximumInputAtomic:maximumInput.toString(),estimatedUnderlyingAtomic:minimumAssets.toString(),underlyingLiquidityAtomic:liquidity.toString(),totalVaultAssetsAtomic:uint(data.totalAssets).toString(),totalVaultShares:uint(data.totalSupply).toString(),performanceFee:uint(data.performanceFee).toString(),managementFee:uint(data.managementFee).toString(),
  reserve:{active:realAssets>0n,frozen:null,paused:null,availability:'VENUE_BACKING_ONLY'},position:holder?{holder,heldShares:held.toString(),maximumRedeemableShares:possible?shares:'0',requestedAmountOnly:true,gates}:null,
  trust:'RPC_PROVIDER',independentConsensus:false,thirdPartyCurator:true,financialAuthority:false,privateBalanceCredited:false,tokenValue:'TESTNET_NO_MONETARY_VALUE'});
}
export async function createOriginalMorphoV2SepoliaVenueV4(runtime){assert.equal(arguments.length,1);assertOriginalPagedSepoliaReceiverRuntimeV4(runtime);const c=readOriginalPagedSepoliaRpcContextV4(runtime);assert.equal(runtime.metadata.evmGenesis,fixed.genesis);assert.equal(c.account.networkId,fixed.networkId);const s={runtime,rpc:nativeRpcV1(c.endpoint),closed:false},v=Object.freeze({profile:'ORIGINAL_MORPHO_V2_SEPOLIA_READONLY_V4'});await snapshot(s,'finalized');own.set(v,s);return v;}
export function assertOriginalMorphoV2SepoliaVenueV4(runtime,venue){assert.equal(arguments.length,2);assert.strictEqual(state(venue).runtime,runtime);}
export async function readOriginalMorphoV2SepoliaVenueV4(venue,tag='finalized'){assert.ok(arguments.length===1||arguments.length===2);return snapshot(state(venue),tag);}
export async function quoteOriginalMorphoV2SepoliaSharesV4(venue,shares){assert.equal(arguments.length,2);assert.match(shares,/^[1-9][0-9]{0,19}$/);assert.ok(BigInt(shares)>=BigInt(fixed.minimumShares)&&BigInt(shares)<=0xffffffffffffffffn,'MORPHO_V2_SHARE_NOTE_U64_LIMIT');const view=await snapshot(state(venue),'latest',shares);assert.ok(view.reserve.active,'MORPHO_V2_BACKING_UNAVAILABLE');return freeze({profile:'ORIGINAL_MORPHO_V2_SEPOLIA_SHARE_QUOTE_V4',view,quoteIsAuthorization:false,privateOutputPrepared:false});}
export async function readOriginalMorphoV2SepoliaPublicPositionV4(venue,holder,shares,tag='finalized'){assert.ok(arguments.length===3||arguments.length===4);address(holder);assert.match(shares,/^(0|[1-9][0-9]{0,19})$/);assert.ok(BigInt(shares)<=0xffffffffffffffffn,'MORPHO_V2_SHARE_NOTE_U64_LIMIT');return snapshot(state(venue),tag,shares,holder);}
export function closeOriginalMorphoV2SepoliaVenueV4(venue){assert.equal(arguments.length,1);state(venue).closed=true;}
