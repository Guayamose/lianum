/** HOST only: actual dispatch/clock/surface bodies, synthetic scope registries
 * and inert RPC/signing ports. No runtime, signing or financial authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { observedNativeValueReceiverSecond } from '../../../../src/chains/shared/health/native-value-observed-clock-v1.mjs';
let source;
for(const url of [new URL('../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',import.meta.url),
  new URL('./owned-evm-v2-runtime.mjs',import.meta.url)]) {
  try {source=await readFile(url,'utf8');break;} catch(error){if(error.code!=='ENOENT')throw error;}
}
assert.equal(typeof source,'string','HOST_FIXED_RUNTIME_SOURCE_REQUIRED');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,'HOST_ACTUAL_BODY_BOUNDARY');return source.slice(a,b);};
const dispatchBody=section('    const dispatchOriginal =','    // A separate versioned branch. Never relax the original value-zero contract');
const clockBody=section('    const mineAt =','    const refreshObservedClock=');
const surface=section('      ...(nativeValueOnly ? { dispatchNativeValueV1,','      signedTransaction:').trim().replace(/,$/,'');
function fixture(observedClock,{wrongKey=false,expired=false}={}) {
  const events=[],scopes=new WeakMap(),wrapped=new WeakMap(),generic=new WeakMap(),runtime={};
  const nativeId='0x'+'a'.repeat(64),transactionSHA256='b'.repeat(64),target='0x'+'c'.repeat(40),sender='0x'+'d'.repeat(40);
  const state={signs:0,broadcasts:0,prepares:0,mutations:0,walltime:100000,now:0,nonce:'0x0',pending:false,
    head:{number:'0x0',hash:'0x'+'e'.repeat(64),timestamp:'0x64',baseFeePerGas:'0x1',transactions:[]}};
  let prepared,token;
  function registryPort(registry){return {
    isOwnedClaimEvmDispatchRequest(request){assert.equal(arguments.length,1,'HOST_STRICT_UNARY_ISSUER');return registry.has(request);},
    assertOwnedClaimEvmDispatchRequest(request,boundRuntime){const row=registry.get(request);assert.ok(row&&row.runtime===boundRuntime,'HOST_SCOPE_RUNTIME_REQUIRED');return row.callbacks;},
  };}
  const modules={gate:registryPort(scopes),wrappedGate:registryPort(wrapped),ordinaryGate:{
    assertOwnedEvmDispatchRequest(request,boundRuntime){const row=generic.get(request);assert.ok(row&&row.runtime===boundRuntime,'HOST_GENERIC_SCOPE_REQUIRED');return row.callbacks;}}};
  const context={assert:{...assert, // Explicit host/VM metadata bridge; production validators unchanged.
      deepEqual:(a,b,message)=>assert.deepEqual(structuredClone(a),structuredClone(b),message)},
    Buffer,modules,observedClock,observedEconomicV2:false,economicRecoveryFence:null,economicV2:false,nativeValueOnly:false,
    runtime,localCustody:null,performance:{now:()=>state.now},Date:{now:()=>state.walltime},
    observedNativeValueReceiverSecond,usedDispatches:new WeakSet(),transactions:[],receipts:[],
    genesisHash:'0x'+'f'.repeat(64),lastTimestamp:100n,uncertainMutation:false,uncertainSignedHash:null,
    send(){},refreshObservedClock(){},advanceTo(){},dispatchNativeValueV1(){},assertNativeValuePreparedCurrent(){},observeNativeValueOriginal(){},logicalReadV4:value=>value,
    cloned:structuredClone,quantity:value=>value,bytes:value=>value,hex:value=>'0x'+BigInt(value).toString(16),
    unsignedFields:value=>value,encodeRlp:()=>Buffer.from('01','hex'),keccak:()=>Buffer.alloc(32,1),
    request(value){state.prepares++;return {...value,gas:'0xc350',value:'0x0'};},
    async mutate(work){state.mutations++;return work();},async block(){return structuredClone(state.head);},
    async rpc(method,params){events.push(method);switch(method){
      case 'eth_getTransactionCount':return state.nonce;
      case 'eth_getBalance':return '0xde0b6b3a7640000';
      case 'eth_getCode':return '0x6000';
      case 'eth_estimateGas':return '0x5208';
      case 'eth_signTransaction':state.signs++;return '0x01';
      case 'eth_sendRawTransaction':state.broadcasts++;state.pending=true;return nativeId;
      case 'evm_setNextBlockTimestamp':state.nextTime=params[0];return null;
      case 'evm_mine':state.head={...state.head,number:'0x1',hash:'0x'+'1'.repeat(64),timestamp:'0x'+state.nextTime.toString(16),transactions:state.pending?[nativeId]:[]};state.nonce='0x1';return null;
      default:throw new Error('HOST_UNEXPECTED_RPC_'+method);
    }},
    assertSignedEvmTransaction(raw,transaction){assert.equal(raw,'0x01');assert.equal(transaction.to,target);return {nativeWire:raw,nativeId,transactionSHA256,unsignedWire:'0x01'};},
    async persistSigned(){events.push('persistSigned');},async receipt(){return {status:'0x1',gasUsed:'0x5208'};},
    async assertCanonical(){return structuredClone(state.head);},
    setTimeout(resolve,milliseconds){assert.equal(milliseconds,25);events.push('observed-wait');state.walltime=105000;resolve();},
    assertAlive(){events.push('assertAlive');},revokeNativeEconomicCustodySigningV2(){throw new Error('HOST_NO_LOCAL_CUSTODY');},
  };
  let body=dispatchBody;
  // Replace the three actual fixed import declarations only. Their paths are
  // transformed by the public mapper; this port bridge works in both layouts.
  for(const [declaration,binding] of [
    ['const { assertOwnedEvmDispatchRequest } = ','modules.ordinaryGate'],
    ['const { isOwnedClaimEvmDispatchRequest, assertOwnedClaimEvmDispatchRequest } = ','modules.gate'],
    ['const { isOwnedClaimEvmDispatchRequest: isWrapped, assertOwnedClaimEvmDispatchRequest: openWrapped } = ','modules.wrappedGate'],
  ]){
    const start=body.indexOf(declaration),end=body.indexOf(';',start);
    assert.ok(start>=0&&end>start,'HOST_FIXED_IMPORT_DECLARATION');
    assert.equal(body.indexOf(declaration,start+1),-1,'HOST_FIXED_IMPORT_UNIQUE');
    const expression=body.slice(start+declaration.length,end);
    assert.ok(/^await import\('[^']+'\)$/.test(expression),'HOST_ORIGINAL_FIXED_IMPORT');
    body=body.slice(0,start)+declaration+binding+body.slice(end);
  }
  const ports=vm.runInNewContext(clockBody+body+'\n({dispatch,dispatchObservedClaimV1,surface:({'+surface+'})});',context);
  const callbacks={transaction:{from:sender,to:target,data:'0x12345678',gas:'50000',value:'0'},
    async beforeSign(value){events.push('beforeSign');prepared=value;token={};return wrongKey?{}:token;},
    consumeBeforeKey(value,expected){events.push('consumeBeforeKey');assert.equal(value,token,'HOST_ONE_USE_KEY_REQUIRED');assert.equal(expected,prepared);token=null;if(expired)state.now=30000;return 0;},
    async onSigned(){events.push('onSigned');},
  };
  const original={},wrappedRequest={},genericRequest={},foreignRuntime={};
  scopes.set(original,{runtime,callbacks});scopes.set(foreignRuntime,{runtime:{},callbacks});wrapped.set(wrappedRequest,{runtime,callbacks});
  generic.set(genericRequest,{runtime,callbacks:{transaction:callbacks.transaction,beforeSign:async()=>{events.push('ordinaryBeforeSign');},onSigned:callbacks.onSigned}});
  return {ports,state,events,original,wrappedRequest,genericRequest,foreignRuntime};
}
test('actual observed dispatch opens only original claim scopes and retains key, clock, durability and one-send guards',async()=>{
  const f=fixture(true);
  assert.equal(typeof f.ports.surface.dispatch,'function');assert.equal(f.ports.surface.dispatch,f.ports.dispatchObservedClaimV1);
  assert.equal(Object.hasOwn(f.ports.surface,'advanceTo'),false);
  for(const request of [f.wrappedRequest,f.genericRequest,{...f.original},{}])
    await assert.rejects(f.ports.surface.dispatch(request),/LOCAL_OBSERVED_RECEIVER_ORIGINAL_CLAIM_REQUIRED/);
  await assert.rejects(f.ports.surface.dispatch(f.foreignRuntime),/HOST_SCOPE_RUNTIME_REQUIRED/);
  await assert.rejects(f.ports.dispatch(f.original),/LOCAL_OBSERVED_RECEIVER_NO_LEGACY_DISPATCH/);
  assert.deepEqual([f.state.prepares,f.state.mutations,f.state.signs,f.state.broadcasts],[0,0,0,0]);
  const outcome=await f.ports.surface.dispatch(f.original);
  assert.equal(outcome.nativeId,'0x'+'a'.repeat(64));assert.equal(f.state.signs,1);assert.equal(f.state.broadcasts,1);
  assert.equal(f.events[f.events.indexOf('consumeBeforeKey')+1],'eth_signTransaction');
  assert.ok(f.events.indexOf('persistSigned')<f.events.indexOf('onSigned'));
  assert.ok(f.events.indexOf('onSigned')<f.events.indexOf('eth_sendRawTransaction'));
  assert.ok(f.events.includes('observed-wait'));assert.equal(f.state.nextTime,105);assert.equal(f.state.head.timestamp,'0x69');
  await assert.rejects(f.ports.surface.dispatch(f.original),/ALREADY_USED_NO_RESEND/);assert.equal(f.state.broadcasts,1);
  for(const options of [{wrongKey:true},{expired:true}]){const denied=fixture(true,options);
    await assert.rejects(denied.ports.surface.dispatch(denied.original),/HOST_ONE_USE_KEY_REQUIRED|EVM_KEY_ORIGINAL_AUTHORITY_TOO_OLD/);
    assert.equal(denied.state.signs,0);assert.equal(denied.state.broadcasts,0);}
  const legacy=fixture(false);assert.equal(legacy.ports.surface.dispatch,legacy.ports.dispatch);assert.equal(typeof legacy.ports.surface.advanceTo,'function');
  await legacy.ports.surface.dispatch(legacy.genericRequest);assert.equal(legacy.state.nextTime,101);assert.equal(legacy.state.broadcasts,1);
  assert.equal(legacy.events.includes('observed-wait'),false);
  await assert.rejects(legacy.ports.dispatchObservedClaimV1(legacy.original),/LOCAL_OBSERVED_RECEIVER_CLAIM_ONLY/);
});

// Execute the actual private observation and public WeakMap consumer bodies,
// using explicit inert identities. This creates no original runtime authority.
test('original observed inclusion lower bound uses current time and rejects copies, rollback and closed lifetime', () => {
  const ownedRuntimes = new WeakSet(), observedReceiverClocks = new WeakMap();
  const runtime = {}, legacy = {}; ownedRuntimes.add(runtime); ownedRuntimes.add(legacy);
  const state = { live: true, walltime: 100000, samples: 0 };
  const assertAlive = () => assert.ok(state.live, 'HOST_ORIGINAL_LIFETIME_CLOSED');
  const context = { assert, ownedRuntimes, observedReceiverClocks, observedNativeValueReceiverSecond,
    assertAlive, lastTimestamp: 100n, Date: { now() { state.samples++; return state.walltime; } } };
  const observation = section('    const observedInclusionSecond=()=>{', '    const nextObservedSecond=');
  const consumer = section('export function nativeValueReceiverInclusionSecondV1(runtime){', 'export function assertOwnedLocalEvmObservedClockV1(runtime){').replace(/^export /, '');
  const ports = vm.runInNewContext(observation + consumer + '\n({ observedInclusionSecond, nativeValueReceiverInclusionSecondV1 });', context);
  observedReceiverClocks.set(runtime, { assertAlive, inclusionSecond: ports.observedInclusionSecond });
  assert.equal(ports.nativeValueReceiverInclusionSecondV1(legacy), null); assert.equal(state.samples, 0);
  assert.equal(ports.nativeValueReceiverInclusionSecondV1(runtime), 101n);
  state.walltime = 105999; assert.equal(ports.nativeValueReceiverInclusionSecondV1(runtime), 105n);
  let traps = 0;
  const hostile = new Proxy(runtime, { get() { traps++; throw Error('PRIVATE_MESSAGE'); }, ownKeys() { traps++; return []; } });
  const before = state.samples;
  for (const forged of [{ ...runtime }, hostile])
    assert.throws(() => ports.nativeValueReceiverInclusionSecondV1(forged), /OWNED_CAPABILITY_REQUIRED/);
  assert.throws(() => ports.nativeValueReceiverInclusionSecondV1(runtime, '106'), /CLOCK_ARITY/);
  assert.equal(traps, 0); assert.equal(state.samples, before);
  state.walltime = 99999; assert.throws(() => ports.nativeValueReceiverInclusionSecondV1(runtime), /CLOCK_ROLLBACK/);
  state.live = false; const closedSamples = state.samples;
  assert.throws(() => ports.nativeValueReceiverInclusionSecondV1(runtime), /HOST_ORIGINAL_LIFETIME_CLOSED/);
  assert.equal(state.samples, closedSamples);
});
