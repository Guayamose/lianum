/** Genuine account/actor/Vault over the existing explicit HOST substrate.
 * No proof, funding, native dispatch or mobile hardware acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createHash,createECDH,createPublicKey,verify} from 'node:crypto';
import {fixture,createActorModule} from './paired-original-account-host-fixture.mjs';
import {originalAccountAccessMessageV2} from '../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import {createGenericBalanceNativePreparation,genericBalanceNativeTerms} from '../../../packages/engine/src/execution/balances/generic-balance-native-preparation.mjs';
import {compileFundedGraph} from '../../../packages/engine/src/execution/graph/funded-graph.mjs';
import {normalizeDeviceReservationConsentV1,deviceReservationConsentMessageV1,normalizeDeviceReservationWitnessV1,
  deviceReservationWitnessBytesV1,normalizeDeviceReservationStatusV1,validateDeviceReservationConsentFreshV1,
  wipeDeviceReservationWitnessV1} from '../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
import {normalizeOriginalAccountSignatureV2} from '../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import {exactRecord} from '../../../packages/backend/src/execution/encoding/commitments.mjs';
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
  // Run only the actual original private admission function on this HOST's
  // signed terms. Capture its owned normalization copy; minting a grant is forbidden.
  const originalSource=createDeviceOwnerReservationBridgeV1.toString(),start=originalSource.indexOf('  async function authorize(input,action){'),
    end=originalSource.indexOf('  async function retainedWork',start);
  assert.ok(start>=0&&end>start,'HOST_ORIGINAL_ADMISSION_SOURCE_REQUIRED');
  const rejectedConsent=normalizeDeviceReservationConsentV1({...consent,witnessSHA256:h('different-witness')}),
    pendingRow={value:rejectedConsent,consumed:false},beforeWitness=createHash('sha256').update(JSON.stringify(witness)).digest('hex');
  let ownedWitness,grants=0;
  const admission=runInNewContext('(()=>{'+originalSource.slice(start,end)+';return authorize;})()',{
    assert,Buffer,verify,exactRecord,cloneInput:structuredClone,live(){},
    validateDeviceReservationConsentFreshV1,normalizeOriginalAccountSignatureV2,
    deviceReservationConsentMessageV1,deviceReservationWitnessBytesV1,wipeDeviceReservationWitnessV1,
    normalizeDeviceReservationWitnessV1(raw){ownedWitness=normalizeDeviceReservationWitnessV1(raw);return ownedWitness;},
    pending:new Map([[rejectedConsent.challengeId,pendingRow]]),
    actor:{async deviceDepositOriginalBinding(){return review.binding;}},
    key:createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(f.device.publicKey.slice(2,66),'hex').toString('base64url'),
      y:Buffer.from(f.device.publicKey.slice(66),'hex').toString('base64url')}}),
    sha:bytes=>createHash('sha256').update(bytes).digest('hex'),grant(){grants++;throw Error('HOST_GRANT_FORBIDDEN');}});
  await assert.rejects(admission({consent:rejectedConsent,signature:f.device.sign(deviceReservationConsentMessageV1(rejectedConsent)),witness},'PROVE_U'),
    /DEVICE_RESERVATION_WITNESS_CHANGED/);
  assert.ok(ownedWitness&&Object.values(ownedWitness).every(value=>value===null),'HOST_REJECTED_PRIVATE_WITNESS_NOT_WIPED');
  assert.equal(pendingRow.consumed,false);assert.equal(grants,0);
  assert.equal(createHash('sha256').update(JSON.stringify(witness)).digest('hex'),beforeWitness);
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
// Native imports must follow the original fixture's mock.module installation.
const {createDeviceOwnerExecutionBridgeV1,consumeDeviceOwnerExecutionAuthorizationV1}
  =await import('../../../packages/backend/src/accounts/authority/device-owner-execution-bridge-v1.mjs');
import {normalizeDeviceExecutionConsentV1,deviceExecutionConsentMessageV1,normalizeDeviceExecutionStatusV1,deviceExecutionSnapshotBytesV1}
  from '../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
import {normalizeDeviceExitConsentV1,deviceExitConsentMessageV1,normalizeDeviceExitWitnessV1,deviceExitWitnessBytesV1}
  from '../../../packages/mobile-protocol/src/device-exit-consent-v1.mjs';
import {createBalanceNote,walletWithdrawInput,walletInputPublicWords,balanceWithdrawFrame}
  from '../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {PrivateNoteTree} from '../../../packages/engine/src/notes/private-note-tree.mjs';
import {canonical} from '../../../packages/engine/src/crypto/privacy.mjs';
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
  // Public HOST framing only: independent original canonical oracle keeps
  // an optional deadline diagnostic byte-exact without promoting UNKNOWN.
  const tree=new PrivateNoteTree([Buffer.from(statement.changeCommitment,'hex'),Buffer.from(statement.reserveCommitment,'hex')]),
    path=index=>{const row=tree.path(index);return{root:row.root.slice(2),index:row.index,leaf:row.leaf.slice(2),siblings:row.siblings.map(value=>value.slice(2))};},
    observed={profile:'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1',transactionHash:h('Stx'),blockHash:h('Sblock'),blockNumber:'1',timestamp:'6000',
      sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,changeCommitment:statement.changeCommitment,
      reserveCommitment:statement.reserveCommitment,domainCommitment:f.world.identity.domainCommitment,envelope:h('env'),admissionTag:h('admission'),
      currentHead:{blockNumber:'1',blockHash:h('Sblock'),timestamp:'6000'},changePath:path(0),reservePath:path(1)};
  for(const errorAuditBudget of [{phase:'graph-current',elapsedMilliseconds:30001,limitMilliseconds:30000},
    {round:'pre-key',limitMilliseconds:30000,phase:'after-native-audit',method:'operation',elapsedMilliseconds:30001}]){
    const snapshot={reference:reservation.jobId,stage:'ORIGINAL_OUTCOME_UNRESOLVED',outcome:null,executionStarted:true,
      nativeExposure:[{slot:0,family:'3',status:'POSSIBLE'}],admittedReceipts:0,errorCode:'FLAT_OPERATOR_AUDIT_TOO_OLD',errorCauseCodes:[],errorAuditBudget,
      keeperRestart:false,nodeRestart:false,fullWalletAcceptance:false,claimsEnabled:false};
    const response={jobId:reservation.jobId,reservation:{jobId:reservation.jobId,stage:'RESERVED',consentFields:
      Object.fromEntries(['depositJobId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256'].map(name=>[name,reservation[name]])),
      statement,observation:observed,errorCode:null},nativeBindingSHA256:h('binding'),executionSnapshot:snapshot,
      executionSnapshotSHA256:createHash('sha256').update(canonical(snapshot)).digest('hex'),stage:'UNKNOWN',outcome:null,terminal:null,
      errorCode:'FLAT_OPERATOR_AUDIT_TOO_OLD',lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1',authorizationSHA256:h('nativePoP')};
    const parsed=normalizeDeviceExecutionStatusV1(response),bytes=deviceExecutionSnapshotBytesV1(parsed.executionSnapshot);
    assert.deepEqual(Buffer.from(bytes),Buffer.from(canonical(snapshot)));assert.equal(createHash('sha256').update(bytes).digest('hex'),response.executionSnapshotSHA256);
    assert.equal(parsed.stage,'UNKNOWN');assert.equal(parsed.outcome,null);assert.equal(Object.isFrozen(parsed.executionSnapshot.errorAuditBudget),true);
    assert.throws(()=>normalizeDeviceExecutionStatusV1({...response,executionSnapshot:{...snapshot,privateWitness:h('secret')}}));
    assert.throws(()=>normalizeDeviceExecutionStatusV1({...response,executionSnapshot:{...snapshot,claimsEnabled:true}}));
    assert.throws(()=>normalizeDeviceExecutionStatusV1({...response,stage:'FULFILLED',outcome:'FULFILLED'}));
    bytes.fill(0);
  }
  assert.equal(f.world.proofs,0);assert.equal(f.world.sends,0);
});
test('device W39 retains original note signature/39 words while rejecting root/key and cross-role or recipient PoP reuse',async t=>{
  const {f,actor}=await setup(t),access=actor.challenge({action:'read'}),review=await actor.openReview({challenge:access,signature:f.device.sign(originalAccountAccessMessageV2(access))});
  const asset=f.account.config.registry[0],note=createBalanceNote({scope:asset.scope,policy:asset.policy,value:'75'}),tree=new PrivateNoteTree([note.commitment]),
    witness=walletWithdrawInput({scope:asset.scope,policy:asset.policy,epoch:'10',note,path:tree.path(0),recipient:'a'.repeat(40)}),words=walletInputPublicWords('withdraw_balance',witness);
  assert.equal(words.length,39);assert.deepEqual(walletInputPublicWords('withdraw_balance',normalizeDeviceExitWitnessV1(witness)),words);
  assert.throws(()=>normalizeDeviceExitWitnessV1({...witness,privateKey:h('private')}));assert.throws(()=>normalizeDeviceExitWitnessV1({...witness,rootKey:h('private')}));
  assert.equal(verify('sha256',balanceWithdrawFrame(asset.scope,asset.policy,note.commitment,'a'.repeat(40),'75','10'),
    {key:note.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(witness.signature)),true);
  const payload=deviceExitWitnessBytesV1(witness),consent=normalizeDeviceExitConsentV1({version:1,profile:'LIANUM_DEVICE_ORIGINAL_W39_V1',action:'PROVE_W39',origin,
    pairingId:access.pairingId,devicePublicKey:access.devicePublicKey,challengeId:h('xc'),nonce:h('xn'),expiresAt:Date.now()+15000,binding:review.binding,
    poolTerms:{scope:asset.scope,policy:asset.policy,codeHash:asset.codeHash,assetIdentity:asset.assetIdentity,domainCommitment:f.world.identity.domainCommitment},
    parentJobId:h('parent'),nativeBindingSHA256:h('binding'),quoteId:h('xq'),jobId:h('xj'),rootId:h('root'),noteRevision:4,noteRole:'change',
    statement:{scope:asset.scope,policy:asset.policy,epoch:'10',root:tree.root.slice(2),nullifier:words.slice(25,33).map(x=>BigInt(x).toString(16).padStart(8,'0')).join(''),
      amount:'75',recipient:'a'.repeat(40),commitment:note.commitment.toString('hex')},witnessSHA256:createHash('sha256').update(payload).digest('hex'),proofSHA256:null,publicInputsSHA256:null,
    observed:{blockNumber:'1',blockHash:h('xb'),timestamp:'6000'},openingDisclosure:'ONE_W39_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER'});payload.fill(0);
  const frame=deviceExitConsentMessageV1(consent),signed=f.device.sign(frame),pub=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
    x:Buffer.from(f.device.publicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(f.device.publicKey.slice(66),'hex').toString('base64url')}});
  assert.ok(frame.length<=4096);
  for(const changed of [{...consent,noteRole:'recovery'},{...consent,parentJobId:h('otherparent')},
    {...consent,statement:{...consent.statement,recipient:'b'.repeat(40)}}])
    assert.equal(verify('sha256',deviceExitConsentMessageV1(changed),{key:pub,dsaEncoding:'ieee-p1363'},Buffer.from(signed,'hex')),false);
  assert.equal(f.world.proofs,0);assert.equal(f.world.sends,0);
});
