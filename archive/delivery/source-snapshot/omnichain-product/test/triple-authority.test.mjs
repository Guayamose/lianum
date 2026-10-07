import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These are deliberately source-boundary regressions. They are not EVM/native
// execution evidence; the separate integration must exercise actual receipts.
const source = readFileSync(new URL('../contracts/LocalTripleDeliveryEscrow.sol', import.meta.url), 'utf8');
const body = name => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  while (depth && end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0, `${name}: balanced braces`);
  return source.slice(open + 1, end - 1);
};

test('triple source: canonical native keys have no reservation/session-dependent input', () => {
  const sol = body('solanaEffectId'), btc = body('bitcoinEffectId');
  assert.match(sol, /solanaGenesis, signatureA, signatureB, instructionIndex/);
  assert.match(btc, /bitcoinGenesis, txid, vout/);
  for (const identity of [sol, btc]) assert.doesNotMatch(identity, /\b(id|salt|orderHash|owner|session|slot|observedAt|authorityDomain)\b/);
  assert.match(sol, /NATIVE_SOLANA_SYSTEM_TRANSFER/);
  assert.match(btc, /NATIVE_BITCOIN_OUTPUT/);
});

test('triple source: authority and lock commit every owner-authorized delivery term', () => {
  const domain = body('authorityDomain'), lock = body('lockDigest');
  for (const term of ['AUTHORITY_VERSION', 'block.chainid', 'evmGenesis', 'address(this)', 'observer', 'solanaGenesis', 'bitcoinGenesis']) assert.ok(domain.includes(term), term);
  for (const term of ['owner', 'solver', 'amount', 'orderHash', 'solSender', 'solRecipient', 'solLamports', 'btcScriptHash', 'ratioNumerator', 'ratioDenominator', 'minimumConfirmations', 'openedAt', 'executeBy', 'claimBy']) assert.ok(lock.includes(`r.${term}`), term);
  assert.doesNotMatch(lock, /abi\.encode\([^;]*r\.state/s);
});

test('triple source: certification binds full successful result and consumes SOL globally', () => {
  const certify = body('certifySolana');
  for (const guard of ['msg.sender == observer', 'r.state == State.OPEN', 'solanaResults[id].parent == 0', 'success && finalized', 'instructionIndex == 0', 'slot > 0', 'sender == r.solSender && recipient == r.solRecipient', 'expectedSats(id, actualLamports)', '!consumedSolanaEffect[effect]', 'consumedSolanaEffect[effect] = true']) assert.ok(certify.includes(guard), guard);
  assert.ok(certify.indexOf('consumedSolanaEffect[effect] = true') < certify.indexOf('solanaResults[id] = SolanaResult'));
  assert.match(certify, /signatureA, signatureB, instructionIndex, slot, success, finalized,\s*sender, recipient, actualLamports, sats, observedAt/s);
  assert.match(body('expectedSats'), /actualLamports == r\.solLamports/);
});

test('triple source: claim binds prior parent and actual arithmetic before payout', () => {
  const claim = body('claimBitcoin');
  for (const guard of ['msg.sender == observer', 'sol.parent != 0 && parent == sol.parent', 'observedAt >= sol.certifiedAt', 'scriptHash == r.btcScriptHash', 'sats == sol.sats', 'sats == expectedSats(id, sol.actualLamports)', 'confirmations >= r.minimumConfirmations', '!consumedBitcoinEffect[effect]']) assert.ok(claim.includes(guard), guard);
  assert.ok(claim.indexOf('parent == sol.parent') < claim.indexOf('consumedBitcoinEffect[effect] = true'));
  assert.ok(claim.indexOf('consumedBitcoinEffect[effect] = true') < claim.indexOf('r.state = State.PAID'));
  assert.ok(claim.indexOf('r.state = State.PAID') < claim.indexOf('r.solver.call'));
});

test('triple source: exact expiry boundary and refund cannot release consumed effects', () => {
  const refund = body('refund');
  assert.match(body('claimBitcoin'), /block\.timestamp < r\.claimBy/);
  assert.match(body('certifySolana'), /block\.timestamp < r\.claimBy/);
  assert.match(refund, /block\.timestamp >= r\.claimBy/);
  assert.match(refund, /msg\.sender == r\.owner/);
  assert.doesNotMatch(refund, /delete\s|consumed(?:Solana|Bitcoin)Effect[^;]*=/);
  assert.doesNotMatch(source, /consumed(?:Solana|Bitcoin)Effect\[[^\]]+\]\s*=\s*false|delete\s+consumed(?:Solana|Bitcoin)Effect/);
});

test('triple source: ratio multiplication widens before arithmetic and output narrows after bounds', () => {
  const arithmetic = body('_computedSats');
  assert.match(arithmetic, /numerator > 0 && numerator <= MAX_RATIO_COMPONENT && denominator > 0 && denominator <= MAX_RATIO_COMPONENT/);
  assert.match(arithmetic, /uint256\(lamports\) \* uint256\(numerator\) \/ uint256\(denominator\)/);
  assert.ok(arithmetic.indexOf('sats > 0 && sats <= MAX_BITCOIN_SATS') < arithmetic.indexOf('return uint64(sats)'));
  assert.match(body('reserve'), /minimumConfirmations >= MIN_CONFIRMATIONS/);
  assert.match(source, /MIN_CONFIRMATIONS = 6/);
  assert.match(source, /MAX_RATIO_COMPONENT = 1_000_000_000_000/);
  assert.match(source, /MAX_BITCOIN_SATS = 2_100_000_000_000_000/);
});
