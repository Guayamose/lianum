# Local backend booting and diagnosis

The entrance is `src/entry.mjs`also in the Docker image. The profile is chosen when booting, never using an HTTP request. The original builders retain account, owner, keeper and bridges in the same process.

| Perfil | Composition | Status on startup |
|---|---|---|
| `admission` (default) | HTTP V1 and PostgreSQL registry when configured | Live API, unavailable transactions; no account and no balance |
| `original-native-new` | Original Native V3 Operator, Original SQL Admission, Custody, Workers & HTTP/TLS Gateway | Requires new valid configuration and original sources/crafts; does not automatically finance |
| `original-native-reopen` | Same profile from existing orderly capture and matching | Reading, reconciliation and exit withheld; new funding and implementation closed |

```sh
./dev platform admission
./dev platform original-native-new
./dev platform original-native-reopen
```

The original profiles need Node retained with `--max-old-space-size=384`; `./dev platform` pass those arguments. The historical entries continue as compatibility and call the same bootstrap.

## Dependencies and persistence

- Admission: `LIANUM_PUBLIC_ORIGIN`; `DATABASE_URL` and the Privacy Key
corresponding if the SQL record is enabled. Explicit prior migration.
- Original: configuration `operator.json` en
`.internal/runtime/omnichain-flat-profile/flat-wallet/.local/original-device-cloud-local-v1/`, with the existing owner and permissions. It only contains the private configuration already described in the operator's guide; it does not accept an arbitrary executor.
- Original: PostgreSQL with the original migrated scheme and the same key
privacy, in addition to generated backend, toolchains and verified artifacts. The source check is still active; preparing a generation does not grant financial authority or turn an old catch into a new generation.
- Reopening: it also requires the `paired-descriptor.json` preserved and caught
valid original. Reread it after opening and checking physical identity and content. It does not erase, overwrite or recreate.

The original process listens only in loopback. `/health/ready` see the SQL schema and the original listener: a live API is not enough to declare availability. SIGINT/SIGTERM close; SIGUSR2 in the new profile requests its original ordered capture. Restart does not forward authorizations or convert UNKNOWN into retry.

## Docker local

`Dockerfile` builds the light image `lianum-platform:local`; default command executes `entry.mjs admission`. `compose.local.yml` retains the separate intake environment.

`compose.original.local.yml` allows running **the existing economic composition** on Linux using the same input and image. Mount the retained workspace on its original route, with the same UID/GID and Node retained. It doesn't enter the lab or keys into a distribution image. PostgreSQL and the key must be the chosen pairing; neither creates nor migrates them.

```sh
export LIANUM_LOCAL_WORKSPACE="$(pwd)"
export LIANUM_LOCAL_UID="$(id -u)"
export LIANUM_LOCAL_GID="$(id -g)"
export LIANUM_LOCAL_PLATFORM_PROFILE=original-native-reopen
# Configurar DATABASE_URL y LIANUM_PLATFORM_PRIVACY_KEY_FILE con los existentes.
docker compose -f services/api-server/compose.original.local.yml --profile original up
```

It uses Linux host network to keep the operator loopback; it does not open a public API. `original-native-new` is explicitly chosen for a new environment. The complete portability of the lab to an autonomous image and Google Cloud remain outside this local packaging.

## Diagnosis

Entry activates JSON events in stderr: component, fixed code, minute and counter. SQL, adapter, timeout and original transport are distinguished without registering complete exceptions, addresses, terms, permissions or keys. Events are limited to 60 per minute and a tapered stderr tail; memory counters use only fixed codes. Docker retains two 5 MB files. The issuer's failures never alter admission, UNKNOWN or the non-resent rule.

Rapid tests check the actual admission input, HTTP/TLS gateway with declared HOST economic constructor, descriptor and diagnostic limits. They do not amount to financing or recovering from an abrupt fall.
