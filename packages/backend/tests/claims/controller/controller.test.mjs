/** Explicit synthetic capability/backend host tests. Real Vault/CAS and
 * controller are exercised; no chain, compiler, proof or genuine brand is made. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimTicketId, claimTicketSecret,
  claimDestinationCommitment, nativeClaimEndpointCommitment, encodeClaimIngressInputs, encodeClaimDischargeInputs } from '../../../src/claims/protocol/framing.mjs';
import { CLAIM_BACKING_FIELDS, claimFrame, claimHash, claimRouteCommitment } from '../../../src/claims/authorization/permits.mjs';
import { encodeDepositIntentInputs } from '../../../src/execution/account/preparation/deposit-intent.mjs';
import { balanceCommitment } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import * as originalAdmission from '../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import * as originalTooling from '../../../../proofs/src/tooling/tooling.mjs';
import { publicKeccak256 } from '../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { claimABIType } from '../../../src/claims/protocol/abi.mjs';
import { encodeSolanaBindingMessage, receiptKeyCommitment } from '../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { encodeSolanaNonceBindingMessage, validateSolanaNonceBindingTransaction } from '../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { createClaimReservationBinding } from '../../../src/claims/authorization/reservation-facts-gate.mjs';
import { decryptJson } from '../../../../engine/src/crypto/privacy.mjs';
import { ownerDigest, FLAT_OWNER_CLAIM_HANDOFF_PROFILE, FLAT_OWNER_CLAIM_HANDOFF_TRUST } from '../../../../custody/src/signing/flat-owner-custody.mjs';
import { fixture, hash, zero, poisonedOperators, poisonedQuorums,
  consumeNativeClaimOriginalKeyAuthorityV4 } from '../../fixtures/claims/authorization/claim-key-authority-v4.fixture.mjs';
const p = v => '0x' + v;
const { createNativeClaimController, createNativeClaimControllerKeeper, createDurableNativeClaimControllerKeeper,
  restartNativeClaimController, openNativeClaimControllerDispatch, openNativeClaimSolanaPayoutAuthority } = await import('../../../src/claims/controller/controller.mjs');
const { ownedClaimControllerJournal } = await import('../../../src/claims/controller/controller-journal.mjs');
const { createNativeClaimSession, nativeClaimSessionController } = await import('../../../src/api/claims/native-claim-session.mjs');
const { startNativeClaimHttp } = await import('../../../src/api/claims/native-claim-http.mjs');
const { assertOwnedClaimEvmDispatchRequest, createClaimEvmDispatchRequest } = await import('../../../src/claims/protocol/evm-dispatch-gate.mjs');
test('encrypted prepared opening survives controller reopen and rejects rollback or fake capabilities', async () => {
  const f = await fixture();
  try {
    assert.throws(() => openNativeClaimControllerDispatch({}), /PRIVATE_DISPATCH_TOKEN/);
    await assert.rejects(createClaimEvmDispatchRequest({}), /PRIVATE_DISPATCH_TOKEN/);
    await assert.rejects(f.controller.prepare({handoff:{select:f.handoff.select}}), /REAL_HANDOFF_ONLY/);
    const first = await f.controller.prepare({handoff:f.handoff});
    const sealed = await readFile(f.path); assert.ok(!sealed.includes(Buffer.from(f.packet.opening.noteSecret)));
    await f.reopen(); assert.deepEqual(await f.controller.prepare({handoff:f.handoff}), first);
    await assert.rejects(createNativeClaimController(f.options), /EXCLUSIVE_CONTROLLER/);
  } finally { await f.close(); }
});
test('unknown original EVM reply survives close/reopen and cannot sign a second preposition', async () => {
  const f = await fixture();
  try {
    const prepared = await f.controller.prepare({handoff:f.handoff}); f.control.intentId=prepared.intentId; f.control.loseReply=true;
    await assert.rejects(f.controller.preposition({intentId:prepared.intentId}), /LOST_EVM_REPLY/);
    assert.equal(f.control.dispatches,1); await f.reopen();
    await assert.rejects(f.controller.preposition({intentId:prepared.intentId}), /UNKNOWN_EVM_RECONCILE_ORIGINAL_ONLY/);
    assert.equal(f.control.dispatches,1);
    f.control.included=true;
    const reconciled=await f.controller.reconcile({operationId:prepared.intentId}); assert.equal(reconciled.status,'PREPOSITIONED');
    assert.equal((await f.controller.preposition({intentId:prepared.intentId})).status,'PREPOSITIONED');
    assert.equal(f.control.dispatches,1);
    assert.equal(reconciled.spendablePrivateBalance,null);
  } finally { await f.close(); }
});
test('replaying an older encrypted journal fails closed against the surviving keeper checkpoint', async () => {
  const f=await fixture();
  try {
    const original=await readFile(f.path); await f.controller.prepare({handoff:f.handoff});
    await writeFile(f.path,original); await assert.rejects(f.controller.status(), /KEEPER_READ_UNCERTAIN/);
  } finally { await f.close(); }
});
function installLostSolanaFixture(f, finalized) {
  const {config,control,options,state,artifact,authSchema}=f;
  const source=generateKeyPairSync('ed25519'), publicKey=Buffer.from(source.publicKey.export({format:'jwk'}).x,'base64url').toString('hex');
  const native=options.claims.nativeRuntimes[0];
  native.roles={depositor:{endpoint:publicKey},escrow:{endpoint:hash('escrow')},recipient:{endpoint:hash('recipient')}};
  native.transfers=[]; control.nativeSigns=0; control.nativeBroadcasts=0; control.originalReads=[];
  control.nativeFinalized=false; control.finalizeOnRead=finalized;
  const schema=[...'operationId nullifier wireBindingCommitment refundDestination'.split(' ').map(name=>({name,type:'bytes32'})),authSchema];
  const signature='reserveSignedEffect('+schema.map(claimABIType).join(',')+')';
  artifact.abi.push({type:'function',name:'reserveSignedEffect',inputs:schema});
  artifact.evm.methodIdentifiers[signature]=publicKeccak256(Buffer.from(signature)).subarray(0,4).toString('hex');
  native.inventory=async()=>({accounts:Object.values(native.roles).map(role=>({...role,exists:true,total:'100000000',rentExemptMinimum:'1000'}))});
  let prepared;
  const adapter={
    async assertPrepared(value){assert.deepEqual(value,prepared);},
    async transfer(request,callbacks){
      const intent={sourcePublicKey:publicKey,recipientPublicKey:native.roles.escrow.endpoint,recentBlockhash:hash('blockhash'),
        lamports:request.amount,wireKeyCommitment:request.wireKeyCommitment};
      prepared={genesis:config.nativeGenesis,intent,unsignedWire:encodeSolanaBindingMessage(intent),funds:{feeLamports:'5000'}};
      await callbacks.beforeSign(prepared); control.nativeSigns++;
      const message=Buffer.from(prepared.unsignedWire,'hex'), signature=sign(null,message,source.privateKey);
      const nativeWire=Buffer.concat([Buffer.from([1]),signature,message]).toString('base64'), nativeId=signature.toString('hex');
      const record={route:'deposit',recipientIndex:0,nativeId,nativeWire,intent,phase:'SIGNED_NOT_BROADCAST',broadcastAttempts:0};
      native.transfers.push(record); await callbacks.onSigned({nativeWire});
      record.phase='BROADCAST_UNKNOWN'; record.broadcastAttempts=1; control.nativeBroadcasts++;
      throw Object.assign(Error('SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE'),{nativeId:control.wrongErrorId?'11'.repeat(64):nativeId});
    },
    async observe({nativeId}){assert.equal(nativeId,native.transfers[0].nativeId);control.originalReads.push(nativeId);
      return {status:control.nativeFinalized?'observed':'pending',nativeId,nativeWire:control.nativeFinalized?native.transfers[0].nativeWire:null};},
  };
  native.adapter=({route})=>{assert.equal(route,'deposit');return adapter;};
  native.observe=async(nativeId,parameters)=>{
    assert.equal(nativeId,native.transfers[0].nativeId);assert.deepEqual(parameters,{timeoutMs:45000});
    control.originalReads.push(nativeId);control.nativeFinalized=control.finalizeOnRead;
    if(control.nativeFinalized)native.transfers[0].phase='OBSERVED_FINALIZED';
    return {status:control.nativeFinalized?'observed':'pending'};
  };
  options.quorum.authorizeIngress=async()=>({head:structuredClone(state.head),message:{synthetic:true}});
  options.quorum.reservation=options.quorum.backing;
  for(const op of options.operators)op.retainSignedEffect=async request=>{
    const row=native.transfers[0];
    const b=createClaimReservationBinding({claimDomain:request.claimDomain,gateway:config.gateway,ledgerNamespace:config.ledgerNamespace,
      genesis:config.nativeGenesis,asset:config.nativeAsset,operationId:request.operationId,revision:'1',ingress:true,
      receiptSecret:request.receiptSecret,wireSalt:request.wireSalt,nativeWire:row.nativeWire,intent:row.intent,
      request:{family:'2',recipientIndex:'0',nativeId:row.nativeId,wireKeyCommitment:row.intent.wireKeyCommitment}});
    control.nativeBinding=b;return {claimDomain:b.claimDomain,operationId:b.operationId,revision:b.revision,
      admissionN:b.admissionN,wireBindingCommitment:b.wireBindingCommitment};
  };
}
for(const finalized of [false,true])test('lost SOL broadcast reads only retained original; finalized='+finalized,async()=>{
  const f=await fixture();
  try{
    installLostSolanaFixture(f,finalized);
    const prepared=await f.controller.prepare({handoff:f.handoff});f.control.intentId=prepared.intentId;
    await f.controller.preposition({intentId:prepared.intentId});
    let result;
    if(finalized) result=await f.controller.ingress({intentId:prepared.intentId});
    else { await assert.rejects(f.controller.ingress({intentId:prepared.intentId}),/SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE/);
      result=(await f.controller.status()).deposits[0]; }
    assert.equal(result.status,finalized?'HELD_UNISSUED':'UNKNOWN');assert.equal(result.spendablePrivateBalance,null);
    const handle=await f.controller.privateNativeReceipt({operationId:prepared.intentId});assert.equal(handle.broadcastAttempts,1);
    assert.equal(f.control.nativeSigns,1);assert.equal(f.control.nativeBroadcasts,1);
    assert.ok(f.control.originalReads.length>=2);assert.ok(f.control.originalReads.every(id=>id===handle.nativeId));
    await f.reopen();
    assert.equal((await f.controller.ingress({intentId:prepared.intentId})).status,finalized?'HELD_UNISSUED':'UNKNOWN');
    assert.equal(f.control.nativeSigns,1);assert.equal(f.control.nativeBroadcasts,1);
  }finally{await f.close();}
});
test('lost SOL reply with a different native identity cannot enter recovery',async()=>{
  const f=await fixture();
  try{
    installLostSolanaFixture(f,true);f.control.wrongErrorId=true;
    const prepared=await f.controller.prepare({handoff:f.handoff});f.control.intentId=prepared.intentId;
    await f.controller.preposition({intentId:prepared.intentId});
    await assert.rejects(f.controller.ingress({intentId:prepared.intentId}),/LOST_BROADCAST_ERROR_IDENTITY/);
    assert.equal(f.control.originalReads.length,0);assert.equal(f.control.nativeSigns,1);assert.equal(f.control.nativeBroadcasts,1);
  }finally{await f.close();}
});
test('compact controller EVM journal retains one exact wire and rejects changed runtime preparation after reopen', async () => {
  const f = await fixture();
  try {
    const prepared = await f.controller.prepare({handoff:f.handoff}); f.control.intentId = prepared.intentId; f.control.loseReply = true;
    await assert.rejects(f.controller.preposition({intentId:prepared.intentId}), /LOST_EVM_REPLY/);
    const record = decryptJson(JSON.parse(await readFile(f.path, 'utf8')), 'TEST ONLY PASSWORD '.repeat(4)).data.evm[0];
    assert.equal(record.transaction.data, undefined); assert.equal(record.prepared.transaction.data, undefined);
    assert.equal(record.prepared.unsignedWire, undefined); assert.equal(record.signed.nativeWire, '0x1122');
    assert.equal(record.transaction.calldataSHA256, hash(Buffer.from(f.runtime.transactions[0].request.data.slice(2), 'hex')));
    await f.reopen(); f.runtime.transactions[0].prepared.transaction.nonce = '999';
    await assert.rejects(f.controller.reconcile({operationId:prepared.intentId}), /ORIGINAL_PREPARATION/);
    assert.equal(f.control.dispatches, 1);
  } finally { await f.close(); }
});
test('EVM pre-sign size failure keeps its first cause and makes no second keeper write', async () => {
  const f = await fixture();
  try {
    const prepared = await f.controller.prepare({handoff:f.handoff}); f.control.intentId = prepared.intentId;
    const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims);
    const update = journal.update; let attempts = 0;
    journal.update = (...args) => { attempts++; return update(...args); };
    f.control.preparedHook = value => { value.funds.testOversize = 'x'.repeat(1024 * 1024); };
    await assert.rejects(f.controller.preposition({intentId:prepared.intentId}), error => {
      assert.equal(error.message, 'CLAIM_KEEPER_WRITE_UNCERTAIN'); assert.match(error.cause.message, /Canonical JSON exceeds byte limit/); return true;
    });
    assert.equal(attempts, 2); assert.equal(f.runtime.transactions.length, 0); assert.equal(f.keeper.status().uncertain, true);
    await assert.rejects(f.controller.status(), /KEEPER_CLOSED_OR_UNCERTAIN/);
  } finally { await f.close(); }
});
test('native payout bookkeeping preserves first oversized write failure without signing or sending', async () => {
  const f = await fixture();
  try {
    const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims), id = hash('payout-size-test');
    const ticket = { id, amount: '1000000', maxFee: '5000', kind: '1' };
    await journal.update(data => { data.tickets.push({ id, claimDomain: f.packet.claimDomain, ticket, native: null }); return data; });
    f.state.gateways[0].tickets.push({ ticket, state: '1' });
    const update = journal.update; let attempts = 0, signs = 0, sends = 0;
    journal.update = (...args) => { attempts++; return update(...args); };
    f.options.claims.nativeRuntimes[0].adapter = () => ({ async transfer() {
      await journal.update(data => ({ ...data, testOversize: 'x'.repeat(1024 * 1024) })); signs++; sends++;
    } });
    await assert.rejects(f.controller.payout({ticketId:id}), error => {
      assert.equal(error.message, 'CLAIM_KEEPER_WRITE_UNCERTAIN'); assert.match(error.cause.message, /Canonical JSON exceeds byte limit/); return true;
    });
    assert.equal(attempts, 2); assert.equal(signs, 0); assert.equal(sends, 0); assert.equal(f.keeper.status().uncertain, true);
    const disk = decryptJson(JSON.parse(await readFile(f.path, 'utf8')), 'TEST ONLY PASSWORD '.repeat(4));
    assert.equal(disk.data.tickets[0].status, 'UNKNOWN'); assert.equal(disk.data.tickets[0].native.status, 'ATTEMPT_STARTED');
  } finally { await f.close(); }
});

test('synthetic V3 controller replaces its killed storage child and fences effects until all originals reconcile', async () => {
  const f = await fixture({ durable: true });
  try {
    const prepared = await f.controller.prepare({ handoff: f.handoff }); f.control.intentId = prepared.intentId;
    const previous = f.keeper.status();
    assert.equal(previous.keeperRestart, true); assert.equal(previous.nativeNodeRestart, false);
    assert.equal(previous.operatorKeyRestart, false); assert.ok(previous.keeperProcessId > 0);
    // This is the real storage child owned by this fixture. The chain and
    // operator authorities remain explicit module mocks throughout this test.
    process.kill(previous.keeperProcessId, 'SIGKILL');
    await f.reopenKeeper();
    assert.notEqual(f.keeper.status().keeperProcessId, previous.keeperProcessId);
    assert.equal((await f.controller.status()).requiresExternalEffectReconciliation, true);
    await assert.rejects(f.controller.prepare({ handoff: f.handoff }), /KEEPER_RECONCILIATION_REQUIRED/);
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /KEEPER_RECONCILIATION_REQUIRED/);
    assert.equal(f.control.dispatches, 0);
    const retained = await ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims).read();
    assert.deepEqual(retained.deposits[0].packet, f.packet);
    assert.deepEqual(await f.controller.reconcileAll({}), { reconciled: true, nativeNodeRestart: false });
    assert.equal((await f.controller.status()).requiresExternalEffectReconciliation, false);
    assert.deepEqual(await f.controller.prepare({ handoff: f.handoff }), prepared);
    assert.equal((await f.controller.preposition({ intentId: prepared.intentId })).status, 'PREPOSITIONED');
    assert.equal(f.control.dispatches, 1);
  } finally { await f.close(); }
});

for (const poisoned of ['operator', 'quorum']) test('cleanup releases the reopened session controller after poisoned ' + poisoned, async () => {
  const f = await fixture({ durable: true }); let session, http, current;
  try {
    await f.controller.prepare({ handoff: f.handoff });
    session = await createNativeClaimSession({ controller: f.controller, accountId: 'cleanup_owner_01',
      ownerIdentitySHA256: f.packet.ownerIdentitySHA256, claimDomain: claimDomainCommitment(f.config), caller: f.runtime.accounts[0] });
    http = await startNativeClaimHttp({ session });
    const originalPID = f.keeper.status().keeperProcessId;
    process.kill(originalPID, 'SIGKILL');
    for (let attempt = 0; attempt < 200 && !f.keeper.status().uncertain; attempt++)
      await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(f.keeper.status().uncertain, true);
    await session.submit('restartKeeper', { requestId: 'cleanup_restart_01' });
    assert.equal((await session.idle()).requests[0].state, 'CONFIRMED');
    current = nativeClaimSessionController(session);
    assert.notEqual(current, f.controller);
    const reopenedPID = f.keeper.status().keeperProcessId;
    assert.notEqual(reopenedPID, originalPID);
    if (poisoned === 'operator') poisonedOperators.add(f.options.operators[0]);
    else poisonedQuorums.add(f.options.quorum);
    await assert.rejects(current.status(), /COMBINED_OPERATOR_CLOSED_OR_POISONED/);
    await http.close();
    assert.equal(nativeClaimSessionController(session), current);
    // Teardown needs only the original idle lease. It must not need fresh
    // signing authority, because poisoning is precisely why cleanup runs.
    current.close();
    assert.equal(f.keeper.status().controllerOpen, false);
    await assert.rejects(current.status(), /CLAIM_CONTROLLER_CLOSED/);
    await assert.rejects(restartNativeClaimController(current), /CLAIM_CONTROLLER_CLOSED/);
    const closing = f.keeper.close();
    await f.keeper.close();
    assert.equal(f.keeper.status().keeperProcessExited, true, 'all keeper close callers await child exit');
    await closing;
    assert.throws(() => process.kill(reopenedPID, 0), { code: 'ESRCH' });
    assert.equal(f.control.dispatches, 0);
  } finally {
    poisonedOperators.delete(f.options.operators[0]); poisonedQuorums.delete(f.options.quorum);
    await http?.close(); await session?.close();
    if (current && f.keeper.status().controllerOpen) current.close();
    await f.close();
  }
});

test('local controller cleanup still rejects an in-flight operation before releasing its keeper lease', async () => {
  const f = await fixture({ durable: true });
  const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims), read = journal.read;
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), pending = new Promise(resolve => { release = resolve; });
  journal.read = async () => { enter(); await pending; return read(); };
  let reading;
  try {
    reading = f.controller.status(); await entered;
    poisonedOperators.add(f.options.operators[0]);
    assert.throws(() => f.controller.close(), /CLAIM_CONTROLLER_BUSY/);
    assert.equal(f.keeper.status().controllerOpen, true);
    await assert.rejects(f.keeper.close(), /CLAIM_KEEPER_CONTROLLER_STILL_OPEN/);
    release(); await reading;
    f.controller.close(); assert.equal(f.keeper.status().controllerOpen, false);
    await f.keeper.close(); assert.equal(f.keeper.status().keeperProcessExited, true);
    assert.equal(f.control.dispatches, 0);
  } finally {
    release(); await reading; journal.read = read; poisonedOperators.delete(f.options.operators[0]);
    await f.close();
  }
});

test('synthetic V3 failed keeper reopen preserves the same controller retry context and original unknown wire', async () => {
  const f = await fixture({ durable: true }), displaced = f.path + '.temporarily-unavailable'; let moved = false;
  try {
    const prepared = await f.controller.prepare({ handoff: f.handoff }); f.control.intentId = prepared.intentId;
    f.control.loseReply = true;
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /LOST_EVM_REPLY/);
    const originalController = f.controller, journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims);
    const before = await journal.read(), originalId = before.evm[0].signed.nativeId;
    await rename(f.path, displaced); moved = true;
    await assert.rejects(f.restart(), /KEEPER_REOPEN_UNCERTAIN/);
    assert.equal(f.controller, originalController); assert.equal(f.keeper.status().uncertain, true);
    await rename(displaced, f.path); moved = false;
    await f.restart();
    assert.notEqual(f.controller, originalController);
    assert.equal((await f.controller.status()).requiresExternalEffectReconciliation, true);
    const recovered = await journal.read();
    assert.deepEqual(recovered.deposits, before.deposits);
    assert.deepEqual(recovered.evm[0].signed, before.evm[0].signed);
    assert.deepEqual(recovered.evm[0].prepared, before.evm[0].prepared);
    assert.equal(recovered.evm[0].status, 'UNKNOWN');
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /KEEPER_RECONCILIATION_REQUIRED/);
    await assert.rejects(f.controller.reconcileAll({}), /UNKNOWN_EVM_RECONCILE_ORIGINAL_ONLY/);
    assert.equal(f.control.dispatches, 1);
    f.control.included = true;
    await f.controller.reconcileAll({});
    assert.equal((await f.controller.status()).deposits[0].status, 'PREPOSITIONED');
    assert.deepEqual(f.control.reconciledTransactions, [originalId]);
    assert.equal(f.control.dispatches, 1);
  } finally { if (moved) await rename(displaced, f.path); await f.close(); }
});

test('synthetic V3 reconciliation of an older success cannot clear a later unrelated runtime uncertainty', async () => {
  const f = await fixture({ durable: true });
  try {
    const prepared = await f.controller.prepare({ handoff: f.handoff }); f.control.intentId = prepared.intentId;
    await f.controller.preposition({ intentId: prepared.intentId });
    const oldId = f.runtime.transactions[0].transactionHash;
    const later = structuredClone(f.runtime.transactions[0]);
    later.request.to = f.runtime.accounts[0]; later.request.data = '0x1234';
    Object.assign(later.prepared.transaction, { to: later.request.to, data: later.request.data, nonce: '1' });
    later.prepared.unsignedWire = p(hash('different original unsigned transaction'));
    later.signed = { nativeWire: '0x3344', nativeId: p(hash('later unresolved transaction')), transactionSHA256: hash('later wire') };
    later.transactionHash = later.signed.nativeId; later.phase = 'uncertain-no-resend';
    later.uncertaintyCause = 'original-signed-broadcast'; f.runtime.transactions.push(later);
    f.runtime.mutationStatus.uncertain = true;
    const originalReceipt = f.runtime.receipt, originalTransaction = f.runtime.transaction;
    f.runtime.receipt = id => id === later.transactionHash ? null : originalReceipt(id);
    f.runtime.transaction = id => id === later.transactionHash ? null : originalTransaction(id);
    await f.reopenKeeper();
    await assert.rejects(f.controller.reconcileAll({}), /EVM_AUTHORITY_UNCERTAINTY_REMAINS/);
    assert.equal((await f.runtime.receipt(oldId)).status, '0x1');
    assert.deepEqual(f.control.reconciledTransactions, []);
    assert.equal(f.runtime.mutationStatus.uncertain, true);
    assert.equal(later.phase, 'uncertain-no-resend');
    assert.equal((await f.controller.status()).requiresExternalEffectReconciliation, true);
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /KEEPER_RECONCILIATION_REQUIRED/);
    assert.equal(f.control.dispatches, 1);
  } finally { await f.close(); }
});

function installRedemptionFixture(f) {
  const native = f.options.claims.nativeRuntimes[0];
  native.roles = { depositor: { endpoint: hash('depositor') }, escrow: { endpoint: hash('escrow') }, recipient: { endpoint: hash('recipient') } };
  native.inventory = async () => ({ accounts: Object.values(native.roles).map(role => ({ ...role, exists: true, total: '100000000', rentExemptMinimum: '1000' })) });
  const route = { name: 'route', type: 'tuple', components: [
    { name: 'endpoint', type: 'bytes' }, { name: 'salt', type: 'bytes32' },
    ...['quotedFee', 'selectedInputValue', 'changeFloor'].map(name => ({ name, type: 'uint64' })),
    { name: 'destinationFunded', type: 'bool' },
  ] };
  const inputs = [{ name: 'amount', type: 'uint64' }, { name: 'destination', type: 'bytes32' },
    { name: 'maxFee', type: 'uint64' }, route, f.authSchema];
  const signature = 'requestRedemption(' + inputs.map(claimABIType).join(',') + ')';
  f.artifact.abi.push({ type: 'function', name: 'requestRedemption', inputs });
  f.artifact.evm.methodIdentifiers[signature] = publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
}

test('synthetic V3 proposed no-key redemption stays retryable with its original request, salt and nonce', async () => {
  const f = await fixture({ durable: true });
  try {
    installRedemptionFixture(f);
    const request = { claimDomain: f.packet.claimDomain, caller: f.runtime.accounts[0], amount: '1000000', maxFee: '5000', requestId: hash('original redemption request') };
    f.control.preparedHook = () => { throw Error('TEST_REJECTED_BEFORE_KEY_USE'); };
    await assert.rejects(f.controller.requestRedemption(request), /REJECTED_BEFORE_KEY_USE/);
    const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims), before = await journal.read();
    assert.equal(before.tickets.length, 1); assert.equal(before.evm[0].status, 'REJECTED_NO_KEY');
    assert.equal(before.evm[0].signed, null); assert.equal(f.runtime.transactions.length, 0);
    assert.deepEqual(f.state.gateways[0].tickets, []);
    await f.reopenKeeper(); await f.controller.reconcileAll({});
    const retained = (await journal.read()).tickets[0];
    assert.equal(retained.status, 'REDEMPTION_READY_TO_RETRY');
    assert.equal(retained.id, before.tickets[0].id); assert.equal(retained.salt, before.tickets[0].salt);
    assert.deepEqual(retained.ticket, before.tickets[0].ticket); assert.deepEqual(retained.redemptionRequest, before.tickets[0].redemptionRequest);
    await assert.rejects(f.controller.requestRedemption({ ...request, amount: '1000001' }), /REDEMPTION_REQUEST_REBOUND/);
    assert.equal(f.control.dispatches, 1);
    f.state.gateways[0].nextTicketNonce = '1';
    await assert.rejects(f.controller.requestRedemption(request), /REDEMPTION_ORIGINAL_NONCE_CHANGED/);
    f.state.gateways[0].nextTicketNonce = '0';
    f.control.preparedHook = undefined;
    f.control.includedHook = async () => {
      const row = (await journal.read()).tickets[0];
      f.state.gateways[0].tickets.push({ ticket: structuredClone(row.ticket), state: '1', payoutRouteCommitment: zero });
      f.state.gateways[0].nextTicketNonce = '1';
    };
    const retried = await f.controller.requestRedemption(request);
    assert.equal(retried.ticketId, retained.id); assert.equal(retried.status, 'REDEMPTION_PENDING');
    assert.equal(f.control.dispatches, 2); assert.equal(f.runtime.transactions.length, 1);
    assert.deepEqual((await journal.read()).tickets[0].ticket, retained.ticket);
    assert.equal((await journal.read()).tickets[0].salt, retained.salt);
    assert.equal((await f.controller.requestRedemption(request)).ticketId, retained.id);
    assert.equal(f.control.dispatches, 2);
  } finally { await f.close(); }
});

/** Real Ed25519 framing and encrypted persistence, with synthetic chain,
 * reservation, nonce and quorum observations. No native RPC or proof worker is
 * invoked. The facts sentinel stops precisely before proof construction. */
