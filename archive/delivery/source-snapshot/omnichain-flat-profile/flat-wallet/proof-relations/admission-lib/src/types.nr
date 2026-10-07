// Only new facts fields are separately witnessed. Domain, rule, canonical
// NativeEffect/GID and original Observation are framed from their checked
// values, so there is no second unchecked facts descriptor.
pub struct WireBinding {
    pub transaction_sha256: [u8; 32],
    pub wire_binding_version: u8,
    pub wire_binding_kind: u8,
    pub wire_binding_position: u32,
    pub wire_key_commitment: [u8; 32],
}

pub struct NativeContext {
    pub observed_tip_id: [u8; 32],
    pub observed_tip_height: u64,
    pub transaction_slot: u64,
    pub parent_slot: u64,
    pub observed_slot: u64,
}
