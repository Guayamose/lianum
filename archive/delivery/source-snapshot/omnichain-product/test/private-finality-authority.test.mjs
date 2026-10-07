import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash,randomBytes } from 'node:crypto';
import { terminalStatementHash, finalityPermitKey, finalityPermitCommitment, finalityProfileHash, assertAuthorityEffectBinding, createCurrentFinalityAuthority } from '../src/private-finality-authority.mjs';
import { effectConsumptionHash, createDisposableNativeIssuerLifetime } from '../src/private-native-certificate.mjs';
import { base58Encode,signSolanaTransfer,validateSolanaObservation } from '../src/chains/solana-runtime.mjs';
const h=n=>'0x'+n.toString(16).padStart(2,'0').repeat(32),word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),sha=b=>'0x'+createHash('sha256').update(b).digest('hex');
const words=d=>Array.from({length:8},(_,i)=>word(BigInt('0x'+d.slice(2+i*8,10+i*8))));
const statement=()=>Array.from({length:65},(_,i)=>word(i));

test('PC16 statement is exactly 0x17 followed by all 65 ordered 32-byte words',()=>{
 const inputs=statement(),expected=sha(Buffer.from('17'+inputs.map(x=>x.slice(2)).join(''),'hex'));
 assert.equal(terminalStatementHash(inputs),expected);
 for(let i=0;i<65;i++){const changed=[...inputs];changed[i]=word(BigInt(changed[i])+1n);assert.notEqual(terminalStatementHash(changed),expected);}
 for(const input of [inputs.slice(1),[...inputs,word(0)]])assert.throws(()=>terminalStatementHash(input),/EXACT_TERMINAL_WORDS/);
 assert.throws(()=>terminalStatementHash([h(1).slice(2),...inputs.slice(1)]));
});

test('PC16 permit framing binds every domain, typed role, statement and version, with exact 30s commitment bytes',()=>{
 const p={chainId:31337,poolAddress:'0x'+'11'.repeat(20),scope:h(2),policy:h(3),chain:'SOL',effect:h(4),statement:terminalStatementHash(statement()),version:1};
 const key=finalityPermitKey(p),raw='16'+finalityProfileHash().slice(2)+BigInt(p.chainId).toString(16).padStart(64,'0')+p.poolAddress.slice(2)+p.scope.slice(2)+p.policy.slice(2)+'01'+p.effect.slice(2)+p.statement.slice(2)+'0000000000000001';
 assert.equal(key,sha(Buffer.from(raw,'hex')));assert.equal(Buffer.from(raw,'hex').length,222);
 for(const change of [{chainId:31338},{poolAddress:'0x'+'12'.repeat(20)},{scope:h(6)},{policy:h(7)},{chain:'BTC'},{effect:h(8)},{statement:h(9)},{version:2}])assert.notEqual(finalityPermitKey({...p,...change}),key);
 assert.equal(finalityPermitCommitment(key,1000,1030),sha(Buffer.from(key.slice(2)+'00000000000003e8'+'0000000000000406','hex')));
 assert.throws(()=>finalityPermitKey({...p,chain:'ETH'}),/PC16_CHAIN/);
});

test('PC16 stale effect B cannot borrow current certificate A or switch typed role/domain',()=>{
 const scope=h(2),policy=h(3),envelope={certificate:{chainDomain:{chain:'BTC',genesis:h(9).slice(2)},opaqueTag:h(8).slice(2)}},inputs=statement();
 inputs.splice(0,8,...words(scope));inputs.splice(8,8,...words(policy));const nf='0x'+effectConsumptionHash(scope.slice(2),envelope.certificate.chainDomain,envelope.certificate.opaqueTag).toString('hex');inputs.splice(41,8,...words(nf));
 assert.equal(assertAuthorityEffectBinding({chain:'BTC',scope,policy,inputs,envelope}),nf);
 const stale=[...inputs];stale.splice(41,8,...words(h(7)));assert.throws(()=>assertAuthorityEffectBinding({chain:'BTC',scope,policy,inputs:stale,envelope}),/PC16_EFFECT_BINDING/);
 for(const changes of [{chain:'SOL'},{scope:h(4)},{policy:h(5)}])assert.throws(()=>assertAuthorityEffectBinding({chain:'BTC',scope,policy,inputs,envelope,...changes}),/PC16_/);
});

