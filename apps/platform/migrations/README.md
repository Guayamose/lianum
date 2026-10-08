# Migraciones del registro de permisos

La lista ejecutable está fijada en `src/schema-migrations.mjs`. Cada versión une
un nombre de archivo y su SHA256. El runner verifica esos bytes antes de abrir
una conexión; no escanea la carpeta ni acepta rutas, SQL o un plan alternativo.

| Versión | Archivo | SHA256 |
| --- | --- | --- |
| 1 | `001_mobile_authorizations.sql` | `cabd8655911a0fb317096be2b28806ab4175f79e9af2549f157ed5a850022251` |

V1 conserva el esquema original de `public.mobile_challenges`,
`public.mobile_operations` y `public.mobile_authorizations`. Crea las tres tablas
en una base nueva o registra un esquema antiguo compatible. No altera ni borra
filas, claves, permisos o respuestas. Un esquema antiguo parcial, tipos/columnas,
defaults o claves incompatibles se rechazan; no se reparan automáticamente.

## Ejecutar y comprobar

Con `DATABASE_URL` ya disponible en el entorno del proceso, desde la raíz:

```sh
./dev npm --prefix apps/platform run db:migrate
./dev npm --prefix apps/platform start
```

El primer comando imprime sólo estado, versión y versiones aplicadas. No muestra
la credencial, el SQL ni detalles del servidor. La imagen Docker incluye el
mismo comando `node src/migrate.mjs`. Compose local ejecuta su servicio `migrate`
una vez después de que SQL esté sano y espera su éxito antes de iniciar la API.

El arranque normal y `store.ready()` sólo leen el historial y la forma del esquema.
`createPostgresAuthorizationStore(pool)` conserva su constructor async y crea
el acceso sin DDL: quien prepare una base nueva debe migrarla explícitamente.
Las consultas del store apuntan siempre a `public`, aunque el URL SQL cambie el
`search_path`. Las fixtures de pruebas migran sus propias bases aisladas.

## Concurrencia y errores

Una transacción incluye el lock común `pg_advisory_xact_lock`, la creación o
adopción del esquema y la fila de `public.platform_schema_migrations`. Dos
migradores concurrentes se serializan y cada versión queda registrada una vez.
La fecha de aplicación no cambia al repetir un comando ya completado.

El lock espera como máximo 4 segundos y las sentencias 4,5 segundos. El cliente
mantiene su plazo de 5 segundos ante silencio TCP. Ante un error se intenta
ROLLBACK y se descarta la conexión. Si el transporte agota el plazo, no se
encola ese ROLLBACK. Perder la respuesta de COMMIT no demuestra rollback:
el runner falla, descarta la conexión incierta y la siguiente ejecución consulta
el historial conservado antes de decidir qué falta. No reescribe checksums ni
asume que una versión ausente o desconocida se puede sustituir.

Una versión futura, un hueco o un nombre/checksum distinto bloquean migración
y disponibilidad. No hay comando `down`, borrado del historial ni migración
automática durante una petición HTTP. Añadir una versión requiere código y SQL
revisados, checksum nuevo y pruebas de compatibilidad con las filas existentes.

Estas migraciones sólo administran el registro de admisiones. No vinculan el
keeper económico, no crean fondos ni ejecutan operaciones o Google Cloud.

Las pruebas de host validan bytes, CLI y transporte; la suite PostgreSQL real
valida adopción de filas UNKNOWN/ACCEPTED, arranques concurrentes, rollback DDL,
lock ocupado, terminación del proceso y respuesta de COMMIT perdida.

Referencias: [locks transaccionales PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS),
[IF NOT EXISTS y compatibilidad del esquema](https://www.postgresql.org/docs/17/sql-createtable.html),
[plazos del cliente pg](https://node-postgres.com/apis/client) y
[dependencias de Compose](https://docs.docker.com/compose/how-tos/startup-order/).
