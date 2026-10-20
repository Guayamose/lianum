# Wallet Shared Client

[Lianum documentation](../../../../../docs/README.md) · [Architecture](../../../../../docs/ARCHITECTURE.md) · [Validation](../../../../../docs/VALIDATION.md)

This code serves both the browser and the local SDK. It has no keys, economic authority or persistent storage. The interface revisions describe the original terms; the backend retains the authorization and execution decision.

| Folder / File | Responsibility | Where to change something |
| --- | --- | --- |
| `validation/` | Checking payloads of reading, identity, diary, graphs, transfers and stock responses | Add or correct a contract check |
| `actions/catalog.mjs` | Fixed catalogue of routes and actions | Declare an action already implemented by the server |
| `actions/account-context.mjs` | Link revision to original asset, generation and application | Modify the selection of an asset or request |
| `actions/rules.mjs` | Build the exact body and decide if you can request an action | Change availability or allowed fields |
| `presentation/` | Project readings and draft revisions, no effects | Change labels, units or state representation |
| `transport/http.mjs` | An HTTP request with cancellation, no cache, cookies or retry | Change the transport while retaining your guarantees |
| `session.mjs` | Maintain review, grants, tokens, read status and uncertain outcome of a session | Change cycle read → review → confirm |
| `view-model.mjs` | Supported input re-exporting exactly the previous API | Compatibility only; implementing in the corresponding responsibility |

Dependencies flow from the session to rules, presentation, validation and transportation. The rules and validators do not matter the session or HTTP; the transport ignores the actions. The internal graph does not support cycles. Each module imports its specific dependencies and does not receive a shared context.

For new code, use the specific public entry of `@lianum/mobile-protocol/wallet/…`: `action-catalog`, `account-context`, `action-rules`, `state-validation`, `projection`, `native-identity`, `values` o `session`. `wallet/client` retains compatibility for existing integrations.

The tests of `packages/backend/tests/api/wallet/client/wallet-client-model.test.mjs` check unchangeable revisions, lost response, cancellation of HTTP body, reconciliation of original request and absence of retry. `packages/mobile-protocol/tests/wallet-client-architecture.test.mjs` retains exported identities and rejects cycles or dependencies that reverse these responsibilities.

The browser modules are served by the explicit list of `packages/backend/tests/fixtures/api/wallet/application.mjs`. When adding one, register that resource; never post the entire folder.
