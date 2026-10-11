/** Proof verification and durable GRAPH journal records. These mechanisms
 * consume already admitted data; permissions, prover handles and dispatch
 * authority remain in the graph owner. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
/** @param {Uint8Array} value */
const hash=value=>createHash('sha256').update(value).digest('hex');
/** @typedef {{proof:string|Uint8Array,publicInputs:string[],metrics:{acceptedResult?:boolean,[key:string]:unknown},[key:string]:unknown}} ProofResult */
/** @typedef {{head:{timestamp:string},header:{number:string}}} OutputView */
/** @typedef {{label:string,relation:string,result:ProofResult}} ProofFrame */
/** @template Row
 * @param {{role:string,epoch:string,result:ProofResult,expectedPublicInputs:string[]}} input
 * @param {{currentOutputs:()=>Promise<OutputView>,originalOutput:(view:OutputView,role:string)=>unknown,verify:(relation:string,proof:Buffer,publicInputs:string[],block:string)=>Promise<boolean>,assertCurrent:(view:OutputView)=>Promise<unknown>,appendProof:(frame:ProofFrame)=>void,updateOutput:(role:string,fields:{stage:string,proof:{proof:string,publicInputs:string[]},proofSHA256:string,publicInputsSHA256:string})=>Promise<unknown>,publicOutput:()=>Row}} ports @returns {Promise<Row>} */
export async function retainVerifiedDeviceGraphOutputV1({role,epoch,result,expectedPublicInputs},ports){
 assert.ok(result.metrics.acceptedResult===true,'DEVICE_EXTERNAL_GRAPH_OUTPUT_PROOF_REJECTED');
 const proof={proof:typeof result.proof==='string'?result.proof:Buffer.from(result.proof).toString('hex'),publicInputs:[...result.publicInputs]};
 assert.deepEqual(proof.publicInputs,expectedPublicInputs);
 const after=await ports.currentOutputs();ports.originalOutput(after,role);
 assert.ok(epoch===(BigInt(after.head.timestamp)/600n).toString(),'DEVICE_EXTERNAL_GRAPH_OUTPUT_EPOCH');
 assert.equal(await ports.verify('withdraw_balance',Buffer.from(proof.proof,'hex'),proof.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),after.header.number),true,'DEVICE_EXTERNAL_GRAPH_OUTPUT_DEPLOYED_VERIFIER');
 await ports.assertCurrent(after);
 ports.appendProof({label:'device-external-graph-w39-'+role,relation:'withdraw_balance',result:structuredClone(result)});
 await ports.updateOutput(role,{stage:'PROVED',proof,proofSHA256:hash(Buffer.from(proof.proof,'hex')),publicInputsSHA256:hash(Buffer.from(JSON.stringify(proof.publicInputs)))});
 return ports.publicOutput();
}
/** @param {unknown} value @returns {asserts value is Record<string,unknown>} */
function record(value){assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_PROOF_METADATA');}
/** Preserve the full existing frame, including worker metrics, while encoding
 * binary proofs for retained JSON. No proof result is accepted by this codec.
 * @param {unknown[]} proofs @returns {string} */
export function serializeDeviceGraphProofFramesV1(proofs){
 const frames=JSON.stringify(proofs.map(frame=>{record(frame);const key=Object.hasOwn(frame,'result')?'result':'proof',value=frame[key];record(value);assert.ok(value.proof,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_PROOF_METADATA');
  assert.ok(typeof value.proof==='string'||value.proof instanceof Uint8Array,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_PROOF_METADATA');
  return{...structuredClone(frame),[key]:{...structuredClone(value),proof:typeof value.proof==='string'?value.proof:Buffer.from(value.proof).toString('hex')}};
 }));
 assert.ok(Buffer.byteLength(frames)<=2097152,'DEVICE_EXTERNAL_GRAPH_METADATA_BOUND');return frames;
}
/** @template Data, Preparation, Invoices, Proposal
 * @param {{directory:string,file:string,password:string,record:Data,preparation:Preparation,invoiceSignatures:Invoices,proposal:Proposal,proofs:unknown[]}} input
 * @param {{copy:<T>(value:T)=>T}} ports */
export function snapshotDeviceGraphRetentionV1(input,{copy}){
 const proofFrames=serializeDeviceGraphProofFramesV1(input.proofs);
 return{schema:'DEVICE_EXTERNAL_FLAT_GRAPH_PRIVATE_V1',directory:input.directory,file:input.file,password:input.password,record:copy(input.record),preparation:copy(input.preparation),invoiceSignatures:copy(input.invoiceSignatures),proposal:copy(input.proposal),proofFrames,proofFramesSHA256:hash(Buffer.from(proofFrames))};
}
/** Durable candidate precedes the physical CAS; confirmed retention follows
 * readback and physical checks. The owner keeps its poisoned/closed flags.
 * @template Data
 * @template {{revision:number,data:Data}} RecordValue
 * @param {(data:Data)=>Data} change
 * @param {{current:()=>RecordValue,copy:(data:Data)=>Data,healthy:()=>Promise<unknown>,persist:(candidate:{revision:number,data:Data}|null)=>Promise<unknown>,update:(revision:number,data:Data)=>Promise<RecordValue>,read:()=>Promise<RecordValue>,physical:()=>Promise<unknown>,accept:(record:RecordValue)=>void}} ports */
export async function saveDeviceGraphJournalV1(change,ports){
 await ports.healthy();const nextData=change(ports.copy(ports.current().data));
 await ports.persist({revision:ports.current().revision+1,data:nextData});
 const next=await ports.update(ports.current().revision,nextData);
 assert.equal(next.revision,ports.current().revision+1);assert.deepEqual(await ports.read(),next);
 await ports.physical();ports.accept(next);await ports.persist(null);
}
/** The owner checks the original retained handle and idle state before this
 * value comparison. A changed record cannot be adopted through a checkpoint.
 * @template Identity
 * @param {unknown} seed @param {{candidate:unknown,confirmed:unknown}} privateState
 * @param {Identity} identity @param {{copy:<T>(value:T)=>T,sha:(value:unknown)=>string}} ports */
export function verifyDeviceGraphRetainedCheckpointV1(seed,privateState,identity,{copy,sha}){
 assert.ok(privateState.candidate===null,'DEVICE_EXTERNAL_GRAPH_SOURCE_PENDING');assert.deepEqual(privateState.confirmed,seed,'DEVICE_EXTERNAL_GRAPH_SOURCE_CHECKPOINT');
 return{slot:'wallet-graph-keeper-0',identity:copy(identity),stateSHA256:sha(privateState)};
}
