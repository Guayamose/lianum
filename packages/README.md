# Product components

| Package | Function |
| --- | --- |
| [backend](backend) | API, accounts, chains, claims, execution and DeFi |
| [custody](custody) | Custody, signatures, consent and processes of the owner |
| [mobile-protocol](mobile-protocol) | Shared authorisation and mobile review contracts |
| [proofs](proofs) | Workers and cryptographic proofs circuits |
| [crypto](crypto) | Poseidon candidate implementation |
| [engine](engine) | Shared state, coordination and financial protocol mechanisms |
| [protocol](protocol) | Frozen historical protocol generation and provenance |
| [components](components) | Framing and circuit component tools |
| [chains](chains) | Tron Java Driver |

Each package has a brief README. `src/` contains implementation and `tests/` test scenarios when they exist. Commands are executed from the root of the project.

Public entry points are declared in each JavaScript package's `package.json`. New consumers use `@lianum/<package>/<entry>`. [Modules and dependencies](../docs/MODULES.md) explains available exports, boundary checks and remaining internal dependency cycles.
