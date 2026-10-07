// S58: scoped Funding/Core openings and legacy input-note membership.
// S is NOT owner authorization. Pool acceptance requires matching genuine U
// and S atomically, including the original admission-tag replay guard.
use poseidon_support::{encoding, framing as internal_framing, merkle};
use poseidon_support::types::{Domain, Core};
use envelope_support::{framing, legacy_note};
use envelope_support::types::Funding;
use generic_wrappers::framing::admission;
use graph_support::sha256::words_to_bytes;

fn main(
    domain_commitment: pub [u32; 8],
    envelope: pub [u32; 8],
    input_root: pub [u32; 8],
    input_nullifier: pub [u32; 8],
    reserve_commitment: pub [u32; 8],
    change_commitment: pub [u32; 8],
    admission_tag: pub [u32; 8],
    funding_not_before: pub u64,
    funding_valid_until: pub u64,
    domain: Domain,
    core: Core,
    core_blind: [u8; 32],
    core_siblings: [[u8; 32]; 4],
    funding: Funding,
    funding_blind: [u8; 32],
    funding_siblings: [[u8; 32]; 4],
    input_commitment: [u8; 32],
    input_siblings: [[u8; 32]; 6],
    input_leaf_index: u32,
) {
    let domain_value = encoding::canonical_field(words_to_bytes(domain_commitment));
    let envelope_value = encoding::canonical_field(words_to_bytes(envelope));
    assert(domain_value != 0);
    assert(envelope_value != 0);
    assert(internal_framing::domain_commitment(domain) == domain_value);
    merkle::membership::<4>(domain_value, 1,
        internal_framing::core_leaf(domain_value, core, core_blind), core_siblings, 0, envelope_value);
    merkle::membership::<4>(domain_value, 1,
        framing::funding_leaf(domain_value, funding, funding_blind), funding_siblings, 1, envelope_value);
    assert(funding.input_commitment == input_commitment);
    assert(funding.input_nullifier == words_to_bytes(input_nullifier));
    assert(funding.reserve_commitment == words_to_bytes(reserve_commitment));
    assert(funding.change_commitment == words_to_bytes(change_commitment));
    assert(funding.reserve_commitment == core.reserve_commitment);
    assert(funding.funding_not_before == funding_not_before);
    assert(funding.funding_valid_until == funding_valid_until);
    assert(funding_not_before < funding_valid_until);
    assert(funding_valid_until <= core.settle_before);
    // The input leaf/root remain complete legacy SHA digests, not Fr values.
    legacy_note::assert_member(input_commitment, input_siblings, input_leaf_index, input_root);
    // Keep the exact golden H4 admission bytes and operation-id replay scope.
    assert(admission(legacy_note::digest_words(domain.scope),
        legacy_note::digest_words(domain.policy), legacy_note::digest_words(domain.asset),
        legacy_note::digest_words(funding.operation_id)) == admission_tag);
}

