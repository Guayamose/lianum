/** Source/host-only V4 key-boundary regressions. Actual wrapped controller capability
 * closures and extracted native transfer execute against explicitly synthetic
 * operator/process/transport ports. No native node, funded run or prover. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture, installRetainedNoncePayout, addLifecycleMethod, lifecycleRoute, advanceLifecycleHead,
  poisonedOperators, poisonedQuorums, hash, zero, ownedClaimControllerJournal,
  consumeWrappedClaimOriginalKeyAuthorityV4 as consume, openNativeClaimSolanaPayoutAuthority as open}
  from '../../../fixtures/claims/wrapped/authorization/wrapped-key-authority-v4.fixture.mjs';
const NativeController = await import('../../../../src/claims/controller/controller.mjs');
const FixedIssuer = await import('../../../../src/claims/payouts/payout-controller-dispatch-v1.mjs');
const WrappedController = await import('../../../../src/claims/wrapped/controller/wrapped-controller-v1.mjs');
import {createRuntimeFixture} from '../../../fixtures/chains/solana/runtime/solana-payout-authority-runtime.fixture.mjs';

async function unsigned(f) {
  const n=await installRetainedNoncePayout(f),native=f.options.claims.nativeRuntimes[0];
  await n.journal.update(data=>{data.tickets[0].native=null;data.tickets[0].route=null;return data;});
  f.state.gateways[0].tickets[0].state='1';f.state.gateways[0].activePayout=zero;
  native.transfers=[];native.roles={depositor:{endpoint:hash('depositor')},escrow:{endpoint:n.prepared.intent.sourcePublicKey},recipient:{endpoint:n.prepared.intent.recipientPublicKey}};
  native.inventory=async()=>({accounts:Object.values(native.roles).map(role=>({...role,exists:true,total:'100000000',rentExemptMinimum:'1000'}))});
  addLifecycleMethod(f,'beginPayout',[{name:'ticketId',type:'bytes32'},lifecycleRoute,f.authSchema]);
  f.options.quorum.authorizePayout=async()=>({head:structuredClone(f.state.head),message:{validFrom:f.state.head.timestamp,validUntil:String(BigInt(f.state.head.timestamp)+30n)},signatures:['fixed-original-signature']});
  f.control.includedHook=()=>{f.state.gateways[0].tickets[0].state='2';f.state.gateways[0].activePayout=n.id;advanceLifecycleHead(f);};
  return {...n,native};
}
async function captured(t) {
  const f=await fixture(), n=await unsigned(f), clock={now:0},mock=t.mock.method(performance,'now',()=>clock.now);
  let token;
  n.adapter.transfer=async(_request,callbacks)=>{token=await callbacks.beforeSign(n.prepared);throw Error('TEST_CAPTURED_KEY');};
  await assert.rejects(f.controller.payout({ticketId:n.id}),/TEST_CAPTURED_KEY/);
  return {f,n,clock,token,consume(...args){return consume(...(args.length?args:[token,'payout',n.native.close,n.native.genesis,'redeem',n.prepared]));},
    async close(){mock.mock.restore();poisonedOperators.delete(f.options.operators[0]);poisonedQuorums.delete(f.options.quorum);await f.close();}};
}

test('V4 native payout key token is frozen, original-bound, one-use and signature-preserving',async t=>{
  const x=await captured(t);try{const evm=(await x.n.journal.read()).evm[0];assert.equal(evm.method,'beginPayout');assert.equal(evm.finalAudit.profile,'WRAPPED_CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4');const before=structuredClone(x.n.prepared);assert.ok(Object.isFrozen(x.token));x.consume();assert.deepEqual(x.n.prepared,before);assert.throws(()=>x.consume(),/AUTHORITY_V4_REQUIRED/);assert.equal(x.n.control.signingCalls,0);}finally{await x.close();}
});
for(const bad of ['undefined','copy','proxy','callback','boolean'])test(`V4 refuses ${bad} acknowledgment without key authority`,async t=>{
  const x=await captured(t);try{const token=bad==='copy'?{...x.token}:bad==='proxy'?new Proxy(x.token,{}):bad==='callback'?{assertBeforeKey(){}}:bad==='boolean'?true:undefined;
    assert.throws(()=>x.consume(token,'payout',x.n.native.close,x.n.native.genesis,'redeem',x.n.prepared),/AUTHORITY_V4_REQUIRED/);x.consume();}finally{await x.close();}
});
for(const field of ['purpose','runtime','genesis','route','prepared'])test(`V4 exact ${field} refusal burns original token`,async t=>{
  const x=await captured(t);try{const args=[x.token,'payout',x.n.native.close,x.n.native.genesis,'redeem',x.n.prepared];
    const i={purpose:1,runtime:2,genesis:3,route:4,prepared:5}[field];args[i]=field==='runtime'?()=>{}:field==='prepared'?structuredClone(x.n.prepared):'wrong';
    assert.throws(()=>x.consume(...args),/ORIGINAL_KEY_/);assert.throws(()=>x.consume(),/AUTHORITY_V4_REQUIRED/);}finally{await x.close();}
});
for(const fault of ['prepared-wire','prepared-intent','operator','quorum','keeper','controller','evm-fence','deadline'])test(`V4 key refuses ${fault} after the last awaited callback`,async t=>{
  const x=await captured(t);try{if(fault==='prepared-wire')x.n.prepared.unsignedWire+='00';if(fault==='prepared-intent')x.n.prepared.intent.lamports='1';
    if(fault==='operator')poisonedOperators.add(x.f.options.operators[0]);if(fault==='quorum')poisonedQuorums.add(x.f.options.quorum);
    if(fault==='keeper')await assert.rejects(x.n.journal.update(()=>{throw Error('TEST_KEEPER_FAULT');}),/WRITE_UNCERTAIN/);if(fault==='controller')x.f.controller.close();
    if(fault==='evm-fence')x.f.runtime.ingressSendState={epoch:'99',busy:false,uncertain:false};if(fault==='deadline')x.clock.now=30000;
    assert.throws(()=>x.consume(),/ORIGINAL_KEY_|CLOSED|KEEPER|TOO_OLD/);assert.throws(()=>x.consume(),/AUTHORITY_V4_REQUIRED/);
  }finally{await x.close();}});

for(const fault of ['none','native-await-expiry','expensive-codec-expiry','undefined'])test(`actual SOL transfer closure V4 boundary ${fault}`,async t=>{
  const f=await fixture(),n=await unsigned(f),clock={now:0},mock=t.mock.method(performance,'now',()=>clock.now);
  const r=createRuntimeFixture('redeem',{prepared:n.prepared,nativeWire:n.nativeWire,nativeId:n.nativeId,transactionSHA256:n.binding.transactionSHA256,
    clock,close:n.native.close,genesis:n.native.genesis,originalKeyControllerV4:{consumeNativeClaimOriginalKeyAuthorityV4:consume},
    nativeKeyRead:()=>{if(fault==='native-await-expiry')clock.now+=30000;},keyCodec:()=>{if(fault==='expensive-codec-expiry')clock.now+=30000;}});
  n.adapter.transfer=async(_request,callbacks)=>r.start('transfer',{...callbacks,
    beforeSign:async value=>{if(fault==='undefined')return undefined;const token=await callbacks.beforeSign(value);if(fault==='native-await-expiry'){await Promise.resolve();clock.now+=30000;}return token;},onSigned:async()=>{throw Error('TEST_AFTER_KEY');}});
  try{await assert.rejects(f.controller.payout({ticketId:n.id}),fault==='none'?/TEST_AFTER_KEY/:fault==='undefined'?/AUTHORITY_V4_REQUIRED/:/TOO_OLD/);
    assert.equal(r.counters().signCalls,fault==='none'?1:0);assert.equal(r.counters().sendCalls,0);
    if(fault==='none')assert.equal(r.record().broadcastAttempts,0);
  }finally{mock.mock.restore();await f.close();}
});

for(const fault of ['none','copy','prepared','authorization','deadline'])test(`unrelated ingress V2 original audit with V4 key token ${fault}`,async t=>{
  const f=await fixture(),clock={now:0},mock=t.mock.method(performance,'now',()=>clock.now);
  try{const p=await f.controller.prepare({handoff:f.handoff});f.control.intentId=p.intentId;
    f.control.preparedHook=()=>{clock.now=90000;};
    f.control.afterBeforeSign=async({scope,keyToken,prepared})=>{await Promise.resolve();
      if(fault==='copy')scope.consumeBeforeKey({...keyToken},prepared);
      if(fault==='prepared')prepared.unsignedWire+='00';if(fault==='authorization')f.control.lastAuthorization.authorization.signatures[0].r=hash('changed');
      if(fault==='deadline')clock.now+=30000;};
    if(fault==='none'){await f.controller.preposition({intentId:p.intentId});const row=(await ownedClaimControllerJournal(f.keeper,f.runtime,f.options.claims).read()).evm[0];
      assert.equal(row.finalAudit.profile,'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V2');assert.equal(row.finalAudit.originalAuthorizationAgeMilliseconds,90000);
      assert.equal(f.runtime.transactions.length,1);assert.throws(()=>f.control.lastKeyScope.consumeBeforeKey(f.control.lastKeyToken,f.control.activePrepared),/AUTHORITY_V4_REQUIRED/);
    }else{await assert.rejects(f.controller.preposition({intentId:p.intentId}),/AUTHORITY_V4_REQUIRED|PREPARATION_CHANGED|AUTHORIZATION_CHANGED|CALL_ARGUMENTS_CHANGED|TOO_OLD/);assert.equal(f.runtime.transactions.length,0);}
  }finally{mock.mock.restore();await f.close();}
});

for(const phase of ['before-latch','after-latch'])test(`SOL V2 finalsend consumes V4 original lease at ${phase}`,async t=>{
  const f=await fixture(),n=await installRetainedNoncePayout(f,{status:'RESERVED_BEFORE_BROADCAST'}),native=f.options.claims.nativeRuntimes[0],clock={now:0},mock=t.mock.method(performance,'now',()=>clock.now);
  let token;n.adapter.resumeReservedPayout=async(_r,callbacks)=>{token=await callbacks.beforeBroadcast(n.prepared);throw Error('TEST_CAPTURED_SEND');};
  try{await assert.rejects(f.controller.payout({ticketId:n.id}),/TEST_CAPTURED_SEND/);
    if(phase==='before-latch'){clock.now=30000;assert.throws(()=>open(token,native.close,native.genesis,n.prepared,n.original),/TOO_OLD/);assert.equal(n.original.broadcastAttempts,0);}
    else{const gate=open(token,native.close,native.genesis,n.prepared,n.original);n.original.phase='BROADCAST_UNKNOWN';n.original.broadcastAttempts=1;
      await gate.beforeSend(n.prepared);clock.now=30000;assert.throws(()=>gate.assertBeforeSend(n.prepared),/TOO_OLD/);assert.equal(n.original.broadcastAttempts,1);}
    assert.equal(n.control.sends,0);assert.equal(n.control.signingCalls,0);
  }finally{mock.mock.restore();await f.close();}
});

test('source key boundary contains no await after genuine authority consumption; wrapped payout has no fallback',()=>{
  for(const [file,consumeText,keyText] of [
    ['../../../../src/chains/solana/transfers/solana-transfers.mjs','originalKeyControllerV4.consumeNativeClaimOriginalKeyAuthorityV4','const signature = sign(null, message, privateKey)'],
    ['../../../../src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs','originalKeyControllerV4.consumeNativeClaimOriginalKeyAuthorityV4',"const signed = await rpc('signrawtransactionwithwallet'"],
    ['../../../../src/chains/evm/runtime/original-claim-dispatch-v1.mjs','scope).consumeBeforeKey(',"const raw = economicV2"]]){
    const source=readFileSync(new URL(file,import.meta.url),'utf8'),a=source.indexOf(consumeText),b=source.indexOf(keyText,a);assert.ok(a>0&&b>a);
    const between=source.slice(a,b);assert.ok(!/await\s+(?!beforeSign)/.test(between));
    if(!file.includes('evm'))assert.ok(!between.includes('=== undefined'));
  }
});

for(const fault of ['none','deadline','signature','head','proof-window'])test(`CO42 discharge original debt-health V4 key boundary ${fault}`,async t=>{
  const f=await fixture(),n=await installRetainedNoncePayout(f,{status:'RESERVED_BEFORE_BROADCAST'}),clock={now:0},mock=t.mock.method(performance,'now',()=>clock.now);
  try{
    n.control.observationStatus='observed';
    f.options.quorum.facts=async()=>({head:structuredClone(f.state.head),certificates:[]});
    f.options.proofClients.claim_discharge.prove=async ({expectedPublicInputs})=>({proof:'abcd',publicInputs:expectedPublicInputs});
    const sigs=[0,1,2].map(signerIndex=>({signerIndex,v:27,r:hash('fixed-r'),s:hash('fixed-s')}));
    let originalHealth;
    f.options.quorum.health=async()=>{originalHealth=f.control.registerAuthorization({head:structuredClone(f.state.head),message:{validFrom:f.state.head.timestamp,validUntil:String(BigInt(f.state.head.timestamp)+30n)},abiSignatures:sigs});return originalHealth;};
    addLifecycleMethod(f,'discharge',[{name:'proof',type:'tuple',components:[{name:'proof',type:'bytes'},{name:'inputs',type:'bytes32[]'}]},
      {name:'sequence',type:'uint64'},{name:'from',type:'uint64'},{name:'until',type:'uint64'},
      {name:'signatures',type:'tuple[3]',components:[{name:'signerIndex',type:'uint8'},{name:'v',type:'uint8'},{name:'r',type:'bytes32'},{name:'s',type:'bytes32'}]}]);
    f.control.preparedHook=()=>{clock.now=90000;};
    f.control.afterBeforeSign=async()=>{await Promise.resolve();if(fault==='deadline')clock.now+=30000;if(fault==='signature')originalHealth.abiSignatures[0].r=hash('changed');if(fault==='head')originalHealth.head.hash=hash('changed-head');};
    if(fault==='proof-window')f.state.head.timestamp='999999';
    f.control.includedHook=()=>{f.state.gateways[0].tickets[0].state='4';};
    if(fault==='none'){
      await f.controller.payout({ticketId:n.id});const rows=await n.journal.read(),evm=rows.evm[0];assert.equal(evm.method,'discharge');assert.equal(evm.finalAudit.profile,'WRAPPED_CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4');
      assert.equal(evm.finalAudit.originalAuthorizationAgeMilliseconds,90000);assert.equal(f.runtime.transactions.length,1);assert.equal(rows.tickets[0].status,'DISCHARGED');
    }else{await assert.rejects(f.controller.payout({ticketId:n.id}),/TOO_OLD|CHANGED|WINDOW_EXPIRED/);assert.equal(f.runtime.transactions.length,0);}
    assert.equal(n.control.signingCalls,0);assert.equal(n.control.sends,0);
  }finally{mock.mock.restore();await f.close();}
});

for (const route of ['direct', 'fixed-dispatch']) test(`actual wrapped key brand cannot enter native authority; ${route}`, async t => {
  const x = await captured(t);
  try {
    assert.equal(NativeController.isNativeClaimOriginalKeyAuthorityV4(x.token), false);
    assert.equal(WrappedController.isWrappedClaimOriginalKeyAuthorityV4(x.token), true);
    const args = [x.token, 'payout', x.n.native.close, x.n.native.genesis, 'redeem', x.n.prepared];
    assert.throws(() => NativeController.consumeNativeClaimOriginalKeyAuthorityV4(...args), /AUTHORITY_V4_REQUIRED/);
    assert.equal(WrappedController.isWrappedClaimOriginalKeyAuthorityV4(x.token), true);
    if (route === 'fixed-dispatch') FixedIssuer.consumeNativeClaimOriginalKeyAuthorityV4(...args);
    else x.consume();
    assert.equal(WrappedController.isWrappedClaimOriginalKeyAuthorityV4(x.token), false);
    assert.throws(() => FixedIssuer.consumeNativeClaimOriginalKeyAuthorityV4(...args), /AUTHORITY_V4_REQUIRED/);
  } finally { await x.close(); }
});
for (const kind of ['evm', 'solana-send']) test(`other genuine wrapped purpose cannot enter payout key consumer: ${kind}`, async t => {
  const f = await fixture();
  try {
    if (kind === 'evm') {
      const prepared = await f.controller.prepare({handoff:f.handoff});f.control.intentId=prepared.intentId;
      f.control.afterBeforeSign = ({keyToken, prepared}) => {
        assert.throws(() => FixedIssuer.consumeNativeClaimOriginalKeyAuthorityV4(keyToken,'payout',f.runtime.close,f.runtime.metadata.evmGenesis,'redeem',prepared), /ORIGINAL_KEY_PURPOSE/);
      };
      await assert.rejects(f.controller.preposition({intentId:prepared.intentId}), /AUTHORITY_V4_REQUIRED/);
      assert.equal(f.runtime.transactions.length,0);
    } else {
      const n = await installRetainedNoncePayout(f,{status:'RESERVED_BEFORE_BROADCAST'});
      let sendToken;
      n.adapter.resumeReservedPayout = async (_r,callbacks) => {sendToken = await callbacks.beforeBroadcast(n.prepared);throw Error('TEST_SEND_TOKEN_CAPTURED');};
      await assert.rejects(f.controller.payout({ticketId:n.id}),/TEST_SEND_TOKEN_CAPTURED/);
      assert.throws(() => FixedIssuer.consumeNativeClaimOriginalKeyAuthorityV4(sendToken,'payout',f.options.claims.nativeRuntimes[0].close,f.config.nativeGenesis,'redeem',n.prepared), /AUTHORITY_V4_REQUIRED/);
      assert.throws(() => FixedIssuer.authorizeNativeClaimBitcoinPayoutLatch(sendToken,n.prepared,{}), /PRIVATE_SEND_TOKEN_REQUIRED/);
      const gate = FixedIssuer.openNativeClaimSolanaPayoutAuthority(sendToken,f.options.claims.nativeRuntimes[0].close,f.config.nativeGenesis,n.prepared,n.original);
      assert.ok(gate);assert.equal(n.control.sends,0);
    }
  } finally {await f.close();}
});
