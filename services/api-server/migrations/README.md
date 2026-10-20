# Authorization registry migrations

<p><a href="../../../README.md"><img src="../../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../../docs/README.md) · [Architecture](../../../docs/ARCHITECTURE.md) · [Validation](../../../docs/VALIDATION.md)

The executable list is set to `src/storage/schema-migrations.mjs`. Each version unites a file name and its SHA256. The runner checks those bytes before opening a connection; it does not scan the folder or accept routes, SQL or an alternative plan.

| Version | File | SHA256 |
| --- | --- | --- |
| 1 | `001_mobile_authorizations.sql` | `cabd8655911a0fb317096be2b28806ab4175f79e9af2549f157ed5a850022251` |

V1 retains the original scheme of `public.mobile_challenges`, `public.mobile_operations` and `public.mobile_authorizations`. Create the three tables on a new base or register a compatible old scheme. Do not alter or delete rows, keys, permissions or answers. A partial old scheme, types/columns, defaults or incompatible keys are rejected; they are not automatically repaired.

## Run and check

Con `DATABASE_URL` already available in the process environment, from the root:

```sh
./dev npm --prefix services/api-server run db:migrate
./dev npm --prefix services/api-server start
```

The first command prints only status, version and applied versions. It does not show the credentials, SQL or server details. The Docker image includes the same command `node src/storage/migrate.mjs`. Local Compose executes your service `migrate` once after SQL is healthy and expects its success before starting the API.

Normal booting and `store.ready()` They only read the history and shape of the scheme. `createPostgresAuthorizationStore(pool)` preserves its async builder and creates access without DDL: whoever prepares a new base must explicitly migrate it. The store’s queries always point to `public`, even if the SQL URL changes the `search_path`. Test fixtures migrate their own isolated bases.

## Concurrency and errors

A transaction includes the common lock `pg_advisory_xact_lock`, the creation or adoption of the schema and row of `public.platform_schema_migrations`. Two concurrent migrators are serialized and each version is registered once. The application date does not change when repeating an already completed command.

The lock waits at most 4 seconds and statements 4.5 seconds. The client maintains its 5-second time limit against TCP silence. Faced with an error, ROLLBACK is tried and the connection is discarded. If the transport runs out of time, that ROLLBACK is not attached. Losing COMMIT's response does not show rollback: the runner fails, discards the uncertain connection, and the following execution consults the preserved history before deciding what is missing. Do not rewrite checksums or assume that an absent or unknown version can be replaced.

A future version, a hole or a different name/checksum block migration and availability. No command `down`, deleted from history or automatic migration during an HTTP request. Adding a version requires revised code and SQL, new checksum and compatibility tests with existing rows.

These migrations only manage the admissions register. They don't link economic keeper, they don't create funds, they don't run operations, or Google Cloud.

Tests of valid host bytes, CLI and transport; the actual PostgreSQL suite validates adoption of rows UNKNOWN/ACCEPTED, concurrent booting, rollback DDL, occupied lock, process completion and lost COMMIT response.

References: [PostgreSQL transactional blocks](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS), [IF NOT EXISTS and schema compatibility](https://www.postgresql.org/docs/17/sql-createtable.html), [client time pg](https://node-postgres.com/apis/client) and [Compose dependencies](https://docs.docker.com/compose/how-tos/startup-order/).
