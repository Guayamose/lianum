/** Actual read-only collectors. No node, signer, compiler or proof is started. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { ROOT, FLAT } from '@lianum/proofs/catalog';
import { regular, hash } from '@lianum/proofs/tooling/tooling';
import { developmentNativeClaimSourcePins } from './development-native-claim-source-pins.mjs';
import { developmentBtcSolGraphSourcePins } from './development-btc-sol-graph-source-pins.mjs';

for (const [name, collect] of [['claims', developmentNativeClaimSourcePins], ['BTC/SOL graph', developmentBtcSolGraphSourcePins]]) {
  test(`${name} captures the supervisor's actual mobile protocol dependency with exact installed bytes`, () => {
    const capsule = collect();
    const protocol = capsule.local.find(row => row.path === '../mobile-protocol/src/original-account-private-state-v1.mjs');
    assert.ok(protocol, 'CURRENT_SUPERVISOR_MOBILE_PROTOCOL_REQUIRED');
    const bytes = regular(resolve(FLAT, protocol.path));
    assert.equal(protocol.sha256, hash(bytes)); assert.equal(protocol.bytes, bytes.length);
    assert.ok(capsule.local.some(row => resolve(FLAT, row.path) === resolve(ROOT, 'proof-workers/proving-execution.mjs')));
    assert.equal(new Set(capsule.local.map(row => row.path)).size, capsule.local.length);
    assert.throws(() => collect({ root: '/tmp', sourcePins: [] }));
  });
}
