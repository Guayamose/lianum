# EVM development laboratory

<p><a href="../README.md"><img src="assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](README.md) · [Architecture](ARCHITECTURE.md) · [Validation](VALIDATION.md)

The EVM laboratory exercises private funding, graph authorization, conditional settlement, withdrawals and recovery with genuine proofs. It uses a local Anvil network, fresh custody and synthetic **PALT/BLTV** assets. Each profile retains its own source identity, accounting and process-closure evidence.

## Choose a profile

From the repository root:

```sh
./dev lab prepare          # Prepare public artifacts; no network or user proofs
./dev lab                  # SDK flow, genuine proofs and owned-process closure
./dev lab recovery         # Separate delivery-and-timeout recovery scenario
./dev lab browser          # Real wallet DOM, 15 proofs and withdrawals
./dev lab browser-recovery # Timeout recovery through the DOM, 7 proofs
./dev lab osaka            # Deployment and gas-limit smoke; no private proofs
```

The SDK flow funds a private note, reviews exact terms using single-use capabilities, reserves payment, generates PAEG proofs and settles against actual vault delivery. Owner custody processes are subsequently restarted to reopen their original notes, withdraw and redeem shares. SDK/HTTP acceptance does not imply a person used a screen: `browserVisualAcceptance` remains false for that profile.

The independent browser profiles use the real wallet interface in sandboxed Chrome. Automation checks every original term and the initially unchecked confirmation box before importing a single-use capability. Linux custody still prepares amounts, destinations and witnesses outside the browser; this is not autonomous browser or native mobile custody.

Both profiles deliberately discard an HTTP response **after the server has accepted the operation**. The client retains UNKNOWN and reconciles the original journal without another submission. This is a controlled response-loss injection, not a physical network partition. Replays, consumed capabilities, replacement-listener permissions and duplicate economic effects are checked separately.

## Resource and artifact boundaries

The supervisor requires at least **2.5 GiB available RAM**, **5 GiB free disk**, at most **3 GiB RSS per heavy worker** and one heavy worker at a time. Its 90-minute limit reserves time for cleanup. Ctrl+C requests supervised closure of owned processes; a timed-out or interrupted run is not accepted as successful.

The bootstrap prepares a deterministic build in ignored `.local/development-evm/v1/`. The loader authenticates its literal pin in [`development-evm-build.mjs`](../packages/backend/src/operations/deployments/system/development-evm-build.mjs). Missing historical joint-build reports are not recreated as historical evidence.

Original ledger/router source, AST, ABI and artifact hashes remain intact. Eleven recovered verifier builds match their original sources, AST, contracts, compiler and settings. The missing admission relation is rebuilt with its actual circuit, original Noir/Barretenberg toolchain and CRS; its complete report chain is checked before key use. Caller-supplied keys, paths or hashes cannot substitute for that check.

Generation IDs and timestamps are excluded from deterministic identity; ABI, ACIR, verification key, Solidity and compiled artifacts remain fixed. Loaders still authenticate generation receipts. The output-withdrawal verifier uses the public M15 copy whose hash matches the missing M23 copy; that provenance does not replace acceptance of its actual use.

## Read the evidence

Summaries live under ignored `.internal/dev/reports/`. Private keys and journals remain in restricted runtime directories and must not be committed.

| Profile | Summary | Established scope |
| --- | --- | --- |
| SDK flow | `evm-lab.json` | SDK/HTTP contract; retains its own accepted or rejected outcome |
| Browser flow | `evm-browser-lab.json` | Completed DOM flow, settlement, withdrawals and redemption |
| SDK timeout F | `evm-recovery-lab.json` | Delivered node followed by owner-authorized recovery |
| Browser timeout F | `evm-browser-recovery-lab.json` | The same recovery boundary through the real DOM |
| Recovery proof audit | `evm-browser-recovery-proof-audit.json` | Original inputs, proofs, resources and source identity |
| Osaka smoke | `osaka-smoke-lab.json` | Deployment, code/storage verification and gas limits |

