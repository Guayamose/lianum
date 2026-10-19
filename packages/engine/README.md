# Shared engine

The engine library provides state, generic coordination, storage and shared protocol mechanisms. Backend, custody and proofs consume it. Its source does not import those higher-level packages, applications or test drivers.

| Domain in `src/` | Responsibility |
| --- | --- |
| `accounts/`, `cohorts/` | State, coordination and account/cohort contracts |
| `notes/`, `crypto/` | Notes, encryption, commitments and private transport of evidence |
| `assembly/`, `finality/` | Composition mechanisms and finality controls |
| `payments/`, `recipients/`, `recovery/` | Coordination of payments, recipients and recovery mechanisms |
| `wallet/` | Shared custody, notes, resources and session mechanisms |
| `execution/` | PAEG graphs, account coordination, balances and local/native execution |
| `execution/inputs/` | Coding of deposits and construction of shared witnesses |
| `native/`, `chains/`, `evidence/` | Native identity, runtime mechanisms and evidence |
| `claims/`, `encoding/` | Formats, permissions and encoding of operations |
| `core/`, `api/` | Engine Model and SDK |
| `storage/` | Encrypted segmented record |

The generic checkpoint coordinator lives in [generic-account-keeper-core.mjs](src/execution/accounts/generic-account-keeper-core.mjs). The durable keeper with SOURCE authority belongs to backend. Account/payment compositions combining networks, custody and a prover also live in backend; proof processes belong to proofs.

The process lifecycle primitive is [owned-process-lifecycle.mjs](src/chains/shared/owned-process-lifecycle.mjs). Network runtime harnesses add binary and resource checks. Public protocol and custody entry points continue to validate their original capabilities.

`tests/` contains domain tests. `packages/protocol` preserves an inventoried historical version. Develop the current engine without synchronizing that frozen copy.

See explicit APIs in [package.json](package.json) and [Modules and dependencies](../../docs/MODULES.md). `./dev boundaries` checks package boundaries and separately reports remaining internal cycles.
