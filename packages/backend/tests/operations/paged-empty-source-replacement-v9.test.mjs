/** Actual SourceJournal producer + encrypted Authority/OWNER/intent vaults.
 * System/RPC/financial-history ports are explicit HOST seams; no signer, prover,
 * Source EOA, send method, deployment or financial permission is installed. */
import test from 'node:test';
import {OPERATION_WINDOW_V17,operationSpendingPolicySHA256V17} from '../../src/chains/public-testnet/sepolia-operation-window-data-v17.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import * as RPC from '../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {devicePagedNowV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
import {buildPagedSepoliaSourceJournalDataV4} from '../../src/operations/local/funded-graph-paged-source-journal-data-v4.mjs';
import {pagedEmptySourceReplacementPathV9} from '../../src/operations/recovery/paged-empty-source-replacement-data-v9.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),word=v=>'0x'+BigInt(v).toString(16).padStart(64,'0'),point='0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
const emptyPublic=()=>({authorizationRoot:null,reserveNullifier:null,progressCommitment:null,readyCommitment:null,sourceCommitment:null,sourceNullifier:null,pages:'0',nodes:'0',budget:null,settleBefore:null,phase:'BUILDING'});
const controller=()=>({profile:'DEVICE_PAGED_PRIVATE_OWNER_RETENTION_V3',preparation:null,cfg:null,context:null,ids:[],pages:[],invoices:[],admissions:[],frontier:[],ownerAttached:false,phase:'BUILDING',pending:null,lastConfirmed:null,lastReply:null,automation:null,public:emptyPublic()});
async function fixture(options={}){
 const directory=await mkdtemp(join(tmpdir(),'lianum-empty-renew-v9-')),password=sha('password'),path=join(directory,'journal.vault'),now=devicePagedNowV3(),system=Object.freeze({receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4',securityGeneration:'EXACT_PAYOUT_SET_V4',minimumDepositAtomic:'1',...Object.fromEntries(['pool','state','native'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)])),...Object.fromEntries(['scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256'].map(k=>[k,sha(k)])),deployments:[{name:'PagedSparsePoseidon2V3',address:'0x'+'4'.repeat(40),codeHash:'0x'+sha('math')}]});
 const policy={profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:sha('keyset'),account:'0x'+'5'.repeat(40),maximumFeePerTransactionAtomic:'1',maximumTotalFeeAtomic:'100',maximumValuePerTransactionAtomic:'1',maximumTotalValueAtomic:'100',expiresAt:now+(options.childLifetimeMs===undefined?3*3600000:1800000+options.childLifetimeMs)};let operationWindowV17=null;let history=[],blockReads=0,sourceQuota='4',epoch=sha('epoch'),poolBalance=0n,poolState=0n,canonicalHook=null;
 const runtime=Object.freeze({metadata:{chainId:'11155111',evmGenesis:'0x'+sha('genesis')},async block(){blockReads++;return{hash:'0x'+sha('head'),number:'0x1',timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)};},async assertCanonical(){await canonicalHook?.();},async balance(){return poolBalance;},async call(){return word(0);}}),originals=new WeakSet([system]),deployment={...Object.fromEntries(['pool','state','native'].map(k=>[k,{codeHash:'0x'+sha(k+'code')}])),async call(name,method){assert.equal(name,'pool');assert.ok(['leafCount()','backedAmount()','liveReservations()'].includes(method));return word(poolState);}};
 const producer=buildPagedSepoliaSourceJournalDataV4(Object.freeze({async readOriginalHistoricalBalance(r,address,head){assert.strictEqual(r,runtime);assert.equal(address,system.pool);assert.ok(head.hash);return poolBalance;},assertOriginalSystem(r,s){assert.strictEqual(r,runtime);assert.ok(originals.has(s));},readOriginalSystem(r,s){assert.strictEqual(r,runtime);assert.ok(originals.has(s));return deployment;},async assertOriginalReceiverReady(r,s){assert.strictEqual(r,runtime);assert.ok(originals.has(s));},readOriginalFinancialHistory(r){assert.strictEqual(r,runtime);return{history:[...structuredClone(history),{epoch:{epochId:epoch,issuedAt:now,policy:structuredClone(policy),limits:{maximumSourcesPerWallet:sourceQuota,...(operationWindowV17?{operationWindowV17}:{})}}}],epochId:epoch,effectivePolicy:policy,limits:{maximumSourcesPerWallet:sourceQuota,...(operationWindowV17?{operationWindowV17}:{})}};}}));
 const bundle=await producer.createIndependent(runtime,system,{origin:'https://127.0.0.1:9445',devicePublicKey:point,journal:{path,password}},now+(options.rootLifetimeMs??60000));
 async function writeOwner(b,mutate=null){const data=controller();mutate?.(data);const ownerPath=join(dirname(b.vault.path),'private-owner.vault');await mkdir(dirname(ownerPath),{recursive:true,mode:0o700});await new Vault(ownerPath).create({profile:'DEVICE_PAGED_OWNER_DURABLE_CHECKPOINT_V3',descriptor:b.descriptor,controller:data},sha(Buffer.from('LIANUM/PAGED/OWNER-RETENTION/V3\0'+password+'\0'+b.descriptor.pairingId)));}
 return{setFiniteWindow(){policy.expiresAt=now+38*24*3600000;operationWindowV17={profile:OPERATION_WINDOW_V17,authorizedAt:now,expiresAt:policy.expiresAt,spendingPolicySHA256:operationSpendingPolicySHA256V17(policy)};return policy.expiresAt;},directory,password,path,system,runtime,producer,bundle,writeOwner,blockReads:()=>blockReads,setPoolBalance:v=>{poolBalance=v;},setPoolState:v=>{poolState=v;},setCanonicalHook:v=>{canonicalHook=v;},setEpoch:v=>{epoch=v;},setSourceQuota:v=>{sourceQuota=v;},setHistory:v=>{history=v;},changeFee:()=>{policy.maximumTotalFeeAtomic='101';},extendPolicy:()=>{history.push({epoch:{epochId:epoch,policy:structuredClone(policy),limits:{maximumSourcesPerWallet:sourceQuota}}});policy.expiresAt+=3*3600000;epoch=sha(epoch);},close:()=>rm(directory,{recursive:true,force:true})};
}
test('Original empty replacement is staged durably, preserves historical bytes and resumes the same child/OWNER without sends',async()=>{
 const f=await fixture();try{await f.writeOwner(f.bundle);const oldJournal=await readFile(f.path),oldOwner=await readFile(join(f.directory,'private-owner.vault'));
  await assert.rejects(f.producer.replaceEmpty(f.runtime,f.system,{...f.bundle}),/ORIGINAL_BUNDLE/);
  const next=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),binding=f.producer.readEmptyReplacement(f.runtime,f.system,next);assert.notEqual(next.descriptor.pairingId,f.bundle.descriptor.pairingId);assert.equal(next.descriptor.devicePublicKey,f.bundle.descriptor.devicePublicKey);assert.equal(next.descriptor.pool,f.bundle.descriptor.pool);assert.ok(next.descriptor.deadlineMs>f.bundle.descriptor.deadlineMs);assert.equal(binding.journalPath,pagedEmptySourceReplacementPathV9(f.path,1));assert.equal(binding.lineage.generation,1);assert.strictEqual(binding.predecessorBundle,f.bundle);assert.equal(f.runtime.send,undefined);
  const intentPath=join(dirname(binding.journalPath),'intent.vault'),intent=await readFile(intentPath),childBytes=await readFile(binding.journalPath);await f.writeOwner(next);
  const resumed=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);assert.deepEqual(resumed.descriptor,next.descriptor);assert.equal(resumed.identity,next.identity);assert.ok(resumed.opening);assert.deepEqual(await readFile(binding.journalPath),childBytes);assert.deepEqual(await readFile(intentPath),intent);assert.deepEqual(await readFile(f.path),oldJournal);assert.deepEqual(await readFile(join(f.directory,'private-owner.vault')),oldOwner);assert.throws(()=>f.producer.assertBundle(f.runtime,f.system,f.bundle),/JOURNAL_EXPIRED/);const oldStorage=await f.producer.reopenEmptyPredecessor(f.runtime,f.system,resumed);assert.equal(oldStorage.emptyReplacementPredecessorV9,true);assert.deepEqual(oldStorage.descriptor,f.bundle.descriptor);assert.strictEqual(f.producer.assertStorageBundle(f.runtime,f.system,oldStorage),oldStorage);await assert.rejects(f.producer.replaceEmpty(f.runtime,f.system,resumed),/NEW_EPOCH_REQUIRED/);f.extendPolicy();const second=await f.producer.replaceEmpty(f.runtime,f.system,resumed),secondBinding=f.producer.readEmptyReplacement(f.runtime,f.system,second);assert.equal(secondBinding.lineage.generation,2);assert.equal(secondBinding.lineage.rootJournalPath,f.path);assert.equal(secondBinding.predecessorJournalPath,binding.journalPath);assert.deepEqual(await readFile(binding.journalPath),childBytes);
 }finally{await f.close();}
});
test('replacement rejects all nonempty account/OWNER/canonical states and a changed epoch before births',async()=>{
 for(const kind of ['jobs','rootDeposits','children','balances','historicalExitJobs','noteWork','ownerPages','ownerProof','balance','reservations','epoch','quota']){const f=await fixture();try{await f.writeOwner(f.bundle,kind==='ownerPages'?c=>c.pages=[{secret:'HOST'}]:kind==='ownerProof'?c=>c.proofIntent={jobId:'HOST'}:null);if(['jobs','rootDeposits','children','balances','historicalExitJobs','noteWork'].includes(kind)){const r=await f.bundle.vault.read(f.password);await f.bundle.vault.update(f.password,r.revision,data=>({...data,...(kind==='jobs'?{jobs:[{stage:'CONFIRMED'}]}:{[kind]:kind==='noteWork'?null:[]})}));}if(kind==='quota')f.setSourceQuota('1');if(kind==='balance')f.setPoolBalance(1n);if(kind==='reservations')f.setPoolState(1n);if(kind==='epoch')f.setCanonicalHook(()=>f.setEpoch(sha('changed')));await assert.rejects(f.producer.replaceEmpty(f.runtime,f.system,f.bundle));await assert.rejects(readFile(join(f.directory,'renewals','1','intent.vault')),{code:'ENOENT'});}finally{await f.close();}}
});

