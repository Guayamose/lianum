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
