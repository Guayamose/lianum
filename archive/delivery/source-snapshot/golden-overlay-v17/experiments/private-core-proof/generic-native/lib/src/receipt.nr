// Byte-exact native receipt and effect identity relations. These helpers bind
// bytes; they do not establish a native fact, registered rules, finality, or
// admission. Admission authenticates the local terms through the deployed
// registry relation. Its local commitment already binds the graph/node terms.
use graph_support::sha256::{sha256, sha256_bounded, u32_bytes, u64_bytes};

// Read actors receive no spend secret. There is no extra context, node
// commitment, pool salt, or actor-selected input in the receipt wire contract.
pub struct ReceiptRead {
    pub hub_domain: [u8; 32],
    pub registry_commitment: [u8; 32],
    pub global_effect_id: [u8; 32],
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub local_commitment: [u8; 32],
    pub dispatch_id: [u8; 32],
    pub chain_domain: [u8; 32],
    pub evidence_policy: [u8; 32],
    pub action_commitment: [u8; 32],
    pub payout_commitment: [u8; 32],
    pub valid_from: u64,
    pub valid_until: u64,
    pub receipt_key_commitment: [u8; 32],
    pub receipt_rho: [u8; 32],
}

// 1 = BTC, 2 = SOL, 3 = EVM, 4 = TRON. BTC/EVM/TRON use their raw
// 32-byte transaction ID followed by canonical zero padding; SOL uses the full
// 64-byte transaction signature. The family does not authenticate chain truth.
pub struct NativeEffect {
    pub family: u8,
    pub genesis: [u8; 32],
    pub asset: [u8; 32],
    pub transaction_id: [u8; 64],
    pub effect_index: u32,
}

fn part<let N: u32, let M: u32>(buffer: [u8; N], offset: u32, value: [u8; M]) -> [u8; N] {
    let mut result = buffer;
    let length = u32_bytes(M);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..M { result[offset + 4 + i] = value[i]; }
    result
}

// Dynamic-length fields are copied at their actual length. Both input padding
// here and the final message padding in sha256_bounded are constrained to zero.
fn bounded_part<let N: u32, let M: u32>(
    buffer: [u8; N], offset: u32, value: [u8; M], length: u32,
) -> [u8; N] {
    assert(length <= M);
    assert(offset + 4 + length <= N);
    let mut result = buffer;
    let length_bytes = u32_bytes(length);
    for i in 0..4 { result[offset + i] = length_bytes[i]; }
    for i in 0..M {
        if i < length { result[offset + 4 + i] = value[i]; }
        else { assert(value[i] == 0); }
    }
    result
}

fn validate_read(read: ReceiptRead) {
    assert(read.hub_domain != [0; 32]);
    assert(read.registry_commitment != [0; 32]);
    assert(read.global_effect_id != [0; 32]);
    assert(read.scope != [0; 32]);
    assert(read.policy != [0; 32]);
    assert(read.local_commitment != [0; 32]);
    assert(read.dispatch_id != [0; 32]);
    assert(read.chain_domain != [0; 32]);
    assert(read.evidence_policy != [0; 32]);
    assert(read.action_commitment != [0; 32]);
    assert(read.payout_commitment != [0; 32]);
    assert(read.receipt_key_commitment != [0; 32]);
    assert(read.receipt_rho != [0; 32]);
    // A positive-duration half-open interval [valid_from, valid_until).
    // Checking a particular consumption time belongs to the consuming relation.
    assert(read.valid_from < read.valid_until);
}

// H4 means u32BE length on every component, including the domain tag.
// The 11 digest fields are flat and in RECEIPT_HASH_FIELDS order.
pub fn receipt_commitment(read: ReceiptRead) -> [u8; 32] {
    validate_read(read);
    let mut message: [u8; 551] = [0; 551];
    // LIANUM/PAEG/native-receipt/2, then LIANUM_PAEG_NATIVE_4_V2.
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 114, 101, 99, 101, 105, 112, 116, 47, 50]);
    message = part(message, 32, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 59, read.hub_domain);
    message = part(message, 95, read.registry_commitment);
    message = part(message, 131, read.global_effect_id);
    message = part(message, 167, read.scope);
    message = part(message, 203, read.policy);
    message = part(message, 239, read.local_commitment);
    message = part(message, 275, read.dispatch_id);
    message = part(message, 311, read.chain_domain);
    message = part(message, 347, read.evidence_policy);
    message = part(message, 383, read.action_commitment);
    message = part(message, 419, read.payout_commitment);
    message = part(message, 455, u64_bytes(read.valid_from));
    message = part(message, 467, u64_bytes(read.valid_until));
    message = part(message, 479, read.receipt_key_commitment);
    message = part(message, 515, read.receipt_rho);
    sha256::<551, 576>(message)
}

