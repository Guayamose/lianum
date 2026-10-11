/** The recipient owns the plaintext; neither TLS/API nor a parsed DTO may
 * derive or issue the original PC23 note proof. Original26/39 ABI is unchanged. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import * as Graph from '@lianum/mobile-protocol/device/source-graph-v1';
import * as RootClaim from '@lianum/mobile-protocol/device/native-claim-v1';
import {readOriginalPrivateProofRecipientV1,wipePrivateProofInputsV1} from './private-proof-transit-v1.mjs';
import {walletInputPublicWords,balanceCommitment,balanceDepositFrame,balanceWithdrawFrame} from '../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {nullifier} from '../../../engine/src/notes/private-note-encoding.mjs';
import {verifyPrivateNotePath} from '../../../engine/src/notes/private-note-tree.mjs';
const h=bytes=>createHash('sha256').update(bytes).digest('hex');
const publicKey=(x,y)=>createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(x).toString('base64url'),y:Buffer.from(y).toString('base64url')}});
export function deriveOriginalDeviceWalletNoteJobV3(received,mode){
 assert.equal(arguments.length,2,'PW_PRIVATE_WALLET_ARITY');assert.ok(['deposit_balance','withdraw_balance'].includes(mode),'PW_PRIVATE_WALLET_MODE');
 const original=readOriginalPrivateProofRecipientV1(received),p=P.externalFlatExactV1(received.inputs,['profile','consent','signature','witness']);
 const root=p.profile==='DEVICE_ROOT_NATIVE_CLAIM_EXIT_WITNESS_V3'?RootClaim.validateDeviceRootClaimExitPermissionFreshV3(p.consent):null;
 assert.ok(root||p.profile==='DEVICE_WALLET_NOTE_PRIVATE_WITNESS_INPUT_V3','PW_PRIVATE_WALLET_FRAME');
 if(root)assert.equal(mode,'withdraw_balance','PW_PRIVATE_WALLET_ROOT_EXIT_ONLY');
 const wrapper=p.consent?.profile===Graph.DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1?Graph.normalizeExternalFlatGraphOutputConsentV1(p.consent):null,c=root?{...root,recipient:root.statement.recipient,descriptor:{devicePublicKey:root.descriptor.claim.devicePublicKey},privateProof:{profile:P.DEVICE_EXTERNAL_FLAT_PRIVATE_WALLET_V3,noteRole:null,recipient:root.recipient}}:wrapper?wrapper.consent:P.normalizeExternalFlatConsentV1(p.consent);
 const fresh=()=>root?RootClaim.validateDeviceRootClaimExitPermissionFreshV3(root):P.validateExternalFlatFreshV1(c);
 assert.equal(c.privateProof?.noteRole,wrapper?wrapper.noteRole:null,'PW_PRIVATE_WALLET_OUTPUT_ROLE');assert.equal(c.action,mode==='deposit_balance'?'PROVE_D26':'PROVE_W39','PW_PRIVATE_WALLET_ACTION');
 assert.equal(c.privateProof?.profile,P.DEVICE_EXTERNAL_FLAT_PRIVATE_WALLET_V3,'PW_PRIVATE_WALLET_ORIGINAL');
 assert.deepEqual(c.privateProof.recipient,original,'PW_PRIVATE_WALLET_RECIPIENT');fresh();
 if(!root)assert.equal(h(P.externalFlatPrivateWalletTranscriptBytesV3(c)),c.privateProof.transcriptSHA256,'PW_PRIVATE_WALLET_TRANSCRIPT');
 const message=root?RootClaim.deviceRootClaimExitPermissionMessageV3(root):wrapper?Graph.externalFlatGraphOutputPermissionMessageV1(wrapper):P.externalFlatPermissionMessageV1(c),deviceKey=publicKey(Buffer.from(c.descriptor.devicePublicKey.slice(2,66),'hex'),Buffer.from(c.descriptor.devicePublicKey.slice(66),'hex'));
 assert.equal(verify('sha256',message,{key:deviceKey,dsaEncoding:'ieee-p1363'},Buffer.from(P.normalizeExternalFlatSignatureV1(p.signature),'hex')),true,'PW_PRIVATE_WALLET_DEVICE_SIGNATURE');
 assert.deepEqual(received.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,consentSHA256:h(message),witnessSHA256:c.witnessSHA256},'PW_PRIVATE_WALLET_BINDING');
 let witness,bytes;const opening={};
 try{
  witness=P.externalFlatWitnessV1(mode,p.witness);bytes=P.externalFlatWitnessBytesV1(mode,witness);assert.equal(h(bytes),c.witnessSHA256,'PW_PRIVATE_WALLET_WITNESS');
  const expected=P.externalFlatWalletPublicInputsV3(mode,c.statement);assert.deepEqual(received.expectedPublicInputs,expected,'PW_PRIVATE_WALLET_EXPECTED');assert.deepEqual(walletInputPublicWords(mode,witness),expected,'PW_PRIVATE_WALLET_PUBLIC');
  for(const name of ['rho','key_x','key_y','secret','signature'])opening[name]=Buffer.from(witness[name]);
  const cm=balanceCommitment(c.statement.scope,c.statement.policy,{type:4,rho:opening.rho,x:opening.key_x,y:opening.key_y,value:witness.amount,secret:opening.secret}).toString('hex'),nf=nullifier(c.statement.scope,cm,opening.secret).toString('hex');
  assert.equal(cm,mode==='deposit_balance'?c.statement.output:c.statement.commitment,'PW_PRIVATE_WALLET_COMMITMENT');
  const frame=mode==='deposit_balance'?balanceDepositFrame(c.statement.scope,c.statement.policy,c.statement.epoch,c.statement.amount,cm):balanceWithdrawFrame(c.statement.scope,c.statement.policy,cm,c.recipient,c.statement.amount,c.statement.epoch);
  assert.equal(verify('sha256',frame,{key:publicKey(opening.key_x,opening.key_y),dsaEncoding:'ieee-p1363'},opening.signature),true,'PW_PRIVATE_WALLET_NOTE_SIGNATURE');
  if(mode==='withdraw_balance'){
   assert.equal(nf,c.statement.nullifier,'PW_PRIVATE_WALLET_NULLIFIER');assert.equal(witness.leaf_index,String(c.path.index),'PW_PRIVATE_WALLET_PATH');
   assert.deepEqual(witness.siblings,c.path.siblings.map(v=>[...Buffer.from(v,'hex')]),'PW_PRIVATE_WALLET_PATH');
   assert.equal(verifyPrivateNotePath({root:Buffer.from(c.path.root,'hex'),leaf:Buffer.from(cm,'hex'),index:c.path.index,siblings:c.path.siblings.map(v=>Buffer.from(v,'hex'))}),true,'PW_PRIVATE_WALLET_PATH');
  }
  fresh();const input=structuredClone(witness);wipePrivateProofInputsV1(received.inputs);received.inputs=input;
  return Object.freeze({profile:'ORIGINAL_DEVICE_WALLET_NOTE_PRIVATE_DERIVATION_V3',mode,noteRole:wrapper?.noteRole??null,jobId:c.jobId,commitment:cm,nullifier:nf,consentSHA256:received.authorization.consentSHA256,witnessSHA256:c.witnessSHA256});
 }finally{bytes?.fill(0);for(const b of Object.values(opening))b.fill(0);P.externalFlatWipeV1(witness);}
}
