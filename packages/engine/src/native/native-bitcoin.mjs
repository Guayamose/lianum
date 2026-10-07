import assert from 'node:assert/strict';

export const satsFromBTC = value => {
  const text = Number(value).toFixed(8); assert.match(text, /^\d+\.\d{8}$/); return BigInt(text.replace('.', ''));
};

// Trusted-node observation, not an atomic RPC snapshot or independent finality
// proof. Bounded retries reject a changing tip; never derive depth by combining
// a historical header with a later chain height.
export async function observeBitcoinDelivery(r, o) {
  assert.equal((await r.btc('getblockchaininfo')).chain, 'regtest');
  assert.equal(await r.btc('getblockhash', [0]), o.order.bitcoinGenesis);
  const network = await r.btc('getnetworkinfo'); assert.equal(network.connections, 0); assert.equal(network.networkactive, false);
  const mine = await r.btc('getaddressinfo', [o.recipientAddress], 'm9-recipient');
  assert.equal(mine.ismine, true); assert.equal(mine.scriptPubKey, o.order.recipientScript);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const tipBefore = await r.btc('getbestblockhash');
    const decoded = await r.btc('getrawtransaction', [o.bitcoin.txid, true]); assert.equal(decoded.txid, o.bitcoin.txid);
    const outputs = decoded.vout.filter(v => v.scriptPubKey.hex === o.order.recipientScript && satsFromBTC(v.value).toString() === o.order.sats);
    assert.equal(outputs.length, 1, 'Exact unique recipient output');
    const vout = outputs[0].n; if (o.bitcoin.vout !== undefined) assert.equal(vout, o.bitcoin.vout);
    let header, canonical;
    if (decoded.blockhash) {
      header = await r.btc('getblockheader', [decoded.blockhash]);
      assert.ok(Number.isSafeInteger(header.height) && header.height >= 0, 'INVALID_DELIVERY_HEIGHT');
      canonical = await r.btc('getblockhash', [header.height]);
    } else await r.btc('getmempoolentry', [o.bitcoin.txid]);
    const walletTx = await r.btc('gettransaction', [o.bitcoin.txid], 'm9-solver');
    assert.ok(Number.isFinite(walletTx.fee) && walletTx.fee <= 0, 'INVALID_TRANSACTION_FEE');
    // Auxiliary UTXO reads describe spending only. Their absence/failure must
    // never revoke a historically confirmed delivery or authorize a payment.
    const utxos = decoded.blockhash ? await Promise.allSettled([
      r.btc('gettxout', [o.bitcoin.txid, vout, false]), r.btc('gettxout', [o.bitcoin.txid, vout, true]),
    ]) : [];
    let headerAgain, canonicalAgain;
    if (header) {
      headerAgain = await r.btc('getblockheader', [decoded.blockhash]);
      canonicalAgain = await r.btc('getblockhash', [header.height]);
    } else await r.btc('getmempoolentry', [o.bitcoin.txid]);
    const tipAfter = await r.btc('getbestblockhash');
    if (tipBefore !== tipAfter || (header && (canonical !== canonicalAgain || header.height !== headerAgain.height || header.confirmations !== headerAgain.confirmations))) continue;
    const confirmations = headerAgain?.confirmations ?? 0;
    if (header) {
      assert.equal(canonicalAgain, decoded.blockhash, 'DELIVERY_BLOCK_NOT_CANONICAL');
      assert.ok(Number.isSafeInteger(confirmations) && confirmations > 0, 'DELIVERY_BLOCK_NOT_CANONICAL');
    }
    let outputState = 'UNKNOWN';
    if (utxos.length && utxos.every(v => v.status === 'fulfilled' && (v.value === null || v.value.bestblock === tipAfter))) {
      const [chain, mempool] = utxos.map(v => v.value);
      if (chain === null && mempool === null) outputState = 'SPENT_IN_OBSERVED_CHAIN';
      else if (chain !== null && mempool === null) outputState = 'SPENT_IN_MEMPOOL_OBSERVED';
      else if (chain !== null && mempool !== null) outputState = 'UNSPENT_OBSERVED';
    }
    const feeSatoshi = satsFromBTC(-walletTx.fee).toString();
    return { txid: o.bitcoin.txid, vout, confirmations, script: o.order.recipientScript, amountSatoshi: o.order.sats,
      blockhash: decoded.blockhash ?? null, blockHeight: headerAgain?.height ?? null, rawTransaction: walletTx.hex,
      feeSatoshi, paidFeeSatoshi: confirmations > 0 ? feeSatoshi : null,
      feeStatus: confirmations > 0 ? 'CONFIRMED_IN_OBSERVED_CHAIN' : 'UNCONFIRMED_NOT_PAID', outputState,
      observedAt: new Date().toISOString(), observedTip: tipAfter, observationAttempts: attempt,
      recipientWalletControlsOutput: true, deliveryPolicy: 'HISTORICAL_CONFIRMED_OUTPUT_SPENDING_ALLOWED',
      finalitySource: 'Owned Core RPC header confirmations with bounded stable-tip/header recheck; not an atomic snapshot or independent consensus proof' };
  }
  throw new Error('BITCOIN_OBSERVATION_UNSTABLE');
}

export function mergeBitcoinObservation(previous, observation) {
  const lastConfirmed = observation.confirmations > 0
    ? { blockhash: observation.blockhash, confirmations: observation.confirmations, observedAt: observation.observedAt }
    : previous.lastConfirmed ?? (previous.confirmations > 0 ? { blockhash: previous.blockhash, confirmations: previous.confirmations, observedAt: previous.observedAt ?? null } : null);
  const priorBlock = previous.lastConfirmed?.blockhash ?? previous.blockhash;
  return { ...previous, ...observation, lastConfirmed,
    transactionState: observation.confirmations > 0 ? 'CONFIRMED_IN_OBSERVED_CHAIN' : lastConfirmed ? 'REORGED_MEMPOOL' : 'MEMPOOL',
    reorgObserved: previous.reorgObserved === true || (!!priorBlock && priorBlock !== observation.blockhash) };
}

export function markObservation(state, chain, scope, status, observed = false) {
  state.observations ??= {}; state.observations[chain] ??= {};
  const previous = state.observations[chain][scope] ?? { observedAt: null };
  state.observations[chain][scope] = { ...previous, status, checkedAt: new Date().toISOString(), ...(observed ? { observedAt: new Date().toISOString() } : {}) };
}

// Persist authenticated adverse facts before the caller evaluates payment
// eligibility. A rejected claim must not leave an old confirmation/paid fee
// paired with a new successful-observation timestamp.
export async function retainBitcoinObservation(state, read, persist) {
  let observation;
  try { observation = await read(); }
  catch (error) { markObservation(state, 'bitcoin', 'delivery', 'UNAVAILABLE_OR_REJECTED'); throw error; }
  const o = state.operation;
  o.bitcoin = mergeBitcoinObservation(o.bitcoin, observation);
  if (observation.confirmations < (o.order.minimumConfirmations ?? 6) || (o.bitcoin.certifiedBlockhash && o.bitcoin.certifiedBlockhash !== observation.blockhash)) {
    delete o.bitcoin.observedAtEvmTime; delete o.bitcoin.certifiedBlockhash;
    if (state.status === 'BTC_CONFIRMED') state.status = 'BTC_PENDING';
  }
  markObservation(state, 'bitcoin', 'delivery', 'OBSERVED', true);
  await persist();
  return o.bitcoin;
}
