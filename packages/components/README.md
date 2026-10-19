# Circuit components

`src/` contains framing, fixtures and component tools. `circuits/` contains Noir circuits and `test/` their tests. Launchers live in `scripts/components/`.

`src/encoding/` owns the public statement and commitment contracts. It encodes, validates and binds data; it does not create custody or authority. Custody, proofs and backend consume its explicit `encoding/statements` and `encoding/commitments` APIs. Former backend paths re-export the same objects for existing consumers.

Public exports are declared in [`package.json`](package.json). [Modules and dependencies](../../docs/MODULES.md) explains their consumers and component boundaries.
