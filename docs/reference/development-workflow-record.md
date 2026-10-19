# Work with small changes

The development routine begins at the sources of `apps/` and `packages/`. The component tests and the entire labs have different commands. The [command reference](../COMMANDS.md), `./dev help` and the catalogue of checks are generated or read from [`scripts/development/workflows.json`](../../scripts/development/workflows.json).

## Prepare and check the environment

On Linux/WSL x64, Python 3.12 or higher and Git:

```sh
./dev prepare host
./dev status
./dev workflows
```

`prepare host` reuses the existing installer: installs or checks Node 24.19.0 using its official file and hashes fixed. `status` takes a few seconds: consult tool versions and dependencies presence. Returns code 1 if host tools are missing. Dependency markers indicate presence, not integrity of an entire facility. Booting and testing prepare the npm links of the modules of the workspace according to the lock, without copying the sources to the historical runtime.

To install the dependencies of a particular application:

```sh
./dev prepare mobile
./dev prepare platform
```

These two variants run `npm ci --ignore-scripts` with the selected application lock. The facility needs access to public records. The startup of apps, Android compilations and laboratories are requested with their own commands.

`./dev doctor` preserves complete verification of the integrity of restored materials. It is used after restoring or changing such materials, or when investigating a failure of integrity; `status` covers the daily preparation consultation. Neither of them proves an economic operation.

## Prepare only the necessary laboratory

```sh
./dev lab profiles
./dev lab plan evm
./dev lab prepare-profile evm
./dev lab check evm
```

Profiles `host`, `wallet`, `platform`, `evm`, `btc-sol`, `defi` and `mobile-original` declare their dependencies. Plan and check are readable; prepare install only missing or outdated dependencies and prepare compatibility when the profile needs it. It does not start networks or create cryptographic accounts or tests. An absent original continues to appear as absent; it is not manufactured to approve the inventory. The scope of each profile is in [LAB-PROFILES.md](../LAB-PROFILES.md).

## Update hashes from current sources

```sh
./dev pins check
./dev pins update --profile mobile
git diff
```

The command replaces the manual editing of the three current declared tables: `mobile`, `platform` and `callers` (`all` It includes them). Displays each change and verifies the public dependencies set before writing. Platform also updates its reference in callers. It does not change originals, publications or historical receipts, nor does it automatically accept new files in politics. The profile `runtime` also manages the current pins of rollup customers, their dispatchers and the SOURCE guard, declared in `source-pins.json`. The hashes of binary, fixture and original publications retain their historical significance. Economic consumers retain their explicit step of acceptance of generation. [Detail and limits](../SOURCE-GENERATIONS.md).

## Choose what to check

For a small fix, first run your regression and test the affected components. Run `./dev check` once you close the change; repeat checks already approved only if you change your code or a bug remains unsolved. Documentation alone does not require proof.

A complete reopening in cloud is a deployment operation, not a default test for each edition. Group the checked corrections before publishing a version and then verify the public behavior affected. Repeat an economic laboratory or ZK only when the change affects the route that demonstrates or there is a new failure that justifies it. Always keeping the generation and scope of the above evidence: reusing it does not turn a new version into a new financial acceptance.

The normal public entrance can complete the pending renewal of Source4/7 in the same Original product and the same epoch already signed, keeping it open to serve. This tour avoids opening administratively, capturing and reopening the service. Your live receipt doesn't credit `CAPTURED`: deployment continues to demand `READY` of the invocation installed and the verification of the public routes. During booting from captured storage, V16 retains in SQLite public readings of completed history and can reuse them after restarting the process. Check again the network, its genesis and the completed saved block; if you change that anchor, it invalidates the previous readings. Storage has size limits and closes before serving financial transactions. Balances, nonces, permissions and other current status are again consulted. This cache recovers historical readings, not cryptographic composition in memory or previous financial acceptance.

Monitoring records start-up milestones, RPC methods, batches and reading rhythm. The number of outstanding milestones is not a percentage of time or the total number of pending consultations. In the first run of the new route, the remaining time appears unknown as long as there is no measured basis for estimating it.

```sh
# Ver qué comprobaciones propone el cambio actual; no ejecuta pruebas.
./dev test --changed --plan

# Ejecutar esa selección de comprobaciones host/componentes.
./dev test --changed

# Incluir también commits realizados desde una rama o commit base.
./dev test --changed --base main --plan

# Seleccionar expresamente un componente.
./dev test --component wallet
./dev test --component crypto --component components

# Ejecutar la regresión concreta de un defecto.
./dev test packages/backend/tests/execution/account/execution/native-value-terminal-first.test.mjs
```

`--changed` includes modifications prepared for commit, unprepared modifications, deletions and new files that Git does not ignore. `--base` adds the changes from the common ancestor with the reference indicated; that reference must exist locally. It does not presuppose that the main branch is called `main`.

The selection runs through literal imports to find evidence affected between the catalog files. The original file and `packages/protocol` frozen are out of that graph and the usual searches with `rg`; explicitly consulted with `rg --no-ignore`. Your integrity checks remain separate. When you cannot link a change to a test, you propose the basic checks of your component and indicate it as `component smoke fallback`. That selection checks general behavior: it does not automatically credit each modified line. Imports calculated in execution, Solidarity contracts, circuits and other unchecked files require selecting the corresponding validation.

An exclusive documentary modification does not carry out evidence. Files without automatic selection appear explicitly and execution returns code 2. `--component contracts` also returns code 2: you have to choose the build and proof of the modified contract; host tests do not validate your bytecode.