Each attempt uses fresh accounts, custody keys, journal and Anvil state. Pinned public artifacts may be reused; earlier private proofs and rejected attempts are not repackaged as fresh acceptance. The earlier SDK run generated 15 proofs but failed at redemption through an incompatible keeper route. The corrected bridge was checked with genuine D26/W39 and then accepted in the separate browser run below; the earlier SDK result remains rejected.

### Completed browser flow

The **8 October 2026** browser attempt `87c263aa-32a0-4832-9f30-67147fc552f4` generated 15 genuine proofs: deposit_balance, deposit_intent, authorization, reservation, dependency, ready, admission, four node proofs, settlement and three withdraw_balance proofs.

The DOM funded, reviewed and authorized the graph. An intentionally dropped response produced UNKNOWN with one original POST; reconciliation recovered the same operation. Both owner processes were absent during delivery and settlement. Replacing the listener and reopening the same coordinator journal rejected the previous listener's capability; subsequent recovery/reconciliation added no proof, delivery or payment.

| Economic result | Recorded amount |
| --- | ---: |
| Owner change withdrawn | 380 PALT |
| Destination withdrawal | 100 BLTV shares |
| Executor payout withdrawn | 120 PALT |
| Share redemption | 100 shares → 100 PALT |
| Final BLTV, vault assets/shares, pool backing and reserves | 0 |

The recipient PALT amounts were **380 / 120 / 100**. Duplicate native withdrawal and redemption were rejected. Reviewing confirmed EXIT preserved the original private statement. Padding did not become reusable balance or capacity; indefinite rollover was not accepted.

The audit checked 15 proof/input pairs, 11 original completed job receipts and retained telemetry for four inherited proofs. All 16 identity checks passed; **402 captured sources** remained unchanged. The supervisor verified closure of 55 owned PIDs and its own process. Both Chrome processes retained `NoNewPrivs=1`, `Seccomp=2`, original UID/group/session, exit 0 and no orphan process. Their peak RSS values were 886,173,696 and 889,397,248 bytes; the largest prover reached 3,033,706,496 bytes. Minimum available RAM was 14,165,032,960 bytes; worker duration was 1,167,784.6 ms.

`walletBrowserEvmFlowCompleted=true` and `manualConsentContractVerified=true` describe automated DOM acceptance. `walletSdkEvmFlowCompleted=false` retains the separate SDK outcome. `keeperRestart=false`, `nodeRestart=false` and `coordinatorProcessRestart=false`: reopening a journal or replacing a listener does not demonstrate a process restart. Owner custody restart was checked separately. `fullWalletAcceptance` remains false.

<details>
<summary>Browser-flow evidence identities</summary>

| Artifact | SHA256 |
| --- | --- |
| Original result | `9c4497ee98b76599e75cb455911af6cd766e1b60cdec26dc80a7dfcdc19fc001` |
| Original resources | `3ea033d43e3e4279dc1d5c48b03bfdd7cc000e58a806112254fea5a82a5253ed` |
| Captured source closure | `41e2c8143da24ffd80804fc277fbd670f8240040be91e143243f798a9135b3b6` |
| Browser summary | `ad69723c5209caa6d8488405754409f4f6754ee6da2927f14a8d1122f6dda3a0` |
| Separately captured Python wrapper, 19,220 bytes | `7c33576af7d86798301fcb8cde12008c850dae1311ade4055f9609b9f6dfcac4` |

Original directory: `.internal/runtime/omnichain-flat-profile/flat-wallet/.local/manual-wallet-browser-acceptance/attempt-87c263aa-32a0-4832-9f30-67147fc552f4/`. The wrapper was reviewed at `2c0d8e5` and captured separately from the financial source closure.

</details>

### Cold proof timings

These measurements come from the **same browser attempt**, recorded in `.internal/dev/reports/evm-browser-cold-proof-timings.json`. No new benchmark was launched. Rows with several proofs show their mean. External duration includes work beyond initialization and proving; inherited receipts without stage timings remain unspecified.