async function installRetainedNoncePayout(f, { status = 'SIGNED_UNRESERVED' } = {}) {
  const domain = f.packet.claimDomain, source = generateKeyPairSync('ed25519');
  const sourcePublicKey = Buffer.from(source.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const id = claimTicketId({ claimDomain: domain, kind: '1', nonce: '0' });
  const secret = claimTicketSecret({ claimDomain: domain, ticketId: id });
  const key = receiptKeyCommitment({ ledgerNamespace: f.config.ledgerNamespace, secret });
  const intent = { sourcePublicKey, recipientPublicKey: hash('nonce payout recipient'), nonceAccountPublicKey: hash('nonce payout account'),
    durableNonce: hash('original nonce payout value'), lamports: '1000000', wireKeyCommitment: key };
  const unsignedWire = encodeSolanaNonceBindingMessage(intent), message = Buffer.from(unsignedWire, 'hex');
  const signature = sign(null, message, source.privateKey), nativeId = signature.toString('hex');
  const nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
  assert.equal(validateSolanaNonceBindingTransaction(nativeWire, intent).signatureHex, nativeId);
  const prepared = { genesis: f.config.nativeGenesis, intent, unsignedWire, funds: { feeLamports: '5000' } };
  const wireSalt = hash('retained payout wire salt'), salt = hash('retained payout destination salt');
  const route = { endpoint: intent.recipientPublicKey, salt, quotedFee: '5000', selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
  const destinationCommitment = claimDestinationCommitment({ claimDomain: domain,
    nativeChainDomain: claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'), Buffer.from(f.config.nativeGenesis, 'hex'), Buffer.from(f.config.nativeAsset, 'hex')])),
    endpoint: nativeClaimEndpointCommitment({ family: '2', genesis: f.config.nativeGenesis, asset: f.config.nativeAsset, endpoint: route.endpoint }),
    amount: intent.lamports, maxFee: '5000', salt });
  const ticket = { kind: '1', id, claimDomain: domain, amount: intent.lamports, maxFee: '5000', destinationCommitment,
    referenceIngressN: zero, referenceQ: zero };
  const binding = createClaimReservationBinding({ claimDomain: domain, gateway: f.config.gateway, ledgerNamespace: f.config.ledgerNamespace,
    genesis: f.config.nativeGenesis, asset: f.config.nativeAsset, operationId: id, revision: '1', ingress: false,
    receiptSecret: secret, wireSalt, nativeWire, intent, request: { family: '2', recipientIndex: '0', nativeId, wireKeyCommitment: key } });
  const original = { route: 'redeem', recipientIndex: 0, nativeId, nativeWire, transactionSHA256: binding.transactionSHA256, intent: structuredClone(intent),
    phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0 };
  const row = { id, claimDomain: domain, ticket, secret, key, salt, route, proofs: [], status: 'UNKNOWN',
    native: { status, wireSalt, prepared, nativeId, signed: { nativeWire }, binding } };
  const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims);
  await journal.update(data => { data.tickets.push(row); return data; });
  Object.assign(f.state.gateways[0], { tickets: [{ ticket: structuredClone(ticket), state: '2', payoutRouteCommitment: claimRouteCommitment(route) }],
    activePayout: id, nextTicketNonce: '1' });
  const control = { observationStatus: 'unknown', afterSendStatus: 'pending', resumeCalls: 0, sends: 0, signingCalls: 0,
    authorizationCalls: 0, factsCalls: 0, preparedChecks: 0, unrevokedChecks: 0, observations: [], events: [],
    currentNonce: intent.durableNonce, revoked: false, reservation: {
      gateway: binding.gateway, operationId: id, revision: binding.revision, wireBindingCommitment: binding.wireBindingCommitment,
      ingress: false, consumed: false,
    } };
  f.options.observer.readReservation = async (query, snapshot) => {
    assert.deepEqual(query, { claimDomain: domain, admissionN: binding.admissionN });
    assert.equal(snapshot.head.hash, f.state.head.hash); control.events.push('reservation');
    return structuredClone(control.reservation);
  };
  f.options.observer.assertUnrevoked = async (query, snapshot) => {
    assert.deepEqual(query, { claimDomain: domain, nativeGid: binding.nativeGid }); assert.equal(snapshot.head.hash, f.state.head.hash);
    control.unrevokedChecks++; control.events.push('unrevoked'); assert.equal(control.revoked, false, 'TEST_REVOKED_NATIVE_GID');
  };
  f.options.quorum.authorizeBroadcast = async request => {
    assert.deepEqual(request, { claimDomain: domain, ticketId: id, prepared, route, wireSalt, nativeId });
    control.authorizationCalls++; control.events.push('authorize');
    const authorization = { head: structuredClone(f.state.head), message: {
      claimDomain: domain, ticketId: id, revision: '1', claimSequence: '0', hubStateSequence: '0', amount: intent.lamports,
      wireKeyCommitment: key, unsignedWireCommitment: hash('original-unsigned-wire'), maxFee: '5000',
      revocationState: hash('revocation'), inventoryCommitment: hash('inventory'), obligationsCommitment: hash('obligations'),
      validFrom: f.state.head.timestamp, validUntil: String(BigInt(f.state.head.timestamp) + 30n),
      admissionN: binding.admissionN, nativeGid: binding.nativeGid, wireBindingCommitment: binding.wireBindingCommitment,
    } };
    control.originalAuthorization = authorization; await control.authorizationHook?.(authorization); return authorization;
  };
  f.options.quorum.facts = async request => {
    assert.deepEqual(request, binding.request); control.factsCalls++;
    throw Error('TEST_STOP_BEFORE_NATIVE_PROOF_CONSTRUCTION');
  };
  const adapter = {
    async transfer() { control.signingCalls++; assert.fail('TEST_NO_FRESH_SIGNING_ON_RETAINED_PAYOUT'); },
    async assertPrepared(value) { control.preparedChecks++; control.events.push('prepared');
      assert.deepEqual(value, prepared); assert.equal(value.intent.durableNonce, control.currentNonce, 'TEST_ORIGINAL_NONCE_CHANGED'); },
    async observe(request) { assert.deepEqual(request, { nativeId }); control.observations.push(request.nativeId); control.events.push('observe');
      return { status: control.observationStatus, nativeId, nativeWire: control.observationStatus === 'observed' ? nativeWire : null }; },
    async resumeReservedPayout(request, callbacks) {
      assert.deepEqual(request, { nativeId }); assert.deepEqual(Object.keys(callbacks), ['beforeBroadcast']);
      control.resumeCalls++; assert.equal(original.broadcastAttempts, 0); assert.equal(original.phase, 'SIGNED_NOT_BROADCAST');
      const activePrepared = structuredClone(prepared); control.activePrepared = activePrepared;
      const token = await callbacks.beforeBroadcast(activePrepared);
      const native = f.options.claims.nativeRuntimes[0];
      const gate = openNativeClaimSolanaPayoutAuthority(token, native.close, native.genesis, activePrepared, original);
      control.finalCallbacks = gate;
      original.broadcastAttempts = 1; original.phase = 'BROADCAST_UNKNOWN'; control.events.push('persist-latch');
      await control.afterLatch?.(activePrepared);
      await gate.beforeSend(activePrepared); control.events.push('before-send');
      await control.afterFinalAwait?.(activePrepared);
      assert.equal(gate.assertBeforeSend(activePrepared), undefined); control.events.push('final-sync');
      control.events.push('send'); control.sends++;
      control.observationStatus = control.afterSendStatus; return { nativeId };
    },
  };
  Object.assign(f.options.claims.nativeRuntimes[0], { payoutFinalSendProfile: 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2', close() {}, genesis: f.config.nativeGenesis, nonceInfrastructure: { syntheticFixture: true }, transfers: [original],
    adapter(request) { assert.deepEqual(request, { asset: f.config.nativeAsset, route: 'redeem' }); return adapter; } });
  return { id, nativeId, nativeWire, prepared, binding, original, control, journal,
    retained: async () => (await journal.read()).tickets[0] };
}

test('synthetic nonce payout count zero recovers after keeper restart without sending or signing', async () => {
  const f = await fixture({ durable: true });
  try {
    const n = await installRetainedNoncePayout(f);
    await f.reopenKeeper();
    assert.equal((await f.controller.status()).requiresExternalEffectReconciliation, true);
    await f.controller.reconcileAll({});
    assert.equal((await f.controller.status()).requiresExternalEffectReconciliation, false);
    const result = await f.controller.reconcile({ operationId: n.id });
    assert.equal(result.status, 'AWAITING_FIRST_BROADCAST');
    assert.equal((await n.retained()).native.status, 'RESERVED_BEFORE_BROADCAST');
    assert.ok(n.control.observations.length >= 2); assert.ok(n.control.observations.every(id => id === n.nativeId));
    assert.equal(n.original.broadcastAttempts, 0); assert.equal(n.control.sends, 0); assert.equal(n.control.resumeCalls, 0);
    assert.equal(n.control.signingCalls, 0); assert.equal(n.control.authorizationCalls, 0); assert.equal(n.control.factsCalls, 0);
  } finally { await f.close(); }
});

test('synthetic explicit nonce payout resumes only the original first send after the fresh broadcast guard', async () => {
  const f = await fixture();
  try {
    const n = await installRetainedNoncePayout(f);
    await f.controller.reconcile({ operationId: n.id }); n.control.events.length = 0;
    const result = await f.controller.payout({ ticketId: n.id });
    assert.equal(result.status, 'UNKNOWN'); assert.equal(n.control.resumeCalls, 1); assert.equal(n.control.sends, 1);
    assert.equal(n.control.authorizationCalls, 1); assert.equal(n.control.preparedChecks, 1); assert.equal(n.control.unrevokedChecks, 2);
    assert.equal(n.control.signingCalls, 0); assert.equal(n.control.factsCalls, 0);
    assert.equal(n.original.nativeId, n.nativeId); assert.equal(n.original.nativeWire, n.nativeWire); assert.equal(n.original.broadcastAttempts, 1);
    const events = n.control.events;
    assert.ok(events.indexOf('observe') < events.indexOf('authorize'));
    assert.ok(events.indexOf('authorize') < events.indexOf('unrevoked'));
    assert.ok(events.indexOf('unrevoked') < events.indexOf('prepared'));
    assert.ok(events.indexOf('prepared') < events.indexOf('send'));
    for (const key of ['admissionN', 'nativeGid', 'wireBindingCommitment'])
      assert.equal((await n.retained()).native.broadcastAuthorization.message[key], n.binding[key]);
    await f.controller.payout({ ticketId: n.id });
    assert.equal(n.control.resumeCalls, 1); assert.equal(n.control.sends, 1); assert.equal(n.control.signingCalls, 0);
  } finally { await f.close(); }
});

test('synthetic nonce first-send guard rejects changed binding, head, reservation, revocation and nonce before send', async () => {
  const changes = [
    ['binding', n => { n.control.authorizationHook = auth => { auth.message.nativeGid = hash('different native effect'); }; }, /BROADCAST_SIGNED_BINDING/],
    ['head', n => { n.control.authorizationHook = auth => { auth.head.hash = hash('stale authorization head'); }; }, /BROADCAST_HEAD_CHANGED/],
    ['reservation', n => { n.control.authorizationHook = () => { n.control.reservation.consumed = true; }; }, /BROADCAST_RESERVATION_CONSUMED/],
    ['revocation', n => { n.control.authorizationHook = () => { n.control.revoked = true; }; }, /TEST_REVOKED_NATIVE_GID/],
    ['nonce', n => { n.control.authorizationHook = () => { n.control.currentNonce = hash('advanced nonce'); }; }, /TEST_ORIGINAL_NONCE_CHANGED/],
  ];
  for (const [name, change, expected] of changes) {
    const f = await fixture();
    try {
      const n = await installRetainedNoncePayout(f); change(n);
      await assert.rejects(f.controller.payout({ ticketId: n.id }), expected, name);
      assert.equal(n.control.sends, 0, name); assert.equal(n.original.broadcastAttempts, 0, name);
      assert.equal(n.original.nativeWire, n.nativeWire, name); assert.equal(n.control.signingCalls, 0, name);
      assert.equal(n.control.factsCalls, 0, name);
    } finally { await f.close(); }
  }
});

test('synthetic nonce attempt one and externally pending or adverse signatures never authorize a first send', async () => {
  for (const status of ['attempt-one', 'pending', 'adverse']) {
    const f = await fixture();
    try {
      const n = await installRetainedNoncePayout(f, { status: 'RESERVED_BEFORE_BROADCAST' });
      if (status === 'attempt-one') { n.original.broadcastAttempts = 1; n.original.phase = 'BROADCAST_UNKNOWN'; }
      else n.control.observationStatus = status;
      const result = await f.controller.payout({ ticketId: n.id });
      assert.equal(result.status, status === 'adverse' ? 'NATIVE_ADVERSE' : 'UNKNOWN');
      if (status !== 'attempt-one') assert.equal((await n.retained()).native.externalSubmissionObserved, true);
      assert.equal(n.control.resumeCalls, 0); assert.equal(n.control.sends, 0); assert.equal(n.control.authorizationCalls, 0);
      assert.equal(n.control.signingCalls, 0); assert.equal(n.control.factsCalls, 0);
      // A later RPC absence cannot erase an already observed external submit.
      n.control.observationStatus = 'unknown'; await f.reopen();
      assert.equal((await f.controller.payout({ ticketId: n.id })).status, 'UNKNOWN');
      assert.equal(n.control.resumeCalls, 0); assert.equal(n.control.sends, 0); assert.equal(n.control.signingCalls, 0);
      await assert.rejects(f.controller.reconcileAll({}), /NATIVE_FINALITY_UNRESOLVED/);
    } finally { await f.close(); }
  }
});

test('synthetic externally finalized original nonce signature with owned count zero advances to the pre-proof discharge boundary', async () => {
  const f = await fixture();
  try {
    const n = await installRetainedNoncePayout(f); n.control.observationStatus = 'observed';
    const observed = await f.controller.reconcile({ operationId: n.id });
    assert.equal(observed.status, 'OBSERVED_AWAITING_DISCHARGE'); assert.equal((await n.retained()).native.status, 'OBSERVED');
    await f.reopen();
    await assert.rejects(f.controller.payout({ ticketId: n.id }), /TEST_STOP_BEFORE_NATIVE_PROOF_CONSTRUCTION/);
    assert.equal(n.control.factsCalls, 1); assert.equal((await n.retained()).status, 'OBSERVED_AWAITING_DISCHARGE');
    assert.equal(n.original.broadcastAttempts, 0); assert.equal(n.original.phase, 'SIGNED_NOT_BROADCAST');
    assert.equal(n.control.resumeCalls, 0); assert.equal(n.control.sends, 0); assert.equal(n.control.signingCalls, 0);
    assert.equal(n.control.authorizationCalls, 0); assert.ok(n.control.observations.every(id => id === n.nativeId));
  } finally { await f.close(); }
});

/** Authorization lifecycle regression tests. These use synthetic owned brands,
 * encrypted host persistence and fake proof results, never actual chain/proof work. */
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
function trackLifecycle(f) {
  const observer = f.options.observer, read = observer.read, issued = new WeakSet();
  const track = { reads: [], checks: [], permits: [] };
  observer.read = async () => {
    const result = deepFreeze(await read()); issued.add(result); track.reads.push(result); return result;
  };
  observer.assertCurrent = async snapshot => {
    assert.ok(issued.has(snapshot), 'TEST_EXACT_OWNED_SNAPSHOT_REQUIRED');
    assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.head));
    assert.deepEqual(snapshot.head, f.state.head, 'TEST_CURRENT_HEAD_CHANGED');
    track.checks.push(snapshot); await track.currentHook?.(snapshot);
    assert.deepEqual(snapshot.head, f.state.head, 'TEST_CURRENT_HEAD_CHANGED');
  };
  track.wrap = method => {
    const original = f.options.quorum[method]; assert.equal(typeof original, 'function');
    f.options.quorum[method] = async request => {
      const anchor = track.reads.at(-1), readCount = track.reads.length;
      await track.beforeAuthorization?.(method, request);
      const result = deepFreeze(await original(request));
      track.permits.push({ method, anchor, result, readCount });
      await track.afterAuthorization?.(method, result); return result;
    };
  };
  return track;
}
function addLifecycleMethod(f, name, inputs) {
  const signature = name + '(' + inputs.map(claimABIType).join(',') + ')';
  f.artifact.abi.push({ type: 'function', name, inputs });
  f.artifact.evm.methodIdentifiers[signature] = publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
}
const lifecycleProof = name => ({ name, type: 'tuple', components: [{ name: 'proof', type: 'bytes' }, { name: 'inputs', type: 'bytes32[]' }] });
const lifecycleRoute = { name: 'route', type: 'tuple', components: [{ name: 'endpoint', type: 'bytes' }, { name: 'salt', type: 'bytes32' },
  ...['quotedFee', 'selectedInputValue', 'changeFloor'].map(name => ({ name, type: 'uint64' })), { name: 'destinationFunded', type: 'bool' }] };
