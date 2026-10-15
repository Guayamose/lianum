// Canonical Admission messages. H4 prefixes every component, including tags.
// These bytes define a registered, federated transfer profile, not consensus.
use native_support::{capsule, receipt};
use graph_support::sha256::{sha256, sha256_bounded, u32_bytes, u64_bytes, words_to_bytes};

pub struct Rule {
    pub family: u8,
    pub genesis: [u8; 32],
    pub asset: [u8; 32],
    pub finality_kind: u8,
    pub minimum_confirmations: u32,
    pub maximum_evidence_lifetime: u64,
    pub maximum_clock_skew: u64,
}

pub struct Observation {
    pub block_id: [u8; 32],
    pub state_commitment: [u8; 32],
    pub block_height: u64,
    pub observed_at: u64,
    pub finality_kind: u8,
    pub confirmations: u32,
    pub source_commitment: [u8; 32],
    pub destination_commitment: [u8; 32],
    pub amount: u128,
    pub custody_kind: u8,
    pub custody_commitment: [u8; 32],
    pub evidence_from: u64,
    pub evidence_until: u64,
}

fn part<let N: u32, let M: u32>(buffer: [u8; N], offset: u32, value: [u8; M]) -> [u8; N] {
    let mut result = buffer;
    let length = u32_bytes(M);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..M { result[offset + 4 + i] = value[i]; }
    result
}
fn u128_bytes(value: u128) -> [u8; 16] {
    let mut result: [u8; 16] = [0; 16];
    for i in 0..16 { result[i] = (value >> (((15 - i) * 8) as u128)) as u8; }
    result
}
fn digest(inputs: [Field; 98], offset: u32) -> [u8; 32] {
    assert(offset <= 88);
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 {
        words[i] = inputs[offset + i] as u32;
        assert(words[i] as Field == inputs[offset + i]);
    }
    words_to_bytes(words)
}

pub fn assert_rule(rule: Rule) {
    assert((rule.family >= 1) & (rule.family <= 4));
    assert(rule.genesis != [0; 32]);
    assert(rule.asset != [0; 32]);
    // 1: BTC confirmations, 2: SOL finalized, 3: registered EVM finality,
    // 4: TRON solidified. Labels do not implement these chain adapters.
    assert(rule.finality_kind == rule.family);
    if rule.family == 1 { assert(rule.minimum_confirmations >= 6); }
    if rule.family == 3 { assert(rule.minimum_confirmations >= 1); }
    if (rule.family == 2) | (rule.family == 4) { assert(rule.minimum_confirmations == 0); }
    assert((rule.maximum_evidence_lifetime > 0) & (rule.maximum_evidence_lifetime <= 86400));
    assert(rule.maximum_clock_skew <= 30);
}

// Hash the exact original evidence-chain/1 FRAME used inside canonical GID.
// This lets the registered rule bind its genesis/asset without changing GIDs.
pub fn chain_domain(rule: Rule) -> [u8; 32] {
    let tag = [76, 73, 65, 78, 85, 77, 47, 101, 118, 105, 100, 101, 110, 99, 101, 45, 99, 104, 97, 105, 110, 47, 49];
    let mut message: [u8; 107] = [0; 107];
    message = part(message, 0, tag);
    let is_tron = rule.family == 4;
    let label: [u8; 3] = if rule.family == 1 { [66, 84, 67] }
        else if rule.family == 2 { [83, 79, 76] } else { [69, 86, 77] };
    if is_tron {
        message = part(message, 27, [84, 82, 79, 78]);
        message = part(message, 35, rule.genesis);
        message = part(message, 71, rule.asset);
    } else {
        message = part(message, 27, label);
        message = part(message, 34, rule.genesis);
        message = part(message, 70, rule.asset);
    }
    sha256_bounded::<107, 128>(message, if is_tron { 107 } else { 106 })
}

pub fn rule_commitment(rule: Rule) -> [u8; 32] {
    let mut message: [u8; 170] = [0; 170];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 114, 117, 108, 101, 47, 50]);
    message = part(message, 29, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 56, [rule.family]);
    message = part(message, 61, rule.genesis);
    message = part(message, 97, rule.asset);
    message = part(message, 133, [rule.finality_kind]);
    message = part(message, 138, u32_bytes(rule.minimum_confirmations));
    message = part(message, 146, u64_bytes(rule.maximum_evidence_lifetime));
    message = part(message, 158, u64_bytes(rule.maximum_clock_skew));
    sha256::<170, 192>(message)
}

pub fn provider_identity(x: [u8; 32], y: [u8; 32]) -> [u8; 32] {
    let mut message: [u8; 134] = [0; 134];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 112, 114, 111, 118, 105, 100, 101, 114, 45, 105, 100, 101, 110, 116, 105, 116, 121, 47, 50]);
    message = part(message, 35, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 62, x);
    message = part(message, 98, y);
    sha256::<134, 192>(message)
}

pub fn ready_statement(inputs: [Field; 98]) -> [u8; 32] {
    let mut body: [u8; 400] = [0; 400];
    for i in 0..96 {
        let value = inputs[i] as u32;
        assert(value as Field == inputs[i]);
        let word = u32_bytes(value);
        for j in 0..4 { body[i * 4 + j] = word[j]; }
    }
    for i in 0..2 {
        let value = inputs[96 + i] as u64;
        assert(value as Field == inputs[96 + i]);
        let time = u64_bytes(value);
        for j in 0..8 { body[384 + i * 8 + j] = time[j]; }
    }
    let mut message: [u8; 464] = [0; 464];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 114, 101, 97, 100, 121, 45, 115, 116, 97, 116, 101, 109, 101, 110, 116, 47, 50]);
    message = part(message, 33, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 60, body);
    sha256::<464, 512>(message)
}