test('cold DATA validation rechecks the immutable predecessor OWNER, intent and canonical zero ledger',async(t)=>{
 t.mock.module('../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs',{namedExports:{...RPC,readOriginalPagedSepoliaHistoricalBalanceV4:async(runtime,address,head)=>{assert.ok(head.hash);assert.match(address,/^0x[0-9a-f]{40}$/);return 0n;}}});const {readPagedEmptySourceReplacementCurrentDataV9}=await import('../../src/operations/recovery/paged-empty-source-replacement-current-data-v9.mjs');
 const f=await fixture();try{await f.writeOwner(f.bundle);const child=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),binding=f.producer.readEmptyReplacement(f.runtime,f.system,child),raw={lineage:binding.lineage,journalPath:binding.journalPath,password:f.password,rpc:f.runtime};const current=await readPagedEmptySourceReplacementCurrentDataV9(raw);assert.equal(current.files.length,4);assert.ok(current.files.every(row=>row.sha256.length===64));const modified=structuredClone(raw.lineage);modified.emptyLedger.blockHash='0x'+sha('foreignhead');await assert.rejects(readPagedEmptySourceReplacementCurrentDataV9({...raw,lineage:modified}));const r=await f.bundle.vault.read(f.password);await f.bundle.vault.update(f.password,r.revision,d=>({...d,rootDeposits:[]}));await assert.rejects(readPagedEmptySourceReplacementCurrentDataV9(raw));}finally{await f.close();}
});

