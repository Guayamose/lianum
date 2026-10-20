# Native account authority operations

[Lianum documentation](../../../../../../docs/README.md) · [Architecture](../../../../../../docs/ARCHITECTURE.md) · [Validation](../../../../../../docs/VALIDATION.md)

The entry point is `../native-value-account-authority-v2.mjs`. It creates and registers the original account, vault, operation lock and capture/closure/recovery state. Modules in this directory are backend-private: constructing a factory does not register an account or grant financial authorization.

| File `native-value-authority-…` | Responsibility | Owned state |
| --- | --- | --- |
| `journals.mjs` | Scoped views/mutations for deposits, reservations, quotes, exits and operations | No persistent record copy |
| `deposits.mjs` | Install, observe, prove and register device deposits | This instance's deposit bridge |
| `reservations.mjs` | Check consent, budget and reservation of the original note | This instance's reservation bridge |
| `execution.mjs` | Execute, observe terminal results, handle reorgs and armed recovery | Temporary reorg-reconciliation admission |
| `withdrawals.mjs` | Derive output notes, validate their holder and reconcile withdrawals | This instance's exit bridge |
| `operations.mjs` | Authorize owner operations, broadcast, reconcile and read results | Retained terminal observer |
| `manual.mjs` | Manual review, keeper and non-broadcast justification cycle | Keeper, portfolio and private stop/justification brands |
| `interface.mjs` | Construct the public account interface | Delegates cancellation/closure to the account owner |

Each factory receives named ports exposing exactly the members it consumes. `createAccountAuthority` builds and freezes them. There is no generic context granting arbitrary access to the owner's variables.

| Port | Exposes | Retained by the owner |
| --- | --- | --- |
| `journal` | Domain rows and explicit mutations | Vault, writer, full record, revision, authentication and CAS |
| `lifecycle` | Exclusion, health/state checks and active-proof registration as required | Locking, cancellation, closure and active-process references |
| `account` | Original `capability()` after construction | Capability identity registry and authority |
| `profile` | Domain-specific configuration and identities | Original account creation and validation |
| `chain` | Reads/execution through supplied original components | Original runtime, pool and holder bindings |
| `deposits`, `reservations`, `exits`, `execution`, `operations`, `manual` | Explicit operations of the respective domain | Implementing module's state and checks |
| `proofs` | Declared runner and callbacks | Process tracking and coordinated cancellation |
| `continuity`, `approvals` | Required continuity references or approvals | Original ownership and validation |
| `format`, `selection` | Explicit transformations or selections | No authority added |

These ports describe internal composition and are not accepted from HTTP. Some original references are stateful capabilities. Freezing a port's container neither converts them to plain data nor replaces their checks.

## Journal writes

`createNativeValueAccountJournals` receives only `readRecord` and `write`. Every read consults the current record, so replacement after writing/recovery is visible on the next read. Returned rows are deeply frozen copies; retaining an earlier view preserves a snapshot, not a mutable vault reference.

`append`, `appendQuote` and `patch` copy caller data before awaiting writes. The mutation applies to the current record when the owner invokes its callback. Each table selects its own field and identity; an ID shared by a deposit and reservation does not merge their rows. Profiles are scalar protocol identifiers.

Authorization and durability remain in `write`: check health, clone state, apply CAS and verify readback before replacing the live record. Journal ports add no persistence, retry or reconciliation layer. They propagate the original error; the owner decides how uncertainty blocks the account.

## Change and verify

Start withdrawal changes in `withdrawals.mjs`; review entry-point composition when changing permissions or collaborators. Identify the journal domain before changing persisted data, preserve owner checks and add dependencies only to the narrow port requiring them.

`native-value-authority-journals.test.mjs` checks immutable copies, live record replacement, domain separation, caller mutation during a wait and error propagation without retries. `native-value-withdrawal-context.test.mjs` checks the consumed capability and per-instance bridge isolation using a synthetic HOST guard and real Merkle paths. These host tests do not establish custody, authenticated CAS or financial execution; explicit laboratories cover those flows.
