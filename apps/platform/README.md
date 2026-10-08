# API móvil y base de operación

Esta aplicación contiene la frontera HTTP para permisos móviles y su registro
PostgreSQL. La réplica local arranca y permite consultar disponibilidad. El
adaptador económico está **sin vincular** en `src/run.mjs`: no genera notas,
pruebas ni movimientos. `ACCEPTED` significa permiso admitido; nunca saldo o
liquidación confirmada. El backend de `packages/backend` sigue siendo una
integración pendiente, con validación de propietario, keeper y operaciones.

## Archivos

| Ruta | Responsabilidad |
| --- | --- |
| `src/server.mjs` | HTTP, esquema, desafío, firma, disponibilidad y entrada única |
| `src/authorization-store.mjs` | Consumo y respuesta duraderos en PostgreSQL |
| `src/schema-migrations.mjs` | Versiones, checksums, lock y validación de esquema |
| `src/migrate.mjs` y `migrations/` | Comando explícito y SQL fijo; sin efectos económicos |
| `src/run.mjs` | Arranque sin hooks económicos, pool acotado y cierre |
| `src/database-pool.mjs` | Pool con plazos de espera y errores de transporte propios acotados |
| `tests/server.test.mjs` | Validación HTTP/criptográfica con persistencia de prueba |
| `tests/database-pool.test.mjs` | Cliente pg real ante silencio y cierre TCP controlados |
| `tests/postgres.test.mjs` | PostgreSQL real, carreras, reinicios y cliente móvil real |
| `tests/helpers/platform-child.mjs` | Proceso HTTP de integración con contador SQL, sin efectos de cadena |
| `Dockerfile` | Runtime público Node/pg; usuario sin privilegios |
| `compose.local.yml` | Réplica API + PostgreSQL local, sin publicar la base de datos |
| `scripts/local.mjs` | Arrancar/parar la réplica y crear la credencial local ignorada |

## Preparar y arrancar localmente

Desde la raíz del repositorio, con Node 24.19 y Docker. El contexto Docker
incluye únicamente runtime de platform y protocolo público; la base Node está
fijada por digest. La imagen no contiene respaldos, `.env`, laboratorio privado,
claves de custodia ni dependencias de la wallet web.

```sh
./dev npm --prefix apps/platform ci --ignore-scripts
# Construcción normal local; no sube imágenes ni usa Google Cloud.
docker build -f apps/platform/Dockerfile -t lianum-platform:local .
./dev node apps/platform/scripts/local.mjs start
```

Si tu configuración Docker tiene helpers de registros privados que requieren
sesión, usa un directorio independiente con `config.json` igual a
`{"auths":{}}`, y `docker --config RUTA build ...`. El script local utiliza esa
configuración independiente automáticamente; no modifica tus credenciales.

Compose espera la salud SQL, ejecuta la migración en un contenedor separado y
arranca la API sólo después de su éxito. El arranque normal verifica el esquema;
no crea tablas. Las instrucciones y límites están en [migrations/README.md](migrations/README.md).

La API se publica en `http://127.0.0.1:8080`. Puedes elegir otro puerto mediante
`LIANUM_LOCAL_PORT`. PostgreSQL y API tienen límites de 256 MiB y una CPU cada
uno. La credencial aleatoria local se guarda con permiso 0600 en
`.local/platform/local.env`; no se muestra ni se incorpora a Git. La red de
entrada SQL es interna, la API publica únicamente loopback y el volumen SQL
persiste al parar. El script exige al menos 2.5 GiB de memoria disponible antes
de arrancar y comprueba la salud desde el host.

```sh
curl http://127.0.0.1:8080/health/live    # 200 LIVE
curl http://127.0.0.1:8080/health/ready   # 503 UNAVAILABLE
curl http://127.0.0.1:8080/v1/mobile/state
./dev node apps/platform/scripts/local.mjs stop
```

`stop` quita los contenedores de este checkout y conserva su volumen. La
respuesta de estado es DISCONNECTED, `privatePortfolio:null` y capacidades
cerradas. El origen firmado se configura como HTTPS; esta réplica HTTP sirve
para desarrollo local. El bootstrap de producción no acepta una excepción
HTTP por variable de entorno. La app nativa admite loopback HTTP sólo con la
opción de compilación de desarrollo explícita documentada en `apps/mobile`.

## Contrato HTTP

- `GET /health/live`: proceso vivo. No demuestra capacidad económica.
- `GET /health/ready`: requiere persistencia disponible y adaptador económico
  explícito con alguna capacidad; devuelve 503 ante base caída o adaptador ausente.
- `GET /v1/mobile/state`: estado público sin clave de propietario en URL, sin
  saldo privado sintético.
- `POST /v1/mobile/challenges`: `{ownerPublicKey,intent}`; responde `{challenge}`.
- `POST /v1/mobile/authorizations`: `{challenge,signature}`; responde estado de
  admisión con el `requestId` original y `retryAllowed:false`.
- `POST /v1/mobile/authorization-receipts`: consulta firmada del permiso original;
  lee su admisión conservada, sin consumir ni ejecutar una operación.

