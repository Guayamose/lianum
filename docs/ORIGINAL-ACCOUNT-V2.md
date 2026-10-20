# Device-authorized private accounts

[Documentation](README.md) / Financial execution / Account authority

Private account routes bind an operation to its **owner, account, asset, pool, source generation and exact action**. A connection descriptor supplies connection information; it does not create custody or authorize funding.

## Read, fund, spend and recover

| Capability | Authority and result |
| --- | --- |
| Account lookup/reconciliation | Reads the original accepted operation. A coordinator acknowledgement alone is not an available balance. |
| Private balance reading | Uses the applicable owner signatures and fresh source observation; available, reserved, blocked and recovered values remain distinct. |
| Native note funding | Uses the device vault and original D26, U/S and execution/W39 bridges bound to the reviewed source/domain/recipient. |
| ERC20 note operations | Use their separate device custody, source and output, with distinct proof/funding/withdrawal/observation permits. |
| DeFi position reading | Uses its own source, session, generation and position references; shares are not converted into a spendable native-note balance. |
| Private-state aggregation | Combines authenticated responses while preserving asset, domain, root and generation identity. |

The phone checks reviewed terms again after protected-key access and before the authorized request. Observation, proving and funding have different capabilities and lifetimes. A pending request keeps its original identity instead of automatically creating another authorization or transfer.

## Proof and recovery continuity

D26, U/S, F and W39 identify specific authenticated proof/transition profiles, not interchangeable generic receipts. Spending a source does not automatically credit its outputs: change and recovery require their own inclusion/nullifier/result observations. Recovery follows the retained reserve and its signed economic terms.

A lost reply or reorganization leaves the operation uncertain until the original outcome is reconciled. Reopening a checkpoint does not make its observations fresh. UI background, closure, expiry or read failure revoke current freshness while retaining accepted work.

## Pairing and storage

The operator provides the HTTPS origin and public pairing descriptor. The device uses its protected owner identity; identifiers and copied JSON do not reconstruct original economic authority. TLS certificates authenticate infrastructure and are separate from note root keys.

Public connection profiles may be imported into the mobile app. Private `operator.json`, vault keys and custody backups remain with their owning environment. [Device installation](USB-MOBILE.md) explains the USB/TLS path; [the API/SDK reference](reference/product-api.md) defines route contracts.

## Local operator references

- [Paired native-note operator](../services/api-server/docs/ORIGINAL-LOCAL-DEVICE-OPERATOR.md)
- [ERC20 operator](../services/api-server/docs/DEVICE-ERC20-LOCAL.md)
- [Native recovery](../services/api-server/docs/NATIVE-RECOVERY.md)
- [Source generations](SOURCE-GENERATIONS.md)

The [validation guide](VALIDATION.md) distinguishes SDK/local-operator exercises, software custody, physical-device approval and public-network acceptance.
