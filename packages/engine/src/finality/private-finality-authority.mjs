/** PC16 research authority. Two disposable local EVM identities add short-lived
 * current-observation gates to the unchanged PC15 ZK relation. No consensus or
 * instantaneous cross-chain knowledge is implied. Keys stay in owned Anvil. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeCanonicalEffect, verifyNativeCertificate, effectConsumptionHash } from '../notes/private-native-certificate.mjs';
import { noteWordsToHash } from '../notes/private-note-tree.mjs';

export const FINALITY_PROFILE_NAME = 'PC16_CURRENT_OBSERVATION_AUTHORITY_V1';
export const FINALITY_MAX_LEASE_SECONDS = 30;
const sha = bytes => createHash('sha256').update(bytes).digest();
const hex = bytes => `0x${Buffer.from(bytes).toString('hex')}`;
const raw = value => { assert.match(value, /^0x(?:[0-9a-f]{2})+$/); return Buffer.from(value.slice(2), 'hex'); };
const fixed = (value, width) => { const bytes = raw(value); assert.equal(bytes.length, width, 'PC16_FIXED_WIDTH'); return bytes; };
const uint = (value, width) => { assert.ok(typeof value === 'bigint' || typeof value === 'number' && Number.isSafeInteger(value) || typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)); const n=BigInt(value); assert.ok(n>=0n&&n<(1n<<BigInt(width*8)), 'PC16_UINT'); return Buffer.from(n.toString(16).padStart(width*2,'0'),'hex'); };
export const finalityProfileHash = () => hex(sha(Buffer.from(FINALITY_PROFILE_NAME, 'ascii')));
export function terminalStatementHash(inputs) {
  assert.ok(Array.isArray(inputs) && inputs.length === 65, 'PC16_EXACT_TERMINAL_WORDS');
  return hex(sha(Buffer.concat([Buffer.from([0x17]), ...inputs.map(word => fixed(word.toLowerCase(), 32))])));
}
export function finalityPermitKey({ chainId, poolAddress, scope, policy, chain, effect, statement, version }) {
  assert.ok(chain === 'SOL' || chain === 'BTC', 'PC16_CHAIN');
  return hex(sha(Buffer.concat([Buffer.from([0x16]), fixed(finalityProfileHash(),32), uint(chainId,32), fixed(poolAddress.toLowerCase(),20), fixed(scope,32), fixed(policy,32), uint(chain === 'SOL' ? 1 : 2,1), fixed(effect,32), fixed(statement,32), uint(version,8)])));
}
export function finalityPermitCommitment(key, observedAt, validUntil) {
  return hex(sha(Buffer.concat([fixed(key,32), uint(observedAt,8), uint(validUntil,8)])));
}
export function assertAuthorityEffectBinding({ chain, scope, policy, inputs, envelope }) {
  terminalStatementHash(inputs);
  assert.equal(noteWordsToHash(inputs.slice(0,8)), scope, 'PC16_SCOPE');
  assert.equal(noteWordsToHash(inputs.slice(8,16)), policy, 'PC16_POLICY');
  assert.equal(envelope.certificate.chainDomain.chain, chain, 'PC16_CHAIN');
  const effect=hex(effectConsumptionHash(scope.slice(2), envelope.certificate.chainDomain, envelope.certificate.opaqueTag));
  assert.notEqual(effect, `0x${'00'.repeat(32)}`, 'PC16_ZERO_EFFECT');
  const offset=chain==='SOL'?33:41;
  assert.equal(noteWordsToHash(inputs.slice(offset,offset+8)), effect, 'PC16_EFFECT_BINDING');
  return effect;
}

/** pool/verifier/bridge and chain identity are trusted immutable constructor
 * inputs. Caller-supplied receipts, nullifiers and endpoints are not accepted. */
