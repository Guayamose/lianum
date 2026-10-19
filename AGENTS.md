# Working in Lianum

Lianum is a mobile agent wallet with a separate PAEG financial engine. Start with `README.md`, then `docs/README.md`. The short architecture and financial-execution guides explain the system; linked references retain the deeper implementation detail.

## Locate the code

- `apps/mobile`: React Native wallet, device custody, financial review and agent UI.
- `services/agent` and `packages/agent`: persistent conversation, bounded context, tools, proposals, voice, followups and notifications.
- `services/api-server` and `packages/backend`: authenticated API composition, account authority, network adapters and DeFi.
- `services/paeg-engine` and `packages/engine`: financial startup, graph execution, settlement and recovery.
- `packages/proofs`, `packages/crypto`, `packages/components`: cryptographic artifacts, workers, verification and primitives.
- `packages/mobile-protocol` and `packages/sdk`: shared contracts and client boundaries.

## Preserve the financial boundaries

An agent proposal is not owner authorization. Keep signing keys, exact plan review, scoped read grants, operation identity and uncertain-result recovery intact. Translate presentation text without changing wire identifiers, hashes, amounts, schemas or persisted state keys.

Retained cryptographic artifacts have immutable provenance. Use `docs/SOURCE-GENERATIONS.md` for current pins and explicit source adoption; never rewrite historical hashes to make a check pass. `.local` may contain irreplaceable private custody and runtime state.

## Verify proportionately

Read `docs/WORKFLOW.md`. Run the affected regression or component suite first, and `./dev check` once when closing a code change. `./dev test --changed --plan` describes selection without running it. Documentation alone does not need an economic campaign. UI changes do not require restarting the engine.

Deployment, public readiness and financial acceptance are different results. Report each with its actual evidence. `docs/VALIDATION.md` and `docs/submission/execution-evidence.json` identify the recorded scopes; `STATUS.md` tracks unresolved acceptance.

Keep current documentation and user-visible mobile copy in English. Preserve technical detail in references and put dated investigations in `docs/history`, rather than appending them to the main README or current status. Do not commit secrets, private state, build output or presentation working directories.