| Relationship | Proofs | Init (s) | Prove (s) | External total (s) |
| --- | ---: | ---: | ---: | ---: |
| `deposit_balance` | 1 | — | — | 38.700 |
| `deposit_intent` | 1 | 29.494 | 6.974 | 37.076 |
| `authorization` | 1 | 29.855 | 95.628 | 127.219 |
| `reservation` | 1 | 30.367 | 10.216 | 41.291 |
| `dependency` | 1 | 31.215 | 18.877 | 51.186 |
| `ready` | 1 | 31.177 | 27.879 | 60.099 |
| `admission` | 1 | 30.224 | 48.329 | 79.625 |
| `node` | 4 | 31.536 | 11.205 | 43.739 |
| `settlement` | 1 | 30.279 | 11.206 | 42.274 |
| `withdraw_balance` | 3 | — | — | 51.516 |


Authorization took 127.219 s externally, including 95.628 s proving. Each of the 11 PAEG jobs initialized a new worker, at roughly 30 s per initialization. D26's 38.700 s, D27's approximately 37.1 s and W39's 51.516 s describe these cold development-host profiles, not end-to-end phone latency. Reusing initialization requires separate checks of role isolation, witnesses, keys, inputs, ZK, source identity and process closure. Hot-worker performance was not measured.

### Timeout F recovery

The recovery profile interrupts after one verified delivery and before global settlement. It preserves the FAILED admission and its catalog fence, reopens the same journal and replaces the listener while both owner processes remain absent. The local Anvil observer clock advances to the originally authorized cutoff; the owner then reviews and confirms recovery F. Repeating recovery or reconciliation produces no extra proof, payment, credit or delivery.

| Final state | Recorded result |
| --- | --- |
| Source available | **500**, including **120 recovered**; 380 change + 120 return |
| Destination | 100 private shares retained |
| Reserved executor payment | 120 withheld |
| Executor result | Loses the 100-unit delivery; receives no reserved payout |
| Reserves | 0 |

Recovery is already included in available balance and must not be added twice. The flow does not manufacture a later global settlement. The original failed operation remains publicly filtered as `FLAT_ACCOUNT_OPERATION_FAILED`; the private controlled-injection code is not exposed.

The SDK attempt `59fba9ff-2298-449a-b825-393c002b57e0` generated seven genuine proofs and completed in 514,386.8 ms with unchanged sources and supervised closure. It demonstrates local SDK/HTTP recovery, separately from browser acceptance.

The **8 October 2026** browser attempt `0b44fe86-23a2-4297-bff4-abb4e604d3e4`, started at `5a0c544`, generated seven fresh proofs: deposit_balance, deposit_intent, authorization, reservation, dependency, ready and recovery. The DOM confirmed funding, graph authorization and F. Response loss retained UNKNOWN with one POST. Replaced-listener replay and repeated F were rejected without duplicate effects.

After owner custody restart, the original notes retained the state above: vault assets/shares **100/100**, pool backing **500/100**, and the catalog fence active. No withdrawal was attempted in this recovery profile.

All 16 identity checks passed. The proof audit checked six original manifest/result/resource groups and one inherited telemetry record, with verification and ZK enabled. **410 source files** matched by length/hash. The 36 owned PIDs, supervisor and flow/proving locks were absent after closure. Both Chrome processes retained kernel sandboxing and original identities, exited 0 and left no processes; peak RSS was 883,273,728 and 888,233,984 bytes. Worker/supervisor durations were 593,999.5 / 595,515.4 ms; peak prover RSS was 2,975,383,552 bytes and minimum available RAM 13,222,424,576 bytes.

`walletBrowserTimeoutFRecoveryCompleted=true`, `actualTimeoutFRecoveryAcceptance=true` and `manualConsentContractVerified=true` apply to this route. Full browser happy-flow, SDK-flow and full-wallet acceptance remain false for this attempt. Keeper, node and coordinator process-restart flags remain false; owner custody restart is separate.

<details>
<summary>Timeout-recovery evidence identities</summary>

