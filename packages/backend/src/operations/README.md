# System composition and operation

[Lianum documentation](../../../../docs/README.md) · [Architecture](../../../../docs/ARCHITECTURE.md) · [Validation](../../../../docs/VALIDATION.md)

`deployments/` owns deployment plans, artifacts and composition. `operators/` contains operators and inventories. `releases/` owns pins, provenance and release checks. `payouts/` validates payout authorization and collection. `recovery/` retains checkpoints and recovery. `validation/` checks facts and source boundaries.

Subdirectories such as `claims/`, `native-value/`, `wrapped/`, `defi/` and `system/` identify the consumer. These modules compose financial systems; HTTP startup belongs to the corresponding entry point in `services/`.
