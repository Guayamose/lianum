# Paired local device operator

This entry creates a new original local EVM realm and pairs one device public
key. It serves the app's existing D26, U/S, execution, output READ and W39 clients
on one TLS origin. It has no SQL/Cloud executor and uses local fake values.
Deployment, the fixed NativeEconomicNote account/proof constructor, the owner
process, native executor and provider are created before the first device deposit. The descriptor is private to the
operator and the paired device. The device's root and private note keys stay in
its encrypted vault.

After source review, publish the backend operator/provider/restart consumers in
the existing V5 physical source publication and run the original `./dev build`.
The V5-authenticated backend separately checks literal hashes of the four exact
app callers before either runtime is created. App callers do not expand the
original compiler allowlist. A missing or changed source keeps startup closed. No new circuit,
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
Normal closure retains journals without supplying a reopen permission.

A separate planned restart uses the original ten-section NativeEconomicNote
capture/reopen contract after the same device operation has an original F
receipt confirmed. It does not capture a pending operation, synthesize F,
advance the manual clock to a cutoff, undo native delivery or extend the signed
windows. There is no T/UNKNOWN/pre-S reinstall fallback.

After the device has received that original recovery outcome, the operator puts
only its public parent job identifier in the fixed 0600 `recovery-request.json`:

```json
{"parentJobId":"…the exact 64-character lowercase hexadecimal original U/S job ID…"}
```

Send SIGUSR2 to the running operator. This is an explicit ordered capture,
independent of SIGINT/SIGTERM normal closure. The actual executor must report
RECOVERED for that job. The original coordinator fences HTTP, actor, keeper,
account, executor, provider, owner, bootstrap, system and runtimes in one
synchronous call before awaiting their original producers and stops. The
recipient child also must exit 0 without a signal. The original issuer seals
all ten AEAD/CAS sections and closes its lease. Only after confirmed closures
does the operator exclusively fsync `captured-checkpoint.json` with the private
locator/checkpoint and same public pairing descriptor. It contains no user
root, note key, opening, economic callback or restored actor DTO.

Wait for that process to exit, then explicitly run the separate fixed entry in
a new process, using the same infrastructure config:

```sh
./dev node --max-old-space-size=384 apps/platform/src/run-original-device-local-reopen-v1.mjs
```

The original issuer verifies the complete ciphertext history, exact checkpoint,
source identity, new process lifetime, stopped originals and one-use ordered
claims. The private locator alone grants no authority. The restored account's
original producer rechecks the same pairing/S/F, provider, proof hashes,
nullifiers and canonical receipt before installing the original three bridges.
The pairing descriptor remains byte-equivalent; there is no new grant or note
adoption. The reopened service supports fresh signed READ, reconciliation and
separate original W39 withdrawal of retained device outputs. D26/U/S and new
EXECUTE/RECOVER remain fenced, and it does not create a second capture.

This planned reopen uses a fixed 90-minute permission with the original
15-second cleanup reserve, measured from constructor entry before startup. Capture/READ/reopen keep that
deadline verbatim and do not alter the economic 30/32-second permits or the
original operation windows. Missing/expired/incomplete/claimed records stay
closed; an interrupted OPENING is retained and never retried automatically.
The user's encrypted device vault and its keys remain on the device.

HOST installation/brand tests cannot establish a new local economic lifecycle.
This source cut has not run a product startup, F capture or process reopen.
Abrupt crash recovery, CloudRun/Docker, real funds, phone custody and this
product entry's economic acceptance remain unestablished.
