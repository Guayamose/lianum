# Development and verification

The code is edited in `apps`, `packages` and `contracts`. Wallet and host tests directly execute those sources. `./dev build` checks manifests and locks and installs dependencies when they change; does not materialize another copy of the code. Consultation [STRUCTURE.md](STRUCTURE.md) to find each domain and [WORKSFLOW.md](WORKFLOW.md) to choose checks by change or component.

## Clean copy without restoration materials

From Linux/WSL x64, Git and Python 3.12 or higher, at the root of a copy of the repository:

```sh
./dev prepare host
./dev build
./dev check
./dev start
```

The first command downloads Node 24.19.0 from its official distribution, checks the fixed SHA256 file and the installed binary. Does not modify Global Node. The usual selection checks HTTP transport, consent and reconciliation. It doesn't require native binaries or CRS. Host results use fixtures and do not credit for an economic operation alone.

When you change sources used by economic readers, prepare and adopt its new closure with `./dev sources prepare --adopt`. The command checks the originals and the same generation before selecting; you do not have to write your hash by hand or regenerate tests. Its scope is at [SOURCE-GENERATIONS.md](SOURCE-GENERATIONS.md).

To specifically verify historical conservation:

```sh
./dev build --legacy
python3 -B scripts/development/verify_layout.py --tracked-delivery
python3 -B scripts/development/test_workspace.py
```

Verification `--tracked-delivery` checks the 1.716 original versions and declares 933 local reference files, revised packages and drafts out of reach. Check bytes, SHA256 and Git's remaining execution permit; Git retains no differences such as `0600` against `0644`. Rejects mandatory original sources without versioning. `./dev legacy check` adds complete checking of restored files and also needs Solidity/Noir dependencies for your diagnoses. `./dev check` verifies contracts between modules, syntax/imports, declared checkJs APIs, command documentation, execution from sources and the usual host selection. Tests show live output and have 120 seconds per selection (`--timeout N`), with child closure and explicit result when the deadline is exhausted. Reports include review and footprint change. Consult [WORKFLOW.md](WORKFLOW.md) for scope and [COMMANDS.md](COMMANDS.md) for the reference generated from the same catalogue as `./dev help`.

To close a block with all the battery held, use:

```sh
./dev block-check --plan
./dev block-check --timeout 7200 --stage-timeout 600
```

The plan lists all files `*.test.mjs`, `*.test.cjs`, `*.test.js`, `*.test.ts`, `*.test.mts` and `*.test.cts` of `packages/*/tests`, `apps/*/tests`, `tests` and `scripts/development`along with your tests `unittest` `test_*.py`. It does not use the usual selection of 35 files or cured components. It records the exclusions of installed dependencies, generated files, links, private status and historical evidence. An unsupported test format is declared as blocking rather than disappearing from the plan.

The execution is sequential: audit of imports runtime—including Mobile—, borders, existing static analysis, Mobile TypeScript and each Node or Python file. The auditor reads AST and package exports without evaluating the product modules; it distinguishes the names available in runtime from type declarations. The calculated dependencies and interoperability of external/CommonJS packages that cannot be demonstrated are explicit in the report.

Each performance retains its own report in `.internal/dev/reports/block-check-<id>/report.json`, with inventory, content footprint, review before/after and results per file. Skip tests, `todo`, expected failures or zero tests do not count as complete closure. A normal failure allows to check the following families; cancellation, orphan processes, run-out time or changes in sources prevent a complete result. The command does not install dependencies or prepare or adopt a generation: first fix the sources and environment with those responsible for the block. Economic drivers, browser and nameless phone `*.test.*` keep their acceptance paths separate; a host PASS does not credit them.

The workflow [ci.yml](../.github/workflows/ci.yml) runs from an empty checkout on every push, without product credentials. It installs the verified Node runtime and the public dependency locks, checks module boundaries, static imports and the command catalog, then runs the wallet, custody, mobile, API server, agent, engine and protocol component suites. Laboratories and checks that need retained local resources (native runtimes, original proof artifacts, private custody) remain explicit local commands.

With Google Chrome installed, it also checks the real DOM of the disconnected wallet:

```sh
./dev npm ci --ignore-scripts
./dev npm run test:browser
```

The Playwright Core lock is fixed without downloading another browser. Chrome retains its sandbox and uses a temporary profile. Modules, local queries, disabled buttons, absence of fictitious balance, removal of tokens from the DOM and explicit update are checked. Report and capture remain in `.internal/dev/reports/`. This smoke does not demonstrate funding or acceptance of the connected route.

## Paged Boots

Paged Boots available from the root are:

```sh
./dev platform paged-native-new     # Tres redes locales; entorno nuevo
./dev platform paged-native-reopen  # Mismo estado privado tras captura completa
./dev platform paged-mixed-new      # Tres redes + Uniswap; entorno nuevo separado
./dev platform paged-mixed-reopen   # Mismo entorno Mixed tras captura completa
```

**Local accepted with software custody:** Cold13 completed thirteen proofs, the three native payments, change of 300 demo units and three reopenings in four backend processes. Mixed21 completed Uniswap and the three native payments, twenty-one proofs, change of 200 and four executor payouts of 100 each. Its original closures are verified; the evidence and limits appear in [VALIDATION.md](VALIDATION.md).

Mixed now retains the original composition by orderly capture and `paged-mixed-reopen`; requires the same environment and a complete authenticated capture. Do not migrate old environments without retention or resolve any abrupt fall. Joint acceptance with restarts and portfolio is recorded separately in STATUS. The financial results exercise the original functions; they do not attest by themselves all the interaction of the CLI assistants or the physical phone. Booting does not automatically finance notes. Keeps the directories retained and consults [the platform guide](../services/api-server/README.md) before operating the service.

## Additional laboratories and tests

```sh
./dev test packages/backend/tests/defi/withdrawals/private-vault-exit.test.mjs
./dev test --changed --plan
./dev test --component backend
./dev artifacts
./dev doctor
./dev sources status
./dev sources prepare
./dev lab prepare
./dev lab
```

Explicit selections write `selected-host-tests.json`; the usual selection writes `host-tests.json`. The usual result is not overwritten when executing tests from another domain. Reports are kept in `.internal/dev/reports`outside Git.

Actual testing laboratories need public dependencies and restoration materials described in [EVM-LAB.md](EVM-LAB.md). They create new genesis, identities, and synthetic keys. The disconnected booting of the wallet does not credit funds or automatically enable such operations.

Consumers with historic routes and hashes use `./dev legacy node …` or `./dev legacy test …`. Commands `lab` prepare their compatibility explicitly. [SOURCE-GENERATIONS.md](SOURCE-GENERATIONS.md) explains the capture of sources, the reuse of artifacts and the difference between preparing and publishing.

## Commits

A functional change, its regression and its relevant documentation form a unit. It uses titles that identify the component and the behavior, with a body that explains the problem, the solution, the validation and its scope. The import history separates the original components; corrections and new applications are added to own commits.
