// One generic relation, explicitly discriminated typed source profiles.
// Inactive branch padding is constrained; no profile or facts digest is an oracle.
use crate::types::{Profile, TronProfile, Observation, Wire, Evidence};
use crate::{facts, tron, framing};
use native_support::receipt::NativeEffect;
use poseidon_support::types::Domain;
global EVM: [u8; 32] = [216, 71, 103, 183, 205, 143, 155, 146, 138, 188, 241, 147, 230, 65, 154, 97, 88, 162, 171, 22, 15, 151, 78, 176, 32, 124, 135, 138, 141, 200, 5, 232];
global TRON: [u8; 32] = [37, 81, 71, 43, 131, 215, 219, 152, 112, 18, 133, 218, 159, 21, 30, 31, 34, 199, 177, 61, 197, 207, 190, 163, 92, 223, 29, 18, 143, 204, 239, 84];
fn is_evm(predicate: [u8; 32]) -> bool { assert((predicate == EVM) | (predicate == TRON)); predicate == EVM }
fn zero_evm(profile: Profile) {
    assert(profile.version == 0);
    assert(profile.chain_id == 0);
    assert(profile.genesis == [0; 32]);
    assert(profile.asset == [0; 32]);
    assert(profile.source_set_root == [0; 32]);
    assert(profile.finality_policy == [0; 32]);
    assert(profile.trace_policy == [0; 32]);
    assert(profile.obligation == [0; 32]);
    assert(profile.maximum_ancestry == 0);
    assert(profile.maximum_evidence_lifetime == 0);
    assert(profile.maximum_block_age_ms == 0);
    assert(profile.maximum_clock_skew_ms == 0);
    assert(profile.maximum_query_ms == 0);
}
fn zero_tron(profile: TronProfile) {
    assert(profile.version == 0);
    assert(profile.genesis == [0; 32]);
    assert(profile.asset == [0; 32]);
    assert(profile.source_set_root == [0; 32]);
    assert(profile.finality_policy == [0; 32]);
    assert(profile.permission_policy == [0; 32]);
    assert(profile.tapos_expiry_policy == [0; 32]);
    assert(profile.obligation == [0; 32]);
    assert(profile.maximum_ancestry == 0);
    assert(profile.maximum_tapos_distance == 0);
    assert(profile.maximum_evidence_lifetime == 0);
    assert(profile.maximum_block_age_ms == 0);
    assert(profile.maximum_clock_skew_ms == 0);
    assert(profile.maximum_query_ms == 0);
}
pub fn profile_commitment(predicate: [u8; 32], evm: Profile, trx: TronProfile) -> [u8; 32] {
    if is_evm(predicate) { zero_tron(trx); facts::assert_profile(evm); framing::profile_commitment(evm) }
    else { zero_evm(evm); tron::assert_profile(trx); framing::tron_profile_commitment(trx) }
}
pub fn chain_domain(predicate: [u8; 32], evm: Profile, trx: TronProfile) -> [u8; 32] {
    if is_evm(predicate) { framing::chain_domain(evm) } else { framing::tron_chain_domain(trx) }
}
pub fn source_set_root(predicate: [u8; 32], evm: Profile, trx: TronProfile) -> [u8; 32] {
    if is_evm(predicate) { evm.source_set_root } else { trx.source_set_root }
}
pub fn maximum_clock_skew_ms(predicate: [u8; 32], evm: Profile, trx: TronProfile) -> u64 {
    if is_evm(predicate) { evm.maximum_clock_skew_ms } else { trx.maximum_clock_skew_ms }
}
pub fn assert_native_facts(predicate: [u8; 32], evm: Profile, trx: TronProfile,
    effect: NativeEffect, wire: Wire, observed: Observation, evidence: Evidence) -> [u8; 32] {
    if is_evm(predicate) { facts::assert_native_facts(evm, effect, wire, observed, evidence) }
    else { tron::assert_native_facts(trx, effect, wire, observed, evidence) }
}
pub fn facts_statement(predicate: [u8; 32], evm: Profile, trx: TronProfile,
    domain: Domain, epoch: u64, effect: NativeEffect, gid: [u8; 32], wire: Wire,
    observed: Observation, evidence: Evidence) -> [u8; 32] {
    if is_evm(predicate) { framing::facts_statement(domain, epoch, evm, effect, gid, wire, observed, evidence) }
    else { framing::tron_facts_statement(domain, epoch, trx, effect, gid, wire, observed, evidence) }
}