test('a signed period extension retires only an unowned empty birth, preserving original ciphertext and quota',async()=>{
 for(const intentOnly of [false,true]){const f=await fixture();try{
  await f.writeOwner(f.bundle);const parent=await readFile(f.path),owner=await readFile(join(f.directory,'private-owner.vault'));
  const child=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),path=child.vault.path,intentPath=join(dirname(path),'intent.vault'),oldIntent=await readFile(intentPath),oldChild=await readFile(path),oldBinding=f.producer.readEmptyReplacement(f.runtime,f.system,child);
  if(intentOnly)await rm(path);f.extendPolicy();
  const recovered=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),binding=f.producer.readEmptyReplacement(f.runtime,f.system,recovered),archive=join(dirname(path),'superseded',oldBinding.lineage.financial.epochId);
  assert.equal(binding.lineage.generation,1);assert.equal(binding.lineage.financial.maximumSourcesPerWallet,'4');assert.equal(recovered.vault.path,path);assert.notEqual(recovered.identity,child.identity);assert.notEqual(recovered.descriptor.pairingId,child.descriptor.pairingId);
  assert.equal((await new Vault(intentPath).read(f.password)).revision,1);assert.deepEqual(await readFile(join(archive,'intent.vault')),oldIntent);
  if(intentOnly)await assert.rejects(readFile(join(archive,'journal.vault')),{code:'ENOENT'});else assert.deepEqual(await readFile(join(archive,'journal.vault')),oldChild);
  assert.deepEqual(await readFile(f.path),parent);assert.deepEqual(await readFile(join(f.directory,'private-owner.vault')),owner);assert.equal(f.runtime.send,undefined);
  await f.writeOwner(recovered);const resumed=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);assert.equal(resumed.identity,recovered.identity);assert.deepEqual(resumed.descriptor,recovered.descriptor);assert.ok(resumed.opening);
 }finally{await f.close();}}
});

