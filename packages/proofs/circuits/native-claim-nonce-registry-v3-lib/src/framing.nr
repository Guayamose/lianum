// New custody-only typed leaf. All claim-domain/facts/K/N functions are reused unchanged.
use graph_support::sha256::{sha256, u32_bytes};
use claim_support::types::ClaimConfig;
fn part<let N: u32, let M: u32>(buffer: [u8; N], offset: u32, value: [u8; M]) -> [u8; N] {
    assert(offset + 4 + M <= N);
    let mut result = buffer;
    let length = u32_bytes(M);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..M { result[offset + 4 + i] = value[i]; }
    result
}
pub fn custody_profile_commitment(config: ClaimConfig, source_set_root: [u8; 32]) -> [u8; 32] {
    assert((config.native_family == 1) | (config.native_family == 2));
    assert(source_set_root != [0; 32]);
    let mut message: [u8; 336] = [0; 336];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 99, 117, 115, 116, 111, 100, 121, 45, 112, 114, 111, 102, 105, 108, 101, 47, 50]);
    message = part(message, 35, [76, 73, 65, 78, 85, 77, 95, 78, 65, 84, 73, 86, 69, 95, 67, 85, 83, 84, 79, 68, 89, 95, 80, 82, 79, 70, 73, 76, 69, 95, 86, 50]);
    message = part(message, 71, u32_bytes(2));
    message = part(message, 79, [config.native_family]);
    message = part(message, 84, config.native_genesis);
    message = part(message, 120, config.native_asset);
    message = part(message, 156, config.native_rule_commitment);
    message = part(message, 192, config.escrow_endpoint_commitment);
    message = part(message, 228, config.custody_inventory_domain);
    message = part(message, 264, source_set_root);
    message = part(message, 300, [125, 47, 59, 219, 48, 211, 22, 235, 121, 196, 245, 30, 115, 246, 85, 225, 88, 147, 225, 16, 94, 191, 111, 146, 244, 75, 177, 94, 122, 148, 208, 34]);
    sha256::<336, 384>(message)
}
