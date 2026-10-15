// A reusable signature relation for LIANUM_NATIVE_QUORUM_3_OF_4_SECP256K1_V2.
// The Admission caller must compute the canonical statement digest and bind
// expected_registry_commitment to trusted deployment configuration. This is
// federated attestation, not an independent native-consensus/custody proof.
use graph_support::sha256::{sha256, u32_bytes, u64_bytes};

pub struct Registry {
    pub hub_domain: [u8; 32],
    pub epoch: u64,
    pub rules_root: [u8; 32],
    pub keys_x: [[u8; 32]; 4],
    pub keys_y: [[u8; 32]; 4],
}

// Small fixed H4 framing helper; SHA256 remains the shared graph primitive.
fn part<let N: u32>(buffer: [u8; 454], offset: u32, value: [u8; N]) -> [u8; 454] {
    let mut result = buffer;
    let length = u32_bytes(N);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..N { result[offset + 4 + i] = value[i]; }
    result
}

// H4(tag, profile, hub_domain, u64BE(epoch), rules_root, x0, y0, ..., x3, y3).
// Registry order is fixed signer-index order; this function never sorts keys.
pub fn registry_commitment(registry: Registry) -> [u8; 32] {
    let mut message: [u8; 454] = [0; 454];
    // LIANUM/native-registry/secp256k1/2 (34 ASCII bytes).
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 114, 101, 103, 105, 115, 116, 114, 121, 47, 115, 101, 99, 112, 50, 53, 54, 107, 49, 47, 50]);
    // LIANUM_NATIVE_QUORUM_3_OF_4_SECP256K1_V2 (40 ASCII bytes).
    message = part(message, 38, [76, 73, 65, 78, 85, 77, 95, 78, 65, 84, 73, 86, 69, 95, 81, 85, 79, 82, 85, 77, 95, 51, 95, 79, 70, 95, 52, 95, 83, 69, 67, 80, 50, 53, 54, 75, 49, 95, 86, 50]);
    message = part(message, 82, registry.hub_domain);
    message = part(message, 118, u64_bytes(registry.epoch));
    message = part(message, 130, registry.rules_root);
    for i in 0..4 {
        message = part(message, 166 + i * 72, registry.keys_x[i]);
        message = part(message, 202 + i * 72, registry.keys_y[i]);
    }
    sha256::<454, 512>(message)
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

// All three checks use exactly the same caller-COMPUTED canonical digest.
// No key outside registry, threshold input, verified flag or host oracle exists.
pub fn assert_quorum(
    registry: Registry,
    expected_registry_commitment: [u8; 32],
    message_digest: [u8; 32],
    indexes: [u8; 3],
    signatures: [[u8; 64]; 3],
) {
    assert(registry_commitment(registry) == expected_registry_commitment);
    // Reject duplicate points AND sign-negated aliases, including an unused
    // fourth member. Trusted registry provisioning validates all four points;
    // each selected point is checked by the constrained ECDSA black box below.
    for i in 0..4 {
        for j in 0..4 {
            if j < i { assert(registry.keys_x[i] != registry.keys_x[j]); }
        }
    }
    assert(indexes[0] < indexes[1]);
    assert(indexes[1] < indexes[2]);
    for i in 0..3 {
        assert(indexes[i] < 4);
        assert_canonical_signature(signatures[i]);
        let index = indexes[i] as u32;
        assert(std::ecdsa_secp256k1::verify_signature(
            registry.keys_x[index], registry.keys_y[index], signatures[i], message_digest,
        ));
    }
}
