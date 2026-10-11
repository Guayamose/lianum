/** Pure consistency check for every retained operator fact, including expired
 * certificates. The operator supplies its authenticated inventory, pinned
 * policy and a fresh observation from its owned native reader. Passing this
 * check establishes neither observation provenance nor certificate authority.
 * No clock, signing, expiry extension or inventory mutation occurs here.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { validateNativeFacts, validateNativeClaimFacts, validateBitcoinBinding, validateSolanaBindingTransaction }
  from '@lianum/engine/native/native-receipt-binding';
import { validateClaimSolanaBindingTransaction } from '../../../chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { validateEvmDeliveryWire } from '../../../chains/evm/dispatch/evm-facts-binding.mjs';
import { evmGraphDeliveryTermsV1 } from '../../../chains/evm/dispatch/evm-graph-delivery-codec-v1.mjs';

const ZERO = '0'.repeat(64);
const ENTRY_FIELDS = ['request', 'nativeWire', 'intent', 'facts', 'maximumEvidenceUntil',
  'status', 'reason', 'lastCheckedAt', 'signature'];
const OBSERVED_FIELDS = ['status', 'genesis', 'asset', 'nativeWire', 'intent', 'blockId',
  'blockHeight', 'finalityKind', 'confirmations', 'nativeContext'];

function exact(value, fields) {
  assert.ok(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'EXPECTED_PLAIN_RECORD');
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.length === fields.length && fields.every(name => keys.includes(name)), 'UNEXPECTED_FIELDS');
  for (const name of fields) {
    const property = Object.getOwnPropertyDescriptor(value, name);
    assert.ok(property && Object.hasOwn(property, 'value') && property.enumerable, 'EXPECTED_DATA_FIELD');
  }
}

// Same endpoint framing as the peer. Its raw endpoint has already passed the
// exact BTC/SOL intent validator before this function is called.
function endpoint(facts, raw) {
  const parts = [Buffer.from('LIANUM/PAEG/native-endpoint/2'), Buffer.from('LIANUM_PAEG_NATIVE_4_V2'),
    Buffer.from(facts.family === '1' ? 'BTC' : 'SOL'), Buffer.from(facts.genesis, 'hex'),
    Buffer.from(facts.asset, 'hex'), Buffer.from(facts.family === '1' ? 'BTC_P2WPKH_SCRIPT' : 'SOL_PUBLIC_KEY'),
    Buffer.from(raw, 'hex')];
  const framed = parts.flatMap(part => {
    const length = Buffer.alloc(4); length.writeUInt32BE(part.length); return [length, part];
  });
  return createHash('sha256').update(Buffer.concat(framed)).digest('hex');
}

const V1_CODEC = Object.freeze({ validate: validateNativeFacts, solana: validateSolanaBindingTransaction });
const CLAIM_CODEC = Object.freeze({ validate: validateNativeClaimFacts, solana: validateClaimSolanaBindingTransaction });
function binding(nativeWire, intent, facts, request, codec) {
  const bitcoin = facts.family === '1', evm = facts.family === '3';
  const wire = bitcoin ? validateBitcoinBinding(nativeWire, intent)
    : evm ? validateEvmDeliveryWire(nativeWire, intent) : codec.solana(nativeWire, intent);
  if (bitcoin) assert.equal(wire.containsWitness, true, 'UNSIGNED_BITCOIN');
  const nativeId = bitcoin ? wire.txid : evm ? wire.nativeId : wire.signatureHex;
  assert.equal(nativeId, request.nativeId, 'REQUEST_NATIVE_ID');
  assert.equal(nativeId + (bitcoin || evm ? ZERO : ''), facts.transactionId, 'FACT_TRANSACTION_ID');
  assert.equal(wire.wireKeyCommitment, request.wireKeyCommitment, 'REQUEST_WIRE_KEY');
  for (const name of ['transactionSHA256', 'effectIndex', 'wireBindingVersion',
    'wireBindingKind', 'wireBindingPosition', 'wireKeyCommitment'])
    assert.equal(wire[name], facts[name], 'FACT_WIRE_BINDING_' + name);
  if (evm) {
    const identity = evmGraphDeliveryTermsV1(intent.descriptor).identity;
    assert.equal(identity.genesisHash, facts.genesis, 'EVM_DESCRIPTOR_GENESIS');
    assert.equal(identity.shareIdentity, facts.asset, 'EVM_DESCRIPTOR_ASSET');
    assert.equal(identity.ledgerNamespace, facts.ledgerNamespace, 'EVM_DESCRIPTOR_NAMESPACE');
    for (const name of ['sourceCommitment', 'destinationCommitment', 'amount'])
      assert.equal(facts.observation[name], wire[name], 'EVM_OBSERVED_' + name);
    return;
  }
  assert.equal(facts.observation.sourceCommitment,
    endpoint(facts, bitcoin ? intent.sourceScript : intent.sourcePublicKey), 'SOURCE_ENDPOINT');
  assert.equal(facts.observation.destinationCommitment,
    endpoint(facts, bitcoin ? intent.recipientScript : intent.recipientPublicKey), 'DESTINATION_ENDPOINT');
  assert.equal(facts.observation.amount, bitcoin ? intent.amountSatoshi : intent.lamports, 'ACTION_AMOUNT');
}

/** Returns undefined or throws an error with code/message OPERATOR_FACT.
 * Native RPC failures and unknown/adverse statuses must also block at the
 * operator boundary; a successful check cannot clear a durable adverse latch.
 * BTC binding checks signed-witness syntax; its UTXO/signature/finality truth
 * comes from the owned reader. SOL binding verifies the Ed25519 signature.
 * EVM verifies standard signed wire and the exact fixed call, while actual
 * canonical execution, event and backing/state truth stay with its owned reader.
 */
