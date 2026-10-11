/** The original private recipient validates D27 before original ABI/prover.
 * CM/NF are descriptive until the same owned proof client and pool verify. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {wipePrivateProofInputsV1,readOriginalPrivateProofRecipientV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {depositIntentWitness} from '@lianum/engine/execution/inputs/deposit-intent';
import {balanceCommitment} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {nullifier} from '@lianum/engine/notes/private-note-encoding';
export function deriveOriginalDeviceDepositIntentJobV2(received,spec) {
  assert.equal(arguments.length,2,'PW_PRIVATE_D27_ARITY');
  const originalRecipient=readOriginalPrivateProofRecipientV1(received);
  if (received.inputs?.profile !== 'DEVICE_D27_PRIVATE_WITNESS_INPUT_V2') return null;
  let privateDeviceDerivation=null;
    const packet=P.externalFlatExactV1(received.inputs,['profile','consent','signature','witness']);
    const c=P.normalizeExternalFlatConsentV1(packet.consent);
    assert.equal(spec.name,'deposit_intent','PW_PRIVATE_D27_RELATION');
    assert.equal(c.action,'PROVE_D27','PW_PRIVATE_D27_CONSENT');assert.ok(c.privateProof,'PW_PRIVATE_D27_CONSENT');
    assert.deepEqual(c.privateProof.recipient,originalRecipient,'PW_PRIVATE_D27_RECIPIENT');
    P.validateExternalFlatFreshV1(c);
    const h=bytes=>createHash('sha256').update(bytes).digest('hex');
    assert.equal(h(P.externalFlatPrivateProofTranscriptBytesV2(c)),c.privateProof.transcriptSHA256,'PW_PRIVATE_D27_TRANSCRIPT');
    const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
      x:Buffer.from(c.descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),
      y:Buffer.from(c.descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});
    assert.equal(verify('sha256',P.externalFlatPermissionMessageV1(c),{key,dsaEncoding:'ieee-p1363'},
      Buffer.from(P.normalizeExternalFlatSignatureV1(packet.signature),'hex')),true,'PW_PRIVATE_D27_DEVICE_SIGNATURE');
    assert.deepEqual(received.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,
      consentSHA256:h(P.externalFlatPermissionMessageV1(c)),witnessSHA256:c.witnessSHA256},'PW_PRIVATE_D27_BINDING');
    let witness,bytes,prepared;const opening={};
    try {
      witness=P.externalFlatWitnessV1('deposit_intent',packet.witness);bytes=P.externalFlatWitnessBytesV1('deposit_intent',witness);
      assert.equal(h(bytes),c.witnessSHA256,'PW_PRIVATE_D27_WITNESS_HASH');
      for(const name of ['rho','key_x','key_y','secret','signature'])opening[name]=Buffer.from(witness[name]);
      prepared=depositIntentWitness({statement:c.statement,note:{type:4,rho:opening.rho.toString('hex'),
        x:opening.key_x.toString('hex'),y:opening.key_y.toString('hex'),value:witness.amount,
        secret:opening.secret.toString('hex')},signature:opening.signature.toString('hex')});
      assert.deepEqual(prepared.publicInputs,received.expectedPublicInputs,'PW_PRIVATE_D27_PUBLIC_INPUTS');
      const cm=balanceCommitment(c.statement.scope,c.statement.policy,{type:4,rho:opening.rho,
        x:opening.key_x,y:opening.key_y,value:witness.amount,secret:opening.secret}).toString('hex');
      assert.equal(cm,c.statement.output,'PW_PRIVATE_D27_COMMITMENT');
      privateDeviceDerivation={profile:'ORIGINAL_DEVICE_D27_PRIVATE_DERIVATION_V2',jobId:c.jobId,commitment:cm,
        nullifier:nullifier(c.statement.scope,cm,opening.secret).toString('hex'),
        consentSHA256:received.authorization.consentSHA256,witnessSHA256:c.witnessSHA256};
      const inputs=structuredClone(prepared.inputs);wipePrivateProofInputsV1(received.inputs);received.inputs=inputs;
    } finally {bytes?.fill(0);for(const value of Object.values(opening))value.fill(0);P.externalFlatWipeV1(witness);prepared=null;}
  return privateDeviceDerivation;
}


import * as ClaimDevice from '@lianum/mobile-protocol/device/native-claim-v1';
import {claimReceiptSecret,claimRefundSalt} from '@lianum/engine/claims/framing';
import {buildClaimIngressInputs} from '@lianum/engine/claims/inputs';
import {withFlatHash} from '../tooling/scoped-proof-tools.mjs';
/** Fixed original D27/CI51 derivation inside the existing owned recipient.
 * A device permission binds the SAME domain and opening. Root/signing keys
 * never enter; only that note opening is decrypted inside this process. */