// Real signatures, but all native observations and verifier answers here are
// SYNTHETIC HOST CONTROL FLOW ONLY, never native consensus or proof evidence.
async function syntheticAuthority(){
 const signed={...signSolanaTransfer({seed:randomBytes(32),recipient:base58Encode(Buffer.alloc(32,4)),recentBlockhash:base58Encode(Buffer.alloc(32,5)),lamports:'3000000'}),genesis:base58Encode(Buffer.alloc(32,6))};
 const f={expected:signed,genesis:signed.genesis,status:{err:null,slot:100,confirmations:null,confirmationStatus:'finalized'},transaction:{slot:100,transaction:[signed.transactionBase64,'base64'],meta:{err:null,fee:5000,preBalances:[10000000,0,1],postBalances:[6995000,3000000,1],innerInstructions:[]}},currentSlot:105,block:{blockhash:base58Encode(Buffer.alloc(32,7)),previousBlockhash:base58Encode(Buffer.alloc(32,8)),signatures:[signed.signature],parentSlot:99,blockHeight:98}};
 const control={time:610,outage:false,verified:false,observedAfterVerify:false,permitCalls:0,adverseCalls:0,adverse:false,failAdverseOnce:false,archives:[],observations:0};
 const runtime={genesis:signed.genesis,solver:signed.solver,recipient:signed.recipient,balance:async()=> '10000000',transfer:async(amount,{onSigned})=>{await onSigned(signed);return signed;},observe:async()=>{control.observations++;if(control.observationError)throw new Error(control.observationError);if(control.outage)throw new Error('SYNTHETIC_OUTAGE');control.observedAfterVerify=control.verified;const fact=validateSolanaObservation(f);return control.adverse?{...fact,finalized:false}:fact;}};
 const issuer=createDisposableNativeIssuerLifetime({lifetimeId:randomBytes(32).toString('hex'),identityNamespace:randomBytes(32).toString('hex'),mode:'DISPOSABLE_LOCAL_ONLY_NO_RESTART'});
 const bridge=issuer.bind({chain:'SOL',genesis:'06'.repeat(32),policyFamilyId:'0a'.repeat(32),epochSeconds:600,minimumConfirmations:1,runtime,nowSeconds:()=>control.time,authorizeLocalInvocation:async()=>{},retainSignedDispatch:async()=>{},archiveCertificate:async()=>{}});
 const dispatch=await bridge.dispatch({localInstructionCommitment:'01'.repeat(32),invocationNonce:'02'.repeat(32),source:signed.solver,recipient:signed.recipient,amount:'3000000',executeAfter:'600',executeBefore:'1100',validFromEpoch:'1',validUntilEpoch:'2'}),envelope=await bridge.observeAndCertify(dispatch.handle);
 const account='0x'+'11'.repeat(20),scope=h(2),policy=h(3),pool={address:'0x'+'12'.repeat(20),scope,policy,snapshot:async()=>({epoch:'1',blockNumber:'0x1'}),verify:async()=>{control.verified=true;if(control.afterVerify)await control.afterVerify();return true;},call:async(method,args)=>{if(method==='solFinalityAuthority()')return '0x'+'00'.repeat(12)+account.slice(2);if(method==='acceptedRoots(bytes32)')return word(1);if(method==='authorityVersion(uint8)')return word(1);if(method==='permitKey(uint8,bytes32,bytes32,uint64)'){if(control.afterPermitKey)await control.afterPermitKey();return finalityPermitKey({chainId:31337,poolAddress:pool.address,scope,policy,chain:'SOL',effect:args[1],statement:args[2],version:args[3]});}throw Error(method);}};
 const authority=createCurrentFinalityAuthority({chain:'SOL',bridge,pool,account,chainId:31337,nowSeconds:()=>control.time,archive:async entry=>control.archives.push(structuredClone(entry)),submitAuthority:async(label,from,method)=>{assert.equal(from,account);if(method.startsWith('recordPermit'))control.permitCalls++;else{control.adverseCalls++;if(control.failAdverseOnce){control.failAdverseOnce=false;throw new Error('SYNTHETIC_AMBIGUOUS_EVM_RESPONSE');}}return {status:'0x1'};}});
 authority.remember(dispatch.handle,envelope);const inputs=statement();inputs.splice(0,8,...words(scope));inputs.splice(8,8,...words(policy));inputs[16]=word(1);inputs.splice(33,8,...words('0x'+effectConsumptionHash(scope.slice(2),envelope.certificate.chainDomain,envelope.certificate.opaqueTag).toString('hex')));
 return {authority,dispatch,envelope,inputs,control,issuer};
}

