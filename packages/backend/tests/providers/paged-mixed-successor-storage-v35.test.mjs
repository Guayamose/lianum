/** Real Vault storage/hash checks; OWNER semantic validation is an explicit
 * HOST seam. No proof, account, network or financial acceptance is claimed. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {devicePagedSourceIdentityV4} from '@lianum/mobile-protocol/device/paged-source-continuation-v4';
import {descriptor as baseDescriptor} from './fixtures/paged-mixed-host-v7.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex'),h=value=>sha(String(value)),digest=value=>sha(canonical(value)),word=value=>'0x'+BigInt(value).toString(16).padStart(64,'0');
const validations=new WeakMap();let balances=0;
mock.module(new URL('../../src/operations/local/device-paged-owner-retention-v3.mjs',import.meta.url).href,{exports:{
 async validateOriginalDevicePagedOwnerReadRecoveryV4(input,descriptor,expected){const row=await new Vault(input.path).read(input.password);assert.equal(row.data.descriptor.pairingId,descriptor.pairingId);assert.deepEqual(row.data.checkpoint,expected,'HOST_OWNER_CHECKPOINT');const token=Object.freeze({});validations.set(token,expected);return token;},
 readOriginalDevicePagedOwnerReadRecoveryValidationV4(token){const checkpoint=validations.get(token);assert.ok(checkpoint);return{checkpoint};},
 closeOriginalDevicePagedOwnerReadRecoveryValidationV4:token=>validations.delete(token),
 async readOriginalDevicePagedOwnerEmptyReplacementCheckpointV9(input,descriptor){const row=await new Vault(input.path).read(input.password);assert.equal(row.data.descriptor.pairingId,descriptor.pairingId);return row.data.checkpoint;}
}});
mock.module(new URL('../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs',import.meta.url).href,{exports:{async readOriginalPagedSepoliaHistoricalBalanceV4(rpc,pool,head){balances++;return rpc.balanceAtomic;}}});
const {readPagedMixedSourceSuccessorStorageDataV35:storage,readPagedMixedSourceSuccessorCurrentDataV35:current}=await import('../../src/operations/recovery/paged-mixed-source-successor-current-data-v35.mjs');
async function seed(directory){
 const root=join(directory,'source','journal.vault'),password='HOST V35 storage only password 12345678901234567890',code='0x6000',codeHash=publicKeccak256(Buffer.from('6000','hex')).toString('hex'),initial={...baseDescriptor,...Object.fromEntries(['pool','state','native'].map(k=>[k+'CodeHash',codeHash]))},ownerPassword=d=>h('LIANUM/PAGED/OWNER-RETENTION/V3\0'+password+'\0'+d.pairingId);
 async function create(path,data){await mkdir(dirname(path),{recursive:true,mode:0o700});return new Vault(path).create(data,password);}
 async function owner(path,descriptor){const checkpoint={profile:'DEVICE_PAGED_OWNER_DURABLE_CHECKPOINT_V3',descriptorSHA256:digest(descriptor),revision:0,dataSHA256:h('owner'+descriptor.pairingId),public:{}};await new Vault(join(dirname(path),'private-owner.vault')).create({descriptor,checkpoint},ownerPassword(descriptor));return checkpoint;}
 let path=root,row=await create(path,{schema:baseDescriptor.profile,identity:h('birth'),descriptor:initial,jobs:[],pending:null,graph:null}),checkpoint=await owner(path,initial);
 for(let generation=1;generation<=2;generation++){
  const descriptor={...row.data.descriptor,pairingId:'empty-storage-'+generation,deadlineMs:initial.deadlineMs+generation*1000},lineage={profile:'ORIGINAL_PAGED_EMPTY_SOURCE_REPLACEMENT_V9',generation,rootJournalPath:root,predecessor:{journalPath:path,identity:row.data.identity,descriptor:row.data.descriptor,journalRevision:row.revision,journalDataSHA256:digest(row.data),ownerCheckpoint:checkpoint},financial:{epochId:h('epoch'+generation),policySHA256:h('policy'),expiresAt:descriptor.deadlineMs+3600000,maximumSourcesPerWallet:'4'},emptyLedger:{blockHash:'0x'+h('empty-block'+generation),blockNumber:String(generation),leafCount:'0',backedAmount:'0',liveReservations:'0',balanceAtomic:'0'}};path=join(directory,'source','renewals',String(generation),'journal.vault');row=await create(path,{schema:baseDescriptor.profile,identity:h('empty'+generation),descriptor,jobs:[],pending:null,graph:null,emptyReplacementV9:lineage});checkpoint=await owner(path,descriptor);await create(join(dirname(path),'intent.vault'),{profile:'ORIGINAL_PAGED_EMPTY_REPLACEMENT_INTENT_V9',lineage,identity:row.data.identity,descriptor});
 }
 const deposit={jobId:'deposit-fixture',mode:'deposit',stage:'CONFIRMED',rootId:h('wallet-root'),revision:1,commitment:h('deposit'),nullifier:h('spent')},graph={phase:'FULFILLED',graphId:'completed-graph',rootId:deposit.rootId,revision:1,job:{stage:'CONFIRMED'},public:{authorizationRoot:h('auth'),sourceCommitment:deposit.commitment,sourceNullifier:deposit.nullifier}},changed={...row.data,jobs:[deposit],graph};row=await new Vault(path).update(password,row.revision,()=>changed);
 const lineage={profile:'ORIGINAL_PAGED_MIXED_SOURCE_SUCCESSOR_V35',birthOrdinal:4,rootJournalPath:root,predecessor:{journalPath:path,identity:row.data.identity,descriptor:row.data.descriptor,journalRevision:row.revision,journalDataSHA256:digest(row.data),ownerCheckpoint:checkpoint},financial:{epochId:h('epoch3'),policySHA256:h('policy'),expiresAt:row.data.descriptor.deadlineMs+3600000,maximumSourcesPerWallet:'4'},terminal:{kind:'FULFILLED',blockHash:'0x'+h('terminal-block'),blockNumber:'3',sourceCommitment:deposit.commitment,sourceNullifier:deposit.nullifier,graphId:graph.graphId,authorizationRoot:graph.public.authorizationRoot,sourceRevision:'1',sourceId:devicePagedSourceIdentityV4(row.data.descriptor,{rootId:deposit.rootId,revision:1,commitment:deposit.commitment,nullifier:deposit.nullifier,graphId:graph.graphId}),walletRootId:deposit.rootId,leafCount:'1',backedAmount:'0',liveReservations:'0',balanceAtomic:'0'},lineage:{profile:'DEVICE_PAGED_ORIGINAL_SOURCE_REFILL_V4',walletRootId:deposit.rootId,sourceRevision:2,predecessorPairingId:row.data.descriptor.pairingId,predecessorSourceId:null,principalSHA256:h('principal')}};lineage.lineage.predecessorSourceId=lineage.terminal.sourceId;
 const descriptor={...row.data.descriptor,pairingId:'terminal-successor'},journalPath=join(directory,'source','successors-v35','4','journal.vault'),identity=h('successor');await create(journalPath,{schema:baseDescriptor.profile,identity,descriptor,jobs:[],pending:null,graph:null,sourceLineage:lineage.lineage,mixedSuccessorV35:lineage});await owner(journalPath,descriptor);await create(join(dirname(journalPath),'intent.vault'),{profile:'ORIGINAL_PAGED_MIXED_SUCCESSOR_INTENT_V35',lineage,identity,descriptor});
 let calls=0;const method=signature=>'0x'+publicKeccak256(Buffer.from(signature)).subarray(0,4).toString('hex'),rpc={balanceAtomic:0n,block:async number=>{calls++;const n=BigInt(number);return{number,hash:'0x'+(n===3n?h('terminal-block'):h('empty-block'+n)),timestamp:'0x100'};},assertCanonical:async()=>{calls++;},code:async()=>{calls++;return code;},call:async(tx,number)=>{calls++;if(BigInt(number)<3n)return word(0);if(tx.data.startsWith(method('spentNullifiers(bytes32)')))return word(1);if(tx.data===method('leafCount()'))return word(1);if(tx.data.startsWith(method('graphOutcomes(bytes32)')))return word(2);return word(0);}};
 return{input:{lineage,journalPath,password},rpc,calls:()=>calls};
}
test('offline inspector authenticates V35→EMPTY→EMPTY→birth with zero RPC, retains all files and rejects tampering',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mixed-successor-storage-'));
 try{const x=await seed(directory),before=balances,result=await storage(x.input);assert.equal(x.calls(),0);assert.equal(balances,before);assert.equal(result.files.length,10);assert.ok(result.files.some(file=>file.path===x.input.lineage.rootJournalPath));const snapshots=await Promise.all(result.files.map(async file=>[file.path,await readFile(file.path)]));
  for(const path of [join(dirname(x.input.journalPath),'intent.vault'),x.input.lineage.predecessor.journalPath,join(dirname(x.input.lineage.predecessor.journalPath),'private-owner.vault'),x.input.lineage.rootJournalPath]){const bytes=await readFile(path),changed=Buffer.from(bytes);changed[changed.length-8]^=1;await writeFile(path,changed);await assert.rejects(storage(x.input));await writeFile(path,bytes);}
  assert.deepEqual(await storage(x.input),result);for(const [path,bytes]of snapshots)assert.deepEqual(await readFile(path),bytes);const bad={...x.input,lineage:structuredClone(x.input.lineage)};bad.lineage.birthOrdinal=3;await assert.rejects(storage(bad));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('canonical successor check rejects changed block, unspent source, residual balance and graph outcome',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mixed-successor-canonical-'));
 try{const x=await seed(directory);assert.equal((await current({...x.input,rpc:x.rpc})).files.length,10);assert.ok(x.calls()>0);
  await assert.rejects(current({...x.input,rpc:{...x.rpc,balanceAtomic:1n}}),/HISTORICAL_BALANCE/);
  await assert.rejects(current({...x.input,rpc:{...x.rpc,block:async number=>({...await x.rpc.block(number),hash:'0x'+h('changed')})}}),/HISTORICAL_HEAD/);
  for(const [signature,error]of [['spentNullifiers(bytes32)','HISTORICAL_SPENT'],['graphOutcomes(bytes32)','HISTORICAL_OUTCOME']]){const prefix='0x'+publicKeccak256(Buffer.from(signature)).subarray(0,4).toString('hex');await assert.rejects(current({...x.input,rpc:{...x.rpc,call:async(tx,number)=>tx.data.startsWith(prefix)?word(0):x.rpc.call(tx,number)}}),new RegExp(error));}
 }finally{await rm(directory,{recursive:true,force:true});}
});
