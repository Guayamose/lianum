# Local service for an ERC20 note

<p><a href="../../../README.md"><img src="../../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../../docs/README.md) · [Architecture](../../../docs/ARCHITECTURE.md) · [Validation](../../../docs/VALIDATION.md)

This entry prepares a new lab realm with the Anvil fixed and the USDC local six decimals of the original fixture. Create the device's system and account before opening TLS. It does not generate user keys or test, finance or remove a note when booting. He doesn't publish contracts on a public network.

The root and note key remain in the app. The public identity key of the device is used to match; the private key TLS belongs to the operator. Openings are sent only to the original worker when the test is authorized.

## Operator preparation

The [fixed entry](../../../scripts/development/profiles/run-device-external-flat-local-v1.mjs) load the original module materialized in `.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/operations/local/device-external-flat-local-operator-v1.mjs`. The start, cancel and close HOST passed; the financial journey and phone usage are checked separately.

After publishing and materializing the revised sources with the original build, create the fixed private directory with mode 700:

```sh
mkdir -m 700 .internal/runtime/omnichain-flat-profile/flat-wallet/.local/original-device-external-flat-local-v1
```

Keep it there. `operator.json` with mode 600. No additional fields allowed:

```json
{
  "origin": "https://CERTIFICATE_HOST:9447",
  "devicePublicKey": "04_ORIGINAL_PUBLIC_KEY_128_HEX",
  "depositAmountAtomic": "500",
  "tls": {
    "certificate": "OPERATOR_TLS_CERTIFICATE_PEM",
    "privateKey": "OPERATOR_TLS_PRIVATE_KEY_PEM"
  }
}
```

Replaces those bookmarks with the actual public key of the app, the exact Origin HTTPS and a valid certificate that covers that host and matches its TLS key. The certificate must be reliable for the device. The listener listens on local interfaces; it only supports Host/Origin and matching identity.

`depositAmountAtomic` It's a positive integer in atomic units. For this USDC, `500` means `0.000500 USDC`. The boot approves exactly that amount for the original pool once; it does not grant infinite allowance or renew it. The amount entered in the app must match. The approval prepares the laboratory token and does not finance the note.

From the root of the project, starts the fixed launcher without arguments:

```sh
env -u NODE_OPTIONS -u NODE_PATH .internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node --max-old-space-size=384 scripts/development/profiles/run-device-external-flat-local-v1.mjs
```

After `ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY`, privately delivers the full content of `paired-descriptor.json`, created in the same directory with mode 600. It is the original descriptor with no fields added. The entry rejects another instance and does not replace a previous descriptor or adopt a funded realm.

## Use and closure

In **Note ERC20**, paste the descriptor and select ** Connect and consult the note**. Set the withdrawal address and the amount in atomic units. Preparing the test, financing and withdrawing are separate authorizations. A lost response is consulted about the same work; it is never refinanced or withdrawn. The withdrawal uses the full source note and the recipient fixed before deposit.

SIGINT or SIGTERM first close the admission and await the original operations, the listener and the runtime of their own. The original cipher scratch is preserved. If the lock is unaccredited, the lock is retained and the output fails. A GIS during booting awaits that same acquisition and closes without publishing availability.

This entry does not offer reopening in another process or recovery due to abrupt fall. Code, lifecycle HOST, Node/TLS financial tour and physical phone use are different evidences; this guide does not attribute new acceptances.
