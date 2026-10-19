# Local Network Acceptance and DeFi

Record of October 8, 2026. Laboratories use state and new keys, fictitious funds and own processes. Bitcoin retains the standard genesis of reggest. A RPC reading test, a local transfer and a complete private operation are different criteria.

## DeFi oficial

Run from the root:

```sh
./dev node tests/integration/defi/metamorpho-cycle.mjs --run-local-fixture
./dev test packages/backend/tests/defi/withdrawals/private-vault-exit.test.mjs
```

The first command displays the restored official compilations of Uniswap V3, Morpho and MetaMorpho, verified with the original manifest. Check a Uniswap swap with exact output and maximum expense; then deposit in MetaMorpho and redeem shares with minimum, time and reference protected within the same transaction. Check for atomic reversals, re-opening of the surviving keeper, and absence of second shipments. The process shuts down and removes your scratch.

`owned-metamorpho-vault.mjs` connects to the existing service `private-vault-exit.mjs`: accepts only an original account and protocol, a confirmed private withdrawal and its original callta/receive, with current observed backing. Use `previewRedeem` and `maxRedeem` officials to quote; does not apply the formula of the test vault. The underlying exit goes to the same proprietary address and remains public. No comment creates a private balance. The bridge features regressions of loss of response, journal, replay, obsolete backing and copied capabilities.

The new acceptance of private shares is executed from the root with:

```sh
./dev lab metamorpho
```

New result **approved**, with two genuine tests: private financing `deposit_balance` and withdrawal `withdraw_balance`. The initial source of shares is an explicit public deposit in the official MetaMorpho of the laboratory: 1.000.000 underlying units produce 1,000,000,000,000 share. The private note, its original EXIT and backing precede the official redemption. The restart of the owner/coordinator with surviving credentials, the complete discarded redemption response, the reopening/reconciliation of the journal and duplicates without second shipment are checked. It ends with private balance, backing, liabilities and supply shares at zero; it returns the underlying to the public owner.

The supervisor accepts the result, unchanged sources and complete closure of the group itself. Anvil ends with exit0, no signals, and eliminates his scratch. The two tests are independently linked to the original public receipts stored: identity, bytes, key, verification, ZK, exit0 and closing of resources. The tour lasted 122 s; the peak of the worker of proofs was 1.341.374.464 bytes, that of the main worker 468.180.992 bytes and the minimum available RAM 17.218.490.368 bytes. The guard retains the original boundaries. The 20 regressions of the bridge pass. The wrapper was validated in syntax and rejection of options; the previous result corresponds to the supervised original runner, without a second execution.

I'm trying `.local/private-metamorpho-flow/attempt-6cd6b65d-7e39-4357-8f95-6bc6756ffb56`: result SHA256 `f8c7532d31444dafe929f892629a8136a85b2c4646419e800185f4f25767d45e`resources `48edda2248db093d458817c36e8a15153cde0fb6863dd88e5a52a85dd7bcd5af` and sources `c24b27dfc5475c2f1ab9ab40ed2754a1c41a48507a611a5c180ac1128ed78d0c`. The human summary `.internal/dev/reports/metamorpho-lab.json` retains the range `PRIVATE_SHARE_NOTE_EXIT_AND_PUBLIC_METAMORPHO_REDEMPTION`, accepted, two tests and SHA256 `14436a5844d947a62908a944719fdff64c2953061de9e75f56c996e177a78858`.

Private entry D27 from official protocols is also checked with the new profile:

```sh
./dev lab defi
```

I'm trying `e8eb31eb-d500-4d52-b937-ebc711bdd3d4`**accepted**, four new D27/W39 tests. The Uniswap V3 swap delivers exactly 1.000 output units and spends 1.005 public input, within the maximum of 2.000. MetaMorpho spends 1.000.000 public underlying and mints exactly 1,000,000,000,000 share. In both cases the original router delivers the output to a private note while the owner is disconnected; its original observation and D27 precede the balance. The owner's child process is restarted; coordination is closed and reopened within the same process with surviving credentials. Repeating reconciliation does not send again. The original HTTP W39 withdrawal confirms the EXIT; it ends with private liabilities and allowances at zero. The official MetaMorpho redemption is linked to the EXIT and the original backing: its complete response is discarded and the same receipt is recovered, without a second shipment.

