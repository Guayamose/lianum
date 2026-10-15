// I42 admits one canonical native effect under the immutable hub registry.
// Its four signatures authenticate one provider dispatch and three independent
// registry positions. Native consensus and provider gate chronology remain
// declared trust assumptions; the circuit never treats a host boolean as fact.
mod statement;
use native_support::{capsule, capsule_framing, receipt, state, quorum};
use graph_support::sha256::words_to_bytes;

fn digest(inputs: [Field; 98], offset: u32) -> [u8; 32] {
    assert(offset <= 88);
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 {
        words[i] = inputs[offset + i] as u32;
        assert(words[i] as Field == inputs[offset + i]);
    }
    words_to_bytes(words)
}

fn main(
    hub_domain: pub [u32; 8],
    registry_commitment: pub [u32; 8],
    accepted_checkpoint_root: pub [u32; 8],
    global_effect_id: pub [u32; 8],
    receipt_commitment: pub [u32; 8],
    admission_from: pub u64,
    admission_until: pub u64,
    ready_proof: [Field; 458],
    ready_inputs: [Field; 98],
    checkpoint_siblings: [[u8; 32]; 6],
    checkpoint_index: u32,
    registry: quorum::Registry,
    rule: statement::Rule,
    rule_siblings: [[u8; 32]; 3],
    rule_index: u8,
    action: capsule::Action,
    effect: receipt::NativeEffect,
    opening: receipt::ReceiptRead,
    observation: statement::Observation,
    provider_key_x: [u8; 32],
    provider_key_y: [u8; 32],
    dispatch_signed_at: u64,
    dispatch_signature: [u8; 64],
    delivery_risk_salt: [u8; 32],
    attester_indexes: [u8; 3],
    attester_signatures: [[u8; 64]; 3],
) {
    approved_ready::verify(ready_proof, ready_inputs);
    let hub = words_to_bytes(hub_domain);
    let registry_id = words_to_bytes(registry_commitment);
    let gid = words_to_bytes(global_effect_id);
    let receipt_cm = words_to_bytes(receipt_commitment);
    assert(digest(ready_inputs, 24) == hub);
    assert(digest(ready_inputs, 32) == registry_id);
    assert(registry.hub_domain == hub);
    assert(quorum::registry_commitment(registry) == registry_id);
    state::membership(digest(ready_inputs, 40), checkpoint_siblings,
        checkpoint_index, words_to_bytes(accepted_checkpoint_root));

    // A deployment registers up to eight exact native rules. The hub's fixed
    // registry commitment binds this root, so an owner cannot lower finality,
    // reinterpret asset/genesis bytes, or appoint its own evidence policy.
    statement::assert_rule(rule);
    let rule_cm = statement::rule_commitment(rule);
    assert(rule_index < 8);
    let mut rule_root = rule_cm;
    for depth in 0..3 {
        rule_root = if (((rule_index as u32) >> depth) & 1) == 0 {
            state::node_hash(rule_root, rule_siblings[depth])
        } else { state::node_hash(rule_siblings[depth], rule_root) };
    }
    assert(rule_root == registry.rules_root);
    assert(rule_cm == digest(ready_inputs, 72));
    assert(statement::chain_domain(rule) == digest(ready_inputs, 64));
    assert(effect.family == rule.family);
    assert(effect.genesis == rule.genesis);
    assert(effect.asset == rule.asset);
    assert(receipt::native_global_effect_id(effect) == gid);

    capsule::assert_action(action);
    assert(capsule_framing::native_transfer_action(action) == digest(ready_inputs, 80));
    assert(action.chain_domain == digest(ready_inputs, 64));
    assert(statement::provider_identity(provider_key_x, provider_key_y) == action.signer_identity);
    assert(delivery_risk_salt != [0; 32]);
    assert(action.delivery_risk_commitment == statement::delivery_risk(
        hub, registry_id, ready_inputs, action, delivery_risk_salt,
    ));

    // The exact native effect seen by the quorum must satisfy the exact action
    // the owner authorized. A signed recipient/amount lie requires a quorum;
    // merely swapping an honest observation or a receipt salt cannot work.
    assert(observation.source_commitment == action.source_commitment);
    assert(observation.destination_commitment == action.destination_commitment);
    assert(observation.amount == action.amount);
    assert(observation.custody_kind == action.custody_kind);
    assert(observation.custody_commitment == action.custody_commitment);
    assert(observation.block_id != [0; 32]);
    assert(observation.state_commitment != [0; 32]);
    assert(observation.finality_kind == rule.finality_kind);
    assert(observation.confirmations >= rule.minimum_confirmations);
    assert(observation.evidence_from <= observation.observed_at);
    assert(observation.observed_at < observation.evidence_until);
    assert(observation.evidence_until - observation.evidence_from <= rule.maximum_evidence_lifetime);
    assert(observation.evidence_until <= action.settle_before);
    assert(admission_from < admission_until);
    assert(observation.evidence_from <= admission_from);
    assert(admission_until <= observation.evidence_until);
    // Avoid overflow-prone timestamp addition. The bounded subtraction is
    // reached only when clocks put one signed timestamp before the other.
    if admission_from < observation.observed_at {
        assert(observation.observed_at - admission_from <= rule.maximum_clock_skew);
    }
    if observation.observed_at < dispatch_signed_at {
        assert(dispatch_signed_at - observation.observed_at <= rule.maximum_clock_skew);
    }

    assert(opening.hub_domain == hub);
    assert(opening.registry_commitment == registry_id);
    assert(opening.global_effect_id == gid);
    assert(opening.scope == digest(ready_inputs, 0));
    assert(opening.policy == digest(ready_inputs, 8));
    assert(opening.local_commitment == digest(ready_inputs, 48));
    assert(opening.dispatch_id == digest(ready_inputs, 56));
    assert(opening.chain_domain == action.chain_domain);
    assert(opening.evidence_policy == rule_cm);
    assert(opening.action_commitment == digest(ready_inputs, 80));
    assert(opening.payout_commitment == digest(ready_inputs, 88));
    assert(opening.receipt_key_commitment == action.receipt_key_commitment);
    assert(opening.receipt_rho == action.receipt_rho);
    assert(opening.valid_from == observation.evidence_from);
    assert(opening.valid_until == observation.evidence_until);
    assert(receipt::receipt_commitment(opening) == receipt_cm);

    let ready_from = ready_inputs[96] as u64;
    let ready_until = ready_inputs[97] as u64;
    assert(ready_from as Field == ready_inputs[96]);
    assert(ready_until as Field == ready_inputs[97]);
    assert(ready_from <= dispatch_signed_at);
    assert(dispatch_signed_at < ready_until);
    assert(action.execution_from <= dispatch_signed_at);
    assert(dispatch_signed_at < action.execution_until);
    let ready_digest = statement::ready_statement(ready_inputs);
    let dispatch_digest = statement::dispatch_statement(
        hub, registry_id, ready_digest, opening, action.delivery_risk_commitment,
        dispatch_signed_at,
    );
    statement::assert_signature(provider_key_x, provider_key_y, dispatch_signature, dispatch_digest);
    let evidence_digest = statement::attestation_statement(
        hub, registry_id, rule_cm, ready_digest, dispatch_digest, receipt_cm, gid, observation,
    );
    quorum::assert_quorum(registry, registry_id, evidence_digest, attester_indexes, attester_signatures);
}
