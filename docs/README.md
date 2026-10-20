<p><a href="../README.md"><img src="assets/lianum.svg" width="150" alt="Lianum"></a></p>

# The Lianum documentation library

**From a financial conversation to a verifiable plan.** This library explains the product, the execution model and the implementation behind it. The reading routes lead into detailed references without requiring a chronological engineering journal.

## Understand the system

| Read | The question it answers |
| --- | --- |
| **01 · [Architecture](ARCHITECTURE.md)** | Where do the wallet, agent, gateway, engine and workers run? |
| **02 · [PAEG execution](FINANCIAL-EXECUTION.md)** | How does one approved graph bind actions, proofs and settlement? |
| **03 · [Persistent agent](AGENT.md)** | How does the same conversation keep working with bounded context? |
| **04 · [Security and privacy](PRIVACY-AND-OPERATIONS.md)** | Who may sign, propose, observe, execute and see private inputs? |
| **05 · [Validation](VALIDATION.md)** | Which results have public receipts, local proofs or host verification? |
| **06 · [Development](DEVELOPMENT.md)** | How do I prepare a checkout and run focused checks? |

[![Custody, coordination and execution in the current system](assets/system.svg)](ARCHITECTURE.md)

## Choose a reading route

**Review the project:** [overview](../README.md) → [PAEG](FINANCIAL-EXECUTION.md) → [security](PRIVACY-AND-OPERATIONS.md) → [evidence](VALIDATION.md).

**Build on the project:** [development](DEVELOPMENT.md) → [repository map](STRUCTURE.md) → [module ownership](MODULES.md) → [API and SDK](reference/product-api.md).

**Operate a deployment:** [API service](../services/api-server/README.md) → [engine deployment](../infra/google-cloud/paeg-engine/README.md) → [agent configuration](../services/agent/README.md) → [resources and source generations](SOURCE-GENERATIONS.md).

## Implementation references

| Domain | Source and reference |
| --- | --- |
| Mobile wallet | [Application](../apps/mobile/README.md) · [device installation](USB-MOBILE.md) · [shared protocol](../packages/mobile-protocol/README.md) |
| Agent | [System guide](AGENT.md) · [service configuration](../services/agent/README.md) · [domain source](../packages/agent/src) |
| API and accounts | [API service](../services/api-server/README.md) · [API/SDK contract](reference/product-api.md) · [device-authorized accounts](ORIGINAL-ACCOUNT-V2.md) |
| Financial execution | [Engine](../packages/engine/README.md) · [backend](../packages/backend/README.md) · [Solidity contracts](../contracts/README.md) |
| Cryptography | [Proof workers](../packages/proofs/README.md) · [circuit components](../packages/components/README.md) · [cryptographic primitives](../packages/crypto/README.md) |
| Source integrity | [Source generations](SOURCE-GENERATIONS.md) · [portable bundles](../packages/environment/README.md) · [retained protocol compatibility](reference/protocol-compatibility.md) |
| Network laboratories | [Profiles](LAB-PROFILES.md) · [EVM laboratory](EVM-LAB.md) · [network and DeFi acceptance](../packages/backend/docs/LOCAL-ACCEPTANCE.md) · [claim diagnosis](CLAIM-AUDIT-LAB.md) |
| Tooling | [Workflow](WORKFLOW.md) · [generated command catalog](COMMANDS.md) · [local resources](LOCAL-ENVIRONMENT.md) |

## Evidence records

The [validation guide](VALIDATION.md) interprets the retained records together. Machine-readable files preserve exact operation hashes, source identities and verification scope:

- [Execution evidence](submission/execution-evidence.json)
- [Public transaction verification](submission/public-transaction-verification.json)
- [Recorded host and mobile build checks](submission/english-delivery-validation.json)

---

[Project overview](../README.md) · [Product direction](../PROJECT-VISION.md) · [Repository map](STRUCTURE.md)
