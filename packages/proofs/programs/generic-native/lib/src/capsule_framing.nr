// Exact H4 byte contract mirrored by src/paeg/native-capsules.mjs.
// Four-byte big-endian length prefixes include the tag and each flat tuple
// field. Digests are SHA256 bytes, never reduced field elements.
use graph_support::sha256::{sha256, u32_bytes, u64_bytes};
use crate::capsule::{LocalCapsule, DependencyCapsule, Action};

fn part<let N: u32, let M: u32>(buffer: [u8; N], offset: u32, value: [u8; M]) -> [u8; N] {
    let mut result = buffer;
    let length = u32_bytes(M);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..M { result[offset + 4 + i] = value[i]; }
    result
}

pub fn u128_bytes(value: u128) -> [u8; 16] {
    let mut bytes: [u8; 16] = [0; 16];
    for i in 0..16 { bytes[i] = ((value >> (((15 - i) * 8) as u128)) & 255) as u8; }
    bytes
}

// LIANUM/PAEG/a0-context/2; 703 framed bytes.
pub fn a0_context(
    digests: [[u8; 32]; 17],
    times: [u64; 3],
) -> [u8; 32] {
    let mut message: [u8; 703] = [0; 703];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 97, 48, 45, 99, 111, 110, 116, 101, 120, 116, 47, 50]);
    message = part(message, 28, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 70, 85, 78, 68, 69, 68, 95, 52, 95, 86, 49]);
    message = part(message, 55, digests[0]);
    message = part(message, 91, digests[1]);
    message = part(message, 127, digests[2]);
    message = part(message, 163, digests[3]);
    message = part(message, 199, digests[4]);
    message = part(message, 235, digests[5]);
    message = part(message, 271, digests[6]);
    message = part(message, 307, digests[7]);
    message = part(message, 343, digests[8]);
    message = part(message, 379, digests[9]);
    message = part(message, 415, digests[10]);
    message = part(message, 451, digests[11]);
    message = part(message, 487, digests[12]);
    message = part(message, 523, digests[13]);
    message = part(message, 559, digests[14]);
    message = part(message, 595, digests[15]);
    message = part(message, 631, digests[16]);
    message = part(message, 667, u64_bytes(times[0]));
    message = part(message, 679, u64_bytes(times[1]));
    message = part(message, 691, u64_bytes(times[2]));
    sha256::<703, 768>(message)
}

// LIANUM/PAEG/readiness-target/2; 174 framed bytes.
pub fn target_context(
    hub: [u8; 32],
    context: [u8; 32],
    slot: u8,
    salt: [u8; 32],
) -> [u8; 32] {
    let mut message: [u8; 174] = [0; 174];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 114, 101, 97, 100, 105, 110, 101, 115, 115, 45, 116, 97, 114, 103, 101, 116, 47, 50]);
    message = part(message, 34, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 61, hub);
    message = part(message, 97, context);
    message = part(message, 133, [slot]);
    message = part(message, 138, salt);
    sha256::<174, 192>(message)
}

// LIANUM/PAEG/receipt-key/2; 101 framed bytes.
pub fn receipt_key(
    hub: [u8; 32],
    nk: [u8; 32],
) -> [u8; 32] {
    let mut message: [u8; 101] = [0; 101];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 114, 101, 99, 101, 105, 112, 116, 45, 107, 101, 121, 47, 50]);
    message = part(message, 29, hub);
    message = part(message, 65, nk);
    sha256::<101, 128>(message)
}

// LIANUM/PAEG/unused-receipt-spend/2; 151 framed bytes.
pub fn unused_receipt_spend(
    hub: [u8; 32],
    reserve_nf: [u8; 32],
    graph_nonce: [u8; 32],
    slot: u8,
) -> [u8; 32] {
    let mut message: [u8; 151] = [0; 151];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 117, 110, 117, 115, 101, 100, 45, 114, 101, 99, 101, 105, 112, 116, 45, 115, 112, 101, 110, 100, 47, 50]);
    message = part(message, 38, hub);
    message = part(message, 74, reserve_nf);
    message = part(message, 110, graph_nonce);
    message = part(message, 146, [slot]);
    sha256::<151, 192>(message)
}

// LIANUM/PAEG/local-capsule/2; 608 framed bytes.
pub fn local_capsule(
    hub: [u8; 32],
    registry: [u8; 32],
    context: [u8; 32],
    capsule: LocalCapsule,
) -> [u8; 32] {
    let mut message: [u8; 608] = [0; 608];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 108, 111, 99, 97, 108, 45, 99, 97, 112, 115, 117, 108, 101, 47, 50]);
    message = part(message, 31, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 58, hub);
    message = part(message, 94, registry);
    message = part(message, 130, context);
    message = part(message, 166, [capsule.slot]);
    message = part(message, 171, [capsule.active as u8]);
    message = part(message, 176, capsule.target_context);
    message = part(message, 212, capsule.node_commitment);
    message = part(message, 248, capsule.local_commitment);
    message = part(message, 284, capsule.dispatch_id);
    message = part(message, 320, capsule.chain_domain);
    message = part(message, 356, capsule.evidence_policy);
    message = part(message, 392, capsule.action_commitment);
    message = part(message, 428, capsule.payout_commitment);
    message = part(message, 464, capsule.receipt_key_commitment);
    message = part(message, 500, capsule.receipt_rho);
    message = part(message, 536, capsule.dummy_terminal_tag);
    message = part(message, 572, capsule.capsule_salt);
    sha256::<608, 640>(message)
}