function advanceLifecycleHead(f) {
  f.state.head = { number: String(BigInt(f.state.head.number) + 1n), hash: hash('next head/' + f.state.head.hash),
    timestamp: String(BigInt(f.state.head.timestamp) + 1n) };
}
async function preparedLifecycleDeposit(f) {
  const prepared = await f.controller.prepare({ handoff: f.handoff }); f.control.intentId = prepared.intentId;
  await f.controller.preposition({ intentId: prepared.intentId }); return prepared.intentId;
}
function installLifecycleProofs(f, track) {
  f.options.quorum.facts = async () => ({ head: structuredClone(f.state.head), certificates: [] });
  for (const client of Object.values(f.options.proofClients)) client.prove = async request => {
    assert.deepEqual(request.inputs, { syntheticLifecycleOnly: true });
    advanceLifecycleHead(f); track.proofHead = structuredClone(f.state.head);
    return { proof: 'cdef', publicInputs: request.expectedPublicInputs };
  };
  f.options.quorum.health = async () => f.control.registerAuthorization({ head: structuredClone(f.state.head),
    message: { validFrom: f.state.head.timestamp, validUntil: String(BigInt(f.state.head.timestamp) + 30n) },
    abiSignatures: [0, 1, 2].map(signerIndex => ({ signerIndex, v: 27, r: hash('r'), s: hash('s') })) });
}
async function noKeyLifecycleRecord(f) {
  const record = (await ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims).read()).evm.at(-1);
  assert.equal(record.status, 'REJECTED_NO_KEY'); assert.equal(record.signed, null); return record;
}

