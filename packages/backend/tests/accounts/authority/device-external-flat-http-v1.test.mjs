/** Explicit transport/account ports only. The original HTTP module owns all
 * listeners and diagnostic slots; the fixture cannot write or issue them. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,createPublicKey,verify,X509Certificate} from 'node:crypto';
import {devicePublicKey,signDeviceMessage} from '../../../../../apps/mobile/src/custody/signing.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
import {join} from 'node:path';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {createDeviceHttpHost} from '../../support/device-http-host.mjs';
import {ROOT} from '@lianum/proofs/catalog';
import * as originalRpc from '@lianum/engine/chains/shared/runtime-harness';

test('HOST original TLS latest-error slot retains only bounded original metadata before the public mapper',async t=>{
 let pendingError,observed;
 const key=Object.freeze({async operate(){observed=pendingError;throw pendingError;},async close(){}}),copy=Object.freeze({});
 const descriptor={profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://localhost:9443'};
 const host=await createDeviceHttpHost(t,new Map([[key,descriptor]]));
 const listener=await host.api.createOriginalDeviceExternalFlatTlsServerV1({account:key,tls:host.tls});
 t.after(()=>listener.close());
 assert.equal(host.api.readOriginalDeviceExternalFlatHttpFailureV1(key),null);
 assert.throws(()=>host.api.readOriginalDeviceExternalFlatHttpFailureV1(copy));
 assert.throws(()=>host.api.readOriginalDeviceExternalFlatHttpFailureV1(new Proxy(key,{})));
 const retainFailure=async(error,action)=>{pendingError=error;const result=await host.request(0,'/v1/mobile/external-flat/operations',{consent:{action}});assert.equal(result.status,403);assert.deepEqual(JSON.parse(result.body),{error:'REQUEST_REJECTED'});assert.equal(observed,error);};
 const read=()=>host.api.readOriginalDeviceExternalFlatHttpFailureV1(key);
 const error=Object.assign(Error('EXPLICIT_PRIVATE_HOST_MESSAGE_NEVER_OUTPUT'),{code:'NATIVE_ECONOMIC_FIXED_PREPARATION',privateKey:'HOST_PRIVATE_VALUE_NEVER_OUTPUT',actual:'HOST_ACTUAL_NEVER_OUTPUT',expected:'HOST_EXPECTED_NEVER_OUTPUT'});
 const here=join(ROOT,'integration/device-external-flat-erc20-flow-v1.mjs');error.stack='HOST\n at original ('+here+':31:9)';
 await retainFailure(error,'FUND_D26');
 const first=read();assert.deepEqual(Object.keys(first).sort(),['action','clockFailure','errorCode','errorType','format','frames','phase']);assert.equal(first.errorCode,'NATIVE_ECONOMIC_FIXED_PREPARATION');assert.equal(first.errorType,'ERROR');assert.equal(first.phase,'OPERATE');assert.equal(first.action,'FUND_D26');assert.equal(first.frames.length,1);
 const encoded=JSON.stringify(first);for(const word of ['EXPLICIT_PRIVATE_HOST_MESSAGE','HOST_PRIVATE_VALUE','HOST_ACTUAL','HOST_EXPECTED'])assert.equal(encoded.includes(word),false);
 first.errorCode='MUTATED_COPY';assert.equal(read().errorCode,'NATIVE_ECONOMIC_FIXED_PREPARATION');
 // A permission-replay rejection is diagnostic only; the following original
 // W39 failure replaces it so the fixed caller catch can retain its cause.
 await retainFailure(Error('DEVICE_EXTERNAL_FLAT_PERMISSION_CONSUMED'),'FUND_D26');await retainFailure(Error('DEVICE_EXTERNAL_FLAT_WITHDRAW_GUARD'),'WITHDRAW_W39');const latest=read();assert.equal(latest.errorCode,'DEVICE_EXTERNAL_FLAT_WITHDRAW_GUARD');assert.equal(latest.action,'WITHDRAW_W39');assert.throws(()=>host.api.readOriginalDeviceExternalFlatHttpFailureV1(copy));
 await retainFailure(error,'PRIVATE_UNBOUNDED_ACTION');assert.equal(read().action,null);assert.equal(read().errorCode,'NATIVE_ECONOMIC_FIXED_PREPARATION');
 let reads=0;const unsafe={get code(){reads++;throw Error('HOST_USER_GETTER');},get message(){reads++;throw Error('HOST_USER_GETTER');}};await retainFailure(unsafe,null);assert.equal(reads,0);assert.equal(read().errorType,'THROWN_VALUE');
 await retainFailure(new Proxy({}, {get(){reads++;throw Error('HOST_PROXY');},getOwnPropertyDescriptor(){reads++;throw Error('HOST_PROXY');}}),null);assert.equal(reads,0);assert.equal(read().frames.length,0);
 // Same original freshness predicates and same DATA rejection. Controlled
 // clock arguments are synthetic; only the original Error gets provenance.
 const access={profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,action:'ACCESS',origin:'https://localhost:4321',pairingId:'11'.repeat(32),devicePublicKey:'04'+'22'.repeat(64),challengeId:'33'.repeat(32),nonce:'44'.repeat(32),expiresAt:115000};
 assert.equal(P.validateExternalFlatFreshV1(access,100000).expiresAt,115000);
 assert.equal(P.validateExternalFlatFreshV1(access,114999).expiresAt,115000);
 for(const [now,reason] of [[115000,'CLOCK_EXPIRED'],[99999,'CLOCK_FUTURE']]){
  let original;try{P.validateExternalFlatFreshV1(access,now);}catch(error){original=error;}
  assert.ok(original);assert.equal(original.message,'DEVICE_EXTERNAL_FLAT_DATA');
  await retainFailure(original,'FUND_D26');const retained=read();
  assert.equal(retained.errorCode,'DEVICE_EXTERNAL_FLAT_DATA');assert.equal(retained.clockFailure,reason);
  assert.equal(Object.hasOwn(retained,'expiresAt'),false);assert.equal(Object.hasOwn(retained,'now'),false);
  assert.equal(P.readExternalFlatFreshFailureV1(Error(original.message)),null);
 }
 assert.equal(P.readExternalFlatFreshFailureV1(new Proxy({}, {get(){throw Error('HOST_CLOCK_GETTER');}})),null);
 assert.equal(first.clockFailure,null);
 // Actual loopback RPC exception, with an explicitly inert fetch port. Keep
 // its closed provenance through the SAME original HTTP failure slot before
 // the public mapper. No runtime, transaction or financial permission exists.
 const rpcFetch=mock.method(globalThis,'fetch',async(_endpoint,input)=>{
  const request=JSON.parse(input.body);assert.equal(request.method,'eth_estimateGas');
  return{ok:true,async json(){return{error:{code:3,message:'HOST_RPC_MESSAGE_PRIVATE_NEVER_RETAIN',data:'0xdeadbeef'+'ab'.repeat(32)}};}};
 });
 let rpcError;try{await originalRpc.ownedRuntimeRpc('http://127.0.0.1:12345','eth_estimateGas',[{data:'HOST_REQUEST_PRIVATE_NEVER_RETAIN'}]);}
 catch(error){rpcError=error;}finally{rpcFetch.mock.restore();}
 assert.ok(rpcError);assert.equal(rpcError.message,'OWNED_RPC_REMOTE_ERROR');
 const wrapped=Error('FLAT_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED',{cause:rpcError});
 await retainFailure(wrapped,null);const rpc=read().originalRpc;
 assert.equal(rpc.method,'eth_estimateGas');assert.equal(rpc.rpcCode,3);assert.equal(rpc.revert.selector,'0xdeadbeef');assert.equal(rpc.revert.bytes,36);
 assert.equal(rpc.messageRetained,false);assert.equal(rpc.rawDataRetained,false);assert.equal(rpc.requestOrParametersRetained,false);
 const privateText=JSON.stringify(rpc);for(const value of ['HOST_RPC_MESSAGE','HOST_REQUEST','ab'.repeat(32),'message:','params'])assert.equal(privateText.includes(value),false);
 rpc.rpcCode=9;assert.equal(read().originalRpc.rpcCode,3);
 const fake=Object.assign(Error('OWNED_RPC_REMOTE_ERROR'),{rpcCode:3,data:'0xdeadbeef'});await retainFailure(fake,null);assert.equal(Object.hasOwn(read(),'originalRpc'),false);
 const unsafeCause=Object.defineProperty(Error('FLAT_FAILURE'),'cause',{get(){reads++;throw Error('HOST_RPC_GETTER');}});
 await retainFailure(unsafeCause,null);assert.equal(reads,0);assert.equal(Object.hasOwn(read(),'originalRpc'),false);

});


test('HOST admitted external note effects wait for the same bounded result without renewing permission or retrying POST',async t=>{
 const timerPort={now:Date.now(),next:0,timers:new Map(),setTimeout(fn,delay){assert.ok(Number.isSafeInteger(delay)&&delay>0);const token={id:++this.next,at:this.now+delay,fn,active:true,unref(){return this;}};this.timers.set(token.id,token);return token;},clearTimeout(token){if(token){token.active=false;this.timers.delete(token.id);}},advance(ms){this.now+=ms;for(const token of [...this.timers.values()].sort((a,b)=>a.at-b.at))if(token.active&&token.at<=this.now){token.active=false;this.timers.delete(token.id);token.fn();}}},setTimer=timerPort.setTimeout.bind(timerPort),clearTimer=timerPort.clearTimeout.bind(timerPort),flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
 const signingKey=new Uint8Array(32);signingKey[31]=17;const pub=devicePublicKey(signingKey),publicObject=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')}}),observed={blockNumber:'20',blockHash:h('effect-wait-head'),timestamp:'6000'};
 const descriptor=profile=>P.normalizeExternalFlatDescriptorV1({profile,origin:'https://localhost:9443',pairingId:h('effect-wait-pair-'+profile),devicePublicKey:pub,lifetime:h('effect-wait-life-'+profile),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(n=>[n,h('effect-wait-'+n).slice(0,['pool','asset','hub'].includes(n)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}}),source=descriptor(P.DEVICE_EXTERNAL_FLAT_NOTE_V1),share=descriptor(P.DEVICE_EXTERNAL_FLAT_SHARE_V1);
 let ordinal=0,admissions=0,operationPosts=0,gate=null,latestConsent=null;const consumed=new Set(),rowsByJob=new Map(),diagnostics=[];
 function consent(d,action){const jobId=h('effect-wait-job-'+(++ordinal)),withdraw=action.endsWith('W39'),cm=h('effect-wait-cm-'+ordinal),root=h('effect-wait-path-'+ordinal),recipient=h('effect-wait-recipient').slice(0,40),statement=withdraw?{scope:d.poolTerms.scope,policy:d.poolTerms.policy,epoch:'10',root,nullifier:h('effect-wait-nf-'+ordinal),amount:'100',recipient,commitment:cm}:{scope:d.poolTerms.scope,policy:d.poolTerms.policy,epoch:'10',amount:'100',output:cm},path=withdraw?{root,index:0,leaf:cm,siblings:Array(6).fill('0'.repeat(64))}:null;return P.normalizeExternalFlatConsentV1({profile:d.profile,action,descriptor:d,challengeId:h('effect-wait-challenge-'+ordinal),nonce:h('effect-wait-nonce-'+ordinal),expiresAt:timerPort.now+15000,jobId,depositJobId:withdraw?h('effect-wait-deposit'):jobId,rootId:h('effect-wait-root'),noteRevision:1,recipient,statement,path,witnessSHA256:h('effect-wait-witness'),proofSHA256:h('effect-wait-proof'),publicInputsSHA256:h('effect-wait-inputs'),observed,openingDisclosure:null});}
 function authenticate(raw,sig,d){const c=P.validateExternalFlatFreshV1(raw,timerPort.now);assert.deepEqual(c.descriptor,d);assert.ok(!consumed.has(c.challengeId));assert.equal(verify('sha256',P.externalFlatPermissionMessageV1(c),{key:publicObject,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'hex')),true);consumed.add(c.challengeId);return c;}
 const account=d=>({descriptor:d,async close(){},async operate(value){operationPosts++;const c=authenticate(value.consent,value.signature,d);assert.equal(value.witness,null);if(['FUND_D26','WITHDRAW_W39'].includes(c.action))admissions++;assert.ok(gate);await gate.promise;const row=P.normalizeExternalFlatRowV1({profile:d.profile,descriptor:d,jobId:c.jobId,mode:c.action.endsWith('D26')?'deposit_balance':'withdraw_balance',stage:c.action.endsWith('D26')?'FUNDING_UNKNOWN':'WITHDRAWAL_UNKNOWN',consentFields:Object.fromEntries(['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256','proofSHA256','publicInputsSHA256'].map(n=>[n,c[n]])),observation:null,errorCode:null});rowsByJob.set(c.jobId,row);return row;},async status(value){P.validateExternalFlatFreshV1(value.access,timerPort.now);await gate.promise;return{descriptor:d,jobs:[...rowsByJob.values()].filter(r=>r.profile===d.profile),observed,observedAt:timerPort.now,expiresAt:timerPort.now+15000};}}),reader=account(source),target=account(share),workspace={async close(){},async outputOperate(){await gate.promise;return{observed:true};},async outputReview(){await gate.promise;return{reviewed:true};}};
 const makeGate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
 const host=await createDeviceHttpHost(t,new Map([[reader,source],[target,share]]),{workspace,account:reader,targetAccount:target});
 // OpenSSL stamps the real certificate during host setup. Start the virtual
 // transport clock after that original birth, before issuing any permission;
 // a slow setup must not make this fixture's clock precede validFrom.
 timerPort.now=Math.max(timerPort.now,new X509Certificate(host.tls.certificate).validFromDate.getTime());
 const sdkURL=new URL('../../../../../apps/mobile/src/api/device-external-flat-note-api-v1.mjs',import.meta.url);
 const cryptoMock=mock.module(createRequire(sdkURL).resolve('expo-crypto'),{namedExports:{digest:async(_algorithm,bytes)=>Uint8Array.from(createHash('sha256').update(new Uint8Array(bytes)).digest()).buffer,CryptoDigestAlgorithm:{SHA256:'SHA-256'}}});
 t.after(()=>cryptoMock.restore());
 const sdkFactory=await import(sdkURL.href+'?http-waits');
 const timerMocks=[mock.method(globalThis,'setTimeout',setTimer),mock.method(globalThis,'clearTimeout',clearTimer),mock.method(Date,'now',()=>timerPort.now)];
 t.after(()=>{for(const timer of timerMocks)timer.mock.restore();});
 let listener;
 try{for(const graph of [false,true]){
  const serverIndex=host.servers.length;
  listener=await (graph?host.api.createOriginalDeviceExternalFlatGraphTlsServerV1({account:reader,targetAccount:target,workspace,tls:host.tls}):host.api.createOriginalDeviceExternalFlatTlsServerV1({account:reader,tls:host.tls}));
  const fetchImpl=async(uri,init)=>{const path=new URL(uri).pathname,requestValue=JSON.parse(init.body);if(path.endsWith('/challenges'))return new Response(JSON.stringify({profile:(uri.includes('/external-flat-share/')?share:source).profile,action:'ACCESS',origin:source.origin,pairingId:(uri.includes('/external-flat-share/')?share:source).pairingId,devicePublicKey:pub,challengeId:h('effect-wait-access-'+(++ordinal)),nonce:h('effect-wait-accessnonce-'+ordinal),expiresAt:timerPort.now+15000}),{headers:{'content-type':'application/json'}});if(path.endsWith('/reviews'))return new Response(JSON.stringify({consent:latestConsent}),{headers:{'content-type':'application/json'}});const response=await host.request(serverIndex,path,requestValue,source.origin);return new Response(response.body,{status:response.status,headers:response.headers});};
  // Actual SDK submission and each actual TLS callback remain live beyond15s
  // only after one fresh original admission. No operation is sent twice.
  for(const d of graph?[source,share]:[source])for(const action of d===source?['FUND_D26','WITHDRAW_W39']:['WITHDRAW_W39']){const client=sdkFactory.createDeviceExternalFlatNoteApiV1({descriptor:d,fetchImpl});latestConsent=consent(d,action);const a=await client.challenge(),sigA=signDeviceMessage(signingKey,P.externalFlatPermissionMessageV1(a)),draft=Object.fromEntries(['action','jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(n=>[n,latestConsent[n]])),c=await client.review(a,sigA,draft),sigC=signDeviceMessage(signingKey,P.externalFlatPermissionMessageV1(c)),before=admissions,postsBefore=operationPosts;assert.equal(c.expiresAt,timerPort.now+15000);await assert.rejects(client.submit(structuredClone(c),sigC,null));assert.equal(operationPosts,postsBefore);gate=makeGate();let settled=false;const operation=client.submit(c,sigC,null).then(value=>{settled=true;return{value};},error=>{settled=true;return{error};});await flush();assert.equal(admissions,before+1);assert.equal(operationPosts,postsBefore+1);timerPort.advance(16001);await flush();assert.equal(settled,false,'HOST_ADMITTED_RESULT_MUST_OUTLIVE_PERMISSION');assert.throws(()=>P.validateExternalFlatFreshV1(c,timerPort.now));gate.resolve();const result=await operation;assert.equal(result.error,undefined);assert.equal(sdkFactory.readDeviceExternalFlatRowV1(result.value),result.value);assert.equal(result.value.stage,action==='FUND_D26'?'FUNDING_UNKNOWN':'WITHDRAWAL_UNKNOWN');await assert.rejects(client.submit(c,sigC,null));assert.equal(admissions,before+1);assert.equal(operationPosts,postsBefore+1);client.close();await flush();assert.equal(timerPort.timers.size,0);}
  // Reads also get a bounded five-minute response budget; no new consent is issued.
  for(const action of ['OBSERVE_D26','OBSERVE_W39']){const client=sdkFactory.createDeviceExternalFlatNoteApiV1({descriptor:source,fetchImpl});latestConsent=consent(source,action);const a=await client.challenge(),c=await client.review(a,signDeviceMessage(signingKey,P.externalFlatPermissionMessageV1(a)),Object.fromEntries(['action','jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(n=>[n,latestConsent[n]])));gate=makeGate();const before=admissions,operation=client.submit(c,signDeviceMessage(signingKey,P.externalFlatPermissionMessageV1(c)),null).then(()=>({success:true}),error=>({error}));await flush();let completed=false;operation.finally(()=>{completed=true;});timerPort.advance(45000);await flush();assert.equal(completed,false,'a slow observation must outlive the old response timeout');timerPort.advance(255001);await flush();assert.ok((await operation).error);assert.equal(admissions,before);gate.resolve();client.close();await flush();assert.equal(timerPort.timers.size,0);}
  {const client=sdkFactory.createDeviceExternalFlatNoteApiV1({descriptor:source,fetchImpl}),a=await client.challenge();gate=makeGate();const result=client.status(a,signDeviceMessage(signingKey,P.externalFlatPermissionMessageV1(a))).then(()=>({success:true}),error=>({error}));await flush();let completed=false;result.finally(()=>{completed=true;});timerPort.advance(45000);await flush();assert.equal(completed,false,'a slow status must outlive the old response timeout');timerPort.advance(255001);await flush();assert.ok((await result).error);gate.resolve();client.close();await flush();assert.equal(timerPort.timers.size,0);}
  {const client=sdkFactory.createDeviceExternalFlatNoteApiV1({descriptor:source,fetchImpl});latestConsent=consent(source,'WITHDRAW_W39');const a=await client.challenge(),c=await client.review(a,signDeviceMessage(signingKey,P.externalFlatPermissionMessageV1(a)),Object.fromEntries(['action','jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(n=>[n,latestConsent[n]])));gate=makeGate();const before=admissions,result=client.submit(c,signDeviceMessage(signingKey,P.externalFlatPermissionMessageV1(c)),null).then(()=>({success:true}),error=>({error}));await flush();timerPort.advance(900001);await flush();assert.ok((await result).error);assert.equal(admissions,before+1);await assert.rejects(client.submit(c,signDeviceMessage(signingKey,P.externalFlatPermissionMessageV1(c)),null));assert.equal(admissions,before+1);gate.resolve();client.close();await flush();assert.equal(timerPort.timers.size,0);}
  if(graph)for(const [route,action,long]of [['output-operations','PROVE_W39',true],['output-operations','WITHDRAW_W39',true],['output-operations','OBSERVE_W39',false],['output-reviews','WITHDRAW_W39',false]]){
   gate=makeGate();let settled=false;const reply=host.request(serverIndex,'/v1/mobile/external-flat/source-graph/'+route,{consent:{consent:{action}}},source.origin).then(value=>{settled=true;return value;});
   await flush();timerPort.advance(long?16001:300001);await flush();assert.equal(settled,!long);
   gate.resolve();const result=await reply;assert.equal(result.status,long?200:403);await flush();assert.equal(timerPort.timers.size,0);
  }
  diagnostics.push(host.api.readOriginalDeviceExternalFlatHttpFailureV1(reader));
  const closed=await listener.close();assert.equal(closed.ownedSocketsRemaining,0);assert.equal(closed.originalOperationsInFlight,0);listener=null;
 }
 // This transport budget grants no unsupported FUND_D27 authority.
 assert.throws(()=>P.normalizeExternalFlatConsentV1({...consent(share,'WITHDRAW_W39'),action:'FUND_D27'}));assert.ok(diagnostics.some(d=>d.errorCode==='DEVICE_EXTERNAL_FLAT_HTTP_TIMEOUT'&&d.phase==='OPERATE'));assert.equal(timerPort.timers.size,0);
 }finally{gate?.resolve();await listener?.close();signingKey.fill(0);timerPort.timers.clear();}
});


test('fixed host transport retains request bounds and admits only ciphertext on private routes',async()=>{
 const {prepareFixedDeviceHostRequestV1}=await import('../../../../../tests/integration/wallet/native/device-external-flat-host-routing-v1.mjs');
 const origin='https://localhost:9443',state={origin,allowedOrigins:new Set([origin]),originalMeta:false,requestCounts:{},privateIntakes:{}};
 const request=(path,value)=>prepareFixedDeviceHostRequestV1(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)},state);
 for(const [path,maximum]of [['/v1/mobile/external-flat/reviews',8192],['/v1/mobile/external-flat/source-graph/reviews',65536]]){
  const overhead=Buffer.byteLength(JSON.stringify({padding:''}));assert.equal(request(path,{padding:'a'.repeat(maximum-overhead)}).action,'reviews');assert.throws(()=>request(path,{padding:'a'.repeat(maximum-overhead+1)}));
 }
 const cases=[['/v1/mobile/external-flat/private-operations',{consent:{action:'PROVE_D26',privateProof:{}},witness:{type:'flat-private-proof-inputs',ciphertext:'cipher'}}],['/v1/mobile/external-flat/source-graph/private-output-operations',{consent:{consent:{action:'PROVE_W39',privateProof:{}}},witness:{type:'flat-private-proof-inputs',ciphertext:'cipher'}}],['/v1/mobile/external-flat/source-graph/private-operations',{consent:{draft:{action:'PROVE_U'},privateProof:{}},witness:{type:'flat-private-proof-inputs',ciphertext:'cipher'}}]];
 for(const [path,value]of cases){const {action}=request(path,value);assert.equal(state.privateIntakes[action],1);assert.equal(state.requestCounts[action],1);for(const field of ['rho','secret','signature','inputs','expectedPublicInputs']){const changed=structuredClone(value);changed.witness[field]='PRIVATE';assert.throws(()=>request(path,changed));}const noCiphertext=structuredClone(value);delete noCiphertext.witness.ciphertext;assert.throws(()=>request(path,noCiphertext));assert.equal(state.privateIntakes[action],1);assert.equal(state.requestCounts[action],1);}
});