The supervisor accepts intact sources and complete closure: worker and Anvil exit0, without signals, no live process or lock, scratch removed. Duration 228 s; peak of proof worker 1.368.895.488 bytes, own group 2.172.764.160 bytes and RAM available minimum 14.901.571.584 bytes. It maintains the original boundaries and the two backslidings of politics. The four original evidence receipts are retained with identities, bytes, VK, ZK, verification and closure; no evidence from the old package is used for this attempt.

I'm trying `.local/development-defi-entry-roundtrip-v1/attempt-e8eb31eb-d500-4d52-b937-ebc711bdd3d4`: result SHA256 `19e4af3791a28b88e7b37e9db436352964f9ad361b55b136df33e569aebddaea`resources `453610d3ab40823d99b75481b8c04724e6b69831c61e4cac1d6d11f0a3fdba47` and sources `115dc3d7099845e366dde0ef3a0c872d0846523043ec6b7608d4cbb915ee1cc8`. Resumen humano: `.internal/dev/reports/defi-entry-lab.json`.

The initial input and final output are public. This profile does not provide admission of a registered leg, PAEG conversion, graph, provider reimbursement, independent operators, complete wallet or recovery after losing the keeper/node. The Uniswap output does not prove an inverse swap; the underlying MetaMorpho redeemed is not counted as a new private balance. DeFi composition between networks and deployment/acceptance in public networks is still pending. The laboratory uses the local EVM client Cancun; it does not credit proofs settlement under Osaka.

## Acceptance review Solana

Only the accepted runner of the restored local runtime is enabled:

```sh
./dev node tests/integration/chains/solana/solana-candidate-acceptance.mjs --run-reviewed-local-candidate
```

The review covers `solana-candidate-acceptance.mjs`, its policy, the evidence checks, the resource/process guard and the factory `owned-solana-runtime.mjs`. The selected binary retains the pin `a159dd521869c60e317b0db6d4f5ac7b24cfbb400308e6349a0fd63586d58517`, Agave 2.3.13, commit `5466f4592b1983adb13ba0a5d53f41ea2de69fba`. Its fixed profile 64 ticks/slot and retention of one million shreds. The review enables the test to run; the test results determine whether there is native acceptance.

Controls retained:

- Only a process of its own with genesis and new synthetic keys; it does not accept PRC,
binary, key or clock supplied by the user.
- Only loopback sockets, checked by inode, and a single peer;
rejects additional performance libraries.
- Faucet without funds and no use; distinguishes custody funds, nonce and solver.
- Original preparation, signature Ed25519, Memo, durable nonce and first-class lang
sending; observing the original signature, without new signature or forwarding.
- 2,5 GiB RAM flooring available and 5 GiB disk; functional term of
ten minutes; reject another concurrent heavy work of the same user. The load of other users is covered by global soils. Capture filters through PPID before reading executables, compatible with Linux without privileges; own child identity errors continue to block and allow no signals.
- Cleaning your own child checked by PID and beginning of the process; preserves
private audit separate from the public report and verifies sources unchanged.

The runner checks deposit and transfer of the solver, including balances/commissions, both durable nonces and namespace separation. Redemption demands the original authority of the claims controller: this runner does not manufacture or call to payout without it. The report declares `runtime-ingress-and-solver-only` and `ORIGINAL_PAYOUT_CONTROLLER_AUTHORITY_REQUIRED`. It does not allow a release of claims/graphs, private credit, public consensus or independent operators.

