# Arranque y diagnóstico del backend local

La entrada es `src/entry.mjs`, también en la imagen Docker. El perfil se elige
al arrancar, nunca mediante una petición HTTP. Los constructores originales
conservan cuenta, propietario, keeper y puentes en el mismo proceso.

| Perfil | Composición | Estado al arrancar |
|---|---|---|
| `admission` (predeterminado) | HTTP V1 y registro PostgreSQL cuando está configurado | API viva, operaciones indisponibles; no crea cuenta ni saldo |
| `original-native-new` | Operador Native V3 original, admisión SQL original, custodia, workers y gateway HTTP/TLS local | Exige configuración nueva válida y fuentes/artefactos originales; no financia automáticamente |
| `original-native-reopen` | El mismo perfil desde captura ordenada y emparejamiento existentes | Lectura, reconciliación y salida retenida; financiación y ejecución nuevas cerradas |

```sh
./dev platform admission
./dev platform original-native-new
./dev platform original-native-reopen
```

Los perfiles originales necesitan Node retenido con `--max-old-space-size=384`;
`./dev platform` pasa esos argumentos. Las entradas históricas continúan como
compatibilidad y llaman al mismo bootstrap.

## Dependencias y persistencia

- Admisión: `LIANUM_PUBLIC_ORIGIN`; `DATABASE_URL` y la clave de privacidad
  correspondiente si se habilita el registro SQL. Migración explícita previa.
- Original: configuración `operator.json` en
  `.internal/runtime/omnichain-flat-profile/flat-wallet/.local/original-device-cloud-local-v1/`,
  con el propietario y los permisos existentes. Sólo contiene la configuración
  privada ya descrita en la guía del operador; no acepta un executor arbitrario.
- Original: PostgreSQL con el esquema original migrado y la misma clave de
  privacidad, además de backend generado, toolchains y artefactos verificados.
  La comprobación de fuentes sigue activa; preparar una generación no concede
  autoridad financiera ni convierte una captura vieja en una generación nueva.
- Reapertura: exige además el `paired-descriptor.json` conservado y la captura
  original válida. Lo relee tras abrir y comprueba identidad física y contenido.
  No lo borra, sobrescribe ni vuelve a crear.

El proceso original escucha sólo en loopback. `/health/ready` consulta el esquema
SQL y el listener original: una API viva no basta para declarar disponibilidad.
SIGINT/SIGTERM cierran; SIGUSR2 en el perfil nuevo solicita su captura ordenada
original. Reiniciar no reenvía autorizaciones ni convierte UNKNOWN en reintento.

## Docker local

`Dockerfile` construye la imagen ligera `lianum-platform:local`; el comando
predeterminado ejecuta `entry.mjs admission`. `compose.local.yml` conserva el
entorno de admisión separado.

`compose.original.local.yml` permite ejecutar **la composición económica
existente** en Linux utilizando esa misma entrada e imagen. Monta el workspace
retenido en su ruta original, con el mismo UID/GID y Node retenido. No introduce
el laboratorio ni claves dentro de una imagen de distribución. PostgreSQL y
la clave deben ser los del emparejamiento elegido; no los crea ni los migra.

```sh
export LIANUM_LOCAL_WORKSPACE="$(pwd)"
export LIANUM_LOCAL_UID="$(id -u)"
export LIANUM_LOCAL_GID="$(id -g)"
export LIANUM_LOCAL_PLATFORM_PROFILE=original-native-reopen
# Configurar DATABASE_URL y LIANUM_PLATFORM_PRIVACY_KEY_FILE con los existentes.
docker compose -f apps/platform/compose.original.local.yml --profile original up
```

Usa red de host Linux para conservar el loopback del operador; no abre una API
pública. `original-native-new` se elige explícitamente para un entorno nuevo.
La portabilidad completa del laboratorio a una imagen autónoma y Google Cloud
siguen fuera de este empaquetado local.

## Diagnóstico

La entrada activa eventos JSON en stderr: componente, código fijo, minuto y
contador. Se distinguen SQL, adaptador, timeout y transporte original sin
registrar excepciones completas, direcciones, términos, permisos ni claves.
Los eventos se limitan a 60 por minuto y una cola stderr acotada; los contadores
en memoria usan únicamente códigos fijos. Docker retiene dos archivos de 5 MB.
Los fallos del emisor nunca alteran admisión, UNKNOWN o la regla de no reenviar.

Las pruebas rápidas comprueban la entrada de admisión real, el gateway HTTP/TLS
con constructor económico HOST declarado, el descriptor y los límites de
diagnóstico. No equivalen a financiar ni a recuperar ante una caída abrupta.