export function assertStableOperatorFact(entry, observation, policy) {
  return stableOperatorFact(entry, observation, policy, V1_CODEC);
}
/** Fixed payout/refund audit, accepting only BTC v1 and SOL v1 or nonce v2. */
export function assertStableClaimOperatorFact(entry, observation, policy) {
  return stableOperatorFact(entry, observation, policy, CLAIM_CODEC);
}
function stableOperatorFact(entry, observation, policy, codec) {
  try {
    exact(entry, ENTRY_FIELDS);
    // Validate the retained certificate's complete internal relations first.
    // validateNativeFacts checks the original times but does not consult now.
    const facts = codec.validate(entry.facts, policy);
    exact(entry.request, ['family', 'recipientIndex', 'nativeId', 'wireKeyCommitment']);
    assert.equal(entry.request.family, facts.family, 'REQUEST_FAMILY');
    assert.ok(typeof entry.request.recipientIndex === 'string'
      && entry.request.recipientIndex.length <= 3
      && /^(0|[1-9][0-9]*)$/.test(entry.request.recipientIndex)
      && BigInt(entry.request.recipientIndex).toString() === entry.request.recipientIndex
      && BigInt(entry.request.recipientIndex) < 256n, 'REQUEST_RECIPIENT_INDEX');
    binding(entry.nativeWire, entry.intent, facts, entry.request, codec);

    exact(observation, OBSERVED_FIELDS);
    assert.equal(observation.status, 'observed', 'OBSERVATION_STATUS');
    assert.equal(observation.genesis, facts.genesis, 'OBSERVATION_GENESIS');
    assert.equal(observation.asset, facts.asset, 'OBSERVATION_ASSET');
    binding(observation.nativeWire, observation.intent, facts, entry.request, codec);
    assert.equal(observation.nativeWire, entry.nativeWire, 'CERTIFIED_WIRE_CHANGED');
    assert.deepEqual(observation.intent, entry.intent, 'CERTIFIED_INTENT_CHANGED');
    assert.equal(observation.blockId, facts.observation.blockId, 'CERTIFIED_BLOCK_CHANGED');
    assert.equal(observation.blockHeight, facts.observation.blockHeight, 'CERTIFIED_HEIGHT_CHANGED');

    // Retain every original identity, custody, amount and observation-time
    // field. Only the reader's current finality/context replace old values.
    const current = codec.validate({ ...facts, observation: { ...facts.observation,
      blockId: observation.blockId, blockHeight: observation.blockHeight,
      finalityKind: observation.finalityKind, confirmations: observation.confirmations },
    nativeContext: observation.nativeContext }, policy);
    const before = facts.nativeContext, after = current.nativeContext;
    if (facts.family === '1' || facts.family === '3') {
      assert.ok(BigInt(after.observedTipHeight) >= BigInt(before.observedTipHeight), 'NATIVE_TIP_ROLLBACK');
      if (after.observedTipHeight === before.observedTipHeight)
        assert.equal(after.observedTipId, before.observedTipId, 'NATIVE_SAME_HEIGHT_TIP_CHANGED');
    } else {
      assert.equal(after.transactionSlot, before.transactionSlot, 'SOLANA_TRANSACTION_SLOT_CHANGED');
      assert.equal(after.parentSlot, before.parentSlot, 'SOLANA_PARENT_SLOT_CHANGED');
      assert.ok(BigInt(after.observedSlot) >= BigInt(before.observedSlot), 'SOLANA_OBSERVED_SLOT_ROLLBACK');
    }
  } catch (cause) {
    const error = new Error('OPERATOR_FACT', { cause }); error.code = 'OPERATOR_FACT'; throw error;
  }
}
