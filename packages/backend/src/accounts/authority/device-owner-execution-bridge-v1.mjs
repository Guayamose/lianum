/** Private continuation of one device U/S bridge. The fixed bootstrap supplies
 * original provider custodies and the account's same native executor. Requests
 * contain neither providers nor an execution replacement/callback. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';
import {exactRecord} from '../../execution/encoding/commitments.mjs';
import {cloneInput} from '../../execution/account/preparation/readiness-inputs.mjs';
import {assertOwnedNativeValueExecution} from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import {assertOwnedNativeValueProviderCustody} from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import {assertDeviceOwnerReservationBridgeV1,deviceOwnerReservationBridgeActorV1} from './device-owner-reservation-bridge-v1.mjs';
import {installDeviceOwnerExecutionV1,readDeviceOwnerExecutionStatusV1,runDeviceOwnerExecutionAuthorizationV1,
  installOriginalNativePrivateExitV2,assertOwnedNativeValueAccountAuthority,prepareDeviceOwnerExitV1,readDeviceOwnerExitStatusV1,runDeviceOwnerExitAuthorizationV1,readDeviceOwnerOutputBalanceV1,readDeviceOwnerRecoveryArmTermsV1,runDeviceOwnerRecoveryArmAuthorizationV1}
  from './native-value-account-authority-v2.mjs';
import {createNativeValueSystemStateReader} from '../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import {normalizeOriginalAccountSignatureV2} from '../../../../mobile-protocol/src/original-account-review-v2.mjs';
import {DEVICE_EXECUTION_CONSENT_V1,normalizeDeviceExecutionConsentV1,validateDeviceExecutionConsentFreshV1,
  deviceExecutionConsentMessageV1} from '../../../../mobile-protocol/src/device-execution-consent-v1.mjs';
import {DEVICE_RECOVERY_ARM_V1,normalizeDeviceRecoveryArmConsentV1,validateDeviceRecoveryArmConsentFreshV1,deviceRecoveryArmConsentMessageV1,normalizeDeviceRecoveryArmStatusV1}
  from '../../../../mobile-protocol/src/device-recovery-arm-consent-v1.mjs';
import {DEVICE_RESERVATION_CONSENT_V1} from '../../../../mobile-protocol/src/device-reservation-consent-v1.mjs';
import {originalAccountAccessMessageV2} from '../../../../mobile-protocol/src/original-account-review-v2.mjs';
import {DEVICE_OUTPUT_BALANCE_V1,normalizeDeviceOutputBalanceV1} from '../../../../mobile-protocol/src/device-output-balance-v1.mjs';
import {DEVICE_EXIT_CONSENT_V1,DEVICE_EXIT_DISCLOSURE_V1,normalizeDeviceExitConsentV1,validateDeviceExitConsentFreshV1,
  deviceExitConsentMessageV1,normalizeDeviceExitWitnessV1,deviceExitWitnessBytesV1,wipeDeviceExitWitnessV1}
  from '../../../../mobile-protocol/src/device-exit-consent-v1.mjs';
import * as PrivateExit from '../../../../mobile-protocol/src/device-native-private-exit-v2.mjs';
import {createOriginalNativePrivateExitProofClientV2} from '../../../../proofs/src/jobs/native-device-private-exit-client-v2.mjs';
const bridges=new WeakMap(),admissions=new WeakMap(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exitNormalize=PrivateExit.normalizeDeviceExitConsentEitherV2,exitFresh=PrivateExit.validateDeviceExitConsentEitherFreshV2,exitMessage=PrivateExit.deviceExitConsentEitherMessageV2;
const nonce=()=>randomBytes(32).toString('hex');
export function createDeviceOwnerExecutionBridgeV1(input){assert.equal(arguments.length,1);return createExecutionBridge(input,false);}
export function createOriginalNativePrivateExecutionBridgeV2(input){assert.equal(arguments.length,1);return createExecutionBridge(input,true);}
export function isOriginalNativePrivateExecutionBridgeV2(bridge){assert.equal(arguments.length,1);const r=bridges.get(bridge);if(!r)return false;r.original();return r.privateW39;}
async function createExecutionBridge(input,privateW39){
  assert.equal(arguments.length,2);exactRecord(input,['account','reservationBridge','nativeExecution','providers','runtime','system','poolIndex']);
  const {account,reservationBridge,nativeExecution,runtime,system,poolIndex}=input;
  const original=()=>{assertOwnedNativeValueAccountAuthority(account,{runtime,system,poolIndex});
    assertDeviceOwnerReservationBridgeV1(reservationBridge,account);assertOwnedNativeValueExecution(nativeExecution,{runtime,system,poolIndex});};
  original();const descriptor=assertDeviceOwnerReservationBridgeV1(reservationBridge,account),actor=deviceOwnerReservationBridgeActorV1(reservationBridge);
  assert.ok(Array.isArray(input.providers)&&input.providers.length>0&&input.providers.length<=4);
  const providers=Object.freeze(input.providers.map(row=>{exactRecord(row,['slot','custody','deliveryRiskSalt']);
    assert.ok(Number.isSafeInteger(row.slot)&&row.slot>=0&&row.slot<4);assertOwnedNativeValueProviderCustody(row.custody,{runtime,system,poolIndex});
    assert.match(row.deliveryRiskSalt,/^[0-9a-f]{64}$/);assert.notEqual(row.deliveryRiskSalt,'0'.repeat(64));return Object.freeze({...row});}));
  const reader=await createNativeValueSystemStateReader({runtime,system,poolIndex});
  const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
    x:Buffer.from(descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),
    y:Buffer.from(descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});
  let closed=false,busy=false,completion;const armPending=new Map(),pending=new Map(),admitted=new Map(),exitQuotes=new Map(),exitPending=new Map(),exitSources=new Set();
  const live=()=>{assert.ok(!closed,'DEVICE_EXECUTION_BRIDGE_CLOSED');original();};
  const grant=value=>{const cap=Object.freeze(Object.defineProperty(Object.create(null),'toJSON',{
    value(){throw Error('DEVICE_EXECUTION_NOT_SERIALIZABLE');}}));admissions.set(cap,{bridge,account,...value,consumed:false});return cap;};
  async function challenge(input,action){exactRecord(input,['access','signature','jobId']);live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
    try{const binding=await actor.deviceDepositSignedReadBindingV1({challenge:cloneInput(input.access),signature:input.signature});live();
      const status=await readDeviceOwnerExecutionStatusV1(account,bridge,input.jobId),view=await reader.read();await reader.assertCurrent(view);live();
      assert.equal(status.reservation.stage,'RESERVED','DEVICE_EXECUTION_ORIGINAL_S_REQUIRED');
      for(const[id,row]of pending)if(row.consumed||row.value.reservation.expiresAt<=Date.now())pending.delete(id);
      assert.ok(pending.size<4,'DEVICE_EXECUTION_CHALLENGE_CAPACITY');
      const value=normalizeDeviceExecutionConsentV1({version:1,profile:DEVICE_EXECUTION_CONSENT_V1,action,
        reservation:{version:1,profile:DEVICE_RESERVATION_CONSENT_V1,action:'OBSERVE_S',...descriptor,
          challengeId:nonce(),nonce:nonce(),expiresAt:Date.now()+15000,binding,poolTerms:{scope:view.domain.scope,policy:view.domain.policy,
            codeHash:account.config.registry[0].codeHash,assetIdentity:view.domain.asset,domainCommitment:view.domainCommitment},
          ...status.reservation.consentFields,observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},openingDisclosure:null},
        nativeBindingSHA256:status.nativeBindingSHA256,reservationTransactionHash:status.reservation.observation.transactionHash,
        executionSnapshotSHA256:status.executionSnapshotSHA256,lossClause:status.lossClause});
      // Enforce the protected signer capacity before returning any challenge.
      deviceExecutionConsentMessageV1(value);pending.set(value.reservation.challengeId,{value,consumed:false});return cloneInput(value);
    }finally{busy=false;}}
  async function work(input,action){exactRecord(input,['consent','signature']);live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
    let retained,failure;try{const consent=validateDeviceExecutionConsentFreshV1(cloneInput(input.consent)),row=pending.get(consent.reservation.challengeId);
      assert.ok(row&&!row.consumed&&consent.action===action,'DEVICE_EXECUTION_ORIGINAL_CONSENT');assert.deepEqual(consent,row.value);
      assert.equal(verify('sha256',deviceExecutionConsentMessageV1(consent),{key,dsaEncoding:'ieee-p1363'},
        Buffer.from(normalizeOriginalAccountSignatureV2(input.signature),'hex')),true,'DEVICE_EXECUTION_DEVICE_SIGNATURE');
      assert.deepEqual(await actor.deviceDepositOriginalBinding(),consent.reservation.binding,'DEVICE_EXECUTION_BINDING_CHANGED');live();
      validateDeviceExecutionConsentFreshV1(consent);const id=consent.reservation.jobId+':'+action;
      if(action==='EXECUTE_NATIVE')assert.ok(!admitted.has(id),'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
      row.consumed=true;retained=Promise.withResolvers();retained.promise.catch(()=>{});
      if(action==='EXECUTE_NATIVE')admitted.set(id,retained.promise);completion=retained.promise;
      return await runDeviceOwnerExecutionAuthorizationV1(account,bridge,grant({action,consent}));
    }catch(error){failure=error;throw error;}finally{busy=false;if(retained){if(failure)retained.reject(failure);else retained.resolve();}}}
  async function exitRead(input){const binding=await actor.deviceDepositSignedReadBindingV1({challenge:cloneInput(input.access),signature:input.signature});
    live();return{binding,authorizationSHA256:sha(originalAccountAccessMessageV2(input.access))};}
  async function issueExit(action,binding,fields,view,path=null){for(const[id,row]of exitPending)if(row.consumed||row.value.expiresAt<=Date.now()){exitPending.delete(id);if(!row.consumed)await row.client?.close();clearTimeout(row.timer);}
    assert.ok(exitPending.size<4,'DEVICE_EXIT_CHALLENGE_CAPACITY');
    let client=null,recipient=null;try{if(privateW39&&action==='PROVE_W39'){assert.ok(path);client=createOriginalNativePrivateExitProofClientV2();recipient=await client.prepare([...Array.from({length:8},(_,i)=>String(parseInt(fields.statement.scope.slice(i*8,i*8+8),16))),...Array.from({length:8},(_,i)=>String(parseInt(fields.statement.policy.slice(i*8,i*8+8),16))),fields.statement.epoch,...Array.from({length:8},(_,i)=>String(parseInt(fields.statement.root.slice(i*8,i*8+8),16))),...Array.from({length:8},(_,i)=>String(parseInt(fields.statement.nullifier.slice(i*8,i*8+8),16))),fields.statement.amount,...Array.from({length:5},(_,i)=>String(parseInt(fields.statement.recipient.slice(i*8,i*8+8),16)))]);live();await reader.assertCurrent(view);}
    let raw={version:privateW39?2:1,profile:privateW39?PrivateExit.DEVICE_NATIVE_PRIVATE_EXIT_V2:DEVICE_EXIT_CONSENT_V1,action,...descriptor,challengeId:nonce(),nonce:nonce(),
      expiresAt:Date.now()+15000,binding,poolTerms:{scope:view.domain.scope,policy:view.domain.policy,codeHash:account.config.registry[0].codeHash,
      assetIdentity:view.domain.asset,domainCommitment:view.domainCommitment},...fields,observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},
      openingDisclosure:action==='PROVE_W39'?(privateW39?'ENCRYPTED_W39_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT':DEVICE_EXIT_DISCLOSURE_V1):null};
    if(privateW39){raw.privateProof=recipient?{profile:PrivateExit.DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2,recipient,path,transcriptSHA256:'0'.repeat(64)}:null;if(recipient)raw.privateProof.transcriptSHA256=sha(PrivateExit.nativePrivateExitTranscriptBytesV2(raw));}
    const value=exitNormalize(raw);exitMessage(value);exitFresh(value);const row={value,consumed:false,client,timer:null};if(client)row.timer=setTimeout(()=>{if(!row.consumed){exitPending.delete(value.challengeId);void client.close();}},15000);exitPending.set(value.challengeId,row);return cloneInput(value);
    }catch(error){await client?.close();throw error;}}
  async function challengeExit(input,action){exactRecord(input,['access','signature','jobId']);live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
    try{const {binding}=await exitRead(input),row=await readDeviceOwnerExitStatusV1(account,bridge,input.jobId),view=await reader.read();await reader.assertCurrent(view);
      if(action==='WITHDRAW_W39')assert.equal(row.stage,'PROVED','DEVICE_EXIT_PROVED_REQUIRED');return await issueExit(action,binding,row.consentFields,view);
    }finally{busy=false;}}
  async function exitWork(input,action){exactRecord(input,action==='PROVE_W39'?['consent','signature','witness']:['consent','signature']);
    live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;let retained,failure,witness,privateClient;
    try{const consent=exitFresh(cloneInput(input.consent)),row=exitPending.get(consent.challengeId);
      assert.ok(row&&!row.consumed&&consent.action===action,'DEVICE_EXIT_ORIGINAL_CONSENT');assert.deepEqual(consent,row.value);
      assert.equal(verify('sha256',exitMessage(consent),{key,dsaEncoding:'ieee-p1363'},
        Buffer.from(normalizeOriginalAccountSignatureV2(input.signature),'hex')),true,'DEVICE_EXIT_DEVICE_SIGNATURE');
      assert.deepEqual(await actor.deviceDepositOriginalBinding(),consent.binding,'DEVICE_EXIT_BINDING_CHANGED');live();exitFresh(consent);
      const workKey=consent.jobId+':'+action;if(action!=='OBSERVE_W39')assert.ok(!admitted.has(workKey),'DEVICE_EXIT_RECONCILE_ORIGINAL_ONLY');
      if(action==='PROVE_W39'){assert.ok(!exitSources.has(consent.statement.commitment),'DEVICE_EXIT_ORIGINAL_SOURCE_ALREADY_ADMITTED');
        if(privateW39){assert.ok(row.client&&consent.version===2,'NATIVE_PRIVATE_EXIT_ORIGINAL_RECIPIENT');privateClient=row.client;const packet=cloneInput(input.witness);exactRecord(packet,['type','profile','relation','role','jobId','recipientPublicKey','senderPublicKey','authorization','publicInputsSHA256','salt','iv','tag','ciphertext']);for(const n of ['profile','relation','role','jobId','recipientPublicKey'])assert.equal(packet[n],consent.privateProof.recipient[n]);assert.deepEqual(packet.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:consent.jobId,consentSHA256:sha(exitMessage(consent)),witnessSHA256:consent.witnessSHA256});assert.equal(packet.publicInputsSHA256,sha(Buffer.from(JSON.stringify(PrivateExit.nativePrivateExitPublicInputsV2(consent)))));assert.ok(typeof packet.ciphertext==='string'&&packet.ciphertext.length<=16384);witness=packet;}else{witness=normalizeDeviceExitWitnessV1(cloneInput(input.witness));const bytes=deviceExitWitnessBytesV1(witness);try{assert.equal(sha(bytes),consent.witnessSHA256,'DEVICE_EXIT_WITNESS_CHANGED');}finally{bytes.fill(0);}}exitSources.add(consent.statement.commitment);}
      row.consumed=true;clearTimeout(row.timer);retained=Promise.withResolvers();retained.promise.catch(()=>{});
      if(action!=='OBSERVE_W39')admitted.set(workKey,retained.promise);completion=retained.promise;
      return await runDeviceOwnerExitAuthorizationV1(account,bridge,grant({action,consent,witness,privateW39,client:privateClient}));
    }catch(error){failure=error;throw error;}finally{if(privateW39){if(witness)witness.ciphertext=null;await privateClient?.close();}else wipeDeviceExitWitnessV1(witness);busy=false;
      if(retained){if(failure)retained.reject(failure);else retained.resolve();}}}
  async function armChallenge(input,action){
    const execution=await challenge(input,'RECONCILE_NATIVE');pending.delete(execution.reservation.challengeId);live();
    const terms=await readDeviceOwnerRecoveryArmTermsV1(account,bridge,input.jobId);live();
    for(const[id,row]of armPending)if(row.consumed||row.value.execution.reservation.expiresAt<=Date.now())armPending.delete(id);
    assert.ok(armPending.size<4,'DEVICE_LIVE_RECOVERY_CHALLENGE_CAPACITY');
    const value=normalizeDeviceRecoveryArmConsentV1({version:1,profile:DEVICE_RECOVERY_ARM_V1,action,execution,settleBefore:terms.settleBefore});
    validateDeviceRecoveryArmConsentFreshV1(value);deviceRecoveryArmConsentMessageV1(value);
    armPending.set(execution.reservation.challengeId,{value,consumed:false});return cloneInput(value);
  }
  async function armWork(input,action){exactRecord(input,['consent','signature']);live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
    let retained,failure;try{const consent=validateDeviceRecoveryArmConsentFreshV1(cloneInput(input.consent));
      const row=armPending.get(consent.execution.reservation.challengeId);assert.ok(row&&!row.consumed&&consent.action===action,'DEVICE_LIVE_RECOVERY_ORIGINAL_CONSENT');
      assert.deepEqual(consent,row.value);assert.equal(verify('sha256',deviceRecoveryArmConsentMessageV1(consent),{key,dsaEncoding:'ieee-p1363'},
        Buffer.from(normalizeOriginalAccountSignatureV2(input.signature),'hex')),true,'DEVICE_LIVE_RECOVERY_DEVICE_SIGNATURE');
      assert.deepEqual(await actor.deviceDepositOriginalBinding(),consent.execution.reservation.binding,'DEVICE_LIVE_RECOVERY_BINDING_CHANGED');
      live();validateDeviceRecoveryArmConsentFreshV1(consent);row.consumed=true;
      retained=Promise.withResolvers();retained.promise.catch(()=>{});completion=retained.promise;
      return normalizeDeviceRecoveryArmStatusV1(await runDeviceOwnerRecoveryArmAuthorizationV1(account,bridge,grant({action,consent})));
    }catch(error){failure=error;throw error;}finally{busy=false;if(retained){if(failure)retained.reject(failure);else retained.resolve();}}
  }
  const bridge=Object.freeze({challengeExecution(input){assert.equal(arguments.length,1);return challenge(input,'EXECUTE_NATIVE');},
    execute(input){assert.equal(arguments.length,1);return work(input,'EXECUTE_NATIVE');},
    challengeReconciliation(input){assert.equal(arguments.length,1);return challenge(input,'RECONCILE_NATIVE');},
    reconcile(input){assert.equal(arguments.length,1);return work(input,'RECONCILE_NATIVE');},
    challengeRecovery(input){assert.equal(arguments.length,1);return challenge(input,'RECOVER_NATIVE');},
    challengeRecoveryArm(input){assert.equal(arguments.length,1);return armChallenge(input,'ARM_RECOVERY');},
    challengeRecoveryDisarm(input){assert.equal(arguments.length,1);return armChallenge(input,'DISARM_RECOVERY');},
    armRecovery(input){assert.equal(arguments.length,1);return armWork(input,'ARM_RECOVERY');},
    disarmRecovery(input){assert.equal(arguments.length,1);return armWork(input,'DISARM_RECOVERY');},
    async observeRecoveryArm(input){assert.equal(arguments.length,1);exactRecord(input,['access','signature','jobId']);live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
      try{const access=await exitRead(input),terms=await readDeviceOwnerRecoveryArmTermsV1(account,bridge,input.jobId);live();
        assert.ok(input.access.expiresAt>Date.now(),'DEVICE_LIVE_RECOVERY_READ_EXPIRED');
        return normalizeDeviceRecoveryArmStatusV1({...terms,authorizationSHA256:access.authorizationSHA256});}finally{busy=false;}},
    recover(input){assert.equal(arguments.length,1);return work(input,'RECOVER_NATIVE');},
    async observeOutputBalances(input){assert.equal(arguments.length,1);exactRecord(input,['access','signature','parentJobId','rootId','noteRevision','changeNullifier','recoveryNullifier']);
      live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
      try{const access=await exitRead(input),observed=await readDeviceOwnerOutputBalanceV1(account,bridge,Object.fromEntries(
          ['parentJobId','rootId','noteRevision','changeNullifier','recoveryNullifier'].map(name=>[name,input[name]])));live();
        assert.ok(input.access.expiresAt>Date.now(),'DEVICE_OUTPUT_READ_EXPIRED');
        return normalizeDeviceOutputBalanceV1({version:1,profile:DEVICE_OUTPUT_BALANCE_V1,...descriptor,...observed,
          expiresAt:Math.min(input.access.expiresAt,Date.now()+15000),authorizationSHA256:access.authorizationSHA256});
      }finally{busy=false;}},
    async prepareExit(input){assert.equal(arguments.length,1);exactRecord(input,['access','signature','parentJobId','noteRole','rootId','noteRevision','nullifier','recipient']);
      live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
      try{const access=await exitRead(input),terms=await prepareDeviceOwnerExitV1(account,bridge,Object.fromEntries(
          ['parentJobId','noteRole','rootId','noteRevision','nullifier','recipient'].map(name=>[name,input[name]])));
        // Preserve the same original W39 intent across READ/biometric delay.
        // Each renewal still performs the complete original fresh ledger read.
        // Changed path/root/epoch/recipient cannot silently replace that intent.
        const old=[...exitQuotes.values()].find(row=>row.parentJobId===terms.parentJobId&&row.noteRole===terms.noteRole&&row.rootId===terms.rootId);
        if(old)for(const name of ['nativeBindingSHA256','noteRevision','statement','path','poolTerms'])
          assert.deepEqual(old[name],terms[name],'DEVICE_EXIT_ORIGINAL_QUOTE_CHANGED');
        else assert.ok(exitQuotes.size<4,'DEVICE_EXIT_QUOTE_CAPACITY');
        const quote={version:privateW39?2:1,profile:privateW39?'LIANUM_DEVICE_ORIGINAL_W39_QUOTE_PRIVATE_V2':'LIANUM_DEVICE_ORIGINAL_W39_QUOTE_V1',...descriptor,quoteId:old?.quoteId??nonce(),...terms,
          expiresAt:Math.min(input.access.expiresAt,Date.now()+15000)};exitQuotes.set(quote.quoteId,cloneInput(quote));
        return{quote,authorizationSHA256:access.authorizationSHA256};}finally{busy=false;}},
    async challengeExitJob(input){assert.equal(arguments.length,1);exactRecord(input,['access','signature','quoteId','jobId','witnessSHA256']);
      live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
      try{const {binding}=await exitRead(input),quote=exitQuotes.get(input.quoteId);assert.ok(quote&&quote.expiresAt>Date.now(),'DEVICE_EXIT_ORIGINAL_QUOTE_REQUIRED');
        if(privateW39){const terms=await prepareDeviceOwnerExitV1(account,bridge,Object.fromEntries(['parentJobId','noteRole','rootId','noteRevision'].map(n=>[n,quote[n]]).concat([['nullifier',quote.statement.nullifier],['recipient',quote.statement.recipient]])));for(const n of ['statement','path','nativeBindingSHA256'])assert.deepEqual(terms[n],quote[n],'DEVICE_EXIT_ORIGINAL_QUOTE_CHANGED');}const view=await reader.read();await reader.assertCurrent(view);return await issueExit('PROVE_W39',binding,{poolTerms:quote.poolTerms,
          ...Object.fromEntries(['parentJobId','nativeBindingSHA256','rootId','noteRevision','noteRole','statement'].map(name=>[name,quote[name]])),
          quoteId:quote.quoteId,jobId:input.jobId,witnessSHA256:input.witnessSHA256,proofSHA256:null,publicInputsSHA256:null},view,quote.path);
      }finally{busy=false;}},
    proveExit(input){assert.equal(arguments.length,1);return exitWork(input,'PROVE_W39');},
    challengeWithdrawal(input){assert.equal(arguments.length,1);return challengeExit(input,'WITHDRAW_W39');},
    withdraw(input){assert.equal(arguments.length,1);return exitWork(input,'WITHDRAW_W39');},
    challengeExitObservation(input){assert.equal(arguments.length,1);return challengeExit(input,'OBSERVE_W39');},
    observeExit(input){assert.equal(arguments.length,1);return exitWork(input,'OBSERVE_W39');},
    close(){assert.equal(arguments.length,0);closed=true;armPending.clear();pending.clear();const stops=[];for(const row of exitPending.values()){clearTimeout(row.timer);if(row.client&&!row.consumed)stops.push(row.client.close());}exitPending.clear();exitQuotes.clear();return privateW39?Promise.all(stops).then(()=>({closed:true,originalWorkRetained:true})):{closed:true,originalWorkRetained:true};}});
  bridges.set(bridge,{privateW39,account,reservationBridge,nativeExecution,providers,actor,descriptor,original,
    installationConsumed:false,get completion(){return completion;},
    async durableEffect(method,input){
      exactRecord(input,['consent','signature']);live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
      try{
        const action={execute:'EXECUTE_NATIVE',recover:'RECOVER_NATIVE',withdraw:'WITHDRAW_W39'}[method];
        assert.ok(action,'DEVICE_EXECUTION_ORIGINAL_EFFECT');
        const exit=method==='withdraw',validate=exit?exitFresh:validateDeviceExecutionConsentFreshV1;
        const message=exit?exitMessage:deviceExecutionConsentMessageV1;
        const consent=validate(cloneInput(input.consent)),base=exit?consent:consent.reservation;
        const row=(exit?exitPending:pending).get(base.challengeId);
        assert.ok(row&&!row.consumed&&consent.action===action,'DEVICE_EXECUTION_ORIGINAL_CONSENT');
        assert.deepEqual(consent,row.value,'DEVICE_EXECUTION_ORIGINAL_CONSENT');
        assert.equal(verify('sha256',message(consent),{key,dsaEncoding:'ieee-p1363'},
          Buffer.from(normalizeOriginalAccountSignatureV2(input.signature),'hex')),true,'DEVICE_EXECUTION_DEVICE_SIGNATURE');
        assert.deepEqual(await actor.deviceDepositOriginalBinding(),base.binding,'DEVICE_EXECUTION_BINDING_CHANGED');live();validate(consent);
        if(action==='EXECUTE_NATIVE'||exit)assert.ok(!admitted.has(base.jobId+':'+action),'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        return consent;
      }finally{busy=false;}
    }
  });await installDeviceOwnerExecutionV1(account,bridge);if(privateW39)await installOriginalNativePrivateExitV2(account,bridge);return bridge;
}
/** Verifies only an existing original native/W39 challenge before durable
 * admission. Actual execution must authorize it again after the SQL fence. */
