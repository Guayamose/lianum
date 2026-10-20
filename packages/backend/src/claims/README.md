# Native claims

[Lianum documentation](../../../../docs/README.md) · [Architecture](../../../../docs/ARCHITECTURE.md) · [Validation](../../../../docs/VALIDATION.md)

`authorization/` owns admission, permissions and authorities; `controller/` composes controller calls and state; `ingress/` handles incoming value and registration; `payouts/` controls payouts and quorum; `storage/` retains records and vault sessions; `operations/` contains operators, audits and portfolio views; `protocol/` defines ABI, framing and input data.

`wrapped/` contains wrapped variants with the same separation, including recovery. Tests live in `packages/backend/tests/claims/`.