test('PC16 authority verifies global statement then freshly observes same retained effect before permit',async()=>{
 const s=await syntheticAuthority();try{const permit=await s.authority.observeAndPermit(s.dispatch.handle,{proof:Buffer.from([1]),publicInputs:s.inputs});assert.equal(s.control.observedAfterVerify,true);assert.equal(s.control.permitCalls,1);assert.equal(BigInt(permit.validUntil)-BigInt(permit.observedAt),30n);assert.throws(()=>s.authority.remember(s.dispatch.handle,s.envelope),/ALREADY_RETAINED/);await assert.rejects(()=>s.authority.observeAndPermit({}, {publicInputs:s.inputs}),/UNKNOWN_EFFECT_CAPABILITY/);}finally{s.issuer.close();}
});

test('PC16 outage cannot issue a current permit or invent an adverse fact',async()=>{
 const s=await syntheticAuthority();try{s.control.outage=true;await assert.rejects(()=>s.authority.observeAndPermit(s.dispatch.handle,{proof:Buffer.from([1]),publicInputs:s.inputs}),/SYNTHETIC_OUTAGE/);await assert.rejects(()=>s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs}),/PC16_ADVERSE_FACT_REQUIRED/);assert.equal(s.control.permitCalls,0);assert.equal(s.control.adverseCalls,0);}finally{s.issuer.close();}
});

test('PC16 authority rejects known stale epoch before synthetic foreign observation',async()=>{
 const s=await syntheticAuthority();try{const inputs=[...s.inputs];inputs[16]=word(0);await assert.rejects(()=>s.authority.observeAndPermit(s.dispatch.handle,{proof:Buffer.from([1]),publicInputs:inputs}),/PC16_CURRENT_STATEMENT_EPOCH/);assert.equal(s.control.verified,false);assert.equal(s.control.permitCalls,0);}finally{s.issuer.close();}
});


test('PC16 retains exact observed adverse fact before broadcast and retries unchanged after recovery/outage',async()=>{
 const s=await syntheticAuthority();try{
  s.control.adverse=true;s.control.failAdverseOnce=true;
  await assert.rejects(()=>s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs}),/SYNTHETIC_AMBIGUOUS_EVM_RESPONSE/);
  assert.equal(s.control.archives.length,1);const pending=s.control.archives[0];assert.equal(pending.stage,'ADVERSE_OBSERVED_PENDING_INCLUSION');
  const reads=s.control.observations;s.control.adverse=false;s.control.outage=true;
  const result=await s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs});
  assert.equal(result.evidence,pending.evidence);assert.equal(result.observedAt,pending.observedAt);assert.equal(s.control.observations,reads);assert.equal(s.control.adverseCalls,2);
  await s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs});assert.equal(s.control.adverseCalls,2);
  await assert.rejects(()=>s.authority.observeAndPermit(s.dispatch.handle,{proof:Buffer.from([1]),publicInputs:s.inputs}),/PC16_LOCALLY_ADVERSE/);
 }finally{s.issuer.close();}
});


