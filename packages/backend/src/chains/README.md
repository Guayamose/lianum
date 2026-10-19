# Chain adapters

`evm/`, `bitcoin/`, `solana/` and `tron/` contain chain-specific implementations. `shared/` owns common contracts.

Within each chain, `runtime/` manages resources; `observations/` gathers network observations; `transfers/` handles transfers; `health/` exposes health; `dispatch/` validates broadcasts; `contracts/` checks contracts; and `vault/` adapts vault deliveries where supported. `shared/portfolio/` owns portfolio registration and reads.

Tests live in `packages/backend/tests/chains/`; fixtures in `packages/backend/tests/fixtures/chains/`.