test('authorization lifecycle reuses the exact immutable preposition snapshot through both freshness checks', async () => {
  const f = await fixture();
  try {
    const track = trackLifecycle(f); track.wrap('backing');
    const prepared = await f.controller.prepare({ handoff: f.handoff }); f.control.intentId = prepared.intentId;
    await f.controller.preposition({ intentId: prepared.intentId });
    const permit = track.permits[0]; assert.equal(permit.readCount, 1);
    assert.equal(track.checks.length, 2); assert.ok(track.checks.every(snapshot => snapshot === permit.anchor));
    assert.equal(track.reads.length, 2); // one pre-authorization read, then post-effect reconciliation
    await assert.rejects(f.options.observer.assertCurrent(structuredClone(permit.anchor)), /EXACT_OWNED_SNAPSHOT/);
    assert.equal(f.runtime.transactions.length, 1);
  } finally { await f.close(); }
});

test('authorization lifecycle rejects every head-field mismatch or newly advanced quorum head without reconstruction fallback', async () => {
  for (const field of ['hash', 'number', 'timestamp', 'advanced-head', 'current-check']) {
    const f = await fixture();
    try {
      const track = trackLifecycle(f), backing = f.options.quorum.backing;
      f.options.quorum.backing = async request => {
        if (field === 'advanced-head') advanceLifecycleHead(f);
        const result = structuredClone(await backing(request));
        if (['hash', 'number', 'timestamp'].includes(field)) result.head[field] = field === 'hash' ? hash('different') : '999';
        return result;
      };
      if (field === 'current-check') track.currentHook = () => { throw Error('TEST_FRESH_CHECK_FAILED'); };
      const prepared = await f.controller.prepare({ handoff: f.handoff });
      await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }),
        field === 'current-check' ? /TEST_FRESH_CHECK_FAILED/ : /CLAIM_AUTHORIZATION_HEAD_CHANGED/, field);
      assert.equal(track.reads.length, 1); assert.equal(f.control.dispatches, 0); assert.equal(f.runtime.transactions.length, 0);
    } finally { await f.close(); }
  }
});