export async function deriveOriginalDeviceRootClaimJobV2(received,spec){
 assert.equal(arguments.length,2,'PW_DEVICE_CLAIM_ARITY');const recipient=readOriginalPrivateProofRecipientV1(received);
 if(received.inputs?.profile!=='DEVICE_ROOT_NATIVE_CLAIM_WITNESS_V2')return null;
 const packet=P.externalFlatExactV1(received.inputs,['profile','consent','signature','witness','common']);
 const c=ClaimDevice.validateDeviceRootClaimPermissionFreshV2(packet.consent),ingress=c.action==='PROVE_CI51';
 assert.ok(ingress||c.action==='PROVE_D27','PW_DEVICE_CLAIM_ACTION');assert.equal(spec.name,ingress?'native_claim_ingress':'deposit_intent','PW_DEVICE_CLAIM_RELATION');assert.deepEqual(c.recipient,recipient,'PW_DEVICE_CLAIM_RECIPIENT');
 const hash=b=>createHash('sha256').update(b).digest('hex'),message=ClaimDevice.deviceRootClaimPermissionMessageV2(c);
 const pub=c.descriptor.claim.devicePublicKey,key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')}});
 let witness,bytes,built,commonBytes;const owned={};
 try{
 assert.equal(verify('sha256',message,{key,dsaEncoding:'ieee-p1363'},Buffer.from(ClaimDevice.normalizeNativeClaimDeviceSignatureV1(packet.signature),'hex')),true,'PW_DEVICE_CLAIM_DEVICE_SIGNATURE');
 assert.deepEqual(received.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,consentSHA256:hash(message),witnessSHA256:c.witnessSHA256},'PW_DEVICE_CLAIM_BINDING');
  if(ingress){
   witness=P.externalFlatExactV1(packet.witness,['rho','x','y','value','noteSecret']);for(const k of ['rho','x','y','noteSecret'])P.externalFlatHexV1(witness[k]);P.externalFlatUintV1(witness.value);
   bytes=ClaimDevice.deviceRootClaimDataBytesV2(witness);assert.equal(hash(bytes),c.witnessSHA256,'PW_DEVICE_CLAIM_WITNESS_HASH');
   commonBytes=ClaimDevice.deviceRootClaimDataBytesV2(packet.common);assert.equal(hash(commonBytes),c.commonSHA256,'PW_DEVICE_CLAIM_COMMON_HASH');
   P.externalFlatExactV1(packet.common,['config','domain','registry','rule','rulePath','certificates','currentRevocation']);
   assert.equal(packet.common.config.scope,c.descriptor.scope,'PW_DEVICE_CLAIM_SCOPE');assert.equal(packet.common.config.policy,c.descriptor.policy,'PW_DEVICE_CLAIM_POLICY');
   built=await withFlatHash(hashFields=>buildClaimIngressInputs({...packet.common,noteOpening:witness},{hashFields}));
   assert.deepEqual(built.statement,c.statement,'PW_DEVICE_CLAIM_ORIGINAL_CI51');
  }else{
   assert.equal(packet.common,null,'PW_DEVICE_CLAIM_D27_COMMON');witness=P.externalFlatWitnessV1('deposit_intent',packet.witness);bytes=P.externalFlatWitnessBytesV1('deposit_intent',witness);assert.equal(hash(bytes),c.witnessSHA256,'PW_DEVICE_CLAIM_WITNESS_HASH');
   for(const k of ['rho','key_x','key_y','secret','signature'])owned[k]=Buffer.from(witness[k]);
   built=depositIntentWitness({statement:c.statement,note:{type:4,rho:owned.rho.toString('hex'),x:owned.key_x.toString('hex'),y:owned.key_y.toString('hex'),value:witness.amount,secret:owned.secret.toString('hex')},signature:owned.signature.toString('hex')});
  }
  ClaimDevice.validateDeviceRootClaimPermissionFreshV2(c);assert.deepEqual(built.publicInputs,received.expectedPublicInputs,'PW_DEVICE_CLAIM_PUBLIC');
  const output=c.statement[ingress?'outputQ':'output'],derived={profile:'ORIGINAL_DEVICE_ROOT_NATIVE_CLAIM_DERIVATION_V2',action:c.action,jobId:c.jobId,commitment:output,claimDomain:c.descriptor.claim.claimDomain,consentSHA256:received.authorization.consentSHA256,witnessSHA256:c.witnessSHA256,commonSHA256:c.commonSHA256};
  if(!ingress){const noteSecret=owned.secret.toString('hex'),binding={claimDomain:derived.claimDomain,noteSecret,outputQ:output};derived.receiptBinding={secret:claimReceiptSecret(binding),refundSalt:claimRefundSalt(binding)};derived.nullifier=nullifier(c.descriptor.scope,output,owned.secret).toString('hex');}
  const inputs=structuredClone(built.inputs);wipePrivateProofInputsV1(received.inputs);received.inputs=inputs;return derived;
 }finally{message.fill(0);bytes?.fill(0);commonBytes?.fill(0);for(const v of Object.values(owned))v.fill(0);wipePrivateProofInputsV1(witness);built=null;}
}
