# Owner custody

<p><a href="../../README.md"><img src="../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../docs/README.md) · [Architecture](../../docs/ARCHITECTURE.md) · [Validation](../../docs/VALIDATION.md)

This package owns key custody, signing authorization and owner bindings. `@lianum/custody/owner` exports [flat-owner-custody.mjs](src/signing/flat-owner-custody.mjs).

| Domain in `src/` | Responsibility |
| --- | --- |
| `signing/` | Custody, authorized envelopes and observation contracts |
| `preparation/` | Preparation and consent bindings |
| `claims/` | Owner transitions and incoming deliveries |

Compositions requiring sessions, network adapters or workers live in `packages/backend/src/custody/`: owner processes/observers, operation preparation and account integration. This package consumes engine and shared contracts without depending on backend or proofs. Native device custody remains in `apps/mobile/src/custody/`.

Brands and permissions are capabilities tied to original objects. Public APIs and their re-exports share the same functions and records. A data copy or validation callback cannot substitute for those identities.

`tests/` groups custody checks and scenarios by domain. Tests may consume backend compositions without adding a backend dependency to `src/`.

See explicit exports in [package.json](package.json) and the dependency rules in [MODULES.md](../../docs/MODULES.md). That guide and `./dev boundaries` report remaining internal cycles.
