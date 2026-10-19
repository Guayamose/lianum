# Backend

This package composes accounts, custody, networks, execution and proof workers. Applications consume its APIs; backend does not import application code or test/experiment implementations.

| Domain in `src/` | Responsibility |
| --- | --- |
| `api/` | HTTP, clients and wallet/account/claim sessions |
| `accounts/` | Authority, storage, portfolio, runtimes and account recovery |
| `chains/` | Network adapters, runtimes and local EVM composition |
| `custody/` | Owner processes and observers requiring accounts or networks |
| `claims/` | Claim authorization, issuance, storage, payments and recovery |
| `execution/` | PAEG preparation, execution and reconciliation |
| `proving/` | Proof integration with accounts, deposits and claims |
| `defi/` | DeFi vaults, positions, deliveries and withdrawals |
| `providers/` | Operation providers |
| `coordination/`, `payments/` | Cohort composition and payment orchestration |
| `operations/` | Deployment, operators, local composition and release checks |
| `storage/` | Auxiliary private record writers |

Common entries are the [account session](src/api/accounts/flat-account-session.mjs), [wallet client](src/api/wallet/wallet-application-client.mjs) and [wallet HTTP service](src/api/wallet/http-service.mjs). The retained web client supplies its visual resources; the HTTP service is independent of that client. `services/api-server` composes API entry points and profiles.

Native authority preserves its factory, identity, exclusion and closure checks. [Native account operations](src/accounts/authority/native-value/README.md) cover deposits, reservations, execution, withdrawals and the manual cycle. Journal ports expose specific writes rather than handing consumers the entire account record or writer. `./dev static` checks declared composition contracts.

The [durable keeper](src/accounts/storage/durable-generic-account-keeper.mjs) retains its brands and SOURCE validation while consuming the generic engine coordinator. Owner processes and observers in `src/custody/` compose key custody from `@lianum/custody`. Shared proof tooling and jobs belong to `@lianum/proofs`.

Deployment/recovery factories also used by tests live in `src/operations/` and `src/claims/`. Former fixture entry points re-export those implementations. Scenarios, assertions and simulated failures remain in `tests/`.

The package dependency graph is acyclic. Internal SOURCE composition, recovery and execution cycles remain; separating them must preserve capabilities bound to original objects. See [modules and dependencies](../../docs/MODULES.md), `./dev boundaries` and the explicit exports in [package.json](package.json).
