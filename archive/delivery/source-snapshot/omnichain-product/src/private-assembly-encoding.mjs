/** PC18 exact-template proof schemas. No owner-independent arbitrary strategy claim. */
import assert from 'node:assert/strict';
import { bytes, hex32, sha256, wordsBE, graphWitness, certificateWitness, effectNullifier } from './private-note-encoding.mjs';
import { policyCommitment, localCommitment } from './private-note-encoding.mjs';
import { privateSpentDigest, privateEffectDigest } from './private-note-tree.mjs';
import { privateAssemblyRootHistoryDigest } from './private-assembly-history.mjs';
import { assertPrivateAssemblyRevocations } from './private-assembly-revocations.mjs';

export const ASSEMBLY_SCHEMAS = Object.freeze({
 authorization: 'PC18/static-funded-authorization/1', sol_join: 'PC18/authorized-sol-continuation/1',
 sol_local: 'PC18/local-fulfillment/SOL/1', btc_local: 'PC18/local-fulfillment/BTC/1',
 sol_ready: 'PC18/recursive-readiness/SOL/2', btc_ready: 'PC18/recursive-readiness/BTC/2',
});
export const ASSEMBLY_PUBLIC_WORDS = Object.freeze({ authorization:81, sol_join:100, sol_local:43, btc_local:43, sol_ready:61, btc_ready:79, fulfill:65, refund:41 });
export const ASSEMBLY_RECURSIVE_MODES = Object.freeze(['authorization','sol_local','btc_local','sol_join']);
export const ASSEMBLY_EVM_MODES = Object.freeze(['sol_ready','btc_ready','fulfill','refund']);
export const assemblySchema = name => { assert.ok(Object.hasOwn(ASSEMBLY_SCHEMAS,name)); return sha256(Buffer.from(ASSEMBLY_SCHEMAS[name],'ascii')); };
const raw = value => hex32(typeof value==='string'?value.replace(/^0x/,''):value);
const words = value => wordsBE(raw(value));
const padded = (entries,capacity) => { assert.ok(Array.isArray(entries)&&entries.length<=capacity); return [...entries.map(value=>bytes(raw(value))),...Array.from({length:capacity-entries.length},()=>Array(32).fill(0))]; };
export function assemblyPolicyWitness(policy){const out={minimum_btc_confirmations:String(policy.minimumBtcConfirmations)}; for(const c of ['sol','btc'])for(const [k,n]of [['policyId','policy_id'],['identityNamespace','namespace'],['genesis','genesis'],['x','issuer_x'],['y','issuer_y']])out[c+'_'+n]=bytes(raw(policy[c][k])); return out;}
export function assemblyAuthorizationInput(graph,tree,index=0){const path=tree.path(index);assert.equal(path.leaf,`0x${graph.reserved.toString('hex')}`,'PC18_RESERVED_PATH');return{schema:wordsBE(assemblySchema('authorization')),scope:wordsBE(graph.scope),policy:wordsBE(graph.policy),root:words(path.root),spent:wordsBE(graph.nullifier),local_sol:wordsBE(graph.sol.commitment),local_btc:wordsBE(graph.btc.commitment),output_sol:wordsBE(graph.solNote.commitment),output_btc:wordsBE(graph.btcNote.commitment),output_recovery:wordsBE(graph.recovery.commitment),cutoff:graph.claimEpoch.toString(),siblings:path.siblings.map(x=>bytes(raw(x))),leaf_index:String(index),...graphWitness(graph),sol_invoice_signature:bytes(graph.sol.invoiceSignature),btc_invoice_signature:bytes(graph.btc.invoiceSignature)};}
/** This constructor needs only one role's descriptor and its own certificate. */
export function assemblyLocalInput({role,scope,policy,local,certificate}){assert.ok(role==='sol'||role==='btc');assert.equal(local.chain,role==='sol'?1:2);const ph=policyCommitment(policy),cm=localCommitment(scope,ph,local),c=certificate.certificate;assert.ok(cm.equals(raw(local.commitment)),'PC18_LOCAL_OPENING');assert.equal(c.localInstructionCommitment,cm.toString('hex'),'PC18_CERT_LOCAL');assert.equal(c.chainDomain.chain,role.toUpperCase(),'PC18_CERT_ROLE');const input={schema:wordsBE(assemblySchema(role+'_local')),scope:words(scope),policy:wordsBE(ph),local:wordsBE(cm),effect:wordsBE(effectNullifier(raw(scope),certificate)),observed_at:c.observedAt,valid_from:c.validFromEpoch,valid_until:c.validUntilEpoch,...assemblyPolicyWitness(policy),...certificateWitness(role,certificate)};for(const n of ['nonce','source','recipient'])input[role+'_'+n]=bytes(raw(local[n]));for(const [k,n]of [['amount','amount'],['executeAfter','after'],['executeBefore','before'],['validFrom','from'],['validUntil','until']])input[role+'_'+n]=String(local[k]);input[role+'_payment']=bytes(raw(local.payout));return input;}
export function assertAssemblyStatement(mode,inputs){assert.equal(inputs?.length,ASSEMBLY_PUBLIC_WORDS[mode],'PC18_STATEMENT_LENGTH');for(const input of inputs){assert.ok(typeof input==='string'||typeof input==='number'||typeof input==='bigint');assert.ok(BigInt(input)>=0n&&BigInt(input)<21888242871839275222246405745257275088548364400416034343698204186575808495617n,'PC18_STATEMENT_FIELD');}if(ASSEMBLY_SCHEMAS[mode])assert.deepEqual(inputs.slice(0,8).map(BigInt),wordsBE(assemblySchema(mode)).map(BigInt),'PC18_SCHEMA');return inputs;}
const child=(label,proof)=>{assert.ok(proof&&Array.isArray(proof.vkFields)&&proof.vkFields.length===115&&Array.isArray(proof.proofFields)&&proof.proofFields.length===458,'PC18_COMPLETE_RECURSIVE_PACKAGE');return{[label+'_vk']:proof.vkFields,[label+'_proof']:proof.proofFields,[label+'_inputs']:proof.publicInputs};};
export function assemblyRecursiveInput(mode,{authorization,sol,btc,joined,snapshot,epoch}) {
 const eq=(x,y)=>assert.deepEqual(x.map(BigInt),y.map(BigInt),'PC18_CHILD_JOIN');
 const usesJoin=mode==='fulfill'||mode==='btc_ready';
 const j=usesJoin?assertAssemblyStatement('sol_join',joined?.publicInputs):null;
 const a=assertAssemblyStatement('authorization',usesJoin?j.slice(8,89):authorization?.publicInputs);
 if(mode==='sol_join') {
  const s=assertAssemblyStatement('sol_local',sol?.publicInputs);
  eq(s.slice(8,24),a.slice(8,24));eq(s.slice(24,32),a.slice(40,48));
  return {schema:wordsBE(assemblySchema('sol_join')),authorization_inputs:a,effect_sol:s.slice(32,40),observed_at:s[40],valid_from:s[41],valid_until:s[42],...child('a',authorization),...child('sol',sol)};
 }
 const input={scope:a.slice(8,16),policy:a.slice(16,24),epoch:String(epoch),...(usesJoin?child('j',joined):child('a',authorization))};
 if(mode==='fulfill') {
  const b=assertAssemblyStatement('btc_local',btc?.publicInputs);
  eq(b.slice(8,24),a.slice(8,24));eq(b.slice(24,32),a.slice(48,56));
  return {...input,...child('btc',btc),root:a.slice(24,32),spent:a.slice(32,40),effect_sol:j.slice(89,97),effect_btc:b.slice(32,40),output_sol:a.slice(56,64),output_btc:a.slice(64,72)};
 }
 if(mode==='refund')return{...input,root:a.slice(24,32),spent:a.slice(32,40),output_recovery:a.slice(72,80)};
 assert.ok(mode==='sol_ready'||mode==='btc_ready');assert.ok(snapshot,'PC18_CURRENT_STATE_REQUIRED');assertPrivateAssemblyRevocations(snapshot);
 eq(words(snapshot.scope),a.slice(8,16));eq(words(snapshot.policy),a.slice(16,24));assert.equal(BigInt(snapshot.epoch),BigInt(epoch),'PC18_CURRENT_EPOCH');
 assert.equal(privateAssemblyRootHistoryDigest(snapshot.scope,snapshot.rootHistory,snapshot.rootHistoryCount),snapshot.rootHistoryDigest,'PC18_HISTORY_SNAPSHOT');
 const spent=snapshot.nullifiers.slice(0,snapshot.spentCount),history=snapshot.rootHistory.slice(0,snapshot.rootHistoryCount);
 assert.equal(privateSpentDigest(snapshot.scope,spent),snapshot.spentDigest,'PC18_SPENT_SNAPSHOT');
 Object.assign(input,{schema:wordsBE(assemblySchema(mode)),history_digest:words(snapshot.rootHistoryDigest),history_count:String(snapshot.rootHistoryCount),current_root:words(snapshot.root),spent_digest:words(snapshot.spentDigest),spent_count:String(snapshot.spentCount),state_sequence:String(snapshot.sequence),coverage_halted:snapshot.revocationCoverageHalted?1:0,local:a.slice(mode==='sol_ready'?40:48,mode==='sol_ready'?48:56),history_entries:padded(history,65),spent_entries:padded(spent,64)});
 if(mode==='btc_ready'){const effects=snapshot.solEffects.slice(0,snapshot.solEffectCount);assert.equal(privateEffectDigest('SOL',snapshot.scope,effects),snapshot.solEffectDigest,'PC18_EFFECT_SNAPSHOT');Object.assign(input,{sol_effect_digest:words(snapshot.solEffectDigest),sol_effect_count:String(snapshot.solEffectCount),sol_effect_entries:padded(effects,64),sol_revoked_digest:words(snapshot.solRevokedDigest),sol_revoked_count:String(snapshot.solRevokedCount),sol_revoked_entries:padded(snapshot.solRevokedEffects,64)});}
 return input;
}
