# Current project status

**Documentation baseline: 19 October 2026.** This page distinguishes implemented software from confirmed financial acceptance. It is not a live health endpoint.

Lianum contains an integrated mobile wallet, persistent agent, authenticated API gateway, PAEG execution engine, cryptographic proof pipeline and cloud deployment tooling. The current release combines the accumulated mobile, recovery, RPC caching and engine startup fixes. The next acceptance step is to verify the updated public financial routes against the installed engine invocation.

| Area | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Native ETH / BTC / SOL | Recorded phone self-transfers confirmed on public testnets | Complete incoming history and automatic ETH recovery behavior |
| PAEG graph and settlement | Genuine-proof mixed local integration, including dependencies, change and executor payout | Complete the corresponding public, mobile-authorized graph |
| Uniswap / Aave / Morpho | Implemented adapters, mobile flows and scoped local tests | Confirm full public phone round trips for the release |
| Personal funds into PAEG | Existing test funding path uses server-sponsored resources | Complete the personal-wallet funding path before presenting it as available |
| Agent | Persistent chat, streaming, tools, proposals, voice, memory, followups, notifications and observation code | Verify the final combined phone experience and end-to-end financial proposal route |
| Portfolio | Native balances, market valuation and private-operation observations | Complete unified PAEG/DeFi valuation and incoming activity coverage |
| Deployment | Separate API/agent and engine services with retained state and startup monitoring | Readiness must be checked on the installed invocation; deployment is not financial acceptance |

[Validation and evidence](docs/VALIDATION.md) records exact scopes and public transaction identifiers. [The roadmap](ROADMAP.md) gives the remaining sequence. [The full engineering journal](docs/history/2026-10-19/STATUS.md) preserves earlier investigations and measurements without making this entry page a running log.
