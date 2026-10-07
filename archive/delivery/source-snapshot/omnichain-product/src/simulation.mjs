import { randomBytes } from 'node:crypto';
import { sign } from './privacy.mjs';
import { DOMAIN, graphHash, ensure } from './core.mjs';

// This module asserts synthetic effects only. It does not talk to a chain or prove consensus.
export function simulationReceipt(graph, legId, privateKey, now, overrides = {}) {
  const leg = graph.legs.find(l => l.id === legId); ensure(leg, 'UNKNOWN_LEG');
  const payload = { version: 1, domain: DOMAIN, evidenceType: 'simulation-attestation', graphHash: graphHash(graph), legId,
    chain: leg.chain, asset: leg.asset, recipient: leg.recipient, amount: leg.amount, fee: '1', executor: leg.executor,
    txRef: randomBytes(32).toString('hex'), effectIndex: 0, blockHash: randomBytes(32).toString('hex'),
    finality: 'simulated-final', observedAt: now, ...overrides };
  return { payload, signature: sign(payload, privateKey) };
}
