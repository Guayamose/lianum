# API service

`src/wallet-entry.mjs` starts the public mobile wallet API. It requires `LIANUM_PUBLIC_WALLET_CONFIG`; see `infra/google-cloud/api-server/config.example.json`.

```sh
LIANUM_PUBLIC_WALLET_CONFIG=/path/to/public-wallet.json ./dev api
```

`src/entry.mjs` selects that API or the `admission`, `original-native-new` and `original-native-reopen` profiles. PostgreSQL admission requires an explicitly bound executor before admitting economic operations.

| Directory | Responsibility |
| --- | --- |
| `src/admission` | HTTP and admission startup |
| `src/authorization` | Authorization, protected receipts and historical data redaction |
| `src/storage` | SQL connections and explicit migrations |
| `src/original` | Bridges and recovery for compatible generations |
| `migrations` | Versioned SQL schema |
| `tests` | Authorization, HTTP, privacy and durability checks |

The Dockerfile starts the admission profile. Run migrations separately through `src/storage/migrate.mjs`. The public API currently uses a VM and systemd, configured under `infra/google-cloud/api-server`. Business logic belongs in `packages`; this service supplies entry points and runtime composition.

## Remote engine routing

The public entry retains `/v1/native/*` and `/v1/fiat/*`. Caddy forwards `/v1/mobile/paged-owner/*` to the private engine at `10.71.0.3:9445`, verifying its certificate and requiring `x-lianum-paged-pairing-id`. It does not retry operations. Joint routing is in `infra/google-cloud/paeg-engine/Caddyfile.example`; the installer preserves it when `/etc/caddy/lianum-paeg-transport.pem` is installed.

`POST /v1/wallet/connections` uses the existing single-use challenge and API identity signature with body `{}`. It returns `{profile: 'LIANUM_CLOUD_CONNECTIONS_V1', devicePublicKey, connections}` for that signer only; an unassigned identity receives `[]`. Reading connections does not create a SOURCE, native custody, spending permission or balance.

The optional `connectionDirectoryPath` selects a protected file such as `/etc/lianum/cloud-connections.json`, containing `{profile: 'LIANUM_CLOUD_CONNECTION_DIRECTORY_V1', connections: [...]}`. Entries are public Original Paged profiles obtained from the engine, with its identity, origin and certificate. The current implementation permits one active connection per identity and rejects ambiguous assignments.

Keep keys, witnesses and private operator configuration out of that directory. Install it as `root:lianum`, mode `0640`. The API validates it on startup. After changing a SOURCE or rotating its certificate, publish updated public profiles and restart the API as part of that deployment. Profiles already stored on the phone retain their custody and history. This is separate from restarting the financial engine.

Publication verification is read-only:

```sh
node infra/google-cloud/api-server/check-engine-routing-v1.mjs /path/to/public-directory.json
```

It checks pinned public TLS, each original connection, rejection of absent/unknown selectors and API health. It neither signs payments nor generates ZK proofs. Publishing HTTP does not open another financial composition. The current remote service loads Ethereum, Bitcoin and Solana; DeFi compositions need their own opening and recovery before availability can be advertised.
