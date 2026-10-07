// Byte-exact H4: u32BE length prefix on the tag and each raw field.
// All B32 inputs retain all bytes. Existing K/N and Poseidon purposes live in
// their original libraries and are deliberately not reimplemented here.
use graph_support::sha256::{sha256, u32_bytes, u64_bytes};
use crate::types::{ClaimConfig, ClaimTicket};

fn part<let N: u32, let M: u32>(buffer: [u8; N], offset: u32, value: [u8; M]) -> [u8; N] {
    assert(offset + 4 + M <= N);
    let mut result = buffer;
    let length = u32_bytes(M);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..M { result[offset + 4 + i] = value[i]; }
    result
}

// LIANUM/PAEG/native-claim-domain/1; exact 834-byte H4 frame.
pub fn claim_domain(config: ClaimConfig) -> [u8; 32] {
    let mut message: [u8; 834] = [0; 834];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 100, 111, 109, 97, 105, 110, 47, 49]);
    message = part(message, 37, config.evm_chain_id);
    message = part(message, 73, config.evm_genesis);
    message = part(message, 109, config.gateway);
    message = part(message, 133, config.gateway_code_hash);
    message = part(message, 169, config.wrapper);
    message = part(message, 193, config.wrapper_code_hash);
    message = part(message, 229, config.pool);
    message = part(message, 253, config.pool_code_hash);
    message = part(message, 289, config.pool_domain);
    message = part(message, 325, config.scope);
    message = part(message, 361, config.policy);
    message = part(message, 397, config.wrapper_asset_identity);
    message = part(message, 433, config.hub);
    message = part(message, 457, config.hub_code_hash);
    message = part(message, 493, config.hub_domain);
    message = part(message, 529, config.ledger_namespace);
    message = part(message, 565, config.registry_commitment);
    message = part(message, 601, config.claim_verifier_set_commitment);
    message = part(message, 637, [config.native_family]);
    message = part(message, 642, config.native_genesis);
    message = part(message, 678, config.native_asset);
    message = part(message, 714, config.native_rule_commitment);
    message = part(message, 750, config.escrow_endpoint_commitment);
    message = part(message, 786, config.custody_inventory_domain);
    message = part(message, 822, u64_bytes(config.refund_max_fee));
    sha256::<834, 896>(message)
}

// LIANUM/PAEG/native-claim-receipt-secret/1; exact 153-byte H4 frame.
pub fn receipt_secret(claim_domain: [u8; 32], note_secret: [u8; 32], output_q: [u8; 32]) -> [u8; 32] {
    let mut message: [u8; 153] = [0; 153];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 114, 101, 99, 101, 105, 112, 116, 45, 115, 101, 99, 114, 101, 116, 47, 49]);
    message = part(message, 45, claim_domain);
    message = part(message, 81, note_secret);
    message = part(message, 117, output_q);
    sha256::<153, 192>(message)
}

// LIANUM/PAEG/native-claim-refund-salt/1; exact 150-byte H4 frame.
pub fn refund_salt(claim_domain: [u8; 32], note_secret: [u8; 32], output_q: [u8; 32]) -> [u8; 32] {
    let mut message: [u8; 150] = [0; 150];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 114, 101, 102, 117, 110, 100, 45, 115, 97, 108, 116, 47, 49]);
    message = part(message, 42, claim_domain);
    message = part(message, 78, note_secret);
    message = part(message, 114, output_q);
    sha256::<150, 192>(message)
}

// LIANUM/PAEG/native-claim-destination/1; exact 210-byte H4 frame.
pub fn destination_commitment(
    claim_domain: [u8; 32], native_chain_domain: [u8; 32], endpoint: [u8; 32],
    amount: u64, max_fee: u64, salt: [u8; 32],
) -> [u8; 32] {
    let mut message: [u8; 210] = [0; 210];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 100, 101, 115, 116, 105, 110, 97, 116, 105, 111, 110, 47, 49]);
    message = part(message, 42, claim_domain);
    message = part(message, 78, native_chain_domain);
    message = part(message, 114, endpoint);
    message = part(message, 150, u64_bytes(amount));
    message = part(message, 162, u64_bytes(max_fee));
    message = part(message, 174, salt);
    sha256::<210, 256>(message)
}