New result: native acceptance approved in Agave, new synthetic genesis and fictitious backgrounds. Both bootstraps are finished once; the deposit of 1.000.000 lamports advances only its nonce; the solver delivers 250.000 lamports from separate liquidity. Commissions observed: 10.000 per bootstrap and 5.000 per transfer. The shutdown verifies the original PID, avoids the sampling run during closing and removes keys and leadger without forcing the process. Sources remain invariant. The host's 29 regressions pass, including loss of response. This case of loss remains a regression of the host, not an induced interruption in native acceptance. Local Report withheld: `attempt-Jf9dGZ/report.json`, SHA256 `442a5704e96bc07abc804566173105e80a668a93cc9e715854a990942b8482df`.

## Working matrix remaining

| Red | Laboratory available | Pending criterion |
| --- | --- | --- |
| Ethereum | Local EVM Cancun; original wallet DOM and checked journal recovery | Public client/finality, envelopes and post-Osaka settlement; complete loss of custody |
| Base | Factory EVM synthetic with chainId 8453 | OP Stack real and its finality; change chainId does not test Base |
| Arbitrum | Factory EVM synthetic with chainId 42161 | Real Nitro and its finality |
| BNB | Synthetic factory EVM with chainId 56 | Real BSC, consensus and finality |
| Bitcoin | Core: Input/solver and graph BTC→SOL accepted with sixteen proofs; two BTC withdrawals confirmed and downloaded | Independent receiving Wallets, complete loss of custody and public network |
| Solana | Agave: entry/solver and delivery completed within the accepted graph; genuine private EXIT in the previous attempt | Native SOL withdrawal from eight proofs attempt, rejected by expired audit; full recovery and public network |
| Tron | Consensus, signature and unique native broadcast; finality rejected | Diagnostic hanging, SIGABRT closure and complete acceptance before canonical release |

Tron preserves `OWNED_TRON_RUNTIME_RELEASE=null`. To promote this, you need to cross-check the driver's source with all its classes, review the offline and loan/replay patches against upstream, check the complete JDK/jar/classes inventory, set a configuration and demonstrate local consensus, transfer, observation and shutdown without network sockets. Restoring the jar does not meet those criteria. The models of BTC/SOL claims and their authorities also require their custody claims to be declared; they do not amount to native self-custodial because they have a private note.


## Native BSC: prepared tools, pending finality

The independent recipe `scripts/development/owned_bsc_posa_v1.py` uses the fixed BSC/Parlia 1.7.8 client and three validators/BLS of the original public package. To prepare a new copy from the root:

```sh
python3 scripts/development/owned_bsc_posa_v1.py --fetch-material
python3 scripts/development/owned_bsc_posa_v1.py --prepare-tools
python3 scripts/development/owned_bsc_posa_v1.py --prepare
```

The isolated material and tools are preserved in `.local/dependencies/bsc-posav1/`. The already published preparation is preserved and the creation commands refuse to overwrite it. The fetch, tools and compilation of the **17 original contracts of genesis** passed. Seed BLS retains bytecodes and derives their storage from the compiled layout. These results demonstrate preparation; they do not demonstrate consensus or finality.

The canonical module `scripts/development/owned-bsc-posa-v1.mjs` is imported directly from Node; does not use a new mapping of `scripts/layout.json`. Your builder `createOwnedBscPoSAClusterV1()` requires zero arguments, creates an own realm before accepting transactions and returns capacity only after observing native finality in the three customers and the original receptions of StakeHub. `readOwnedBscFinalizedHeadV1(runtime)` requires that original capacity; `runtime.close()` closes only its original processes and retains the realm. The finality budget remains at 90 seconds. The keys are public laboratory fixtures and the local chain uses 714; it is not a public BNB wallet.

The last native birth, `94ed8807-4347-4d0d-a38d-858ca7e4ddae`, was **rejected with `BSC_RPC_REJECTED`**. It did not accept finality; the particular PRC error was not retained. The rejected historical results remain intact. The accredited BSC finality, the integration of Wallet and private credit BSC, the public network and independent operators are still pending. The synthetic factory EVM with chainId 56 retains its previous scope and does not prove these requirements.

## Bitcoin: new acceptance of entry and solver

