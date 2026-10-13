/** Actual transit/SDK codecs; ledger and Expo ports are HOST fixtures.
 * No deployed account, blockchain, accepted proof or funds are created. */
import test from 'node:test';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,verify,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
import {normalizeDevicePagedPortfolioRequestV3,normalizeDevicePagedWalletPortfolioV3} from '@lianum/mobile-protocol/device/paged-wallet-portfolio-v3';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,closePrivateProofRecipientV1,sealPrivateProofJobV1,openPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import {createDevicePagedWalletPortfolioChannelV3} from '../../src/operations/local/device-paged-wallet-portfolio-channel-v3.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const owner=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=owner.publicKey.export({format:'jwk'}),devicePublicKey='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9445',pairingId:'portfolio-'+hash(devicePublicKey).slice(0,16),devicePublicKey,deadlineMs:Date.now()+3600000,chainId:'31337',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,hash(key)])),...Object.fromEntries(['pool','state','native','math'].map((key,index)=>[key,'0x'+String(index+1).repeat(40)]))});
 const graphId='original-portfolio-graph',rootId=hash('root'),authorizationRoot=hash('authorization');let sequence=0;
 const outputs=['source','change','recovery','payout'].map((role,index)=>({role,id:role==='payout'?'payment':null,commitment:hash('cm'+role),nullifier:hash('nf'+role),amount:['600','200','400','400'][index]})),request={outputs};
 function data(){const issuedAt=Date.now(),blockHash='0x'+hash('head'),blockNumber='2';return{
  status:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,graphId,rootId,revision:1,authorizationRoot,reserveNullifier:hash('reserve'),progressCommitment:hash('progress'),readyCommitment:hash('ready'),sourceCommitment:outputs[0].commitment,sourceNullifier:outputs[0].nullifier,pages:'1',nodes:'1',budget:'400',settleBefore:'999999',phase:'FULFILLED',job:null,pending:false,issuedAt,expiresAt:issuedAt+15000,blockHash,blockNumber},
  view:{type:'wallet-portfolio',profile:'DEVICE_PAGED_WALLET_PORTFOLIO_V3',descriptor,graphId,rootId,revision:1,authorizationRoot,phase:'FULFILLED',pending:false,ledger:{blockHash,blockNumber,heldAmount:'600',backedAmount:'600',reservedAmount:'0'},outputs:outputs.map((row,index)=>({...row,issued:index!==2,state:['SPENT','LIVE','LOCKED','LIVE'][index],available:['0','200','0','400'][index]}))}
 };}
 function consent(draft,recipient){return C.normalizeDevicePagedGraphConsentV3({version:3,profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,...draft,challengeId:'portfolio-challenge-'+(++sequence),nonce:hash('nonce'+sequence),authorizationRoot,reserveNullifier:hash('reserve'),progressCommitment:hash('progress'),recipient,expiresAt:Date.now()+15000});}
 function signature(consent){let value=sign('sha256',C.devicePagedGraphPermissionMessageV3(consent),{key:owner.privateKey,dsaEncoding:'ieee-p1363'}),order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+value.subarray(32).toString('hex'));if(s>order/2n)value=Buffer.concat([value.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);return value.toString('hex');}
 function packet(channel,command=request){const jobId='portfolio-job-'+(++sequence),client=createPrivateProofRecipientV1({relation:P.DEVICE_PAGED_MODES_V3.reserve.relation,role:P.DEVICE_PAGED_MODES_V3.reserve.role,jobId}),c=consent({action:'READ_PORTFOLIO',graphId,jobId,rootId,revision:1,commandSHA256:hash(JSON.stringify(command)),replyPublicKey:readPrivateProofRecipientV1(client).recipientPublicKey},channel.prepare(jobId)),sig=signature(c),authorization={kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:hash(C.devicePagedGraphPermissionMessageV3(c)),witnessSHA256:c.commandSHA256};return{client,c,sig,ciphertext:sealPrivateProofJobV1(c.recipient,{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,consent:c,signature:sig,command},expectedPublicInputs:null,authorization})};}
 return{descriptor,request,data,consent,signature,packet,owner,graphId,rootId};
}

test('wallet observations count issued notes once and reject duplicated or invented availability',()=>{
 const f=fixture(),value=f.data().view;assert.equal(normalizeDevicePagedWalletPortfolioV3(value,f.descriptor).outputs[2].available,'0');
 assert.equal(normalizeDevicePagedPortfolioRequestV3(f.request).outputs.length,4);
 for(const alter of [v=>{v.outputs[1].issued=false;},v=>{v.outputs[2].available='400';},v=>{v.outputs[3].nullifier=v.outputs[1].nullifier;},v=>{v.ledger.backedAmount='599';},v=>{v.ledger.reservedAmount='400';},v=>{v.pending=true;v.phase='UNKNOWN';v.ledger.reservedAmount=null;}]){const next=structuredClone(value);alter(next);assert.throws(()=>normalizeDevicePagedWalletPortfolioV3(next,f.descriptor));}
 assert.throws(()=>normalizeDevicePagedPortfolioRequestV3({outputs:[...f.request.outputs,f.request.outputs[1]]}));
 assert.equal(C.devicePagedGraphEffectsV3('READ_PORTFOLIO'),false);assert.equal(C.devicePagedGraphProvesV3('READ_PORTFOLIO'),false);
});

