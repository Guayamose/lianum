// U: direct owner authorization plus native capsule validity. Public D/E only.
// No A0/C proof, caller-selected VK, recursive verifier or host authority flag.
// This source alone establishes no deployment, funding or native truth.
use generic_funding::funding;
use native_support::{capsule, capsule_framing};
use poseidon_support::{encoding, framing as internal_framing};
use poseidon_support::types::{Domain, Core};
use envelope_support::{types, framing, tree};
use graph_support::sha256::words_to_bytes;

fn main(
    domain_commitment: pub [u32; 8],
    envelope: pub [u32; 8],
    domain: Domain,
    owner_statement: funding::Statement,
    owner_witness: funding::Witness,
    capsule_witness: capsule::Witness,
    join_blinds: [[u8; 32]; 4],
    leaf_blinds: [[u8; 32]; 16],
) {
    let domain_value = encoding::canonical_field(words_to_bytes(domain_commitment));
    let envelope_value = encoding::canonical_field(words_to_bytes(envelope));
    assert(domain_value != 0);
    assert(envelope_value != 0);
    assert(internal_framing::domain_commitment(domain) == domain_value);
    assert(owner_statement.scope == domain.scope);
    assert(owner_statement.policy == domain.policy);
    assert(owner_statement.asset == domain.asset);
    // The reused original capsule authority derives K with hub_domain. This
    // initial full profile explicitly fixes the stable namespace to that hub.
    assert(domain.ledger_namespace == domain.hub_domain);

    // Real original input/NF, owner/invoice signatures, conservation, graph,
    // recovery, change and exact padding predicates, evaluated directly.
    funding::assert_authorization(owner_statement, owner_witness);
    let owner_digests: [[u8; 32]; 17] = [
        owner_statement.scope,
        owner_statement.policy,
        owner_statement.asset,
        owner_statement.operation_id,
        owner_statement.input_commitment,
        owner_statement.input_nullifier,
        owner_statement.reservation_intent,
        owner_statement.graph_commitment,
        owner_statement.tree_root,
        owner_statement.reserve_commitment,
        owner_statement.reserve_nullifier,
        owner_statement.change_commitment,
        owner_statement.outputs[0],
        owner_statement.outputs[1],
        owner_statement.outputs[2],
        owner_statement.outputs[3],
        owner_statement.recovery_commitment,
    ];
    let owner_times: [u64; 3] = [owner_statement.funding_not_before,
        owner_statement.funding_valid_until, owner_statement.settle_before];
    let context = capsule_framing::a0_context(owner_digests, owner_times);
    let mut local_commitments: [[u8; 32]; 4] = [[0; 32]; 4];
    let mut dependency_commitments: [[u8; 32]; 4] = [[0; 32]; 4];
    for i in 0..4 {
        local_commitments[i] = capsule_framing::local_capsule(domain.hub_domain,
            domain.registry_commitment, context, capsule_witness.local_capsules[i]);
        dependency_commitments[i] = capsule_framing::dependency_capsule(domain.hub_domain,
            domain.registry_commitment, context, capsule_witness.dependency_capsules[i]);
    }
    // Arrays above derive from this same witness. assert_capsules retains every
    // graph/capsule/action/secret/dependency constraint, not just those hashes.
    capsule::assert_capsules(capsule::Statement {
        scope: owner_statement.scope,
        policy: owner_statement.policy,
        asset: owner_statement.asset,
        hub_domain: domain.hub_domain,
        registry_commitment: domain.registry_commitment,
        context,
        reserve_commitment: owner_statement.reserve_commitment,
        reserve_nullifier: owner_statement.reserve_nullifier,
        local_capsule_commitments: local_commitments,
        dependency_capsule_commitments: dependency_commitments,
        settle_before: owner_statement.settle_before,
    }, owner_digests, owner_times, capsule_witness);

    for i in 0..16 { assert(leaf_blinds[i] != [0; 32]); }
    for i in 0..4 {
        assert(join_blinds[i] != [0; 32]);
        if capsule_witness.local_capsules[i].active {
            for j in 0..4 {
                if (j < i) & capsule_witness.local_capsules[j].active {
                    assert(capsule_witness.local_capsules[i].receipt_key_commitment
                        != capsule_witness.local_capsules[j].receipt_key_commitment);
                }
            }
        }
    }

    let core = Core {
        context,
        reserve_commitment: owner_statement.reserve_commitment,
        reserve_nullifier: owner_statement.reserve_nullifier,
        settle_before: owner_statement.settle_before,
    };
    let funding_leaf = types::Funding {
        input_commitment: owner_statement.input_commitment,
        input_nullifier: owner_statement.input_nullifier,
        reserve_commitment: owner_statement.reserve_commitment,
        change_commitment: owner_statement.change_commitment,
        operation_id: owner_statement.operation_id,
        funding_not_before: owner_statement.funding_not_before,
        funding_valid_until: owner_statement.funding_valid_until,
    };
    let recovery_leaf = types::Recovery {
        reserve_commitment: owner_statement.reserve_commitment,
        reserve_nullifier: owner_statement.reserve_nullifier,
        recovery_commitment: owner_statement.recovery_commitment,
        settle_before: owner_statement.settle_before,
    };
    let settlement_leaf = types::Settlement {
        context,
        reserve_commitment: owner_statement.reserve_commitment,
        reserve_nullifier: owner_statement.reserve_nullifier,
        outputs: owner_statement.outputs,
        settle_before: owner_statement.settle_before,
    };
    let mut leaves: [Field; 16] = [0; 16];
    leaves[0] = internal_framing::core_leaf(domain_value, core, leaf_blinds[0]);
    leaves[1] = framing::funding_leaf(domain_value, funding_leaf, leaf_blinds[1]);
    leaves[2] = framing::recovery_leaf(domain_value, recovery_leaf, leaf_blinds[2]);
    leaves[3] = framing::settlement_leaf(domain_value, settlement_leaf, leaf_blinds[3]);
    for i in 0..4 {
        // One per-slot blind enters BOTH target leaves. Their target contexts
        // and all original source references were already validated above.
        let local = types::local_from_capsule(capsule_witness.local_capsules[i], join_blinds[i]);
        let dependency = types::dependency_from_capsule(capsule_witness.dependency_capsules[i], join_blinds[i]);
        leaves[4 + i] = internal_framing::local_leaf(domain_value, local, leaf_blinds[4 + i]);
        leaves[8 + i] = framing::dependency_leaf(domain_value, dependency, leaf_blinds[8 + i]);
        leaves[12 + i] = framing::payout_leaf(domain_value,
            types::Payout { slot: i as u8, commitment: owner_statement.outputs[i] }, leaf_blinds[12 + i]);
    }
    assert(tree::envelope_root(domain_value, leaves) == envelope_value);
}

