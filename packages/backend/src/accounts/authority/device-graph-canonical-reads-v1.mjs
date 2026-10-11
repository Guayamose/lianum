/** Canonical reads and terminal reconciliation for an already admitted graph.
 * The account owner supplies fixed journal/runtime ports and keeps all grants,
 * dispatch tokens and ownership maps. These mechanisms cannot admit a request. */
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
/** @param {unknown} value @param {string} code @returns {asserts value} */
const need=(value,code)=>assert.ok(value,code);
/** @param {string} value */
const bare=value=>value.slice(2);
/** @typedef {{blockNumber:string,blockHash:string,timestamp:string}} Observed */
/** @typedef {{root:string,index:number,leaf:string,siblings:string[]}} Path */
/** @typedef {{head:{number:string,hash:string,timestamp:string},ledger:{nullifiers:string[],commitments:string[],tree:{path(index:number):Path}}}} View */
/** @param {{head:{number:string,hash:string,timestamp:string}}} view @returns {Observed} */
const observed=view=>({blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp});
/** @typedef {{dispatchLatched:boolean,transactionHash:string|null,calldataSHA256:string,publicInputs:unknown,observation?:unknown}} SourceSubmission */
/** @typedef {{transaction:{hash:string},receipt:{blockHash:string},after:{timestamp:string}}} SourceTransaction */
/** @typedef {{domainCommitment:string,envelope:string,admissionTag:string}} ReservationStatement */
/** @typedef {ReservationStatement & {profile:string,transactionHash:string,blockHash:string,blockNumber:string,timestamp:string,sourceCommitment:string,sourceNullifier:string,changeCommitment:string,reserveCommitment:string,currentHead:Observed,changePath:Path,reservePath:Path}} SourceConfirmation */
/** @typedef {{jobId:string,stage:string,authorization:{publicInputs:unknown},submission:SourceSubmission|null,statement:{inputNullifier:string,inputCommitment:string,changeCommitment:string,reserveCommitment:string,settleBefore:string},observation:SourceConfirmation|null,graphDispatchLatched:boolean,recoveryLatched:boolean,graph:{stage:string,outcome:string|null,terminal:Terminal|null},errorCode:string|null}} SourceJob */
/** @typedef {{outcome:string,transactionHash:string,calldataSHA256:string,blockHash:string,blockNumber:string}} Terminal */
/** @typedef {{outcome:string,confirmation:{transactionHash:string,blockHash:string,blockNumber:string},calldataSHA256:string}} TerminalResult */
/** @typedef {{kind:'reservation'|'withdraw_source',identitySHA256:string,transactionHash:string|null,calldataSHA256:string}} TransactionQuery */
/** @template Row, Receipt
 * @typedef {{restored:boolean,identitySHA256:string,job:()=>SourceJob,readTransaction:(query:TransactionQuery)=>Promise<SourceTransaction|null>,validateObservation:(submission:SourceSubmission,authorization:unknown,observation:SourceTransaction)=>void,decodeAuthorization:(inputs:unknown)=>unknown,decodeReservation:(inputs:unknown)=>ReservationStatement,current:()=>Promise<View>,runtime:{receipt:(hash:string)=>Promise<Receipt|null>,checkReceipt:(receipt:Receipt)=>Promise<unknown>,assertCanonical:(receipt:Receipt)=>Promise<{number:string|number|bigint}>},reader:{assertCurrent:(view:View)=>Promise<unknown>},update:(fields:Partial<SourceJob>)=>Promise<unknown>,publicRow:(authorizationSHA256:string)=>Row}} SourceReadPorts */
/** @template Row, Receipt
 * @param {string} authorizationSHA256 @param {boolean} requireOriginal
 * @param {SourceReadPorts<Row,Receipt>} ports @returns {Promise<Row>} */