test('period retirement rejects advanced, foreign, unsigned or scope-changed births',async()=>{
 for(const kind of ['advanced','foreign','unsigned','fee','quota','nonempty']){const f=await fixture();try{
  await f.writeOwner(f.bundle);const child=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),path=child.vault.path,intentPath=join(dirname(path),'intent.vault'),binding=f.producer.readEmptyReplacement(f.runtime,f.system,child);
  if(kind==='owner')await f.writeOwner(child);
  if(kind==='advanced')await child.vault.update(f.password,0,data=>data);
  if(kind==='foreign'){const actual=await child.vault.read(f.password);actual.data.identity=sha('foreign');await rm(path);await new Vault(path).create(actual.data,f.password);}
  f.extendPolicy();if(kind==='unsigned')f.setHistory([]);if(kind==='fee')f.changeFee();if(kind==='quota')f.setSourceQuota('5');if(kind==='nonempty')f.setPoolBalance(1n);
  const oldIntent=await readFile(intentPath),oldChild=await readFile(path);
  await assert.rejects(f.producer.replaceEmpty(f.runtime,f.system,f.bundle));assert.deepEqual(await readFile(intentPath),oldIntent);assert.deepEqual(await readFile(path),oldChild);
  await assert.rejects(readFile(join(dirname(path),'superseded',binding.lineage.financial.epochId,'intent.vault')),{code:'ENOENT'});
 }finally{await f.close();}}
});

test('an owned empty child survives a signed period extension without another birth or ciphertext change',async t=>{
 for(const expired of [false,true]){const f=await fixture(expired?{rootLifetimeMs:2000,childLifetimeMs:6000}:{});try{
  await f.writeOwner(f.bundle);const child=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),path=child.vault.path;await f.writeOwner(child);const oldBinding=f.producer.readEmptyReplacement(f.runtime,f.system,child),files=[f.path,join(f.directory,'private-owner.vault'),path,join(dirname(path),'private-owner.vault'),join(dirname(path),'intent.vault')],before=await Promise.all(files.map(path=>readFile(path)));
  f.extendPolicy();if(expired)await new Promise(resolve=>setTimeout(resolve,Math.max(0,child.descriptor.deadlineMs-devicePagedNowV3())+30));
  const recovered=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),binding=f.producer.readEmptyReplacement(f.runtime,f.system,recovered);
  assert.equal(recovered.identity,child.identity);assert.deepEqual(recovered.descriptor,child.descriptor);assert.deepEqual(binding.lineage,oldBinding.lineage);assert.ok(recovered.opening);assert.deepEqual(await Promise.all(files.map(path=>readFile(path))),before);assert.strictEqual(f.producer.assertStorageBundle(f.runtime,f.system,recovered),recovered);
  if(expired)assert.throws(()=>f.producer.assertBundle(f.runtime,f.system,recovered),/JOURNAL_EXPIRED/);
  const next=await f.producer.replaceEmpty(f.runtime,f.system,recovered);assert.equal(f.producer.readEmptyReplacement(f.runtime,f.system,next).lineage.generation,2);assert.deepEqual(await readFile(path),before[2]);
 }finally{await f.close();}}
});

