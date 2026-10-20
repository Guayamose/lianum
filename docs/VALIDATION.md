# Validation and execution evidence

[Overview](../README.md) / [Documentation](README.md) / Validation

Lianum records **public-network receipts, genuine-proof local integration and reproducible host checks** as separate evidence layers. Each result retains its operation identity and environment, so a reviewer can inspect exactly what happened.

[![Recorded validation layers](assets/evidence.svg)](assets/evidence.svg)

## Public transactions

The read-only verification snapshot was recorded on **20 October 2026**. Ethereum receipts were checked against canonical blocks below a finalized head; Solana was finalized; Bitcoin had **407 confirmations at the recorded tip**. These are recorded observations, not a live health feed.

| Operation | Network | Recorded result | Public receipt |
| --- | --- | --- | --- |
| Native ETH self-transfer | Ethereum Sepolia | Phone-originated transfer of 0.000001 test ETH | [Transaction](https://sepolia.etherscan.io/tx/0xdd3c90b08fcb11cf6c33889b484e8e870876ababd78dae591c527642c1284a68) |
| Native SOL self-transfer | Solana devnet | Phone-confirmed, finalized transfer of 0.001 SOL | [Transaction](https://explorer.solana.com/tx/36iGX4DZYmpvSDHwpgu6jSzTMJcL7w7x5JnZmBKegdjWYCZogYUdbVPPNkw9vUiHLY3wWbZgiSXUFB7vLhSD8KaM?cluster=devnet) |
| Native BTC self-transfer | Bitcoin Testnet3 | Phone-originated 1,000-satoshi output | [Transaction](https://blockstream.info/testnet/tx/55a9c96bb3278777b99bbd17eee9ac7bfa65b59a5dedc356556e1ea62cc3bc70) |
| Original PAEG note funding | Ethereum Sepolia | 0.000001 test ETH deposited into the original pool | [Deposit](https://sepolia.etherscan.io/tx/0x8d89e9a337ef89d601f2fd836086b823181d222b9b4f82daad64d38d1003bf81) |
| Original PAEG owner recovery | Ethereum Sepolia | Phone-authorized return of the full note; recipient and amount matched the Withdrawal event | [Withdrawal](https://sepolia.etherscan.io/tx/0x290447b8d81be03de0b844abb16998a5b92cb675e35194e0c7e86ef7aaf7f4c4) |
| DeFi execution-budget funding | Ethereum Sepolia | Separate finalized deposit of 0.000001 test ETH | [Deposit](https://sepolia.etherscan.io/tx/0xc80cb6041b400b5549e060bc55e436ffb8d2d9d2f40aea8002299f6e3a7af6da) |

The ETH transfer reused the identical signed transaction in one manual retransmission; it does not establish automatic recovery. Pool recovery concerns an unreserved note from a stopped plan. DeFi budget funding is distinct from an investment or share mint.

**Source records:** [execution evidence](submission/execution-evidence.json) · [public verification snapshot](submission/public-transaction-verification.json). Full hashes, observation times, event checks and source identities remain in those records.

## Local proof integration

A composed **four-node** route executed Uniswap and native ETH/BTC/SOL delivery with the real SDK, custody, consumers and proof workers against explicit local synthetic networks.

| Recorded result | Value |
| --- | ---: |
| Genuine proofs, including D27 | **21** |
| Withdrawals | **5** |
| Initial synthetic reserve | **600 units** |
| Returned owner change | **200 units** |
| Four executor payouts | **400 units** |
| Final held / backed | **0 / 0** |

The received swap token remained unwithdrawn. The [campaign summary](submission/execution-evidence.json) retains its source-generation digest and scope. Historical cold-proof profiles are D26 **38.700 s**, D27 **37.1 s** and W39 **51.516 s** in the [EVM laboratory](EVM-LAB.md); those measurements describe individual development-host proof profiles rather than full phone or plan latency.

## Reproduce the checks

```sh
./dev prepare host
./dev status
./dev check
./dev test --changed --plan
```

Choose a component when testing an implementation change:

```sh
./dev test --component mobile
./dev test --component agent
./dev test --component engine
./dev npm --prefix apps/mobile run typecheck
```

The recorded English delivery passed **491 repository checks**, **28 focused mobile presentation regressions**, the mobile TypeScript check and **11 workflow-selection tests**, and built a standalone APK. [Its retained verification record](submission/english-delivery-validation.json) identifies the APK hash, source generation and exact limits. Suite counts overlap and must not be added into a unique test total.

[GitHub CI](https://github.com/Guayamose/lianum/actions/workflows/ci.yml) runs the bounded component checks from a clean checkout. Host checks do not broadcast transactions. Proof/network campaigns require their [declared laboratory resources](LAB-PROFILES.md), original artifacts and custody setup.

## Acceptance scope

| Area | Established evidence | Further acceptance |
| --- | --- | --- |
| Native wallet | Physical-phone ETH/SOL/BTC self-transfers | Broader history and automatic uncertain-send recovery |
| PAEG reserve lifecycle | Original public deposit and owner withdrawal; complete local mixed accounting | Public payment graph, dependencies, settlement and executor payout |
| DeFi | Separate public execution-budget funding; local venue/proof checks | Public Uniswap swaps and Aave/Morpho investment/redemption round trips |
| Agent | Durable conversation and service integration; bounded tools, proposals, voice and notification implementation | Combined physical-device experience and public agent-originated financial plan |
| Personal funding | Operator-sponsored test funding | Personal-wallet funding into PAEG and combined private/DeFi valuation |

At the recorded release baseline, a repeated public plan was gated by the cumulative source quota and a finality observation that still classified a finalized withdrawal as CONFIRMED. The approved quota-only review was rejected without changing the signed financial epoch. The repository also contains a CRS cache-location correction that was not deployed to that recorded engine. Downstream public flows that could not pass prerequisites remain unexecuted; they are not evidence of completed operations.

A successful APK build, engine READY state, component test and financial acceptance answer different questions. Record the release/source identity, operation, network and final evidence together. Independent security review and production mainnet acceptance remain separate work.

[Execution model](FINANCIAL-EXECUTION.md) · [Security model](PRIVACY-AND-OPERATIONS.md) · [Workflow](WORKFLOW.md) · [Source generations](SOURCE-GENERATIONS.md)
