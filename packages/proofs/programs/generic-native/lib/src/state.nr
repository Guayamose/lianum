// Byte-exact state commitments and bounded-set/Merkle constraints.
// These relations do not authenticate a host read or independently establish
// cross-chain consensus. Consumers must bind these digests to hub-authenticated
// state and enforce current sequences, registry identity and halt status.
use graph_support::sha256::{sha256, u32_bytes, u64_bytes};

pub struct EvidenceState {
    pub hub_domain: [u8; 32],
    pub registry_commitment: [u8; 32],
    pub receipt_root: [u8; 32],
    pub receipt_count: u32,
    pub revoked_digest: [u8; 32],
    pub revoked_count: u32,
    pub revocation_sequence: u64,
}

pub struct Snapshot {
    pub hub_domain: [u8; 32],
    pub registry_commitment: [u8; 32],
    pub pool: [u8; 20],
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub asset_identity: [u8; 32],
    pub pool_root: [u8; 32],
    pub pool_spent_digest: [u8; 32],
    pub pool_spent_count: u32,
    pub pool_state_sequence: u64,
    pub receipt_root: [u8; 32],
    pub receipt_count: u32,
    pub spent_tag_digest: [u8; 32],
    pub spent_tag_count: u32,
    pub spent_tag_sequence: u64,
    pub revoked_digest: [u8; 32],
    pub revoked_count: u32,
    pub revocation_sequence: u64,
    pub hub_state_sequence: u64,
    pub registry_epoch: u64,
    pub halt: u8,
    pub timestamp: u64,
}

fn part<let N: u32, let M: u32>(buffer: [u8; N], offset: u32, value: [u8; M]) -> [u8; N] {
    let mut result = buffer;
    let length = u32_bytes(M);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..M { result[offset + 4 + i] = value[i]; }
    result
}

// Every component, including the tag, is length-prefixed u32BE. No profile
// component is implicit. Counts fit the canonical 64-slot state format.
pub fn evidence_state_digest(state: EvidenceState) -> [u8; 32] {
    assert(state.receipt_count <= 64);
    assert(state.revoked_count <= 64);
    let mut message: [u8; 204] = [0; 204];
    // LIANUM/PAEG/evidence-state/2 (28 bytes).
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 101, 118, 105, 100, 101, 110, 99, 101, 45, 115, 116, 97, 116, 101, 47, 50]);
    message = part(message, 32, state.hub_domain);
    message = part(message, 68, state.registry_commitment);
    message = part(message, 104, state.receipt_root);
    message = part(message, 140, u32_bytes(state.receipt_count));
    message = part(message, 148, state.revoked_digest);
    message = part(message, 184, u32_bytes(state.revoked_count));
    message = part(message, 192, u64_bytes(state.revocation_sequence));
    sha256::<204, 256>(message)
}

pub fn snapshot_digest(snapshot: Snapshot) -> [u8; 32] {
    assert(snapshot.pool_spent_count <= 64);
    assert(snapshot.receipt_count <= 64);
    assert(snapshot.spent_tag_count <= 64);
    assert(snapshot.revoked_count <= 64);
    assert(snapshot.halt <= 1);
    let mut message: [u8; 521] = [0; 521];
    // LIANUM/PAEG/checkpoint/2 (24 bytes).
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 99, 104, 101, 99, 107, 112, 111, 105, 110, 116, 47, 50]);
    message = part(message, 28, snapshot.hub_domain);
    message = part(message, 64, snapshot.registry_commitment);
    message = part(message, 100, snapshot.pool);
    message = part(message, 124, snapshot.scope);
    message = part(message, 160, snapshot.policy);
    message = part(message, 196, snapshot.asset_identity);
    message = part(message, 232, snapshot.pool_root);
    message = part(message, 268, snapshot.pool_spent_digest);
    message = part(message, 304, u32_bytes(snapshot.pool_spent_count));
    message = part(message, 312, u64_bytes(snapshot.pool_state_sequence));
    message = part(message, 324, snapshot.receipt_root);
    message = part(message, 360, u32_bytes(snapshot.receipt_count));
    message = part(message, 368, snapshot.spent_tag_digest);
    message = part(message, 404, u32_bytes(snapshot.spent_tag_count));
    message = part(message, 412, u64_bytes(snapshot.spent_tag_sequence));
    message = part(message, 424, snapshot.revoked_digest);
    message = part(message, 460, u32_bytes(snapshot.revoked_count));
    message = part(message, 468, u64_bytes(snapshot.revocation_sequence));
    message = part(message, 480, u64_bytes(snapshot.hub_state_sequence));
    message = part(message, 492, u64_bytes(snapshot.registry_epoch));
    message = part(message, 504, [snapshot.halt]);
    message = part(message, 509, u64_bytes(snapshot.timestamp));
    sha256::<521, 576>(message)
}

// SHA256(prefix:u8 || domain32 || count:u32BE || 64*entry32), 2085 bytes.
// Types 0x02/0x31/0x32 are pool nullifiers, spent receipt tags and revoked GIDs.
// All constraints apply even when this helper is used outside assert_absent.
pub fn bounded_list_digest(
    prefix: u8,
    domain: [u8; 32],
    entries: [[u8; 32]; 64],
    count: u32,
) -> [u8; 32] {
    assert((prefix == 0x02) | (prefix == 0x31) | (prefix == 0x32));
    assert(count <= 64);
    let mut message: [u8; 2085] = [0; 2085];
    message[0] = prefix;
    for i in 0..32 { message[1 + i] = domain[i]; }
    let count_bytes = u32_bytes(count);
    for i in 0..4 { message[33 + i] = count_bytes[i]; }
    for i in 0..64 {
        if i < count {
            assert(entries[i] != [0; 32]);
            for j in 0..64 {
                if j < i { assert(entries[i] != entries[j]); }
            }
        } else { assert(entries[i] == [0; 32]); }
        for j in 0..32 { message[37 + i * 32 + j] = entries[i][j]; }
    }
    sha256::<2085, 2112>(message)
}

pub fn assert_absent(
    prefix: u8,
    domain: [u8; 32],
    entries: [[u8; 32]; 64],
    count: u32,
    expected_digest: [u8; 32],
    target: [u8; 32],
) {
    assert(target != [0; 32]);
    // The witness cannot replace a fresh canonical digest with a host flag.
    assert(bounded_list_digest(prefix, domain, entries, count) == expected_digest);
    for i in 0..64 {
        if i < count { assert(entries[i] != target); }
    }
}

pub fn node_hash(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let mut message: [u8; 65] = [0; 65];
    message[0] = 1;
    for i in 0..32 { message[1 + i] = left[i]; message[33 + i] = right[i]; }
    sha256::<65, 128>(message)
}

// The zero32 leaf is padding and may never establish live membership. Position
// is range-constrained before deriving its six direction bits; no truncation.
pub fn membership(commitment: [u8; 32], siblings: [[u8; 32]; 6], index: u32, root: [u8; 32]) {
    assert(index < 64);
    assert(commitment != [0; 32]);
    let mut current = commitment;
    for depth in 0..6 {
        current = if ((index >> depth) & 1) == 0 {
            node_hash(current, siblings[depth])
        } else {
            node_hash(siblings[depth], current)
        };
    }
    assert(current == root);
}
