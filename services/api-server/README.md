# Servicio API

`src/wallet-entry.mjs` arranca la API pública utilizada por la wallet móvil. Requiere `LIANUM_PUBLIC_WALLET_CONFIG`; el ejemplo se encuentra en `infra/google-cloud/api-server/config.example.json`.

```sh
LIANUM_PUBLIC_WALLET_CONFIG=/ruta/a/public-wallet.json ./dev api
```

`src/entry.mjs` permite seleccionar esa API o los perfiles `admission`, `original-native-new` y `original-native-reopen`. La admisión con PostgreSQL requiere un ejecutor vinculado explícitamente para admitir operaciones económicas.

- `src/admission`: HTTP y arranque de admisión.
- `src/authorization`: autorizaciones, registros protegidos y redacción de datos antiguos.
- `src/storage`: conexión SQL y ejecución explícita de migraciones.
- `src/original`: puentes y recuperación de las generaciones compatibles.
- `migrations`: esquema SQL versionado.
- `tests`: autorización, HTTP, privacidad y durabilidad.

El Dockerfile arranca el perfil de admisión. Las migraciones se ejecutan aparte mediante `src/storage/migrate.mjs`. El despliegue actual de la API pública utiliza una VM y systemd, definidos bajo `infra/google-cloud/api-server`.

La lógica de negocio permanece en `packages`; este servicio contiene las entradas y la composición necesarias para ejecutarla.

## Conexión con el motor remoto

La entrada pública conserva las rutas `/v1/native/*` y `/v1/fiat/*`. Caddy
envía `/v1/mobile/paged-owner/*` al motor privado `10.71.0.3:9445`, verificando
su certificado; exige `x-lianum-paged-pairing-id`. No reintenta operaciones.
La configuración conjunta está en
`infra/google-cloud/paeg-engine/Caddyfile.example`. El instalador la conserva
cuando está instalado `/etc/caddy/lianum-paeg-transport.pem`.

`POST /v1/wallet/connections` utiliza el mismo reto de un solo uso y firma de
identidad de la API, con cuerpo `{}`. Devuelve
`{profile: 'LIANUM_CLOUD_CONNECTIONS_V1', devicePublicKey, connections}`:
sólo las conexiones del firmante; una identidad no asignada recibe `[]`.
Esta consulta no crea una Source, custodia nativa, permiso de gasto ni saldo.

La propiedad opcional `connectionDirectoryPath` de la configuración selecciona
un archivo protegido, por ejemplo `/etc/lianum/cloud-connections.json`, con
`{profile: 'LIANUM_CLOUD_CONNECTION_DIRECTORY_V1', connections: [...]}`.
Son exclusivamente perfiles públicos Original Paged, obtenidos del motor,
con su identidad, origen y certificado. La versión actual admite una conexión
activa por identidad y rechaza asignaciones ambiguas. No añadas claves,
testigos o configuración privada del operador. Instálalo como `root:lianum`,
modo `0640`. La API lo valida al iniciar; después de cambiar una Source o
rotar su certificado hay que publicar los perfiles actuales y reiniciar la API.
Los perfiles guardados en el móvil conservan sus custodias e historial.

La comprobación de publicación es de sólo lectura:

```sh
node infra/google-cloud/api-server/check-engine-routing-v1.mjs /ruta/al/directorio-publico.json
```

Comprueba TLS público fijado, cada conexión original, rechazo de selección
ausente/desconocida y salud de la API. No firma pagos ni genera pruebas ZK.
Publicar HTTP no abre otras composiciones: el servicio remoto actual carga
Ethereum, Bitcoin y Solana. Las composiciones DeFi necesitan su propia apertura
y recuperación antes de anunciar su disponibilidad en ese servicio.