Los esquemas exactos y bytes firmados viven en `packages/mobile-protocol`.
El desafío dura 60 segundos, une origen, propietario, nonce y términos y debe
existir en el registro SQL. Node/OpenSSL valida el punto secp256k1 y firma
SHA256 IEEE-P1363; el protocolo exige lowS. El await del adaptador tiene un plazo de 5 segundos: una respuesta tardía
conserva UNKNOWN sin cancelar ni repetir el efecto. Un fallo SQL después de
ready devuelve 503. El cierre HTTP drena hasta 5 segundos; SIGTERM limita todo
el cierre a 10 segundos. El cuerpo admite como máximo
8192 bytes, JSON UTF8 válido, campos exactos, sin redirecciones de custodia.
Las respuestas no incluyen fallos internos ni payloads de base de datos.

PostgreSQL limita las sentencias a 5 segundos y el cliente pg limita también su
espera a 5 segundos ante una conexión establecida que deja de responder. Se
descarta una conexión con transacción incierta. Perder la respuesta de COMMIT
no demuestra rollback: puede haber quedado consumido con UNKNOWN duradero,
sin dispatch ni reenvío. Los listeners pertenecen al Pool y a sus clientes;
una conexión rota, idle o prestada para una transacción, rechaza las consultas
sin provocar un error de EventEmitter sin gestionar en el proceso HTTP.
La caducidad del permiso se comprueba otra vez inmediatamente antes de llamar
al adaptador, después de esperar el consumo SQL. Si vence durante esa espera,
no hay dispatch y el original ya consumido conserva UNKNOWN y `retryAllowed:false`.

El consumo se confirma **antes** de llamar al adaptador. La clave única es
propietario + `requestId` + acción. Los términos de la operación original se
mantienen para prepare/execute/reconcile/recover. JSONB puede reordenar claves:
la igualdad se decide con digest canónico, sin depender del orden serializado.
Si una respuesta se pierde, el proceso muere o falla guardar la respuesta
final, queda UNKNOWN duradero y el mismo permiso no vuelve a disparar el
adaptador. No se promete exactly-once de un efecto externo: resolver UNKNOWN
necesita observación del keeper/cadena y recuperación económica real pendiente.

La consulta de recibo conserva el challenge y firma originales y añade nonce,
caducidad de hasta 60 segundos y firma en un dominio distinto. Verifica ambas
firmas y el alcance exacto antes de un SELECT del registro consumido. Permite
leer un original después de su caducidad; la autorización de efectos sigue
caducada. No modifica desafíos ni respuestas y no depende del executor, por lo
que puede leer con `/health/ready` en 503 por adaptador ausente. SQL no disponible
devuelve 503 y un original no conservado devuelve 404. Ninguna de esas respuestas
resuelve el estado económico ni habilita repetir la acción original.

## Comprobaciones reproducibles

```sh
./dev npm --prefix apps/platform test
# Instalar móvil también: la integración usa su cliente HTTP real.
./dev npm --prefix apps/mobile ci --ignore-scripts
./dev npm --prefix apps/platform run test:postgres
./dev npm --prefix apps/platform run test:docker
```

`test` ejecuta 22 pruebas host y omite explícitamente el grupo SQL real.
`test:postgres` crea PostgreSQL 17 oficial por digest, con 256 MiB, puerto
loopback aleatorio y volumen exclusivo. Ejecuta 18 casos y su grupo (19 PASS):
JSONB, carreras de mismo/nuevo desafío, separación propietario/acción,
términos inmutables, reinicio real de PostgreSQL/proceso HTTP y crashes antes y
después de un contador de efecto SQL. También mantiene el proceso HTTP y su Pool de producción vivos
al detener/arrancar SQL: observa el error idle real, readiness 503 durante caída
y recuperación sin segundo dispatch. No usa una base existente. Limpia sólo
su contenedor etiquetado y su volumen; el adaptador es un contador de prueba.
Una prueba retiene los bytes de respuesta de un COMMIT real: comprueba el plazo
del cliente, UNKNOWN conservado y ausencia de dispatch. Otra consulta un permiso
caducado mediante la API y el cliente móvil reales, y demuestra que desafíos,
consumos y contador de efecto SQL no cambian.
Los casos de migraciones usan bases exclusivas dentro del mismo contenedor y
comprueban esquema nuevo, adopción legacy, concurrencia, historial inválido,
índices únicos incompatibles, rollback, lock ocupado, COMMIT sin respuesta y
terminación del CLI. Estas comprobaciones han pasado sobre PostgreSQL real;
las pruebas de host de bytes o del protocolo TCP cubren ámbitos distintos.

`test:docker` comprueba la imagen ya construida, su migración explícita separada,
usuario 1000, esquema SQL real, liveness 200, readiness 503 y ausencia de balances inventados. Limpia sólo sus
contenedores y volúmenes. Los informes ignorados se escriben en
`.internal/dev/reports/platform-postgres.json` y `platform-docker.json`.

## Integración y producción pendientes

Falta el bridge entre identidad móvil y cuenta/keeper originales; la firma de
este permiso no sustituye validación de propiedad ni autoridad de pruebas.
Faltan estado privado reconciliado, contratos reales con los workers, límites
persistentes de admisión/abuso y política de retención del registro. La entrada pública y el
worker no se habilitan por defecto en Terraform.

El registro almacena identidad pública estable y términos del permiso, que
incluyen importe y destino. Eso permite verificación de alcance, pero no
satisface por sí solo la privacidad final. Hace falta revisar qué datos puede
conocer cada frontera, permisos de lectura y retención antes de exponerla.
Ni la verificación Node/JWK, ni los mocks de hardware móvil, ni estas pruebas
SQL demuestran custodia física, financiación, ZK o efectos en una red real.

Para Google Cloud, consultar `infra/google-cloud/README.md`. No hay proyecto
seleccionado ni despliegue realizado.