test('same-head encrypted reads are single-use; foreign notes and ledger substitutions are rejected',async()=>{
 const f=fixture();let reads=0,opened;const channel=createDevicePagedWalletPortfolioChannelV3(f.descriptor,async outputs=>{reads++;assert.deepEqual(outputs,f.request.outputs);return f.data();}),p=f.packet(channel);
 try{const reply=await channel.submit(p.c,p.sig,p.ciphertext);assert.ok(!JSON.stringify(reply.ciphertext).includes(f.request.outputs[0].nullifier));opened=openPrivateProofJobV1(p.client,reply.ciphertext);assert.equal(opened.inputs.reply.ledger.blockHash,reply.status.blockHash);assert.equal(opened.inputs.reply.outputs[1].available,'200');await assert.rejects(channel.submit(p.c,p.sig,p.ciphertext),/ORIGINAL_RECIPIENT/);assert.equal(reads,1);}finally{channel.close();closePrivateProofRecipientV1(p.client);wipePrivateProofInputsV1(opened);}
 for(const alter of [v=>{v.view.outputs[1].nullifier=hash('foreign');},v=>{v.view.ledger.blockHash='0x'+hash('different-head');},v=>{v.status.rootId=hash('different-root');}]){const other=createDevicePagedWalletPortfolioChannelV3(f.descriptor,async()=>{const value=f.data();alter(value);return value;}),p=f.packet(other);try{await assert.rejects(other.submit(p.c,p.sig,p.ciphertext));}finally{other.close();closePrivateProofRecipientV1(p.client);}}
});

test('the SDK identifies only its own missing operations replies, never copied or challenge errors',async t=>{
 const keys=new WeakMap(),keyBytes=[];
 t.mock.module(createRequire(new URL('../../../../apps/mobile/package.json',import.meta.url)).resolve('expo-crypto'),{exports:{getRandomBytesAsync:async n=>Uint8Array.from(randomBytes(n)),AESEncryptionKey:{async import(value){const key={},bytes=Buffer.from(value);keys.set(key,bytes);keyBytes.push(bytes);return key;}},AESSealedData:{fromCombined:value=>({bytes:Buffer.from(value)})},async aesEncryptAsync(clear,key,options){const iv=Buffer.from(options.nonce.bytes),cipher=createCipheriv('aes-256-gcm',keys.get(key),iv);cipher.setAAD(Buffer.from(options.additionalData));const bytes=Buffer.concat([iv,cipher.update(clear),cipher.final(),cipher.getAuthTag()]);return{combined:async()=>bytes.toString('base64')};},async aesDecryptAsync(sealed,key,options){const bytes=sealed.bytes,cipher=createDecipheriv('aes-256-gcm',keys.get(key),bytes.subarray(0,12));cipher.setAAD(Buffer.from(options.additionalData));cipher.setAuthTag(bytes.subarray(-16));return Uint8Array.from(Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]));}}});
 const {createDevicePagedGraphApiV3}=await import('../../../../apps/mobile/src/api/device-paged-graph-api-v3.mjs'),f=fixture();let drop=true,reads=0,challengeFailure=false;
 const channel=createDevicePagedWalletPortfolioChannelV3(f.descriptor,async()=>{reads++;return f.data();});
 const api=createDevicePagedGraphApiV3({descriptor:f.descriptor,fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.endsWith('/challenges')){if(challengeFailure)throw Error('HOST_MISSING_CHALLENGE');return{status:200,text:async()=>JSON.stringify(f.consent(body,channel.prepare(body.jobId))) };}
  assert.ok(verify('sha256',C.devicePagedGraphPermissionMessageV3(body.consent),{key:f.owner.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(body.signature,'hex')));
  const result=await channel.submit(body.consent,body.signature,body.ciphertext);
  return{status:200,text:async()=>{if(drop){drop=false;throw Error('HOST_DROPPED_RESPONSE_AFTER_READER');}return JSON.stringify({profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,status:result.status,ciphertext:result.ciphertext});}};
 }}),other=createDevicePagedGraphApiV3({descriptor:f.descriptor,fetchImpl:async()=>{throw Error('HOST_NO_OTHER_API');}});let lost;
 try{
  const c=await api.challenge('READ_PORTFOLIO',f.graphId,'portfolio-sdk-first',f.rootId,1,f.request);
  await assert.rejects(api.submit(c,f.signature(c),f.request),error=>{lost=error;return api.isUnconfirmedReply(error);});assert.equal(reads,1);
  assert.equal(api.isUnconfirmedReply(Error(lost.message)),false);assert.equal(other.isUnconfirmedReply(lost),false);
  const next=await api.challenge('READ_PORTFOLIO',f.graphId,'portfolio-sdk-observe',f.rootId,1,f.request),reply=await api.submit(next,f.signature(next),f.request);assert.equal(reply.private.outputs[1].available,'200');P.pagedOwnerWipeV3(reply.private);assert.equal(reads,2);
  challengeFailure=true;await assert.rejects(api.challenge('READ_PORTFOLIO',f.graphId,'portfolio-sdk-challenge',f.rootId,1,f.request),error=>!api.isUnconfirmedReply(error));
  await api.close();assert.equal(api.isUnconfirmedReply(lost),false);
 }finally{await Promise.all([api.close(),other.close()]);channel.close();for(const bytes of keyBytes)bytes.fill(0);}
});
