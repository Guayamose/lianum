/** Pure journal routing/outcome tests. No runtime, proof or custody is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bindGenericAccountRequest, validateGenericAccountConfig }
  from '@lianum/engine/accounts/journal';
import { bindFlatPortfolioChildRequest, projectFlatPortfolioOutcome, createFlatPortfolioAuthority }
  from '../../../src/accounts/authority/flat-portfolio-authority.mjs';

const h = value => createHash('sha256').update(value).digest('hex');
function asset(index) {
  return { assetId: h('asset-' + index), kind: 'ERC20', symbol: index ? 'BLTV' : 'PALT', decimals: 6,
    chainId: '31337', genesis: h('genesis'), pool: String(index + 1).repeat(40),
    scope: h('scope-' + index), policy: h('policy-' + index), token: String(index + 3).repeat(40),
    codeHash: h('code-' + index), assetIdentity: h('identity-' + index),
    custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER' };
}
const assets = [asset(0), asset(1)];
const config = (name, registry) => validateGenericAccountConfig({ accountId: name, journalId: name + '_journal',
  lifetime: h(name), registry });
const outerConfig = config('portfolio_account', assets), children = assets.map((entry, i) => config('child_account_' + i, [entry]));
const outer = bindGenericAccountRequest({ requestId: 'fund_token_0001', kind: 'TOP_UP',
  assetId: assets[0].assetId, ownerOperationRef: h('original-owner-operation') }, outerConfig);
const inner = bindFlatPortfolioChildRequest(outer, outerConfig, children[0]);
const outcome = { version: 1, state: 'CONFIRMED', bindingSHA256: inner.bindingSHA256,
  assetBindingSHA256: inner.assetBindingSHA256, outcomeId: h('included-original'), disposition: 'APPLIED',
  blockNumber: '10', blockHash: h('block-10') };

test('routing preserves original operation and asset but binds the destination journal', () => {
  assert.notEqual(inner.bindingSHA256, outer.bindingSHA256);
  for (const key of ['requestId', 'kind', 'assetId', 'ownerOperationRef', 'assetBindingSHA256'])
    assert.equal(inner[key], outer[key]);
  assert.throws(() => bindFlatPortfolioChildRequest(outer, outerConfig, children[1]), /ASSET_ROUTE/);
  assert.throws(() => bindFlatPortfolioChildRequest({ ...outer, assetId: assets[1].assetId }, outerConfig, children[1]),
    /BINDING_CHANGED/);
  const substituted = config('wrong_metadata', [{ ...assets[0], decimals: 18 }]);
  assert.throws(() => bindFlatPortfolioChildRequest(outer, outerConfig, substituted), /ASSET_ROUTE/);
});

test('outer result cannot adopt another child outcome or change its disposition', () => {
  const wrapped = projectFlatPortfolioOutcome(outer, inner, outcome);
  assert.equal(wrapped.bindingSHA256, outer.bindingSHA256);
  assert.equal(wrapped.blockHash, outcome.blockHash); assert.equal(wrapped.disposition, 'APPLIED');
  assert.notEqual(wrapped.outcomeId, outcome.outcomeId);
  assert.deepEqual(projectFlatPortfolioOutcome(outer, inner, outcome), wrapped);
  assert.throws(() => projectFlatPortfolioOutcome(outer, inner, { ...outcome, bindingSHA256: h('other-request') }), /OUTCOME_BINDING/);
  assert.throws(() => projectFlatPortfolioOutcome(outer, inner, { ...outcome, disposition: 'RECOVERED' }), /OUTCOME_DISPOSITION/);
  assert.throws(() => projectFlatPortfolioOutcome({ ...outer, ownerOperationRef: h('other-owner') }, inner, outcome), /REQUEST_CHANGED/);
});

test('composition requires actual system and account capabilities', () => {
  assert.throws(() => createFlatPortfolioAuthority({ runtime: {}, system: {}, accounts: [],
    accountId: 'portfolio_account', journalId: 'portfolio_journal' }), /OWNED_SYSTEM/);
});
