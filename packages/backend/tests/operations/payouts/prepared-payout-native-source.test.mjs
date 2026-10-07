/** Execute the actual owned SOL/BTC assertion and SOL revalidation closures.
 * Lexical RPC/health/roles are controlled; no native process, network or key use.
 * Proves scheduling retains original context identity, rather than cloning it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = family => readFileSync(new URL('../chain-adapters/owned-' + family + '-runtime.mjs', import.meta.url), 'utf8');
const sol = source('solana');
function excerpt(start, end) { const a = sol.indexOf(start), b = sol.indexOf(end, a); assert.ok(a >= 0 && b > a); return sol.slice(a, b); }
const checkSource = excerpt('    async function assertPrepared(prepared) {', '    async function transfer(');
const prepareSource = excerpt('    async function prepareNonceAtCurrentHead(', '    async function assertPrepared(');
const same = (a,b,label) => assert.deepEqual(a,b,label);
const requireCondition = (value,label) => assert.ok(value,label);

test('actual SOL assertion revalidates only original activePrepared and retained route, including copied input and final busy fence', async () => {
  const original = Object.freeze({ intent: Object.freeze({ sourcePublicKey: '11', recipientPublicKey: '22', lamports: '10', wireKeyCommitment: '33' }) });
  for (const mode of ['pass', 'changed', 'window', 'route', 'busy']) {
    const calls = [], state = { observationBusy: mode === 'busy' };
    const invoke = vm.runInThisContext('(function(env){ const {requireCondition,same,assertOwnedCustodyIntent,sourceKey,recipientAddress,base58Decode,roles,activePrepared,activeRoute,prepareAtCurrentHead} = env; let busy=true, preSignReadWindow=env.window,preBroadcastReadWindow=false,inventoryBusy=false; let observationBusy=env.state.observationBusy; '+ checkSource +'return assertPrepared;})')({
      requireCondition, same, state, roles: {}, activePrepared: original, activeRoute: { name: 'redeem' }, window: mode !== 'window',
      assertOwnedCustodyIntent(route,froles,family,intent) { assert.equal(route,'redeem'); assert.equal(intent,original.intent); },
      sourceKey: () => ({ publicBytes: Buffer.from(mode === 'route' ? 'ff' : '11','hex') }),
      recipientAddress: () => 'recipient', base58Decode: () => Buffer.from('22','hex'),
      async prepareAtCurrentHead(route,amount,key,prepared) { calls.push(prepared); assert.equal(prepared,original); if(mode==='busy')state.observationBusy=true; },
    });
    const copy = structuredClone(original); if(mode==='changed')copy.intent.lamports='11';
    if(mode==='pass') { await invoke(copy); assert.deepEqual(calls,[original]); }
    else await assert.rejects(invoke(copy), /PREPARED_IDENTITY|PRE_SIGN_WINDOW_REQUIRED|RETAINED_ROUTE_CHANGED|OBSERVATION_NOT_AWAITED/);
  }
});

test('actual SOL nonce preparation updates existing original WeakMap context and never mints a key for caller snapshot', async () => {
  const original = Object.freeze({ intent: Object.freeze({ sourcePublicKey: '11', recipientPublicKey: '22', nonceAccountPublicKey:'33', durableNonce:'44', lamports:'10',wireKeyCommitment:'55' }) });
  const contexts = new WeakMap([[original,{slot:'10'}]]), calls=[];
  const make = () => vm.runInThisContext('(function(env){const {MEMO_PROGRAM,sourceKey,recipientAddress,selectedNonce,healthy,read,contextSlot,decodeSolanaNonceAccountData,accountBytes,base58Decode,lamportsValue,bytes32,same,encodeSolanaNonceBindingMessage,genesis,preparationContexts,nonceObservations,requireCondition,revalidateSolanaNoncePreparedState,checkedNoncePreparedState}=env;'+prepareSource+'return prepareNonceAtCurrentHead;})')({
    MEMO_PROGRAM:{address:'memo'}, sourceKey: () => ({ publicBytes:Buffer.from('11','hex'),address:'source' }), recipientAddress: () => 'recipient',
    selectedNonce: () => ({ infrastructure:{nonceAccountPublicKey:'33'},account:{address:'nonce'} }), healthy:async()=>{},
    read: async method => method==='getMultipleAccounts'?{value:[null,null,null,{data:[]}]}:{context:{slot:11},value:{}},
    contextSlot:()=>11, decodeSolanaNonceAccountData:()=>({durableNonce:'44'}),accountBytes:()=>Buffer.alloc(0),
    base58Decode:()=>Buffer.from('22','hex'),lamportsValue:BigInt,bytes32:x=>x,same,
    encodeSolanaNonceBindingMessage:()=> '00',genesis:'genesis',preparationContexts:contexts,nonceObservations:new WeakMap(),requireCondition,
    revalidateSolanaNoncePreparedState({prepared,context}) { assert.equal(prepared,original); assert.equal(context,contexts.get(original)); calls.push(prepared); return {slot:String(BigInt(context.slot)+1n)}; },
    checkedNoncePreparedState:()=>assert.fail('must not prepare a new identity'),
  });
  const check=make(); assert.equal(await check({},'10','55',original),original); assert.equal(contexts.get(original).slot,'11');
  assert.equal(await check({},'10','55',original),original); assert.equal(contexts.get(original).slot,'12');
  const copied=structuredClone(original); await assert.rejects(check({},'10','55',copied), /UNKNOWN_PREPARED_CONTEXT/);
  assert.equal(contexts.has(copied),false); assert.deepEqual(calls,[original,original]);
});

test('unchanged BTC original assertion retains source UTXO, owned scripts and both native-head checks', () => {
  const btc=source('bitcoin'); const start=btc.indexOf('      async function assertPrepared(prepared) {'), end=btc.indexOf('      function bindNativeAsset',start);
  const body=btc.slice(start,end);
  for(const invariant of ['BITCOIN_PRE_SIGN_WINDOW_REQUIRED','BITCOIN_PREPARED_IDENTITY','BITCOIN_NATIVE_HEAD_CHANGED','BITCOIN_SOURCE_SPENT_OR_CHANGED','BITCOIN_OWNED_SCRIPT_CHANGED']) assert.ok(body.includes(invariant));
  assert.ok(body.includes('JSON.stringify(activePrepared)')); assert.ok(body.includes('await health()')); assert.ok(body.includes("await rpc('gettxout'"));
});

test('actual BTC assertion rejects changed head, spent source, changed script and foreign original preparation', async () => {
  const btc=source('bitcoin'),start=btc.indexOf('      async function assertPrepared(prepared) {'),end=btc.indexOf('      function bindNativeAsset',start),body=btc.slice(start,end);
  const prepared={intent:{sourceTxid:'txid',sourceVout:'0',sourceSatoshi:'20'},funds:{nativeHead:{id:'head',height:'10'}}};
  for(const fault of ['pass','head','spent','script','prepared']) {
    let calls=0;
    const check=vm.runInThisContext('(function(env){const {live,need,preSignReadWindow,busy,activePrepared,activeRoute,custody,assertOwnedCustodyIntent,roles,health,rpc,addressInfo,bitcoinSatoshiFromAmount,BITCOIN_TRANSFER_LIMITS}=env;'+body+'return assertPrepared;})')({
      live(){},need:requireCondition,preSignReadWindow:true,busy:true,activePrepared:prepared,
      activeRoute:{name:'refund',source:'source',sourceScript:'script',sourceWallet:'wallet',changeAddress:'change',changeScript:'change-script'},
      custody:true,assertOwnedCustodyIntent(route){assert.equal(route,'refund');},roles:{},
      async health(){calls++;return {tip:fault==='head'&&calls===2?'fork':'head',height:10};},
      async rpc(method){assert.equal(method,'gettxout');return fault==='spent'?null:{bestblock:'head',scriptPubKey:{hex:'script'},value:'20',confirmations:6};},
      async addressInfo(address){return {scriptPubKey:fault==='script'?'bad':address==='source'?'script':'change-script'};},
      bitcoinSatoshiFromAmount:x=>x,BITCOIN_TRANSFER_LIMITS:{minimumConfirmations:6},
    });
    const input=structuredClone(prepared);if(fault==='prepared')input.intent.sourceSatoshi='21';
    if(fault==='pass'){await check(input);assert.equal(calls,2);}else await assert.rejects(check(input),/NATIVE_HEAD_CHANGED|SOURCE_SPENT_OR_CHANGED|OWNED_SCRIPT_CHANGED|PREPARED_IDENTITY/);
  }
});