```sh
./dev node tests/integration/chains/bitcoin/bitcoin-runtime-acceptance.mjs --run-owned-regtest
```

Result: **approved for original entry and solver**. The combined factory creates its own Core with new wallets/states, disabled network and RPC loopback. The deposit of 1.000.000 satoshi is confirmed in 6 blocks; the solver sends 250.000 satoshi from separate liquidity. Each original signature is transmitted once and consumes 222 satoshi commission. Repeated observations retain the original wire; it rejects a second confirmation mining and the identities of the other namespace. The custody inventory retains principal and UTXO after the solver.

The guard verifies the inodes of its own sockets, the RAM/disk floors and the ESM closure unchanged. Both facades sequentially close the same process; Core ends without force, removes wallets/ledger and rejects subsequent operations. Two previous preflights rejected transient activity in known daemons Gradle: they didn't start Core, they didn't kill other people's processes, and their locks/diagnosis were retained for review. The subsequent review added SIGTERM/SIGINT, a total time frame of 120 s, periodic sampling every 250 ms and rejection of project locks and Node/WASM workers. It was tested with four retreats from the host, including real signals to their own children without Core. The complete native route was then repeated with the final guard: it approved the same effects, periodic monitoring and clean closure without own processes or retaining wallets/ledger.

Informe final `.local/bitcoin-runtime-acceptance/attempt-6XNSOf/report.json`, SHA256 `8dec9a5d99f6422923689c2415e93719a2e7c9d5fd9e6fa445bcf21e7b210a74`. The scope is `runtime-ingress-and-solver-only`: does not demonstrate claims, payout, private credit, restart of the node or consensus of the public network.

## BTC/Solana: new private round trip

`./dev lab claims` uses the original D27/CI51 and W39/CO42 drivers on both networks, with eight genuine tests expected. Maintains the original keys and nodes during the restart of owner/keeper; does not prove complete loss of processes, graph paths or public consensus.

The first attempt, `3f4f6c01-c2a3-4676-bc01-4be0db648091`, was **rejected** after issuing both notes with four D27/CI51 tests. Failed before EXIT/payout: Harness consulted in parallel a private controller that only supports an active reading. The controller retains that restriction; the harness now consults sequentially and two regressions check the case and the previous failure. That attempt is not presented as an accepted eight-probation tour.

Result SHA256 is retained `11c4021df66b0cc0586d8c95ce3c4d61ca6751b345cce77aafa776e952595d27`resources `3fa1e9ada28b0596be9a11c20139ba29c9dad2511c4fab182a405790057ccef4` and sources `71d9685e293a201430420f2a36def4969b6cb5c9c4f7300c01906d7455c34661`. The original supervisor was closed after the failure and his own processes were absent. The new acceptance requires another complete attempt, without reusing the four receipts or notes of the failed attempt.

The second fresh try, `f9c90308-a14d-4173-82df-b5429e3cb393`, it is **rejected with seven out of eight tests**, without reusing the previous four. The two notes are issued with the disconnected owners. They pass the original restart owner/keeper/controller, serial reading and reconciliation without other sending. Full BTC D27/CI51/W39/CO42: returns 100.000 satoshi to the recipient, DISCHARGED, after the rejected HTTP response and `resume` Original. Duplicate `redeem`, `resume` and `reconcile` They keep the effects. Income and redemption BTC have a broadcast and a mining of six confirmations each.

SOL retains genuine D27/CI51 and EXIT W39, but its first `redeem` returns `RECONCILIATION_REQUIRED / CLAIM_OPERATOR_AUDIT_TOO_OLD`. The `BEGIN_PAYOUT` Original EVM was confirmed; Agave's audit only retains the completed income, without payout or CO42 transfer. Harness rejected that error before observing/resuming SOL. Your message extractor chose the expected literal `CLAIM_NATIVE_FINALITY_UNRESOLVED` of the AssertionError; that label of the result **does not accredit a native finality failure**. The available cause is the over-old operator audit. The attempt did not withhold phase/elapsed from `auditBudget`So the exact part of the round is still pending diagnosis.

