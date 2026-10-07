import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createOwnedNativeRuntime, deployOwnedTripleAuthority, sha, hex } from './chains/native-runtime.mjs';
import { createOwnedSolanaRuntime } from './chains/solana-runtime.mjs';
import { commitment } from './native-authority.mjs';
import { satsFromBTC, observeBitcoinDelivery, retainBitcoinObservation, markObservation } from './native-bitcoin.mjs';
import { sleep } from './chains/runtime-harness.mjs';

const stages = { prepare: ['OFF'], lock: ['READY', 'PAID', 'REFUNDED'], solana: ['LOCKED'], certify: ['SOL_OBSERVED'], bitcoin: ['SOL_CONFIRMED'], confirm: ['BTC_PENDING'], settle: ['BTC_CONFIRMED'], expire: ['QUARANTINED', 'LOCKED', 'SOL_OBSERVED', 'SOL_CONFIRMED', 'BTC_PENDING', 'BTC_CONFIRMED'], refund: ['EXPIRED'], reconcile: ['QUARANTINED', 'LOCKED', 'SOL_OBSERVED', 'SOL_CONFIRMED', 'BTC_PENDING', 'BTC_CONFIRMED', 'EXPIRED', 'PAID', 'REFUNDED'] };
export const toBTC = sats => { const n = BigInt(sats); assert.ok(n >= 0n); return `${n / 100000000n}.${(n % 100000000n).toString().padStart(8, '0')}`; };
const SOLANA_CERTIFIED_FIELDS = ['signature','slot','blockhash','lamports','solverHex','recipientHex','instructionIndex'];
export async function retainSolanaObservation(state, read, persist) {
  let fact;
  try { fact = await read(); }
  catch (error) { markObservation(state, 'solana', 'delivery', 'UNAVAILABLE_OR_REJECTED'); await persist(); throw error; }
  const o = state.operation, certified = o.solana.certifiedObservation;
  o.solana = { ...o.solana, ...fact };
  const sameCertification = !certified || SOLANA_CERTIFIED_FIELDS.every(k => certified[k] === fact[k]);
  o.solana.certificationCurrent = sameCertification;
  if (!sameCertification) { o.solana.certificationChangedObserved = true; state.status = 'QUARANTINED'; }
  markObservation(state, 'solana', 'delivery', 'OBSERVED', true); await persist();
  assert.ok(sameCertification, 'SOLANA_CERTIFICATION_CHANGED'); return o.solana;
}
export class NativeTripleSession {
  #directory; #runtime; #job; #failure; #closed = false;
  #state = { version: 1, profile: 'EVM_SOL_BTC_LOCAL_V1', classification: 'LOCAL_NATIVE_TRANSPARENT_TRUSTED_OBSERVER_TRIPLE', status: 'OFF', busy: false, progress: 'Tres cadenas locales sin iniciar', operation: null, history: [], capabilities: { nativeTriple: 'PREPARED_NOT_RUNNING', privateSettlement: false, fullAcceptance: false }, limitations: ['Activos ficticios y nodos aislados; ninguna red pública.', 'Autoridad transparente y observador local de confianza; sin prueba global ZK ni grafo privado.', 'No revierte SOL ni Bitcoin; la devolución puede dejar al solver sin cobro.', 'Sin reanudación tras cerrar el servidor.'] };
  constructor(directory) { this.#directory = directory; }
  snapshot() { return structuredClone({ ...this.#state, allowedActions: this.#closed || this.#state.busy ? [] : Object.keys(stages).filter(a => stages[a].includes(this.#state.status) && (!['expire','refund','reconcile'].includes(a) || (this.#runtime && this.#state.operation))) }); }
  async #persist() { const path = join(this.#directory, 'triple-public-journal.json'); await writeFile(path + '.tmp', JSON.stringify(this.#state, null, 2) + '\n'); await rename(path + '.tmp', path); }
  submit(action) {
    if (this.#closed) throw new Error('TRIPLE_SESSION_CLOSED');
    if (this.#state.busy) throw new Error('TRIPLE_ACTION_IN_PROGRESS');
    if (!Object.hasOwn(stages, action) || !this.snapshot().allowedActions.includes(action)) throw new Error('TRIPLE_ACTION_NOT_AVAILABLE');
    if (action === 'lock' && this.#state.history.length >= 4) throw new Error('TRIPLE_SESSION_LIMIT');
    this.#state.busy = true; this.#failure = undefined; this.#state.lastError = null; this.#state.progress = action;
    this.#job = Promise.resolve().then(async () => { await this.#persist(); await this.#run(action); if (action !== 'reconcile') await this.#observe(); }).catch(async error => {
      this.#failure = error;
      this.#state.lastError = /^[A-Z_]+$/.test(error.message) ? error.message : 'TRIPLE_OPERATION_REJECTED';
      this.#state.status = 'QUARANTINED'; this.#state.progress = 'Incidente: consulta las transacciones ya firmadas antes de continuar.';
    }).finally(async () => { this.#state.busy = false; await this.#persist(); });
    this.#job.catch(() => { this.#state.status = 'QUARANTINED'; this.#state.lastError = 'TRIPLE_JOURNAL_FAILED'; });
    return this.snapshot();
  }
  async idle() { if (this.#job) await this.#job; return this.snapshot(); }
  async #trustedRead(terminal = false) {
    const r = this.#runtime, o = this.#state.operation;
    try {
      assert.equal(await r.evm('eth_chainId'), '0x7a69'); assert.equal((await r.evm('eth_getBlockByNumber', ['0x0', false])).hash, r.metadata.evmGenesis);
      const observed = await r.reservation(o.reference.id);
      assert.equal(observed.orderHash, o.reference.orderHash, 'TRIPLE_FROZEN_HASH'); assert.equal(commitment(o.order), observed.orderHash, 'TRIPLE_ORDER_REPLACEMENT');
      assert.ok((terminal ? ['OPEN','PAID','REFUNDED'] : ['OPEN']).includes(observed.state), 'TRIPLE_AUTHORITY_STATE');
      for (const key of ['owner','solver','amountWei','scriptHash','executeBy','claimBy','solanaSender','solanaRecipient','lamports','numerator','denominator','minimumConfirmations']) assert.equal(observed[key], o.order[key], 'TRIPLE_BOUND_' + key);
      o.reservation = observed; markObservation(this.#state, 'evm', 'authority', 'OBSERVED', true); return observed;
    } catch (e) { markObservation(this.#state, 'evm', 'authority', 'UNAVAILABLE_OR_REJECTED'); throw e; }
  }
  async #solanaObservation() {
    const o = this.#state.operation;
    return retainSolanaObservation(this.#state, () => this.#runtime.solana.observe(o.solana.signature, { expectedLamports: o.order.lamports }), () => this.#persist());
  }
  async #bitcoinObservation() { return retainBitcoinObservation(this.#state, () => observeBitcoinDelivery(this.#runtime, this.#state.operation), () => this.#persist()); }
  async #balances() {
    const r = this.#runtime;
    const values = await Promise.allSettled([r.balance(r.address), r.balance(r.accounts[1]), r.btc('getbalance', [], 'm9-recipient'), r.solana.balance()]);
    const old = this.#state.balances ?? {};
    const evmFresh = values[0].status === 'fulfilled' && values[1].status === 'fulfilled', bitcoinFresh = values[2].status === 'fulfilled', solanaFresh = values[3].status === 'fulfilled';
    markObservation(this.#state, 'evm', 'balances', evmFresh ? 'OBSERVED' : 'UNAVAILABLE', evmFresh);
    markObservation(this.#state, 'bitcoin', 'balance', bitcoinFresh ? 'OBSERVED' : 'UNAVAILABLE', bitcoinFresh);
    markObservation(this.#state, 'solana', 'balance', solanaFresh ? 'OBSERVED' : 'UNAVAILABLE', solanaFresh);
    this.#state.balances = { ...old, source: 'Actual owned Anvil / Agave / Core RPC', escrowWei: values[0].status === 'fulfilled' ? values[0].value.toString() : old.escrowWei, solverWei: values[1].status === 'fulfilled' ? values[1].value.toString() : old.solverWei, recipientSatoshi: values[2].status === 'fulfilled' ? satsFromBTC(values[2].value).toString() : old.recipientSatoshi, recipientLamports: values[3].status === 'fulfilled' ? values[3].value.toString() : old.recipientLamports, evmStale: !evmFresh, bitcoinStale: !bitcoinFresh, solanaStale: !solanaFresh, stale: !evmFresh || !bitcoinFresh || !solanaFresh };
  }
  async #observe() {
    const r = this.#runtime; if (!r) return;
    this.#state.evmTime = await r.time(); const o = this.#state.operation;
    if (o) { const a = await this.#trustedRead(true); o.terminalDecision = ['PAID','REFUNDED'].includes(a.state) ? a.state : null; }
    await this.#balances(); this.#state.nativeTransactions = structuredClone(r.receipts); this.#state.lastClientRefreshAt = new Date().toISOString();
  }
  async #run(action) {
    if (action === 'reconcile') return this.#reconcile();
    if (action === 'prepare') {
      const progress = async value => { this.#state.progress = value; await this.#persist(); };
      const base = await createOwnedNativeRuntime(progress); let solana;
      try {
        solana = await createOwnedSolanaRuntime(progress);
        const authority = await deployOwnedTripleAuthority(base, [base.accounts[2], base.metadata.evmGenesis, solana.metadata.genesisHex, '0x' + base.metadata.bitcoinGenesis]);
        const r = { ...base, ...authority, solana, metadata: { ...base.metadata, tripleContract: authority.address, tripleSourceSHA256: authority.sourceSHA256, solana: solana.metadata }, close: async () => { const outcomes = await Promise.allSettled([base.close(), solana.close()]); for (const x of outcomes) if (x.status === 'rejected') throw x.reason; } };
        r.reservation = async id => { const reservation = decodeReservation(await r.call('reservations(bytes32)', [id])); const sol = words(await r.call('solanaResults(bytes32)', [id])); return { ...reservation, solanaEffect: '0x' + sol[0], solanaParent: '0x' + sol[1], sats: BigInt('0x' + sol[6]).toString(), solanaCertifiedAt: Number(BigInt('0x' + sol[8])) }; };
        this.#runtime = r;
      } catch (e) { await Promise.allSettled([base.close(), solana?.close()]); throw e; }
      this.#state.runtime = this.#runtime.metadata; this.#state.capabilities.nativeTriple = 'RUNNING_OWNED_LOCAL_RUNTIMES'; this.#state.status = 'READY'; this.#state.progress = 'EVM, Solana y Bitcoin listos con cuentas nuevas de prueba.'; return;
    }
    const r = this.#runtime;
    if (action === 'lock') {
      if (this.#state.operation) this.#state.history.push({ ...structuredClone(this.#state.operation), archivedAt: new Date().toISOString(), observationSnapshot: structuredClone(this.#state.observations ?? {}), balanceSnapshot: structuredClone(this.#state.balances ?? {}) });
      delete this.#state.reconciliation; this.#state.observations = {};
      const recipientAddress = await r.btc('getnewaddress', ['', 'bech32'], 'm9-recipient'), info = await r.btc('getaddressinfo', [recipientAddress], 'm9-recipient');
      assert.equal(info.ismine, true); assert.match(info.scriptPubKey, /^0014[0-9a-f]{40}$/);
      const time = await r.time(), salt = '0x' + randomBytes(32).toString('hex');
      const order = { kind: 'EVM_SOL_BTC_LOCAL_V1', owner: r.accounts[0], solver: r.accounts[1], amountWei: '1000000000000000', solanaSender: r.solana.metadata.solverHex, solanaRecipient: r.solana.metadata.recipientHex, lamports: '3000000', sats: '100000', numerator: '1', denominator: '30', scriptHash: '0x' + sha(Buffer.from(info.scriptPubKey, 'hex')), recipientScript: info.scriptPubKey, executeBy: time + 600, claimBy: time + 1200, minimumConfirmations: 6, nativeFeeCapSatoshi: '10000', chainId: '31337', evmGenesis: r.metadata.evmGenesis, solanaGenesis: r.solana.genesis, bitcoinGenesis: r.metadata.bitcoinGenesis, authority: r.address, session: randomBytes(32).toString('hex'), salt };
      const id = await r.call('deriveId(address,bytes32)', [order.owner, salt]); const reference = { id, authority: r.address, orderHash: commitment(order) };
      this.#state.operation = { order, reference, recipientAddress, solana: null, bitcoin: null, exposure: 'NONE', solverRewardWei: '0', events: [] }; await this.#persist();
      await r.send('owner funds exact dependent Solana and Bitcoin order', { from: order.owner, to: r.address, value: hex(order.amountWei), data: r.data(RESERVE, [salt, reference.orderHash, order.solver, order.solanaSender, order.solanaRecipient, order.lamports, order.scriptHash, order.numerator, order.denominator, order.minimumConfirmations, order.executeBy, order.claimBy]) });
      await this.#trustedRead(); this.#state.status = 'LOCKED'; this.#state.progress = 'EVM retenido. El contrato fija la entrega SOL y la regla del importe BTC.'; return;
    }
    const o = this.#state.operation;
    // An authority/balance refresh must not imply a new delivery observation.
    if (o.solana) markObservation(this.#state, 'solana', 'delivery', 'NOT_RECHECKED');
    if (o.bitcoin) markObservation(this.#state, 'bitcoin', 'delivery', 'NOT_RECHECKED');
    if (action === 'solana') {
      await this.#trustedRead(); assert.ok(await r.time() < o.order.executeBy, 'TRIPLE_EXECUTION_EXPIRED');
      let record;
      try { record = await r.solana.transfer(o.order.lamports, { onSigned: async signed => { o.solana = signed; o.exposure = 'SOLANA_SIGNED_EXPOSURE_POSSIBLE'; await this.#persist(); } }); }
      catch (e) { if (e.transfer) { o.solana = { ...o.solana, ...e.transfer }; o.exposure = 'SOLANA_BROADCAST_UNKNOWN'; await this.#persist(); } throw e; }
      o.solana = { ...o.solana, ...record }; await this.#persist();
      const fact = await this.#solanaObservation();
      assert.ok(fact.finalized, 'SOLANA_FINALITY_TIMEOUT'); await this.#certifySolana(); this.#state.status = 'SOL_CONFIRMED'; this.#state.progress = 'Entrega SOL real finalizada y vinculada al contrato. BTC se calculará de su resultado observado.'; return;
    }
    if (action === 'certify') { await this.#trustedRead(); await this.#solanaObservation(); await this.#certifySolana(); this.#state.status = 'SOL_CONFIRMED'; this.#state.progress = 'Entrega SOL existente certificada sin volver a enviarla.'; return; }
    if (action === 'bitcoin') {
      const observed = await this.#trustedRead(); const sol = await this.#solanaObservation();
      assert.ok(await r.time() < o.order.executeBy, 'TRIPLE_EXECUTION_EXPIRED');
      assert.equal(observed.solanaParent, o.solana.parentDigest, 'TRIPLE_PARENT_REPLACEMENT');
      const sats = BigInt(sol.lamports) * BigInt(o.order.numerator) / BigInt(o.order.denominator); assert.equal(sats.toString(), observed.sats, 'TRIPLE_COMPUTED_AMOUNT');
      assert.equal(sats.toString(), o.order.sats, 'TRIPLE_EXPECTED_COMPUTED_AMOUNT');
      const raw = await r.btc('createrawtransaction', [[], { [o.recipientAddress]: toBTC(sats) }, 0, false]);
      const funded = await r.btc('fundrawtransaction', [raw, { fee_rate: 1, lockUnspents: true }], 'm9-solver'); assert.ok(satsFromBTC(funded.fee) <= BigInt(o.order.nativeFeeCapSatoshi));
      const signed = await r.btc('signrawtransactionwithwallet', [funded.hex], 'm9-solver'); assert.equal(signed.complete, true); const decoded = await r.btc('decoderawtransaction', [signed.hex]);
      o.bitcoin = { txid: decoded.txid, rawTransaction: signed.hex, transactionState: 'SIGNED', feeSatoshi: satsFromBTC(funded.fee).toString(), paidFeeSatoshi: null, feeStatus: 'NOT_CONFIRMED', requiredSolanaParent: observed.solanaParent };
      o.exposure = 'BITCOIN_SIGNED_EXPOSURE_POSSIBLE'; await this.#persist(); o.bitcoin.transactionState = 'SUBMISSION_UNKNOWN'; await this.#persist();
      assert.equal(await r.btc('sendrawtransaction', [signed.hex]), decoded.txid); await this.#bitcoinObservation(); this.#state.status = 'BTC_PENDING'; this.#state.progress = 'BTC calculado del resultado SOL y enviado; todavía no cumple seis confirmaciones.'; return;
    }
    if (action === 'confirm') {
      await this.#trustedRead(); await r.btc('generatetoaddress', [6, r.miningAddress]); const fact = await this.#bitcoinObservation(); assert.ok(fact.confirmations >= 6);
      o.bitcoin.observedAtEvmTime = await r.time(); assert.ok(o.bitcoin.observedAtEvmTime <= o.order.executeBy); o.bitcoin.certifiedBlockhash = fact.blockhash;
      this.#state.status = 'BTC_CONFIRMED'; this.#state.progress = 'BTC confirmado en seis bloques locales. Falta el pago EVM único.'; return;
    }
    if (action === 'settle') {
      await this.#trustedRead(); await this.#solanaObservation(); const fact = await this.#bitcoinObservation(); assert.ok(fact.confirmations >= 6); assert.equal(fact.blockhash, o.bitcoin.certifiedBlockhash, 'DELIVERY_CERTIFICATION_BLOCK_CHANGED');
      assert.ok(BigInt(fact.feeSatoshi) <= BigInt(o.order.nativeFeeCapSatoshi)); const before = await r.balance(o.order.solver);
      await r.send('observer pays only the exact dependent native Solana and Bitcoin result', { from: r.accounts[2], to: r.address, data: r.data(CLAIM, [o.reference.id, o.solana.parentDigest, '0x' + fact.txid, fact.vout, o.order.scriptHash, o.order.sats, fact.confirmations, o.bitcoin.observedAtEvmTime]) });
      assert.equal((await r.balance(o.order.solver)) - before, BigInt(o.order.amountWei)); o.solverRewardWei = o.order.amountWei; this.#state.status = 'PAID'; this.#state.progress = 'Contrato EVM pagado una vez tras comprobar las dos entregas nativas dependientes.'; return;
    }
    if (action === 'expire') { await this.#trustedRead(); await r.evm('evm_setNextBlockTimestamp', [o.order.claimBy + 1]); await r.evm('evm_mine'); this.#state.status = 'EXPIRED'; this.#state.progress = 'Plazo vencido en EVM local; los efectos SOL/BTC ya enviados no se revierten.'; return; }
    if (action === 'refund') {
      await this.#trustedRead(); const before = await r.balance(o.order.owner), solverBefore = await r.balance(o.order.solver);
      const receipt = await r.send('owner recovers expired triple reservation', { from: o.order.owner, to: r.address, data: r.data('refund(bytes32)', [o.reference.id]) });
      assert.equal((await r.balance(o.order.owner)) - before + BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice), BigInt(o.order.amountWei)); assert.equal(await r.balance(o.order.solver), solverBefore);
      o.ownerRefundWei = o.order.amountWei; this.#state.status = 'REFUNDED'; this.#state.progress = 'EVM recuperado. SOL y BTC entregados permanecen; el solver puede quedar sin cobro.'; return;
    }
    throw new Error('TRIPLE_ACTION_NOT_AVAILABLE');
  }
  async #certifySolana() {
    const r = this.#runtime, o = this.#state.operation, fact = o.solana;
    fact.observedAtEvmTime = await r.time(); const sig = fact.signatureHex.replace(/^0x/, '');
    await r.send('observer binds finalized native Solana predecessor', { from: r.accounts[2], to: r.address, data: r.data(CERTIFY, [o.reference.id, '0x' + sig.slice(0,64), '0x' + sig.slice(64), 0, fact.slot, 1, 1, o.order.solanaSender, o.order.solanaRecipient, fact.lamports, fact.observedAtEvmTime]) });
    const observed = await this.#trustedRead(); fact.parentDigest = observed.solanaParent; fact.certifiedObservation = Object.fromEntries(SOLANA_CERTIFIED_FIELDS.map(k => [k, fact[k]])); fact.certificationCurrent = true; o.exposure = 'SOLANA_FINALIZED'; await this.#persist();
  }
  async #reconcile() {
    const r = this.#runtime, o = this.#state.operation; if (!r || !o) throw new Error('NO_TRIPLE_OPERATION_TO_RECONCILE');
    if (o.solana) markObservation(this.#state, 'solana', 'delivery', 'NOT_RECHECKED'); if (o.bitcoin) markObservation(this.#state, 'bitcoin', 'delivery', 'NOT_RECHECKED');
    const a = await this.#trustedRead(true), now = await r.time();
    o.terminalDecision = ['PAID','REFUNDED'].includes(a.state) ? a.state : null;
    if (o.terminalDecision) { this.#state.status = a.state; o.solverRewardWei = a.state === 'PAID' ? o.order.amountWei : '0'; if (a.state === 'REFUNDED') o.ownerRefundWei = o.order.amountWei; }
    else if (now >= o.order.claimBy) this.#state.status = 'EXPIRED';
    else if (o.bitcoin?.txid) {
      const fact = await this.#bitcoinObservation();
      if (fact.confirmations >= 6) { if (!o.bitcoin.observedAtEvmTime || o.bitcoin.certifiedBlockhash !== fact.blockhash) { assert.ok(now <= o.order.executeBy, 'OBSERVATION_WINDOW_PASSED'); o.bitcoin.observedAtEvmTime = now; o.bitcoin.certifiedBlockhash = fact.blockhash; } this.#state.status = 'BTC_CONFIRMED'; }
      else this.#state.status = 'BTC_PENDING';
    } else if (o.solana?.signature) {
      await this.#solanaObservation();
      // Reconciliation only reads; an existing uncertified delivery can be
      // certified by a separate explicit action without another native send.
      if (a.solanaParent === '0x' + '00'.repeat(32)) this.#state.status = 'SOL_OBSERVED';
      else {
        // Recover only the exact on-chain predecessor slot/amount/signature.
        const raw = words(await r.call('solanaResults(bytes32)', [o.reference.id]));
        assert.equal('0x' + raw[2] + raw[3], o.solana.signatureHex, 'SOLANA_CERTIFIED_SIGNATURE_CHANGED');
        assert.equal(Number(BigInt('0x' + raw[4])), o.solana.slot, 'SOLANA_CERTIFIED_SLOT_CHANGED');
        assert.equal(BigInt('0x' + raw[5]).toString(), o.solana.lamports, 'SOLANA_CERTIFIED_AMOUNT_CHANGED');
        o.solana.parentDigest = a.solanaParent;
        o.solana.certifiedObservation ??= Object.fromEntries(SOLANA_CERTIFIED_FIELDS.map(k => [k, o.solana[k]]));
        this.#state.status = 'SOL_CONFIRMED';
      }
    } else { assert.equal(o.exposure, 'NONE'); this.#state.status = 'LOCKED'; }
    await this.#balances(); this.#state.nativeTransactions = structuredClone(r.receipts); this.#state.evmTime = now; this.#state.lastClientRefreshAt = new Date().toISOString();
    this.#state.reconciliation = { readOnly: true, serverRestartSupported: false, authorityState: a.state }; this.#state.progress = 'Estado existente consultado sin firmar ni reenviar entregas.';
  }
  get ownedRuntimeForReview() { return this.#runtime; }
  get failureForReview() { return this.#failure; }
  async close() { if (this.#closed) return; this.#closed = true; if (this.#job) await this.#job.catch(() => {}); if (this.#runtime) { await this.#runtime.close(); this.#state.runtimeStopped = true; this.#state.capabilities.nativeTriple = 'STOPPED'; await this.#persist(); } }
}
// Final ABI is kept beside its decoder and checked by the native integration.
export const RESERVE = 'reserve(bytes32,bytes32,address,bytes32,bytes32,uint64,bytes32,uint64,uint64,uint32,uint64,uint64)';
export const CERTIFY = 'certifySolana(bytes32,bytes32,bytes32,uint32,uint64,bool,bool,bytes32,bytes32,uint64,uint64)';
export const CLAIM = 'claimBitcoin(bytes32,bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)';
const words = raw => { assert.match(raw, /^0x(?:[0-9a-f]{64})+$/); return raw.slice(2).match(/.{64}/g); };
export function decodeReservation(raw) {
  const w = words(raw); assert.equal(w.length, 15);
  const n = i => BigInt('0x' + w[i]);
  return { owner: '0x' + w[0].slice(-40), solver: '0x' + w[1].slice(-40), amountWei: n(2).toString(), orderHash: '0x' + w[3], solanaSender: '0x' + w[4], solanaRecipient: '0x' + w[5], lamports: n(6).toString(), scriptHash: '0x' + w[7], numerator: n(8).toString(), denominator: n(9).toString(), minimumConfirmations: Number(n(10)), executeBy: Number(n(11)), claimBy: Number(n(12)), openedAt: Number(n(13)), state: ['ABSENT','OPEN','PAID','REFUNDED'][Number(n(14))] };
}
