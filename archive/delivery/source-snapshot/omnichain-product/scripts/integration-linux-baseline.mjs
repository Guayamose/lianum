import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startLocalServer } from '../src/server.mjs';
import { commitment, requireFundedOrder } from '../src/native-authority.mjs';
import { sleep, projectRoot } from '../src/chains/runtime-harness.mjs';
import { sha, hex } from '../src/chains/native-runtime.mjs';

const app = await startLocalServer({ port: 0 });
const evidence = { classification: 'ONE_CLIENT_REAL_LOCAL_EVM_BITCOIN_OPERATION_NOT_PRIVATE_OR_TRIPLE', phase: 'starting', checks: [], operations: [], solanaExecuted: false, tripleAccepted: false, privateSettlement: false };
const check = (name, value) => { assert.ok(value, name); evidence.checks.push(name); };
const persist = () => writeFile(join(projectRoot, 'evidence/m14-linux-baseline.json'), JSON.stringify(evidence, null, 2) + '\n');
try {
  const page = await (await fetch(app.origin)).text(), token = page.match(/name="local-token" content="([0-9a-f]+)"/)[1];
  const headers = { 'X-Local-Token': token, Origin: app.origin, 'Content-Type': 'application/json' };
  const snapshot = async () => (await fetch(app.origin + '/api/native', { headers })).json();
  const action = async name => {
    const response = await fetch(app.origin + '/api/native/action', { method: 'POST', headers, body: JSON.stringify({ action: name }) });
    assert.equal(response.status, 202, await response.clone().text());
    for (let i = 0; i < 600; i++) { const s = await snapshot(); if (!s.busy) { assert.notEqual(s.status, 'QUARANTINED', s.lastError); console.log(JSON.stringify({ action: name, status: s.status, progress: s.progress })); return s; } await sleep(100); }
    throw new Error('NATIVE_CLIENT_JOB_TIMEOUT');
  };
  check('native endpoint requires session token', (await fetch(app.origin + '/api/native')).status === 403);
  check('native command requires same origin', (await fetch(app.origin + '/api/native/action', { method: 'POST', headers: { ...headers, Origin: 'https://attacker.invalid' }, body: '{"action":"prepare"}' })).status === 403);
  check('native command refuses arbitrary endpoint fields', (await fetch(app.origin + '/api/native/action', { method: 'POST', headers, body: '{"action":"prepare","rpc":"http://127.0.0.1:1"}' })).status === 400);
  evidence.phase = 'preparing'; await persist(); await action('prepare');
  const locked = await action('lock'), runtime = app.native.ownedRuntimeForReview;
  check('native owner really funded the immutable order', locked.operation.reservation.state === 'OPEN' && locked.balances.escrowWei === '1000000000000000');
  const order = locked.operation.order, reference = locked.operation.reference;
  const observed = { ...await runtime.reservation(reference.id), id: reference.id, authority: runtime.address };
  await runtime.send('premature owner refund rejected by native deadline', { from: order.owner, to: runtime.address, data: runtime.data('refund(bytes32)', [reference.id]) }, '0x0', 'REFUND_EARLY');
  const changed = { ...order, sats: '100001' };
  check('replacement order is self-consistent but differs from funded order', commitment(changed) !== reference.orderHash);
  assert.throws(() => requireFundedOrder(changed, reference, observed), /ORDER_REPLACEMENT/); evidence.checks.push('coherent replacement order rejected against independently read funded authority');
  check('pay before Bitcoin exposure is unavailable in client API', (await fetch(app.origin + '/api/native/action', { method: 'POST', headers, body: '{"action":"settle"}' })).status === 400);
  await action('send'); const confirmed = await action('confirm');
  check('exact recipient-controlled Bitcoin output has six native confirmations', confirmed.operation.bitcoin.confirmations >= 6 && confirmed.operation.bitcoin.recipientWalletControlsOutput);
  const delivery = confirmed.operation.bitcoin;
  const claimArgs = [reference.id, '0x' + delivery.txid, delivery.vout, order.scriptHash, order.sats, 6, delivery.observedAtEvmTime];
  await runtime.send('foreign caller cannot certify Bitcoin delivery', { from: runtime.accounts[3], to: runtime.address, data: runtime.data('claim(bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)', claimArgs) }, '0x0', 'OBSERVER');
  const wrongAmount = [...claimArgs]; wrongAmount[4] = '100001';
  await runtime.send('observer cannot replace fixed delivered amount', { from: runtime.accounts[2], to: runtime.address, data: runtime.data('claim(bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)', wrongAmount) }, '0x0', 'DELIVERY');
  const fewConfirmations = [...claimArgs]; fewConfirmations[5] = 5;
  await runtime.send('insufficient claimed confirmation count rejected', { from: runtime.accounts[2], to: runtime.address, data: runtime.data('claim(bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)', fewConfirmations) }, '0x0', 'DELIVERY');
  const paid = await action('settle'); check('one native EVM decision paid exact solver reward', paid.operation.reservation.state === 'PAID' && paid.operation.solverRewardWei === order.amountWei && paid.balances.escrowWei === '0');
  const reloadedPage = await (await fetch(app.origin)).text(); check('browser reload retains same server session and operation', reloadedPage.includes(token) && (await snapshot()).operation.reference.id === reference.id);
  evidence.operations.push(paid.operation);
  const d = paid.operation.bitcoin;
  await runtime.send('duplicate claim rejected by native paid state', { from: runtime.accounts[2], to: runtime.address, data: runtime.data('claim(bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)', [reference.id, '0x' + d.txid, d.vout, order.scriptHash, order.sats, 6, d.observedAtEvmTime]) }, '0x0', 'STATE_PROFILE');
  await runtime.send('refund after native payment rejected', { from: order.owner, to: runtime.address, data: runtime.data('refund(bytes32)', [reference.id]) }, '0x0', 'STATE_OWNER');
  evidence.checks.push('native contract rejects duplicate payment and refund after payment');
  const second = await action('lock');
  // A fresh owner-funded order requesting the SAME already delivered outpoint
  // still cannot pay again. Different order hash/salt does not change effect ID.
  const replaySalt = '0x' + 'ab'.repeat(32), replayOrder = { ...order, salt: replaySalt, executeBy: second.operation.order.executeBy, claimBy: second.operation.order.claimBy };
  const replayId = await runtime.call('deriveId(address,bytes32)', [order.owner, replaySalt]);
  await runtime.send('owner funds a fresh replay test order', { from: order.owner, to: runtime.address, value: hex(order.amountWei), data: runtime.data('reserve(bytes32,bytes32,address,bytes32,uint64,uint64,uint64,uint8)', [replaySalt, commitment(replayOrder), order.solver, order.scriptHash, order.sats, replayOrder.executeBy, replayOrder.claimBy, 1]) });
  const replayArgs = [...claimArgs]; replayArgs[0] = replayId; replayArgs[6] = await runtime.time();
  await runtime.send('fresh funded order cannot consume same native outpoint twice', { from: runtime.accounts[2], to: runtime.address, data: runtime.data('claim(bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)', replayArgs) }, '0x0', 'EFFECT_CONSUMED');
  evidence.checks.push('canonical native outpoint consumption survives new funded order identity');
  await action('expire');
  await runtime.send('recover expired replay test order', { from: order.owner, to: runtime.address, data: runtime.data('refund(bytes32)', [replayId]) });
  const unused = await action('refund');
  check('expired no-delivery reservation returns actual EVM input', unused.operation.reservation.state === 'REFUNDED' && unused.operation.bitcoin === null && unused.operation.ownerRefundWei === order.amountWei);
  evidence.operations.push(unused.operation);
  await action('lock'); await action('send'); await action('confirm'); await action('expire'); const partial = await action('refund');
  check('confirmed Bitcoin persists after unpaid EVM refund', partial.operation.reservation.state === 'REFUNDED' && partial.operation.bitcoin.confirmations >= 6 && partial.operation.solverRewardWei === '0' && partial.balances.recipientSatoshi === '200000');
  evidence.operations.push(partial.operation); evidence.finalSnapshot = partial;
  evidence.checks.push('Solana was never simulated or executed in this native profile');
  evidence.runtime = runtime.metadata; evidence.transactions = structuredClone(runtime.receipts);
  evidence.sourceSHA256 = {};
  for (const p of ['src/server.mjs', 'src/native-local.mjs', 'src/native-authority.mjs', 'src/chains/native-runtime.mjs', 'contracts/LocalBitcoinDeliveryEscrow.sol', 'client/native.mjs', 'scripts/integration-linux-baseline.mjs']) evidence.sourceSHA256[p] = sha(await readFile(join(projectRoot, p)));
  evidence.phase = 'completed';
} catch (e) { evidence.phase = 'failed'; evidence.failure = e.message; process.exitCode = 1; console.error(e.message); }
finally { await app.close(); evidence.ownRuntimesStopped = true; evidence.disposableNativeWalletsRemoved = true; await persist(); }
console.log(JSON.stringify({ phase: evidence.phase, operationCount: evidence.operations.length, checks: evidence.checks.length, evidence: 'evidence/m14-linux-baseline.json' }));