The budget of 30 s remains intact. The absence of native payout does not show that any operator has signed or remained poisoned: another actor may have expired after a partial signature of the quorum. The controller retains UNKNOWN and its fence; no retry, new signature, new authorization or false finality observation is added. BTC demonstrated does not turn this joint attempt into a complete acceptance of both networks.

Result SHA256 is retained `d357553ae9e91ff57381beaabb7c7cdf042f3a17f8726af94a83d682ab26f1da`resources `34d848b4e7e9ac45872c2aa2ce2c05754f0c21a9a067de84b8ed7b53e9a27e59` and sources `c38b45cb7ba20bebc6607b28424b65db3a0274382b536cb54b53bdecfa6ec7b1`. Duration 2.035 s; proof worker maximum 1.640.632.320 bytes and group 4.388.188.160 bytes. The seven receipts of evidence are checked against their originals. The closure ends with closed controller/keeper/EVM/BTC/SOL, 133 original missing identities, intact sources and lock released. Synthetic status and keys are removed. BTC/SOL did not require force; Solana declares `nativeOrderlyExit=false`, preserved as the limit of the observed closure.

The two attempts and their rejections remain as evidence. The nodes and keys survived the restarts of coordination processes, not the loss of the laboratory; they do not prove autosecurity, independent operators, public consensus or graph tour. A new acceptance requires new status and receipts and resolve the diagnosis of audit without expanding its freshness.

## Grapho CBTC → SOL delivery and two Bitcoin withdrawals

```sh
./dev lab btc-sol
```

I'm trying `67ca1114-cb94-4f87-9041-1cd7b7e62e82`, on `759d732`: **accepted and closed**, sixteen genuine new tests. D27/CI51 issues a CBTC note of 100.000 satoshis; U/S/P/R/I, four N and C complete the original graph. The solver delivers 1.000.000 lamports once, with the owner absent. The journal ends CONFIRMED and the graph FULFILLED. Restart, reconciliate and recover do not repeat the shipment.

W39/CO42 download the change of 80.000 satoshis and the payment of the solver of 20.000. The lost HTTP admission is preserved and resolved by original summary; repeat redeem/resume retains CONFIRMED without any other effect. Bitcoin retains income and two payments with six or more confirmations, one broadcast per transfer and commission of 222 satoshis each. SOL custody and his nonces aren't spent. Supply, debts, reserves and final obligations are zero. The two Bitcoin payments go to the fixed recipient of local custody; they do not represent two independent Bitcoin wallets or prove price discovery or a bridge.

None of the fifteen evidence of the first rejected attempt was reused `d284e41a`. It remains preserved, including its SOL delivery, the withdrawal of the change and the EVM EXIT of the solver before the poorly formed ID. The correction uses the original controller determinist hash and maintains both regressions. The programs, VK, guards and audit budget of 30 s remain the same.

Duration: 2.649.977,794 ms (44 min 09,978 s). Peak prover RSS: 2.970.472.448 bytes, principal worker 598.491.136 and supervisor 97.656.832. The group's total RSS was measured, without attributing to it the individual limit of 3 GiB. The independent audit combined the sixteen receipts and verified 399 sources, 20 API files and 11 vendors. The 219 original identities and four locks were missing. Controller, keeper and runtimes closed; scratch, wallets, keys and synthetic ledgers withdrew without force. Solana declares `nativeOrderlyExit=false`, `nativeStopFailure=null`; native orderly exit is not attributed.

Local evidence preserved in `.internal/dev/reports/`:

- Original result SHA256 `93735732687f1c10c95d1bb4ce3cdf182f26c2751f8995cb3c51eed800c1955e`.
- SHA256 resources `47cde74251728dffb2933f595a1f07384ae1e172a453fd493dcabf75ca69d399`.
- AFTER SHA256 `a6ace6cbcaaa7dda1f8e9302c0445146e7ab22ec415f2ee22acd895a68b0119a`.
- Manifesto of the 16 SHA256 tests `b54bd6567d9d323b43f6bc946944293009894b4b20e215ad6833815d3ce5acad`.

