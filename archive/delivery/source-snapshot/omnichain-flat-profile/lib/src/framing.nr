// Fixed, byte-exact H4 encodings from src/framing.mjs.
// Each part is u32BE(length) || bytes, including ASCII tags and profile.
// Struct integer types enforce their width; u64 values encode in big endian.
// Stable receipt primitives intentionally have no flat profile component.
use graph_support::sha256::{sha256, u32_bytes, u64_bytes};
use crate::types::{Domain, Core, Local, Completion};

fn part<let N: u32, let M: u32>(buffer: [u8; N], offset: u32, value: [u8; M]) -> [u8; N] {
    assert(offset + 4 + M <= N);
    let mut result = buffer;
    let length = u32_bytes(M);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..M { result[offset + 4 + i] = value[i]; }
    result
}

// 306 H4-framed bytes, SHA-256 padded to 320 bytes.
pub fn domain_commitment(
    domain: Domain,
) -> [u8; 32] {
    assert(domain.scope != [0; 32]);
    assert(domain.policy != [0; 32]);
    assert(domain.asset != [0; 32]);
    assert(domain.hub_domain != [0; 32]);
    assert(domain.registry_commitment != [0; 32]);
    assert(domain.verifier_set_commitment != [0; 32]);
    assert(domain.ledger_namespace != [0; 32]);
    let mut message: [u8; 306] = [0; 306];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 102, 108, 97, 116, 47, 100, 111, 109, 97, 105, 110, 47, 49]); // ASCII "LIANUM/PAEG/flat/domain/1": 25 bytes
    message = part(message, 29, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 70, 76, 65, 84, 95, 52, 95, 86, 49]); // ASCII "LIANUM_PAEG_FLAT_4_V1": 21 bytes
    message = part(message, 54, domain.scope); // domain.scope: 32 bytes
    message = part(message, 90, domain.policy); // domain.policy: 32 bytes
    message = part(message, 126, domain.asset); // domain.asset: 32 bytes
    message = part(message, 162, domain.hub_domain); // domain.hub_domain: 32 bytes
    message = part(message, 198, domain.registry_commitment); // domain.registry_commitment: 32 bytes
    message = part(message, 234, domain.verifier_set_commitment); // domain.verifier_set_commitment: 32 bytes
    message = part(message, 270, domain.ledger_namespace); // domain.ledger_namespace: 32 bytes
    sha256::<306, 320>(message)
}

// 263 H4-framed bytes, SHA-256 padded to 320 bytes.
pub fn core_leaf(
    domain: [u8; 32],
    core: Core,
    blind: [u8; 32],
) -> [u8; 32] {
    assert(domain != [0; 32]);
    assert(blind != [0; 32]);
    assert(core.settle_before > 0);
    let mut message: [u8; 263] = [0; 263];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 102, 108, 97, 116, 47, 101, 110, 118, 101, 108, 111, 112, 101, 45, 108, 101, 97, 102, 47, 49]); // ASCII "LIANUM/PAEG/flat/envelope-leaf/1": 32 bytes
    message = part(message, 36, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 70, 76, 65, 84, 95, 52, 95, 86, 49]); // ASCII "LIANUM_PAEG_FLAT_4_V1": 21 bytes
    message = part(message, 61, domain); // domain: 32 bytes
    message = part(message, 97, [0]); // leaf index 0: 1 bytes
    message = part(message, 102, [0]); // Core kind 0: 1 bytes
    message = part(message, 107, blind); // blind: 32 bytes
    message = part(message, 143, core.context); // core.context: 32 bytes
    message = part(message, 179, core.reserve_commitment); // core.reserve_commitment: 32 bytes
    message = part(message, 215, core.reserve_nullifier); // core.reserve_nullifier: 32 bytes
    message = part(message, 251, u64_bytes(core.settle_before)); // core.settle_before: 8 bytes
    sha256::<263, 320>(message)
}

