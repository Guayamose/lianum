/** Actual permission issuer/consumer and secp256k1 signature. Journal and chain
 * ports are inert HOST fixtures; no listener, prover, funds or runtime startup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Paged issuer uses wall epochs while original permissions and RPC work retain elapsed limits',async t=>{
 let wall=1791752327705,elapsed=0,healthElapsed=0,journalWrites=0;
 t.mock.method(Date,'now',()=>wall);t.mock.method(performance,'now',()=>elapsed);
 const P=await import('../../../../mobile-protocol/src/device-paged-owner-v3.mjs');
 const zeroWord='0x'+'0'.repeat(64),hash=n=>String(n).repeat(64),address=n=>'0x'+String(n).repeat(40);
 const system={profile:P.DEVICE_PAGED_GRAPH_V3,manifestSHA256:hash(1),consumerSHA256:hash(2),pool:address(1),state:address(2),native:address(3),scope:hash(3),policy:hash(4),assetIdentity:hash(5),domain:hash(6),hubDomain:hash(7),registryCommitment:hash(8),deployments:[{name:'PagedSparsePoseidon2V3',address:address(4),codeHash:'0x'+hash(9)}]};
 const deployment={...Object.fromEntries(['pool','state','native'].map(key=>[key,{expectedCode:'0x6000',codeHash:'0x'+hash(9)}])),call:async(_,method)=>{assert.ok(['leafCount()','backedAmount()'].includes(method));return zeroWord;}};
 const deploymentURL=new URL('../../../src/operations/local/funded-graph-paged-deployment-v3.mjs',import.meta.url);
 t.mock.module(deploymentURL.href,{exports:{assertOriginalFundedPagedGraphWalletV3:(_,value)=>assert.strictEqual(value,system),readOriginalFundedPagedGraphDeploymentV3:()=>deployment,pagedGraphProofDataV3:()=>{throw Error('HOST_PROOF_FORBIDDEN');},pagedGraphStaticDataV3:()=>{throw Error('HOST_EFFECT_FORBIDDEN');}}});
 t.mock.module('@lianum/engine/crypto/vault',{exports:{Vault:class{
  async create(value){journalWrites++;this.value=structuredClone(value);return{revision:0,data:structuredClone(this.value)};}
  async read(){return{revision:0,data:structuredClone(this.value)};}
  async update(){throw Error('HOST_JOURNAL_MUTATION_FORBIDDEN');}
 }}});
 const head={number:'0x1',hash:'0x'+hash(9),timestamp:'0x4b0'};
 const runtime={metadata:{chainId:'31337',evmGenesis:hash(1)},receipts:[],block:async()=>head,assertCanonical:async actual=>assert.strictEqual(actual,head),code:async()=> '0x6000',health:async()=>{elapsed+=healthElapsed;healthElapsed=0;}};
 const directory=await mkdtemp(join(tmpdir(),'paged-issuer-clock-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=device.publicKey.export({format:'jwk'});
 const devicePublicKey='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
 const {createOriginalDevicePagedNoteAuthorityV3}=await import('../../../src/accounts/authority/device-paged-note-authority-v3.mjs');
 const authority=await createOriginalDevicePagedNoteAuthorityV3(runtime,system,{origin:'https://127.0.0.1:9443',devicePublicKey,journal:{path:join(directory,'jobs.aead'),password:'inert-host-journal-password-32bytes'}});t.after(()=>authority.close());
 const descriptor=authority.descriptor();elapsed=60000;
 assert.equal(P.devicePagedNowV3()-P.devicePagedWallNowV3(),60000,'reproduces the process clock ahead of the peer epoch');
 function draft(id){return{action:'READ_STATE',jobId:'host-clock-read-'+id,rootId:hash(1),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};}
 function permission(consent){let signature=sign('sha256',P.devicePagedPermissionMessageV3(consent),{key:device.privateKey,dsaEncoding:'ieee-p1363'});const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+signature.subarray(32).toString('hex'));if(s>order/2n)signature=Buffer.concat([signature.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);return signature.toString('hex');}

 const first=await authority.challenge(draft('first'));
 assert.equal(first.expiresAt-15000,wall,'wire permission begins at actual wall epoch, without ratchet drift');
 await P.awaitDevicePagedIssuedTimeV3(first.expiresAt-15000);
 await authority.challenge(draft('second'));
 elapsed+=14500;
 const status=await authority.submit(JSON.parse(JSON.stringify(first)),permission(first),null);
 assert.equal(status.issuedAt,wall);assert.equal(status.expiresAt,status.issuedAt+15000);
 assert.equal(status.note,null);assert.equal(status.jobs.length,0);
 assert.equal(P.devicePagedNowV3()-wall,74500,'frame registration does not steal elapsed time from local descriptor/lease clock');
 assert.throws(()=>P.validateDevicePagedStatusFreshV3(status,status.expiresAt),/MOBILE_PAGED_OWNER_BINDING/);
 await assert.rejects(()=>authority.submit(first,permission(first),null),/PAGED_DEVICE_ORIGINAL_PERMISSION/);

 const delayed=await authority.challenge(draft('delayed'));
 healthElapsed=15000;
 await assert.rejects(()=>authority.submit(delayed,permission(delayed),null),error=>error.code==='ERR_ASSERTION','status RPC cannot exceed 15 elapsed seconds even while wall time stands still');

 const expired=await authority.challenge(draft('expired'));
 elapsed+=15001;wall++;
 await assert.rejects(()=>authority.submit(JSON.parse(JSON.stringify(expired)),permission(expired),null),/MOBILE_PAGED_CLOCK_EXPIRED/,'serialization and still-fresh wall time do not reset the issuer registered lifetime');
 assert.equal(journalWrites,1,'READ challenges and rejected submissions never mutate the journal');
});
