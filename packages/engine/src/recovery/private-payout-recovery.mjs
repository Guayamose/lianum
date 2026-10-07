/**
 * Recipient payout reconciliation for a surviving trusted common host.
 *
 * This is an in-process capability, not a public IPC service. The constructor
 * receives the ORIGINAL deployed pool, recipient invoice and pinned destination
 * from trusted bootstrap. It neither makes keys nor opens vaults nor dispatches
 * native transfers. The host may restart the original recipient process in
 * recover mode using its separate encrypted vault and an in-memory password.
 * This does not recover a lost host/runtime, protect against a hostile OS, or
 * establish foreign finality. The SAME factory instance must survive coordinator
 * and recipient-process restarts: its uncertain-submit latch is in memory.
 * Reconstructing the instance while a prior send is ambiguous is forbidden;
 * audit records are not a constructor-level restore protocol. An unknown send
 * is never silently retried by the surviving instance.
 *
 * Spent status alone is NOT payment evidence: WITHDRAWN requires a canonical
 * successful transaction whose exact withdraw calldata AND Withdrawal event
 * match the original scope, policy, note nullifier, destination and amount.
 */
import { canonical } from '../crypto/privacy.mjs';
import { importRecipientInvoice, recipientWithdrawalInput } from '../recipients/private-recipient-custody.mjs';
import { createExactNoteWithdrawalRecovery } from '../notes/private-exact-note-withdrawal.mjs';

const copy = value => JSON.parse(canonical(value));

/** Strict type2 wrapper. A recipient's original signed invoice remains required;
 * owner type3 refund notes cannot enter this path or impersonate an invoice. */
export function createRecipientPayoutRecovery({ pool, runtime, terms: suppliedTerms, invoice: suppliedInvoice, recipient,
  fromBlock = '0x0', authorize, prove, submit, persist, onConfirmed = () => {} }) {
  const terms = copy(suppliedTerms), invoice = copy(suppliedInvoice);
  const { note } = importRecipientInvoice(terms, invoice);
  return createExactNoteWithdrawalRecovery({ pool, runtime, scope: terms.scope, policy: terms.policy,
    note, recipient, role: terms.role, fromBlock, authorize, prove, submit, persist, onConfirmed,
    withdrawalInput: (authorization, path) => recipientWithdrawalInput(terms, invoice, authorization, path) });
}
