# Paired local device operator

This entry creates a new original local EVM realm and pairs one device public
key. It serves the app's existing D26, U/S, execution, output READ and W39 clients
on one TLS origin. It has no SQL/Cloud executor and uses local fake values.
Deployment, account journals, the owner process, native executor and provider
are created before the first device deposit. The descriptor is private to the
operator and the paired device. The device's root and private note keys stay in
its encrypted vault.

After source review, include all four entry/provider sources in the existing
V5 physical source publication and run the original `./dev build`. An omitted
source keeps startup closed before either runtime is created. No new circuit,
key, toolchain, deadline or proof resource limit is used.

Create the fixed generated directory
`.internal/runtime/omnichain-flat-profile/flat-wallet/.local/original-device-local-operator-v1/`
with mode 0700. Put `operator.json` there with mode 0600 and exactly these fields:

```json
{"origin":"https://localhost:9443","devicePublicKey":"04…public secp256k1 point…","tls":{"certificate":"…operator certificate PEM…","privateKey":"…operator TLS private-key PEM…"}}
```

The certificate must be valid for the exact origin under the original TLS
checks; the phone must trust it through its actual TLS stack. These are
infrastructure credentials, not wallet keys. Supply no account, runtime,
factory, callback, root or private note key. Then explicitly start:

```sh
./dev node --max-old-space-size=384 apps/platform/src/run-original-device-local-v1.mjs
```

The operator reads the resulting 0600 `paired-descriptor.json` privately and
pairs it in the app. The existing device consent still controls every funding,
proof, reservation, execution, recovery and withdrawal admission. Startup
prepares a 500-unit scope and one original provider's 1,000,000-unit local
native delivery for a 100-unit reservation. It does not prove, fund, reserve or
send that delivery. It creates native windows once; READ never extends them.

SIGINT/SIGTERM drains the same admitted original work before closing the
account, keeper, executor, provider, recipient, owner and runtimes. It retains
encrypted journals and reports failure if any original closure is unconfirmed.
This initial entry does not reopen a closed realm or adopt an old funded
journal. Full process recovery requires its separate one-use original economic
capture/reopen contract. CloudRun/Docker, real funds, phone custody and this
new startup's economic acceptance remain unestablished.