The usual limit is 24 test files. A larger selection is displayed and returns code 2 before starting tests. It can be narrowed by component or expressly extended with `--max-files 40`. In addition, the complete selection has a budget of 120 seconds, configurable with `--timeout 30` or a higher explicit value. Python and Node share that budget. When you exhaust it, you stop your own process group and you return 124. The cancellation returns 130/143 and also closes the children. Test commands should not decouple processes; laboratories have their own explicit management.

The output of the tests is shown and stored as it arrives. Each process has an output limit of 8 MiB; exceeding it returns 125. Host reports include start/end date, duration, selection, commit and SHA256 of code modifications. `TIMEOUT`, `CANCELLED`, `OUTPUT_LIMIT`, `ORPHANED_PROCESS` and `SOURCE_CHANGED` are not approvals. An execution without approved tests is also not labeled PASS. A failure stops the selection.

`./dev test` no options maintains the usual selection of host tests. `--component` allows you to order several specific components, while `--changed` Use the change in Git. `--plan --json` provides selection for editor tools without running tests.

## Static analysis without executing the product

```sh
./dev static
./dev static --changed
```

TypeScript parser checks syntax and imported/exported names in static kernel declarations, without loading their modules or creating custody. `--changed` limits that analysis to modified and new files. It does not infer calculated imports or demonstrate economic behavior.

`scripts/development/tsconfig.checkjs.json` strict checkJs applies to implementations of routes, errors, file integrity, mobile consents and authorizations, review and private account status, recovery actions and life cycle of your own processes. The exact entries are listed in that configuration. It is an incremental adoption: the rest of the JavaScript kernel does not declare itself typed. Configuration does not use `@ts-ignore` Or deactivates mistakes to make her pass. In addition, names without lexical binding are checked at the authority factory and the operating and daily modules listed in `static-bindings.json`. This control detects references as a `account` it has not been passed or declared; it analyzes those files without loading their dependencies graph and does not amount to typing all their dynamic structures. The seven trading contracts listed in `static-operation-ports.json` are contrasted by AST with its composition: each port declares explicit members and receives exactly those it uses, without surplus fields, spreads or forwarding of the entire port. Control prevents passing general capabilities called `context`, `record`, `password` o `write`; access to registration and writing remains in the factory and its private journal. This structural control alone does not demonstrate callback behavior. The twelve historical references missing from `protocol` are listed exactly in `static-check-exceptions.json`, visible on the output and prohibited as active dependencies by control of modules. A new broken import fails; an exception whose file has already been recovered also fails to remove it. These historical identities are not redirected to another module.

`./dev check` includes these controls. The IC further verifies that the command reference matches the catalog: `python3 -B scripts/development/workflow.py docs-check`.

## What each level demonstrates

| Nivel | Comprueba | Explicit example |
| --- | --- | --- |
| Host | Logic, formats and errors with local fixtures | `./dev test` |
| Componente | Detailed checks of part of the application | `./dev test --component wallet` |
| Integration | Relationship between actual test components or services | `./dev test tests/integration/mobile/paired-original-account-http-v2.test.mjs` |
| Economic | Operation and recovery in a laboratory with networks, custody and original evidence | `./dev lab run` o `./dev lab recovery` |

The last two rows need specific preparation. Real PostgreSQL, for example, is checked with `./dev npm --prefix services/api-server run
test:postgres` And he needs Docker. The economic routes are documented in [EVM-LAB.md](../EVM-LAB.md) and the corresponding domain guides. `./dev test --changed` never adds a command `lab` to your selection.

With Google Chrome installed, the real browser checks customer imports, HTTP, disconnected status and DOM token removal:

```sh
./dev npm run test:browser
```

This check uses a temporary Chrome profile with sandbox and closes your server upon completion. Its acceptance corresponds to the disconnected wallet; the journeys with funds have their specific laboratories.

## Current entries and compatibility

`./dev workflows` shows the entry path, command and scope of each registered route. It is kept in the same catalogue as the selection of tests; its routes are checked with a short regression. The catalog points to current entries, does not copy release numbers or declare new generations accepted by the fact that their files exist.

Historical names continue to appear on routes that require compatibility with original artifacts. Their identification and preparation are consulted with `./dev sources status` and are documented in [SOURCE-GENERATIONS.md](../SOURCE-GENERATIONS.md). `./dev sources prepare` prepares a snapshot of sources; it does not amount to compiling, publishing or approving an economic operation. `./dev sources adopt --generation <huella>` records their adoption by migrated consumers after checking the original sources and artifacts. Such management is requested independently of rapid testing.

To move an entry out of this checkout is used `./dev bundle`: collects its closing of sources and declared resources, verifies its hashes and generates a launcher that solves the routes from the location of the package. Do not require copying of the accumulated tree of `.internal/runtime`. The format of the manifest and the examples are in [the environment guide](../../packages/environment/README.md). The package is an execution candidate: the economic acceptance of its consumer remains a separate step.

The status of implementation remains at [STATUS.md](../../STATUS.md); approving a host selection does not alone increase a percentage of product.

## Keep catalog

When a component is added, its prefix is declared in `watch` and a small selection of host regressions in `tests`. For new routes an entrance with explicit level and scope is added. Campaigns with networks or original proofs belong to `entrypoints`, no to automatic selection of `components`. A review of the catalog must confirm that scope before adding tests to the automatic routine.

Selector validation:

```sh
python3 -B scripts/development/test_workflow.py
```
