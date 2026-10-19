# Cryptographic proofs

This package owns proof clients, workers, tooling and tests. It consumes engine, custody and shared contracts. Compositions requiring accounts, networks and recovery belong to backend.

| Location | Responsibility |
| --- | --- |
| `src/catalog.mjs` | Profile catalog and resource locations |
| `src/jobs/` | Shared job clients, workers and boundaries |
| `src/execution/` | Proof processes, workers, resources and note execution |
| `src/host/` | Files, process identity, RSS and execution limits |
| `src/toolchain/` | Wallet/assembly provers, paged clients/workers and artifact readers |
| `src/tooling/` | Compilation and generation tools |
| `src/verification/` | Key and source validators bound to pinned identities |
| `src/native-value/`, `src/native-ingress/`, `src/wrapped-claims/` | Route profiles and metadata |
| `circuits/` | Current Noir circuits |
| `shared/`, `vendor/` | Shared libraries and external sources |
| `tests/` | Job, toolchain and contract tests |

Economic integration lives in `packages/backend/src/proving/`; shared cryptographic tooling is edited here. Earlier experimental entry points and test helpers re-export operational implementations when compatibility requires them.

Retained circuits, keys, libraries and tools have fixed identities. Moving a module does not remove its integrity checks. Consumers import validators from `@lianum/components/resources/` and obtain resource locations from `@lianum/environment`. Inventories bind current validator source as well as historical records. Importing a catalog or preparing a bundle neither generates a proof nor certifies a release.

The paged bridge imports active `toolchain/` modules and preserves a single Graph/client identity, including through compatibility copies. Artifact readers retain original hashes and source checks; a mismatch blocks reuse until a reviewed generation is adopted. Pinned experimental originals remain evidence, not a second active implementation.

Portable candidates and historical compatibility are prepared explicitly. See [commands](../../docs/COMMANDS.md), [repository structure](../../docs/STRUCTURE.md) and [source generations](../../docs/SOURCE-GENERATIONS.md). Public APIs are in [package.json](package.json); [module boundaries](../../docs/MODULES.md) and `./dev boundaries` describe dependencies and remaining internal cycles.
