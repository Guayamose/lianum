/** Original device ERC20 source U/S and the existing flat GRAPH keeper.
 * The device's original D26 account supplies the source. Its opening is used
 * only by the original ephemeral owner prover; no Linux owner or key adoption.
 * Account and graph CAS latches precede work and each possible native effect. */
import assert from 'node:assert/strict';
import {randomBytes,createHash,createPublicKey,verify} from 'node:crypto';
import {types} from 'node:util';
import {mkdtemp,chmod,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {Vault} from '../../../../engine/src/crypto/vault.mjs';
import {canonical} from '../../../../engine/src/crypto/privacy.mjs';
import {compileFundedGraph,attachFundedSignatures,ownerAuthorizationMessage} from '../../../../engine/src/execution/graph/funded-graph.mjs';
import {walletNoteCommitment} from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {nullifier as noteNullifier} from '../../../../engine/src/notes/private-note-encoding.mjs';
import {validateGenericBalanceNativePreparation,genericBalanceNativeTerms} from '../../../../engine/src/execution/balances/generic-balance-native-preparation.mjs';
import {reserveProjection} from '../../../../engine/src/execution/local/local-ledger.mjs';
import {buildAuthorizedEnvelope} from '../../../../custody/src/signing/authorized-envelope.mjs';
import {flatOwnerIdentity,ownerDigest} from '../../../../custody/src/signing/flat-owner-custody.mjs';
import {createFlatOwnerObserver,assertOwnedFlatOwnerObserver} from '../../../../custody/src/observers/flat-owner-observer.mjs';
import {createRoleProofClient} from '../../../../proofs/src/jobs/role-client.mjs';
import {createFlatProofRunner,withFlatHash} from '../../../../proofs/src/tooling/scoped-proof-tools.mjs';
import {encodeStatement,decodeStatement} from '../../execution/encoding/statements.mjs';
import {reservationWitness} from '../../execution/account/preparation/funding-inputs.mjs';
import {encodeFlatTransaction} from '../../execution/encoding/transaction-codec.mjs';
import {createFlatSystemStateReader} from '../../execution/account/reconciliation/flat-system-state.mjs';
import {assertOwnedFlatNativeExecution} from '../../execution/account/execution/flat-native-execution.mjs';
import {assertOwnedFlatSystem} from '../../operations/deployments/system/deploy-system.mjs';
import {assertLocalEvm} from '../../chains/evm/runtime/local-evm-ownership.mjs';
import {assertOwnedPoolAsset} from '../../chains/shared/contracts/owned-pool-asset.mjs';
import {flatAccountGraphBinding,flatAccountCalldataHash,validateFlatAccountOwnerObservation} from './flat-account-validation.mjs';
import {assertOriginalDeviceExternalFlatNoteAuthorityV1,readOriginalDeviceExternalFlatSourceSubjectV1,
 latchOriginalDeviceExternalFlatSourceGraphV1,releaseOriginalDeviceExternalFlatSourceGraphV1} from './device-external-flat-note-authority-v1.mjs';
import {externalFlatExactV1,externalFlatPermissionMessageV1,validateExternalFlatFreshV1} from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
import * as P from '../../../../mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {normalizeDeviceReservationCapsuleOptionsV1} from '../../../../mobile-protocol/src/device-reservation-consent-v1.mjs';
import {assertOriginalDeviceExternalFlatGraphWorkspaceV1,prepareOriginalDeviceExternalFlatGraphWorkspaceV1} from '../../operations/local/device-external-flat-source-graph-service-v1.mjs';
const owned=new WeakMap(),claimed=new WeakSet(),copy=v=>JSON.parse(canonical(v)),hash=b=>createHash('sha256').update(b).digest('hex'),sha=v=>hash(Buffer.from(canonical(v))),id=()=>randomBytes(32).toString('hex'),bare=v=>v.slice(2);
const need=(v,c)=>assert.ok(v,c),exact=externalFlatExactV1;
function data(v){canonical(v);return v;}
function transport(r){return{proof:typeof r.proof==='string'?r.proof:Buffer.from(r.proof).toString('hex'),publicInputs:[...r.publicInputs]};}
export function assertOriginalDeviceExternalFlatSourceGraphV1(bridge,account){
 assert.equal(arguments.length,2);need(!types.isProxy(bridge),'DEVICE_EXTERNAL_GRAPH_ORIGINAL');const r=owned.get(bridge);
 need(r&&r.account===account,'DEVICE_EXTERNAL_GRAPH_ORIGINAL');r.live();return r.descriptor;
}
/** Read by the SAME source account during its admitted latch only. */
export function readOriginalDeviceExternalFlatSourceGraphClaimV1(bridge){
 assert.equal(arguments.length,1);need(!types.isProxy(bridge),'DEVICE_EXTERNAL_GRAPH_ORIGINAL');const r=owned.get(bridge);
 need(r&&r.claim!==null&&r.claimAdmitting,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_CLAIM');r.live();r.claimFresh();return Object.freeze(copy(r.claim));
}
/** Fixed private certificate exists only while a signed cancellation drains. */
export function readOriginalDeviceExternalFlatSourceGraphReleaseV1(bridge){
 assert.equal(arguments.length,1);need(!types.isProxy(bridge),'DEVICE_EXTERNAL_GRAPH_ORIGINAL');const s=owned.get(bridge);
 need(s&&s.releaseAdmitting&&s.release!==null,'DEVICE_EXTERNAL_GRAPH_RELEASE');s.live();s.releaseFresh();return Object.freeze(copy(s.release));
}
export function readOriginalDeviceExternalFlatSourceGraphProofsV1(bridge){
 assert.equal(arguments.length,1);const r=owned.get(bridge);need(r,'DEVICE_EXTERNAL_GRAPH_ORIGINAL');r.live();return r.proofs.map(v=>structuredClone(v));
}
export async function createOriginalDeviceExternalFlatSourceGraphV1(raw){
 assert.equal(arguments.length,1);need(raw&&typeof raw==='object'&&!types.isProxy(raw),'DEVICE_EXTERNAL_GRAPH_INPUT');
 // Resource refs are checked separately; canonical never sees capabilities.
 return create(raw);
}
async function create(raw){
 const q=exact(raw,['account','targetAccount','runtime','system','poolIndex','execution','workspace']);
 const {account,runtime,system,poolIndex,execution}=q;assertOwnedFlatSystem(runtime,system);await assertLocalEvm(runtime);
 assertOwnedFlatNativeExecution(execution,{runtime,system,poolIndex});need(poolIndex===0,'DEVICE_EXTERNAL_GRAPH_SOURCE_POOL');
 const descriptor=assertOriginalDeviceExternalFlatNoteAuthorityV1(account),pool=system.pools[poolIndex];
 assertOwnedPoolAsset(runtime,pool.assetCapability);need(pool.assetMetadata.kind==='ERC20','DEVICE_EXTERNAL_GRAPH_SOURCE_ERC20');
 const identity=flatOwnerIdentity({pool:bare(pool.address),domain:pool.domain,domainCommitment:bare(pool.domainCommitment),assetBinding:{token:bare(pool.assetMetadata.address),codeHash:bare(pool.assetMetadata.codeHash)}}),identitySHA256=ownerDigest(identity);
 for(const k of ['scope','policy'])assert.equal(descriptor.poolTerms[k],identity.domain[k]);assert.equal(descriptor.poolTerms.assetIdentity,identity.domain.asset);
 assert.equal(descriptor.poolTerms.pool,bare(pool.address));assert.equal(descriptor.poolTerms.domainCommitment,identity.domainCommitment);
 need(!claimed.has(account),'DEVICE_EXTERNAL_GRAPH_ONE_SOURCE_BRIDGE');claimed.add(account);
 assertOriginalDeviceExternalFlatGraphWorkspaceV1(q.workspace,{account,targetAccount:q.targetAccount});
 const workspace=q.workspace;
 let preparation=null,invoiceSignatures=null,providers=null,proposal=null;
 function installPrepared(original){data(original.preparation);data(original.invoiceSignatures);
 preparation=validateGenericBalanceNativePreparation(original.preparation);invoiceSignatures=original.invoiceSignatures.map(P.normalizeExternalFlatSignatureV1);
 for(const k of ['scope','policy','asset','hubDomain','registryCommitment'])assert.equal(preparation.config[k],identity.domain[k],'DEVICE_EXTERNAL_GRAPH_PREPARATION_DOMAIN');
 need(preparation.nodes.length===1&&invoiceSignatures.length===1,'DEVICE_EXTERNAL_GRAPH_ONE_DELIVERY');
 need(!types.isProxy(original.providers)&&Array.isArray(original.providers)&&Object.getPrototypeOf(original.providers)===Array.prototype&&original.providers.length===1&&Reflect.ownKeys(original.providers).length===2,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_PROVIDER');
 need(Object.getOwnPropertyDescriptor(original.providers,'0')?.enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(original.providers,'0'),'value'),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_PROVIDER');
 providers=original.providers.map(p=>{const v=exact(p,['slot','family','recipientIndex','rule','rulePath','deliveryRiskSalt','provider']);
  need(v.slot===0&&v.family==='3'&&v.recipientIndex===1&&!types.isProxy(v.provider),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_PROVIDER');
  need(Object.isFrozen(v.provider),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_PROVIDER');const {provider,...fields}=v;data(fields);
  assert.equal(v.deliveryRiskSalt,preparation.nodes[0].deliveryRiskSalt,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_RISK');
  const template=provider.offer().actionTemplate;for(const [k,value]of Object.entries(preparation.config.nodes[0].actionTemplate))assert.deepEqual(template[k],value,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_OFFER');
  assert.equal(template.settleBefore,preparation.config.settleBefore,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_OFFER');return Object.freeze({...copy(fields),provider});});
 proposal={scope:identity.domain.scope,policy:identity.domain.policy,asset:identity.domain.asset,...genericBalanceNativeTerms(preparation)};
 }
 const reader=await createFlatSystemStateReader({runtime,system,poolIndex}),observer=await createFlatOwnerObserver({runtime,system,poolIndex});
 const directory=await mkdtemp(join(runtime.metadata.scratchDirectory,'device-external-source-graph-'));await chmod(directory,0o700);
 const file=join(directory,'operations.vault'),vault=new Vault(file);let password=id(),record=await vault.create({schema:'ORIGINAL_DEVICE_EXTERNAL_FLAT_GRAPH_JOURNAL_V1',descriptor:copy(descriptor),identitySHA256,quote:null,job:null},password);
 assert.deepEqual(await vault.read(password),record);let closed=false,closing=false,poisoned=false,busy=false,work=null,activeOwner=null;
 const challenges=new Map(),grants=new WeakMap(),proofs=[];const proofRunner=createFlatProofRunner({onProof:async v=>proofs.push(structuredClone(v))});
 const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});
 const state={account,descriptor,proofs,claim:null,claimAdmitting:false,release:null,releaseAdmitting:false,claimFresh:null,releaseFresh:null,live};
 function live(){need(!closed&&!poisoned,'DEVICE_EXTERNAL_GRAPH_UNAVAILABLE');assert.deepEqual(assertOriginalDeviceExternalFlatNoteAuthorityV1(account),descriptor);
  assertOwnedFlatSystem(runtime,system);assertOwnedPoolAsset(runtime,pool.assetCapability);assertOwnedFlatNativeExecution(execution,{runtime,system,poolIndex});assertOwnedFlatOwnerObserver(observer,{runtime,system,poolIndex});}
 async function physical(){const [d,f]=await Promise.all([lstat(directory),lstat(file)]);need(d.isDirectory()&&!d.isSymbolicLink()&&d.uid===process.getuid()&&(d.mode&0o777)===0o700&&await realpath(directory)===directory,'DEVICE_EXTERNAL_GRAPH_STORAGE');need(f.isFile()&&!f.isSymbolicLink()&&f.nlink===1&&f.uid===process.getuid()&&(f.mode&0o777)===0o600&&await realpath(file)===file,'DEVICE_EXTERNAL_GRAPH_STORAGE');}
 async function healthy(){live();await physical();await assertLocalEvm(runtime);assert.deepEqual(await vault.read(password),record,'DEVICE_EXTERNAL_GRAPH_JOURNAL_CHANGED');await physical();live();}
 async function save(change){try{await healthy();const next=await vault.update(password,record.revision,d=>change(copy(d)));assert.equal(next.revision,record.revision+1);assert.deepEqual(await vault.read(password),next);await physical();record=next;}catch(e){poisoned=true;throw e;}}
 const update=fields=>save(d=>({...d,job:{...d.job,...copy(fields)}}));
 const observed=v=>({blockNumber:v.head.number,blockHash:v.head.hash,timestamp:v.head.timestamp});
 const snapshot=v=>({identitySHA256,blockHash:v.head.hash,canonicalBlockHashBefore:v.head.hash,canonicalBlockHashAfter:v.head.hash,timestamp:v.head.timestamp,...Object.fromEntries(['rawState','rawHistory','rawBacking'].map(k=>[k,v.poolObservation[k]]))});
 async function current(){await healthy();const v=await reader.read();await reader.assertCurrent(v);live();return v;}
 function run(fn){live();need(!closing&&!busy,'DEVICE_EXTERNAL_GRAPH_BUSY');busy=true;work=(async()=>{try{await healthy();return await fn();}finally{busy=false;work=null;}})();return work;}
 function permission(value,access=false){for(const [k,r]of challenges)if(r.used||r.until<=performance.now())challenges.delete(k);need(challenges.size<16,'DEVICE_EXTERNAL_GRAPH_CHALLENGES');
  const v=(access?P.normalizeExternalFlatAccessV1:P.normalizeExternalFlatGraphConsentV1)({...value,challengeId:id(),nonce:id(),expiresAt:Date.now()+15000});challenges.set(v.challengeId,{value:v,used:false,until:performance.now()+15000});return copy(v);}
 function authenticate(raw,signature,access=false){data(raw);const v=(access?validateExternalFlatFreshV1:P.validateExternalFlatGraphFreshV1)(raw),r=challenges.get(v.challengeId);
  need(r&&!r.used&&performance.now()<r.until,'DEVICE_EXTERNAL_GRAPH_PERMISSION');assert.deepEqual(v,r.value,'DEVICE_EXTERNAL_GRAPH_PERMISSION');
  const sig=P.normalizeExternalFlatSignatureV1(signature),frame=access?externalFlatPermissionMessageV1(v):P.externalFlatGraphPermissionMessageV1(v);
  try{need(verify('sha256',frame,{key,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'hex')),'DEVICE_EXTERNAL_GRAPH_DEVICE_SIGNATURE');}finally{frame.fill(0);}r.used=true;grants.set(v,r);return v;}
 function freshGrant(v){const g=grants.get(v);need(g&&g.used&&performance.now()<g.until&&Date.now()<v.expiresAt,'DEVICE_EXTERNAL_GRAPH_PERMISSION_EXPIRED');if(v.action==='ACCESS')validateExternalFlatFreshV1(v);else P.validateExternalFlatGraphFreshV1(v);live();}
 async function subject(depositJobId,rootId){const s=await readOriginalDeviceExternalFlatSourceSubjectV1(account,{runtime,system,poolIndex,depositJobId,rootId});assert.deepEqual(s.descriptor,descriptor);assert.deepEqual(s.identity,identity);return s;}
 function job(){need(record.data.job,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_JOB');return record.data.job;}
 function fields(j){return Object.fromEntries(['depositJobId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256'].map(k=>[k,copy(j[k])]));}
 function outputRows(view){
  const j=job();if(j.stage!=='RESERVED'||j.observation===null)return[];
  need(view.ledger.nullifiers.includes('0x'+j.statement.inputNullifier),'DEVICE_EXTERNAL_GRAPH_OUTPUT_ORIGINAL_S');
  const p=view.ledger.publicState,held=String(p.actualAssetBalance),liabilities=String(p.backedAmount),surplus=String(p.surplus);
  const healthyBacking=BigInt(held)>=BigInt(liabilities)&&BigInt(surplus)===BigInt(held)-BigInt(liabilities);
  const uncertain=['EXECUTION_UNKNOWN','RECOVERY_UNKNOWN'].includes(j.graph.stage);
  return ['change','recovery'].map(noteRole=>{
   const n=j.outputs[noteRole];let state='UNKNOWN';
   const matches=view.ledger.commitments.filter(cm=>cm==='0x'+n.commitment).length;
   const spent=n.nullifier!==null&&view.ledger.nullifiers.includes('0x'+n.nullifier);
   if(n.amount==='0')state='EMPTY';
   else if(!uncertain&&healthyBacking){
    if(noteRole==='change')state=matches===1?(spent?'SPENT':'UNSPENT'):'UNKNOWN';
    else if(j.graph.outcome==='RECOVERED')state=matches===1?(spent?'SPENT':'UNSPENT'):'UNKNOWN';
    else if(matches===0&&!spent)state=j.graph.outcome==='FULFILLED'?'UNISSUED':'LOCKED';
   }
   const available=state==='UNSPENT'&&BigInt(n.amount)<=BigInt(held)?n.amount:null;
   if(state==='UNSPENT'&&available===null)state='UNKNOWN';
   return{noteRole,...copy(n),state,available,
    backing:available===null?null:{held,liabilities,surplus,deficit:'0'}};
  });
 }
 function publicRow(authorizationSHA256,view=null){const j=job();return P.normalizeExternalFlatGraphRowV1({profile:P.DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor:copy(descriptor),reservation:{jobId:j.jobId,stage:j.stage,consentFields:fields(j),statement:copy(j.statement),observation:copy(j.observation),errorCode:j.errorCode,authorizationSHA256},graph:copy(j.graph),outputs:view?outputRows(view):[]});}
 function sameJob(d){const j=job();for(const k of ['depositJobId','rootId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256'])assert.deepEqual(d[k],j[k],'DEVICE_EXTERNAL_GRAPH_JOB_CHANGED');return j;}
 async function observeS(authorizationSHA256){const j=job();need(j.submission?.dispatchLatched,'DEVICE_EXTERNAL_GRAPH_SEND_NOT_ADMITTED');const s=j.submission;
  const o=await observer.readTransaction({kind:'reservation',identitySHA256,transactionHash:s.transactionHash,calldataSHA256:s.calldataSHA256});if(o===null)return publicRow(authorizationSHA256);
  validateFlatAccountOwnerObservation({identity,artifact:pool.artifact,submission:s,authorization:decodeStatement('authorization',j.authorization.publicInputs),observation:o});
  const v=await current();need(v.ledger.nullifiers.includes('0x'+j.statement.inputNullifier),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_SPEND');
  const pathFor=cm=>{const matches=v.ledger.commitments.flatMap((x,i)=>x==='0x'+cm?[i]:[]);need(matches.length===1,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_OUTPUT');const p=v.ledger.tree.path(matches[0]);return{root:bare(p.root),index:p.index,leaf:bare(p.leaf),siblings:p.siblings.map(bare)};};
  const receipt=await runtime.receipt('0x'+o.transaction.hash);need(receipt,'DEVICE_EXTERNAL_GRAPH_RECEIPT');await runtime.checkReceipt(receipt);const block=await runtime.assertCanonical(receipt),actual=decodeStatement('reservation',s.publicInputs);
  const confirmation={profile:'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1',transactionHash:o.transaction.hash,blockHash:o.receipt.blockHash,blockNumber:BigInt(block.number).toString(),timestamp:o.after.timestamp,
   sourceCommitment:j.statement.inputCommitment,sourceNullifier:j.statement.inputNullifier,changeCommitment:j.statement.changeCommitment,reserveCommitment:j.statement.reserveCommitment,
   domainCommitment:actual.domainCommitment,envelope:actual.envelope,admissionTag:actual.admissionTag,currentHead:observed(v),changePath:pathFor(j.statement.changeCommitment),reservePath:pathFor(j.statement.reserveCommitment)};
  if(j.observation===null)await update({stage:'RESERVED',errorCode:null,observation:confirmation,submission:{...s,observation:o}});await reader.assertCurrent(v);return publicRow(authorizationSHA256);
 }
 async function proveU(c,witness,authorizationSHA256){
  need(record.data.job===null,'DEVICE_EXTERNAL_GRAPH_SOURCE_ALREADY_ADMITTED');const q=record.data.quote;need(q,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_QUOTE');
  const d=c.draft;assert.equal(d.quoteId,q.quoteId);assert.equal(d.depositJobId,q.depositJobId);assert.equal(d.rootId,q.rootId);const source=await subject(d.depositJobId,d.rootId);
  const w=P.normalizeDeviceReservationWitnessV1(witness),bytes=P.deviceReservationWitnessBytesV1(w);let envelope,inputs,client;
  try{assert.equal(hash(bytes),d.witnessSHA256,'DEVICE_EXTERNAL_GRAPH_WITNESS_CHANGED');for(const k of Object.keys(proposal))assert.deepEqual(w.input[k],proposal[k],'DEVICE_EXTERNAL_GRAPH_PROPOSAL_CHANGED');
   assert.equal(w.input.inputNote.value,source.amount);assert.equal(d.custody.sourceCommitment,source.commitment);assert.equal(d.custody.sourceNullifier,source.nullifier);
   assert.equal(d.custody.rootId,source.rootId);assert.equal(d.custody.noteRevision,source.noteRevision);
   const capsules=normalizeDeviceReservationCapsuleOptionsV1({nodes:preparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),slotSalts:preparation.slotSalts});
   assert.deepEqual(w.envelopePreparation.capsuleOptions,capsules);assert.deepEqual(w.invoiceSignatures,invoiceSignatures);
   const compiled=compileFundedGraph(w.input),signed=attachFundedSignatures(compiled,{ownerSignature:w.ownerSignature,invoiceSignatures:w.invoiceSignatures});
   assert.deepEqual(compiled.authorizationStatement,d.statement,'DEVICE_EXTERNAL_GRAPH_STATEMENT_CHANGED');assert.equal(hash(ownerAuthorizationMessage(compiled.authorizationStatement)),d.custody.frameSHA256);
   const v=await current();need(BigInt(v.head.timestamp)>=BigInt(proposal.fundingNotBefore)&&BigInt(v.head.timestamp)<BigInt(proposal.fundingValidUntil),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_WINDOW');
   const outputs={};for(const [noteRole,note]of [['change',w.input.changeNote],['recovery',w.input.recoveryNote]]){
    const commitment=compiled.authorizationStatement[noteRole+'Commitment'];
    if(note.value==='0'){need(noteRole==='change','DEVICE_EXTERNAL_GRAPH_EMPTY_RECOVERY');outputs[noteRole]={amount:'0',commitment,nullifier:null};}
    else{assert.equal(walletNoteCommitment(identity.domain.scope,identity.domain.policy,note).toString('hex'),commitment,'DEVICE_EXTERNAL_GRAPH_OUTPUT_PC23');
     outputs[noteRole]={amount:note.value,commitment,nullifier:noteNullifier(identity.domain.scope,commitment,note.secret).toString('hex')};}
   }
   freshGrant(c);await save(old=>({...old,job:{...copy(d),outputs,stage:'PROVING',authorization:null,rolePackets:null,submission:null,observation:null,errorCode:null,graph:{stage:'PREPARED',outcome:null,terminal:null},graphDispatchLatched:false,recoveryLatched:false}}));
   state.claim={depositJobId:d.depositJobId,rootId:d.rootId,jobId:d.jobId,statementSHA256:sha(d.statement)};state.claimAdmitting=true;state.claimFresh=()=>freshGrant(c);
   try{await latchOriginalDeviceExternalFlatSourceGraphV1(account,bridge,{runtime,system,poolIndex,...state.claim});}finally{state.claimAdmitting=false;state.claimFresh=null;}
   freshGrant(c);envelope=await withFlatHash(hashFields=>buildAuthorizedEnvelope({signed,domain:identity.domain,...w.envelopePreparation},{hashFields}));inputs=envelope.ownerAuthorizationInputs();const statement=envelope.publicStatement(),rolePackets={};
   for(const k of ['reservation','recovery','assembler'])rolePackets[k]=envelope[k]().select();for(const k of ['local','dependency'])rolePackets[k]=Array.from({length:4},(_,i)=>envelope[k](i).select());
   envelope.destroy();envelope=null;freshGrant(c);client=createRoleProofClient('owner');activeOwner=client;const result=await client.prove({relation:'authorization',inputs,expectedPublicInputs:[...encodeStatement('authorization',statement)]}),authorization=transport(result),view=await current();
   assert.equal(await system.verify('authorization',Buffer.from(authorization.proof,'hex'),authorization.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),view.header.number),true,'DEVICE_EXTERNAL_GRAPH_DEPLOYED_U');
   flatAccountGraphBinding({authorization,rolePackets},identity);await reader.assertCurrent(view);proofs.push({label:'device-external-source-u',relation:'authorization',result:structuredClone(result)});
   await update({stage:'PROVED',authorization,rolePackets,proofSHA256:hash(Buffer.from(authorization.proof,'hex')),publicInputsSHA256:sha(authorization.publicInputs)});return publicRow(authorizationSHA256);
  }catch(e){if(record.data.job&&!poisoned)await update({stage:'FAILED',errorCode:'DEVICE_EXTERNAL_GRAPH_U_REJECTED'});throw e;}
  finally{bytes.fill(0);P.wipeDeviceReservationWitnessV1(w);envelope?.destroy();inputs=null;await client?.close();activeOwner=null;}
 }
 async function reserveS(c,authorizationSHA256){try{const j=sameJob(c.draft);need(j.stage==='PROVED'&&j.submission===null,'DEVICE_EXTERNAL_GRAPH_RECONCILE_ONLY');await subject(j.depositJobId,j.rootId);
  const prepared={authorization:j.authorization,rolePackets:j.rolePackets},binding=await execution.prepare(j.jobId,prepared,providers);assert.deepEqual(binding,flatAccountGraphBinding(prepared,identity));
  const before=await current(),packet=j.rolePackets.reservation,funding=packet.funding.value,index=before.ledger.commitments.indexOf('0x'+funding.inputCommitment);
  need(index>=0&&!before.ledger.nullifiers.includes('0x'+funding.inputNullifier),'DEVICE_EXTERNAL_GRAPH_SOURCE_NOT_UNSPENT');const path=before.ledger.tree.path(index);
  const proofJob=await withFlatHash(hashFields=>reservationWitness(packet,{inputRoot:bare(path.root),inputPath:{leaf:bare(path.leaf),index:path.index,siblings:path.siblings.map(bare)}},{hashFields}));
  await update({stage:'RESERVING',nativeBinding:binding});const proof=await proofRunner.prove('reservation',proofJob,'device-external-source-s'),v=await current();
  for(const k of ['publicState','commitments','nullifiers'])assert.deepEqual(v.ledger[k],before.ledger[k],'DEVICE_EXTERNAL_GRAPH_FRESH_S');need(BigInt(v.head.timestamp)>=BigInt(funding.fundingNotBefore)&&BigInt(v.head.timestamp)<BigInt(funding.fundingValidUntil),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_WINDOW');
  const projection=reserveProjection(before.ledger,'0x'+funding.reserveCommitment,'0x'+funding.changeCommitment),calldata=encodeFlatTransaction('reserveGenericGuarded',{authorization:j.authorization,reservation:proof,expectedSequence:projection.expectedSequence,expectedPostRoot:projection.expectedPostRoot});
  const submission={kind:'reservation',calldata,calldataSHA256:flatAccountCalldataHash(calldata),publicInputs:proof.publicInputs,statement:proofJob.statement,before:snapshot(v),epoch:null,transactionHash:null,dispatchLatched:true,ownerConfirmed:false,observation:null};
  await update({stage:'RESERVATION_UNKNOWN',submission});
  try{live();const receipt=await runtime.send('device-external-flat-source-reservation',{to:pool.address,data:calldata,value:'0'});await update({submission:{...submission,transactionHash:bare(receipt.transactionHash)}});return await observeS(authorizationSHA256);}
  catch(e){const tx=e.transactionRecord?.transactionHash;if(tx&&!poisoned)await update({submission:{...submission,transactionHash:bare(tx)}});throw e;}
 }catch(e){if(record.data.job?.submission===null&&!poisoned){try{await update({stage:'FAILED',errorCode:'DEVICE_EXTERNAL_GRAPH_S_REJECTED'});}catch{}}throw e;}
 }
 async function cancelGraph(c,authorizationSHA256){const j=sameJob(c.draft);need(j.stage==='FAILED'&&j.submission===null&&!j.graphDispatchLatched&&!j.recoveryLatched&&activeOwner===null,'DEVICE_EXTERNAL_GRAPH_NO_SOURCE_RELEASE');
  const original=await subject(j.depositJobId,j.rootId),view=await current();need(original.commitment===j.statement.inputCommitment&&original.nullifier===j.statement.inputNullifier&&!view.ledger.nullifiers.includes('0x'+j.statement.inputNullifier),'DEVICE_EXTERNAL_GRAPH_SOURCE_NOT_UNSPENT');freshGrant(c);
  await update({errorCode:'DEVICE_EXTERNAL_GRAPH_CANCEL_PENDING'});state.release={depositJobId:j.depositJobId,rootId:j.rootId,jobId:j.jobId,statementSHA256:sha(j.statement)};state.releaseAdmitting=true;state.releaseFresh=()=>freshGrant(c);
  try{freshGrant(c);await releaseOriginalDeviceExternalFlatSourceGraphV1(account,bridge,{runtime,system,poolIndex,...state.release});}finally{state.releaseAdmitting=false;state.release=null;state.releaseFresh=null;}
  await update({graph:{stage:'SOURCE_CANCELLED',outcome:null,terminal:null},errorCode:'DEVICE_EXTERNAL_GRAPH_CANCELLED'});return publicRow(authorizationSHA256);
 }
 async function graphOperation(c,authorizationSHA256){const j=sameJob(c.draft);need(j.stage==='RESERVED','DEVICE_EXTERNAL_GRAPH_S_REQUIRED');const action=c.draft.action;
  if(action==='EXECUTE_GRAPH'){need(!j.graphDispatchLatched&&j.graph.outcome===null,'DEVICE_EXTERNAL_GRAPH_RECONCILE_ONLY');await update({graphDispatchLatched:true,graph:{stage:'EXECUTION_UNKNOWN',outcome:null,terminal:null}});}
  if(action==='RECOVER_GRAPH'){need(!j.recoveryLatched&&j.graph.outcome===null,'DEVICE_EXTERNAL_GRAPH_RECONCILE_ONLY');const v=await current();need(BigInt(v.head.timestamp)>=BigInt(j.statement.settleBefore),'DEVICE_EXTERNAL_GRAPH_RECOVERY_BEFORE_CUTOFF');await update({recoveryLatched:true,graph:{stage:'RECOVERY_UNKNOWN',outcome:null,terminal:null}});}
  if(action==='RECONCILE_GRAPH')need(j.graphDispatchLatched||j.recoveryLatched,'DEVICE_EXTERNAL_GRAPH_NO_ORIGINAL_DISPATCH');
  const terminal=await execution[action==='EXECUTE_GRAPH'?'execute':action==='RECOVER_GRAPH'?'recover':'reconcile'](j.jobId);
  need(terminal&&['FULFILLED','RECOVERED'].includes(terminal.outcome),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_TERMINAL');
  const t={outcome:terminal.outcome,transactionHash:terminal.confirmation.transactionHash,calldataSHA256:terminal.calldataSHA256,blockHash:terminal.confirmation.blockHash,blockNumber:terminal.confirmation.blockNumber};
  await update({graph:{stage:t.outcome,outcome:t.outcome,terminal:t},errorCode:null});return publicRow(authorizationSHA256);
 }
 const bridge=Object.freeze({descriptor,
  challenge(){assert.equal(arguments.length,0);live();need(!closing,'DEVICE_EXTERNAL_GRAPH_CLOSED');return permission({profile:descriptor.profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey},true);},
  preparation(raw){assert.equal(arguments.length,1);return run(async()=>{const v=exact(raw,['access','signature','depositJobId','rootId','assetAmount','shareAmount','payoutAmount','validFrom','settleBefore']);const a=authenticate(v.access,v.signature,true);const s=await subject(v.depositJobId,v.rootId);need(record.data.job===null,'DEVICE_EXTERNAL_GRAPH_SOURCE_ALREADY_ADMITTED');
   freshGrant(a);installPrepared(await prepareOriginalDeviceExternalFlatGraphWorkspaceV1(workspace,bridge,Object.fromEntries(['assetAmount','shareAmount','payoutAmount','validFrom','settleBefore'].map(k=>[k,v[k]]))));
   const view=await current();need(BigInt(proposal.budget)<=BigInt(s.amount),'DEVICE_EXTERNAL_GRAPH_BUDGET');need(BigInt(view.head.timestamp)>=BigInt(proposal.fundingNotBefore)&&BigInt(view.head.timestamp)<BigInt(proposal.fundingValidUntil),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_WINDOW');
   let q=record.data.quote;if(q){assert.equal(q.depositJobId,s.depositJobId);assert.equal(q.rootId,s.rootId);}else{q={quoteId:id(),depositJobId:s.depositJobId,rootId:s.rootId};await save(d=>({...d,quote:q}));}
   freshGrant(a);return P.normalizeExternalFlatGraphQuoteV1({profile:P.DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor:copy(descriptor),quote:{version:1,profile:'LIANUM_DEVICE_ORIGINAL_US_QUOTE_V1',...Object.fromEntries(['origin','pairingId','devicePublicKey'].map(k=>[k,descriptor[k]])),...q,sourceCommitment:s.commitment,sourceNullifier:s.nullifier,poolTerms:{scope:identity.domain.scope,policy:identity.domain.policy,codeHash:descriptor.poolTerms.poolCodeHash,assetIdentity:identity.domain.asset,domainCommitment:identity.domainCommitment},proposal,capsuleOptions:normalizeDeviceReservationCapsuleOptionsV1({nodes:preparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),slotSalts:preparation.slotSalts}),invoiceSignatures,observed:observed(view),expiresAt:Math.min(a.expiresAt,Date.now()+15000)}});
  });},
  review(raw){assert.equal(arguments.length,1);return run(async()=>{const v=exact(raw,['access','signature','draft']);const a=authenticate(v.access,v.signature,true);const d=P.normalizeExternalFlatGraphDraftV1(v.draft),view=await current();if(d.action==='PROVE_U'){need(record.data.job===null,'DEVICE_EXTERNAL_GRAPH_SOURCE_ALREADY_ADMITTED');const q=record.data.quote;need(q&&d.quoteId===q.quoteId&&d.depositJobId===q.depositJobId&&d.rootId===q.rootId,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_QUOTE');const s=await subject(d.depositJobId,d.rootId);need(d.custody.sourceCommitment===s.commitment&&d.custody.sourceNullifier===s.nullifier&&d.custody.noteRevision===s.noteRevision,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_SOURCE');}else sameJob(d);
   freshGrant(a);return permission({profile:P.DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor:copy(descriptor),draft:d,observed:observed(view),openingDisclosure:d.action==='PROVE_U'?'ONE_FUNDED_OWNER_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER':null});});},
  operate(raw){assert.equal(arguments.length,1);return run(async()=>{const v=exact(raw,['consent','signature','witness']),c=authenticate(v.consent,v.signature),authorizationSHA256=hash(P.externalFlatGraphPermissionMessageV1(c));assert.deepEqual(c.descriptor,descriptor);const action=c.draft.action;
   if(action==='PROVE_U')return proveU(c,v.witness,authorizationSHA256);need(v.witness===null,'DEVICE_EXTERNAL_GRAPH_NO_PRIVATE_WITNESS');if(action==='RESERVE_S')return reserveS(c,authorizationSHA256);sameJob(c.draft);if(action==='OBSERVE_S'){const result=await observeS(authorizationSHA256);freshGrant(c);return result;}if(action==='CANCEL_GRAPH')return cancelGraph(c,authorizationSHA256);return graphOperation(c,authorizationSHA256);});},
  status(raw){assert.equal(arguments.length,1);return run(async()=>{const v=exact(raw,['access','signature']),a=authenticate(v.access,v.signature,true);
   if(record.data.job&&record.data.job.graph.outcome!==null){const j=job(),terminal=await execution.reconcile(j.jobId);
    assert.deepEqual({outcome:terminal.outcome,transactionHash:terminal.confirmation.transactionHash,calldataSHA256:terminal.calldataSHA256,blockHash:terminal.confirmation.blockHash,blockNumber:terminal.confirmation.blockNumber},j.graph.terminal,'DEVICE_EXTERNAL_GRAPH_OUTPUT_ORIGINAL_TERMINAL');}
   const view=await current();await reader.assertCurrent(view);freshGrant(a);const observedAt=Date.now();return P.normalizeExternalFlatGraphStatusV1({profile:P.DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor:copy(descriptor),jobs:record.data.job?[publicRow(hash(externalFlatPermissionMessageV1(a)),view)]:[],observed:observed(view),observedAt,expiresAt:observedAt+15000});});},
  close(){assert.equal(arguments.length,0);if(state.closeWork)return state.closeWork;closing=true;challenges.clear();const admitted=work;state.closeWork=(async()=>{await admitted?.catch(()=>{});await activeOwner?.close();await proofRunner.close();closed=true;password=null;return{closed:true,originalWorkDrained:true};})();return state.closeWork;},
 });owned.set(bridge,state);await physical();live();return bridge;
}
