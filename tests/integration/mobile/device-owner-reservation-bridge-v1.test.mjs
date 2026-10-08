/** Genuine account/actor/Vault over the existing explicit HOST substrate.
 * No proof, funding, native dispatch or mobile hardware acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createECDH,createPublicKey,verify} from 'node:crypto';
import {fixture,createActorModule} from './paired-original-account-host-fixture.mjs';
import {originalAccountAccessMessageV2} from '../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import {createGenericBalanceNativePreparation,genericBalanceNativeTerms} from '../../../packages/engine/src/execution/balances/generic-balance-native-preparation.mjs';
import {compileFundedGraph} from '../../../packages/engine/src/execution/graph/funded-graph.mjs';
import {normalizeDeviceReservationConsentV1,deviceReservationConsentMessageV1,normalizeDeviceReservationWitnessV1,
  deviceReservationWitnessBytesV1,normalizeDeviceReservationStatusV1} from '../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
const {createPairedOriginalAccountActorV2}=await createActorModule();
const {createDeviceOwnerReservationBridgeV1,assertDeviceOwnerReservationBridgeV1,consumeDeviceOwnerReservationAuthorizationV1}
  =await import('../../../packages/backend/src/accounts/authority/device-owner-reservation-bridge-v1.mjs');
const {runDeviceOwnerReservationAuthorizationV1}=await import('../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs');
const h=name=>createHash('sha256').update('HOST DEVICE U/S '+name).digest('hex'),signature='1'.repeat(128),origin='https://device-reservation.example';
function opening(label,value){const key=createECDH('secp256k1');key.setPrivateKey(Buffer.from(h(label),'hex'));const pub=key.getPublicKey().toString('hex');
  return {type:4,rho:h(label+'rho'),x:pub.slice(2,66),y:pub.slice(66),value,secret:h(label+'secret')};}
function preparation(domain){const {type,rho,...payout}=opening('payout','25');return createGenericBalanceNativePreparation({
  ...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(name=>[name,domain[name]])),operationId:h('operation'),
  fundingNotBefore:'6000',fundingValidUntil:'6100',settleBefore:'6300',nodes:[{id:'leg_0',dependsOn:[],evidencePolicy:h('evidence'),
    actionTemplate:{chainDomain:h('chain'),signerIdentity:h('signer'),sourceCommitment:h('native-source'),destinationCommitment:h('destination'),
      amount:'1000',custodyKind:1,custodyCommitment:h('custody'),executionFrom:'6000',executionUntil:'6200'},
    recipientOffer:{...payout,randomness:h('payout-randomness')}}]});}
async function setup(t){const f=await fixture(t,{execute:false}),actor=await createPairedOriginalAccountActorV2({session:f.session,approval:f.approval,
  owner:f.world.owner,origin,devicePublicKey:f.device.publicKey});const nativePreparation=preparation(f.world.identity.domain);
  const input={actor,account:f.account,owner:f.world.owner,runtime:f.world.runtime,system:f.world.system,poolIndex:0,nativePreparation,invoiceSignatures:[signature]};
  const bridge=await createDeviceOwnerReservationBridgeV1(input);t.after(()=>{bridge.close();actor.close();});return {f,actor,input,bridge};}
test('device U/S rejects crossed original authority, copied bridge, arbitrary grant and preparation callbacks',async t=>{
  const a=await setup(t),b=await setup(t);
  for(const replacement of [{actor:b.actor},{account:b.f.account},{runtime:b.f.world.runtime},{owner:b.f.world.owner},
    {system:b.f.world.system},{actor:{...a.actor}},{account:{...a.f.account}},{nativePreparation:()=>a.input.nativePreparation}])
    await assert.rejects(createDeviceOwnerReservationBridgeV1({...a.input,...replacement}));
  assert.throws(()=>assertDeviceOwnerReservationBridgeV1(a.bridge,b.f.account));
  assert.throws(()=>assertDeviceOwnerReservationBridgeV1({...a.bridge},a.f.account));
  assert.throws(()=>consumeDeviceOwnerReservationAuthorizationV1(a.bridge,{},a.f.account));
  await assert.rejects(runDeviceOwnerReservationAuthorizationV1(a.f.account,a.bridge,{}));
  assert.equal(a.f.world.proofs,0);assert.equal(a.f.world.sends,0);
});
test('fixed U/S framing signs all custody and witness bindings below4096 and rejects private key/root or contradictory stages',async t=>{
  const {f,actor,input}=await setup(t),access=actor.challenge({action:'read'}),review=await actor.openReview({challenge:access,
    signature:f.device.sign(originalAccountAccessMessageV2(access))});
  const terms=genericBalanceNativeTerms(input.nativePreparation),domain=f.world.identity.domain;
  const funded={scope:domain.scope,policy:domain.policy,asset:domain.asset,...terms,reservationNonce:h('reservation'),reserveSecret:h('reserve'),
    graphNonce:h('graph'),inputNote:opening('source','100'),changeNote:opening('change','75'),recoveryNote:opening('recovery','25'),
    paddingSalts:Array.from({length:4},(_,i)=>h('padding'+i))};
  const statement=compileFundedGraph(funded).authorizationStatement,custody={rootId:h('root'),noteRevision:3,encryptedRecordSHA256:h('ciphertext'),
    frameSHA256:h('H4'),sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,
    changeCommitment:statement.changeCommitment,recoveryCommitment:statement.recoveryCommitment};
  const witness={input:funded,ownerSignature:signature,invoiceSignatures:[signature],envelopePreparation:{
    capsuleOptions:{nodes:input.nativePreparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),slotSalts:input.nativePreparation.slotSalts},
    joinBlinds:Array.from({length:4},(_,i)=>h('join'+i)),leafBlinds:Array.from({length:16},(_,i)=>h('leaf'+i))}};
  const witnessBytes=deviceReservationWitnessBytesV1(witness),witnessSHA256=createHash('sha256').update(witnessBytes).digest('hex');witnessBytes.fill(0);
  const asset=f.account.config.registry[0],consent=normalizeDeviceReservationConsentV1({version:1,profile:'LIANUM_DEVICE_ORIGINAL_US_V1',action:'PROVE_U',origin,
    pairingId:access.pairingId,devicePublicKey:access.devicePublicKey,challengeId:h('challenge'),nonce:h('nonce'),expiresAt:Date.now()+15000,binding:review.binding,
    poolTerms:{scope:asset.scope,policy:asset.policy,codeHash:asset.codeHash,assetIdentity:asset.assetIdentity,domainCommitment:f.world.identity.domainCommitment},
    depositJobId:h('depositjob'),quoteId:h('quote'),jobId:h('job'),custody,statement,witnessSHA256,proofSHA256:null,publicInputsSHA256:null,
    observed:{blockNumber:'1',blockHash:h('block'),timestamp:'6000'},openingDisclosure:'ONE_FUNDED_OWNER_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER'});
  const frame=deviceReservationConsentMessageV1(consent);assert.ok(frame.length<=4096);
  const pub=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(f.device.publicKey.slice(2,66),'hex').toString('base64url'),
    y:Buffer.from(f.device.publicKey.slice(66),'hex').toString('base64url')}}),signed=f.device.sign(frame);
  const changed=normalizeDeviceReservationConsentV1({...consent,custody:{...custody,encryptedRecordSHA256:h('otherciphertext')}});
  assert.equal(verify('sha256',deviceReservationConsentMessageV1(changed),{key:pub,dsaEncoding:'ieee-p1363'},Buffer.from(signed,'hex')),false);
  assert.throws(()=>normalizeDeviceReservationWitnessV1({...witness,root:h('secretroot')}));
  assert.throws(()=>normalizeDeviceReservationWitnessV1({...witness,privateKey:h('sourcekey')}));
  const status={jobId:consent.jobId,stage:'PROVED',consentFields:{...Object.fromEntries(['depositJobId','quoteId','jobId','custody','statement','witnessSHA256'].map(name=>[name,consent[name]])),
    proofSHA256:null,publicInputsSHA256:null},statement,observation:null,errorCode:null,authorizationSHA256:h('authorized')};
  assert.throws(()=>normalizeDeviceReservationStatusV1(status));
});

// New boundaries only: real HOST signatures/encodings, never dispatch/proof acceptance.
import {createDeviceOwnerExecutionBridgeV1,consumeDeviceOwnerExecutionAuthorizationV1}
  from '../../../packages/backend/src/accounts/authority/device-owner-execution-bridge-v1.mjs';
import {normalizeDeviceExecutionConsentV1,deviceExecutionConsentMessageV1}
  from '../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
test('device continuation rejects caller executors/providers before dispatch and keeps native PoP domains distinct',async t=>{
  const {f,actor,bridge}=await setup(t);let effects=0;
  await assert.rejects(createDeviceOwnerExecutionBridgeV1({account:f.account,reservationBridge:bridge,
    nativeExecution:{prepare(){effects++;},execute(){effects++;}},providers:[{slot:0,custody:{},deliveryRiskSalt:h('risk')}],
    runtime:f.world.runtime,system:f.world.system,poolIndex:0}),/FLAT_EXECUTION_OWNED_CAPABILITY/);
  assert.throws(()=>consumeDeviceOwnerExecutionAuthorizationV1({...bridge},{},f.account));assert.equal(effects,0);
  const access=actor.challenge({action:'read'}),review=await actor.openReview({challenge:access,signature:f.device.sign(originalAccountAccessMessageV2(access))});
  const domain=f.world.identity.domain,terms=genericBalanceNativeTerms(preparation(domain)),input={scope:domain.scope,policy:domain.policy,asset:domain.asset,...terms,
    reservationNonce:h('r2'),reserveSecret:h('s2'),graphNonce:h('g2'),inputNote:opening('s2','100'),changeNote:opening('c2','75'),
    recoveryNote:opening('f2','25'),paddingSalts:Array.from({length:4},(_,i)=>h('p2'+i))};
  const statement=compileFundedGraph(input).authorizationStatement,asset=f.account.config.registry[0];
  const reservation=normalizeDeviceReservationConsentV1({version:1,profile:'LIANUM_DEVICE_ORIGINAL_US_V1',action:'OBSERVE_S',origin,
    pairingId:access.pairingId,devicePublicKey:access.devicePublicKey,challengeId:h('ec'),nonce:h('en'),expiresAt:Date.now()+15000,binding:review.binding,
    poolTerms:{scope:asset.scope,policy:asset.policy,codeHash:asset.codeHash,assetIdentity:asset.assetIdentity,domainCommitment:f.world.identity.domainCommitment},
    depositJobId:h('ed'),quoteId:h('eq'),jobId:h('ej'),custody:{rootId:h('er'),noteRevision:3,encryptedRecordSHA256:h('enc'),frameSHA256:h('ef'),
      sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,changeCommitment:statement.changeCommitment,recoveryCommitment:statement.recoveryCommitment},
    statement,witnessSHA256:h('ew'),proofSHA256:h('ep'),publicInputsSHA256:h('epi'),observed:{blockNumber:'1',blockHash:h('eb'),timestamp:'6000'},openingDisclosure:null});
  const consent=normalizeDeviceExecutionConsentV1({version:1,profile:'LIANUM_DEVICE_ORIGINAL_EXECUTION_V1',action:'EXECUTE_NATIVE',reservation,
    nativeBindingSHA256:h('binding'),reservationTransactionHash:h('Stx'),executionSnapshotSHA256:h('snapshot'),lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}),
    frame=deviceExecutionConsentMessageV1(consent),pub=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
      x:Buffer.from(f.device.publicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(f.device.publicKey.slice(66),'hex').toString('base64url')}}),signed=f.device.sign(frame);
  assert.ok(frame.length<=4096);assert.equal(verify('sha256',deviceReservationConsentMessageV1(reservation),{key:pub,dsaEncoding:'ieee-p1363'},Buffer.from(signed,'hex')),false);
  for(const changed of [{...consent,action:'RECOVER_NATIVE'},{...consent,reservationTransactionHash:h('otherStx')},
    {...consent,nativeBindingSHA256:h('otherbinding')},{...consent,executionSnapshotSHA256:h('othersnapshot')}])
    assert.equal(verify('sha256',deviceExecutionConsentMessageV1(changed),{key:pub,dsaEncoding:'ieee-p1363'},Buffer.from(signed,'hex')),false);
  assert.equal(f.world.proofs,0);assert.equal(f.world.sends,0);
});
