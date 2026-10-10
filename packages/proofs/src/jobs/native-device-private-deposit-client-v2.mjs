/** One original owner recipient prepared BEFORE consent. Public results stay
 * tied to the SAME live client; a copied proof/derivation installs no authority. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {privateProofAuthorizationBindingV1} from './private-proof-transit-v1.mjs';
const results=new WeakMap(),owned=new WeakMap(),h=b=>createHash('sha256').update(b).digest('hex');
const exact=(v,keys)=>{assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype,'PW_PRIVATE_WALLET_DATA');assert.deepEqual(Reflect.ownKeys(v).sort(),[...keys].sort(),'PW_PRIVATE_WALLET_FIELDS');for(const k of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'),'PW_PRIVATE_WALLET_FIELDS');};
const frozen=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;};
const copy=v=>JSON.parse(JSON.stringify(v));
const originalErrorStack=Object.getOwnPropertyDescriptor(Error(),'stack');
const failurePhases=new Set(['INTAKE','DERIVE','CONSTRUCT_FACADE','PROVE','RESULT']);
const failureCode=value=>typeof value==='string'&&value.length<=128&&/^(?:ERR_ASSERTION|ENOENT|ENOTDIR|EACCES|EPERM|EEXIST|(?:PAEG_|PW_|PRIVATE_PROOF_|PC23_|PC15_|MOBILE_|NATIVE_)[A-Z0-9_]+)$/.test(value);
const ownFrame=/^(?:private-native-device-deposit-input-v2|native-device-private-deposit-recipient-v2|proof-process|proof-worker|native-proof-pins|pin-key|resources|private-proof-transit-v1|device-native-private-deposit-v2)\.mjs:[1-9][0-9]{0,6}:[1-9][0-9]{0,6}$/;
/** Public failure metadata only; messages, payloads, paths and assertion values
 * are never returned. This formatter grants no recipient or proof authority. */
export function originalNativePrivateDepositFailureV2(error,phase){
 assert.equal(arguments.length,2,'PW_PRIVATE_WALLET_ARITY');assert.ok(failurePhases.has(phase),'PW_PRIVATE_WALLET_FAILURE_PHASE');
 const descriptors=error&&typeof error==='object'&&!types.isProxy(error)?Object.getOwnPropertyDescriptors(error):{};
 const data=name=>descriptors[name]&&Object.hasOwn(descriptors[name],'value')?descriptors[name].value:null;
 const message=data('message'),code=failureCode(message)?message:failureCode(data('code'))?data('code'):'PW_PRIVATE_WALLET_PROOF_INCOMPLETE';
 let stack=data('stack');const stackDescriptor=descriptors.stack;if(stack===null&&types.isNativeError(error)&&stackDescriptor?.get===originalErrorStack?.get&&stackDescriptor?.set===originalErrorStack?.set)stack=Reflect.apply(originalErrorStack.get,error,[]);let ownedFrame=null;
 if(typeof stack==='string'&&stack.length<=65536){for(const line of stack.split('\n').slice(1,65)){
  const frame=/^\s+at (?:[^\n]*[/(])?([a-z][a-z0-9-]*\.mjs:[1-9][0-9]{0,6}:[1-9][0-9]{0,6})\)?$/.exec(line)?.[1];
  if(frame&&ownFrame.test(frame)){ownedFrame=frame;break;}
 }}
 return Object.freeze({type:'original-native-private-deposit-failure-v2',phase,code,ownedFrame});
}
export function normalizeOriginalNativePrivateDepositFailureV2(message){
 assert.equal(arguments.length,1,'PW_PRIVATE_WALLET_ARITY');exact(message,['type','phase','code','ownedFrame']);
 assert.equal(message.type,'original-native-private-deposit-failure-v2','PW_PRIVATE_WALLET_FAILURE_TYPE');
 assert.ok(failurePhases.has(message.phase)&&failureCode(message.code)&&(message.ownedFrame===null||typeof message.ownedFrame==='string'&&ownFrame.test(message.ownedFrame)),'PW_PRIVATE_WALLET_FAILURE_DATA');
 return Object.freeze({type:message.type,phase:message.phase,code:message.code,ownedFrame:message.ownedFrame});
}

