/** Private native D26 observation after original process replacement. The
 * issuer token, encrypted original record, fixed 12-role loader and owned EVM
 * history establish provenance. No account/owner/provider or economic brand is
 * recreated. There is no prove/fund/submit/reconcile/ack method. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {randomBytes,createHash,createPublicKey,verify} from 'node:crypto';
import {reopenNativeValueD26ObservationSystemV1,assertOwnedNativeValueObservationSystemV1}
  from '../../operations/deployments/native-value/native-value-system-v2.mjs';
import {createNativeValueObservationStateReaderV1} from '../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import {createNativeValueObservationOwnerObserverV1} from '../../../../custody/src/observers/native-value-owner-observer-v2.mjs';
import {flatAccountAsset,flatAccountCalldataHash,validateFlatAccountOwnerObservation} from './flat-account-validation.mjs';
import {sha,immutable,copy} from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import {decodeWalletPoolInputs} from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {exactRecord} from '../../execution/encoding/commitments.mjs';
import {nativeProofCalldata} from '../../../../engine/src/execution/native/dispatch/native-deployment.mjs';
import {originalAccountAccessMessageV2,normalizeOriginalAccountAccessV2,normalizeOriginalAccountSignatureV2,
  validateOriginalAccountFreshV2,ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2} from '../../../../mobile-protocol/src/original-account-review-v2.mjs';
const issued=new WeakMap(),bare=value=>value.slice(2),byteSHA=value=>createHash('sha256').update(value).digest('hex');
const nonce=()=>randomBytes(32).toString('hex');
export const DEVICE_D26_RECOVERY_READ_DOMAIN_V1='LIANUM_DEVICE_D26_RECOVERY_READ_V1';
/** Fixed new domain; an old diagnostic READ signature is not recovery consent.
 * Context hash is delivered only by the authenticated operator bootstrap. */
