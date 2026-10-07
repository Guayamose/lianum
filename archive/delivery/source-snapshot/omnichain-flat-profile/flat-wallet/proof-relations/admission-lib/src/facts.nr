// Facts-only native predicates. Signatures authenticate the observed wire and
// consensus assertions; this module does not parse native wire or consensus.
use native_support::receipt::{NativeEffect, native_global_effect_id};
use crate::statement::{Rule, Observation, assert_rule, chain_domain};
use crate::types::{WireBinding, NativeContext};
use crate::framing::{native_custody_commitment, observed_effect_commitment};

pub fn assert_native_facts(
    rule: Rule,
    effect: NativeEffect,
    wire: WireBinding,
    observed: Observation,
    context: NativeContext,
) -> [u8; 32] {
    assert_rule(rule);
    assert((rule.family == 1) | (rule.family == 2) | (rule.family == 3));
    assert(effect.family == rule.family);
    assert(effect.genesis == rule.genesis);
    assert(effect.asset == rule.asset);
    assert(effect.transaction_id != [0; 64]);
    assert(effect.effect_index == 0);
    // Reuse the exact legacy genesis/family/asset/frame/index codec. It also
    // constrains BTC/EVM's last 32 transaction-ID bytes to zero, without reversal.
    let native_gid = native_global_effect_id(effect);
    assert(native_gid != [0; 32]);
    assert(wire.transaction_sha256 != [0; 32]);
    assert(wire.wire_binding_version == 1);
    assert(wire.wire_binding_kind == effect.family);
    assert(wire.wire_binding_position == if effect.family == 1 { 2 }
        else if effect.family == 2 { 1 } else { 0 });
    assert(wire.wire_key_commitment != [0; 32]);

    assert(observed.block_id != [0; 32]);
    assert(observed.state_commitment != [0; 32]);
    assert(observed.source_commitment != [0; 32]);
    assert(observed.destination_commitment != [0; 32]);
    assert(observed.source_commitment != observed.destination_commitment);
    assert(observed.amount > 0);
    // Exact bounded-adapter limits; u128 is the original action/facts width.
    if effect.family == 1 { assert(observed.amount <= 1000000000); }
    else if effect.family == 2 { assert(observed.amount <= 9007199254740991); }
    // EVM retains the original positive u128 amount. A registered delivery
    // route separately binds its deposit statement and enforces its u64 bound.
    assert(observed.custody_kind == 1);
    assert(observed.custody_commitment != [0; 32]);
    let chain = chain_domain(rule);
    assert(observed.custody_commitment == native_custody_commitment(chain, observed));
    assert(observed.state_commitment == observed_effect_commitment(
        chain, native_gid, wire.transaction_sha256, observed,
    ));
    assert(observed.finality_kind == rule.finality_kind);
    assert(observed.confirmations >= rule.minimum_confirmations);

    // Facts are independent of the action's cutoff. The receipt computes the
    // intersection later. Check before addition, so u64 wrap is impossible.
    assert(observed.evidence_from == observed.observed_at);
    assert(observed.observed_at <= 18446744073709551615 - rule.maximum_evidence_lifetime);
    assert(observed.evidence_until == observed.observed_at + rule.maximum_evidence_lifetime);
    assert(observed.evidence_from < observed.evidence_until);

    if (effect.family == 1) | (effect.family == 3) {
        // EVM family 3 certifies registered canonical depth on the owned local
        // chain. This is not a public Ethereum economic-finality predicate.
        assert(context.observed_tip_id != [0; 32]);
        assert(context.observed_tip_height >= observed.block_height);
        let depth = context.observed_tip_height - observed.block_height;
        // The exact stable-tip confirmation count fits its original u32.
        // This bound also makes depth+1 safe as u64 before comparison.
        assert(depth < 4294967295);
        assert(observed.confirmations as u64 == depth + 1);
        assert(context.transaction_slot == 0);
        assert(context.parent_slot == 0);
        assert(context.observed_slot == 0);
    } else {
        assert(observed.confirmations == 0);
        assert(context.observed_tip_id == [0; 32]);
        assert(context.observed_tip_height == 0);
        assert(context.parent_slot < context.transaction_slot);
        assert(context.transaction_slot <= context.observed_slot);
    }
    native_gid
}
