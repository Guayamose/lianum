/** Proof work after the graph owner's original consent/quote lookup. No
 * challenge map, issuer or private preparation registry is created here. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
/** @param {unknown} value @param {string} code @returns {asserts value} */
const need=(value,code)=>assert.ok(value,code);
/** @param {Uint8Array} value */
const hash=value=>createHash('sha256').update(value).digest('hex');
/** @param {string} value */
const bare=value=>value.slice(2);
/** @typedef {import('./device-graph-proof-retention-v1.mjs').ProofResult} ProofResult */
/** @typedef {{root:string,index:number,leaf:string,siblings:string[]}} Path */
/** @typedef {{jobId:string,challengeId:string,depositJobId:string,rootId:string,noteRevision:number,recipient:string,statement:Record<string,string>,path:Path,witnessSHA256:string}} Consent */
/** @typedef {{noteRole:string,consent:Consent}} Wrapper */
/** @typedef {{used:boolean,until:number,value:Wrapper}} Quote */
/** @typedef {{head:{timestamp:string},header:{number:string},ledger:{tree:{root:string,path:(index:number)=>Path}}}} View */
/** @typedef {{commitment:string,nullifier:string,amount:string}} Note */
/** @typedef {{rho:number[],key_x:number[],key_y:number[],secret:number[],amount:string,leaf_index:string,siblings:number[][]}} Witness */
/** @typedef {{noteRole:string,consent:Consent,stage:string,proof:null,proofSHA256:null,publicInputsSHA256:null,submission:null,observation:null}} AdmittedWithdrawal */
/** @template Row
 * @typedef {{quote:Quote|undefined,hasWithdrawal:()=>boolean,current:()=>Promise<View>,originalOutput:(view:View,role:string)=>Note,fresh:()=>void,admit:(withdrawal:AdmittedWithdrawal)=>Promise<unknown>,accept:(result:ProofResult,words:string[])=>Promise<Row>,poison:()=>void}} CommonPorts */
/** @param {Quote|undefined} quote @param {Consent} consent @param {boolean} hasWithdrawal @returns {asserts quote is Quote} */
function assertQuote(quote,consent,hasWithdrawal){need(quote&&!quote.used&&performance.now()<quote.until&&!hasWithdrawal,'DEVICE_EXTERNAL_GRAPH_OUTPUT_ORIGINAL_QUOTE');for(const key of /** @type {const} */ (['depositJobId','rootId','noteRevision','recipient','statement','path']))assert.deepEqual(consent[key],quote.value.consent[key]);}
/** @param {Wrapper} wrapper @returns {AdmittedWithdrawal} */
const admission=wrapper=>({noteRole:wrapper.noteRole,consent:structuredClone(wrapper.consent),stage:'PROVING',proof:null,proofSHA256:null,publicInputsSHA256:null,submission:null,observation:null});
/** @template Row
 * @param {Wrapper} wrapper @param {unknown} witness
 * @param {CommonPorts<Row> & {domain:{scope:string,policy:string},wallet:{normalize:(value:unknown)=>Witness,bytes:(value:Witness)=>Uint8Array,wipe:(value:Witness)=>void,publicWords:(value:Witness)=>bigint[],decode:(words:bigint[])=>Record<string,string>,commitment:(scope:string,policy:string,note:{type:number,rho:Buffer,x:Buffer,y:Buffer,value:string,secret:Buffer})=>Uint8Array,nullifier:(scope:string,commitment:string,secret:Buffer)=>Uint8Array},createProver:()=>{prove:(relation:string,witness:Witness,words:bigint[],label:string)=>Promise<ProofResult>,close:()=>Promise<unknown>}}} ports @returns {Promise<Row>} */