// LIANUM/PAEG/native-claim-ingress-receipt/1; exact 202-byte H4 frame.
pub fn ingress_receipt_commitment(
    claim_domain: [u8; 32], output_q: [u8; 32], amount: u64,
    admission_n: [u8; 32], refund_destination: [u8; 32],
) -> [u8; 32] {
    let mut message: [u8; 202] = [0; 202];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 105, 110, 103, 114, 101, 115, 115, 45, 114, 101, 99, 101, 105, 112, 116, 47, 49]);
    message = part(message, 46, claim_domain);
    message = part(message, 82, output_q);
    message = part(message, 118, u64_bytes(amount));
    message = part(message, 130, admission_n);
    message = part(message, 166, refund_destination);
    sha256::<202, 256>(message)
}

// LIANUM/PAEG/native-claim-intent/1; exact 121-byte H4 frame.
pub fn claim_intent_id(claim_domain: [u8; 32], output_q: [u8; 32], amount: u64) -> [u8; 32] {
    let mut message: [u8; 121] = [0; 121];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 105, 110, 116, 101, 110, 116, 47, 49]);
    message = part(message, 37, claim_domain);
    message = part(message, 73, output_q);
    message = part(message, 109, u64_bytes(amount));
    sha256::<121, 192>(message)
}

// LIANUM/PAEG/native-claim-ticket/1; exact 246-byte H4 frame.
pub fn ticket_commitment(ticket: ClaimTicket) -> [u8; 32] {
    assert((ticket.kind == 1) | (ticket.kind == 2));
    assert(ticket.id != [0; 32]);
    assert(ticket.claim_domain != [0; 32]);
    assert(ticket.amount > 0);
    assert(ticket.destination_commitment != [0; 32]);
    if ticket.kind == 1 {
        assert(ticket.reference_ingress_n == [0; 32]);
        assert(ticket.reference_q == [0; 32]);
    } else {
        assert(ticket.reference_ingress_n != [0; 32]);
        assert(ticket.reference_q != [0; 32]);
    }
    let mut message: [u8; 246] = [0; 246];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 116, 105, 99, 107, 101, 116, 47, 49]);
    message = part(message, 37, [ticket.kind]);
    message = part(message, 42, ticket.id);
    message = part(message, 78, ticket.claim_domain);
    message = part(message, 114, u64_bytes(ticket.amount));
    message = part(message, 126, ticket.destination_commitment);
    message = part(message, 162, u64_bytes(ticket.max_fee));
    message = part(message, 174, ticket.reference_ingress_n);
    message = part(message, 210, ticket.reference_q);
    sha256::<246, 256>(message)
}

// LIANUM/PAEG/native-claim-ticket-id/1; exact 93-byte H4 frame.
pub fn ticket_id(claim_domain: [u8; 32], kind: u8, nonce: u64) -> [u8; 32] {
    assert((kind == 1) | (kind == 2));
    let mut message: [u8; 93] = [0; 93];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 116, 105, 99, 107, 101, 116, 45, 105, 100, 47, 49]);
    message = part(message, 40, claim_domain);
    message = part(message, 76, [kind]);
    message = part(message, 81, u64_bytes(nonce));
    sha256::<93, 128>(message)
}

// LIANUM/PAEG/native-claim-ticket-secret/1; exact 116-byte H4 frame.
pub fn ticket_secret(claim_domain: [u8; 32], ticket_id: [u8; 32]) -> [u8; 32] {
    let mut message: [u8; 116] = [0; 116];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 99, 108, 97, 105, 109, 45, 116, 105, 99, 107, 101, 116, 45, 115, 101, 99, 114, 101, 116, 47, 49]);
    message = part(message, 44, claim_domain);
    message = part(message, 80, ticket_id);
    sha256::<116, 128>(message)
}