test('PC16 definitive SOL execution-failure adapter code records adverse, host-only control',async()=>{
 const s=await syntheticAuthority();try{s.control.observationError='SOLANA_OBSERVED_EXECUTION_FAILURE';const result=await s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs});assert.equal(result.failure,'SOLANA_OBSERVED_EXECUTION_FAILURE');assert.equal(s.control.adverseCalls,1);assert.equal(s.control.archives[0].stage,'ADVERSE_OBSERVED_PENDING_INCLUSION');}finally{s.issuer.close();}
});

test('PC16 pending SOL lookup and RPC uncertainty remain unavailable, never invented adverse facts',async()=>{
 for(const code of ['SOLANA_OBSERVATION_PENDING_NO_RESEND','SOLANA_NOT_COMMITTED','OWNED_RPC_REMOTE_ERROR']){
  const s=await syntheticAuthority();try{s.control.observationError=code;await assert.rejects(()=>s.authority.observeAndPermit(s.dispatch.handle,{proof:Buffer.from([1]),publicInputs:s.inputs}),new RegExp(code));await assert.rejects(()=>s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs}),/PC16_ADVERSE_FACT_REQUIRED/);assert.equal(s.control.adverseCalls,0);assert.equal(s.control.permitCalls,0);assert.equal(s.control.archives.length,0);}finally{s.issuer.close();}
 }
});


test('PC16 definitive failure during permit refresh is latched across native recovery before adverse submission',async()=>{
 const s=await syntheticAuthority();try{
  s.control.adverse=true;
  await assert.rejects(()=>s.authority.observeAndPermit(s.dispatch.handle,{proof:Buffer.from([1]),publicInputs:s.inputs}),/PC15_SOLANA_NOT_FINALIZED/);
  assert.equal(s.control.archives.length,1);const pending=s.control.archives[0],reads=s.control.observations;assert.equal(pending.stage,'ADVERSE_OBSERVED_PENDING_INCLUSION');assert.equal(s.control.adverseCalls,0);
  s.control.adverse=false;
  await assert.rejects(()=>s.authority.observeAndPermit(s.dispatch.handle,{proof:Buffer.from([1]),publicInputs:s.inputs}),/PC16_LOCALLY_ADVERSE/);
  assert.equal(s.control.observations,reads);assert.equal(s.control.permitCalls,0);
  const result=await s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs});
  assert.equal(result.evidence,pending.evidence);assert.equal(result.observedAt,pending.observedAt);assert.deepEqual(result.canonicalEffect,pending.canonicalEffect);assert.equal(s.control.observations,reads);assert.equal(s.control.adverseCalls,1);
 }finally{s.issuer.close();}
});


test('PC16 adverse knowledge arriving during awaited proof/key checks prevents a new permit submission',async()=>{
 for(const hook of ['afterVerify','afterPermitKey']){
  const s=await syntheticAuthority();try{
   s.control[hook]=async()=>{s.control[hook]=null;s.control.adverse=true;await s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs});s.control.adverse=false;};
   await assert.rejects(()=>s.authority.observeAndPermit(s.dispatch.handle,{proof:Buffer.from([1]),publicInputs:s.inputs}),/PC16_LOCALLY_ADVERSE/);
   assert.equal(s.control.permitCalls,0);assert.equal(s.control.adverseCalls,1);assert.equal(s.control.archives[0].stage,'ADVERSE_OBSERVED_PENDING_INCLUSION');
  }finally{s.issuer.close();}
 }
});


test('PC16 cached adverse result is detached from caller mutation of retained recovery evidence',async()=>{
 const s=await syntheticAuthority();try{
  s.control.adverse=true;const first=await s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs});
  const expected=structuredClone(first);first.evidence=h(99);first.canonicalEffect.signature='caller-mutated';first.receipt.status='0x0';
  const cached=await s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs});assert.deepEqual(cached,expected);
  cached.evidence=h(98);cached.canonicalEffect.signature='caller-mutated-again';cached.receipt.status='0x0';
  const again=await s.authority.observeAndRecordAdverse(s.dispatch.handle,{publicInputs:s.inputs});assert.deepEqual(again,expected);assert.equal(s.control.adverseCalls,1);
 }finally{s.issuer.close();}
});
