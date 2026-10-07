// Isolated Poseidon2 internal-hash component. Does not authenticate U/S', native
// finality, state freshness or production activation. Original SHA stays frozen.
pub mod types;
pub mod encoding;
pub mod framing;
pub mod state;
pub mod merkle;

