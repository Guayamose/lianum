# Laboratory preparation profiles

The profiles state what each route needs and prepare their dependencies separately from the execution. The editable catalogue is [`scripts/development/lab-profiles.json`](../scripts/development/lab-profiles.json).

```bash
./dev lab profiles
./dev lab plan wallet
./dev lab check wallet
./dev lab prepare-profile wallet
```

`profiles`, `plan` and `check` They're reading. They inspect routes, public manifests, locks and sources; they do not run native tools, services, or tests. `--json` produces a structured result in any of the four commands.

| Perfil | Minimum inventory | Existing implementation, separately |
| --- | --- | --- |
| `host` | Linux/WSL x64, Python 3.12+, Fixed Node and Workspace Dependencies/Links | `./dev check` |
| `wallet` | Host environment and web wallet entry | `./dev start` |
| `platform` | Host environment and API dependencies | `./dev platform admission` |
| `evm` | Host, compatible distribution, Anvil and public manifests EVM/backed-assets | `./dev lab run`, `./dev lab recovery` |
| `btc-sol` | EVM requirements, Bitcoin Core, selected original Solana candidate and public manifesto IC51/CO42 | `./dev lab btc-sol` |
| `defi` | EVM requirements and original Uniswap/MetaMorpho entries | `./dev lab defi`, `./dev lab metamorpho` |
| `mobile-original` | EVM requirements, mobile dependencies and customer input Original pairing node V2 | `./dev lab mobile-original` |

The catalogue covers these specific routes. The other variants of strings, devices and DeFi maintain their specific commands and requirements. `mobile-original` Check infrastructure for route Node: SecureStore, biometrics, Hermes and physical phone need their own checks. `platform` does not inspect credentials or connect to PostgreSQL.

## Interpret the result

- `available`: all elements of the declared inventory are present and the checks indicated coincide.
- `missing`: missing a tool, link, dependency, input or manifest required.
- `stale-dependencies`: manifests/locks or installed versions of direct dependencies do not match.
- `stale-generation`: the registered compatible distribution differs from editable sources, translated imports or their generated files.

Each requirement retains its own state, even if the global state first shows a lack. `plan` ends with code 0 when you can compile the inventory; `check` and `prepare-profile` return 1 if there are any outstanding requirements. A configuration or preparation error returns 2.

The check of Node and native tools is of presence and execution permissions on their fixed routes. The npm check compares manifests/locks, links and direct versions; it does not authenticate the bytes of all packages. The artifacts are checked by the presence of their public manifests, without reading private status. Original loaders continue to check hashes, profiles, and links before using them.

`available` does not prove economic performance or acceptance of a publication of sources. The report expresses this through `artifactIntegrityChecked: false`, `financialSourceGeneration: "NOT_CHECKED"` and `financialAcceptance: false`. The compatible generation checks the public archives registered in the latest build; economic generations retain their own preparation and validation flow.

Originals kept outside the code folders are only supported if their path and destination matches the original map of `scripts/layout.json` and with the public inventory allowed. There is only one historical exception: `packages/proofs/evidence/wrapped-key-preparation-bound-20261006/execution-receipts/ci-prepare-key-20261006/failure-preservation-e84fb980-fbaf-428d-b7b3-ab5080623921/active.lock`. The inspector excludes that record without reading it or authenticating its hash and lists its exact path in the result. The exception does not allow other files `.lock` or other private routes from the historical archive.

## What does he prepare? `prepare-profile`

The command re-evaluates the inventory under an exclusive lock and executes only the pending steps allowed:

1. Install the official Node fixed if missing, using the existing bootstrap.
2. Prepare root links and dependencies with `source_runtime.py` if necessary. This tool validates the lock and retains its own lock.
3. Run `npm ci --ignore-scripts --no-audit --no-fund` for `services/api-server` o `apps/mobile` when the profile needs these dependencies and the inventory is out of date.
4. Materialize distribution compatible with `workspace.py` only for the economic profiles that need it.

npm uses `.local/cache/npm`. Each step has a limit of 120 seconds and its process group is cancelled together. Repeating preparation with already available requirements does not reinstall those dependencies.

**If artifacts are missing, the report continues to indicate `missing`.** This command does not download public backups, compile circuits, prepare test keys, recreate custody or replace custom runtimes. The original public material must be restored by its documented procedure. An inconsistent lock needs an explicit and revised update.

Preparations do not start nodes, finance accounts, run tours, reopen laboratories or touch private states. The table's execution commands are explicit subsequent steps; the catalog never turns them into preparatory actions. The Historical Command `./dev lab prepare` it retains its cryptographic preparation EVM: it has a different scope of `prepare-profile` and is not invoked from these profiles.

## Maintain a profile

Declares specific requirements and the public entrance of the route. It retains separate presence, correspondence of sources and economic acceptance. The preparation steps are chosen from a closed list; a catalog command string never runs.

The Fixtures of [`test_lab_profiles.py`](../scripts/development/test_lab_profiles.py) They check read without effect, isolate private data, derive from locks and generation, selective preparation, idempotency and propagation of failures. They run without installing applications or starting laboratories:

```bash
python3 -B scripts/development/test_lab_profiles.py
```