test('final audit lease rejects deadline or liveness loss after either final await with original no-key classification', async t => {
  for (const fault of ['journal-deadline', 'current-deadline', 'journal-poison', 'current-poison', 'journal-head', 'current-head']) {
    const f = await fixture(), track = trackLifecycle(f); let now = 0;
    const clock = t.mock.method(performance, 'now', () => now);
    try {
      track.wrap('backing');
      f.control.preparedHook = () => { track.finalGuard = true; };
      const inject = async () => { await Promise.resolve();
        if (fault.endsWith('deadline')) now = 30_000;
        else if (fault.endsWith('head')) advanceLifecycleHead(f);
        else poisonedOperators.add(f.options.operators[0]); };
      if (fault.startsWith('current-')) track.currentHook = async () => { if (track.finalGuard) await inject(); };
      if (fault.startsWith('journal-')) {
        const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims), update = journal.update;
        journal.update = async transform => { const value = await update(transform);
          if (value.evm.at(-1)?.status === 'SIGNING_UNKNOWN') await inject(); return value; };
      }
      const prepared = await f.controller.prepare({ handoff: f.handoff });
      await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }),
        fault.endsWith('poison') ? /CLOSED_OR_POISONED/ : fault.endsWith('head') ? /TEST_CURRENT_HEAD_CHANGED/ : /(?:CLAIM_EVM_FINAL|CLAIM_ORIGINAL_V4)_AUDIT_TOO_OLD/, fault);
      assert.equal(f.control.dispatches, 1); assert.equal(f.runtime.transactions.length, 0);
      await noKeyLifecycleRecord(f);
    } finally { clock.mock.restore(); poisonedOperators.delete(f.options.operators[0]); await f.close(); }
  }
});

