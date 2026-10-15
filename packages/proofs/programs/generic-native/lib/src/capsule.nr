// Owner-only CapsuleAuthorization relation. The C circuit verifies pinned A0
// once before calling this function. Dynamic roles receive scoped capsules,
// never this full graph witness. Privacy assumes non-colluding role operators.
use crate::capsule_framing;
use graph_support::graph::{Statement as GraphStatement, Witness as GraphWitness, assert_graph};
use graph_support::framing as graph_framing;

pub struct Statement {
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub asset: [u8; 32],
    pub hub_domain: [u8; 32],
    pub registry_commitment: [u8; 32],
    pub context: [u8; 32],
    pub reserve_commitment: [u8; 32],
    pub reserve_nullifier: [u8; 32],
    pub local_capsule_commitments: [[u8; 32]; 4],
    pub dependency_capsule_commitments: [[u8; 32]; 4],
    pub settle_before: u64,
}

pub struct LocalCapsule {
    pub slot: u8,
    pub active: bool,
    pub target_context: [u8; 32],
    pub node_commitment: [u8; 32],
    pub local_commitment: [u8; 32],
    pub dispatch_id: [u8; 32],
    pub chain_domain: [u8; 32],
    pub evidence_policy: [u8; 32],
    pub action_commitment: [u8; 32],
    pub payout_commitment: [u8; 32],
    pub receipt_key_commitment: [u8; 32],
    pub receipt_rho: [u8; 32],
    pub dummy_terminal_tag: [u8; 32],
    pub capsule_salt: [u8; 32],
}

pub struct Predecessor {
    pub source_slot: u8,
    pub source_node_commitment: [u8; 32],
    pub source_local_commitment: [u8; 32],
    pub source_dispatch_id: [u8; 32],
    pub chain_domain: [u8; 32],
    pub evidence_policy: [u8; 32],
    pub action_commitment: [u8; 32],
    pub payout_commitment: [u8; 32],
    pub receipt_key_commitment: [u8; 32],
    pub receipt_rho: [u8; 32],
}

pub struct DependencyCapsule {
    pub target_slot: u8,
    pub target_context: [u8; 32],
    pub dependency_count: u8,
    pub predecessors: [Predecessor; 3],
    pub capsule_salt: [u8; 32],
}

pub struct Action {
    pub chain_domain: [u8; 32],
    pub signer_identity: [u8; 32],
    pub source_commitment: [u8; 32],
    pub destination_commitment: [u8; 32],
    pub amount: u128,
    pub custody_kind: u8,
    pub custody_commitment: [u8; 32],
    pub execution_from: u64,
    pub execution_until: u64,
    pub settle_before: u64,
    pub receipt_key_commitment: [u8; 32],
    pub receipt_rho: [u8; 32],
    pub delivery_risk_commitment: [u8; 32],
    pub action_salt: [u8; 32],
}

pub struct Witness {
    pub graph: GraphWitness,
    pub local_capsules: [LocalCapsule; 4],
    pub dependency_capsules: [DependencyCapsule; 4],
    pub actions: [Action; 4],
    // Owner preparation only. Each nk goes solely to its own Node role.
    pub receipt_spend_secrets: [[u8; 32]; 4],
    pub target_salts: [[u8; 32]; 4],
}

// This binding is shared with future Ready/Admission. Registry rules assign
// these bytes native meaning; C does not establish finality or quote acceptance.
pub fn assert_action(action: Action) {
    assert(action.chain_domain != [0; 32]);
    assert(action.signer_identity != [0; 32]);
    assert(action.source_commitment != [0; 32]);
    assert(action.destination_commitment != [0; 32]);
    assert(action.amount > 0);
    assert(action.custody_kind == 1);
    assert(action.custody_commitment != [0; 32]);
    assert(action.execution_from < action.execution_until);
    assert(action.execution_until <= action.settle_before);
    assert(action.receipt_key_commitment != [0; 32]);
    assert(action.receipt_rho != [0; 32]);
    assert(action.delivery_risk_commitment != [0; 32]);
    assert(action.action_salt != [0; 32]);
}