export function assertDeviceOwnerExecutionDurableRequestV1(bridge,method,input){
  assert.equal(arguments.length,3);deviceOwnerExecutionBridgeActorV1(bridge);
  return bridges.get(bridge).durableEffect(method,input);
}
export function assertDeviceOwnerExecutionBridgeV1(bridge,account){assert.equal(arguments.length,2);assert.ok(!types.isProxy(bridge));
  const row=bridges.get(bridge);assert.ok(row&&row.account===account,'DEVICE_EXECUTION_ORIGINAL_BRIDGE');row.original();return row.descriptor;}
export function consumeDeviceOwnerExecutionInstallationV1(bridge,account){assertDeviceOwnerExecutionBridgeV1(bridge,account);
  const row=bridges.get(bridge);assert.equal(row.installationConsumed,false,'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_ONCE');
  row.installationConsumed=true;return{reservationBridge:row.reservationBridge,nativeExecution:row.nativeExecution,providers:row.providers,descriptor:row.descriptor};}
export function deviceOwnerExecutionBridgeActorV1(bridge){assert.equal(arguments.length,1);assert.ok(!types.isProxy(bridge));
  const row=bridges.get(bridge);assert.ok(row,'DEVICE_EXECUTION_ORIGINAL_BRIDGE');row.original();return row.actor;}