export async function proveDeviceGraphOutputWitnessV1(wrapper,witness,ports){
 const {consent:c,noteRole:role}=wrapper,q=ports.quote;assertQuote(q,c,ports.hasWithdrawal());q.used=true;
 const input=ports.wallet.normalize(witness),bytes=ports.wallet.bytes(input);let prover,started=false;
 try{
  need(hash(bytes)===c.witnessSHA256,'DEVICE_EXTERNAL_GRAPH_OUTPUT_WITNESS');const words=ports.wallet.publicWords(input),statement=ports.wallet.decode(words);
  for(const key of Object.keys(statement))assert.equal(['epoch','amount'].includes(key)?statement[key]:bare(statement[key]),c.statement[key],'DEVICE_EXTERNAL_GRAPH_OUTPUT_INPUTS');
  const cm=Buffer.from(ports.wallet.commitment(ports.domain.scope,ports.domain.policy,{type:4,rho:Buffer.from(input.rho),x:Buffer.from(input.key_x),y:Buffer.from(input.key_y),value:input.amount,secret:Buffer.from(input.secret)})).toString('hex'),nf=Buffer.from(ports.wallet.nullifier(ports.domain.scope,cm,Buffer.from(input.secret))).toString('hex'),view=await ports.current(),note=ports.originalOutput(view,role);
  need(cm===note.commitment&&nf===note.nullifier&&input.amount===note.amount&&c.statement.nullifier===nf&&c.path.root===bare(view.ledger.tree.root)&&c.statement.epoch===(BigInt(view.head.timestamp)/600n).toString(),'DEVICE_EXTERNAL_GRAPH_OUTPUT_PC23');
  const path=view.ledger.tree.path(c.path.index);assert.deepEqual({root:bare(path.root),index:path.index,leaf:bare(path.leaf),siblings:path.siblings.map(bare)},c.path);assert.equal(input.leaf_index,String(c.path.index));assert.deepEqual(input.siblings,c.path.siblings.map(value=>[...Buffer.from(value,'hex')]));
  ports.fresh();await ports.admit(admission(wrapper));started=true;ports.fresh();prover=ports.createProver();const result=await prover.prove('withdraw_balance',input,words,'device-external-graph-w39-'+role);
  return await ports.accept(result,words.map(String));
 }catch(error){if(started)ports.poison();throw error;}finally{bytes.fill(0);ports.wallet.wipe(input);await prover?.close();}
}
/** @typedef {{kind:string,jobId:string,consentSHA256:string,witnessSHA256:string}} Binding */
/** @typedef {{proveEncrypted:(packet:unknown,binding:Binding)=>Promise<ProofResult>,close:()=>Promise<unknown>}} PrivateClient */
/** @template Row
 * @param {Wrapper} wrapper @param {unknown} packet @param {PrivateClient} client
 * @param {CommonPorts<Row> & {permissionFrame:()=>Uint8Array,packet:(value:unknown)=>Record<string,unknown>,assertCurrent:(view:View)=>Promise<unknown>,derivation:(client:PrivateClient,result:ProofResult)=>{noteRole:string,jobId:string,commitment:string,nullifier:string,consentSHA256:string,witnessSHA256:string},publicWords:(statement:Record<string,string>)=>string[],release:()=>void}} ports @returns {Promise<Row>} */
export async function provePrivateDeviceGraphOutputV1(wrapper,packet,client,ports){
 const {consent:c,noteRole:role}=wrapper;let started=false;
 try{
  const quote=ports.quote;assertQuote(quote,c,ports.hasWithdrawal());
  const binding={kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,consentSHA256:hash(ports.permissionFrame()),witnessSHA256:c.witnessSHA256},input=ports.packet(packet);assert.deepEqual(input.authorization,binding);need(typeof input.ciphertext==='string'&&input.ciphertext.length<=16384,'DEVICE_EXTERNAL_GRAPH_OUTPUT_PRIVATE_BOUND');
  const before=await ports.current(),note=ports.originalOutput(before,role);need(c.statement.commitment===note.commitment&&c.statement.nullifier===note.nullifier&&c.statement.amount===note.amount&&c.path.root===bare(before.ledger.tree.root)&&c.statement.epoch===(BigInt(before.head.timestamp)/600n).toString(),'DEVICE_EXTERNAL_GRAPH_OUTPUT_PC23');
  const path=before.ledger.tree.path(c.path.index);assert.deepEqual({root:bare(path.root),index:path.index,leaf:bare(path.leaf),siblings:path.siblings.map(bare)},c.path);await ports.assertCurrent(before);ports.fresh();quote.used=true;
  await ports.admit(admission(wrapper));started=true;ports.fresh();const result=await client.proveEncrypted(packet,binding),derived=ports.derivation(client,result),words=ports.publicWords(c.statement);
  need(derived.noteRole===role&&derived.jobId===c.jobId&&derived.commitment===note.commitment&&derived.nullifier===note.nullifier&&derived.consentSHA256===binding.consentSHA256&&derived.witnessSHA256===c.witnessSHA256,'DEVICE_EXTERNAL_GRAPH_OUTPUT_PRIVATE_DERIVATION');
  return await ports.accept(result,words);
 }catch(error){if(started)ports.poison();throw error;}finally{ports.release();await client.close();}
}
