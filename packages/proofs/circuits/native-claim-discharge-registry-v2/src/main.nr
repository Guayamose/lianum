// NEW registry-v2 source/key identity; same public width, never an old-key alias.
// CO42: exact native discharge of a funded immutable ticket. The receiving
// gateway joins its PENDING ticket and consumes N in the shared hub exactly
// once. Facts have no actual-fee field: this relation does not prove maxFee.
use claim_support::framing;
use claim_registry_v2::evidence as claim_evidence;
use claim_registry_v2::types::ClaimEvidenceV2;
use claim_support::types::{ClaimConfig, ClaimTicket};
use admission_support::{statement, framing as admission_framing};
use poseidon_support::encoding;
use poseidon_support::types::Domain;
use native_support::receipt;
use graph_support::sha256::words_to_bytes;

fn main(
    claim_domain: pub [u32; 8],
    ticket_id: pub [u32; 8],
    ticket_commitment: pub [u32; 8],
    discharge_n: pub [u32; 8],
    admission_revocation_state: pub [u32; 8],
    evidence_from: pub u64,
    evidence_until: pub u64,
    config: ClaimConfig,
    domain: Domain,
    evidence: ClaimEvidenceV2,
    ticket: ClaimTicket,
    destination_endpoint: [u8; 32],
    destination_salt: [u8; 32],
) {
    let claim = words_to_bytes(claim_domain);
    assert(claim != [0; 32]);
    assert(framing::claim_domain(config) == claim);
    let (_pool_domain, gid, current_revocation) = claim_evidence::assert_registered_evidence(config, domain, evidence);
    let revocation = encoding::canonical_field(words_to_bytes(admission_revocation_state));
    assert(revocation != 0);
    assert(current_revocation == revocation);
    assert(ticket.claim_domain == claim);
    assert(ticket.id == words_to_bytes(ticket_id));
    let ticket_cm = framing::ticket_commitment(ticket);
    assert(ticket_cm != [0; 32]);
    assert(ticket_cm == words_to_bytes(ticket_commitment));
    assert(evidence.observation.amount == ticket.amount as u128);
    assert(evidence.observation.source_commitment == config.escrow_endpoint_commitment);
    assert(evidence.observation.destination_commitment == destination_endpoint);
    assert(framing::destination_commitment(claim, statement::chain_domain(evidence.rule),
        destination_endpoint, ticket.amount, ticket.max_fee, destination_salt) == ticket.destination_commitment);
    assert(evidence.observation.evidence_from == evidence_from);
    assert(evidence.observation.evidence_until == evidence_until);

    // Intentionally public binding value: funded-ticket authorization comes
    // from the gateway, not secrecy of this deterministic ticket derivation.
    let secret = framing::ticket_secret(claim, ticket.id);
    assert(secret != [0; 32]);
    let key = receipt::receipt_key_commitment(config.ledger_namespace, secret);
    assert(key != [0; 32]);
    assert(key == evidence.wire.wire_key_commitment);
    let nullifier = admission_framing::admission_nullifier(config.ledger_namespace, secret, gid);
    assert(nullifier != [0; 32]);
    assert(nullifier == words_to_bytes(discharge_n));
}