test('owned recovery authenticates the exact unused OWNER and rejects changed scope or activity',async()=>{
 for(const kind of ['ownerPages','ownerProof','ownerRevision','journalRevision','identity','unsigned','fee','quotaRollback']){const f=await fixture();try{
  await f.writeOwner(f.bundle);const child=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),path=child.vault.path,ownerPath=join(dirname(path),'private-owner.vault');
  await f.writeOwner(child,kind==='ownerPages'?c=>c.pages=[{}]:kind==='ownerProof'?c=>c.proofIntent={}:null);
  if(kind==='ownerRevision'){const password=sha(Buffer.from('LIANUM/PAGED/OWNER-RETENTION/V3\0'+f.password+'\0'+child.descriptor.pairingId));await new Vault(ownerPath).update(password,0,data=>data);}
  if(kind==='journalRevision')await child.vault.update(f.password,0,data=>data);
  if(kind==='identity'){const current=await child.vault.read(f.password);current.data.identity=sha('foreign');await rm(path);await new Vault(path).create(current.data,f.password);}
  f.extendPolicy();if(kind==='unsigned')f.setHistory([]);if(kind==='fee')f.changeFee();if(kind==='quotaRollback')f.setSourceQuota('3');
  const files=[path,ownerPath,join(dirname(path),'intent.vault')],before=await Promise.all(files.map(path=>readFile(path)));await assert.rejects(f.producer.replaceEmpty(f.runtime,f.system,f.bundle));assert.deepEqual(await Promise.all(files.map(path=>readFile(path))),before);
 }finally{await f.close();}}
});

test('resuming the existing child does not bypass an exhausted source quota for the next renewal',async()=>{
 const f=await fixture();try{
  f.setSourceQuota('2');await f.writeOwner(f.bundle);const child=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);await f.writeOwner(child);f.extendPolicy();
  const resumed=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);assert.equal(resumed.identity,child.identity);const reads=f.blockReads();await assert.rejects(f.producer.replaceEmpty(f.runtime,f.system,resumed),/SIGNED_WALLET_QUOTA/);assert.equal(f.blockReads(),reads,'quota rejection precedes new RPC work');
 }finally{await f.close();}
});

test('a separately authorized quota can renew after restoring the exact old owned child',async()=>{
 const f=await fixture();try{
  f.setSourceQuota('2');await f.writeOwner(f.bundle);const child=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);await f.writeOwner(child);f.extendPolicy();f.setSourceQuota('3');
  const resumed=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);assert.equal(resumed.identity,child.identity);assert.equal(f.producer.readEmptyReplacement(f.runtime,f.system,resumed).lineage.financial.maximumSourcesPerWallet,'2');
  const next=await f.producer.replaceEmpty(f.runtime,f.system,resumed),binding=f.producer.readEmptyReplacement(f.runtime,f.system,next);assert.equal(binding.lineage.generation,2);assert.equal(binding.lineage.financial.maximumSourcesPerWallet,'3');
 }finally{await f.close();}
});

test('interruption after retiring a never-owned child resumes without replacing the predecessor or losing the old intent',async()=>{
 const f=await fixture();try{
  await f.writeOwner(f.bundle);const child=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle),path=child.vault.path,intentPath=join(dirname(path),'intent.vault'),oldIntent=await readFile(intentPath),oldChild=await readFile(path),binding=f.producer.readEmptyReplacement(f.runtime,f.system,child),archive=join(dirname(path),'superseded',binding.lineage.financial.epochId);
  f.extendPolicy();f.setCanonicalHook(async()=>{try{await readFile(join(archive,'journal.vault'));}catch(error){if(error.code==='ENOENT')return;throw error;}await assert.rejects(readFile(path),{code:'ENOENT'});throw Error('HOST_INTERRUPTED_AFTER_RETIREMENT');});
  await assert.rejects(f.producer.replaceEmpty(f.runtime,f.system,f.bundle),/HOST_INTERRUPTED_AFTER_RETIREMENT/);assert.deepEqual(await readFile(intentPath),oldIntent);assert.deepEqual(await readFile(join(archive,'journal.vault')),oldChild);
  f.setCanonicalHook(null);const recovered=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);assert.notEqual(recovered.identity,child.identity);assert.equal(recovered.vault.path,path);assert.deepEqual(await readFile(join(archive,'intent.vault')),oldIntent);
  await f.writeOwner(recovered);const resumed=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);assert.equal(resumed.identity,recovered.identity);
 }finally{await f.close();}
});

test('empty Source birth inherits signed November window instead of falling back to nine hours',async()=>{
 const f=await fixture();try{await f.writeOwner(f.bundle);const expiry=f.setFiniteWindow(),next=await f.producer.replaceEmpty(f.runtime,f.system,f.bundle);assert.equal(next.descriptor.deadlineMs,expiry-30*60000);assert.ok(next.descriptor.deadlineMs>devicePagedNowV3()+9*3600000);assert.equal(f.runtime.send,undefined);const saved=await next.vault.read(f.password);assert.equal(saved.data.descriptor.deadlineMs,next.descriptor.deadlineMs);}finally{await f.close();}
});
