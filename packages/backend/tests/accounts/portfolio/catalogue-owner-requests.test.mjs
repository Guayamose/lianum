/** Synthetic presentation regression; no chain, custody or proof acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCatalogueOwnerRequests } from '../../../src/accounts/portfolio/catalogue-owner-requests.mjs';
import { accountActionContext } from '../../../../mobile-protocol/src/wallet/client/view-model.mjs';

const h = n => n.repeat(64), id = 'original_top_up_01';
const generationId = h('1'), request = { requestId: id, kind: 'TOP_UP', assetId: h('2'), ownerOperationRef: h('3') };
const asset = n => ({ status: 'LIVE', asset: { assetId: h(n), symbol: 'PALT', decimals: 6 },
  observed: { blockNumber: '1', blockHash: h('9'), timestamp: '1000' },
  balances: { available: '0', reserved: '0', recovery: '0', locked: '0' }, requests: [] });
const portfolio = () => ({ status: 'LIVE', coherent: true, observed: asset('2').observed, assets: [asset('2'), asset('4')] });
const binding = () => ({ generationId, request });
function state(view) {
  return { data: { account: { snapshot: { requests: [{ requestId: id, kind: 'TOP_UP', state: 'PREPARING' }] } },
    portfolio: { profile: 'FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2', status: 'LIVE', coherent: true,
      observed: view.observed, freshAdmissions: { version: 1, fenced: false, routes: [{ generationId, assetId: h('2') }] },
      generations: [{ generationId, routes: view.assets.map(row => ({ assetId: row.asset.assetId })), portfolio: view, errorCode: null }] } } };
}
test('reserved original PREPARING binding is visible on its exact asset before account preparation', () => {
  const original = portfolio();
  assert.throws(() => accountActionContext(state(original), 'accountPrepare', request));
  const projected = projectCatalogueOwnerRequests({ generationId, bindings: [binding()], portfolio: original });
  assert.equal(accountActionContext(state(projected), 'accountPrepare', request).asset.assetId, request.assetId);
  assert.deepEqual(projected.assets[0].requests, [{ requestId: id, kind: 'TOP_UP', state: 'UNRESOLVED', disposition: null }]);
  assert.deepEqual(projected.assets[0].balances, original.assets[0].balances);
  assert.deepEqual(projected.observed, original.observed);
  assert.deepEqual(original.assets[0].requests, []);
  for (const changed of [{ ...request, assetId: h('4') }, { ...request, kind: 'EXIT' }])
    assert.throws(() => accountActionContext(state(projected), 'accountPrepare', changed));
  const fenced = state(projected); fenced.data.portfolio.freshAdmissions.fenced = true;
  assert.throws(() => accountActionContext(fenced, 'accountPrepare', request));
});
test('original confirmed rows survive; other generations and ambiguous or changed bindings cannot relabel them', () => {
  const original = portfolio(); original.assets[0].requests = [{ requestId: id, kind: 'TOP_UP', state: 'CONFIRMED', disposition: 'APPLIED' }];
  const projected = projectCatalogueOwnerRequests({ generationId, bindings: [binding(), { generationId: h('5'), request: { ...request, requestId: 'another_generation' } }], portfolio: original });
  assert.deepEqual(projected, original);
  for (const changed of [{ ...binding(), request: { ...request, assetId: h('4') } }, { ...binding(), request: { ...request, kind: 'EXIT' } }])
    assert.throws(() => projectCatalogueOwnerRequests({ generationId, bindings: [changed], portfolio: original }));
  original.assets[1].requests = [...original.assets[0].requests];
  assert.throws(() => projectCatalogueOwnerRequests({ generationId, bindings: [binding()], portfolio: original }), /DUPLICATE/);
});
