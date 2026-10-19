# Integration

| Directory | Stages |
| --- | --- |
| `wallet/` | Wallet manual, native and wrapped |
| `accounts/`, `portfolio/` | Recovery of accounts and portfolio |
| `chains/` | Specific flows of EVM and Solana |
| `claims/` | Income, inventory, health, graph and claims payments |
| `native/`, `claims/graph/policies/` | Native flows and graph politics |
| `pools/`, `deployments/` | Pool Generations and Deployments |
| `proofs/` | Compilation and verification of evidence |
| `fixtures/` | Support Data and Runtimes |
| `runners/` | Catalogue, tasks and common launchers |

This folder mixes Node testing and acceptance flows with laboratory requirements. Not all of it is part of the rapid selection of `npm test`. Names `run-*` identify launchers and `*.test.mjs` identifies Node tests.