test('final audit lease accepts 29999ms while preserving original issuance age as evidence', async t => {
  const f = await fixture(); let now = 0; const clock = t.mock.method(performance, 'now', () => now);
  try {
    const track = trackLifecycle(f); track.wrap('backing'); f.control.finalAuditHook = () => { now = 29_999; };
    const id = await preparedLifecycleDeposit(f); assert.ok(id); assert.equal(f.runtime.transactions.length, 1);
    const record = (await ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims).read()).evm[0];
    assert.equal(record.finalAudit.auditElapsedMilliseconds, 29_999);
    assert.equal(record.finalAudit.originalAuthorizationAgeMilliseconds, 29_999);
  } finally { clock.mock.restore(); await f.close(); }
});

test('authorization lifecycle ingress and signed reservation each reuse their own original anchor', async () => {
  const f = await fixture();
  try {
    const track = trackLifecycle(f); installLostSolanaFixture(f, true);
    const id = await preparedLifecycleDeposit(f); track.reads.length = 0; track.checks.length = 0;
    track.wrap('authorizeIngress'); track.wrap('reservation');
    await f.controller.ingress({ intentId: id });
    for (const [method, checks] of [['authorizeIngress', 1], ['reservation', 2]]) {
      const permit = track.permits.find(row => row.method === method);
      assert.ok(permit); assert.equal(track.checks.filter(snapshot => snapshot === permit.anchor).length, checks);
    }
    assert.equal(f.control.nativeSigns, 1); assert.equal(f.control.nativeBroadcasts, 1);
  } finally { await f.close(); }
});

test('authorization lifecycle native ingress rejects deadline and poisoning after final native preparation', async t => {
  for (const fault of ['deadline', 'poison']) {
    const f = await fixture(); let now = 0; const clock = t.mock.method(performance, 'now', () => now);
    try {
      trackLifecycle(f); installLostSolanaFixture(f, true); const id = await preparedLifecycleDeposit(f);
      const adapter = f.options.claims.nativeRuntimes[0].adapter({ route: 'deposit' }), check = adapter.assertPrepared;
      adapter.assertPrepared = async value => { await check(value); await Promise.resolve();
        if (fault === 'deadline') now = 30_000; else poisonedQuorums.add(f.options.quorum); };
      await assert.rejects(f.controller.ingress({ intentId: id }),
        fault === 'deadline' ? /AUDIT_TOO_OLD/ : /CLOSED_OR_POISONED/);
      assert.equal(f.control.nativeSigns, 0); assert.equal(f.control.nativeBroadcasts, 0);
    } finally { clock.mock.restore(); poisonedQuorums.delete(f.options.quorum); await f.close(); }
  }
});

test('authorization lifecycle redemption retains its proposal and original pre-permit snapshot', async () => {
  const f = await fixture();
  try {
    const track = trackLifecycle(f); installRedemptionFixture(f); track.wrap('backing');
    const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims);
    f.control.includedHook = async () => { const row = (await journal.read()).tickets[0];
      f.state.gateways[0].tickets.push({ ticket: structuredClone(row.ticket), state: '1', payoutRouteCommitment: zero }); };
    await f.controller.requestRedemption({ claimDomain: f.packet.claimDomain, caller: f.runtime.accounts[0], amount: '1000000', maxFee: '5000' });
    const permit = track.permits[0]; assert.equal(track.checks.filter(snapshot => snapshot === permit.anchor).length, 2);
    assert.equal(track.reads.length, 3); assert.equal((await journal.read()).tickets.length, 1);
  } finally { await f.close(); }
});

async function installLifecycleUnsignedPayout(f) {
  const n = await installRetainedNoncePayout(f), native = f.options.claims.nativeRuntimes[0];
  await n.journal.update(data => { const row = data.tickets[0]; row.native = null; row.route = null; return data; });
  f.state.gateways[0].tickets[0].state = '1'; f.state.gateways[0].activePayout = zero;
  native.transfers = []; native.roles = { depositor: { endpoint: hash('depositor') },
    escrow: { endpoint: n.prepared.intent.sourcePublicKey }, recipient: { endpoint: n.prepared.intent.recipientPublicKey } };
  native.inventory = async () => ({ accounts: Object.values(native.roles).map(role => ({ ...role, exists: true, total: '100000000', rentExemptMinimum: '1000' })) });
  addLifecycleMethod(f, 'beginPayout', [{ name: 'ticketId', type: 'bytes32' }, lifecycleRoute, f.authSchema]);
  f.options.quorum.authorizePayout = async () => ({ head: structuredClone(f.state.head), message: { synthetic: true } });
  f.control.includedHook = () => { f.state.gateways[0].tickets[0].state = '2';
    f.state.gateways[0].activePayout = n.id; advanceLifecycleHead(f); };
  const adapter = native.adapter({ asset: f.config.nativeAsset, route: 'redeem' });
  adapter.transfer = async (_request, callbacks) => { const token=await callbacks.beforeSign(n.prepared);
    await f.control.afterPayoutAuthority?.();
    consumeNativeClaimOriginalKeyAuthorityV4(token,'payout',native.close,native.genesis,'redeem',n.prepared);
    n.control.signingCalls++; throw Error('TEST_STOP_AT_NATIVE_KEY_BOUNDARY'); };
  return { ...n, adapter };
}

test('authorization lifecycle payout refreshes only after beginPayout and closes its final native deadline', async t => {
  for (const fault of ['none', 'deadline', 'poison']) {
    const f = await fixture(); let now = 0; const clock = t.mock.method(performance, 'now', () => now);
    try {
      const track = trackLifecycle(f), n = await installLifecycleUnsignedPayout(f);
      track.wrap('backing'); track.wrap('authorizePayout');
      if(fault==='deadline')f.control.afterPayoutAuthority=()=>{now+=30_000;};
      const check = n.adapter.assertPrepared;
      n.adapter.assertPrepared = async value => { await check(value); await Promise.resolve();
        if (fault === 'deadline') now = 30_000;
        if (fault === 'poison') poisonedOperators.add(f.options.operators[0]); };
      await assert.rejects(f.controller.payout({ ticketId: n.id }), fault === 'deadline' ? /AUDIT_TOO_OLD/
        : fault === 'poison' ? /CLOSED_OR_POISONED/ : /TEST_STOP_AT_NATIVE_KEY_BOUNDARY/);
      const backing = track.permits.find(row => row.method === 'backing'), native = track.permits.find(row => row.method === 'authorizePayout');
      assert.notDeepEqual(backing.anchor.head, native.anchor.head);
      assert.deepEqual(native.anchor.head, f.state.head);
      assert.equal(track.checks.filter(snapshot => snapshot === backing.anchor).length, 2);
      assert.equal(track.checks.filter(snapshot => snapshot === native.anchor).length, 2);
      assert.equal(n.control.signingCalls, fault === 'none' ? 1 : 0); assert.equal(n.control.sends, 0);
      assert.equal(f.runtime.transactions.length, 1); // only the synthetic beginPayout EVM effect
      const retained = (await n.journal.read()).tickets[0];
      assert.equal((await n.journal.read()).evm[0].status, 'SUCCEEDED');
      assert.equal(f.state.gateways[0].tickets[0].state, '2'); assert.equal(f.state.gateways[0].activePayout, n.id);
      assert.equal(retained.status, 'UNKNOWN'); assert.equal(retained.native.status, 'SIGNING_UNKNOWN');
      if (fault === 'deadline') {
        assert.equal((await f.controller.payout({ ticketId: n.id })).status, 'UNKNOWN');
        assert.equal(n.control.signingCalls, 0); assert.equal(f.runtime.transactions.length, 1);
      }
    } finally { clock.mock.restore(); poisonedOperators.delete(f.options.operators[0]); await f.close(); }
  }
});

test('final audit lease v2 accepts old issuance only after new full validation and preserves original age/signatures', async t => {
  const f = await fixture(); let now = 0; const clock = t.mock.method(performance, 'now', () => now);
  try {
    const track = trackLifecycle(f); track.wrap('backing');
    f.control.preparedHook = () => { now = 90_000; };
    let exactOriginal;
    f.control.finalAuditHook = async result => { exactOriginal = result; await Promise.resolve(); now = 91_000; };
    await preparedLifecycleDeposit(f);
    const record = (await ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims).read()).evm[0];
    assert.equal(exactOriginal, track.permits[0].result);
    assert.deepEqual(exactOriginal.authorization, track.permits[0].result.authorization);
    assert.equal(f.control.backingCalls, 1); assert.equal(f.control.finalAudits, 1);
    assert.equal(f.runtime.transactions.length, 1);
    assert.equal(record.finalAudit.profile, 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V2');
    assert.equal(record.finalAudit.phase, 'CONSUMED_BEFORE_KEY');
    assert.equal(record.finalAudit.originalAuthorizationAgeMilliseconds, 91_000);
    assert.equal(record.finalAudit.auditElapsedMilliseconds, 1000); assert.equal(record.finalAudit.limitMilliseconds, 30_000);
    assert.match(record.finalAudit.originalAuthorizationSHA256, /^[0-9a-f]{64}$/);
    assert.match(record.finalAudit.preparedSHA256, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(record.finalAudit).includes(f.packet.opening.noteSecret));
  } finally { clock.mock.restore(); await f.close(); }
});

