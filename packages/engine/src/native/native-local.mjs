import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createOwnedNativeRuntime, sha, hex, ZERO } from '../chains/shared/native-runtime.mjs';
import { commitment, requireFundedOrder, requireBoundOrder } from './native-authority.mjs';
import { satsFromBTC, observeBitcoinDelivery, retainBitcoinObservation, markObservation } from './native-bitcoin.mjs';
export { satsFromBTC } from './native-bitcoin.mjs';

const stages = { prepare: ['OFF'], lock: ['READY', 'PAID', 'REFUNDED'], send: ['LOCKED'], confirm: ['BTC_PENDING'], settle: ['BTC_CONFIRMED'], expire: ['QUARANTINED', 'LOCKED', 'BTC_PENDING', 'BTC_CONFIRMED'], refund: ['EXPIRED'], reconcile: ['QUARANTINED', 'LOCKED', 'BTC_PENDING', 'BTC_CONFIRMED', 'EXPIRED', 'PAID', 'REFUNDED'] };
export class NativeLocalSession {
  #directory; #runtime; #job; #failure; #closed = false;
  #state = { version: 1, profile: 'EVM_BTC_LOCAL_V1', classification: 'LOCAL_NATIVE_TRANSPARENT_OBSERVER_BASELINE', status: 'OFF', busy: false, progress: 'Entorno local sin iniciar', operation: null, history: [],
    capabilities: { evmBitcoin: 'PREPARED_NOT_RUNNING', solana: 'BLOCKED_RUNTIME_NOT_EXECUTED', tripleAccepted: false, privateSettlement: false, hiddenOwnerAuthorization: false },
    limitations: ['Activos ficticios; nodos locales sin redes públicas.', 'Contrato transparente y observador local de confianza. No demuestra privacidad.', 'Solana no se ejecuta ni se sustituye por una simulación.', 'Recarga del navegador admitida; reanudación tras terminar el servidor no implementada.'] };
  constructor(directory) { this.#directory = directory; }
  snapshot() { return structuredClone({ ...this.#state, allowedActions: this.#closed || this.#state.busy ? [] : Object.keys(stages).filter(a => stages[a].includes(this.#state.status) && (!['expire','refund','reconcile'].includes(a) || (this.#runtime && this.#state.operation))) }); }
  async #persist() {
    const path = join(this.#directory, 'native-public-journal.json');
    await writeFile(path + '.tmp', JSON.stringify(this.#state, null, 2) + '\n'); await rename(path + '.tmp', path);
  }
  submit(action) {
    if (this.#closed) throw new Error('NATIVE_SESSION_CLOSED');
    if (this.#state.busy) throw new Error('NATIVE_ACTION_IN_PROGRESS');
    if (!Object.hasOwn(stages, action) || !this.snapshot().allowedActions.includes(action)) throw new Error('NATIVE_ACTION_NOT_AVAILABLE');
    if (action === 'lock' && this.#state.history.length >= 4) throw new Error('NATIVE_SESSION_LIMIT');
    this.#state.busy = true; this.#failure = undefined; this.#state.lastError = null; this.#state.progress = action;
    this.#job = Promise.resolve().then(async () => {
      await this.#persist(); await this.#run(action); if (action !== 'reconcile') await this.#observe();
    }).catch(async error => {
      this.#failure = error;
      this.#state.lastError = /^[A-Z_]+$/.test(error.message) ? error.message : 'NATIVE_OPERATION_REJECTED';
      this.#state.status = 'QUARANTINED'; this.#state.progress = 'Incidente: no repetir envíos. Revisar las evidencias conservadas.';
    }).finally(async () => { this.#state.busy = false; await this.#persist(); });
    // Retain a handled promise so an interrupted HTTP request cannot cause retry.
    this.#job.catch(() => { this.#state.status = 'QUARANTINED'; this.#state.lastError = 'NATIVE_JOURNAL_FAILED'; });
    return this.snapshot();
  }
  async idle() { if (this.#job) await this.#job; return this.snapshot(); }
  async #trustedRead(terminalAllowed = false) {
    const r = this.#runtime, o = this.#state.operation;
    try {
      assert.equal(await r.evm('eth_chainId'), '0x7a69');
      assert.equal((await r.evm('eth_getBlockByNumber', ['0x0', false])).hash, r.metadata.evmGenesis);
      const observed = { ...await r.reservation(o.reference.id), id: o.reference.id, authority: r.address };
      const gate = (terminalAllowed ? requireBoundOrder : requireFundedOrder)(o.order, o.reference, observed);
      markObservation(this.#state, 'evm', 'authority', 'OBSERVED', true);
      return { observed, gate };
    } catch (error) { markObservation(this.#state, 'evm', 'authority', 'UNAVAILABLE_OR_REJECTED'); throw error; }
  }
  async #bitcoinObservation() {
    const r = this.#runtime, o = this.#state.operation;
    return retainBitcoinObservation(this.#state, () => observeBitcoinDelivery(r, o), () => this.#persist());
  }
  async #refreshBalances(strict = false) {
    const r = this.#runtime, solver = this.#state.operation?.order.solver ?? r.accounts[1];
    const results = await Promise.allSettled([r.balance(r.address), r.balance(solver), r.btc('getbalance', [], 'm9-recipient')]);
    const evmOk = results[0].status === 'fulfilled' && results[1].status === 'fulfilled', btcOk = results[2].status === 'fulfilled';
    markObservation(this.#state, 'evm', 'balances', evmOk ? 'OBSERVED' : 'UNAVAILABLE', evmOk);
    markObservation(this.#state, 'bitcoin', 'balance', btcOk ? 'OBSERVED' : 'UNAVAILABLE', btcOk);
    this.#state.balances = { ...this.#state.balances,
      ...(evmOk ? { escrowWei: results[0].value.toString(), solverWei: results[1].value.toString() } : {}),
      ...(btcOk ? { recipientSatoshi: satsFromBTC(results[2].value).toString() } : {}),
      source: 'Actual owned Anvil / Core RPC', evmStale: !evmOk, bitcoinStale: !btcOk, stale: !evmOk || !btcOk };
    if (strict && results.some(v => v.status === 'rejected')) throw results.find(v => v.status === 'rejected').reason;
    return evmOk && btcOk;
  }
  async #observe() {
    const r = this.#runtime; if (!r) return;
    this.#state.evmTime = await r.time();
    if (this.#state.operation) {
      const o = this.#state.operation; o.reservation = (await this.#trustedRead(true)).observed;
      if (o.bitcoin?.txid) await this.#bitcoinObservation();
      o.terminalDecision = o.reservation.state === 'PAID' || o.reservation.state === 'REFUNDED' ? o.reservation.state : null;
    }
    await this.#refreshBalances(true);
    this.#state.nativeTransactions = structuredClone(r.receipts);
    this.#state.lastClientRefreshAt = new Date().toISOString();
  }
  async #run(action) {
    if (action === 'reconcile') return this.#reconcile();
    if (action === 'prepare') {
      this.#runtime = await createOwnedNativeRuntime(async progress => { this.#state.progress = progress; await this.#persist(); });
      this.#state.runtime = this.#runtime.metadata; this.#state.capabilities.evmBitcoin = 'RUNNING_OWNED_LOCAL_RUNTIMES';
      this.#state.status = 'READY'; this.#state.progress = 'Nodos aislados listos. Puedes bloquear el pago de prueba.'; return;
    }
    const r = this.#runtime;
    if (action === 'lock') {
      delete this.#state.reconciliation;
      if (this.#state.observations?.bitcoin) delete this.#state.observations.bitcoin.delivery;
      if (this.#state.operation) this.#state.history.push(structuredClone(this.#state.operation));
      const recipientAddress = await r.btc('getnewaddress', ['', 'bech32'], 'm9-recipient'), addressInfo = await r.btc('getaddressinfo', [recipientAddress], 'm9-recipient');
      assert.equal(addressInfo.ismine, true); assert.match(addressInfo.scriptPubKey, /^0014[0-9a-f]{40}$/);
      const time = await r.time(), salt = '0x' + randomBytes(32).toString('hex');
      const order = { kind: 'EVM_BTC_LOCAL_V1', profile: 1, owner: r.accounts[0], solver: r.accounts[1], amountWei: '1000000000000000', sats: '100000', scriptHash: '0x' + sha(Buffer.from(addressInfo.scriptPubKey, 'hex')), recipientScript: addressInfo.scriptPubKey, executeBy: time + 600, claimBy: time + 1200, minimumConfirmations: 6, nativeFeeCapSatoshi: '10000', chainId: '31337', evmGenesis: r.metadata.evmGenesis, bitcoinGenesis: r.metadata.bitcoinGenesis, authority: r.address, session: randomBytes(32).toString('hex'), salt };
      const id = await r.call('deriveId(address,bytes32)', [order.owner, salt]);
      const reference = { id, authority: r.address, owner: order.owner, orderHash: commitment(order) };
      this.#state.operation = { order, reference, recipientAddress, bitcoin: null, authorization: null, exposure: 'NONE', solverRewardWei: '0', events: [] };
      await this.#persist();
      await r.send('owner funds exact Bitcoin delivery order', { from: order.owner, to: r.address, value: hex(order.amountWei), data: r.data('reserve(bytes32,bytes32,address,bytes32,uint64,uint64,uint64,uint8)', [salt, reference.orderHash, order.solver, order.scriptHash, order.sats, order.executeBy, order.claimBy, 1]) });
      this.#state.operation.authorization = (await this.#trustedRead()).gate;
      this.#state.status = 'LOCKED'; this.#state.progress = 'Pago retenido por el contrato. Orden exacta autorizada por su propietario local.'; return;
    }
    const o = this.#state.operation;
    if (action === 'send') {
      await this.#trustedRead(); assert.ok(await r.time() < o.order.executeBy, 'Execution window');
      const raw = await r.btc('createrawtransaction', [[], { [o.recipientAddress]: '0.00100000' }, 0, false]);
      const funded = await r.btc('fundrawtransaction', [raw, { fee_rate: 1, lockUnspents: true }], 'm9-solver');
      assert.ok(satsFromBTC(funded.fee) <= BigInt(o.order.nativeFeeCapSatoshi), 'Fee cap before signing');
      const signed = await r.btc('signrawtransactionwithwallet', [funded.hex], 'm9-solver'); assert.equal(signed.complete, true);
      const decoded = await r.btc('decoderawtransaction', [signed.hex]);
      o.bitcoin = { txid: decoded.txid, rawTransaction: signed.hex, transactionState: 'SIGNED', feeSatoshi: satsFromBTC(funded.fee).toString(), paidFeeSatoshi: null, feeStatus: 'NOT_CONFIRMED' };
      // Retain exact signed identity before any broadcast; ambiguous sends freeze.
      o.exposure = 'SIGNED_EXPOSURE_POSSIBLE'; await this.#persist();
      o.bitcoin.transactionState = 'SUBMISSION_UNKNOWN'; await this.#persist();
      assert.equal(await r.btc('sendrawtransaction', [signed.hex]), decoded.txid);
      o.bitcoin = await this.#bitcoinObservation(); assert.ok(BigInt(o.bitcoin.feeSatoshi) <= BigInt(o.order.nativeFeeCapSatoshi));
      o.exposure = 'BROADCAST'; this.#state.status = 'BTC_PENDING'; this.#state.progress = 'Entrega Bitcoin enviada; aún no cumple las confirmaciones.'; return;
    }
    if (action === 'confirm') {
      await this.#trustedRead(); await r.btc('generatetoaddress', [6, r.miningAddress]);
      o.bitcoin = await this.#bitcoinObservation(); assert.ok(o.bitcoin.confirmations >= 6);
      o.bitcoin.observedAtEvmTime = await r.time(); assert.ok(o.bitcoin.observedAtEvmTime <= o.order.executeBy);
      o.bitcoin.certifiedBlockhash = o.bitcoin.blockhash;
      this.#state.status = 'BTC_CONFIRMED'; this.#state.progress = 'Entrega observada con seis bloques locales. Falta decidir el pago EVM.'; return;
    }
    if (action === 'settle') {
      await this.#trustedRead(); const observation = await this.#bitcoinObservation(); assert.ok(observation.confirmations >= 6);
      assert.equal(observation.blockhash, o.bitcoin.certifiedBlockhash, 'DELIVERY_CERTIFICATION_BLOCK_CHANGED');
      assert.ok(BigInt(observation.feeSatoshi) <= BigInt(o.order.nativeFeeCapSatoshi));
      assert.ok(await r.time() < o.order.claimBy);
      const before = await r.balance(o.order.solver);
      await r.send('observer admits exact native Bitcoin output and pays solver', { from: r.accounts[2], to: r.address, data: r.data('claim(bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)', [o.reference.id, '0x' + observation.txid, observation.vout, o.order.scriptHash, o.order.sats, observation.confirmations, o.bitcoin.observedAtEvmTime]) });
      const reward = (await r.balance(o.order.solver)) - before; assert.equal(reward.toString(), o.order.amountWei);
      o.solverRewardWei = reward.toString(); this.#state.status = 'PAID'; this.#state.progress = 'Contrato pagado. La entrega Bitcoin permanece válida aunque el destinatario la gaste.'; return;
    }
    if (action === 'expire') {
      await this.#trustedRead(); await r.evm('evm_setNextBlockTimestamp', [o.order.claimBy + 1]); await r.evm('evm_mine');
      this.#state.status = 'EXPIRED'; this.#state.progress = 'Se avanzó el reloj del EVM local. El contrato ya permite solicitar devolución.'; return;
    }
    if (action === 'refund') {
      await this.#trustedRead();
      const before = await r.balance(o.order.owner), solverBefore = await r.balance(o.order.solver);
      const receipt = await r.send('owner recovers expired EVM reservation', { from: o.order.owner, to: r.address, data: r.data('refund(bytes32)', [o.reference.id]) });
      const gas = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
      assert.equal((await r.balance(o.order.owner)) - before + gas, BigInt(o.order.amountWei));
      assert.equal(await r.balance(o.order.solver), solverBefore);
      o.ownerRefundWei = o.order.amountWei; this.#state.status = 'REFUNDED';
      this.#state.progress = 'EVM devuelto por el contrato. El estado y la exposición Bitcoin se muestran por separado.'; return;
    }
    throw new Error('NATIVE_ACTION_NOT_AVAILABLE');
  }
  async #reconcile() {
    const r = this.#runtime, o = this.#state.operation;
    if (!r || !o) throw new Error('NO_NATIVE_OPERATION_TO_RECONCILE');
    if (o.bitcoin) markObservation(this.#state, 'bitcoin', 'delivery', 'NOT_RECHECKED');
    const { observed, gate } = await this.#trustedRead(true);
    const now = await r.time(); o.reservation = observed; o.authorization = gate;
    this.#state.evmTime = now; this.#state.nativeTransactions = structuredClone(r.receipts);
    o.terminalDecision = ['PAID', 'REFUNDED'].includes(observed.state) ? observed.state : null;
    // Authority state is sufficient for its final economic decision. Failure of
    // the other chain must not hide a paid/refunded result or block expiry refund.
    if (o.terminalDecision) {
      o.solverRewardWei = observed.state === 'PAID' ? observed.amountWei : '0';
      if (observed.state === 'REFUNDED') o.ownerRefundWei = observed.amountWei;
      this.#state.status = observed.state;
      this.#state.progress = observed.state === 'PAID' ? 'Pago confirmado por el contrato, reconciliado sin reenviar.' : 'Devolución confirmada por el contrato, reconciliada sin reenviar.';
    } else if (now >= o.order.claimBy) {
      this.#state.status = 'EXPIRED'; this.#state.progress = 'Reserva abierta y vencida: el contrato permite devolver EVM.';
    } else if (o.bitcoin?.txid) {
      const observation = await this.#bitcoinObservation(); o.bitcoin = { ...o.bitcoin, ...observation }; o.exposure = 'BROADCAST';
      if (observation.confirmations >= 6) {
        if (o.bitcoin.observedAtEvmTime === undefined || o.bitcoin.certifiedBlockhash !== observation.blockhash) {
          // A lost observation cannot manufacture an earlier certified time.
          assert.ok(now <= o.order.executeBy, 'OBSERVATION_WINDOW_PASSED'); o.bitcoin.observedAtEvmTime = now; o.bitcoin.certifiedBlockhash = observation.blockhash;
        }
        this.#state.status = 'BTC_CONFIRMED';
      } else {
        delete o.bitcoin.observedAtEvmTime; delete o.bitcoin.certifiedBlockhash; this.#state.status = 'BTC_PENDING';
      }
      this.#state.progress = 'Entrega existente reconciliada; no se ha reenviado Bitcoin.';
    } else {
      assert.equal(o.exposure, 'NONE', 'AMBIGUOUS_NATIVE_EXPOSURE');
      this.#state.status = 'LOCKED'; this.#state.progress = 'Reserva financiada reconciliada; aún no hay identidad de entrega firmada.';
    }
    const auxiliaryBalancesAvailable = await this.#refreshBalances();
    this.#state.lastClientRefreshAt = new Date().toISOString();
    this.#state.reconciliation = { readOnly: true, authorityState: observed.state, auxiliaryBalancesAvailable, serverRestartSupported: false };
  }
  // Test/review access to actual owned authority, never exposed as HTTP RPC.
  get ownedRuntimeForReview() { return this.#runtime; }
  get failureForReview() { return this.#failure; }
  async close() {
    if (this.#closed) return; this.#closed = true;
    if (this.#job) await this.#job.catch(() => {});
    if (this.#runtime) { await this.#runtime.close(); this.#state.runtimeStopped = true; this.#state.capabilities.evmBitcoin = 'STOPPED'; await this.#persist(); }
  }
}