export function readOriginalNativePrivateDepositDerivationV2(client,result){assert.equal(arguments.length,2,'PW_PRIVATE_WALLET_ARITY');const s=owned.get(client),r=results.get(result);assert.ok(s&&!s.closed&&r?.client===client,'PW_PRIVATE_WALLET_ORIGINAL_RESULT');return r.derivation;}
export function createOriginalNativePrivateDepositProofClientV2(){
 assert.equal(arguments.length,0,'PW_PRIVATE_WALLET_ARITY');const mode='deposit_balance';
 const s={closed:false,prepared:false,sent:false,child:null,run:null,ready:null,binding:null,expected:null,stop:null,cancelWait:null};let readyResolve,readyReject;
 const live=()=>assert.equal(s.closed,false,'PW_PRIVATE_WALLET_CLOSED');
 const client=Object.freeze({
  prepare(expected){assert.equal(arguments.length,1,'PW_PRIVATE_WALLET_ARITY');live();assert.equal(s.prepared,false,'PW_PRIVATE_WALLET_ONE_PREPARATION');
   assert.ok(Array.isArray(expected)&&expected.length===(mode==='deposit_balance'?26:39)&&expected.every(w=>typeof w==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(w)&&BigInt(w)<(1n<<64n)),'PW_PRIVATE_WALLET_PUBLIC');
   s.prepared=true;s.expected=frozen([...expected]);const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b;});
   s.run=(async()=>{let timer,waitTimer,killTimer,result=null,failure=null,privateDiagnostic=null,closed=false,bytes=0;
    const child=s.child=fork(fileURLToPath(new URL('./native-device-private-deposit-recipient-v2.mjs',import.meta.url)),[],{execPath:process.execPath,execArgv:[],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},serialization:'json',stdio:['ignore','pipe','pipe','ipc']});
    const completion=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
    s.stop=code=>{failure??=code;if(!closed){child.kill('SIGTERM');killTimer??=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},5000);}};
    child.once('error',()=>s.stop('PW_PRIVATE_WALLET_SPAWN'));child.on('message',message=>{try{
     assert.ok(Buffer.byteLength(JSON.stringify(message))<=1048576,'PW_PRIVATE_WALLET_IPC_BOUND');
     if(message?.type==='flat-private-proof-input-ready'){
      exact(message,['type','profile','relation','role','jobId','recipientPublicKey']);assert.equal(s.ready,null,'PW_PRIVATE_WALLET_ONE_RECIPIENT');
      assert.equal(message.profile,'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1');assert.equal(message.relation,mode);assert.equal(message.role,'owner');assert.match(message.jobId,/^[a-z0-9-]{8,100}$/);assert.match(message.recipientPublicKey,/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/);
      s.ready=frozen(copy(message));s.cancelWait=()=>clearTimeout(waitTimer);waitTimer=setTimeout(()=>s.stop('PW_PRIVATE_WALLET_CONSENT_EXPIRED'),15000);readyResolve(s.ready);return;
     }
     if(message?.type==='original-native-private-deposit-failure-v2'){assert.equal(s.sent,true,'PW_PRIVATE_WALLET_FAILURE_BEFORE_HANDOFF');assert.equal(privateDiagnostic,null,'PW_PRIVATE_WALLET_ONE_FAILURE');assert.equal(result,null,'PW_PRIVATE_WALLET_ONE_RESULT');privateDiagnostic=normalizeOriginalNativePrivateDepositFailureV2(message);s.stop(privateDiagnostic.code);return;}
     exact(message,['type','mode','recipientJobId','derivation','result']);assert.equal(message.type,'original-native-private-deposit-result-v2');assert.equal(message.mode,mode);assert.equal(s.sent,true);assert.equal(result,null,'PW_PRIVATE_WALLET_ONE_RESULT');assert.equal(message.recipientJobId,s.binding.jobId);
     const d=message.derivation;exact(d,['profile','mode','jobId','commitment','nullifier','consentSHA256','witnessSHA256']);assert.equal(d.profile,'ORIGINAL_NATIVE_DEVICE_D26_PRIVATE_DERIVATION_V2');assert.equal(d.mode,mode);assert.equal(d.jobId,s.binding.jobId);for(const k of ['commitment','nullifier','consentSHA256','witnessSHA256'])assert.match(d[k],/^[0-9a-f]{64}$/);assert.equal(d.consentSHA256,s.binding.consentSHA256);assert.equal(d.witnessSHA256,s.binding.witnessSHA256);
     assert.equal(message.result.metrics?.acceptedResult,true,'PW_PRIVATE_WALLET_RECEIPT');assert.match(message.result.proof,/^(?:[0-9a-f]{2})+$/);assert.deepEqual(message.result.publicInputs,s.expected,'PW_PRIVATE_WALLET_PUBLIC_BINDING');result=frozen(copy(message));
    }catch{s.stop('PW_PRIVATE_WALLET_INVALID_RESULT');}});
    for(const stream of [child.stdout,child.stderr])stream.on('data',part=>{bytes+=part.length;part.fill(0);if(bytes>1048576)s.stop('PW_PRIVATE_WALLET_OUTPUT_BOUND');});
    timer=setTimeout(()=>s.stop('PW_PRIVATE_WALLET_TOTAL_TIMEOUT'),900000);
    try{const exit=await completion;if(failure!==null){const error=Error(failure);error.code=failure;if(privateDiagnostic)error.nativePrivateProofDiagnostic=privateDiagnostic;throw error;}assert.equal(exit.code,0,'PW_PRIVATE_WALLET_EXIT');assert.equal(exit.signal,null,'PW_PRIVATE_WALLET_SIGNAL');assert.ok(result&&s.sent,'PW_PRIVATE_WALLET_INCOMPLETE');const output=result.result;results.set(output,{client,derivation:result.derivation});return output;}
    finally{clearTimeout(timer);clearTimeout(waitTimer);clearTimeout(killTimer);for(const stream of child.stdio??[])stream?.destroy();s.child=null;s.stop=null;}
   })();s.run.catch(()=>readyReject(Error('PW_PRIVATE_WALLET_PREPARATION_FAILED')));return ready;
  },
  proveEncrypted(packet,binding){assert.equal(arguments.length,2,'PW_PRIVATE_WALLET_ARITY');live();assert.ok(s.ready&&s.run&&!s.sent,'PW_PRIVATE_WALLET_ONE_HANDOFF');
   exact(packet,['type','profile','relation','role','jobId','recipientPublicKey','senderPublicKey','authorization','publicInputsSHA256','salt','iv','tag','ciphertext']);
   assert.equal(packet.type,'flat-private-proof-inputs');for(const k of ['profile','relation','role','jobId','recipientPublicKey'])assert.equal(packet[k],s.ready[k]);
   s.binding=privateProofAuthorizationBindingV1(binding);assert.deepEqual(packet.authorization,s.binding);assert.equal(packet.publicInputsSHA256,h(Buffer.from(JSON.stringify(s.expected))));assert.ok(typeof packet.ciphertext==='string'&&packet.ciphertext.length<=16384,'PW_PRIVATE_WALLET_BOUND');
   s.sent=true;s.cancelWait();s.child.send(copy(packet),error=>{if(error)s.stop?.('PW_PRIVATE_WALLET_IPC_SEND');});return s.run;
  },
  abort(){assert.equal(arguments.length,0);return client.close();},
  close(){assert.equal(arguments.length,0,'PW_PRIVATE_WALLET_ARITY');s.closed=true;s.stop?.('PW_PRIVATE_WALLET_CLOSED');return(async()=>{if(s.run)await s.run.catch(()=>{});return{closed:true,inFlight:0};})();},
 });owned.set(client,s);return client;
}