test('final audit lease rejects original certificate and proof expiry at current or exclusive next-block time', async () => {
  for (const window of ['permit-current', 'permit-next', 'health-current', 'health-next', 'owner-proof-next']) {
    const f = await fixture();
    try {
      trackLifecycle(f);
      if (window === 'owner-proof-next') f.state.head.timestamp = '999';
      else {
        const backing = f.options.quorum.backing;
        f.options.quorum.backing = async request => {
          const result = await backing(request), until = String(BigInt(f.state.head.timestamp) + (window.endsWith('next') ? 1n : 0n));
          if (window.startsWith('permit')) result.authorization.permit.validUntil = until;
          else result.authorization.healthUntil = until;
          return result;
        };
      }
      const prepared = await f.controller.prepare({ handoff: f.handoff });
      await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /CLAIM_EVM_ORIGINAL_WINDOW_EXPIRED/, window);
      assert.equal(f.control.finalAudits ?? 0, 0); assert.equal(f.runtime.transactions.length, 0);
      await noKeyLifecycleRecord(f);
    } finally { await f.close(); }
  }
});

test('final audit lease rejects changed prepared bytes, certificate bytes, result head or call intent after validation', async () => {
  for (const changed of ['calldata', 'nonce', 'unsigned-wire', 'prepared-head', 'signature', 'certificate-window', 'result-head']) {
    const f = await fixture();
    try {
      f.control.finalAuditHook = async result => {
        await Promise.resolve(); const prepared = f.control.activePrepared;
        if (changed === 'calldata') prepared.transaction.data = '0x1234';
        if (changed === 'nonce') prepared.transaction.nonce = '999';
        if (changed === 'unsigned-wire') prepared.unsignedWire = '0xabcd';
        if (changed === 'prepared-head') prepared.head.timestamp = '0xb';
        if (changed === 'signature') result.authorization.signatures[0].r = hash('altered signature');
        if (changed === 'certificate-window') result.authorization.permit.validUntil = '999999';
        if (changed === 'result-head') result.head.hash = hash('altered result head');
      };
      const prepared = await f.controller.prepare({ handoff: f.handoff });
      await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }),
        /CLAIM_EVM_(?:PREPARATION|CALL_ARGUMENTS|ORIGINAL_AUTHORIZATION)_CHANGED/, changed);
      assert.equal(f.control.finalAudits, 1); assert.equal(f.control.backingCalls, 1); assert.equal(f.runtime.transactions.length, 0);
      await noKeyLifecycleRecord(f);
    } finally { await f.close(); }
  }
});

test('final audit lease rejects a different initial prepared head or transaction before revalidation', async () => {
  for (const changed of ['genesis', 'head-number', 'head-hash', 'head-time', 'from', 'to', 'gas', 'value', 'chainId', 'data']) {
    const f = await fixture();
    try {
      f.control.preparedHook = prepared => {
        if (changed === 'genesis') prepared.genesis = p(hash('wrong genesis'));
        else if (changed.startsWith('head-')) prepared.head[changed === 'head-number' ? 'number' : changed === 'head-hash' ? 'hash' : 'timestamp']
          = changed === 'head-hash' ? p(hash('wrong head')) : '0x999';
        else prepared.transaction[changed] = ['from', 'to'].includes(changed) ? '0x' + 'aa'.repeat(20) : changed === 'data' ? '0x1234' : '999';
      };
      const prepared = await f.controller.prepare({ handoff: f.handoff });
      await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /CLAIM_EVM_PREPARED_(?:HEAD_CHANGED|GENESIS|INTENT)/, changed);
      assert.equal(f.control.finalAudits ?? 0, 0); assert.equal(f.runtime.transactions.length, 0);
      await noKeyLifecycleRecord(f);
    } finally { await f.close(); }
  }
});

test('final audit lease is claimed once before the first await and cannot replay serially or concurrently', async () => {
  for (const parallel of [false, true]) {
    const f = await fixture();
    try {
      trackLifecycle(f); f.control[parallel ? 'parallelGuard' : 'replayGuard'] = true;
      f.control.finalAuditHook = async () => { await Promise.resolve(); };
      const prepared = await f.controller.prepare({ handoff: f.handoff });
      await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /CLAIM_EVM_FINAL_GUARD_ALREADY_USED/);
      assert.equal(f.control.finalAudits, 1); assert.equal(f.runtime.transactions.length, 0);
      await noKeyLifecycleRecord(f);
      await assert.rejects(f.control.lastGuard(f.control.activePrepared), /CLAIM_EVM_CALL_INACTIVE/);
      assert.equal(f.control.finalAudits, 1);
    } finally { await f.close(); }
  }
});

test('final audit lease cannot recover authority from a serialized certificate or persisted provenance after reopen', async () => {
  const f = await fixture();
  try {
    trackLifecycle(f); await preparedLifecycleDeposit(f);
    const serialized = structuredClone(f.control.lastAuthorization);
    const saved = (await ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims).read()).evm[0].finalAudit;
    const oldGuard = f.control.lastGuard, oldPrepared = f.control.activePrepared;
    await f.reopen(); installRedemptionFixture(f);
    f.options.quorum.backing = async () => ({ ...structuredClone(serialized), finalAudit: structuredClone(saved) });
    await assert.rejects(f.controller.requestRedemption({ claimDomain: f.packet.claimDomain, caller: f.runtime.accounts[0],
      amount: '1000000', maxFee: '5000' }), /TEST_ORIGINAL_QUORUM_RESULT/);
    assert.equal(f.runtime.transactions.length, 1); assert.equal(f.control.finalAudits, 1);
    await noKeyLifecycleRecord(f);
    await assert.rejects(oldGuard(oldPrepared), /CLAIM_CONTROLLER_CLOSED|CLAIM_EVM_CALL_INACTIVE/);
  } finally { await f.close(); }
});

test('final audit lease rejects keeper uncertainty arising during the final current await before key permission', async () => {
  const f = await fixture();
  try {
    const track = trackLifecycle(f), journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims);
    f.control.preparedHook = () => { track.finalGuard = true; };
    track.currentHook = async () => { if (track.finalGuard) {
      await writeFile(f.path, Buffer.from('synthetic corrupted keeper evidence'));
      await assert.rejects(journal.read(), /CLAIM_KEEPER_READ_UNCERTAIN/);
    } };
    const prepared = await f.controller.prepare({ handoff: f.handoff });
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /CLAIM_EVM_KEEPER_UNAVAILABLE/);
    assert.equal(f.runtime.transactions.length, 0); assert.equal(f.keeper.status().uncertain, true);
    // A poisoned journal cannot acknowledge new classification bookkeeping.
    // The original failure is preserved; it never grants permission to sign.
  } finally { await f.close(); }
});

test('authorization lifecycle broadcast keeps fresh original anchors, reservation/revocation/preparation and final liveness', async t => {
  for (const fault of ['none', 'deadline', 'poison']) {
    const f = await fixture(); let now = 0; const clock = t.mock.method(performance, 'now', () => now);
    try {
      const track = trackLifecycle(f), n = await installRetainedNoncePayout(f); track.wrap('authorizeBroadcast');
      if(fault==='deadline')f.control.finalAuditHook=async result=>{if(result.message?.nativeGid){await Promise.resolve();now+=30000;}};
      const adapter = f.options.claims.nativeRuntimes[0].adapter({ asset: f.config.nativeAsset, route: 'redeem' }), check = adapter.assertPrepared;
      adapter.assertPrepared = async value => { await check(value); await Promise.resolve();
        if (fault === 'deadline') now += 30_000;
        if (fault === 'poison') poisonedQuorums.add(f.options.quorum); };
      if (fault === 'none') await f.controller.payout({ ticketId: n.id });
      else await assert.rejects(f.controller.payout({ ticketId: n.id }), fault === 'deadline' ? /AUDIT_TOO_OLD|AUTHORIZATION_TOO_OLD/ : /CLOSED_OR_POISONED/);
      const permit = track.permits[0]; assert.ok(track.checks.includes(permit.anchor));
      assert.equal(n.control.unrevokedChecks, fault === 'none' ? 2 : 1); assert.equal(n.control.preparedChecks,1);
      assert.equal(n.control.sends, fault === 'none' ? 1 : 0); assert.equal(n.original.nativeWire, n.nativeWire);
      assert.equal(n.control.signingCalls, 0);
    } finally { clock.mock.restore(); poisonedQuorums.delete(f.options.quorum); await f.close(); }
  }
});

test('authorization lifecycle issue and debt-health use post-proof owned anchors with original EVM checks', async t => {
  for (const operation of ['issue', 'voidDeposit', 'discharge']) {
    for (const fault of ['final-current-boundary', 'final-audit-deadline']) {
    const f = await fixture(); let now = 0; const clock = t.mock.method(performance, 'now', () => now);
    try {
      const track = trackLifecycle(f); let id;
      if (operation === 'discharge') {
        const n = await installRetainedNoncePayout(f); n.control.observationStatus = 'observed'; id = n.id;
      } else {
        installLostSolanaFixture(f, true); id = await preparedLifecycleDeposit(f);
        await f.controller.ingress({ intentId: id });
        if (operation === 'voidDeposit') f.state.head.timestamp = '1001';
      }
      installLifecycleProofs(f, track);
      const sig = { ...f.authSchema.components[1], name: 'signatures' };
      addLifecycleMethod(f, 'issue', [lifecycleProof('ownerProof'), lifecycleProof('nativeProof'), f.authSchema]);
      addLifecycleMethod(f, 'voidDeposit', [lifecycleProof('nativeProof'), ...['revision', 'claimSequence', 'validFrom', 'validUntil'].map(name => ({ name, type: 'uint64' })), sig]);
      addLifecycleMethod(f, 'discharge', [lifecycleProof('nativeProof'), ...['claimSequence', 'validFrom', 'validUntil'].map(name => ({ name, type: 'uint64' })), sig]);
      track.wrap(operation === 'issue' ? 'backing' : 'health');
      if (fault === 'final-audit-deadline') f.control.finalAuditHook = () => { now = 30_000; };
      f.control.preparedHook = () => { track.finalGuard = true; };
      track.currentHook = () => { if (track.finalGuard && fault === 'final-current-boundary') throw Error('TEST_STOP_AFTER_FINAL_CURRENT_CHECK'); };
      await assert.rejects(operation === 'discharge' ? f.controller.payout({ ticketId: id })
        : f.controller[operation]({ intentId: id }), fault === 'final-audit-deadline'
        ? /(?:CLAIM_EVM_FINAL|CLAIM_ORIGINAL_V4)_AUDIT_TOO_OLD/ : /TEST_STOP_AFTER_FINAL_CURRENT_CHECK/);
      const permit = track.permits.at(-1); assert.deepEqual(permit.anchor.head, track.proofHead);
      assert.equal(track.checks.filter(snapshot => snapshot === permit.anchor).length, 2);
      await noKeyLifecycleRecord(f);
    } finally { clock.mock.restore(); await f.close(); }
    }
  }
});