export function createCurrentFinalityAuthority({ chain, bridge, pool, account, chainId, nowSeconds, submitAuthority, archive = async () => {} }) {
  assert.ok(chain==='SOL'||chain==='BTC', 'PC16_CHAIN');
  assert.equal(bridge.policy.chainDomain.chain,chain, 'PC16_BRIDGE_CHAIN');
  assert.equal(typeof nowSeconds,'function'); assert.equal(typeof submitAuthority,'function');
  const chainNumber=chain==='SOL'?1:2, records=new WeakMap();
  const pinnedPolicy=structuredClone(bridge.policy), boundObserve=bridge.observeAndCertify.bind(bridge), boundReceipt=bridge.nativeReceipt.bind(bridge);
  const pin={ scope:pool.scope, policy:pool.policy, address:pool.address, account:account.toLowerCase() };
  const get=handle=>{const r=records.get(handle);assert.ok(r,'PC16_UNKNOWN_EFFECT_CAPABILITY');return r;};
  const assertPinned=async()=>{
    assert.equal(pool.address,pin.address,'PC16_POOL_CHANGED'); assert.equal(pool.scope,pin.scope,'PC16_SCOPE_CHANGED'); assert.equal(pool.policy,pin.policy,'PC16_POLICY_CHANGED');
    const actual=await pool.call(chain==='SOL'?'solFinalityAuthority()':'btcFinalityAuthority()');assert.equal(`0x${actual.slice(-40)}`,pin.account,'PC16_AUTHORITY_IDENTITY');
  };
  const binding=(record,inputs)=>assertAuthorityEffectBinding({chain,scope:pin.scope,policy:pin.policy,inputs,envelope:record.envelope});
  const remember=(handle,envelope)=>{
    assert.ok(!records.has(handle),'PC16_EFFECT_ALREADY_RETAINED');
    assert.equal(verifyNativeCertificate(envelope,pinnedPolicy,{settlementEpoch:(BigInt(envelope.certificate.observedAt)/600n).toString()}),true,'PC16_AUTHENTIC_ORIGINAL_REQUIRED');
    const receipt=boundReceipt(handle),canonical=envelope.certificate.canonicalEffect;
    if(chain==='SOL'){assert.equal(canonical.signature,receipt.signature,'PC16_RETAINED_NATIVE_IDENTITY');assert.equal(canonical.instructionIndex,0);}
    else{assert.equal(canonical.txid,receipt.txid,'PC16_RETAINED_NATIVE_IDENTITY');assert.equal(canonical.vout,receipt.vout,'PC16_RETAINED_NATIVE_IDENTITY');}
    records.set(handle,{envelope:structuredClone(envelope),canonical:encodeCanonicalEffect(chain,canonical),adverse:false});
  };
  const definitiveFailures=chain==='BTC'?['PC15_BITCOIN_NOT_FINAL']:['PC15_SOLANA_NOT_FINALIZED','SOLANA_OBSERVED_EXECUTION_FAILURE'];
  const archivePending=async r=>{
    if(!r.adverseArchived){await archive({stage:'ADVERSE_OBSERVED_PENDING_INCLUSION',...structuredClone(r.adverseRecord)});r.adverseArchived=true;}
  };
  const observeRetained=async(handle,r,effect)=>{
    try{return await boundObserve(handle);}catch(error){
      if(definitiveFailures.includes(error.message)){
        if(!r.adverseRecord){
          // Monotone knowledge: preserve the FIRST definitive observation in
          // either entry point, before a recovery or failed broadcast can hide it.
          r.adverse=true;
          const fact={profile:FINALITY_PROFILE_NAME,chain,effect,canonicalEffect:structuredClone(r.envelope.certificate.canonicalEffect),priorObservedBlock:r.envelope.certificate.observedBlockIdentity,observedAt:String(nowSeconds()),failure:error.message};
          r.adverseRecord={...fact,evidence:hex(sha(Buffer.from(JSON.stringify(fact))))};
        }
        await archivePending(r);
      }
      throw error;
    }
  };
  const observeAndPermit=async(handle,proof)=>{
    await assertPinned();const r=get(handle),effect=binding(r,proof.publicInputs);
    assert.equal(r.adverse,false,'PC16_LOCALLY_ADVERSE');
    const state=await pool.snapshot();
    assert.equal(BigInt(proof.publicInputs[16]),BigInt(state.epoch),'PC16_CURRENT_STATEMENT_EPOCH');
    assert.equal(BigInt(state.epoch),BigInt(Math.floor(nowSeconds()/600)),'PC16_CHAIN_CLOCK');
    assert.equal(await pool.call('acceptedRoots(bytes32)',[noteWordsToHash(proof.publicInputs.slice(17,25))],state.blockNumber),`0x${'0'.repeat(63)}1`,'PC16_ACCEPTED_ROOT');
    // Verify first; only then take the current native observation. The authority
    // sees the whole terminal bundle, but the proof does not reveal its witness.
    assert.equal(await pool.verify('fulfill',proof.proof,proof.publicInputs),true,'PC16_GLOBAL_PROOF');
    assert.equal(r.adverse,false,'PC16_LOCALLY_ADVERSE');
    const fresh=await observeRetained(handle,r,effect),c=fresh.certificate;
    assert.equal(r.adverse,false,'PC16_LOCALLY_ADVERSE');
    assert.equal(verifyNativeCertificate(fresh,pinnedPolicy,{settlementEpoch:Math.floor(nowSeconds()/600)}),true,'PC16_FRESH_AUTHENTICITY');
    assert.ok(encodeCanonicalEffect(chain,c.canonicalEffect).equals(r.canonical),'PC16_CANONICAL_EFFECT_CHANGED');
    for(const key of ['opaqueTag','localInstructionCommitment','source','recipientOrScriptHash','amount'])assert.equal(c[key],r.envelope.certificate[key],`PC16_REOBSERVED_${key}`);
    assert.equal(binding({envelope:fresh},proof.publicInputs),effect,'PC16_REOBSERVED_EFFECT');
    assert.equal(BigInt(proof.publicInputs[16]),BigInt(Math.floor(nowSeconds()/600)),'PC16_EPOCH_CROSSED_DURING_OBSERVATION');
    const version=BigInt(await pool.call('authorityVersion(uint8)',[chainNumber]));
    const observedAt=BigInt(c.observedAt),validUntil=observedAt+BigInt(FINALITY_MAX_LEASE_SECONDS),statement=terminalStatementHash(proof.publicInputs);
    assert.equal(observedAt,BigInt(nowSeconds()),'PC16_OBSERVATION_CLOCK');
    const key=finalityPermitKey({chainId,poolAddress:pin.address,scope:pin.scope,policy:pin.policy,chain,effect,statement,version});
    assert.equal(await pool.call('permitKey(uint8,bytes32,bytes32,uint64)',[chainNumber,effect,statement,version]),key,'PC16_DEPLOYED_PERMIT_BYTES');
    // Last synchronous check before handing the transaction to the sender.
    // An already exposed EVM transaction cannot be recalled by later knowledge.
    assert.equal(r.adverse,false,'PC16_LOCALLY_ADVERSE');
    const receipt=await submitAuthority(`record fresh ${chain} permit`,pin.account,'recordPermit(uint8,bytes32,bytes32,uint64,uint64,uint64)',[chainNumber,effect,statement,version,observedAt,validUntil]);
    const result={chain,effect,statement,version:version.toString(),observedAt:observedAt.toString(),validUntil:validUntil.toString(),permitKey:key,permitCommitment:finalityPermitCommitment(key,observedAt,validUntil),freshCertificate:fresh,receipt};
    await archive(result);return result;
  };
  const observeAndRecordAdverse=async(handle,proof)=>{
    await assertPinned();const r=get(handle),effect=binding(r,proof.publicInputs);
    if (r.adverseResult) return structuredClone(r.adverseResult);
    if (!r.adverseRecord) {
      try{await observeRetained(handle,r,effect);}catch{}
      assert.ok(r.adverseRecord,'PC16_ADVERSE_FACT_REQUIRED');
    }
    await archivePending(r);
    // Explicit caller retry uses the SAME evidence bytes, even if foreign state
    // subsequently recovers or goes offline. Duplicate inclusion is a contract
    // no-op. No automatic retry after an ambiguous response; no local un-revoke.
    const receipt=await submitAuthority(`record adverse ${chain} fact`,pin.account,'recordAdverse(uint8,bytes32,bytes32)',[chainNumber,effect,r.adverseRecord.evidence]);
    r.adverseResult={stage:'ADVERSE_INCLUDED',...structuredClone(r.adverseRecord),receipt};
    await archive(structuredClone(r.adverseResult));return structuredClone(r.adverseResult);
  };
  return Object.freeze({chain,account:pin.account,remember,observeAndPermit,observeAndRecordAdverse});
}
