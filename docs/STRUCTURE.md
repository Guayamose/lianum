# Repository map

<p><a href="../README.md"><img src="assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](README.md) · [Architecture](ARCHITECTURE.md) · [Validation](VALIDATION.md)

Lianum separates the mobile application, independently deployed services, shared libraries, contracts and validation tools. Start with [the architecture](ARCHITECTURE.md) for the relationship between them.

## Application and services

```text
apps/mobile/                 React Native/Expo wallet and agent interface
services/api-server/         Authenticated public API and deployment composition
services/agent/              Persistent conversation, model/voice and push adapters
services/paeg-engine/         Financial startup, execution and retained-state recovery
infra/google-cloud/          API/agent and engine deployment tooling
```

The gateway and agent are separate processes on the wallet API host. The engine has an independent host and service. `services/paeg-engine/src/entry.mjs` selects explicit profiles; `bootstrap`, `local` and `public` own preparation, local composition and public-testnet operation. A deployment bundle's `candidate/` and `infra/` layout does not change source ownership.

## Shared libraries

| Package | Responsibility |
| --- | --- |
| `backend` | Account composition, reusable APIs, network adapters, providers, execution and DeFi |
| `engine` | Graph rules, notes, dependencies, settlement, recovery and shared mechanisms |
| `agent` | Durable conversation, tools, memory, followups, observation and voice coordination |
| `sdk` | Agent proposals, preparation/read contracts and shared client entry points |
| `proofs` | Proof workers, verification, toolchains and authenticated cryptographic resources |
| `crypto` | Keys, signatures, addresses, cryptographic encoding and portable primitives |
| `components` | Circuit components, codecs, integrity and resource policy |
| `custody` | Ownership and authorized transitions of claims |
| `mobile-protocol` | Shared wire messages, authorization types and client models |
| `environment` | Explicit source/resource roots and portable bundle resolution |
| `chains` | Retained native Tron driver |
| `protocol` | Frozen compatibility generation, verified by inventory; not an active application |

Circuit projects live under `packages/proofs/programs`. Required retained sources and artifacts live under `packages/proofs/evidence`; `.source` files are authenticated data, not alternative executable implementations. See [module ownership](MODULES.md) and [source generations](SOURCE-GENERATIONS.md).

## Contracts and validation

- `contracts/engine`: engine contracts and supported compatibility paths.
- `contracts/wallet`: custody, deposits, withdrawals, DeFi and Solana programs.
- `contracts/protocol`: contracts from the historical generation.
- `scripts/development`: `./dev`, environment setup, integrity checks and maintenance.
- `scripts/validation`: deposit, claim and SDK validation.
- `scripts/engine/demos`: maintained simulations and their small auxiliary client.
- `scripts/engine/diagnostics`: performance and diagnostic tools.
- `tests/integration`: composed workflows across components and networks.
- Package/service `tests` directories: focused regressions owned by each component.

The old local web application has been retired. Its retained HTTP/browser fixtures test compatibility; they are not a second current product UI.

## Generated resources and history

`.internal/dev` holds verified tools, retained public objects and reports. `.internal/runtime` contains resources required by compatibility readers. `.local` contains private state, recovery data, development networks, reports and backups. Dependencies live in `node_modules`. These directories are excluded from Git.

The resource inventory is [`scripts/development/resources/public-resources.json`](../scripts/development/resources/public-resources.json). Use `./dev resources status` to inspect classification and `./dev clean` for explicitly regenerable paths. Never assume an entire `.local` tree is disposable.

Current documentation starts at [docs/README.md](README.md). Public documentation follows the product/reference routes in that index; internal engineering journals are retained locally outside the published tree. Earlier archive labels can remain inside immutable manifests as provenance; they do not imply those historical directories are active source roots. Presentation working files and large videos remain local until final delivery packaging.
