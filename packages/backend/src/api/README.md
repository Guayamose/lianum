# APIs and sessions

[Lianum documentation](../../../../docs/README.md) · [Architecture](../../../../docs/ARCHITECTURE.md) · [Validation](../../../../docs/VALIDATION.md)

`wallet/` contains the shared client and wrapped wallet session. `accounts/` contains account sessions, HTTP and clients. `claims/` contains native claims and their `wrapped/` variant. `withdrawals/` owns withdrawal review, admission, release and resumption. `transport/` owns the owner's read transport.

Tests live in `packages/backend/tests/api/`.