| SDK F artifact | SHA256 |
| --- | --- |
| Result | `b6736a5eb09a0ce6f90379ba12e6fc850cf0d8e274b885e8654f7d817b911313` |
| Resources | `b065c3a10bc23ebb518ad6d1bb0081843c597878142da589ba6c994f69cddd7e` |
| Source closure | `74512f9fb832f88c202fc9a360d4733edb94c7f8070bdc96e2debc4acf411c1b` |

| Browser F artifact | SHA256 |
| --- | --- |
| Original result | `cdaed0f6504a4702f79ae694338380b6275505c04a63802c00e9c7ac90f3d977` |
| Original resources | `4f822733c86f42c95d65bcab801d657f94bb2119ccec49786e37cb965a5581bd` |
| Original source-pins file | `09e62a69a29b499b9f590e1ac28211d37d426f4e50379985c649848839b38640` |
| Compact serialization of the same source-pins object | `38c7476f0b92745d54baba7617c88eaf5aa67d96d19fb20978998e6020929ddc` |
| Browser F summary | `0ff6e8c1419b5f822c2fd8339c761742171d0599a282a0dd66d8d4406bc60d06` |
| Separately captured Python wrapper, 20,261 bytes | `6214c9ac96e2bb2c12660fe72efd8ec30a5ed344e43fcce6ef5674a342e96035` |

The two source-pins hashes identify equivalent JSON objects with different whitespace, not different sources. Originals: `.internal/runtime/omnichain-flat-profile/flat-wallet/.local/manual-wallet-browser-timeout-recovery/attempt-0b44fe86-23a2-4297-bff4-abb4e604d3e4/`. The separately captured wrapper remained unchanged at closure.

</details>

### Osaka deployment smoke

The Osaka profile enables a **16,777,216 gas transaction limit**, with a 30-million block limit. It retains separate source/results from the Cancun private-proof profiles.

Attempt `63e7918a-994e-44af-a766-86171c68ce90` completed **47 transactions**: 44 CREATEs, two pool registrations and one public one-unit transfer. It verified code, constructors and storage for 12 verifiers, libraries, hubs, pools, assets and routers. Peak gas used was **12,211,265**; largest runtime code **24,558 bytes** and initcode **30,924 bytes**.

Zero gas, cap+1 and a 30-million request were rejected before registration/submission. A cap+1 request to the actual local node was also rejected, leaving heads, nonces, balances, mempool and journal unchanged. The audit checked all 47 receipts and 390 sources. Three owned PIDs and two locks closed without forced termination; scratch was removed. Worker/supervisor durations were 5.49 / 5.71 s. **No private proofs were generated.**

The earlier rejected attempt `cc834a62-4247-433d-ab24-66e0b9ced1ce` made no deployments: its assertion expected a different RPC error branch. The corrected assertion uses the authentic message and retains state/fence checks; eight focused host regressions passed.

<details>
<summary>Osaka evidence identities</summary>

| Artifact | SHA256 |
| --- | --- |
| Result | `a53a8beaa1a285ebb2fc4739fff6a13f84cb983ff9cabd62c034131b1db3e551` |
| Resources | `2ad2878653d6a6439b03f8ca1b942b8ca67493555aa9a8c7d308750dd1af8da4` |
| Source closure | `db5aa70ce21d42e5c8047578e05db6a213b5f283c3a880e8c6cdc4c137fefed7` |

</details>

## Interpret the scope

These profiles establish specific local economic and software contracts. They do not establish public-network finality, independent operators, metadata anonymity, native mobile custody, seven-network acceptance or full backend process recovery. Browser interaction is automated, with witness preparation in Linux custody. Neither cold timing nor a deployment smoke certifies product performance. Private settlement under Osaka requires its own proof-producing acceptance.

[Validation](VALIDATION.md) · [Laboratory profiles](LAB-PROFILES.md) · [Network and DeFi acceptance](../packages/backend/docs/LOCAL-ACCEPTANCE.md) · [Source generations](SOURCE-GENERATIONS.md)
