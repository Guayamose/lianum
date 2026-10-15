import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOriginalPagedSepoliaRpcV4} from '../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {createOriginalAaveSepoliaVenueV4,readOriginalAaveSepoliaVenueV4,quoteOriginalAaveSepoliaSharesV4,closeOriginalAaveSepoliaVenueV4,assertOriginalAaveSepoliaVenueV4} from '../../../src/chains/evm/vault/aave-sepolia-original-v4.mjs';
import {compileFixedAaveSepoliaAdaptersV4} from '../../../src/operations/deployments/defi/aave-sepolia-compilation-v4.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/aave-sepolia-primary-v4.json',import.meta.url),'utf8'));
// Explicit HOST RPC replay of actual primary read-only responses; no mocked
// Original venue, wallet, receipt, signer, proof or public financial acceptance.
function installReadOnlyPrimaryReplay(t,mutation=()=>{}){
 const allowed=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call']),before=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://sepolia.drpc.org');const q=JSON.parse(options.body);assert.ok(allowed.has(q.method),'NO_FINANCIAL_METHOD');requests.push(q);
  const params=structuredClone(q.params??[]);
  if(q.method==='eth_getBlockByNumber'&&['latest','finalized'].includes(params[0]))params[0]=fixture.head.number;
  const row=fixture.rows.find(r=>r.method===q.method&&JSON.stringify(r.params)===JSON.stringify(params))??
   (q.method==='eth_getBlockByNumber'&&params[0]===fixture.head.number?fixture.rows.find(r=>r.method===q.method&&r.params[0]==='finalized'):null);
  assert.ok(row,'PRIMARY_READ_NOT_RETAINED '+q.method+' '+JSON.stringify(params));let result=structuredClone(row.result);result=mutation(q,result)??result;
  return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 t.after(()=>{globalThis.fetch=before;});return requests;
}
const runtime=()=>createOriginalPagedSepoliaRpcV4({endpoint:'https://sepolia.drpc.org',keysetId:'1'.repeat(64),account:{networkId:'ethereum-sepolia',address:'0x'+'2'.repeat(40)}});
test('actual primary Aave wrapper/reserve/proxy previews produce an Original readonly venue and reject cloned authority',async t=>{
 const requests=installReadOnlyPrimaryReplay(t);const {runtime:r,lifecycle}=await runtime();t.after(()=>{lifecycle.acknowledge();return r.close();});const venue=await createOriginalAaveSepoliaVenueV4(r);
 assertOriginalAaveSepoliaVenueV4(r,venue);assert.throws(()=>assertOriginalAaveSepoliaVenueV4(r,{...venue}),/ORIGINAL_VENUE/);
 const view=await readOriginalAaveSepoliaVenueV4(venue);assert.equal(view.addresses.underlying,'0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8');assert.equal(view.reserve.active,true);assert.equal(view.financialAuthority,false);assert.equal(view.privateBalanceCredited,false);
 const quote=await quoteOriginalAaveSepoliaSharesV4(venue,'1000000');assert.equal(quote.view.maximumInputAtomic,BigInt(fixture.values.previewMint1e6).toString());assert.equal(quote.quoteIsAuthorization,false);
 await assert.rejects(quoteOriginalAaveSepoliaSharesV4(venue,'999999'),/SHARE_LIMIT/);closeOriginalAaveSepoliaVenueV4(venue);await assert.rejects(readOriginalAaveSepoliaVenueV4(venue),/ORIGINAL_VENUE/);
 assert.ok(requests.length>30);assert.ok(requests.every(q=>!q.method.startsWith('eth_send')));
});
test('a proxy implementation change is rejected even when facade bytecode/getters stay unchanged',async t=>{
 installReadOnlyPrimaryReplay(t,(q,result)=>q.method==='eth_getStorageAt'&&q.params[0]===fixture.values.factoryWrapper.replace(/^0x0{24}/,'0x')?'0x'+'0'.repeat(24)+'3'.repeat(40):result);
 const {runtime:r,lifecycle}=await runtime();t.after(()=>{lifecycle.acknowledge();return r.close();});await assert.rejects(createOriginalAaveSepoliaVenueV4(r),/PROXY_CHANGED/);
});
test('fresh fixed Sepolia investment/exit artifacts compile with the original pinned compiler',()=>{
 const build=compileFixedAaveSepoliaAdaptersV4();assert.equal(build.publicDeployment,false);assert.equal(build.privateProofAcceptance,false);
 assert.deepEqual(build.artifacts.delivery.abi.find(row=>row.type==='constructor').inputs.map(row=>row.type),['address','address']);
 assert.deepEqual(build.artifacts.exit.abi.find(row=>row.type==='constructor').inputs,[]);
 const redeem=build.artifacts.exit.abi.find(row=>row.name==='redeem');assert.deepEqual(redeem.inputs.map(row=>row.type),['uint128','uint128','uint64','bytes32','address']);
 assert.ok(build.artifacts.delivery.evm.deployedBytecode.object.length/2<=24576);
});