The acceptance covers this local graph with fictitious funds. The Solana custody payout of the eight-proof trial is still rejected. It does not credit for loss of keeper/nodes, F recovery from this graph, independent operators, public network, mobile custody or full omnichain wallet.

## Tron: new build and rejected candidate acceptance

```sh
python3 tests/integration/chains/tron/fixtures/offline-agree-zero/build.py --build-reviewed-offline-args
./dev node tests/integration/chains/tron/tron-candidate-acceptance.mjs --run-reviewed-local-candidate
```

The original public closure is verified: 407 JDK entries, 7 classes, JAR, driver and original receipts, all preserved unchanged. The first original attempt failed because NodeConfig.postProcess makes the agreementNodeCount=0 explicit in 19. The new Args patch retains 0 only for the CLI p2pDisable=true and node.agreeNodeCount=0 explicit. Maintains all assertOffline conditions and defaults of the normal network.

The new build compiles the revised Args and a public diagnosis without keys, witness, application or leadger. The original/revised comparison changes only agreeNodeCount 19 → 0. His 4 children Java close with exit0; the original inventory remains intact. Args new SHA256 `ce82095ff403f837ee02b243ab05e5ad3886b1124f2bbb3e1bf0e8165b310a70`, source `7896412e8aa21a80331f66606f25414a589c5127e355a0289d422c72405e280d`. The new report `reviewed-offline-agree-zero-v1/build-report.json` has SHA256 `71de6b263c4051738e76d27da7f4f821f800c9ca944a742c4980ccd9695e98e2`. Historical receipts are not regenerated. The runner fixes the new class in code and places it in front of the JAR using its original package; the seven originals are checked and still preserved.

The helper installs seccomp exclusively on the child before running Java: denies socket() in all families and network socketpair(); allows only anonymous AF_UNIX for stdio/FileDispatcher. Check each inode and reject sockets with pathname or network. It maintains minimum resource thresholds and does not change the host. Gradle exception requires exact JDK21/cwd/version/argv and two snapshots of the same PID/start/parent with all sleepy threads and CPU unchanged.

Candidate result: ** not accepted**. He produced blocks by consensus Java-Tron, regained the original signatory and admitted the only broadcast. The original observation continued hanging for 60 s; the test rejected finality. The closure ended SIGABRT, without signal sent by the harness; the original PID was verified missing and keys/configuration/ledger were removed. It does not constitute clean shutdown or complete acceptance. Report `candidate-acceptance/attempt-4GaJWD/report.json`, SHA256 `1e5214e7158e4bd044b272ed7d2b763d231e8ec97441bc24f3c6441429bfdbcf`.

