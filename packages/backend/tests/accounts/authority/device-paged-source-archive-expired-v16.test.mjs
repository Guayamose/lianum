/** Actual Authority, Source journal, signed private Graph/OWNER and encrypted
 * archive. IPC scheduling, provider rows and canonical chain facts are HOST
 * boundaries. No SNARK, grant renewal, signer or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {freshKey} from '@lianum/engine/notes/private-note-encoding';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as Owner from '../../../src/operations/local/device-paged-private-graph-v3.mjs';
import * as Store from '../../../src/operations/local/device-paged-owner-retention-v3.mjs';
import {buildPagedSepoliaSourceJournalDataV4} from '../../../src/operations/local/funded-graph-paged-source-journal-data-v4.mjs';
import {createPagedPrivateSourceArchiveV1} from '../../../src/accounts/storage/paged-source-archive-v1.mjs';
import {createHostOriginalTerminalOwnerGraphV15} from '../../providers/support-host-terminal-owner-graph-v15.mjs';
const H=x=>createHash('sha256').update('expired source archive HOST '+x).digest('hex'),sha=x=>createHash('sha256').update(x).digest('hex'),word=x=>'0x'+BigInt(x).toString(16).padStart(64,'0');

test('expired terminal storage archives FUNDED_IDLE, WITHDRAWN and signed graph without reviving permissions',{timeout:300000},async t=>{
 let f;
 const graphURL=new URL('../../../../engine/src/execution/local/device-paged-graph-client-v3.mjs',import.meta.url).href,GraphClient=await import(graphURL);
 t.mock.module(graphURL,{exports:{...GraphClient,async createOriginalDevicePagedGraphClientV3(descriptor,config){
  if(f.graph){f.owner=await createHostOriginalTerminalOwnerGraphV15({descriptor,devicePrivateJWK:f.deviceJWK,rootId:H('root'),revision:1,config,phase:f.phase});}
  else{const controller=Owner.createOriginalDevicePagedPrivateGraphV3(descriptor),store=await Store.createDevicePagedOwnerRetentionV3({...config,expected:null},descriptor);try{f.owner={checkpoint:await store.commit(Owner.retainOriginalDevicePagedPrivateGraphV3(controller))};}finally{store.close();await controller.close();}}
  const checkpoint=f.owner.checkpoint;return Object.freeze({checkpoint:()=>structuredClone(checkpoint),restoredPending:()=>null,async close(){}});
 }}});
 const assertSystem=(r,s)=>{assert.strictEqual(r,f.runtime);assert.strictEqual(s,f.system);};
 t.mock.module(new URL('../../../src/operations/local/funded-graph-paged-deployment-v3.mjs',import.meta.url).href,{exports:{assertOriginalFundedPagedGraphWalletV3:assertSystem,readOriginalFundedPagedGraphDeploymentV3:()=>f.deployment,pagedGraphProofDataV3(){throw Error('HOST_PROOF_FORBIDDEN');},pagedGraphStaticDataV3(){throw Error('HOST_EFFECT_FORBIDDEN');}}});
 t.mock.module(new URL('../../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs',import.meta.url).href,{exports:{createOriginalPagedSepoliaSourceJournalV4:(r,s,input)=>f.source.createInitial(r,s,input,Date.now()+(f.graph?30000:12000)),assertOriginalPagedSepoliaSourceJournalV4:(...args)=>f.source.assertBundle(...args),closeOriginalPagedSepoliaSourceJournalV4:token=>f.source.close(token)}});
 const provider=Object.freeze({});
 t.mock.module(new URL('../../../src/providers/funded-paged-native-provider-v3.mjs',import.meta.url).href,{exports:{assertOriginalPagedNativeProviderV3:(p,binding)=>{assert.strictEqual(p,provider);assertSystem(binding.runtime,binding.system);assert.strictEqual(binding.account,f.account);},readOriginalPagedNativeGraphQuoteIdsV4:()=>['ethereum'],readOriginalPagedNativeOperationRowsV4:()=>({providerIdentity:H('provider'),rows:[{id:'ethereum',attempt:{stage:f.nativePending?'SIGNED':'MINED'}}]})}});
 const Authority=await import('../../../src/accounts/authority/device-paged-note-authority-v3.mjs');
 for(const mode of ['FUNDED_IDLE','WITHDRAWN','FULFILLED','RECOVERED'])await t.test(mode,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'expired-source-archive-original-')),password=H('password'),device=freshKey();let archive,account;
  const key=device.privateKey,generation=JSON.parse(await readFile(new URL('../../../../../scripts/development/active-paged-generation.json',import.meta.url),'utf8'));
  f={graph:['FULFILLED','RECOVERED'].includes(mode),phase:mode,deviceJWK:key.export({format:'jwk'}),nativePending:false,badCode:false,wrongSpend:false,wrongOutcome:false,wrongProgress:false};
  const head={number:'0x1',hash:'0x'+H('head'),timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)},system={receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4',securityGeneration:generation.securityGeneration,minimumDepositAtomic:'10',manifestSHA256:generation.manifestSHA256,consumerSHA256:generation.consumerSHA256,...Object.fromEntries(['pool','state','native'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)])),...Object.fromEntries(['scope','policy','assetIdentity','domain','hubDomain','registryCommitment'].map(k=>[k,H(k)])),deployments:[{name:'PagedSparsePoseidon2V3',address:'0x'+'4'.repeat(40),codeHash:'0x'+H('math')}]};
  f.system=system;f.runtime={metadata:{chainId:'11155111',evmGenesis:'0x'+H('genesis')},accounts:['0x'+'5'.repeat(40)],receipts:[],health:async()=>{},block:async()=>head,assertCanonical:async h=>assert.equal(h.hash,head.hash),code:async()=>f.badCode?'0x6001':'0x6000'};
  f.deployment={...Object.fromEntries(['pool','state','native'].map(k=>[k,{expectedCode:'0x6000',codeHash:'0x'+H(k+'code')}])),ledgerLeaves:async()=>({leaves:['0x'+f.deposit.commitment],root:'0x'+H('ledger')}),call:async(_kind,name)=>{if(name==='leafCount()'||name==='liveReservations()'||name==='backedAmount()')return word(0);if(name==='CAPACITY()')return word(256);if(name==='spentNullifiers(bytes32)')return word(f.wrongSpend?mode==='FUNDED_IDLE'?1:0:mode==='FUNDED_IDLE'?0:1);if(name==='graphOutcomes(bytes32)')return word(f.wrongOutcome?1:mode==='RECOVERED'?3:2);if(name==='progress(bytes32)'){const values=Array(15).fill('0'.repeat(64));values[0]=f.owner.public.reserveNullifier;values[7]=f.wrongProgress?H('wrong-progress'):f.owner.public.progressCommitment;values[11]=BigInt(f.owner.public.budget).toString(16).padStart(64,'0');return'0x'+values.join('');}throw Error('HOST_RPC_UNEXPECTED:'+name);}};
  f.source=buildPagedSepoliaSourceJournalDataV4(Object.freeze({assertOriginalSystem:assertSystem,readOriginalSystem:()=>f.deployment,assertOriginalReceiverReady:async()=>{}}));
  const input={origin:'https://localhost:23456',devicePublicKey:'04'+device.x.toString('hex')+device.y.toString('hex'),journal:{path:join(directory,'old/operations.vault'),password}};
  try{
   account=await Authority.createOriginalDevicePagedSepoliaGraphNoteAuthorityV4(f.runtime,system,input);f.account=account;await Authority.bindOriginalDevicePagedNativePreparationV3(account,provider);const descriptor=account.descriptor(),vault=new Vault(input.journal.path),birth=await vault.read(password),publicInputs=Array(26).fill('0');publicInputs[17]=f.graph?'25':'10';
   const deposit={profile:P.DEVICE_PAGED_OWNER_V3,descriptor,mode:'deposit',stage:'CONFIRMED',jobId:'host-old-deposit',rootId:H('root'),revision:1,commitment:f.graph?f.owner.public.sourceCommitment:H('cm'),nullifier:f.graph?f.owner.public.sourceNullifier:H('nf'),publicInputs,witnessSHA256:H('witness'),proofSHA256:sha(Buffer.from('01','hex')),proof:'01',transactionHash:'0x'+H('fund'),errorCode:null};f.deposit=deposit;
   const graph=f.graph?{graphId:f.owner.graphId,rootId:deposit.rootId,revision:1,phase:mode,public:f.owner.public,pending:null,work:null,job:null}:null;
   const terminal=await vault.update(password,birth.revision,data=>({...data,jobs:mode==='WITHDRAWN'?[deposit,{...deposit,mode:'withdraw',jobId:'host-old-withdraw'}]:[deposit],graph}));
   const archiveInput={directory:join(directory,'archive'),password,principal:H('principal'),genesis:descriptor.genesis};await mkdir(archiveInput.directory,{mode:0o700});archive=await createPagedPrivateSourceArchiveV1(archiveInput);const before=await readFile(input.journal.path),ownerPath=join(directory,'old/private-owner.vault'),ownerBytes=await readFile(ownerPath);
   while(P.devicePagedNowV3()<=descriptor.deadlineMs)await new Promise(resolve=>setTimeout(resolve,Math.min(100,Math.max(1,descriptor.deadlineMs-P.devicePagedNowV3()+1))));
   assert.throws(()=>account.descriptor(),/PAGED_DEVICE_CLOSED/);assert.deepEqual(Authority.readOriginalDevicePagedRetainedSourceDescriptorV5(account),descriptor);assert.throws(()=>Authority.readOriginalDevicePagedRetainedSourceDescriptorV5({...account}),/ORIGINAL_ACCOUNT/);
   f.badCode=true;await assert.rejects(Authority.archiveOriginalDevicePagedSourceV4(account,archive,archiveInput.principal),/ARCHIVE_CODE/);f.badCode=false;
   f.wrongSpend=true;await assert.rejects(Authority.archiveOriginalDevicePagedSourceV4(account,archive,archiveInput.principal),/SOURCE_SPEND_STATE/);f.wrongSpend=false;
   if(f.graph){f.nativePending=true;await assert.rejects(Authority.archiveOriginalDevicePagedSourceV4(account,archive,archiveInput.principal),/NATIVE_UNKNOWN/);f.nativePending=false;f.wrongOutcome=true;await assert.rejects(Authority.archiveOriginalDevicePagedSourceV4(account,archive,archiveInput.principal),/DEPLOYED_OUTCOME/);f.wrongOutcome=false;f.wrongProgress=true;await assert.rejects(Authority.archiveOriginalDevicePagedSourceV4(account,archive,archiveInput.principal),/PROGRESS/);f.wrongProgress=false;}
   assert.deepEqual(await readFile(input.journal.path),before);assert.equal((await archive.status()).entries.length,0);assert.deepEqual(await readFile(ownerPath),ownerBytes);
   const token=await Authority.archiveOriginalDevicePagedSourceV4(account,archive,archiveInput.principal),after=await vault.read(password);assert.equal(after.data.refill.stage,'ARCHIVED');const clean=structuredClone(after.data);delete clean.refill;assert.deepEqual(clean,terminal.data);assert.equal(after.revision,terminal.revision+1);assert.strictEqual(await Authority.archiveOriginalDevicePagedSourceV4(account,archive,archiveInput.principal),token);assert.deepEqual(await vault.read(password),after);const state=await archive.status();assert.equal(state.entries.length,1);assert.equal(state.entries[0].binding.phase,mode);const saved=await archive.read(state.entries[0].binding.sourceId);assert.deepEqual(saved.journal.data,terminal.data);assert.deepEqual(saved.owner.checkpoint,f.owner.checkpoint);assert.deepEqual(await readFile(ownerPath),ownerBytes);assert.throws(()=>account.descriptor(),/PAGED_DEVICE_CLOSED/);
  }finally{await account?.close();await archive?.close();device.privateKey=null;await rm(directory,{recursive:true,force:true});}
 });
});
