/** Clock regression over the explicit inert controller fixture. No chain,
 * proof or runtime authority is manufactured here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, hash } from '../../fixtures/claims/authorization/claim-key-authority-v4.fixture.mjs';

test('new claim backing authorization starts from the refreshed observed receiver head', async () => {
  const f = await fixture();
  try {
    const prepared = await f.controller.prepare({ handoff: f.handoff });
    f.control.intentId = prepared.intentId;
    let refreshed = 0;
    f.options.runtime.testRefreshReceiverClock = async () => {
      refreshed++;
      f.state.head = { ...f.state.head, number: '2', hash: hash('observed-head'), timestamp: '76' };
    };
    f.control.preparedHook = async value => {
      assert.equal(refreshed, 1);
      assert.equal(BigInt(value.head.timestamp), 76n);
    };
    await f.controller.preposition({ intentId: prepared.intentId });
    assert.equal(refreshed, 1);
    assert.equal(f.control.dispatches, 1);
  } finally { await f.close(); }
});

test('an uncertain original EVM effect blocks clock advancement and a second dispatch', async () => {
  const f = await fixture();
  try {
    const prepared = await f.controller.prepare({ handoff: f.handoff });
    f.control.intentId = prepared.intentId;
    f.control.loseReply = true;
    let refreshed = 0;
    f.options.runtime.testRefreshReceiverClock = async () => { refreshed++; };
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /LOST_EVM_REPLY/);
    assert.equal(refreshed, 1);
    await f.reopen();
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /UNKNOWN_EVM_RECONCILE_ORIGINAL_ONLY/);
    assert.equal(refreshed, 1);
    assert.equal(f.control.dispatches, 1);
    await f.controller.status();
    assert.equal(refreshed, 1);
  } finally { await f.close(); }
});
