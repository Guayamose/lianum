# Wallet móvil

Aplicación **nativa React Native/Expo para Android e iOS**, con pantallas propias,
custodia local y autorizaciones manuales acotadas. No carga la wallet web en una
WebView. Esta entrega establece el cliente y su frontera de seguridad; todavía
no completa los recorridos económicos del keeper histórico.

## Estructura

- `src/screens/`: pantallas y consentimiento.
- `src/custody/`: clave local, firma y operación pendiente cifrada.
- `src/api/`: transporte del protocolo móvil y estado público del servicio.
- `plugins/`: configuración nativa generada, incluido el límite de compilación Android.
- `tests/`: compatibilidad criptográfica, límites y pruebas de host con fronteras
  nativas simuladas explícitamente.
- `../../packages/mobile-protocol/`: contrato público compartido con el servidor.

El outbox V2 conserva el primer permiso, los términos económicos originales y
un permiso por acción. La respuesta de admisión de cada permiso se muestra por
separado: `execute: UNKNOWN` sigue pendiente aunque `reconcile` o `recover`
obtengan `REJECTED`. Ninguna respuesta HTTP cierra el estado económico ni libera
el registro para otra operación. Hace falta una observación financiera original,
que el bridge pendiente todavía no ofrece. No se generan permisos de reemplazo
ni reenvíos automáticos de una acción ya retenida.

Los registros V1 se leen sin inventar historial perdido y se conservan como
económicamente pendientes. Las escrituras se serializan en el realm de JS y
comprueban readback de SecureStore; esto no demuestra CAS entre procesos ni
protección nativa frente a rollback.

El consentimiento usa una revisión privada en memoria, vinculada a la pantalla
y su generación. Cancelar, editar, refrescar o salir de primer plano la invalida,
incluido un callback antiguo de la alerta. Vuelve a comprobar origen, identidad,
términos, capacidades recientes y caducidad tras biometría y tras almacenamiento;
consume la revisión antes de iniciar el POST. Si la revisión cambia durante la
retención, conserva el permiso original pendiente y evita ese envío.

Cada permiso guardado ofrece «Consultar permiso» para leer únicamente su admisión
original. La consulta conserva el permiso completo, crea un nonce aleatorio y
vence en 60 segundos. Muestra el alcance y exige consentimiento y biometría
nuevos, con una firma en dominio propio. No reenvía el permiso de ejecución.
Funciona después de caducar el permiso original y puede consultar PostgreSQL
cuando el adaptador económico está desconectado.

Esta consulta también usa una revisión privada revocable: cancelar, cambiar
origen o propietario, refrescar y salir de primer plano impiden usar un callback
anterior. Se comprueba de nuevo después de biometría y de leer o guardar la
operación protegida. La revisión se consume antes del POST de lectura. Un 404,
timeout o respuesta perdida conserva el outbox pendiente; una lectura tardía no
rebaja un permiso ACCEPTED a UNKNOWN. Leer ACCEPTED sólo confirma admisión del
permiso: el estado económico sigue UNRESOLVED y no libera la operación.

## Desarrollo

Desde la raíz del repositorio, con el Node local:

```sh
./dev npm --prefix apps/mobile ci
./dev npm --prefix apps/mobile run typecheck
./dev npm --prefix apps/mobile test
./dev npm --prefix apps/mobile run prebuild
./dev npm --prefix apps/mobile run export
```

`prebuild` genera proyectos nativos `android/` e `ios/` a partir de `app.json`;
ambos se excluyen de Git. `export` genera los bundles de Hermes en `dist/`,
también excluidos. Ninguno publica la aplicación, crea cuentas EAS ni demuestra
que un binario instalado funcione en un dispositivo.

Para instalar una compilación de desarrollo usa `npm run android` con Android SDK
y su JDK compatible, o `npm run ios` en macOS con Xcode/CocoaPods. Los comandos
se ejecutan en `apps/mobile` con el Node local en `PATH`. La creación de proyectos
iOS puede comprobarse en Linux; la compilación e instalación iOS requieren macOS.

Para preparar un APK **debug** local sin instalarlo ni subirlo:

```sh
./dev npm --prefix apps/mobile run build:android:debug -- --preflight
./dev npm --prefix apps/mobile run build:android:debug
```