pub fn delivery_risk(hub: [u8; 32], registry: [u8; 32], inputs: [Field; 98], action: capsule::Action, salt: [u8; 32]) -> [u8; 32] {
    let mut message: [u8; 499] = [0; 499];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 100, 101, 108, 105, 118, 101, 114, 121, 45, 108, 111, 115, 115, 45, 97, 99, 99, 101, 112, 116, 97, 110, 99, 101, 47, 50]);
    message = part(message, 42, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 69, [70, 85, 76, 76, 95, 79, 87, 78, 69, 82, 95, 82, 69, 70, 85, 78, 68, 95, 80, 82, 79, 86, 73, 68, 69, 82, 95, 76, 79, 83, 83, 95, 86, 49]);
    message = part(message, 107, hub);
    message = part(message, 143, registry);
    message = part(message, 179, action.chain_domain);
    message = part(message, 215, action.source_commitment);
    message = part(message, 251, action.destination_commitment);
    message = part(message, 287, u128_bytes(action.amount));
    message = part(message, 307, digest(inputs, 0));
    message = part(message, 343, digest(inputs, 8));
    message = part(message, 379, digest(inputs, 16));
    message = part(message, 415, digest(inputs, 88));
    message = part(message, 451, u64_bytes(action.settle_before));
    message = part(message, 463, salt);
    sha256::<499, 512>(message)
}

pub fn dispatch_statement(hub: [u8; 32], registry: [u8; 32], ready: [u8; 32], opening: receipt::ReceiptRead, delivery_risk: [u8; 32], signed_at: u64) -> [u8; 32] {
    let mut message: [u8; 362] = [0; 362];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 112, 114, 111, 118, 105, 100, 101, 114, 45, 100, 105, 115, 112, 97, 116, 99, 104, 47, 50]);
    message = part(message, 35, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 62, hub);
    message = part(message, 98, registry);
    message = part(message, 134, ready);
    message = part(message, 170, opening.local_commitment);
    message = part(message, 206, opening.dispatch_id);
    message = part(message, 242, opening.action_commitment);
    message = part(message, 278, opening.global_effect_id);
    message = part(message, 314, delivery_risk);
    message = part(message, 350, u64_bytes(signed_at));
    sha256::<362, 384>(message)
}

pub fn attestation_statement(hub: [u8; 32], registry: [u8; 32], rule: [u8; 32], ready: [u8; 32], dispatch: [u8; 32], receipt: [u8; 32], gid: [u8; 32], observed: Observation) -> [u8; 32] {
    let mut message: [u8; 581] = [0; 581];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 97, 116, 116, 101, 115, 116, 97, 116, 105, 111, 110, 47, 50]);
    message = part(message, 36, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 63, hub);
    message = part(message, 99, registry);
    message = part(message, 135, rule);
    message = part(message, 171, ready);
    message = part(message, 207, dispatch);
    message = part(message, 243, receipt);
    message = part(message, 279, gid);
    message = part(message, 315, observed.block_id);
    message = part(message, 351, observed.state_commitment);
    message = part(message, 387, u64_bytes(observed.block_height));
    message = part(message, 399, u64_bytes(observed.observed_at));
    message = part(message, 411, [observed.finality_kind]);
    message = part(message, 416, u32_bytes(observed.confirmations));
    message = part(message, 424, observed.source_commitment);
    message = part(message, 460, observed.destination_commitment);
    message = part(message, 496, u128_bytes(observed.amount));
    message = part(message, 516, [observed.custody_kind]);
    message = part(message, 521, observed.custody_commitment);
    message = part(message, 557, u64_bytes(observed.evidence_from));
    message = part(message, 569, u64_bytes(observed.evidence_until));
    sha256::<581, 640>(message)
}

fn less_than(left: [u8; 32], right: [u8; 32]) -> bool {
    let mut prefix_equal = true;
    let mut less = false;
    for i in 0..32 {
        less = less | (prefix_equal & (left[i] < right[i]));
        prefix_equal = prefix_equal & (left[i] == right[i]);
    }
    less
}

fn assert_canonical_signature(signature: [u8; 64]) {
    let order: [u8; 32] = [
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe,
        0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b,
        0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
    ];
    let half_order: [u8; 32] = [
        0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0x5d, 0x57, 0x6e, 0x73, 0x57, 0xa4, 0x50, 0x1d,
        0xdf, 0xe9, 0x2f, 0x46, 0x68, 0x1b, 0x20, 0xa0,
    ];
    let mut r: [u8; 32] = [0; 32];
    let mut s: [u8; 32] = [0; 32];
    for i in 0..32 { r[i] = signature[i]; s[i] = signature[i + 32]; }
    assert(r != [0; 32]);
    assert(s != [0; 32]);
    assert(less_than(r, order));
    // s <= order/2 implies s < order and rejects the malleable high-S twin.
    assert(less_than(s, half_order) | (s == half_order));
}

// The provider attestation key is distinct from its native custody key. Its
// identity is owner-authorized inside the action; the actual native key stays
// behind the exact-action gate. This signature also explicitly accepts the
// full-owner-refund/provider-delivery-loss clause bound into the action.
pub fn assert_signature(x: [u8; 32], y: [u8; 32], signature: [u8; 64], digest: [u8; 32]) {
    assert_canonical_signature(signature);
    assert(std::ecdsa_secp256k1::verify_signature(x, y, signature, digest));
}
