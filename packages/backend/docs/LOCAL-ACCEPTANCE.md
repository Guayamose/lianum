# Network and DeFi laboratories

<p><a href="../../../README.md"><img src="../../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../../docs/README.md) · [Architecture](../../../docs/ARCHITECTURE.md) · [Validation](../../../docs/VALIDATION.md)

[Documentation](../../../docs/README.md) / [Validation](../../../docs/VALIDATION.md) / Network laboratories

These laboratories exercise **specific network, custody and proof boundaries**. A runtime check, a private claim round trip, a complete graph and public-phone acceptance are different experiments. The selected launcher declares its resources and scope before execution.

## Select a profile

```sh
./dev lab profiles
./dev lab plan evm
./dev lab check evm
./dev lab prepare-profile evm
```

Planning/checking is read-only. Preparation installs or verifies the declared resources and compatibility without creating financial acceptance. Follow the [EVM guide](../../../docs/EVM-LAB.md) and [source-generation guide](../../../docs/SOURCE-GENERATIONS.md) for original-artifact requirements.

| Network family | Local implementation boundary | Interpretation |
| --- | --- | --- |
| Ethereum | Local Cancun EVM, contracts, native wallet and journal/recovery paths | Local contract/runtime behavior, with the selected chain configuration |
| Base / Arbitrum / BNB EVM profiles | Fixed factories and chain-specific configuration | A synthetic chain ID alone does not establish OP Stack, Nitro or Parlia consensus/finality |
| Bitcoin | Owned Bitcoin Core regtest, isolated wallets and loopback RPC | Native local UTXO signing, broadcast and confirmation under regtest conditions |
| Solana | Owned Agave environment, original programs and native observations | Native local SOL operations within the selected runtime/custody scope |
| Tron | Retained reviewed Java-Tron candidate and explicit canonical gate | Source/tool restoration and candidate execution remain separate from accepted canonical activation |

Public transaction evidence is centralized in [validation](../../../docs/VALIDATION.md#public-transactions).

## Native ingress and solver checks

The Bitcoin runner creates its own Core environment, wallets and state with public networking disabled. Its scope is ingress and solver delivery, not a general proof of claims, private credit or public-network consensus:

```sh
./dev node tests/integration/chains/bitcoin/bitcoin-runtime-acceptance.mjs --run-owned-regtest
```

The recorded route deposits 1,000,000 satoshis and delivers 250,000 satoshis from separate solver liquidity, with six local confirmations per transfer. Original signatures are transmitted once; observations retain the accepted wire identity. Guards check owned sockets/processes, resources and source closure before cleanup.

Solana ingress/solver profiles similarly use separate retained user and solver resources. The native local scope covers the original programs, signer/nonce identity, delivery observations and owned-process shutdown. A simulated lost-response regression is identified separately from a failure induced in native acceptance.

## Private claims and recovery

```sh
./dev lab claims
```

The selected claim driver uses the original D27/CI51 and W39/CO42 paths and declares the expected receipts. Retaining keys/nodes while reopening an owner or keeper is distinct from complete custody/process loss. A successful Bitcoin path does not automatically establish the corresponding Solana path or a combined graph.

Admission, operator-audit freshness, native finality, payout and private exit each have their own checks. An uncertain or expired prerequisite retains UNKNOWN and the original operation identity. It must not be converted into a new native signature, an automatic rebroadcast or fabricated finality. See [claim artifact inventory](NATIVE-CLAIMS-ARTIFACTS.md), [claim diagnosis](../../../docs/CLAIM-AUDIT-LAB.md) and [account recovery](../../../services/api-server/docs/NATIVE-RECOVERY.md).

## DeFi boundaries

Uniswap, Aave and Morpho profiles combine the actual adapter/SDK path with their selected local contracts and fixtures. Investment, share mint, position observation, redemption and the underlying asset withdrawal are separate results.

The mixed graph campaign uses the real proof pipeline and records its synthetic environment explicitly. Its 21 proofs and reserve accounting are described in [local proof integration](../../../docs/VALIDATION.md#local-proof-integration). A separately finalized public DeFi budget deposit does not establish an investment/redemption round trip.

## Native BSC and Tron resource recipes

BSC preparation uses the retained Parlia client, validators/BLS material and original genesis contracts:

```sh
python3 scripts/development/owned_bsc_posa_v1.py --fetch-material
python3 scripts/development/owned_bsc_posa_v1.py --prepare-tools
python3 scripts/development/owned_bsc_posa_v1.py --prepare
```

The recipe preserves reviewed preparation and refuses to overwrite an existing realm. `createOwnedBscPoSAClusterV1()` and its finalized-head reader require the original runtime capability; tools/genesis preparation alone is not finality acceptance.

The [Tron fixture documentation](../../../tests/integration/chains/tron/fixtures/README.md) identifies the public candidate, JDK/class inventories, reviewed offline delta and canonical-release prerequisites. The [fixed EVM factory reference](../../../docs/reference/wallet/owned-evm-native-profile-family.md) distinguishes synthetic EVM behavior from native network profiles.

## Evidence discipline

Record profile, source generation, original resources, operation identity, network finality, accounting and shutdown together. A timed-out, partially completed or reorged attempt retains its actual result. It is not promoted by restoring a tool or counting a subset of receipts.

[Validation matrix](../../../docs/VALIDATION.md#acceptance-scope) · [Workflow](../../../docs/WORKFLOW.md) · [Source integrity](../../../docs/SOURCE-GENERATIONS.md)