pub fn receipt_key_commitment(hub_domain: [u8; 32], nk: [u8; 32]) -> [u8; 32] {
    assert(hub_domain != [0; 32]);
    assert(nk != [0; 32]);
    let mut message: [u8; 101] = [0; 101];
    // LIANUM/PAEG/receipt-key/2.
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 114, 101, 99, 101, 105, 112, 116, 45, 107, 101, 121, 47, 50]);
    message = part(message, 29, hub_domain);
    message = part(message, 65, nk);
    sha256::<101, 128>(message)
}

pub fn receipt_nullifier(read: ReceiptRead, nk: [u8; 32]) -> [u8; 32] {
    assert(receipt_key_commitment(read.hub_domain, nk) == read.receipt_key_commitment);
    let commitment = receipt_commitment(read);
    // The host digest validator also rejects a zero commitment at this step.
    assert(commitment != [0; 32]);
    let mut message: [u8; 139] = [0; 139];
    // LIANUM/PAEG/receipt-spend/2.
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 114, 101, 99, 101, 105, 112, 116, 45, 115, 112, 101, 110, 100, 47, 50]);
    message = part(message, 31, read.hub_domain);
    message = part(message, 67, nk);
    message = part(message, 103, commitment);
    sha256::<139, 192>(message)
}

// Canonical ASCII decimal for the full u32 range, including exactly "0" for
// zero and "4294967295" for u32::MAX. Unused bytes are zero, not ASCII '0'.
pub fn effect_index_ascii(value: u32) -> ([u8; 10], u32) {
    let mut reversed: [u8; 10] = [0; 10];
    let mut remaining = value;
    let mut length: u32 = 1;
    for i in 0..10 {
        reversed[i] = (remaining % 10) as u8 + 48;
        remaining = remaining / 10;
        if remaining > 0 { length = i + 2; }
    }
    assert(remaining == 0);
    assert((length >= 1) & (length <= 10));
    let mut encoded: [u8; 10] = [0; 10];
    // Constant indices avoid underflow/out-of-range indexing in inactive arms.
    for i in 0..10 {
        for j in 0..10 {
            if i + j + 1 == length { encoded[i] = reversed[j]; }
        }
        if i >= length { assert(encoded[i] == 0); }
    }
    (encoded, length)
}

fn chain_frame(effect: NativeEffect) -> ([u8; 107], u32) {
    assert((effect.family >= 1) & (effect.family <= 4));
    let label: [u8; 4] = if effect.family == 1 { [66, 84, 67, 0] }
        else if effect.family == 2 { [83, 79, 76, 0] }
        else if effect.family == 3 { [69, 86, 77, 0] }
        else { [84, 82, 79, 78] };
    let label_length: u32 = if effect.family == 4 { 4 } else { 3 };
    let mut message: [u8; 107] = [0; 107];
    // LIANUM/evidence-chain/1. Legacy GIDs embed this FRAME, not its hash.
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 101, 118, 105, 100, 101, 110, 99, 101, 45, 99, 104, 97, 105, 110, 47, 49]);
    message = bounded_part(message, 27, label, label_length);
    message = part(message, 31 + label_length, effect.genesis);
    message = part(message, 67 + label_length, effect.asset);
    (message, 103 + label_length)
}

// Byte-matches canonicalGlobalEffectId for BTC/SOL/EVM and extends the same
// framing to TRON. No field reduction, policy salt, pool, owner or registry
// enters the global identity. Shared-hub consumption is enforced elsewhere.
pub fn native_global_effect_id(effect: NativeEffect) -> [u8; 32] {
    let (domain, domain_length) = chain_frame(effect);
    let transaction_length: u32 = if effect.family == 2 { 64 } else { 32 };
    let (index, index_length) = effect_index_ascii(effect.effect_index);
    // 226 bounds every component maximum; the longest valid family is SOL
    // (225 bytes). Hash exactly the actual bytes, never the fixed-array tail.
    let mut message: [u8; 226] = [0; 226];
    // LIANUM/native-global-effect/1.
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 103, 108, 111, 98, 97, 108, 45, 101, 102, 102, 101, 99, 116, 47, 49]);
    message = bounded_part(message, 33, domain, domain_length);
    message = bounded_part(message, 37 + domain_length, effect.transaction_id, transaction_length);
    message = bounded_part(message, 41 + domain_length + transaction_length, index, index_length);
    sha256_bounded::<226, 256>(message, 45 + domain_length + transaction_length + index_length)
}