/** Transport composition authenticates the SAME retained U/S bridge. This
 * reveals no executor/providers and cannot issue an economic authorization. */
export function assertDeviceOwnerExecutionTransportBindingsV1(bridge,reservationBridge){
  assert.equal(arguments.length,2);assert.ok(!types.isProxy(bridge)&&!types.isProxy(reservationBridge));
  const row=bridges.get(bridge);assert.ok(row&&row.reservationBridge===reservationBridge,'DEVICE_EXECUTION_TRANSPORT_BRIDGE_CHANGED');
  row.original();assert.equal(deviceOwnerReservationBridgeActorV1(reservationBridge),row.actor,'DEVICE_EXECUTION_TRANSPORT_ACTOR_CHANGED');
}
export function consumeDeviceOwnerExecutionAuthorizationV1(bridge,cap,account){assert.equal(arguments.length,3);
  assertDeviceOwnerExecutionBridgeV1(bridge,account);assert.ok(!types.isProxy(cap));const row=admissions.get(cap);
  assert.ok(row&&!row.consumed&&row.bridge===bridge&&row.account===account,'DEVICE_EXECUTION_ORIGINAL_ADMISSION');row.consumed=true;return row;}
export async function awaitDeviceOwnerExecutionOriginalWorkV1(bridge){assert.equal(arguments.length,1);assert.ok(!types.isProxy(bridge));
  const row=bridges.get(bridge);assert.ok(row?.completion,'DEVICE_EXECUTION_ORIGINAL_WORK');row.original();await row.completion;row.original();}
