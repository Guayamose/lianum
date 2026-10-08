/** Host-only asynchronous browser-load contract. No native node, proof or
 * action capability is created; the lower page and catalogue are synthetic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { ACTIONS } from '../../../../apps/wallet/src/client/state/view-model.mjs';
import { createManualWalletDomDriver } from './manual-wallet-dom-driver.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture({ status = 200, invalid = false } = {}) {
  const entered = deferred(), release = deferred(), responseSent = deferred(), rendered = deferred();
  let busy = false, observedResponses = 0;
  const origin = 'http://127.0.0.1:12345';
  const catalogue = {
    async read() { assert.equal(busy, false); busy = true; entered.resolve();
      try { await release.promise; } finally { busy = false; } },
    reviewOwnerPreparation() {
      if (busy) throw new Error('FLAT_CATALOGUE_UNAVAILABLE');
      return { originalPreparation: true };
    },
  };
  const value = { version: 1, profile: 'ACTIVE_FLAT_WALLET_APP_V1', connection: 'DISCONNECTED',
    portfolio: null, nativeClaims: null, account: null, defi: null, networks: null, transfers: null,
    capabilities: { graphExecution: false,
      ...Object.fromEntries(Object.values(ACTIONS).map(action => [action.capability, false])) },
    errors: { portfolio: null, nativeClaims: null, account: null, defi: null, networks: null, transfers: null } };
  class LoadingPage extends EventEmitter {
    waitForResponse(predicate) {
      return new Promise(resolve => {
        this.on('response', response => { if (predicate(response)) { observedResponses++; resolve(response); } });
      });
    }
    async goto() {
      // Module execution initiates the async read; DOMContentLoaded does not
      // await its fetch. That is the production trigger retained by this test.
      void catalogue.read().then(() => {
        this.emit('response', { url: () => origin + '/api/wallet/state',
          request: () => ({ method: () => 'GET' }), status: () => status,
          json: async () => invalid ? {} : structuredClone(value) });
        responseSent.resolve();
      });
    }
    locator(selector) {
      assert.equal(selector, '#refresh');
      return { async waitFor() {} };
    }
    async waitForFunction() { await rendered.promise; }
  }
  const page = new LoadingPage();
  const app = { origin, ownerAccess: { origin, token: 'synthetic-read-token' },
    createManualActionHandoff: () => ({ descriptor: { origin } }) };
  return { page, app, catalogue, entered, release, responseSent, rendered, responses: () => observedResponses };
}

test('DOM driver retains the initial read before returning control to original owner preparation', async () => {
  const f = fixture(); let returned = false;
  const opening = createManualWalletDomDriver(f.app, { page: f.page, deadlineMs: Date.now() + 5000 })
    .then(driver => { returned = true; return driver; });
  await f.entered.promise; await nextTurn();
  assert.equal(returned, false, 'driver returned while the initial catalogue read still held ownership');
  assert.throws(() => f.catalogue.reviewOwnerPreparation(), /FLAT_CATALOGUE_UNAVAILABLE/);
  f.release.resolve();
  await f.responseSent.promise; await nextTurn();
  assert.equal(returned, false, 'driver returned before the original read was rendered');
  f.rendered.resolve();
  const driver = await opening;
  assert.equal(f.responses(), 1, 'the observed initial read was replaced or bypassed');
  assert.deepEqual(f.catalogue.reviewOwnerPreparation(), { originalPreparation: true });
  driver.close();
});

test('failed or malformed initial read never hands control to owner preparation', async () => {
  for (const options of [{ status: 503 }, { invalid: true }]) {
    const f = fixture(options);
    const opening = createManualWalletDomDriver(f.app, { page: f.page, deadlineMs: Date.now() + 5000 });
    await f.entered.promise;
    f.release.resolve();
    await assert.rejects(opening, options.invalid ? /WALLET_STATE_CONTRACT/ : /503/);
    assert.equal(f.responses(), 1);
  }
});
