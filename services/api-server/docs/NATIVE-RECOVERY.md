# Recover local native account

<p><a href="../../../README.md"><img src="../../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../../docs/README.md) · [Architecture](../../../docs/ARCHITECTURE.md) · [Validation](../../../docs/VALIDATION.md)

The service `run-original-native-source-v1.mjs` retains the sources of the account before financing it. Saves the account, local node status, provider, executor, keeper, and device linkage to a private realm. The root and note keys remain in the client.

This service uses local EVM and trial funds. The integrated acceptance of abrupt fall and the autonomous eight-hour wait are still pending.

## Start and reopen

From the root of the repository, the configuration is saved in `.local/original-native-source-durable-operator-v1/operator.json`. Directory must have permissions `0700` and the file `0600`, belong to the current user and be physical files. Its structure is:

```json
{
  "origin": "https://127.0.0.1:PORT",
  "devicePublicKey": "DEVICE_SECP256K1_PUBLIC_KEY",
  "tls": {
    "certificate": "CERTIFICATE_PEM",
    "privateKey": "TLS_KEY_PEM"
  }
}
```

The public key is the custody of the client. The link descriptor is published in `paired-descriptor.json`inside the same directory. The client uses that descriptor and its signed consent for each operation. Starting the service prepares resources and opens TLS; financing, booking and running require your own authorizations.

```sh
./dev node --max-old-space-size=384 scripts/development/profiles/run-original-native-source-v1.mjs
```

After the original process and its dependent processes are finished, it reopens by preserving the configuration, the descriptor and all the journals:

```sh
./dev node --max-old-space-size=384 scripts/development/profiles/run-original-native-source-v1.mjs --open-source
```

The reopening checks the identity of the files, the sources of the code, the checkspoints and the absence of the original processes. Use a new generation of the same realm. A copy of a descriptor or an account ID does not allow you to adopt the account or grant financial permissions.

## What happens after an interruption

| Saved State | Behavior |
| --- | --- |
| Confirmed operation and complete checkpoint | Reopen the original sources. The readings need a new observation. |
| Step not yet started | You can start with new consent on the same account and original terms. |
| Ship started whose result remains uncertain | Preserves `UNKNOWN` and blocks the expense; a query does not allow to repeat the transfer. |
| Mutation of a source without checkpoint confirmed | The entry returns `ORIGINAL_SOURCE_PENDING_UNKNOWN`, with unknown available balance and no economic capabilities. |
| Original process still alive or source altered | Reject the reopening. |

The recovery authorization maintains the same reserve and cutoff. The keeper only starts F when that cutoff expires and there is an original ARM authorization. A lost response is reconciled against the preserved shipment. The conditions of the operation are not renewed upon restarting.

The local realm has its own nine-hour period since its creation. This time frame, the local EVM support and the impossibility of restoring a source to half mutation are current limits of this entry. Keeping files allows investigating an uncertain result; deleting them eliminates that possibility. The joint state separates assets and domains, maintains differentiated positions and valuation and presents `STALE` o `UNKNOWN` until we look again at their sources. Your comment journal does not create credit or authorization.
