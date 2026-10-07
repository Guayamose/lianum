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
| `src/run.mjs` | Arranque sin hooks económicos, pool acotado y cierre |
| `src/database-pool.mjs` | Pool compartido que sobrevive a fallos de conexiones SQL idle |
| `tests/server.test.mjs` | Validación HTTP/criptográfica con persistencia de prueba |
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

Los esquemas exactos y bytes firmados viven en `packages/mobile-protocol`.
El desafío dura 60 segundos, une origen, propietario, nonce y términos y debe
existir en el registro SQL. Node/OpenSSL valida el punto secp256k1 y firma
SHA256 IEEE-P1363; el protocolo exige lowS. El await del adaptador tiene un plazo de 5 segundos: una respuesta tardía
conserva UNKNOWN sin cancelar ni repetir el efecto. Un fallo SQL después de
ready devuelve 503. El cierre HTTP drena hasta 5 segundos; SIGTERM limita todo
el cierre a 10 segundos. El cuerpo admite como máximo
8192 bytes, JSON UTF8 válido, campos exactos, sin redirecciones de custodia.
Las respuestas no incluyen fallos internos ni payloads de base de datos.

El consumo se confirma **antes** de llamar al adaptador. La clave única es
propietario + `requestId` + acción. Los términos de la operación original se
mantienen para prepare/execute/reconcile/recover. JSONB puede reordenar claves:
la igualdad se decide con digest canónico, sin depender del orden serializado.
Si una respuesta se pierde, el proceso muere o falla guardar la respuesta
final, queda UNKNOWN duradero y el mismo permiso no vuelve a disparar el
adaptador. No se promete exactly-once de un efecto externo: resolver UNKNOWN
necesita observación del keeper/cadena y recuperación económica real pendiente.

## Comprobaciones reproducibles

```sh
./dev npm --prefix apps/platform test
# Instalar móvil también: la integración usa su cliente HTTP real.
./dev npm --prefix apps/mobile ci --ignore-scripts
./dev npm --prefix apps/platform run test:postgres
./dev npm --prefix apps/platform run test:docker
```

`test` ejecuta 11 pruebas host y omite explícitamente el grupo SQL real.
`test:postgres` crea PostgreSQL 17 oficial por digest, con 256 MiB, puerto
loopback aleatorio y volumen exclusivo. Ejecuta 7 casos y su grupo (8 PASS):
JSONB, carreras de mismo/nuevo desafío, separación propietario/acción,
términos inmutables, reinicio real de PostgreSQL/proceso HTTP y crashes antes y
después de un contador de efecto SQL. También mantiene el proceso HTTP y su Pool de producción vivos
al detener/arrancar SQL: observa el error idle real, readiness 503 durante caída
y recuperación sin segundo dispatch. No usa una base existente. Limpia sólo
su contenedor etiquetado y su volumen; el adaptador es un contador de prueba.

`test:docker` comprueba la imagen ya construida, usuario 1000, esquema SQL real,
liveness 200, readiness 503 y ausencia de balances inventados. Limpia sólo sus
contenedores y volúmenes. Los informes ignorados se escriben en
`.internal/dev/reports/platform-postgres.json` y `platform-docker.json`.

## Integración y producción pendientes

Falta el bridge entre identidad móvil y cuenta/keeper originales; la firma de
este permiso no sustituye validación de propiedad ni autoridad de pruebas.
Faltan estado privado reconciliado, contratos reales con los workers, límites
persistentes de admisión/abuso, política de retención del registro y migraciones
SQL versionadas (el bootstrap actual crea el esquema). La entrada pública y el
worker no se habilitan por defecto en Terraform.

El registro almacena identidad pública estable y términos del permiso, que
incluyen importe y destino. Eso permite verificación de alcance, pero no
satisface por sí solo la privacidad final. Hace falta revisar qué datos puede
conocer cada frontera, permisos de lectura y retención antes de exponerla.
Ni la verificación Node/JWK, ni los mocks de hardware móvil, ni estas pruebas
SQL demuestran custodia física, financiación, ZK o efectos en una red real.

Para Google Cloud, consultar `infra/google-cloud/README.md`. No hay proyecto
seleccionado ni despliegue realizado.
