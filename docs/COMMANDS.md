# Development commands

Generated from `scripts/development/workflows.json`; `./dev help` uses the same catalog.

```text
./dev api                               Start the public API using LIANUM_PUBLIC_WALLET_CONFIG.
./dev engine [admission|original-native-new|original-native-reopen|paged-native-new|paged-native-reopen|paged-mixed-new|paged-mixed-reopen|defi-new] Start an explicit profile; new requires fresh state, reopen retains the original state.
./dev build                             Prepare packages and lockfile; does not generate compatibility resources.
./dev check                             Check module boundaries, static analysis and the host selection.
./dev block-check [--plan]              Full maintained suite, runtime imports and mobile types; no skipped checks or adoption.
./dev test [paths] [--timeout 120]      Host tests with live output and a deadline per selection.
./dev test --changed [--plan]           Select checks for the change; limit 24 files and 120 seconds.
./dev test --component NAME             Bounded checks for one or more components.
./dev static [--changed]                Core syntax/import checks and strict checkJs for declared APIs.
./dev status                            Tool presence and versions; does not certify integrity.
./dev prepare [host|mobile|api-server]  Install the public dependencies for the selected profile.
./dev workflows                         Current entry points and the scope of each check.
./dev boundaries                        Check dependencies and exports between modules.
./dev sources [status|prepare|check|verify|adopt] Inspect, prepare, verify or adopt a source generation by digest.
./dev sources prepare --adopt           Prepare and adopt verified current sources without copying hashes manually.
./dev bundle [build|verify|run]         Package declared sources and resources as a portable candidate.
./dev pins [check|update] [--profile NAME] Review or update current hashes; preserve historical publications.
./dev resources [status|check]          Storage by purpose and unclassified local paths.
./dev resources migrate-caches [--apply] Preview or move caches to their shared location.
./dev lab profiles                      Show profiles and minimum inventory scope.
./dev lab [plan|check] PROFILE          Inspect profile dependencies without starting networks.
./dev lab prepare-profile PROFILE       Prepare only the dependencies and compatibility required by the profile.
./dev clean [--scope caches|history|all] [--apply] Preview cleanup by category; --apply executes the selection.
./dev build --legacy                    Explicitly materialize historical compatibility resources.
./dev legacy [node|test|check]          Run the corresponding legacy path.
./dev doctor                            Check installed tools and current source hashes.
./dev artifacts                         Inventory missing historical originals.
./dev evidence                          Verify restored original public evidence.
./dev node [args]                       Local Node against editable sources.
./dev npm [args]                        npm using the local pinned Node.
./dev lab [prepare|run|recovery]        Explicit EVM laboratory; never added to host tests automatically.
./dev lab [browser|browser-recovery]    EVM economic flow from the browser.
./dev lab [btc-sol|claims|osaka]        Explicit native laboratories; require their retained resources.
./dev lab [defi|metamorpho]             Explicit DeFi laboratories with custody and proofs.
./dev lab mobile-original               Paired original V2 account: read and reconcile.
./dev lab mobile-original-ledger        Compile native ledger V5 with an owned watchdog.
./dev lab audit-base                    Original empty audits; explicit execution.
./dev canonical                         Prepare the fixed location required by the I84 reader.
./dev [legacy-node|proof-node] [args]   Pinned compatibility runtimes.
```
