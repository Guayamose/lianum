// New wrapped nonce-registry V3 identity, CI51 public ABI: generic native ingress into registered custody and exact original
// type-4 Q. Owner D27 is verified separately by the atomic gateway. Native
// consensus/current backing/owner freshness are not established by this proof.
use claim_support::framing;
use claim_nonce_registry_v3::evidence as claim_evidence;
use claim_support::types::{ClaimConfig, NoteOpening};
use claim_nonce_registry_v3::types::ClaimEvidenceNonceRegistryV3;
use admission_support::{statement, framing as admission_framing};
use poseidon_support::{encoding, framing as pool_framing};
use poseidon_support::types::Domain;
use native_support::receipt;
use generic_funding::framing::legacy_balance;
use graph_support::sha256::words_to_bytes;

fn main(
    claim_domain: pub [u32; 8],
    output_q: pub [u32; 8],
    admission_n: pub [u32; 8],
    refund_destination: pub [u32; 8],
    admission_revocation_state: pub [u32; 8],
    ingress_receipt_leaf: pub [u32; 8],
    amount_q: pub u64,
    evidence_from: pub u64,
    evidence_until: pub u64,
    config: ClaimConfig,
    domain: Domain,
    evidence: ClaimEvidenceNonceRegistryV3,
    note_opening: NoteOpening,
) {
    let claim = words_to_bytes(claim_domain);
    assert(claim != [0; 32]);
    assert(framing::claim_domain(config) == claim);
    let (pool_domain, gid, current_revocation) = claim_evidence::assert_registered_ingress_evidence(config, domain, evidence);
    let revocation = encoding::canonical_field(words_to_bytes(admission_revocation_state));
    let leaf = encoding::canonical_field(words_to_bytes(ingress_receipt_leaf));
    assert(revocation != 0);
    assert(leaf != 0);
    assert(current_revocation == revocation);
    assert(amount_q > 0);
    assert(note_opening.value == amount_q);
    assert(note_opening.note_secret != [0; 32]);
    assert(evidence.observation.amount == amount_q as u128);
    assert(evidence.observation.destination_commitment == config.escrow_endpoint_commitment);
    assert(evidence.observation.evidence_from == evidence_from);
    assert(evidence.observation.evidence_until == evidence_until);

    // Owner custody must generate a fresh random secret for this new profile;
    // a relation can reject zero but cannot prove its entropy or disclosure.
    let q = legacy_balance(config.scope, config.policy, note_opening.rho,
        note_opening.x, note_opening.y, amount_q, note_opening.note_secret);
    assert(q != [0; 32]);
    assert(q == words_to_bytes(output_q));
    let secret = framing::receipt_secret(claim, note_opening.note_secret, q);
    assert(secret != [0; 32]);
    let key = receipt::receipt_key_commitment(config.ledger_namespace, secret);
    assert(key != [0; 32]);
    assert(key == evidence.wire.wire_key_commitment);
    let nullifier = admission_framing::admission_nullifier(config.ledger_namespace, secret, gid);
    assert(nullifier != [0; 32]);
    assert(nullifier == words_to_bytes(admission_n));
    let refund = framing::destination_commitment(claim, statement::chain_domain(evidence.rule),
        evidence.observation.source_commitment, amount_q, config.refund_max_fee,
        framing::refund_salt(claim, note_opening.note_secret, q));
    assert(refund != [0; 32]);
    assert(refund == words_to_bytes(refund_destination));
    // Renewable observation/owner windows never alter this receipt identity.
    // This is a typed claim receipt, not an opening of graph ReceiptRead.
    let receipt_cm = framing::ingress_receipt_commitment(claim, q, amount_q, nullifier, refund);
    assert(receipt_cm != [0; 32]);
    assert(pool_framing::receipt_leaf(pool_domain, receipt_cm) == leaf);
}