test('payout final native preparation and final original-current await both fence head, liveness and exact deadline before key or send', async t => {
  for (const stage of ['presign', 'broadcast']) for (const phase of ['native', 'current']) for (const fault of ['head', 'poison', 'deadline', 'pass']) {
    const f = await fixture(); let now = 0, preparedDone = false;
    const clock = t.mock.method(performance, 'now', () => now);
    try {
      const track = trackLifecycle(f), n = stage === 'presign' ? await installLifecycleUnsignedPayout(f) : await installRetainedNoncePayout(f, { status: 'RESERVED_BEFORE_BROADCAST' });
      const adapter = stage === 'presign' ? n.adapter : f.options.claims.nativeRuntimes[0].adapter({ asset: f.config.nativeAsset, route: 'redeem' });
      const check = adapter.assertPrepared;
      const inject = async () => {
        await Promise.resolve();
        if (fault === 'head') advanceLifecycleHead(f);
        if (fault === 'poison') poisonedOperators.add(f.options.operators[0]);
        if (fault === 'deadline') now += 30_000;
        if (fault === 'pass') now = 29_999;
      };
      if(stage==='presign'&&fault==='deadline')f.control.afterPayoutAuthority=inject;
      if(stage==='broadcast'&&fault==='deadline')f.control.finalAuditHook=async result=>{if(result.message?.nativeGid)await inject();};
      adapter.assertPrepared = async value => { await check(value); preparedDone = true; if (phase === 'native') await inject(); };
      track.currentHook = async () => { if (preparedDone && phase === 'current') await inject(); };
      if (fault === 'pass' && stage === 'broadcast') await f.controller.payout({ ticketId: n.id });
      else await assert.rejects(f.controller.payout({ ticketId: n.id }), fault === 'pass' ? /TEST_STOP_AT_NATIVE_KEY_BOUNDARY/
        : fault === 'head' ? /TEST_CURRENT_HEAD_CHANGED/ : fault === 'poison' ? /CLOSED_OR_POISONED/ : /AUDIT_TOO_OLD|AUTHORIZATION_TOO_OLD/);
      assert.equal(n.control.signingCalls, stage === 'presign' && fault === 'pass' ? 1 : 0);
      assert.equal(n.control.sends, stage === 'broadcast' && fault === 'pass' ? 1 : 0);
      if (fault !== 'pass') assert.equal(n.original.broadcastAttempts, 0);
    } finally { clock.mock.restore(); poisonedOperators.delete(f.options.operators[0]); await f.close(); }
  }
});

test('prepared BEGIN_PAYOUT final validation retains original certificate after EVM preparation and fails before native key on final guard faults', async t => {
  for (const fault of ['head', 'deadline', 'poison', 'original']) {
    const f = await fixture(); let now = 0; const clock = t.mock.method(performance, 'now', () => now);
    try {
      const track = trackLifecycle(f), n = await installLifecycleUnsignedPayout(f); track.wrap('backing');
      let original;
      f.control.preparedHook = () => { now = 90_000; };
      f.control.finalAuditHook = async result => {
        if(result.authorization)original = result; await Promise.resolve();
        if (fault === 'head') advanceLifecycleHead(f);
        if (fault === 'deadline') now += 30_000;
        if (fault === 'poison') poisonedOperators.add(f.options.operators[0]);
      };
      await assert.rejects(f.controller.payout({ ticketId: n.id }), fault === 'head' ? /TEST_CURRENT_HEAD_CHANGED/
        : fault === 'deadline' ? /(?:CLAIM_EVM_FINAL|CLAIM_ORIGINAL_V4)_AUDIT_TOO_OLD/ : fault === 'poison' ? /CLOSED_OR_POISONED/ : /TEST_STOP_AT_NATIVE_KEY_BOUNDARY/);
      assert.equal(original, track.permits[0].result); assert.equal(f.control.backingCalls, 1); assert.equal(f.control.finalAudits, fault==='original'?2:1);
      assert.equal(n.control.signingCalls, fault === 'original' ? 1 : 0); assert.equal(n.control.sends, 0);
      if (fault !== 'original') { assert.equal(f.runtime.transactions.length, 0); await noKeyLifecycleRecord(f); }
    } finally { clock.mock.restore(); poisonedOperators.delete(f.options.operators[0]); await f.close(); }
  }
});

test('payout post-fsync gate preserves consumed latch and exact original authority through late head, epoch, wire, certificate, liveness and deadline faults', async t => {
  for (const phase of ['latch', 'final-current', 'sync']) for (const fault of ['head','epoch','wire','preparation','authorization','poison','deadline','pass']) {
    // A remote head can move after the final RPC observation; no synchronous
    // local check can query it atomically. Local mutation is covered by epoch.
    if (phase === 'sync' && fault === 'head') continue;
    const f=await fixture();let now=0,latched=false;const clock=t.mock.method(performance,'now',()=>now);
    try {
      const track=trackLifecycle(f),n=await installRetainedNoncePayout(f,{status:'RESERVED_BEFORE_BROADCAST'});
      const inject=async()=>{await Promise.resolve();
        if(fault==='head')advanceLifecycleHead(f);
        if(fault==='epoch')f.runtime.ingressSendState=Object.freeze({epoch:'1',busy:false,uncertain:false});
        if(fault==='wire')n.original.nativeWire+='AAAA';
        if(fault==='preparation')n.control.activePrepared.intent.lamports='999999';
        if(fault==='authorization')n.control.originalAuthorization.message.inventoryCommitment=hash('replaced inventory');
        if(fault==='poison')poisonedOperators.add(f.options.operators[0]);
        if(fault==='deadline')now=30000;
        if(fault==='pass')now=29999;
      };
      n.control.afterLatch=async()=>{latched=true;if(phase==='latch')await inject();};
      let finalReads=0;
      track.currentHook=async()=>{if(latched&&phase==='final-current'&&++finalReads===2)await inject();};
      n.control.afterFinalAwait=async()=>{if(phase==='sync')await inject();};
      if(fault==='pass')await f.controller.payout({ticketId:n.id});else await assert.rejects(f.controller.payout({ticketId:n.id}),/HEAD_CHANGED|MUTATION_CHANGED|FINAL_WIRE|PREPARATION_CHANGED|AUTHORIZATION_CHANGED|CLOSED_OR_POISONED|AUDIT_TOO_OLD/, phase + ':' + fault);
      assert.equal(n.control.authorizationCalls,1,'post-latch validation never collects another certificate');
      assert.equal(n.control.signingCalls,0);assert.equal(n.original.broadcastAttempts,1);assert.equal(n.original.phase,'BROADCAST_UNKNOWN');
      assert.equal(n.control.sends,fault==='pass'?1:0);
      if(fault==='pass') {
        assert.ok(n.control.events.indexOf('persist-latch')<n.control.events.indexOf('before-send'));
        assert.ok(n.control.events.indexOf('final-sync')<n.control.events.indexOf('send'));
        await assert.rejects(n.control.finalCallbacks.beforeSend(n.control.activePrepared),/FINAL_GUARD_ALREADY_ENTERED|FINAL_ONE_USE_PERMISSION_REQUIRED/);
        assert.throws(()=>n.control.finalCallbacks.assertBeforeSend(n.control.activePrepared),/FINAL_GUARD_ALREADY_ENTERED|FINAL_ONE_USE_PERMISSION_REQUIRED/);
      }
    } finally {clock.mock.restore();poisonedOperators.delete(f.options.operators[0]);await f.close();}
  }
});

test('payout post-fsync refuses consumed reservation, revocation, expiring original certificate and keeper uncertainty without reauthorization', async()=>{
  for(const fault of ['reservation','revoked','expiry','keeper']) {
    const f=await fixture();
    try {
      trackLifecycle(f);const n=await installRetainedNoncePayout(f,{status:'RESERVED_BEFORE_BROADCAST'});
      if(fault==='expiry')n.control.authorizationHook=auth=>{auth.message.validUntil=String(BigInt(f.state.head.timestamp)+1n);};
      n.control.afterLatch=async()=>{
        if(fault==='reservation')n.control.reservation.consumed=true;
        if(fault==='revoked')n.control.revoked=true;
        if(fault==='keeper'){await writeFile(f.path,Buffer.from('synthetic keeper corruption'));await assert.rejects(n.journal.read(),/KEEPER_READ_UNCERTAIN/);}
      };
      await assert.rejects(f.controller.payout({ticketId:n.id}),/RESERVATION_CONSUMED|REVOKED_NATIVE_GID|CERTIFICATE_EXPIRED|KEEPER_UNAVAILABLE|KEEPER_READ_UNCERTAIN/);
      assert.equal(n.original.broadcastAttempts,fault==='expiry'?0:1);assert.equal(n.control.sends,0);assert.equal(n.control.authorizationCalls,1);
    } finally {await f.close();}
  }
});