El preflight comprueba JDK 17 o superior, SDK/API 36, build-tools 36.0.0,
NDK 27.1.12297006 y CMake 3.22.1. Usa `ANDROID_HOME`, `ANDROID_SDK_ROOT` o
`~/Android/Sdk`. La compilación genera Android desde `app.json`, verifica el
[SHA-256 oficial de Gradle 9.3.1](https://services.gradle.org/distributions/gradle-9.3.1-bin.zip.sha256)
y limita Gradle a un worker. El plugin público `with-native-build-limits.cjs`
configura app y bibliotecas Android con un único pool Ninja `owned_build=1`,
compartido por compilación y enlace. El helper verifica esos argumentos en los
archivos Gradle generados antes de iniciar la compilación. Comprueba que el APK sólo incluye
`arm64-v8a` y `x86_64`; registra hash y resultado en
`.internal/dev/reports/mobile-android-debug.json`.

El JVM de Gradle usa un heap máximo de 1024 MiB y metaspace máximo de 512 MiB.
El informe conserva los límites solicitados y las opciones observadas en los
procesos Java propios, incluidos los workers y el daemon de uso único, con su
identidad de Linux y RSS máximo. Las opciones de un worker pueden diferir de
las del JVM principal; todos cuentan para el mismo límite total. Se usan los
[argumentos JVM de Gradle](https://docs.gradle.org/9.3.1/userguide/build_environment.html#sec:configuring_jvm_memory)
y la [compilación Kotlin en proceso](https://kotlinlang.org/docs/gradle-compilation-and-caches.html#defining-kotlin-compiler-execution-strategy).

Necesita 5,5 GiB disponibles al empezar; vigila el RSS de sus procesos y descendientes
con un máximo de 3 GiB y conserva 2,5 GiB libres. Comparte el lock del prover
cuando existe el runtime; una prueba activa bloquea la compilación. No ejecuta
`gradle --stop` ni detiene procesos ajenos. Los daemons de uso único de Gradle
pueden abrir otra sesión: sólo se incorporan tras comprobar padre, PID, inicio
y UID; las señales individuales vuelven a comprobar esa identidad. El APK resultante estará en
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` y necesita Metro,
por ser una compilación de desarrollo.

El build del commit `141b0ef54a78dfe8f32818c51067bf761ff3cb4c` pasó en 6 min 19 s,
con 308 tareas Gradle. Se conserva el APK verificado en:

```text
.local/mobile/artifacts/android-debug-bdfa2078-166b-45bf-8d43-d175536cb173/lianum-wallet-debug.apk
```

Su tamaño es **102 729 139 bytes** y su SHA-256:

```text
dc5645cc9a989784a2bf8fe3ced1cdaaae2e2ff29d5b3d61a4de109ebdb3f71e
```

`aapt2` confirma `org.lianum.wallet`, versión `0.1.0`, SDK mínimo 24, objetivo 36,
ABI `arm64-v8a` y `x86_64`, `debuggable=true` y `allowBackup=false`.
`apksigner verify` acepta la firma APK v2 con certificado **Android Debug**.
El APK carga el código de la aplicación mediante Metro. La variante debug
incluye transporte claro para desarrollo; el cliente sigue exigiendo HTTPS
salvo la excepción local explícita descrita más abajo.

Las capturas antes y después coinciden en las **35 fuentes fijadas** y en el
Node 24.19.0, JDK principal y SDK. El build usó JDK Ubuntu 21.0.12.1 y un worker
Temurin 17.0.20.1 resuelto en la caché Gradle propia; también se conservaron
versiones y hashes de ambos binarios Java. El pico RSS total fue
**3 069 050 880 bytes**, dentro del límite de 3 GiB; quedaron al menos
14 077 702 144 bytes de RAM disponibles. Los procesos propios cerraron,
el lock se retiró y no fue necesario enviar señales.

Los cuatro `build.ninja` de app y Expo Modules Core, en ambas ABI, asignan sus
130 tareas de compilación/enlace al pool compartido de tamaño uno. Los probes
temporales LTO de CMake 3.22 no heredan ese pool; no se ha medido su concurrencia.
Todos sus procesos siguen dentro del mismo guard de memoria.

Los logs, manifiesto, firma, capturas y archivos Ninja originales están en
`.internal/dev/reports/mobile-android-debug-attempt-bdfa2078-166b-45bf-8d43-d175536cb173/`.
El primer intento rechazado por memoria también permanece conservado.
La instalación y la biometría física se comprobarán al final, por indicación
del usuario. Esta entrega conserva su firma debug y no se ha publicado como release.

El límite usa los argumentos CMake
[`CMAKE_JOB_POOLS`](https://cmake.org/cmake/help/v3.22/variable/CMAKE_JOB_POOLS.html),
[`CMAKE_JOB_POOL_COMPILE`](https://cmake.org/cmake/help/v3.22/variable/CMAKE_JOB_POOL_COMPILE.html)
y [`CMAKE_JOB_POOL_LINK`](https://cmake.org/cmake/help/v3.22/variable/CMAKE_JOB_POOL_LINK.html).
La regresión ejecuta Ninja directamente con `-j8`: una fixture sin pools muestra
concurrencia y la misma fixture con este pool sólo admite un compilador o linker
a la vez. `CMAKE_BUILD_PARALLEL_LEVEL` por sí solo limita `cmake --build`; AGP
también puede invocar Ninja directamente. No se modifican AGP ni cachés ajenas.

Copia `.env.example` a `.env` y configura `EXPO_PUBLIC_API_ORIGIN` con el origen
HTTPS del servicio. Esa configuración es pública y se incorpora al bundle: no
guardes ahí ninguna clave, token privado o secreto. También puedes introducir el
origen en la pantalla. No se inicia ninguna petición económica automáticamente.

HTTP sólo se admite en una compilación de desarrollo, con
`EXPO_PUBLIC_ALLOW_INSECURE_LOOPBACK=1`, y sólo para `127.0.0.1` o `localhost` con
puerto explícito. En un emulador Android se puede conectar el puerto local con
`adb reverse tcp:8080 tcp:8080`. La excepción no admite una IP de LAN ni habilita
HTTP en el bundle de producción.

## Qué hace y qué falta

El cliente permite crear una identidad secp256k1, consultar la disponibilidad del
servicio, revisar el origen/activo/red/destino/importe/comisión/ID/caducidad y
firmar tras consentimiento y autenticación biométrica. La firma usa SHA256,
IEEE-P1363 y lowS, compatibles con los codecs Node originales. La autorización
nueva tiene un dominio propio y no sustituye una autorización de prueba Noir.

El servicio recibe la clave pública de identidad y los términos de cada permiso.
Puede correlacionarlos. HTTPS y el almacenamiento protegido no resuelven esa
privacidad de sistema: faltan credenciales/accesos acotados por rol y la adaptación
de los grafos privados, incluidos sus metadatos. Esta base no acredita el objetivo
de privacidad por defecto del producto.

El estado inicial presenta el saldo como **no disponible**. `ACCEPTED/ADMITTED`
sólo indica admisión de autorización: no significa fondos reservados, prueba
aceptada, operación ejecutada ni liquidación. Una respuesta perdida queda
`UNKNOWN` con su ID original, sin reenvíos automáticos.

La operación firmada se guarda con protección biométrica **antes** del POST.
Después de un reinicio, «Recuperar operación guardada» carga su ID y prepara una
reconciliación explícita; no repite el POST anterior. Esta primera versión mantiene
una sola operación activa y bloquea reemplazarla hasta una integración que pueda
establecer su finalización. La API de disponibilidad todavía no proporciona ese
estado económico.

Faltan el enlace con un keeper real que acepte la autoridad del dispositivo, la
preparación local de notas/testigos privados, el estado privado autenticado,
la finalización y recuperación de fondos, y la migración de dispositivo. Un
backend sin executor real permanece desconectado y con capacidades cerradas.

## Custodia y comprobaciones

La clave se genera mediante `expo-crypto.getRandomBytesAsync`, se conserva en
SecureStore con `requireAuthentication: true` y, en iOS, accesibilidad
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. La clave pública se almacena por separado.
Cambiar la biometría puede invalidar la clave protegida; el cliente falla y no
la reemplaza silenciosamente. No hay exportación de clave raíz ni envío al
servidor.

Esta implementación recupera temporalmente la clave **en memoria JavaScript**
para firmar. Se limpian los buffers mutables; JavaScript no permite garantizar
el borrado de cadenas/BigInts ni del estado interno de la librería. No es una
clave secp256k1 no exportable de Secure Enclave/StrongBox. Falta revisión de
seguridad y comprobación de biometría y ciclo de vida en dispositivos reales.
SecureStore tampoco constituye por sí solo un respaldo recuperable: desinstalar,
perder el teléfono o cambiar la biometría puede impedir recuperar una clave.

La suite de host verifica las firmas contra el `ownerFrame` y verificador Node
originales, rechaza sustituciones de cada campo, caducidad, highS y permisos
sin límites; simula las APIs nativas para comprobar protección de almacenamiento,
cancelación y retención del ID. Esas simulaciones no acreditan aislamiento de
hardware ni aceptación de fondos.

La instalación fijada usa Expo 57.0.27, React 19.2.3, React Native 0.86.3 y
`@noble/curves` 2.4.0. `xcode/uuid` se fija a 11.1.1 conservando su API `v4`.
El audit de npm aún señala 15 dependencias como high, propagadas desde
`braces <=3.0.3` y `node-forge <=1.4.0` en las herramientas Expo/Metro; sus últimas
versiones consultadas todavía están afectadas. No se ha degradado Expo/RN ni
ocultado esos resultados. Resolverlos y revisar el bundle publicado son trabajo
pendiente antes de distribuir una wallet con fondos.

Advisories pendientes:
[braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) y
[node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

Referencias: [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/),
[Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/),
[LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/).
