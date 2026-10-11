/** Presentation of authenticated catalogue bindings before their original
 * account preparation. Pure synthetic-test seam; this creates no authority,
 * balance, confirmation or route. The private catalogue supplies the bindings. */
import assert from 'node:assert/strict';
import { copy, immutable } from '@lianum/engine/accounts/journal';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';

export function projectCatalogueOwnerRequests(input) {
  exactRecord(input, ['generationId', 'bindings', 'portfolio']);
  assert.match(input.generationId, /^[0-9a-f]{64}$/);
  assert.ok(Array.isArray(input.bindings) && input.bindings.length <= 128);
  fixedArray(input.bindings, input.bindings.length);
  const portfolio = copy(input.portfolio);
  for (const binding of input.bindings) {
    if (binding.generationId !== input.generationId) continue;
    const request = binding.request;
    assert.ok(['TOP_UP', 'GRAPH', 'EXIT'].includes(request.kind), 'CATALOGUE_ORIGINAL_REQUEST_KIND');
    assert.match(request.requestId, /^[A-Za-z0-9_-]{8,100}$/);
    const assets = portfolio.assets.filter(row => row.asset.assetId === request.assetId);
    assert.equal(assets.length, 1, 'CATALOGUE_ORIGINAL_REQUEST_ASSET');
    const rows = portfolio.assets.flatMap(asset => asset.requests.filter(row => row.requestId === request.requestId)
      .map(row => ({ assetId: asset.asset.assetId, row })));
    assert.ok(rows.length <= 1, 'CATALOGUE_ORIGINAL_REQUEST_DUPLICATE');
    if (rows.length) {
      assert.equal(rows[0].assetId, request.assetId, 'CATALOGUE_ORIGINAL_REQUEST_ASSET');
      assert.equal(rows[0].row.kind, request.kind, 'CATALOGUE_ORIGINAL_REQUEST_KIND');
    } else {
      // A durable reserved binding has no included outcome. It remains
      // unresolved until the original authority supplies its disposition.
      assets[0].requests.push({ requestId: request.requestId, kind: request.kind,
        state: 'UNRESOLVED', disposition: null });
    }
  }
  return immutable(portfolio);
}
