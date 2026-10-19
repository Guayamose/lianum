# Development workflow

Edit the real sources in `apps/`, `packages/` and `services/`. Use the smallest relevant check first, then run the repository check once when closing a code change. A documentation or UI edit does not require reopening the financial engine.

The command catalog is [`scripts/development/workflows.json`](../scripts/development/workflows.json). It drives `./dev help`, [COMMANDS.md](COMMANDS.md), component selection and declared entry points.

## Prepare the environment

On Linux/WSL x64 with Git and Python 3.12+:

```sh
./dev prepare host
./dev status
./dev workflows
./dev prepare mobile
```

`prepare host` installs or verifies Node 24.19.0 using the pinned official archive. `status` checks tool versions and dependency presence; missing host tools produce exit code 1. Presence is not an integrity guarantee. Application dependency preparation uses its lockfile and `npm ci --ignore-scripts`, requiring registry access.

`./dev doctor` performs the fuller restored-resource/tool/pin checks. Use it after restoration or while investigating integrity failures. Neither `status` nor `doctor` proves financial readiness. Startup and tests link workspace packages without copying editable source into historical runtime trees.

## Choose the check

```sh
# Explain the proposed selection without executing it.
./dev test --changed --plan

# Run the changed-file selection or an explicit component.
./dev test --changed
./dev test --component mobile
./dev test --component wallet

# Include committed changes relative to an existing local reference.
./dev test --changed --base main --plan

# Run a specific regression.
./dev test packages/backend/tests/execution/account/execution/native-value-terminal-first.test.mjs

# Close a code change with the bounded repository checks.
./dev check
```

The base reference must exist; the tool does not assume the default branch is named `main`. Changed-file selection includes staged/unstaged edits, removals and nonignored new files. It follows literal imports among cataloged tests. If no direct relationship is found, it reports a component smoke fallback rather than claiming line-by-line coverage.

Computed imports, contracts, circuits and uncataloged paths need explicit validation. A documentation-only change selects no tests. Unmapped code and `--component contracts` return code 2 so the appropriate check can be chosen. The frozen `packages/protocol` tree is outside the ordinary import graph and `rg` search; inspect it explicitly with `rg --no-ignore` when required.

Default limits are 24 test files and 120 seconds for the complete selection. `--max-files` and `--timeout` can adjust them explicitly. Timeout returns 124, output above 8 MiB per process returns 125, and cancellation returns 130/143 while closing owned child processes. TIMEOUT, CANCELLED, OUTPUT_LIMIT, ORPHANED_PROCESS and SOURCE_CHANGED are not passing results. Reports retain selection, timing, commit and the source-diff SHA256. Tests must not detach processes.

Do not repeat a successful suite unless code changed, a failure appeared or an unresolved concern justifies it. `--changed` never adds an economic laboratory automatically.

## Static analysis

```sh
./dev static
./dev static --changed
```

The TypeScript parser checks syntax and declared imports/exports without loading the product or creating custody. Strict incremental checkJs covers the explicit files in `scripts/development/tsconfig.checkjs.json`; the rest of the JavaScript core is not claimed to be fully typed.

Additional checks verify declared lexical bindings and seven operation-port contracts by AST. Ports declare exactly the members their consumers use and do not forward a generic context, writer or account record. Structural checks complement behavioral tests; they do not prove callback behavior. The twelve explicitly missing historical references remain in `static-check-exceptions.json`, barred from active imports. New broken imports fail, and a recovered exception must be removed.

`./dev check` includes these controls. Keep the executable help and generated reference synchronized:

```sh
python3 -B scripts/development/workflow.py docs-check
python3 -B scripts/development/test_workflow.py
```

## Prepare only the necessary laboratory

```sh
./dev lab profiles
./dev lab plan evm
./dev lab prepare-profile evm
./dev lab check evm
```

Profiles declare their dependencies. Planning/checking is read-only; preparation installs missing/outdated resources and required compatibility. It does not start a network, create accounts or generate proofs. Missing originals remain missing. See [laboratory profiles](LAB-PROFILES.md), [the EVM guide](EVM-LAB.md) and [network/DeFi acceptance](../packages/backend/docs/LOCAL-ACCEPTANCE.md).

| Level | What it demonstrates |
| --- | --- |
| Host/component | Logic, formats, errors and bounded behavior using declared fixtures |
| Integration | Interaction between components or actual test services |
| Economic/proof laboratory | The selected financial flow with its networks, custody and original proofs |
| Public/phone acceptance | The actual operation against the installed release and physical device |

Real PostgreSQL validation uses `./dev npm --prefix services/api-server run test:postgres` and needs Docker. A successful APK build does not demonstrate biometric or financial behavior on a phone. Keep each result's source generation and scope.

## Update pins and adopt source deliberately

```sh
./dev pins check
./dev pins update --profile mobile
./dev sources status
./dev sources prepare
./dev sources verify --generation <digest>
./dev sources adopt --generation <digest>
```

The declared `mobile`, `platform`, `callers` and `runtime` profiles update current pins while authenticating immutable public dependencies. Platform includes its callers reference. New paths require an explicit policy review; hashes of historical binaries, fixtures and publications retain their original meaning.

After reviewing changes, `./dev sources prepare --adopt` prepares and verifies the same current generation before recording its adoption. Preparation/adoption does not deploy, recompile identical circuits or grant financial acceptance. A code change invalidates the prior source association for consumers that enforce it. [Source generations](SOURCE-GENERATIONS.md) documents manifests, original-artifact reuse and verification in detail.

`./dev bundle` packages an entry point's source closure and declared resources into a portable candidate. It verifies their hashes and resolves paths from the bundle location rather than requiring a copy of the accumulated `.internal/runtime` tree. See [environment packaging](../packages/environment/README.md).

## Deploy and observe separately

Group verified financial fixes before publishing a release. A full cloud reopen is a deployment action, not the default test for a small edit. The current public entry can complete pending Source4/7 renewal in the same Original product and signed epoch while keeping it open. A live receipt does not certify CAPTURED; deployment still requires READY for the installed invocation and public-route verification.

Startup can reuse finalized public reads from an anchored SQLite cache after rechecking the network, genesis and retained finalized block. An anchor change invalidates those reads. The store is size-bounded and closed before serving financial operations. Mutable balances, nonces and permissions are read afresh. Historical caching does not restore the entire live cryptographic composition or transfer a previous financial acceptance to new code.

Progress records milestones, RPC methods, batches and reading rate. Remaining milestone count is neither a time percentage nor a remaining RPC count. Report unknown time estimates honestly until measured data supports one.

The [current status](../STATUS.md) tracks acceptance. The [detailed workflow record](reference/development-workflow-record.md) retains the earlier implementation notes; the [command reference](COMMANDS.md) remains generated from the executable catalog.
