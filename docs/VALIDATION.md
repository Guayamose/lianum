# Validation and evidence

Lianum's validation separates ordinary component checks, genuine-proof local integrations and confirmed public-network operations. This distinction lets a reviewer inspect the engineering without mistaking a test result for a different kind of acceptance.

## Recorded financial evidence

The [machine-readable evidence](submission/execution-evidence.json) contains the public hashes, observation times, source-generation identity and local integration accounting. It is a curated summary of existing records, not a claim of a fresh network check every time the documentation is read.

| Result | What it demonstrates | What it does not demonstrate |
| --- | --- | --- |
| ETH Sepolia native self-transfer | Phone-originated transfer, recorded finality from two providers | Agent initiation, PAEG settlement or automatic recovery; the identical signed transaction was manually retransmitted once |
| SOL devnet native self-transfer | 0.001 SOL transfer, finalized result and phone confirmation | A multi-network graph |
| BTC Testnet3 native self-transfer | 1,000 satoshi transfer, recorded seven confirmations from two providers | PAEG executor payout |
| Four-node mixed local integration | Uniswap plus ETH/BTC/SOL delivery using real SDK, custody, consumers and 21 genuine proofs | Public networks or phone acceptance |
| Local settlement | Five withdrawals; 600 synthetic units accounted as 200 change plus 400 executor payout; held/backed zero | Withdrawal of the separately received swap token |

The unknown PAEG withdrawal is deliberately excluded from confirmed transactions. Full public, agent-originated and mobile-authorized PAEG execution, public settlement, and public DeFi round trips remain acceptance items in [STATUS.md](../STATUS.md).

## Fast checks

```sh
./dev status
./dev check
./dev test --component mobile
./dev npm --prefix apps/mobile run typecheck
./dev test --changed --plan
```

The English delivery passed 491 repository checks, 28 focused mobile-presentation regressions, the mobile TypeScript check and 11 workflow-selection tests. The standalone APK built successfully. The [delivery validation record](submission/english-delivery-validation.json) identifies its hash, source generation and physical-device limitations. The release campaign also retained focused settlement, recovery, native-operation, mobile and DeFi suites. Their counts overlap in scope and should not be added together as a unique test total.

`--changed --plan` explains the proposed selection without executing it. Use a specific regression or component suite for a small change; run the repository check once when closing the change. A documentation edit does not justify rerunning an expensive economic or proof campaign.

## Financial and network laboratories

```sh
./dev lab profiles
./dev lab plan evm
./dev lab check evm
```

Planning and checking do not launch a network. Follow [laboratory profiles](LAB-PROFILES.md), [the EVM laboratory](EVM-LAB.md) and [network/DeFi acceptance](../packages/backend/docs/LOCAL-ACCEPTANCE.md) for the selected path. Genuine-proof runs require the corresponding original resources, verified toolchain, network fixtures and custody setup.

Some retained public artifacts must be restored separately; private custody and runtime state are intentionally absent from Git. The repository must report missing resources rather than manufacture substitutes to make an integrity check pass. [Source generations](SOURCE-GENERATIONS.md) explains how current source is associated with preserved artifacts.

## Release acceptance

A successful build produces an APK. It does not prove biometrics, notifications, voice or financial operations on a physical phone. A successful engine deployment proves installation; readiness belongs to the installed invocation, and financial acceptance belongs to the operation performed against it.

Record the release identity, source generation, operation identifier, network, result and evidence location together. Preserve uncertain states honestly. Reusing unchanged proof artifacts is valid when their identity is verified; it does not silently upgrade previous acceptance to a new release.
