/** Fixed original device U derivation inside its one-use owner recipient.
 * No raw owner witness leaves this process. Existing selected role packets
 * return to the same client encrypted; original U verification still applies. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {readOriginalPrivateProofRecipientV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/native-reservation-v2';
import {compileFundedGraph,attachFundedSignatures,ownerAuthorizationMessage} from '@lianum/engine/execution/graph/funded-graph';
import {walletNoteCommitment} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {nullifier} from '@lianum/engine/notes/private-note-encoding';
import {buildAuthorizedEnvelope} from '@lianum/custody/signing/authorized-envelope';
import {withFlatHash} from '../tooling/scoped-proof-tools.mjs';
import {encodeStatement} from '@lianum/components/encoding/statements';
import {externalFlatExactV1} from '@lianum/mobile-protocol/device/source-note-v1';
import {normalizeOriginalAccountSignatureV2} from '@lianum/mobile-protocol/original-account-v2';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function deriveOriginalNativeDeviceAuthorizationJobV2(received,spec){
 assert.equal(arguments.length,2,'PW_PRIVATE_U_ARITY');
 const originalRecipient=readOriginalPrivateProofRecipientV1(received);
 if(received.inputs?.profile!=='NATIVE_U_PRIVATE_WITNESS_INPUT_V2')return null;
 const packet=externalFlatExactV1(received.inputs,['profile','consent','signature','witness']);
 const c=P.validateDeviceReservationConsentEitherFreshV2(packet.consent);assert.equal(spec.name,'authorization','PW_PRIVATE_U_RELATION');
 assert.equal(c.action,'PROVE_U','PW_PRIVATE_U_CONSENT');assert.ok(c.privateProof,'PW_PRIVATE_U_CONSENT');
 assert.deepEqual(c.privateProof.recipient,originalRecipient,'PW_PRIVATE_U_RECIPIENT');assert.equal(received.expectedPublicInputs,null,'PW_PRIVATE_U_DERIVATION_ONLY');
 const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(c.devicePublicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(c.devicePublicKey.slice(66),'hex').toString('base64url')}});
 let frame,witness,bytes,envelope,inputs,derivation;
 try{
  frame=P.deviceReservationConsentEitherMessageV2(c);assert.equal(verify('sha256',frame,{key,dsaEncoding:'ieee-p1363'},Buffer.from(normalizeOriginalAccountSignatureV2(packet.signature),'hex')),true,'PW_PRIVATE_U_DEVICE_SIGNATURE');
  assert.deepEqual(received.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,consentSHA256:hash(frame),witnessSHA256:c.witnessSHA256},'PW_PRIVATE_U_BINDING');
  witness=P.normalizeDeviceReservationWitnessV1(packet.witness);P.validateNativePrivateReservationWitnessV2(c,witness);
  bytes=P.deviceReservationWitnessBytesV1(witness);assert.equal(hash(bytes),c.witnessSHA256,'PW_PRIVATE_U_WITNESS_HASH');
  const compiled=compileFundedGraph(witness.input),signed=attachFundedSignatures(compiled,{ownerSignature:witness.ownerSignature,invoiceSignatures:witness.invoiceSignatures});
  assert.deepEqual(compiled.authorizationStatement,c.statement,'PW_PRIVATE_U_STATEMENT');
  const ownerFrame=ownerAuthorizationMessage(compiled.authorizationStatement);try{assert.equal(hash(ownerFrame),c.custody.frameSHA256,'PW_PRIVATE_U_FRAME');}finally{ownerFrame.fill(0);}
  const domain=c.privateProof.context.domain,outputs={};
  for(const [role,note]of [['change',witness.input.changeNote],['recovery',witness.input.recoveryNote]]){
   const commitment=compiled.authorizationStatement[role+'Commitment'];
   if(note.value==='0'){assert.equal(role,'change','PW_PRIVATE_U_EMPTY_RECOVERY');outputs[role]={amount:'0',commitment,nullifier:null};}
   else{assert.equal(walletNoteCommitment(domain.scope,domain.policy,note).toString('hex'),commitment,'PW_PRIVATE_U_PC23');outputs[role]={amount:note.value,commitment,nullifier:nullifier(domain.scope,commitment,note.secret).toString('hex')};}
  }
  P.validateDeviceReservationConsentEitherFreshV2(c);
  envelope=await withFlatHash(hashFields=>buildAuthorizedEnvelope({signed,domain,...witness.envelopePreparation},{hashFields}));
  // Keep the original final admission check after envelope preparation.
  // Proof waiting never renews this permission.
  P.validateDeviceReservationConsentEitherFreshV2(c);
  inputs=envelope.ownerAuthorizationInputs();const statement=envelope.publicStatement(),rolePackets={};
  for(const role of ['reservation','recovery','assembler'])rolePackets[role]=structuredClone(envelope[role]().select());
  for(const role of ['local','dependency'])rolePackets[role]=Array.from({length:4},(_,i)=>structuredClone(envelope[role](i).select()));
  const expected=[...encodeStatement('authorization',statement)];
  derivation={profile:'ORIGINAL_NATIVE_DEVICE_U_PRIVATE_DERIVATION_V2',jobId:c.jobId,sourceAmount:witness.input.inputNote.value,
   publicStatement:statement,expectedPublicInputs:expected,rolePackets,outputs,consentSHA256:received.authorization.consentSHA256,witnessSHA256:c.witnessSHA256};
  assert.ok(Buffer.byteLength(JSON.stringify(derivation))<=262144,'PW_PRIVATE_U_RESULT_BOUND');
  wipePrivateProofInputsV1(received.inputs);received.inputs=structuredClone(inputs);received.expectedPublicInputs=expected;
  return{derivation,resultRecipient:c.privateProof.resultRecipient};
 }catch(error){wipePrivateProofInputsV1(derivation);throw error;}
 finally{frame?.fill(0);bytes?.fill(0);P.wipeDeviceReservationWitnessV1(witness);envelope?.destroy();wipePrivateProofInputsV1(inputs);}
}
