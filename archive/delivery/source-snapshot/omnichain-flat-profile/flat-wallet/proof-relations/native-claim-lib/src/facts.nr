// Claim-only extension of the registered facts predicate. Native wire and
// consensus remain threshold-attested; neither is parsed inside this module.
use admission_support::facts as admission_facts;
use admission_support::statement::{Rule, Observation, assert_rule, chain_domain};
use admission_support::types::{WireBinding, NativeContext};
use admission_support::framing::{native_custody_commitment, observed_effect_commitment};
use native_support::receipt::{NativeEffect, native_global_effect_id};

pub fn assert_native_facts(
    rule: Rule,
    effect: NativeEffect,
    wire: WireBinding,
    observed: Observation,
    context: NativeContext,
) -> [u8; 32] {
    if wire.wire_binding_version == 2 {
        assert_sol_nonce_facts(rule, effect, wire, observed, context)
    } else {
        // The original predicate accepts exactly v1. BTC/EVM checks, SOL v1
        // checks, canonical padding and rejection of other versions stay there.
        admission_facts::assert_native_facts(rule, effect, wire, observed, context)
    }
}

fn assert_sol_nonce_facts(
    rule: Rule,
    effect: NativeEffect,
    wire: WireBinding,
    observed: Observation,
    context: NativeContext,
) -> [u8; 32] {
    assert_rule(rule);
    assert(rule.family == 2);
    assert(effect.family == rule.family);
    assert(effect.genesis == rule.genesis);
    assert(effect.asset == rule.asset);
    assert(effect.transaction_id != [0; 64]);
    // Fixed durable-nonce wire: advance at 0, transfer at 1, LNRB2:K memo at 2.
    // The host wire validator checks those exact instructions and memo bytes.
    assert(effect.effect_index == 1);
    let native_gid = native_global_effect_id(effect);
    assert(native_gid != [0; 32]);
    assert(wire.transaction_sha256 != [0; 32]);
    assert(wire.wire_binding_version == 2);
    assert(wire.wire_binding_kind == 2);
    assert(wire.wire_binding_position == 2);
    assert(wire.wire_key_commitment != [0; 32]);

    assert(observed.block_id != [0; 32]);
    assert(observed.state_commitment != [0; 32]);
    assert(observed.source_commitment != [0; 32]);
    assert(observed.destination_commitment != [0; 32]);
    assert(observed.source_commitment != observed.destination_commitment);
    assert(observed.amount > 0);
    assert(observed.amount <= 9007199254740991);
    assert(observed.custody_kind == 1);
    assert(observed.custody_commitment != [0; 32]);
    let chain = chain_domain(rule);
    assert(observed.custody_commitment == native_custody_commitment(chain, observed));
    assert(observed.state_commitment == observed_effect_commitment(
        chain, native_gid, wire.transaction_sha256, observed,
    ));
    assert(observed.finality_kind == rule.finality_kind);
    assert(observed.confirmations >= rule.minimum_confirmations);

    // Preserve the original checked u64 evidence window and positive lifetime.
    assert(observed.evidence_from == observed.observed_at);
    assert(observed.observed_at <= 18446744073709551615 - rule.maximum_evidence_lifetime);
    assert(observed.evidence_until == observed.observed_at + rule.maximum_evidence_lifetime);
    assert(observed.evidence_from < observed.evidence_until);

    assert(observed.confirmations == 0);
    assert(context.observed_tip_id == [0; 32]);
    assert(context.observed_tip_height == 0);
    assert(context.parent_slot < context.transaction_slot);
    assert(context.transaction_slot <= context.observed_slot);
    native_gid
}
