/** Original framing oracle only; no program, native authority or send. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {claimTicketSecret} from '../../../../packages/backend/src/claims/protocol/framing.mjs';
import {receiptKeyCommitment} from '../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';
const expected='7fc4fb20c2b8734f0e48b9089e91afab2f28ae4b09e571b8d1408532f5b450b6';
test('original payout key framing fixes the oracle and separates domain, namespace and ticket',()=>{
 const claimDomain='11'.repeat(32),ledgerNamespace='22'.repeat(32),ticketId='33'.repeat(32);
 const key=(domain,namespace,ticket)=>receiptKeyCommitment({ledgerNamespace:namespace,secret:claimTicketSecret({claimDomain:domain,ticketId:ticket})});
 assert.equal(key(claimDomain,ledgerNamespace,ticketId),expected);
 for(const [domain,namespace,ticket] of [['12'.repeat(32),ledgerNamespace,ticketId],[claimDomain,'23'.repeat(32),ticketId],[claimDomain,ledgerNamespace,'34'.repeat(32)]])
  assert.notEqual(key(domain,namespace,ticket),expected);
});
