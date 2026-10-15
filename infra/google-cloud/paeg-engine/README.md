# PAEG remote staging

This prepares a **new LOCAL synthetic mixed operator** on Linux x86-64: one Paged
hub, separate Ethereum/Bitcoin/Solana fixtures and the official Uniswap fixture
with fake tokens. It does not deploy PAEG to public chains or make those provider
balances real testnet funds. The existing public wallet API and the user's mobile
seed are separate and remain untouched.

The proposed GCP machine is `n2-standard-16`, 64 GiB RAM, a persistent 100 GiB
`pd-balanced` disk in `europe-west1-b`, project `lianum`. It is a starting candidate,
not a measured GCP capacity or price estimate. Native Paged proving stays fixed
at twelve threads and **one heavy job**, with its original 3 GiB combined RSS
watchdog, actual prepared VK, native verification and independent Wasm verification.
The separate systemd 48 GiB cap includes ledgers and supervisor; it does not change
the per-job budget. The VM has no external IP. Permit SSH only through IAP/OS Login;
do not expose any ledger RPC port. Provisioning is not performed by these scripts.
`sh infra/google-cloud/paeg-engine/gcp-plan.sh` prints the exact proposed commands without executing
them: existing VPC `lianum-wallet`, subnet `lianum-wallet-europe-west1` (10.71.0.0/24),
Cloud NAT router/NAT `lianum-paeg-egress` scoped only to that subnet, engine-only IAP
SSH tag, no service account and no OAuth scopes. Check existing firewall policies
before provisioning. NAT provides outbound access for package repositories/public
RPC; it provides no inbound mobile route and does not replace the wallet VM's
external-IP networking. Flag syntax follows the official [instance creation](https://cloud.google.com/sdk/gcloud/reference/compute/instances/create)
and [NAT creation](https://cloud.google.com/sdk/gcloud/reference/compute/routers/nats/create) references.

## Build the courier after fresh artifacts and source adoption

From the repository root, with its pinned tools already present:

```sh
python3 infra/google-cloud/paeg-engine/package-demo.py plan
python3 infra/google-cloud/paeg-engine/package-demo.py build --out .local/paeg-remote-release-NEW_ID
python3 infra/google-cloud/paeg-engine/package-demo.py verify --directory .local/paeg-remote-release-NEW_ID --sha256 MANIFEST_SHA256
python3 infra/google-cloud/paeg-engine/package-demo.py archive --directory .local/paeg-remote-release-NEW_ID --sha256 MANIFEST_SHA256 --out .local/paeg-remote-release-NEW_ID.tar.gz
```

`plan` checks source closure and the exact adopted npm inventory; it does not claim
current source/artifact validity. `build` requires the actual Original loaders and
legitimate current source adoption. Missing/stale artifacts stop it. It includes
their public compilation receipts, five Paged programs/VKs, balance and Flat
verification artifacts, original official protocol artifacts, CRS, audited npm
files/licenses and pinned Node/BB/Anvil/Bitcoin/Agave binaries. It does **not** copy
operator files, seeds, keypairs, signing credentials, private journals, ledger
snapshots, old witnesses or private jobs. Every shipped file has SHA-256/bytes/mode;
the release manifest, source bundle and resource inventory remain distinct.

The actual entry is `funded-paged-native-operator-v3.mjs`; packaging/importing
creates no runtime, proof or accepted economic operation. The narrow read-only
inspector loads the Original artifact validators, not a test profile or replacement
factory. Its bounded failure output contains only code/stage/public source locations.

## Initialize on the server

The NEW engine uses Ubuntu 24.04 (`ubuntu-os-cloud`, `ubuntu-2404-lts-amd64`). Its
pinned Agave binary needs **GLIBC 2.38** and GLIBCXX 3.4.30, measured without
executing it using ELF version metadata. Debian 12's libc is too old; the existing
Debian public-wallet VM is preserved. `host-preflight.py` checks the pinned tool
bytes, ELF requirements and available system libraries without launching a ledger.
Ubuntu needs `python3`, `openssl`, `ca-certificates`, `binutils`, `libstdc++6`,
`libudev1` and systemd. Supply these in
the VM image or through an approved package repository before restricting egress.
Node, proof libraries, binaries, keys and CRS arrive offline in the verified courier.
The installer is a reviewed administration action and must not run on the existing
public-wallet VM. Verify the archive SHA-256 before unpacking; reject unexpected
tar paths/links. Install the unpacked release with the trusted reviewed installer:

```sh
sudo /trusted/infra/google-cloud/paeg-engine/install-release.sh /absolute/unpacked/release MANIFEST_SHA256
python3 /opt/lianum-paeg/current/infra/host-preflight.py --release /opt/lianum-paeg/current
sudo -u lianum-paeg /var/lib/lianum-paeg/current/candidate/resources/tools/node --max-old-space-size=384 /var/lib/lianum-paeg/current/infra/init-operator.mjs DEVICE_PUBLIC_KEY_04_HEX
sudo systemctl start lianum-paeg-demo.service
```

The only device input is its **public** secp256k1 identity. `init-operator` generates
new TLS/journal namespace credentials on the server and writes them mode 0600 in
a new mode-0700 realm. The Original provider generates its own signing and attester
keys on first start. No old provider credential or mobile secret is transferred.
Private state and retained ledgers live on the persistent disk. The immutable
release and the working state copy are separate. Source/tools stay root owned;
the Original public files within the writable Flat worker tree are individually
bound read-only, while new private job paths remain protected. Per-use Original
artifact and source checks remain mandatory.

The service does not auto-fund notes. It prints public READY/path metadata only.
Stop using `systemctl stop lianum-paeg-demo` so **only the supervisor** receives
SIGTERM and can drain/capture its nine Original components before closing children.
`KillMode=process`, no automatic SIGKILL and no automatic restart prevent a group
signal from destroying ledgers first. A later manual start invokes Original reopen
when startup exists, and rejects incomplete/ACTIVE/corrupt captures. An abrupt VM
loss is not controlled capture and is not claimed recoverable. Do not delete a
failed realm, replace its keys, or retry a native send to make recovery appear valid.
Back up the whole private realm **and** its retained scratch trees only after a
successful controlled stop, using a protected server-side disk backup policy.

## Remaining blockers

**Public Android ingress is not implemented by this package.** Original startup
and Android pinned TLS currently accept loopback/private-IP endpoints. The private
staging listener is `https://127.0.0.1:9445`, target `:9446`, with the same Original
leaf. A public-origin profile and Android transport policy must be implemented and
verified before routing `/v1/mobile/*` on the existing API hostname (or another
approved hostname) to this machine. Replacing the certificate with Caddy's public
leaf or rewriting a signed descriptor is not compatible. Do not publish this
staging connection as usable by the phone; USB/VPN/PC forwarding is not the target.

Successor contracts require **fresh active artifacts/VKs and legitimate source
adoption** before regenerating this release. Old artifact metadata is not relabeled.
Public-chain providers additionally need explicit network identities, separately
prefunded server wallets, public RPC/finality adapters and appropriate signer custody;
the local owned constructors cannot be presented as testnet adapters.

Before product activation, perform one remote Original controlled capture/reopen
and the coordinated economic acceptance with frozen source. No local acceptance
result or PC timing is evidence that the remote VM or public ingress has passed.
Existing funded realms are not automatically migrated by this installer; an
upgrade requires a separate review of retained artifacts and controlled state.
