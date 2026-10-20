# Current project status

**Acceptance snapshot: 20 October 2026.** This is the submission baseline, not a live health endpoint. Implemented capabilities, local integration and public financial acceptance have separate scopes.

Lianum integrates a mobile wallet, persistent agent, authenticated API gateway, PAEG execution engine, genuine proof pipeline and cloud deployment tooling. The recorded V47 invocation reached READY; pinned public-route checks passed for five current connection profiles and the historical phone route. The latest phone acceptance and submission work did not restart the engine.

Six public transaction hashes were freshly verified on 20 October. The original Source4 note was funded and its full **0.000001 test ETH** was withdrawn to the reviewed phone address. The phone showed confirmation, the withdrawal event matched the recipient and amount, and its canonical Sepolia block was finalized. [Execution evidence](docs/submission/execution-evidence.json) and the [public verification snapshot](docs/submission/public-transaction-verification.json) retain the hashes and exact scopes.

| Area | Recorded result | Remaining acceptance |
| --- | --- | --- |
| Native ETH / SOL / BTC | Phone-originated self-transfers; fresh finalized ETH/SOL verification and 407 BTC confirmations at the recorded tip | Broader incoming history and automatic recovery behavior |
| PAEG note lifecycle | Original Sepolia deposit and phone-authorized owner withdrawal confirmed; same pool and custody retained | Complete public payment graph, dependencies, settlement and executor payout |
| Repeated public plans | Authenticated same-pool successor implemented; phone request reproduced the cumulative quota rejection | Apply the already approved 4→5 increase after correcting finality observation; verify the actual successor handoff |
| Local mixed integration | Four nodes, native EVM/BTC/SOL + Uniswap, 21 genuine proofs, five withdrawals; 600 synthetic units settled as 200 change + 400 executor payouts, held/backed zero | Corresponding public/mobile execution |
| Uniswap / Aave / Morpho | Original component and genuine-proof local scopes; correct public test tokens and separate DeFi budget funding verified | Public swaps and investment/redemption round trips; a prepared portable CRS cache-path fix is not deployed |
| Personal funds into PAEG | Test funding currently uses operator-sponsored resources | Personal-wallet funding path and combined private/DeFi valuation |
| Agent | Persistent chat, streaming, tools, proposals, bounded context, voice, followups and notifications implemented | Final combined device experience and public agent-originated financial plan |
| Repository / submission | Latest code fixes pushed; the code push passed GitHub CI; English source documentation and curated public evidence available | Rehearse and submit the final presentation/materials within the organizer's deadline |

## Current continuation blocker

The new-plan request was rejected at the signed limit of four cumulative internal sources. The owner-approved quota-only increase to five was attempted through the existing live financial control and rejected with `NATIVE_WALLET_SEPOLIA_SOURCE_EPOCH_PENDING_FENCED`. The real withdrawal is already finalized on-chain, while the live Source journal still records it as CONFIRMED. The signed financial epoch and all spending limits remain unchanged. The rejected review was preserved as evidence and removed from the active review slot; no next plan or additional transfer was created.

The next financial correction must reconcile that canonical finality through the Original observer before a fresh checkpoint-bound review, or verify the exact finalized receipt within review eligibility while preserving the retained journal. No journal is to be edited manually. Public payments, swaps and redemptions that could not pass their prerequisites remain **unexecuted**, rather than proven failures.

The repository includes a verified public CRS cache-location correction (`7dc5aeb1`) and a mobile correction that exposes bounded successor rejections (`0e04b8fe`). The latter is installed on the phone; the proof-cache correction is not deployed to the recorded engine. Repository host checks passed 491/491; focused mobile/proof checks, TypeScript and the standalone APK build passed in their recorded scopes. These counts do not establish public financial acceptance.

[Validation](docs/VALIDATION.md) explains reproduction and evidence boundaries. The [roadmap](ROADMAP.md) records the remaining sequence; the [engineering history](docs/history/README.md) retains earlier decisions and measurements. Frozen artifacts and older accepted campaigns keep their original source identities.