export function deviceD26RecoveryReadMessageV1(challenge,contextSHA256){
  assert.equal(arguments.length,2);assert.match(contextSHA256,/^[0-9a-f]{64}$/);
  const access=normalizeOriginalAccountAccessV2(challenge);assert.equal(access.action,'read');
  return Buffer.concat([Buffer.from(DEVICE_D26_RECOVERY_READ_DOMAIN_V1+'\n'+contextSHA256+'\n','ascii'),
    Buffer.from(originalAccountAccessMessageV2(access))]);
}
export function assertRecoveredDeviceD26ObservationV1(capability){
  assert.equal(arguments.length,1);assert.ok(!types.isProxy(capability)&&issued.has(capability),'NATIVE_D26_ORIGINAL_OBSERVATION_REQUIRED');
  issued.get(capability).live();
}
export async function createRecoveredDeviceD26ObservationV1(token,runtime){
  assert.equal(arguments.length,2);
  const loaded=await reopenNativeValueD26ObservationSystemV1(token,runtime),{system,deposit}=loaded;
  try {
    exactRecord(deposit,['schema','poolIndex','identity','identitySHA256','asset','accountIdentity','config','row','system','descriptor']);
    assert.equal(deposit.schema,'ORIGINAL_NATIVE_DEVICE_D26_OBSERVATION_V1');
    const {poolIndex,row,descriptor}=deposit,pool=system.pools[poolIndex];assert.ok(poolIndex===0||poolIndex===1);
    assert.ok(['FUNDING_UNKNOWN','CONFIRMED'].includes(row.stage));assert.equal(row.submission?.dispatchLatched,true);
    assert.equal(row.proofSHA256,byteSHA(Buffer.from(row.proof.proof,'hex')));assert.equal(row.publicInputsSHA256,sha(row.proof.publicInputs));
    assert.equal(row.submission.calldataSHA256,flatAccountCalldataHash(row.submission.calldata));
    assert.deepEqual(row.submission.publicInputs,row.proof.publicInputs);assert.deepEqual(row.submission.statement,row.consent.statement);
    const decoded=decodeWalletPoolInputs('deposit_balance',row.proof.publicInputs);
    for(const field of ['scope','policy','output'])assert.equal(bare(decoded[field]),row.consent.statement[field]);
    for(const field of ['amount','epoch'])assert.equal(decoded[field],row.consent.statement[field]);
    for(const field of ['origin','pairingId','devicePublicKey'])assert.equal(descriptor[field],row.consent[field]);
    assert.match(row.nullifier,/^[0-9a-f]{64}$/);assert.notEqual(row.nullifier,'0'.repeat(64));
    const observer=await createNativeValueObservationOwnerObserverV1({runtime,system,poolIndex});
    assert.deepEqual(observer.identity,deposit.identity);assert.equal(sha(observer.identity),deposit.identitySHA256);
    const asset=flatAccountAsset({identity:observer.identity,chainId:runtime.metadata.chainId,
      genesis:bare(runtime.metadata.evmGenesis),poolCodeHash:bare(pool.codeHash),assetMetadata:pool.assetMetadata});
    assert.deepEqual(asset,deposit.asset);assert.equal(sha(deposit.accountIdentity),row.consent.binding.accountIdentitySHA256);
    assert.equal(deposit.config.lifetime,row.consent.binding.originalAccountLifetime);
    const reader=await createNativeValueObservationStateReaderV1({runtime,system,poolIndex}),head=await reader.read();
    const verifier=system.verifiers.deposit_balance;
    const encoded=row.proof.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0'));
    assert.equal(await runtime.call({to:verifier.address,
      data:nativeProofCalldata(verifier.artifact,'verify(bytes,bytes32[])',Buffer.from(row.proof.proof,'hex'),encoded)},head.header.number),
      '0x'+'0'.repeat(63)+'1','NATIVE_D26_RECOVERY_DEPLOYED_VERIFIER_REJECTED');
    await reader.assertCurrent(head);
    const contextSHA256=sha({profile:DEVICE_D26_RECOVERY_READ_DOMAIN_V1,descriptor,jobId:row.jobId,
      rootId:row.consent.rootId,statement:row.consent.statement,nullifier:row.nullifier,asset,
      proofSHA256:row.proofSHA256,publicInputsSHA256:row.publicInputsSHA256,originalLifetime:deposit.config.lifetime});
    const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
      x:Buffer.from(descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),
      y:Buffer.from(descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});
    const pending=new Map();let closed=false,busy=false,running=Promise.resolve(),closePromise;
    const live=()=>{assert.equal(closed,false,'NATIVE_D26_OBSERVATION_CLOSED');assertOwnedNativeValueObservationSystemV1(runtime,system);};
    const result=(stage,observation=null)=>immutable({version:1,profile:'RECOVERED_ORIGINAL_DEVICE_D26_OBSERVATION_V1',
      jobId:row.jobId,stage,observation,sourceSpent:stage==='SPENT',
      scope:{observeOnly:true,economicAuthorityRestored:false,ownerRestored:false,providerRestored:false,
        replayOrResendPermitted:false,mobileCanonicalRpcVerification:false}});
    async function originalObservation(){
      live();const observation=await observer.readTransaction({kind:'deposit',identitySHA256:deposit.identitySHA256,
        transactionHash:row.submission.transactionHash,calldataSHA256:row.submission.calldataSHA256});live();
      if(observation===null)return result('FUNDING_UNKNOWN');
      validateFlatAccountOwnerObservation({identity:deposit.identity,artifact:pool.artifact,submission:row.submission,authorization:null,observation});
      const view=await reader.read();live();await reader.assertCurrent(view);live();
      const positions=view.ledger.commitments.flatMap((leaf,index)=>leaf==='0x'+row.consent.statement.output?[index]:[]);
      assert.equal(positions.length,1,'NATIVE_D26_RECOVERY_ORIGINAL_OUTPUT_REQUIRED');
      if(view.ledger.nullifiers.includes('0x'+row.nullifier)){await reader.assertCurrent(view);live();return result('SPENT');}
      const originalPath=view.ledger.tree.path(positions[0]);assert.equal(originalPath.leaf,'0x'+row.consent.statement.output);
      const receipt=await runtime.receipt('0x'+observation.transaction.hash);assert.ok(receipt);await runtime.checkReceipt(receipt);
      await reader.assertCurrent(view);live();const observedAt=Date.now();
      return result('CONFIRMED',copy({version:1,profile:'ORIGINAL_DEVICE_D26_INCLUSION_V1',jobId:row.jobId,rootId:row.consent.rootId,
        commitment:row.consent.statement.output,amount:row.consent.statement.amount,assetId:asset.assetId,pool:asset.pool,
        scope:asset.scope,policy:asset.policy,genesis:asset.genesis,domainCommitment:deposit.identity.domainCommitment,
        proofSHA256:row.proofSHA256,publicInputsSHA256:row.publicInputsSHA256,transactionHash:observation.transaction.hash,
        calldataSHA256:row.submission.calldataSHA256,receiptBlockHash:observation.receipt.blockHash,head:copy(view.head),
        path:{root:bare(originalPath.root),index:originalPath.index,leaf:bare(originalPath.leaf),siblings:originalPath.siblings.map(bare)},
        nullifier:row.nullifier,observedAt,expiresAt:observedAt+15000,nativeEffectsEstablished:true,mobileKeyCustody:true,
        backendOpeningDisclosure:'ONE_D26_OPENING',mobileCanonicalRpcVerification:false}));
    }
    const capability=Object.freeze({
      /** Private operator handoff only; it is never a GET/bootstrap response. */
      operatorBootstrap(){assert.equal(arguments.length,0);live();return immutable({...descriptor,contextSHA256,
        profile:DEVICE_D26_RECOVERY_READ_DOMAIN_V1,observeOnly:true});},
      challenge(){assert.equal(arguments.length,0);live();assert.equal(busy,false,'NATIVE_D26_OBSERVATION_BUSY');
        for(const [id,value]of pending)if(value.expiresAt<=Date.now())pending.delete(id);
        assert.ok(pending.size<4,'NATIVE_D26_OBSERVATION_CHALLENGE_CAPACITY');
        const access=normalizeOriginalAccountAccessV2({version:2,profile:ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2,
          ...descriptor,challengeId:nonce(),nonce:nonce(),expiresAt:Date.now()+15000,action:'read'});
        pending.set(access.challengeId,access);return copy(access);},
      async read(input){
        assert.equal(arguments.length,1);live();assert.equal(busy,false,'NATIVE_D26_OBSERVATION_BUSY');
        assert.ok(input&&!types.isProxy(input)&&Object.getPrototypeOf(input)===Object.prototype);
        exactRecord(input,['challenge','signature']);assert.ok(!types.isProxy(input.challenge));
        const access=validateOriginalAccountFreshV2(normalizeOriginalAccountAccessV2(input.challenge));
        assert.equal(sha(access),sha(pending.get(access.challengeId)),'NATIVE_D26_ORIGINAL_READ_CHALLENGE');
        const signature=normalizeOriginalAccountSignatureV2(input.signature);
        assert.equal(verify('sha256',deviceD26RecoveryReadMessageV1(access,contextSHA256),{key,dsaEncoding:'ieee-p1363'},
          Buffer.from(signature,'hex')),true,'NATIVE_D26_RECOVERY_DEVICE_SIGNATURE');
        // Consume before ANY RPC; closure never retries or changes a latch.
        pending.delete(access.challengeId);busy=true;
        running=(async()=>{try{const value=await originalObservation();live();validateOriginalAccountFreshV2(access);return value;}finally{busy=false;}})();return running;
      },
      close(){assert.equal(arguments.length,0);if(closePromise)return closePromise;closed=true;pending.clear();
        closePromise=(async()=>{await Promise.allSettled([running]);loaded.close();const cleanup=await runtime.close();
          return Object.freeze({closed:true,originalObservationSettled:true,runtimeCleanup:cleanup,economicAuthorityRestored:false});})();return closePromise;}
    });
    issued.set(capability,{live});return capability;
  }catch(error){loaded.close();throw error;}
}