fn assert_empty_action(action: Action) {
    assert(action.chain_domain == [0; 32]);
    assert(action.signer_identity == [0; 32]);
    assert(action.source_commitment == [0; 32]);
    assert(action.destination_commitment == [0; 32]);
    assert(action.amount == 0);
    assert(action.custody_kind == 0);
    assert(action.custody_commitment == [0; 32]);
    assert(action.execution_from == 0);
    assert(action.execution_until == 0);
    assert(action.settle_before == 0);
    assert(action.receipt_key_commitment == [0; 32]);
    assert(action.receipt_rho == [0; 32]);
    assert(action.delivery_risk_commitment == [0; 32]);
    assert(action.action_salt == [0; 32]);
}

fn assert_empty_predecessor(source: Predecessor) {
    assert(source.source_slot == 0);
    assert(source.source_node_commitment == [0; 32]);
    assert(source.source_local_commitment == [0; 32]);
    assert(source.source_dispatch_id == [0; 32]);
    assert(source.chain_domain == [0; 32]);
    assert(source.evidence_policy == [0; 32]);
    assert(source.action_commitment == [0; 32]);
    assert(source.payout_commitment == [0; 32]);
    assert(source.receipt_key_commitment == [0; 32]);
    assert(source.receipt_rho == [0; 32]);
}

