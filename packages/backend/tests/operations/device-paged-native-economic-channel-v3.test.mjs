/** Original X25519/AES transport and protocol codecs. Settlement/ledger
 * readers below are inert DATA fixtures; no account, RPC, prover or funds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
import {nativeProviderIdentity} from '@lianum/engine/execution/native/dispatch/native-admission';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,closePrivateProofRecipientV1,sealPrivateProofJobV1,openPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import {createDevicePagedNativeEconomicChannelV3} from '../../src/operations/local/device-paged-native-economic-channel-v3.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex'),address=value=>'0x'+String(value).repeat(40);
function fixture(){
 const owner=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=owner.publicKey.export({format:'jwk'}),point={x:Buffer.from(jwk.x,'base64url').toString('hex'),y:Buffer.from(jwk.y,'base64url').toString('hex')},publicKey='04'+point.x+point.y;
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9443',pairingId:'economic-channel-'+hash(publicKey).slice(0,16),devicePublicKey:publicKey,deadlineMs:Date.now()+9*3600000,chainId:'31337',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,hash(key)])),...Object.fromEntries(['pool','state','native','math'].map((key,index)=>[key,address(index+1)]))});
 const graphId='economic-graph-original',rootId=hash('root'),authorizationRoot=hash('authorization'),revision=1,providerIdentity=hash('provider'),blockHash='0x'+hash('head'),blockNumber='2';let sequence=0;
 const outputs=[{id:'ethereum',nullifier:hash('ethereum-nullifier')}],beneficiary={chainId:descriptor.chainId,genesis:descriptor.genesis,assetIdentity:descriptor.assetIdentity,address:'0x'+Buffer.from(publicKeccak256(Buffer.from(point.x+point.y,'hex'))).subarray(12).toString('hex'),publicKey};
 function readView(){const issuedAt=Date.now();return{
  view:{type:'economic-settlement',profile:'DEVICE_PAGED_ECONOMIC_VIEW_V3',descriptor,graphId,authorizationRoot,
   rows:[{profile:'ORIGINAL_PAGED_NATIVE_ECONOMIC_SETTLEMENT_V3',classification:'LOCAL_SYNTHETIC_COMMON_OPERATOR_3_OF_4',descriptor,providerIdentity,checkpoint:{profile:'ORIGINAL_PAGED_NATIVE_PROVIDER_CHECKPOINT_V3',providerIdentity,configurationSHA256:hash('configuration'),revision:1,dataSHA256:hash('data')},id:'ethereum',authorizationRoot,actionCommitment:hash('action'),signerIdentity:nativeProviderIdentity(point),payoutCommitment:hash('payout'),payoutAmount:'100',beneficiary,native:{family:'EVM',chainDomain:hash('chain'),genesis:hash('native-genesis'),asset:hash('native-asset'),amount:'1000000000000000',source:address(5),destination:address(6),nativeId:'0x'+hash('native-id'),status:'UNKNOWN',finalityKind:'3',confirmations:null,fee:{status:'UNKNOWN',asset:hash('native-asset'),unit:'wei',amount:null},conservation:{status:'UNKNOWN',balanced:null,crossAssetValueConservation:false}}}],
   outputs:[{role:'payout',id:'ethereum',amount:'100',commitment:hash('payout'),nullifier:outputs[0].nullifier,withdrawn:false}],
   ledger:{blockHash,blockNumber,heldAmount:'100',backedAmount:'100',beneficiaryBalance:'0',spentNullifiers:[{nullifier:outputs[0].nullifier,spent:false}]}},
  status:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,graphId,rootId,revision,authorizationRoot,reserveNullifier:hash('reserve'),progressCommitment:hash('progress'),readyCommitment:hash('ready'),sourceCommitment:hash('source'),sourceNullifier:hash('source-nullifier'),pages:'1',nodes:'1',budget:'100',settleBefore:'1900000000',phase:'FULFILLED',job:null,pending:false,issuedAt,expiresAt:issuedAt+15000,blockHash,blockNumber}
 };}
 function packet(channel,command={outputs:structuredClone(outputs)},changes={},expiresAt=Date.now()+15000){
  const jobId='economic-query-'+String(++sequence).padStart(8,'0'),recipient=channel.prepare(jobId),client=createPrivateProofRecipientV1({relation:recipient.relation,role:recipient.role,jobId}),reply=readPrivateProofRecipientV1(client),consent=C.normalizeDevicePagedGraphConsentV3({version:3,profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,action:'READ_ECONOMIC_SETTLEMENT',graphId,jobId,rootId,revision,commandSHA256:hash(JSON.stringify(command)),replyPublicKey:reply.recipientPublicKey,challengeId:'economic-challenge-'+String(sequence).padStart(8,'0'),nonce:hash('nonce-'+sequence),authorizationRoot,reserveNullifier:hash('reserve'),progressCommitment:hash('progress'),recipient,expiresAt});
  if(expiresAt>Date.now())C.validateDevicePagedGraphConsentFreshV3(consent);
  const signature=sign('sha256',C.devicePagedGraphPermissionMessageV3(consent),{key:owner.privateKey,dsaEncoding:'ieee-p1363'}).toString('hex'),authorization={kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:hash(C.devicePagedGraphPermissionMessageV3(consent)),witnessSHA256:consent.commandSHA256,...changes},ciphertext=sealPrivateProofJobV1(recipient,{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,consent,signature,command},expectedPublicInputs:null,authorization});
  return{consent,signature,ciphertext,client};
 }
 return{descriptor,outputs,readView,packet};
}

test('economic channel returns an authenticated same-head view and consumes the recipient once',async()=>{
 const f=fixture();let reads=0;
 const channel=createDevicePagedNativeEconomicChannelV3(f.descriptor,async(outputs,consent)=>{reads++;assert.deepEqual(outputs,f.outputs);assert.equal(consent.action,'READ_ECONOMIC_SETTLEMENT');return f.readView();}),packet=f.packet(channel);
 let opened;
 try{
  const reply=await channel.submit(packet.consent,packet.signature,packet.ciphertext);assert.deepEqual(Object.keys(reply).sort(),['ciphertext','status']);
  assert.equal(JSON.stringify(reply.ciphertext).includes(f.outputs[0].nullifier),false,'output data is encrypted on the reply wire');
  opened=openPrivateProofJobV1(packet.client,reply.ciphertext);assert.equal(opened.inputs.jobId,packet.consent.jobId);assert.deepEqual(opened.authorization,packet.ciphertext.authorization);
  assert.equal(opened.inputs.reply.outputs[0].nullifier,f.outputs[0].nullifier);assert.equal(opened.inputs.reply.ledger.blockHash,reply.status.blockHash);assert.equal(reads,1);
  await assert.rejects(channel.submit(packet.consent,packet.signature,packet.ciphertext),/PAGED_NATIVE_ECONOMIC_ORIGINAL_RECIPIENT/);assert.equal(reads,1);
 }finally{channel.close();closePrivateProofRecipientV1(packet.client);wipePrivateProofInputsV1(opened);}
});

test('wrong authorization, signature, ciphertext and duplicate nullifiers never call the reader',async()=>{
 const f=fixture();let reads=0;const channel=createDevicePagedNativeEconomicChannelV3(f.descriptor,async()=>{reads++;return f.readView();});
 try{
  for(const changes of [{kind:'SCOPED_JOB_V1'},{jobId:'another-economic-job'},{consentSHA256:hash('wrong-frame')},{witnessSHA256:hash('wrong-command')}]){
   const p=f.packet(channel,undefined,changes);try{await assert.rejects(channel.submit(p.consent,p.signature,p.ciphertext));await assert.rejects(channel.submit(p.consent,p.signature,p.ciphertext),/ORIGINAL_RECIPIENT/);}finally{closePrivateProofRecipientV1(p.client);}
  }
  const wrongSignature=f.packet(channel);try{await assert.rejects(channel.submit(wrongSignature.consent,'b'.repeat(128),wrongSignature.ciphertext));}finally{closePrivateProofRecipientV1(wrongSignature.client);}
  const tampered=f.packet(channel);try{await assert.rejects(channel.submit(tampered.consent,tampered.signature,{...tampered.ciphertext,tag:'AAAAAAAAAAAAAAAAAAAAAA=='}),/PRIVATE_PROOF_INVALID_ENCRYPTED_JOB/);}finally{closePrivateProofRecipientV1(tampered.client);}
  for(const command of [{outputs:[...f.outputs,{id:'bitcoin',nullifier:f.outputs[0].nullifier}]},{outputs:[...f.outputs,...f.outputs]},{outputs:[]},{outputs:[...f.outputs],opening:{secret:'forbidden'}}]){
   const p=f.packet(channel,command);try{await assert.rejects(channel.submit(p.consent,p.signature,p.ciphertext));}finally{closePrivateProofRecipientV1(p.client);}
  }
  assert.equal(reads,0);
 }finally{channel.close();}
});

test('foreign output, mismatched ledger head and close during a read cannot seal a reply',async()=>{
 const f=fixture();
 for(const alter of [data=>{data.view.ledger.blockHash='0x'+hash('foreign-head');},data=>{data.view.outputs[0].nullifier=hash('foreign-nullifier');data.view.ledger.spentNullifiers[0].nullifier=hash('foreign-nullifier');},data=>{data.status.rootId=hash('foreign-root');}]){
  const channel=createDevicePagedNativeEconomicChannelV3(f.descriptor,async()=>{const data=f.readView();alter(data);return data;}),p=f.packet(channel);
  try{await assert.rejects(channel.submit(p.consent,p.signature,p.ciphertext));}finally{channel.close();closePrivateProofRecipientV1(p.client);}
 }
 let release,entered;const started=new Promise(resolve=>{entered=resolve;}),channel=createDevicePagedNativeEconomicChannelV3(f.descriptor,async()=>{entered();await new Promise(resolve=>{release=resolve;});return f.readView();}),p=f.packet(channel),work=channel.submit(p.consent,p.signature,p.ciphertext);
 try{await started;assert.throws(()=>channel.prepare('another-economic-query'),/PAGED_NATIVE_ECONOMIC_BUSY/);channel.close();release();await assert.rejects(work,/PAGED_NATIVE_ECONOMIC_CLOSED/);assert.throws(()=>channel.prepare('closed-economic-query'),/PAGED_NATIVE_ECONOMIC_CLOSED/);}finally{channel.close();closePrivateProofRecipientV1(p.client);}
});

test('expiry before intake burns the old recipient and permits only a new fresh preparation',async()=>{
 const f=fixture();let reads=0;const channel=createDevicePagedNativeEconomicChannelV3(f.descriptor,async()=>{reads++;return f.readView();}),expired=f.packet(channel,undefined,{},Date.now()-1);
 let fresh,opened;
 try{
  await assert.rejects(channel.submit(expired.consent,expired.signature,expired.ciphertext),error=>error.code==='MOBILE_PAGED_GRAPH_CONSENT_EXPIRED');assert.equal(reads,0);
  await assert.rejects(channel.submit(expired.consent,expired.signature,expired.ciphertext),/PAGED_NATIVE_ECONOMIC_ORIGINAL_RECIPIENT/);
  fresh=f.packet(channel);const reply=await channel.submit(fresh.consent,fresh.signature,fresh.ciphertext);opened=openPrivateProofJobV1(fresh.client,reply.ciphertext);assert.equal(opened.inputs.jobId,fresh.consent.jobId);assert.equal(reads,1);
 }finally{channel.close();closePrivateProofRecipientV1(expired.client);if(fresh)closePrivateProofRecipientV1(fresh.client);wipePrivateProofInputsV1(opened);}
});