// 621 H4-framed bytes, SHA-256 padded to 640 bytes.
pub fn local_leaf(
    domain: [u8; 32],
    local: Local,
    blind: [u8; 32],
) -> [u8; 32] {
    assert(domain != [0; 32]);
    assert(blind != [0; 32]);
    assert(local.slot < 4);
    let index: u8 = 4 + local.slot;
    let mut message: [u8; 621] = [0; 621];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 102, 108, 97, 116, 47, 101, 110, 118, 101, 108, 111, 112, 101, 45, 108, 101, 97, 102, 47, 49]); // ASCII "LIANUM/PAEG/flat/envelope-leaf/1": 32 bytes
    message = part(message, 36, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 70, 76, 65, 84, 95, 52, 95, 86, 49]); // ASCII "LIANUM_PAEG_FLAT_4_V1": 21 bytes
    message = part(message, 61, domain); // domain: 32 bytes
    message = part(message, 97, [index]); // leaf index 4 + local.slot: 1 bytes
    message = part(message, 102, [4]); // Local kind 4: 1 bytes
    message = part(message, 107, blind); // blind: 32 bytes
    message = part(message, 143, [local.slot]); // local.slot: 1 bytes
    message = part(message, 148, [local.active as u8]); // local.active: 1 bytes
    message = part(message, 153, local.target_context); // local.target_context: 32 bytes
    message = part(message, 189, local.node_commitment); // local.node_commitment: 32 bytes
    message = part(message, 225, local.local_commitment); // local.local_commitment: 32 bytes
    message = part(message, 261, local.dispatch_id); // local.dispatch_id: 32 bytes
    message = part(message, 297, local.chain_domain); // local.chain_domain: 32 bytes
    message = part(message, 333, local.evidence_policy); // local.evidence_policy: 32 bytes
    message = part(message, 369, local.action_commitment); // local.action_commitment: 32 bytes
    message = part(message, 405, local.payout_commitment); // local.payout_commitment: 32 bytes
    message = part(message, 441, local.receipt_key_commitment); // local.receipt_key_commitment: 32 bytes
    message = part(message, 477, local.receipt_rho); // local.receipt_rho: 32 bytes
    message = part(message, 513, local.dummy_terminal_tag); // local.dummy_terminal_tag: 32 bytes
    message = part(message, 549, local.capsule_salt); // local.capsule_salt: 32 bytes
    message = part(message, 585, local.target_join_blind); // local.target_join_blind: 32 bytes
    sha256::<621, 640>(message)
}

// 419 H4-framed bytes, SHA-256 padded to 448 bytes.
pub fn completion_commitment(
    domain: [u8; 32],
    envelope: [u8; 32],
    statement: Completion,
    blind: [u8; 32],
) -> [u8; 32] {
    assert(domain != [0; 32]);
    assert(envelope != [0; 32]);
    assert(blind != [0; 32]);
    assert(statement.slot < 4);
    assert(statement.valid_from < statement.valid_until);
    let mut message: [u8; 419] = [0; 419];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 102, 108, 97, 116, 47, 99, 111, 109, 112, 108, 101, 116, 105, 111, 110, 45, 111, 112, 101, 110, 105, 110, 103, 47, 49]); // ASCII "LIANUM/PAEG/flat/completion-opening/1": 37 bytes
    message = part(message, 41, [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 70, 76, 65, 84, 95, 52, 95, 86, 49]); // ASCII "LIANUM_PAEG_FLAT_4_V1": 21 bytes
    message = part(message, 66, domain); // domain: 32 bytes
    message = part(message, 102, envelope); // envelope: 32 bytes
    message = part(message, 138, blind); // blind: 32 bytes
    message = part(message, 174, statement.hub_domain); // statement.hub_domain: 32 bytes
    message = part(message, 210, statement.registry_commitment); // statement.registry_commitment: 32 bytes
    message = part(message, 246, statement.evidence_state); // statement.evidence_state: 32 bytes
    message = part(message, 282, statement.context); // statement.context: 32 bytes
    message = part(message, 318, statement.payout_commitment); // statement.payout_commitment: 32 bytes
    message = part(message, 354, statement.terminal_receipt_tag); // statement.terminal_receipt_tag: 32 bytes
    message = part(message, 390, [statement.slot]); // statement.slot: 1 bytes
    message = part(message, 395, u64_bytes(statement.valid_from)); // statement.valid_from: 8 bytes
    message = part(message, 407, u64_bytes(statement.valid_until)); // statement.valid_until: 8 bytes
    sha256::<419, 448>(message)
}

// 101 H4-framed bytes, SHA-256 padded to 128 bytes.
pub fn receipt_key_commitment(
    ledger_namespace: [u8; 32],
    secret: [u8; 32],
) -> [u8; 32] {
    assert(ledger_namespace != [0; 32]);
    assert(secret != [0; 32]);
    let mut message: [u8; 101] = [0; 101];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 114, 101, 99, 101, 105, 112, 116, 45, 107, 101, 121, 47, 50]); // ASCII "LIANUM/PAEG/receipt-key/2": 25 bytes
    message = part(message, 29, ledger_namespace); // ledger_namespace: 32 bytes
    message = part(message, 65, secret); // secret: 32 bytes
    sha256::<101, 128>(message)
}

// 139 H4-framed bytes, SHA-256 padded to 192 bytes.
pub fn terminal_receipt_tag(
    ledger_namespace: [u8; 32],
    secret: [u8; 32],
    receipt_commitment: [u8; 32],
) -> [u8; 32] {
    assert(ledger_namespace != [0; 32]);
    assert(secret != [0; 32]);
    assert(receipt_commitment != [0; 32]);
    let mut message: [u8; 139] = [0; 139];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 114, 101, 99, 101, 105, 112, 116, 45, 115, 112, 101, 110, 100, 47, 50]); // ASCII "LIANUM/PAEG/receipt-spend/2": 27 bytes
    message = part(message, 31, ledger_namespace); // ledger_namespace: 32 bytes
    message = part(message, 67, secret); // secret: 32 bytes
    message = part(message, 103, receipt_commitment); // receipt_commitment: 32 bytes
    sha256::<139, 192>(message)
}