// owner_digests is A0's exact 17 digest sequence, with its three exact u64s.
// The caller extracts these only from the verified 139-field A0 statement.
pub fn assert_capsules(
    statement: Statement,
    owner_digests: [[u8; 32]; 17],
    owner_times: [u64; 3],
    witness: Witness,
) {
    assert(statement.scope == owner_digests[0]);
    assert(statement.policy == owner_digests[1]);
    assert(statement.asset == owner_digests[2]);
    assert(statement.hub_domain != [0; 32]);
    assert(statement.registry_commitment != [0; 32]);
    assert(statement.reserve_commitment == owner_digests[9]);
    assert(statement.reserve_nullifier == owner_digests[10]);
    assert(statement.settle_before == owner_times[2]);
    // Includes operation, input CM/NF, intent, graph/root, change, all payouts,
    // recovery and every funding/settlement time. There is no hash reduction.
    assert(statement.context == capsule_framing::a0_context(owner_digests, owner_times));
    assert(statement.context != [0; 32]);

    let graph_statement = GraphStatement {
        scope: statement.scope,
        policy: statement.policy,
        operation_id: owner_digests[3],
        graph_commitment: owner_digests[7],
        expires_at: owner_times[2],
        reserved_commitment: owner_digests[6],
        recovery_commitment: owner_digests[16],
    };
    let opening = assert_graph(graph_statement, witness.graph);
    assert(opening.tree_root == owner_digests[8]);

    for i in 0..4 {
        let local = witness.local_capsules[i];
        // Count is authenticated by the exact graph commitment, not a host flag.
        let active = i < witness.graph.active_count as u32;
        assert(local.slot == i as u8);
        assert(local.active == active);
        assert(witness.target_salts[i] != [0; 32]);
        assert(local.capsule_salt != [0; 32]);
        assert(local.target_context == capsule_framing::target_context(
            statement.hub_domain, statement.context, i as u8, witness.target_salts[i],
        ));
        assert(local.target_context != [0; 32]);
        for j in 0..4 {
            if j < i { assert(local.target_context != witness.local_capsules[j].target_context); }
        }
        // Empty slots also authenticate the exact graph leaf and A0 padding.
        assert(local.node_commitment == opening.leaves[i]);
        assert(local.payout_commitment == owner_digests[12 + i]);
        if active {
            let salt = graph_framing::node_salt(witness.graph.nonce,
                witness.graph.node_ids[i], witness.graph.node_id_lengths[i]);
            assert(local.local_commitment == graph_framing::local_capability(
                owner_digests[7], opening.leaves[i], salt,
            ));
            assert(local.dispatch_id == graph_framing::dispatch(
                statement.scope, statement.policy, local.local_commitment, salt,
            ));
            assert(local.chain_domain == witness.graph.chain_domains[i]);
            assert(local.evidence_policy == witness.graph.evidence_policies[i]);
            assert(local.action_commitment == witness.graph.action_commitments[i]);
            assert(local.payout_commitment == witness.graph.payout_commitments[i]);
            assert(witness.receipt_spend_secrets[i] != [0; 32]);
            assert(local.receipt_key_commitment == capsule_framing::receipt_key(
                statement.hub_domain, witness.receipt_spend_secrets[i],
            ));
            assert(local.receipt_rho != [0; 32]);
            assert(local.dummy_terminal_tag == [0; 32]);
            let action = witness.actions[i];
            assert_action(action);
            assert(action.chain_domain == local.chain_domain);
            assert(action.settle_before == statement.settle_before);
            assert(action.receipt_key_commitment == local.receipt_key_commitment);
            assert(action.receipt_rho == local.receipt_rho);
            assert(capsule_framing::native_transfer_action(action) == local.action_commitment);
        } else {
            assert(local.local_commitment == [0; 32]);
            assert(local.dispatch_id == [0; 32]);
            assert(local.chain_domain == [0; 32]);
            assert(local.evidence_policy == [0; 32]);
            assert(local.action_commitment == [0; 32]);
            assert(local.receipt_key_commitment == [0; 32]);
            assert(local.receipt_rho == [0; 32]);
            assert(witness.receipt_spend_secrets[i] == [0; 32]);
            assert_empty_action(witness.actions[i]);
            assert(local.dummy_terminal_tag == capsule_framing::unused_receipt_spend(
                statement.hub_domain, statement.reserve_nullifier, witness.graph.nonce, i as u8,
            ));
        }
        assert(capsule_framing::local_capsule(statement.hub_domain, statement.registry_commitment,
            statement.context, local) == statement.local_capsule_commitments[i]);
    }

    for i in 0..4 {
        let dependency = witness.dependency_capsules[i];
        assert(dependency.target_slot == i as u8);
        assert(dependency.target_context == witness.local_capsules[i].target_context);
        assert(dependency.capsule_salt != [0; 32]);
        // assert_graph has already established canonical sorted earlier indexes,
        // no missing/duplicate edges, and count/index zero padding for empties.
        assert(dependency.dependency_count == witness.graph.dependency_counts[i]);
        for d in 0..3 {
            let source = dependency.predecessors[d];
            if d < dependency.dependency_count as u32 {
                assert(source.source_slot == witness.graph.dependency_indexes[i][d]);
                assert((source.source_slot as u32) < i);
                if d > 0 { assert(source.source_slot > dependency.predecessors[d - 1].source_slot); }
                let local = witness.local_capsules[source.source_slot as u32];
                assert(local.active);
                assert(source.source_node_commitment == local.node_commitment);
                assert(source.source_local_commitment == local.local_commitment);
                assert(source.source_dispatch_id == local.dispatch_id);
                assert(source.chain_domain == local.chain_domain);
                assert(source.evidence_policy == local.evidence_policy);
                assert(source.action_commitment == local.action_commitment);
                assert(source.payout_commitment == local.payout_commitment);
                assert(source.receipt_key_commitment == local.receipt_key_commitment);
                assert(source.receipt_rho == local.receipt_rho);
            } else { assert_empty_predecessor(source); }
        }
        assert(capsule_framing::dependency_capsule(statement.hub_domain, statement.registry_commitment,
            statement.context, dependency) == statement.dependency_capsule_commitments[i]);
    }
}
