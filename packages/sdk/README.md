# Proposal and observation SDK

<p><a href="../../README.md"><img src="../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../docs/README.md) · [Architecture](../../docs/ARCHITECTURE.md) · [Validation](../../docs/VALIDATION.md)

The SDK exposes typed external proposal, preparation, public operation and finite-read contracts for the paired product. It does not create custody or issue financial authorization.

| Export | Responsibility |
| --- | --- |
| `@lianum/sdk` | Shared SDK entry points and public type declarations |
| `@lianum/sdk/agent` | Agent proposal contracts |
| `@lianum/sdk/agent/preparation` | Concrete preparation bound to the existing owner/device path |
| `@lianum/sdk/agent/operation` | Public operation identity and observation contracts |
| `@lianum/sdk/contracts` | Shared product contracts |

A proposal proceeds through mobile review and owner approval. Read access remains finite and distinct from prepare/send authority; unknown outcomes retain their original identity.

[API and SDK reference](../../docs/reference/product-api.md) · [Financial lifecycle](../../docs/FINANCIAL-EXECUTION.md) · [Mobile protocol](../mobile-protocol/README.md)
