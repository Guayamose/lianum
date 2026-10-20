# Operation execution

[Lianum documentation](../../../../docs/README.md) · [Architecture](../../../../docs/ARCHITECTURE.md) · [Validation](../../../../docs/VALIDATION.md)

PAEG organizes private graphs of financial actions. `account/` contains the flat-account path; `native-value/` and `wrapped/` contain their specific paths.

Each path separates `preparation/` (admission and dependencies), `execution/` (execution), and `reconciliation/` (state, outcomes and recovery), where applicable. `encoding/` owns shared formats, commitments and codecs.

Tests live in `packages/backend/tests/execution/`.
