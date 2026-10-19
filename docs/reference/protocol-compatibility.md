# Frozen protocol compatibility

`packages/protocol` retains an earlier protocol generation for historical reproduction. It is not a second current application, and some historical dependencies remain unavailable. Its original README and sources preserve their bytes; current English navigation is provided here rather than altering a frozen inventory.

| Area | Retained responsibility |
| --- | --- |
| `system/` and composition modules | System composition and finality checks |
| `payments/`, `recipients/`, `recovery/` | Payments, recipients and recovery |
| `wallet/` | Earlier wallet custody, notes, resources and runtime |
| `execution/` | PAEG graph, accounts, balances, local and native execution |
| `native/`, `chains/`, `evidence/` | Native assets, adapters and evidence |
| `core/`, `api/` | Historical engine model and API |

Module checks prevent new active consumers of this package and verify its 63 original source files. The [historical module inventory](../../scripts/historical-module-inventory.json) maps 42 pairs to their active implementations. [Static-check exceptions](../../scripts/development/static-check-exceptions.json) enumerate unavailable historical targets. Those identities are not silently redirected to new engine implementations.

Use [module ownership](../MODULES.md) to locate editable code and [source generations](../SOURCE-GENERATIONS.md) to verify retained artifacts.
