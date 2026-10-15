import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOriginalPagedSepoliaRpcV4} from '../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {createOriginalMorphoV2SepoliaVenueV4,readOriginalMorphoV2SepoliaVenueV4,quoteOriginalMorphoV2SepoliaSharesV4,closeOriginalMorphoV2SepoliaVenueV4,assertOriginalMorphoV2SepoliaVenueV4} from '../../../src/chains/evm/vault/morpho-v2-sepolia-original-v4.mjs';
import {compileFixedMorphoV2SepoliaAdaptersV4} from '../../../src/operations/deployments/defi/morpho-v2-sepolia-compilation-v4.mjs';
import {primaryMorphoV2HostResultV4} from './support-morpho-v2-primary-v4.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/morpho-v2-sepolia-primary-v4.json',import.meta.url),'utf8'));
// Explicit HOST RPC replay of actual primary read-only responses; no mocked
// Original venue, wallet, receipt, signer, proof or public financial acceptance.
function installReadOnlyPrimaryReplay(t,mutation=()=>{}){
 const allowed=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call']),before=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://sepolia.drpc.org');const q=JSON.parse(options.body);assert.ok(allowed.has(q.method),'NO_FINANCIAL_METHOD');requests.push(q);
  const params=structuredClone(q.params??[]);
  if(q.method==='eth_getBlockByNumber'&&['latest','finalized'].includes(params[0]))params[0]=fixture.actual.head.number;
  if(q.method==='eth_getBlockByNumber'&&params[0]==='0x0')return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{hash:fixture.primary.genesis}}),{status:200,headers:{'content-type':'application/json'}});
  const row=fixture.rpc.find(r=>r.method===q.method&&JSON.stringify(r.params)===JSON.stringify(params))??
   (q.method==='eth_getBlockByNumber'&&params[0]===fixture.actual.head.number?fixture.rpc.find(r=>r.method===q.method&&r.params[0]===fixture.actual.head.number):null);
  let result=structuredClone(row?.result??primaryMorphoV2HostResultV4(fixture,q.method,params));assert.notEqual(result,undefined,'PRIMARY_READ_NOT_RETAINED '+q.method+' '+JSON.stringify(params));result=mutation(q,result)??result;
  return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 t.after(()=>{globalThis.fetch=before;});return requests;
}
const runtime=()=>createOriginalPagedSepoliaRpcV4({endpoint:'https://sepolia.drpc.org',keysetId:'1'.repeat(64),account:{networkId:'ethereum-sepolia',address:'0x'+'2'.repeat(40)}});
test('actual primary MorphoVaultV2 wrapper/reserve/proxy previews produce an Original readonly venue and reject cloned authority',async t=>{
 const requests=installReadOnlyPrimaryReplay(t);const {runtime:r,lifecycle}=await runtime();t.after(()=>{lifecycle.acknowledge();return r.close();});const venue=await createOriginalMorphoV2SepoliaVenueV4(r);
 assertOriginalMorphoV2SepoliaVenueV4(r,venue);assert.throws(()=>assertOriginalMorphoV2SepoliaVenueV4(r,{...venue}),/ORIGINAL_VENUE/);
 const view=await readOriginalMorphoV2SepoliaVenueV4(venue);assert.equal(view.addresses.underlying,'0x1c7d4b196cb0c7b01d743fbc6116a902379c7238');assert.equal(view.reserve.active,true);assert.equal(view.financialAuthority,false);assert.equal(view.privateBalanceCredited,false);
 const quote=await quoteOriginalMorphoV2SepoliaSharesV4(venue,'1000000000000000000');assert.equal(quote.view.maximumInputAtomic,BigInt(fixture.actual.values.previewMint1e18).toString());assert.equal(quote.quoteIsAuthorization,false);assert.equal(quote.view.shareDecimals,18);assert.equal(quote.view.underlyingDecimals,6);assert.ok(BigInt(quote.view.maximumInputAtomic)<BigInt(quote.view.shares));await assert.rejects(quoteOriginalMorphoV2SepoliaSharesV4(venue,'18446744073709551616'),/U64_LIMIT/);
 await assert.rejects(quoteOriginalMorphoV2SepoliaSharesV4(venue,'999999'),/U64_LIMIT/);closeOriginalMorphoV2SepoliaVenueV4(venue);await assert.rejects(readOriginalMorphoV2SepoliaVenueV4(venue),/ORIGINAL_VENUE/);
 assert.ok(requests.length>30);assert.ok(requests.every(q=>!q.method.startsWith('eth_send')));
});
test('a proxy implementation change is rejected even when facade bytecode/getters stay unchanged',async t=>{
 installReadOnlyPrimaryReplay(t,(q,result)=>q.method==='eth_getStorageAt'&&q.params[0]===fixture.primary.addresses.underlying?'0x'+'0'.repeat(24)+'3'.repeat(40):result);
 const {runtime:r,lifecycle}=await runtime();t.after(()=>{lifecycle.acknowledge();return r.close();});await assert.rejects(createOriginalMorphoV2SepoliaVenueV4(r),/PROXY_CHANGED/);
});
test('fresh fixed Sepolia investment/exit artifacts compile with the original pinned compiler',()=>{
 const build=compileFixedMorphoV2SepoliaAdaptersV4();assert.equal(build.publicDeployment,false);assert.equal(build.privateProofAcceptance,false);
 assert.deepEqual(build.artifacts.delivery.abi.find(row=>row.type==='constructor').inputs.map(row=>row.type),['address','address']);
 assert.deepEqual(build.artifacts.exit.abi.find(row=>row.type==='constructor').inputs,[]);
 const redeem=build.artifacts.exit.abi.find(row=>row.name==='redeem');assert.deepEqual(redeem.inputs.map(row=>row.type),['uint128','uint128','uint64','bytes32','address']);
 assert.ok(build.artifacts.delivery.evm.deployedBytecode.object.length/2<=24576);
});