The original snapshot prior to shipment had head=solid=reference=2. The solid height was already advancing; there is no evidence that 27 views are missing to finish: [DposService of the fixed commit](https://raw.githubusercontent.com/tronprotocol/java-tron/5c449a18a2bb995d3b688d1587e664d909b473c7/consensus/src/main/java/org/tron/consensus/dpos/DposService.java) calculates height from the active witnesses.

The original hanging allows for two causes: absence of tx/receivet, or solid height prior to receipt. That attempt did not retain such readings before eliminating the leadger; therefore the specific branch is still awaiting re-audit read-only. No finality is replaced by acceptance of the mempool or forwarded. The canonical release continues null; there is no authority of graph, private credit, claims, public consensus or recovery after losing process.

## Tron: later native diagnosis

The subsequent candidate retains a single broadcast and original queries. At first the tx is in the mempool and its raw matches; then the mempool is empty and no tx or TransactionInfo appear. Head and solid advance from 2 to 23. There is no proven canonical inclusion. The observed balance returns to the initial; this fits with discard or rollback during the packaging, still an inference. The JAR Logback writes its warnings to disk; these logs must be retained in the next diagnosis before removing the scratch.

The closure returns to SIGABRT, without strength of the harness. This time the private fatal error of the JVM is preserved: 102.321 bytes, SHA256 `3bbee07b27f41e1ecf890bb4952175579a1a92a2187fe318853ca4a788681312`. The pile goes through `jni_DetachCurrentThread`, `hawtjni_thread_cleanup` and `VM_Exit::wait_if_vm_exited`. The callback of [HawtJNI 1.18](https://raw.githubusercontent.com/fusesource/hawtjni/hawtjni-project-1.18/hawtjni-generator/src/main/resources/hawtjni.c) and [HotSpot 8u504](https://raw.githubusercontent.com/openjdk/jdk8u/jdk8u504-b01/hotspot/src/share/vm/runtime/vm_operations.cpp) explain that route, without yet proving a correction.

Informe `candidate-acceptance/attempt-dLP1hZ/report.json`, SHA256 `25bf2d7befae07365eb90d24ab064dd9857ba3c6a325d9fd17061434451aacbe`. The private prefixes are limited, the original PID is missing and synthetic keys, configuration and ledger were removed. The candidate remains rejected and the canonical release remains null.

### Diagnosis with complete disk logs

The attempt `attempt-Jhu0c6`, on `d1d9db0`, retains rejection `TRON_CANDIDATE_NATIVE_FINALITY_TIMEOUT` after a single broadcast. The observation supervisor finished at 96,91 s; the 1.811 sources retained their bytes. Then 416 original JDK entries, classes, JAR and overlay Args were verified. The PIDs of the wrapper, Node and Java are absent, the four locks disappeared and configurations, keys and synthetic ledger were removed. SHA256 report: `9e130680e02899a2ef8c4ff03d62f4b8f2f20f9fd5c0abcdeaf7ab2a43b50587`.

This time they were held back completely. `logs/tron.log` (97.793 bytes, SHA256 `534f063599909527a9a7ae559d5e8e2e35c92d9ef31e52e675c23f71de7135a5`) and `logs/db/db.log` (2.429 bytes, SHA256 `299c1f9981b42d4e82c850a48b1f993bdc987510a0d87f69cf956f9495184c73`). The first records the time notice of overpacking in `Manager.java:1707`: Block 3 ends without transactions, and hanging goes from one to zero. The original source extracts the transaction from the queue before checking that deadline. There is no exception for processing in those complete logs.

The revision of [original producer](https://github.com/tronprotocol/java-tron/blob/5c449a18a2bb995d3b688d1587e664d909b473c7/consensus/src/main/java/org/tron/consensus/dpos/DposTask.java) and of [his slots](https://github.com/tronprotocol/java-tron/blob/5c449a18a2bb995d3b688d1587e664d909b473c7/consensus/src/main/java/org/tron/consensus/dpos/DposSlot.java) identifies a mismatch in laboratory configuration: fixed genesis `1750000000000` Leaves the rest 1.000 when you divide by 3.000 ms. Slots retain this phase, while the producer awakens in multiple UTCs of 3.000 ms. Logs show blocks with timestamp 2.000 ms prior to production. The time allowed by the [original configuration](https://github.com/tronprotocol/java-tron/blob/5c449a18a2bb995d3b688d1587e664d909b473c7/common/src/main/java/org/tron/core/config/args/NodeConfig.java) no more than 1.500 ms after the slot. This explains the deadline rejection before processing the transaction; the correction of genesis is still pending new compilation and acceptance. Do not alter the clock, extend the deadline or forward.

The closure goes back to `SIGABRT`, with `forced=false` and `nativeOrderlyExit=false`. The private fatal occupies 102.118 bytes, SHA256 `bbe3e6bcb6dd53ef1ca2d51bd658435352208528ad9de0432c2b383aa076e186`; the battery retains `hawtjni_thread_cleanup`, `jni_DetachCurrentThread` and `VM_Exit::wait_if_vm_exited`. This closing defect requires its own correction. The diagnosis retains both failures and does not enable release.
