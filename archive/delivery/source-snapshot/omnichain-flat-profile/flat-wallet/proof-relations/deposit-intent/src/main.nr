// D27: owner authorization for a fixed type-4 balance note and absolute window.
// The pool checks actual time, backing, scope/policy and insertion uniqueness.
// This relation neither observes time nor proves delivery or native execution.
use generic_funding::framing::legacy_balance;
use graph_support::sha256::{sha256, u32_bytes, u64_bytes, words_to_bytes};

fn part<let N: u32>(buffer: [u8; 176], offset: u32, value: [u8; N]) -> [u8; 176] {
    let mut result = buffer;
    let length = u32_bytes(N);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..N { result[offset + 4 + i] = value[i]; }
    result
}

// H4: u32BE length on the exact ASCII tag and on every subsequent byte field.
// LIANUM/PAEG/deposit-intent/1, scope32, policy32, from8, until8, amount8, Q32.
fn intent_digest(
    scope: [u8; 32], policy: [u8; 32], valid_from: u64, valid_until: u64,
    amount: u64, output: [u8; 32],
) -> [u8; 32] {
    let mut message: [u8; 176] = [0; 176];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47,
        100, 101, 112, 111, 115, 105, 116, 45, 105, 110, 116, 101, 110, 116, 47, 49]);
    message = part(message, 32, scope);
    message = part(message, 68, policy);
    message = part(message, 104, u64_bytes(valid_from));
    message = part(message, 116, u64_bytes(valid_until));
    message = part(message, 128, u64_bytes(amount));
    message = part(message, 140, output);
    sha256::<176, 192>(message)
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

// Same scalar checks as the existing native quorum helper, local here so adding
// D27 does not mutate shared source identities or change any existing relation.
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
    assert(less_than(s, half_order) | (s == half_order));
}

fn main(
    scope: pub [u32; 8],
    policy: pub [u32; 8],
    valid_from: pub u64,
    valid_until: pub u64,
    amount: pub u64,
    output: pub [u32; 8],
    rho: [u8; 32],
    key_x: [u8; 32],
    key_y: [u8; 32],
    secret: [u8; 32],
    signature: [u8; 64],
) {
    assert(amount > 0);
    assert(valid_from < valid_until);
    let scope_bytes = words_to_bytes(scope);
    let policy_bytes = words_to_bytes(policy);
    // Original PC23/balance-note/1, original u16 tag framing, original type 4.
    // Using public amount here constrains the exact note value, with no second
    // amount or replacement note that can differ from the public output.
    let commitment = legacy_balance(scope_bytes, policy_bytes, rho, key_x, key_y, amount, secret);
    assert(commitment != [0; 32]);
    assert(commitment == words_to_bytes(output));
    assert_canonical_signature(signature);
    assert(std::ecdsa_secp256k1::verify_signature(key_x, key_y, signature,
        intent_digest(scope_bytes, policy_bytes, valid_from, valid_until, amount, words_to_bytes(output))));
}
