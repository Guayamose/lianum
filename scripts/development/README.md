# Development tooling

Run commands from the repository root:

```sh
./dev start
./dev check
./dev test
./dev test packages/backend/tests/api/wallet/client/wallet-client-model.test.mjs
./dev node path/to/an/existing-module.mjs
./dev doctor
./dev evidence
./dev artifacts
```

`./dev` uses pinned Node 24.19.0 from `.internal/dev/toolchains` without changing the global installation. `legacy-node` retains Node 24.14.0 for historical lockfiles. Restored tools also include Noir 1.0.0-beta.25, Barretenberg 5.2.0, Solidity 0.8.37, Foundry 1.8.4, Bitcoin Core 31.1 and Agave 2.3.13. Presence on a particular machine is reported by the tooling.

`start`, `node` and `test` execute editable sources. `build` checks manifests/lockfiles and prepares dependencies. `workspace.py` materializes the historical distribution only for `build --legacy` or explicit restoration/laboratory workflows that need it. A running process must load new code to use an edit; a UI-only change does not require restarting the financial engine.

`check` covers module boundaries, imports/exports, syntax, declared checkJs APIs, paths and host selection. Solidity, Noir and funded financial flows have separate explicit checks. Default `test` selects twelve host files, including terminal reconciliation regressions, or the paths supplied. Reports are written to `.internal/dev/reports/host-tests.*` and `selected-host-tests.*`.

Selections stream output, default to 120 seconds (`--timeout N`) and cap each process at 8 MiB. Reports bind date, commit and source-diff identity. Timeout, cancellation, orphaned processes and mid-run source changes never count as PASS. `doctor` distinguishes installed tools, historical integrity, test results and product blockers. `evidence` reads retained CI51, CO42 and I84 records. `artifacts` inventories the two missing original historical encoding resources; it does not generate replacements or skip their absence.

[`workflows.json`](workflows.json) is the source of command help and generated [COMMANDS.md](../../docs/COMMANDS.md). [WORKFLOW.md](../../docs/WORKFLOW.md) explains proportionate checks and limits. Historical source integrity and current editable-source synchronization are separate checks. Editing the product does not alter an archived delivery; current pins/generations may require explicit review.

## Restore another checkout

Host tests and current mobile/API work use the public bootstrap in [DEVELOPMENT.md](../../docs/DEVELOPMENT.md). Complete historical restoration requires Linux/WSL and original public backups; root `npm install` is not a substitute.

```sh
./dev build
./dev setup
./dev import '/path/to/public-backup.zip'
./dev restore-package '/path/to/public-package/payload'
./dev canonical
./dev evidence
./dev doctor
```

`setup` prepares pinned official tools and packages. Some resources require the original backup; inspect reports before declaring restoration complete. Recipes and recovered material are recorded under `archive/restoration/recipes/` when restored.

`canonical` supports the historical I84 reader's fixed path `/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655`, owned by the current user. This public resource location does not reproduce the lost private laboratory's identity. Current capsule-based I84 consumption is described in [SOURCE-GENERATIONS.md](../../docs/SOURCE-GENERATIONS.md).

Custom Solana and Tron V3 runtimes remain inactive until an authorized flow uses them. The Tron canonical gate remains closed. Later Solana ingress/solver acceptance and its limits are recorded in [LOCAL-ACCEPTANCE.md](../../packages/backend/docs/LOCAL-ACCEPTANCE.md).

The historical restoration record is `archive/restoration/ENVIRONMENT.md`; `archive/delivery/original-paths.json` and `scripts/layout.json` interpret earlier commands and paths. These retained records may require separate restoration.
