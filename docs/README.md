# Explore Lianum

Lianum brings an always-on financial agent, a mobile wallet and a verifiable execution engine into one system. The interesting part is the boundary between them: an agent can propose a complex financial plan while the wallet retains the authority to approve it and the engine checks its execution and settlement.

Start with these six documents. They are the current explanation of the product; implementation details and earlier measurements remain linked below.

| Read | What you will learn |
| --- | --- |
| [Project overview](../README.md) | The idea, differentiators, working components and first commands |
| [Architecture](ARCHITECTURE.md) | How the phone, agent, gateway, engine, proof workers and networks fit together |
| [Financial execution](FINANCIAL-EXECUTION.md) | PAEG plans, dependencies, authorization, proof binding, settlement and recovery |
| [Development workflow](WORKFLOW.md) | Install, run and validate only the component you change |
| [Security and privacy](PRIVACY-AND-OPERATIONS.md) | Keys, permissions, trust boundaries, data exposure and operating assumptions |
| [Validation and evidence](VALIDATION.md) | What has been demonstrated, how to reproduce checks and what remains open |

## Find the implementation

| Area | Entry point | Detailed reference |
| --- | --- | --- |
| Mobile wallet | [`apps/mobile/App.tsx`](../apps/mobile/App.tsx) | [Mobile guide](../apps/mobile/README.md), [USB/device setup](USB-MOBILE.md) |
| Persistent agent | [`services/agent/src/entry.mjs`](../services/agent/src/entry.mjs) | [Agent service](../services/agent/README.md) |
| Public gateway | [`services/api-server/src/entry.mjs`](../services/api-server/src/entry.mjs) | [API service](../services/api-server/README.md), [product API/SDK](reference/product-api.md) |
| Financial engine | [`services/paeg-engine/src/entry.mjs`](../services/paeg-engine/src/entry.mjs) | [Engine library](../packages/engine/README.md), [cloud deployment](../infra/google-cloud/paeg-engine/README.md) |
| Chain adapters and DeFi | [`packages/backend`](../packages/backend) | [Module boundaries](MODULES.md), [network/DeFi laboratory](../packages/backend/docs/LOCAL-ACCEPTANCE.md) |
| Cryptography and proofs | [`packages/proofs`](../packages/proofs) | [Source generations](SOURCE-GENERATIONS.md), [proof workers](../packages/proofs/README.md) |
| Repository navigation | [`STRUCTURE.md`](STRUCTURE.md) | [Command reference](COMMANDS.md), [laboratory profiles](LAB-PROFILES.md) |

## Status, submission and history

The [current status](../STATUS.md) and [roadmap](../ROADMAP.md) separate implemented functionality from pending acceptance. [Machine-readable execution evidence](submission/execution-evidence.json) includes transaction hashes and the scope of the recorded local integration. [Submission requirements](submission/requirements.json) record the delivery checklist.

The [historical record](history/README.md) preserves earlier engineering decisions, failure analysis, measurements and acceptance reports. Read it for provenance, rather than treating every old status entry as a description of the current release. Frozen cryptographic artifacts retain their original bytes and identities.