// LIANUM/PAEG/dependency-capsule/2; 1240 framed bytes.
pub fn dependency_capsule(
    hub: [u8; 32],
    registry: [u8; 32],
    context: [u8; 32],
    capsule: DependencyCapsule,
) -> [u8; 32] {
    let mut message: [u8; 1240] = [0; 1240];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 100, 101, 112, 101, 110, 100, 101, 110, 99, 121, 45, 99, 97, 112, 115, 117, 108, 101, 47, 50]);
    message = part(message, 36, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 63, hub);
    message = part(message, 99, registry);
    message = part(message, 135, context);
    message = part(message, 171, [capsule.target_slot]);
    message = part(message, 176, capsule.target_context);
    message = part(message, 212, [capsule.dependency_count]);
    message = part(message, 217, [capsule.predecessors[0].source_slot]);
    message = part(message, 222, capsule.predecessors[0].source_node_commitment);
    message = part(message, 258, capsule.predecessors[0].source_local_commitment);
    message = part(message, 294, capsule.predecessors[0].source_dispatch_id);
    message = part(message, 330, capsule.predecessors[0].chain_domain);
    message = part(message, 366, capsule.predecessors[0].evidence_policy);
    message = part(message, 402, capsule.predecessors[0].action_commitment);
    message = part(message, 438, capsule.predecessors[0].payout_commitment);
    message = part(message, 474, capsule.predecessors[0].receipt_key_commitment);
    message = part(message, 510, capsule.predecessors[0].receipt_rho);
    message = part(message, 546, [capsule.predecessors[1].source_slot]);
    message = part(message, 551, capsule.predecessors[1].source_node_commitment);
    message = part(message, 587, capsule.predecessors[1].source_local_commitment);
    message = part(message, 623, capsule.predecessors[1].source_dispatch_id);
    message = part(message, 659, capsule.predecessors[1].chain_domain);
    message = part(message, 695, capsule.predecessors[1].evidence_policy);
    message = part(message, 731, capsule.predecessors[1].action_commitment);
    message = part(message, 767, capsule.predecessors[1].payout_commitment);
    message = part(message, 803, capsule.predecessors[1].receipt_key_commitment);
    message = part(message, 839, capsule.predecessors[1].receipt_rho);
    message = part(message, 875, [capsule.predecessors[2].source_slot]);
    message = part(message, 880, capsule.predecessors[2].source_node_commitment);
    message = part(message, 916, capsule.predecessors[2].source_local_commitment);
    message = part(message, 952, capsule.predecessors[2].source_dispatch_id);
    message = part(message, 988, capsule.predecessors[2].chain_domain);
    message = part(message, 1024, capsule.predecessors[2].evidence_policy);
    message = part(message, 1060, capsule.predecessors[2].action_commitment);
    message = part(message, 1096, capsule.predecessors[2].payout_commitment);
    message = part(message, 1132, capsule.predecessors[2].receipt_key_commitment);
    message = part(message, 1168, capsule.predecessors[2].receipt_rho);
    message = part(message, 1204, capsule.capsule_salt);
    sha256::<1240, 1280>(message)
}

// LIANUM/PAEG/native-transfer-action/2; 452 framed bytes.
pub fn native_transfer_action(
    action: Action,
) -> [u8; 32] {
    let mut message: [u8; 452] = [0; 452];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 116, 114, 97, 110, 115, 102, 101, 114, 45, 97, 99, 116, 105, 111, 110, 47, 50]);
    message = part(message, 40, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50]);
    message = part(message, 67, action.chain_domain);
    message = part(message, 103, action.signer_identity);
    message = part(message, 139, action.source_commitment);
    message = part(message, 175, action.destination_commitment);
    message = part(message, 211, u128_bytes(action.amount));
    message = part(message, 231, [action.custody_kind]);
    message = part(message, 236, action.custody_commitment);
    message = part(message, 272, u64_bytes(action.execution_from));
    message = part(message, 284, u64_bytes(action.execution_until));
    message = part(message, 296, u64_bytes(action.settle_before));
    message = part(message, 308, action.receipt_key_commitment);
    message = part(message, 344, action.receipt_rho);
    message = part(message, 380, action.delivery_risk_commitment);
    message = part(message, 416, action.action_salt);
    sha256::<452, 512>(message)
}


