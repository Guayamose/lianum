# PAEG: private plans with verifiable settlement

The Private Atomic Execution Graph is Lianum's financial core. A user can authorize a structured plan whose steps span different networks and financial primitives. The engine tracks what each step must prove, when its dependencies are satisfied, how much value is reserved and when executors may be paid.

That makes the plan itself a first-class financial object. It has authority, a budget, a lifecycle and recoverable evidence, beyond a sequence of independent RPC calls.

## From intent to settlement

1. **Propose.** The user or agent describes supported payments or a financial route. An agent proposal is not permission to spend.
2. **Prepare.** The backend resolves concrete operation data, dependencies, amounts, network context and validity windows. The mobile presents those terms for review.
3. **Authorize.** The device approves the exact plan under its owner authority. The signed terms include the relevant budget and executor compensation.
4. **Reserve and execute.** The engine accounts for committed value, admits operations and tracks native or venue-specific results. Dependencies constrain which steps can proceed.
5. **Prove and reconcile.** Proof workers and chain readers produce or verify the evidence required by the applicable transition. Lost responses retain the original operation identity.
6. **Settle or recover.** Completed plans follow their payout and change rules. Interrupted or expired work follows its documented recovery route, respecting effects that already happened.

## What “atomic” means here

PAEG applies conditional economic settlement to the plan and its private accounting. Independent chains do not share a rollback mechanism. An already confirmed Bitcoin, Ethereum or Solana transfer cannot be undone by marking the graph failed. Recovery must account for actual delivery, retained reservations, remaining value and the applicable executor terms.

The strength of the design is making those conditions explicit and verifiable. It is not a promise that arbitrary third-party protocols or every external side effect can be reversed.

## Operation families

| Family | Implementation role | Evidence to consult |
| --- | --- | --- |
| Native ETH, BTC and SOL transfers | Device wallet review/signing with network adapters | Recorded phone self-transfers in [execution evidence](submission/execution-evidence.json) |
| PAEG payments and dependencies | Approved graph, reservation, delivery and settlement | Local mixed financial integration; public graph acceptance remains separate |
| Private funding, notes and withdrawals | Source-bound accounting, proof construction and recovery | Domain tests and original-generation acceptance records |
| Uniswap | Prepared swap bound to a supported operation and beneficiary | Local genuine-proof integration; public end-to-end acceptance pending |
| Aave and Morpho | Position-aware investment/withdrawal adapters and mobile review | Local venue tests and recovery regressions; public phone round trips pending |
| Executor payout and returned change | Conditional settlement and final withdrawal paths | Local integration accounting: 600 units = 200 change + 400 executor payout |
| Stop, reconcile and recover | Resume the same accepted work and resolve its retained state | Focused recovery suites and lifecycle contracts |

“Implemented” describes code and its stated validation level. It does not mean every combination of these families has completed on public networks. The current mobile native payment proposal profile is bounded; arbitrary graph size belongs to the broader design, not to an unlimited deployed capacity claim.

## A concrete integration result

A recorded local campaign executed a four-node route combining Uniswap and native ETH, BTC and SOL delivery. It produced **21 real proofs including D27**, completed five withdrawals, returned 200 units of change and paid four executors 100 units each from a 600-unit synthetic deposit. Final held and backed amounts were zero. The received swap token remained a separate, unwithdrawn asset.

The proof pipeline, SDK, custody and consumers were real. The network environments and funding in this campaign were local and synthetic. This is strong integration evidence for the composed system; the [recorded summary](submission/execution-evidence.json) preserves its generation and scope.

## Speed and restart behavior

Startup authenticates retained resources and reconciles the state required by the selected composition. The current implementation reduces repeated work with an anchored SQLite cache of finalized public reads, concurrent request deduplication, RPC batching and scoped block reuse. Mutable balances, nonces and permissions still require fresh reads.

This cache does not serialize the complete live cryptographic composition, nor does it make a previous financial acceptance transferable to new code. Startup time depends on retained state, provider limits and the selected profile. Measure the installed invocation rather than promising a fixed restart time.

The user-facing path similarly separates accepted work from observation: pending operations keep their identity, reads have bounded windows, and polling does not submit another financial operation. UI copy and documentation can be updated without restarting the engine.

## Follow the code

- [Engine package](../packages/engine/README.md): graph semantics and shared contracts.
- [Product API](reference/product-api.md): SDK, preparation, authorization and recovery boundaries.
- [Backend modules](MODULES.md): accounts, native adapters, claims, DeFi and persistence ownership.
- [Engine deployment](../infra/google-cloud/paeg-engine/README.md): retained startup and operating procedures.
- [Security model](PRIVACY-AND-OPERATIONS.md): custody, witness visibility and remaining trust assumptions.
