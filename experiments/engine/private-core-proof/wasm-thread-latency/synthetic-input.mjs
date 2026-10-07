/** Reconstruct the retained synthetic capability only inside a designated proof child.
 * Never export raw tuples to the supervisor, logs, reports, files, or production. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {deflattenFields,BN254_FR_MODULUS} from '@aztec/bb.js';
import {assemblyRecursiveInput,assertAssemblyStatement} from '../../../../packages/engine/src/assembly/private-assembly-encoding.mjs';
import {assemblyActorPublicInputs,validateAssemblyProofPackage} from '../../../../packages/engine/src/assembly/private-assembly-actors.mjs';
import {PrivateNoteTree,ZERO_NOTE_HASH,noteWordsToHash,privateSpentDigest,privateEffectDigest} from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import {privateAssemblyRootHistoryDigest} from '../../../../packages/engine/src/assembly/private-assembly-history.mjs';
import {privateAssemblyRevocationDigest} from '../../../../packages/engine/src/assembly/private-assembly-revocations.mjs';
import {project,assembly,spec,hash,fields} from './common.mjs';
const readJSON=path=>JSON.parse(readFileSync(path));
function needChild(){assert.equal(process.env.WT_SUPERVISED,'btc-v2-one-pair-v1','WT_DESIGNATED_CHILD_REQUIRED');assert.equal(process.env.WT_ROLE,'prove','WT_PROOF_CHILD_REQUIRED');assert.equal(typeof process.send,'function','WT_CHILD_CHANNEL_REQUIRED');}
export function reconstructSyntheticInput(){
 needChild();
 const original=readJSON(join(project,'evidence/m18-capability-'+spec.originalRun+'.json'));
 const current=readJSON(join(project,'evidence/m18-readiness-v2-'+spec.currentRun+'.json'));
 assert.equal(original.phase,'completed','WT_ORIGINAL_COMPLETED');assert.equal(current.phase,'completed','WT_CURRENT_COMPLETED');
 assert.equal(current.previousCapabilitySHA256,hash(readFileSync(join(project,'evidence/m18-capability-'+spec.originalRun+'.json'))),'WT_CAPABILITY_LINEAGE');
 const packages=[];
 function load(mode,label){
  const record=original.proofs.find(r=>r.mode===mode&&r.label===label&&r.verified===true);assert.ok(record,'WT_GENUINE_CHILD_RECORD');
  const base=join(project,'evidence/m18-capability',spec.originalRun,label);
  const proof=readFileSync(join(base,'proof.bin')),vk=readFileSync(join(base,'verification-key.bin')),publicInputs=readJSON(join(base,'public-inputs.json'));
  const prepared=readJSON(join(assembly,'.local/prepared',mode+'.key.json'));
  const program=readJSON(join(assembly,'.local/compiled',mode+'.json'));
  assert.equal(hash(proof),record.proofSHA256,'WT_CHILD_PROOF_PIN');assert.equal(hash(vk),record.verificationKeySHA256,'WT_CHILD_VK_PIN');
  assert.equal(hash(JSON.stringify(publicInputs)),record.publicInputsSHA256,'WT_CHILD_INPUT_PIN');
  assert.equal(hash(Buffer.from(program.bytecode,'base64')),record.circuitSHA256,'WT_CHILD_CIRCUIT_PIN');
  assert.equal(hash(readFileSync(join(assembly,'circuits',mode,'src/main.nr'))),record.sourceSHA256,'WT_CHILD_SOURCE_PIN');
  assert.equal(prepared.keySHA256,record.verificationKeySHA256,'WT_CHILD_CURRENT_KEY');
  assert.equal(prepared.target,'noir-recursive','WT_CHILD_TARGET');assert.deepEqual(readFileSync(join(assembly,'.local/prepared',mode+'.vk')),vk,'WT_CHILD_CURRENT_VK');
  const vkFields=deflattenFields(vk),proofFields=deflattenFields(proof);
  assert.equal(vkFields.length,115,'WT_COMPLETE_VK');assert.equal(proofFields.length,458,'WT_COMPLETE_PROOF');
  assert.deepEqual(fields(vkFields),fields(readJSON(join(assembly,'.local/prepared',mode+'.fields.json'))),'WT_COMPLETE_VK_FIELDS');
  for(const x of [...vkFields,...proofFields,...publicInputs])assert.ok(BigInt(x)>=0n&&BigInt(x)<BigInt(BN254_FR_MODULUS),'WT_CANONICAL_FIELD');
  assertAssemblyStatement(mode,publicInputs);
  validateAssemblyProofPackage({version:1,mode,target:'noir-recursive',proofBase64:proof.toString('base64'),publicInputs:fields(publicInputs),vkFields:fields(vkFields),proofFields:fields(proofFields)},mode);
  const result={mode,proof,vk,publicInputs,vkFields,proofFields};packages.push(result);return result;
 }
 const a=load('authorization','static-authorization'),j=load('sol_join','authorized-sol-join');
 assert.deepEqual(fields(j.publicInputs.slice(8,89)),fields(a.publicInputs),'WT_FULL_A_J_STATEMENT_BINDING');
 const approved=readFileSync(join(assembly,'circuits/btc_ready/src/approved_vk.nr'),'utf8');
 const approvedFields=/SOL_JOIN_VK:\[Field;115\]=\[([^\]]+)\]/.exec(approved)?.[1].split(',');
 const approvedHash=/SOL_JOIN_HASH:Field=(\d+)/.exec(approved)?.[1];
 assert.deepEqual(fields(approvedFields),fields(j.vkFields),'WT_CIRCUIT_FULL_J_VK');
 assert.equal(approvedHash,readJSON(join(assembly,'.local/prepared/sol_join.key.json')).keyHashField,'WT_CIRCUIT_J_KEY_HASH');
 const scope=noteWordsToHash(a.publicInputs.slice(8,16)),policy=noteWordsToHash(a.publicInputs.slice(16,24)),rootHash=noteWordsToHash(a.publicInputs.slice(24,32)),epoch=BigInt(j.publicInputs[98])+1n;
 const history=[new PrivateNoteTree().root,rootHash],unrelated='0x'+hash(Buffer.from('explicit unrelated revoked effect'));
 assert.notEqual(unrelated,noteWordsToHash(j.publicInputs.slice(89,97)),'WT_DISTINCT_REVOCATION');
 const snapshot={scope,policy,epoch:epoch.toString(),sequence:'2',root:rootHash,rootHistory:history,rootHistoryCount:2,rootHistoryDigest:privateAssemblyRootHistoryDigest(scope,history),nullifiers:[],spentCount:0,spentDigest:privateSpentDigest(scope,[]),solEffects:[],solEffectCount:0,solEffectDigest:privateEffectDigest('SOL',scope,[]),revocationCoverageHalted:false,solRevokedEffects:[unrelated,...Array(63).fill(ZERO_NOTE_HASH)],solRevokedCount:1,solRevokedDigest:privateAssemblyRevocationDigest(scope,[unrelated])};
 const input=assemblyRecursiveInput('btc_ready',{joined:j,snapshot,epoch});
 const expectedPublicInputs=readJSON(join(project,'evidence/m18-readiness-v2',spec.currentRun,'btc-readiness-v2-capacity-probe/public-inputs.json'));
 assert.equal(hash(JSON.stringify(expectedPublicInputs)),spec.publicInputsSHA256,'WT_FIXED_PUBLIC_INPUTS_HASH');
 assert.deepEqual(assemblyActorPublicInputs('btc_ready',input),fields(expectedPublicInputs),'WT_FULL_EXPECTED_STATEMENT');
 return{input,expectedPublicInputs,packages,inputHash:hash(JSON.stringify(input)),summary:{reconstructedFromExistingSyntheticCapability:true,noOwnerWitnessLoaded:true,noPrerequisiteProofGenerated:true,completeAJBinding:true,fullJVkFields:115,fullJProofFields:458,fullJInputFields:100,publicInputCount:79,snapshotHash:hash(JSON.stringify(snapshot))},clear(){for(const p of packages){p.proof.fill(0);p.vk.fill(0);p.publicInputs.fill('0');p.vkFields.fill('0');p.proofFields.fill('0');}for(const key of Object.keys(input))input[key]=null;}};
}