export async function observeDeviceGraphSourceV1(authorizationSHA256,requireOriginal,ports){
 const {restored,identitySHA256,job,readTransaction,validateObservation,decodeAuthorization,decodeReservation,current,runtime,reader,update,publicRow}=ports;const j=job();need(j.submission?.dispatchLatched,'DEVICE_EXTERNAL_GRAPH_SEND_NOT_ADMITTED');const s=j.submission;if(restored&&s.transactionHash===null){need(!requireOriginal,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_S_UNAVAILABLE');return publicRow(authorizationSHA256);}
  const o=await readTransaction({kind:'reservation',identitySHA256,transactionHash:s.transactionHash,calldataSHA256:s.calldataSHA256});if(o===null){need(!requireOriginal,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_S_UNAVAILABLE');return publicRow(authorizationSHA256);}
  validateObservation(s,decodeAuthorization(j.authorization.publicInputs),o);
  const v=await current();need(v.ledger.nullifiers.includes('0x'+j.statement.inputNullifier),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_SPEND');
  /** @param {string} cm */
  const pathFor=cm=>{const matches=v.ledger.commitments.flatMap((x,i)=>x==='0x'+cm?[i]:[]);need(matches.length===1,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_OUTPUT');const p=v.ledger.tree.path(matches[0]);return{root:bare(p.root),index:p.index,leaf:bare(p.leaf),siblings:p.siblings.map(bare)};};
  const receipt=await runtime.receipt('0x'+o.transaction.hash);need(receipt,'DEVICE_EXTERNAL_GRAPH_RECEIPT');await runtime.checkReceipt(receipt);const block=await runtime.assertCanonical(receipt),actual=decodeReservation(s.publicInputs);
  const confirmation={profile:'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1',transactionHash:o.transaction.hash,blockHash:o.receipt.blockHash,blockNumber:BigInt(block.number).toString(),timestamp:o.after.timestamp,
   sourceCommitment:j.statement.inputCommitment,sourceNullifier:j.statement.inputNullifier,changeCommitment:j.statement.changeCommitment,reserveCommitment:j.statement.reserveCommitment,
   domainCommitment:actual.domainCommitment,envelope:actual.envelope,admissionTag:actual.admissionTag,currentHead:observed(v),changePath:pathFor(j.statement.changeCommitment),reservePath:pathFor(j.statement.reserveCommitment)};
  if(j.observation!==null){
   /** @param {SourceConfirmation} confirmation */
   const immutable=({currentHead,changePath,reservePath,...value})=>value;
   assert.deepEqual(immutable(confirmation),immutable(j.observation),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_S_CHANGED');
   need(BigInt(confirmation.currentHead.blockNumber)>=BigInt(j.observation.currentHead.blockNumber)&&BigInt(confirmation.currentHead.timestamp)>=BigInt(j.observation.currentHead.timestamp),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_HEAD_REGRESSED');
   if(confirmation.currentHead.blockNumber===j.observation.currentHead.blockNumber)assert.equal(confirmation.currentHead.blockHash,j.observation.currentHead.blockHash,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_HEAD_CHANGED');
  }
  await reader.assertCurrent(v);
  if(!isDeepStrictEqual(j.observation,confirmation))await update({stage:'RESERVED',errorCode:null,observation:confirmation,submission:{...s,observation:o}});
  await reader.assertCurrent(v);return publicRow(authorizationSHA256);
 }

/** @template Draft, Row
 * @param {{draft:Draft & {action:string}}} c @param {string} authorizationSHA256
 * @param {{sameJob:(draft:Draft)=>SourceJob,current:()=>Promise<View>,update:(fields:Partial<SourceJob>)=>Promise<unknown>,execution:{execute:(jobId:string)=>Promise<TerminalResult>,recover:(jobId:string)=>Promise<TerminalResult>,reconcile:(jobId:string)=>Promise<TerminalResult>},observeS:(authorizationSHA256:string,requireOriginal:boolean)=>Promise<unknown>,job:()=>SourceJob,publicRow:(authorizationSHA256:string)=>Row}} ports @returns {Promise<Row>} */
export async function operateDeviceSourceGraphV1(c,authorizationSHA256,ports){
 const {sameJob,current,update,execution,observeS,job,publicRow}=ports;const j=sameJob(c.draft);need(j.stage==='RESERVED','DEVICE_EXTERNAL_GRAPH_S_REQUIRED');const action=c.draft.action;
  if(action==='EXECUTE_GRAPH'){need(!j.graphDispatchLatched&&j.graph.outcome===null,'DEVICE_EXTERNAL_GRAPH_RECONCILE_ONLY');await update({graphDispatchLatched:true,graph:{stage:'EXECUTION_UNKNOWN',outcome:null,terminal:null}});}
  if(action==='RECOVER_GRAPH'){need(!j.recoveryLatched&&j.graph.outcome===null,'DEVICE_EXTERNAL_GRAPH_RECONCILE_ONLY');const v=await current();need(BigInt(v.head.timestamp)>=BigInt(j.statement.settleBefore),'DEVICE_EXTERNAL_GRAPH_RECOVERY_BEFORE_CUTOFF');await update({recoveryLatched:true,graph:{stage:'RECOVERY_UNKNOWN',outcome:null,terminal:null}});}
  if(action==='RECONCILE_GRAPH')need(j.graphDispatchLatched||j.recoveryLatched,'DEVICE_EXTERNAL_GRAPH_NO_ORIGINAL_DISPATCH');
  const terminal=await execution[action==='EXECUTE_GRAPH'?'execute':action==='RECOVER_GRAPH'?'recover':'reconcile'](j.jobId);
  need(terminal&&['FULFILLED','RECOVERED'].includes(terminal.outcome),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_TERMINAL');
  const t={outcome:terminal.outcome,transactionHash:terminal.confirmation.transactionHash,calldataSHA256:terminal.calldataSHA256,blockHash:terminal.confirmation.blockHash,blockNumber:terminal.confirmation.blockNumber};
  // The original S receipt stays immutable; its current head and paths must
  // be read again after T/F before returning a response to a newer consent.
  await observeS(authorizationSHA256,true);const refreshed=job().observation;
  need(refreshed!==null&&BigInt(refreshed.currentHead.blockNumber)>=BigInt(t.blockNumber),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_TERMINAL_HEAD');
  await update({graph:{stage:t.outcome,outcome:t.outcome,terminal:t},errorCode:null});return publicRow(authorizationSHA256);
 }

/** @typedef {{dispatchLatched:boolean,transactionHash:string|null,calldataSHA256:string,observation?:unknown}} OutputSubmission */
/** @typedef {{transaction:{hash:string},receipt:{blockHash:string}}} OutputTransaction */
/** @typedef {{noteRole:string,stage:string,consent:{jobId:string,depositJobId:string,rootId:string,recipient:string,statement:{nullifier:string,commitment:string,amount:string}},proofSHA256:string|null,publicInputsSHA256:string|null,submission:OutputSubmission|null,observation:unknown}} OutputRow */
/** @template Row, Read
 * @param {OutputRow} r
 * @param {{restored:boolean,identitySHA256:string,profile:string,readTransaction:(query:TransactionQuery)=>Promise<OutputTransaction|null>,validateObservation:(submission:OutputSubmission,observation:OutputTransaction)=>void,currentOutputs:()=>Promise<Pick<View,'head'> & {ledger:{nullifiers:string[]}}>,assertCurrent:(view:Pick<View,'head'> & {ledger:{nullifiers:string[]}})=>Promise<unknown>,updateOutput:(role:string,fields:Partial<OutputRow>)=>Promise<unknown>,outputWithdrawal:(role:string)=>OutputRow,publicOutput:(row:OutputRow)=>Row,normalizeRead:(packet:{profile:string,result:Row,observed:Observed})=>Read,readProfile:string}} ports @returns {Promise<Row|Read>} */
export async function observeDeviceGraphOutputV1(r,ports){
 const {restored,identitySHA256,profile,readTransaction,validateObservation,currentOutputs,assertCurrent,updateOutput,outputWithdrawal,publicOutput,normalizeRead,readProfile}=ports;
 need(r.submission?.dispatchLatched,'DEVICE_EXTERNAL_GRAPH_OUTPUT_SEND_NOT_ADMITTED');const s=r.submission;if(restored&&s.transactionHash===null)return publicOutput(r);const o=await readTransaction({kind:'withdraw_source',identitySHA256,transactionHash:s.transactionHash,calldataSHA256:s.calldataSHA256});if(o===null)return publicOutput(r);validateObservation(s,o);const v=await currentOutputs();need(v.ledger.nullifiers.includes('0x'+r.consent.statement.nullifier),'DEVICE_EXTERNAL_GRAPH_OUTPUT_NOT_SPENT');await assertCurrent(v);const c=r.consent,confirmation={profile,jobId:c.jobId,depositJobId:c.depositJobId,rootId:c.rootId,commitment:c.statement.commitment,amount:c.statement.amount,recipient:c.recipient,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256,transactionHash:o.transaction.hash,calldataSHA256:s.calldataSHA256,receiptBlockHash:o.receipt.blockHash,observed:observed(v),status:'CONFIRMED',canonicalRpcVerifiedBy:'ORIGINAL_BACKEND_OBSERVER',mobileCanonicalRpcVerified:false};if(r.stage!=='CONFIRMED')await updateOutput(r.noteRole,{stage:'CONFIRMED',submission:{...s,transactionHash:o.transaction.hash,observation:o},observation:confirmation});return normalizeRead({profile:readProfile,result:publicOutput(outputWithdrawal(r.noteRole)),observed:observed(v)});}
