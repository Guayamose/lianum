# Diagnosis of CLAIM and GRAPH audits

<p><a href="../README.md"><img src="assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](README.md) · [Architecture](ARCHITECTURE.md) · [Validation](VALIDATION.md)

From the root, in Linux/WSL with the restored originals:

```sh
./dev lab audit-base
```

The command prepares public artifacts and creates an EVM, Bitcoin and Solana laboratory with synthetic keys. Then he calls sequentially to `audit()` of three CLAIM operators and three original GRAPHs, on empty inventories. It retains the limits, verifications, identity and cleanliness of the existing supervisor. Do not create owners, funds, tests, authorizations or payouts during measurement. The bootstrap does deploy contracts and creates local keys.

The summary is reproduced in `.internal/dev/reports/empty-audit-lab.json`. Each attempt retains its private sources, resources, results and diagnoses under `.internal/runtime/omnichain-flat-profile/flat-wallet/.local/native-claim-empty-audit-metrics-v1/`. Do not run another laboratory or provide at the same time.

## First acceptance

I'm trying `09f6f025-0086-4dc8-9838-5c624bc82692`, on `4c61d57`accepted and closed on October 8, 2026. The entire command lasted 64,308 s, including preparation and booting. The six calls ended:

| Operator | Call Time |
| --- | ---: |
| CLAIM 0 | 307,197 ms |
| CLAIM 1 | 338,083 ms |
| CLAIM 2 | 319,190 ms |
| GRAPH 0 | 674,504 ms |
| GRAPH 1 | 677,792 ms |
| GRAPH 2 | 646,467 ms |

The root review brought together 461 source/API/vendor files and verified 6.459 public files, generated and original before/after, plus 13 preparation artifacts. The 21 PIDs retained in the observations and receipts were later absent; the four locks disappeared. No sign of the auditor or forced closure. Scratch and synthetic keys/ledgers were removed. Solana preserves `nativeOrderlyExit=false` and `nativeStopFailure=null`.

Result SHA256 `3e16c78f0368a15efde0852edcc7cc515a18eb92135f90ff1c21c5c663989ed0`. SHA256 resources `2e161218baece4f9899380bacecc80b1370e5192d441dbee61900f4bff91cd7c`. SHA256 sources `5435c42840db8f585e7e19f889bcc1a2e800756b3ee8ada89d8d12108920f40e`.

The V4 epochs and persistent stories retain their zero values in the eight operators. This counter has a specific scope: it does not measure all signatures or the use of ephemeral/previous keys. The CLAIM intervals overlap and your CPU includes other process jobs; there are no RPC counters. This acceptance measures the empty base and ** still does not explain the expired Solana payout with funds**, nor does it accept a financial journey.

The first physical capture failed before starting strings because the preparer executes a fixture of the workspace. Their rejection remains preserved. The correction includes exactly that fixture and its 23 physical imports, without modifying the original worker or admitting other routes.
