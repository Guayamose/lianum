/** Captured Aave/Morpho observation below the SAME Original Root. No Source
 * lane, target financial owner, proof client, worker or signing key is opened. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';
import {join,dirname} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {normalizeDeviceSepoliaDefiFinancialStatusV7} from '@lianum/mobile-protocol/device/sepolia-defi-financial-status-v7';
import * as M from './paged-public-uniswap-mixed-supervisor-v4.mjs';
import {normalizePagedPublicDefiRecoveryLocatorDataV8} from './paged-public-defi-source-current-data-v8.mjs';
import {PROFILE,physical,load} from './sepolia-defi-retention-data-v8.mjs';
import {openOriginalPagedPublicSourceReadValidatorV4,closeOriginalPagedPublicSourceReadValidatorV4} from './paged-public-source-read-validator-v4.mjs';
import {hashPagedSourcePrivateFileV4,readPagedSourcePrivateJSONV4} from './paged-source-read-files-v4.mjs';
import {createOriginalPagedSepoliaRpcV4} from '../../chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {readSepoliaDefiSharesLedgerDataV4} from '../../chains/public-testnet/sepolia-defi-shares-ledger-data-v4.mjs';
import {DEFI_TARGET_ROW_V8,DEFI_COMMAND_ROW_V8,validateSepoliaDefiInitializationDataV8} from '../../chains/public-testnet/sepolia-defi-journal-data-v8.mjs';
import {validateOriginalDeviceSepoliaDefiRecoveryDataV8} from '../../accounts/authority/sepolia-defi-recovery-data-v8.mjs';
import {readDeviceNoteStatusV1} from '../../accounts/authority/device-note-observation-v1.mjs';

const issuers=new WeakMap(),copy=structuredClone,sha=v=>createHash('sha256').update(v).digest('hex'),jsonSHA=v=>sha(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const bare=v=>v.startsWith('0x')?v.slice(2):v;
async function optionalHash(path,max){try{return await hashPagedSourcePrivateFileV4(path,max);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function key(descriptor){return createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});}
function publicAccounts(accounts){return freeze([...accounts.values()].map(row=>({protocol:row.anchor.protocol,descriptor:copy(row.descriptor)})));}

export async function openOriginalPagedCapturedSepoliaDefiReadV8(originalToken,input){
 assert.equal(arguments.length,2);P.externalFlatExactV1(input,['rootPassword']);assert.ok(typeof input.rootPassword==='string'&&input.rootPassword.length>=32&&input.rootPassword.length<=4096);
 const reader=await M.consumeOriginalPagedCapturedSepoliaDefiReadV8(originalToken),accounts=new Map(),files=new Map();
 let password=sha('LIANUM/PUBLIC/SEPOLIA/DEFI/8\0'+input.rootPassword),validator,rpc,closed=false,closing,work=Promise.resolve(),queued=0;
 const challenges=new Map();
 async function close(){return closing??=(async()=>{closed=true;challenges.clear();await work;try{await closeOriginalPagedPublicSourceReadValidatorV4(validator);if(rpc){rpc.lifecycle.acknowledge();await rpc.runtime.close();}}finally{for(const row of accounts.values())row.password=null;password=null;M.closeOriginalPagedCapturedSepoliaDefiReadReaderV8(reader);}})();}
 try{
  const root=await M.readOriginalPagedCapturedSepoliaDefiReadV8(reader),native=root.native;
  assert.equal(root.profile,'ORIGINAL_PUBLIC_CAPTURED_SEPOLIA_DEFI_READ_V8');assert.equal(root.supervisor.phase,'CAPTURED');
  const locator=normalizePagedPublicDefiRecoveryLocatorDataV8(native.source?.defiRetentionV8,{keysetId:native.keysetId,account:native.source.configuration.receiver.account.address,parentPool:root.deployment.system.pool});
  assert.equal(locator.binding.uniswapTargetPlanSHA256,root.uniswapTarget.system.planSHA256,'SEPOLIA_DEFI_READ_ORIGINAL_TARGET');
  const sourceReader=await M.readOriginalPagedCapturedSepoliaDefiValidationReaderV8(reader);
  validator=await openOriginalPagedPublicSourceReadValidatorV4(sourceReader);await closeOriginalPagedPublicSourceReadValidatorV4(validator);validator=null;
  for(const [path,max]of [[join(native.directory,'dispatch-journal/native-wallet.json'),33554432],[join(native.directory,'receiver-bootstrap/native-wallet.json'),33554432],[join(native.directory,'source-operations/native-wallet.json'),33554432],[join(native.directory,'keys/wrapping-key.bin'),32],[join(native.directory,'keys/provider-keys.aead'),8192]])files.set(path,{max,digest:await hashPagedSourcePrivateFileV4(path,max)});
  const epochPath=join(native.directory,'source-operations/financial-epochs.vault');files.set(epochPath,{max:2097152,digest:await optionalHash(epochPath,2097152),optional:true});
  const source=await readPagedSourcePrivateJSONV4(join(native.directory,'source-operations/native-wallet.json'),33554432),sourceRows=source.data.operations;
  assert.equal(jsonSHA(sourceRows),native.source.checkpoint.dataSHA256,'SEPOLIA_DEFI_READ_SOURCE_HIGHWATER');
  const supervisorPath=join(locator.directory,'defi-supervisor.vault');await physical(supervisorPath);const supervisor=new Vault(supervisorPath),captured=await supervisor.read(password);
  assert.equal(captured.data.profile,PROFILE);assert.equal(captured.data.phase,'CAPTURED','SEPOLIA_DEFI_READ_CAPTURE_REQUIRED');assert.deepEqual(captured.data.binding,locator.binding,'SEPOLIA_DEFI_READ_ROOT_BINDING');assert.ok(captured.data.snapshot);
  const retained=await load(locator.directory,password,captured.data.snapshot,locator.binding);assert.ok(retained.authorities.length>=1&&retained.authorities.length<=4,'SEPOLIA_DEFI_READ_ACCOUNT_BOUND');
  rpc=await createOriginalPagedSepoliaRpcV4(native.source.configuration.receiver);
  async function frozenSource(){
   assert.ok(!closed,'SEPOLIA_DEFI_READ_CLOSED');assert.deepEqual(await M.readOriginalPagedCapturedSepoliaDefiReadV8(reader),root,'SEPOLIA_DEFI_READ_ROOT_CHANGED');
   for(const [path,row]of files)assert.equal(await(row.optional?optionalHash(path,row.max):hashPagedSourcePrivateFileV4(path,row.max)),row.digest,'SEPOLIA_DEFI_READ_SOURCE_CHANGED');
   await physical(supervisorPath);assert.deepEqual(await supervisor.read(password),captured,'SEPOLIA_DEFI_READ_SUPERVISOR_HIGHWATER');assert.deepEqual(await load(locator.directory,password,captured.data.snapshot,locator.binding),retained,'SEPOLIA_DEFI_READ_SNAPSHOT_HIGHWATER');
  }
  async function current(row){
   await frozenSource();await physical(row.anchor.journalPath);await physical(row.anchor.adapterCheckpoint.path);
   assert.deepEqual(await row.journal.read(row.password),row.anchor.journalRecord,'SEPOLIA_DEFI_READ_AUTHORITY_HIGHWATER');assert.deepEqual(await row.adapter.read(row.adapterPassword),row.anchor.adapterRecord,'SEPOLIA_DEFI_READ_ACTIONS_HIGHWATER');assert.ok(!closed);
  }
  async function targetCurrent(row,head,initial=false){
   const saved=row.target,rows=sourceRows.filter(r=>r.profile===DEFI_TARGET_ROW_V8&&r.command.plan.planSHA256===saved.plan.planSHA256);
   assert.equal(rows.length,7,'SEPOLIA_DEFI_READ_ORIGINAL_INITIALIZATION_SET');assert.equal(saved.receipts.length,7);
   if(initial)for(let i=0;i<7;i++){
    const sourceRow=rows.find(r=>r.command.index===i),receipt=saved.receipts[i];assert.ok(sourceRow&&sourceRow.signed&&sourceRow.receipt&&sourceRow.phase==='FINALIZED','SEPOLIA_DEFI_READ_FINALIZED_TARGET');
    assert.equal(validateSepoliaDefiInitializationDataV8(sourceRow.command,locator.binding.account),row.anchor.protocol);assert.deepEqual(sourceRow.command.plan,saved.plan);assert.deepEqual(sourceRow.receipt,receipt);assert.equal(sourceRow.signed.nativeId,receipt.transactionHash);
    assert.deepEqual(await rpc.runtime.receipt(receipt.transactionHash),receipt,'SEPOLIA_DEFI_READ_TARGET_RECEIPT');assert.equal(receipt.status,'0x1');assert.ok(BigInt(receipt.blockNumber)<=BigInt(head.number));
    const tx=await rpc.runtime.transaction(receipt.transactionHash),request=sourceRow.command.request;assert.ok(tx&&tx.from===locator.binding.account);assert.equal(tx.to,sourceRow.command.kind==='CREATE'?null:request.to);assert.equal(tx.input,sourceRow.command.kind==='CREATE'?request.creation:request.data);assert.equal(BigInt(tx.nonce),BigInt(request.nonce));assert.equal(BigInt(tx.value),0n);
   }
   await Promise.all(saved.plan.constructors.map(async constructor=>assert.equal(await rpc.runtime.code(constructor.expectedAddress,head.number),constructor.expectedCode,'SEPOLIA_DEFI_READ_TARGET_CODE')));
   await rpc.runtime.assertCanonical(head);
  }
  for(const anchor of retained.authorities){
   const descriptor=P.normalizeExternalFlatDescriptorV1(anchor.descriptor),target=retained.targets[anchor.protocol];assert.ok(target?.system,'SEPOLIA_DEFI_READ_FINALIZED_TARGET_REQUIRED');assert.ok(root.principals.some(p=>p.origin===descriptor.origin&&p.devicePublicKey===descriptor.devicePublicKey),'SEPOLIA_DEFI_READ_SAME_ORIGINAL_PRINCIPAL');assert.ok(!accounts.has(descriptor.pairingId),'SEPOLIA_DEFI_READ_DUPLICATE_ACCOUNT');assert.equal(target.plan.planSHA256,anchor.targetPlanSHA256);assert.equal(target.plan.uniswapTargetPlanSHA256,locator.binding.uniswapTargetPlanSHA256);
   const pool=target.system.target.pools[1],terms=descriptor.poolTerms;assert.deepEqual(terms,{pool:bare(pool.address),poolCodeHash:bare(pool.codeHash),scope:pool.domain.scope,policy:pool.domain.policy,assetIdentity:bare(pool.assetIdentity),asset:bare(pool.asset),assetCodeHash:bare(pool.assetCodeHash),genesis:root.uniswapTarget.system.rules[0].genesis,domainCommitment:bare(pool.domainCommitment),hub:bare(target.system.target.hub.address),hubCodeHash:bare(target.system.target.hub.codeHash),hubDomain:pool.domain.hubDomain,ledgerNamespace:pool.domain.ledgerNamespace},'SEPOLIA_DEFI_READ_DESCRIPTOR_TARGET');
   const expectedPath=join(dirname(locator.directory),'accounts',anchor.protocol==='AAVE_STATIC'?'aave':'morpho-v2','authority','journal.vault');assert.equal(anchor.journalPath,expectedPath,'SEPOLIA_DEFI_READ_FIXED_JOURNAL');assert.equal(anchor.adapterCheckpoint.path,join(dirname(expectedPath),'defi-actions-'+descriptor.pairingId,anchor.protocol==='AAVE_STATIC'?'aave-operations.aead':'morpho-v2-operations.aead'),'SEPOLIA_DEFI_READ_FIXED_ADAPTER');
   const accountPassword=sha('LIANUM/PUBLIC/SEPOLIA/DEFI/AUTHORITY/V8\0'+password+'\0'+anchor.protocol+'\0'+descriptor.devicePublicKey),adapterPassword=sha('LIANUM/SEPOLIA/DEFI/ACTIONS/4\0'+accountPassword+'\0'+descriptor.pairingId);
   assert.equal(anchor.journalRecord.revision,anchor.journalRevision);assert.equal(jsonSHA(anchor.journalRecord.data),anchor.journalDataSHA256);assert.equal(anchor.adapterRecord.revision,anchor.adapterCheckpoint.revision);assert.equal(jsonSHA(anchor.adapterRecord.data),anchor.adapterCheckpoint.dataSHA256);
   const row={anchor,descriptor,target,password:accountPassword,adapterPassword,journal:new Vault(anchor.journalPath),adapter:new Vault(anchor.adapterCheckpoint.path),key:key(descriptor)};accounts.set(descriptor.pairingId,row);for(const path of [anchor.journalPath,anchor.adapterCheckpoint.path])files.set(path,{max:2097152,digest:await hashPagedSourcePrivateFileV4(path,2097152)});await current(row);
   await validateOriginalDeviceSepoliaDefiRecoveryDataV8(anchor.journalRecord,anchor.adapterRecord,{descriptor,protocol:anchor.protocol,target:target.system,policy:native.source.configuration.policy,deployment:root.deployment.system,rpc:rpc.runtime});
   const head=await rpc.runtime.block('finalized');await targetCurrent(row,head,true);await current(row);
  }
  function queue(fn){assert.ok(!closed,'SEPOLIA_DEFI_READ_CLOSED');assert.ok(queued<8,'SEPOLIA_DEFI_READ_QUEUE_BOUND');queued++;const task=work.then(()=>{assert.ok(!closed,'SEPOLIA_DEFI_READ_CLOSED');return fn();}).finally(()=>queued--);work=task.catch(()=>{});return task;}
  function fresh(grant){P.validateExternalFlatFreshV1(grant.access);assert.ok(performance.now()<grant.deadline,'SEPOLIA_DEFI_READ_ACCESS_EXPIRED');}
  function consume(row,raw){const access=P.normalizeExternalFlatAccessV1(raw.access),grant=challenges.get(access.challengeId);assert.ok(grant&&grant.pairingId===row.descriptor.pairingId,'SEPOLIA_DEFI_READ_ORIGINAL_ACCESS');challenges.delete(access.challengeId);assert.deepEqual(access,grant.access,'SEPOLIA_DEFI_READ_ACCESS_BINDING');fresh(grant);const sig=P.normalizeExternalFlatSignatureV1(raw.signature);assert.ok(verify('sha256',P.externalFlatPermissionMessageV1(access),{key:row.key,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'hex')),'SEPOLIA_DEFI_READ_DEVICE_POP');return grant;}
  async function financial(row,q){
   const job=row.anchor.journalRecord.data.jobs.find(job=>job.jobId===q.jobId&&job.reviewReference===q.reference);assert.ok(job,'SEPOLIA_DEFI_READ_ORIGINAL_JOB');const kind=job.mode==='deposit_intent'?'INVEST':job.redemption?.dispatchLatched?'REDEEM':'WITHDRAW',rows=sourceRows.filter(r=>r.profile===DEFI_COMMAND_ROW_V8&&r.command.grant.descriptor.pairingId===row.descriptor.pairingId&&r.command.grant.jobId===q.jobId&&r.command.grant.review.reference===q.reference&&r.command.grant.kind===kind);assert.ok(rows.length<=1,'SEPOLIA_DEFI_READ_FINANCIAL_ALIAS');
   const sourceRow=rows[0],retainedHash=(kind==='REDEEM'?job.redemption:job.submission)?.transactionHash??null;let phase=job.stage==='PROVED'&&!sourceRow?'PREPARED':'UNKNOWN',transactionHash=sourceRow?.signed?.nativeId??retainedHash,canonical=false;
   if(retainedHash&&sourceRow?.signed)assert.equal(retainedHash,sourceRow.signed.nativeId,'SEPOLIA_DEFI_READ_SAME_ORIGINAL_HASH');
   if(sourceRow?.signed){
    const grant=sourceRow.command.grant;assert.equal(sourceRow.command.targetPlanSHA256,row.target.plan.planSHA256);assert.deepEqual(grant.descriptor,row.descriptor);assert.equal(grant.protocol,row.anchor.protocol);assert.equal(grant.data,sourceRow.transaction.calldata);assert.equal(grant.to,sourceRow.transaction.to);
    const tx=await rpc.runtime.transaction(transactionHash),receipt=await rpc.runtime.receipt(transactionHash);
    if(tx){assert.equal(tx.hash,transactionHash);assert.equal(tx.from,locator.binding.account);assert.equal(tx.to,grant.to);assert.equal(tx.input,grant.data);assert.equal(BigInt(tx.value),0n);assert.equal(BigInt(tx.nonce),BigInt(sourceRow.transaction.nonce));phase='SUBMITTED';}
    if(receipt){assert.ok(tx,'SEPOLIA_DEFI_READ_RECEIPT_ORIGINAL_TRANSACTION');assert.equal(receipt.transactionHash,transactionHash);assert.equal(tx.blockHash,receipt.blockHash);assert.equal(tx.blockNumber,receipt.blockNumber);if(sourceRow.receipt)assert.deepEqual(receipt,sourceRow.receipt);const finalized=await rpc.runtime.block('finalized');await rpc.runtime.assertCanonical(finalized);if(receipt.status==='0x1'&&BigInt(receipt.blockNumber)<=BigInt(finalized.number)){phase='CONFIRMED';canonical=true;}else if(receipt.status==='0x0')phase='UNKNOWN';}
   }
   return normalizeDeviceSepoliaDefiFinancialStatusV7({jobId:q.jobId,reference:q.reference,phase,transactionHash,canonical,protocol:row.anchor.protocol,kind});
  }
  const handle=Object.freeze(Object.create(null));issuers.set(handle,{accounts,close,reader,dispatch(pairingId,action,body){const row=accounts.get(pairingId);assert.ok(row,'SEPOLIA_DEFI_READ_ORIGINAL_PAIRING');assert.ok(['challenge','status','read-review','financial-observe'].includes(action),'SEPOLIA_DEFI_READ_ONLY');return queue(async()=>{
   if(action==='challenge'){P.externalFlatExactV1(body,[]);await current(row);for(const [id,v]of challenges)if(v.access.expiresAt<=Date.now()||v.deadline<=performance.now())challenges.delete(id);assert.ok(challenges.size<16,'SEPOLIA_DEFI_READ_CHALLENGE_BOUND');const access=P.normalizeExternalFlatAccessV1({profile:row.descriptor.profile,action:'ACCESS',origin:row.descriptor.origin,pairingId,devicePublicKey:row.descriptor.devicePublicKey,challengeId:randomBytes(32).toString('hex'),nonce:randomBytes(32).toString('hex'),expiresAt:Date.now()+15000});challenges.set(access.challengeId,{access,pairingId,deadline:performance.now()+15000});return access;}
   const q=P.externalFlatExactV1(body,['access','signature',...(action==='read-review'?['reference']:action==='financial-observe'?['reference','jobId']:[])]),grant=consume(row,q);await current(row);let result;
   if(action==='status'){const head=await rpc.runtime.block('finalized');await targetCurrent(row,head);const view=await readSepoliaDefiSharesLedgerDataV4(rpc.runtime,row.target.system,head);result=readDeviceNoteStatusV1(row.descriptor,row.anchor.journalRecord.data,{head:{number:BigInt(head.number).toString(),hash:bare(head.hash),timestamp:BigInt(head.timestamp).toString()},ledger:{...view,commitments:view.commitments.map(c=>'0x'+c),nullifiers:view.nullifiers.map(c=>'0x'+c)}},true);}
   else if(action==='read-review'){P.externalFlatHexV1(q.reference);const review=row.anchor.journalRecord.data.reviews.find(r=>r.challenge.review.reference===q.reference);result={reference:q.reference,state:review?'AUTHORIZED':'NOT_ISSUED',review:review?copy(review.challenge.review):null};}
   else{P.externalFlatHexV1(q.reference);P.externalFlatHexV1(q.jobId);const head=await rpc.runtime.block('finalized');await targetCurrent(row,head);result=await financial(row,q);}
   await current(row);fresh(grant);return result;
  });}});return handle;
 }catch(error){await close();throw error;}
}
export function readOriginalPagedCapturedSepoliaDefiAccountsV8(handle){assert.equal(arguments.length,1);const s=issuers.get(handle);assert.ok(s,'SEPOLIA_DEFI_READ_ORIGINAL_ISSUER');return publicAccounts(s.accounts);}
export function dispatchOriginalPagedCapturedSepoliaDefiReadV8(handle,pairingId,action,body){assert.equal(arguments.length,4);const s=issuers.get(handle);assert.ok(s,'SEPOLIA_DEFI_READ_ORIGINAL_ISSUER');return s.dispatch(pairingId,action,body);}
export async function closeOriginalPagedCapturedSepoliaDefiReadV8(handle){assert.equal(arguments.length,1);const s=issuers.get(handle);issuers.delete(handle);await s?.close();}

/** Dedicated Source7 READ_CHANNEL child. It cannot be consumed financially. */
export async function issueOriginalPagedCapturedSepoliaDefiSourceReadV8(handle){assert.equal(arguments.length,1);const s=issuers.get(handle);assert.ok(s,'SEPOLIA_DEFI_READ_ORIGINAL_ISSUER');return M.issueOriginalPagedCapturedSepoliaDefiSourceReadV8(s.reader);}
