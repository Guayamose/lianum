# Wallet móvil

Aplicación **nativa React Native/Expo para Android e iOS**, con custodia local,
consentimientos por acción y conexiones HTTPS explícitas. Los recorridos
financieros originales están aceptados en laboratorio Node/TLS; el uso
financiero en teléfono y las siete redes completas siguen pendientes.

La app abre **Estado privado**. Reúne sólo lecturas autorizadas de las cuentas,
notas y posiciones conectadas, separadas por activo, dominio, raíz y generación.
No suma redes ni convierte una participación o su valoración en saldo gastable.
UNKNOWN, STALE, un servicio no conectado y una lectura caducada muestran
**No disponible**, conservando las operaciones pendientes.

- **Cuenta vinculada:** consultar o reconciliar una petición original; leer el
  saldo de una cuenta y pool con un permiso de lectura específico.
- **Financiar nota:** conservar la misma nota fuente D26, reservarla y consultar
  por separado los outputs de cambio y recuperación; ejecutar, reconciliar o
  retirar con sus permisos originales. La recuperación automática se activa
  o desactiva con consentimiento fresco y conserva el plazo económico original.
- **Nota ERC20:** crear la nota propia antes de financiar, depositar y retirar
  la fuente íntegra con D26/W39. Una respuesta perdida se observa sobre el
  mismo trabajo, sin reenvío automático.
- **Posiciones DeFi:** revelar y leer posiciones del backend vinculado con dos
  permisos propios. Esta consulta no adopta su custodia ni autoriza gasto móvil.
- **Custodia local:** preparar y respaldar la raíz cifrada. Una preparación
  local `UNISSUED` o una firma todavía no representan fondos ni saldo.
- **Cartera:** conserva el outbox de admisiones legado descrito más abajo;
  su aceptación HTTP/SQL se presenta separada del estado financiero original.

La raíz y las claves de nota permanecen locales. El usuario protege su respaldo;
la apertura consentida llega al worker original para la prueba. Editar, ocultar
la pantalla o pasar a segundo plano revoca los permisos pendientes y la frescura
visible. El APK actualizado está compilado y archivado con el contrato de ambos
outputs bloqueados. La instalación y operación física quedan para el final.

## Estructura

- `src/screens/`: pantallas y consentimiento.
- `src/custody/`: clave local, firma y operación pendiente cifrada.
- `src/api/`: transporte del protocolo móvil y estado público del servicio.
- `plugins/`: configuración nativa generada, incluido el límite de compilación Android.
- `tests/`: compatibilidad criptográfica, límites y pruebas de host con fronteras
  nativas simuladas explícitamente.
- `../../packages/mobile-protocol/`: contrato público compartido con el servidor.

## Outbox de admisión legado

La pestaña Cartera y el outbox V1/V2 pertenecen a la ruta de admisión histórica.
Sus permisos SQL no conceden custodia ni sustituyen las rutas originales
Cuenta vinculada, Financiar nota, Nota ERC20 o Posiciones DeFi.

El outbox V2 conserva el primer permiso, los términos económicos originales y
un permiso por acción. La respuesta de admisión de cada permiso se muestra por
separado: `execute: UNKNOWN` sigue pendiente aunque `reconcile` o `recover`
obtengan `REJECTED`. Ninguna respuesta HTTP cierra el estado económico ni libera
el registro para otra operación. Hace falta una observación financiera original,
que esta ruta de admisión legada no ofrece. No se generan permisos de reemplazo
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

## Notas nativas y recuperación

La fuente D26 y los outputs de cambio y recuperación conservan su raíz, trabajo,
reserva y destinatario originales. Un importe guardado es información local;
el disponible exige lectura original fresca, inclusión y nullifier no gastado.
La recuperación permanece bloqueada antes de F y del plazo original.

Si una observación F pierde su bloque, la app guarda UNKNOWN y revoca el saldo
antes de consultar otra vez. Sólo reconciliación del mismo F puede volver a
instalar su resultado; no envía un nuevo permiso de recuperación ni libera la
operación por una respuesta HTTP. El recorrido `b4329b70` quedó aceptado con
nueve pruebas originales: UNKNOWN durable, ambos outputs bloqueados, reapertura
del Vault y segunda reconciliación del mismo F antes de ambas W39. Conserva
una única reemisión del wire original, sin nueva firma nativa, permiso económico
ni prueba de recuperación. El alcance es el padre original exacto de F; no se
supone saldo cero ni se reenvía automáticamente.

El servicio LIVE_ARMED aceptó conservar la misma reserva, autorización armada,
Vault, journal y provider en un reinicio ordenado. Su variante corta usa tres
pruebas D26/U/S y una READ firmada nueva, sin F antes del cutoff; no acredita
F autónomo después de ocho horas, pérdida abrupta ni teléfono. Véase [cuenta original](../../docs/ORIGINAL-ACCOUNT-V2.md)
y [entrada nativa local](../platform/docs/ORIGINAL-LOCAL-DEVICE-OPERATOR.md).

## Consultar posiciones DeFi

En **Posiciones DeFi**, introduce el origen HTTPS y el ID de vinculación
entregados por el operador del servicio original. La vinculación usa tu clave
protegida actual y un descriptor propio de posiciones; no reutiliza el permiso
ni descriptor de saldo de notas nativas.

1. Conecta y autoriza **Mostrar posiciones con biometría** para revelar los
   targets de esa cartera.
2. Revisa vault, activo, red e identidad y autoriza **Leer posiciones con biometría**.
3. Solicita una nueva consulta al caducar; no se firman ni reenvían permisos
   automáticamente. Cancelar, editar o salir de primer plano revoca la revisión.

Son dos permisos específicos y frescos de 15 segundos. La pantalla presenta
cantidades exactas por activo, con disponibles, reservadas y bloqueadas
separadas; datos UNKNOWN, caducados o fallidos muestran **No disponible**.
La estimación del subyacente no es saldo gastable ni garantía de liquidez.
Esta vista no prepara ni transmite TOP_UP, GRAPH, EXIT o redenciones. Las
acciones de estas posiciones y shares requieren sus propias cuentas y notas
del dispositivo creadas antes de financiar; las posiciones Linux no se convierten
en autoridad de gasto móvil. La nota ERC20 fuente tiene una pestaña separada. La salida de notas nativas usa su bridge original
separado.

La custodia de estas posiciones permanece en el backend Linux original.
El servicio exige su mismo catálogo, sesión y cabeza; no adopta cuentas mediante
IDs o snapshots. Pasaron cuatro HOST de TLS/SDK/procedencia, dos de instalación
y cierre del servicio y TSC móvil. Meta y Aave aceptaron dos lecturas del SDK original por protocolo
después de mint y redención, conservando las mismas quince pruebas y sin nuevo
efecto por consultar. Cerraron READ antes de capturar cinco secciones originales
y reabrieron cada backend retenido en otro PID con la misma identidad/receipt y sin
envío nuevo. El catálogo conserva el cierre de nuevas admisiones.

El firmante secp256k1, digest Expo y certificado del caller son infraestructura
HOST explícita: no acreditan biometría ni teléfono. Recuperación de GRAPH, caída
abrupta y salida del padre siguen fuera de este recorrido aceptado.

## Nota ERC20 propia

En **Nota ERC20**, conecta el descriptor privado entregado por el operador del
[servicio local original](../platform/docs/DEVICE-ERC20-LOCAL.md). La raíz y la
clave de nota permanecen en la app. Fija el destinatario de retirada antes de
preparar el depósito y usa el mismo importe en unidades atómicas que preparó
el operador. Prueba, financiación y retirada requieren permisos separados.

Una operación retenida o una respuesta perdida se consulta sobre el mismo
trabajo; no se vuelve a financiar o retirar. UNKNOWN y datos no disponibles
no son cero. La retirada usa la nota fuente íntegra; esta pantalla no convierte
las posiciones custodiadas por Linux en notas del dispositivo. Backend, SDK,
Vault y pantalla están conectados. El recorrido Node/TLS `da603751` aceptó
D26/W39, dos envíos originales y respuestas perdidas reconciliadas en los mismos
trabajos, sin duplicados. Capturó cuatro secciones y reabrió el backend en otro
PID sólo para observar, sin nuevas pruebas o envíos; siete procesos cerrados y
fuentes intactas. Teléfono, pérdida abrupta y operación pública siguen pendientes.

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

Para construir el APK local con JavaScript y Hermes incluidos:

```sh
./dev npm --prefix apps/mobile run build:android:debug -- --standalone-local
```

El constructor original ensambla `app-release.apk` con la firma Android Debug
existente. Funciona sin Metro; conserva las dos arquitecturas, lint y el límite
de 3 GiB. Para esta variante el JVM principal usa heap 768 MiB y metaspace
384 MiB, SerialGC y dos procesadores activos, verificados en los argumentos
reales de Gradle. El APK actual `b52d49a6-9cd4-4230-9591-8d9afa7346e6`
comprobó 85 inputs iguales antes/después y 36 joins del bundle: **42.841.007 bytes**,
SHA-256 `bdc836079db34161a793fcc0f383351890e3b79ddfee421c74f5148b4be2dbaf`,
con JavaScript/Hermes incluidos y sin Metro. Incluye copia RootNote cifrada,
publicación de saldo original tras ejecución/W39 y espera del resultado
en los dos SDK de retirada admitida, conservando permisos y guards originales.
[APK actual archivado](../../.internal/dev/reports/mobile-android-standalone-local/attempt-b52d49a6-9cd4-4230-9591-8d9afa7346e6/app-release.apk) ·
[informe original](../../.internal/dev/reports/mobile-android-standalone-local/attempt-b52d49a6-9cd4-4230-9591-8d9afa7346e6/report.json).
La copia local está en `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
GRAPH `1159c12e…` recorrió 14 pruebas, respuesta perdida de W39, restores
software SOURCE/SHARE/PoP y READ de notas gastadas confirmadas sin nuevos
efectos financieros. Su RAW terminó rechazado por un contador del replay HTTP403;
`56f8212` lo corrige con una regresión focal, sin repetir financiación. No se
alcanzó la captura original de cuatro secciones ni la reapertura del backend.
Esta compilación no cambia el alcance Node/TLS de los recorridos descritos ni
acredita hardware; el uso físico queda para el final.

El corte histórico `d07f578f` comprobó 36 joins del bundle y 79 inputs,
incluidos el validador puro de posiciones y la nueva nota ERC20.

El APK histórico `d07f578f-c20d-47a0-a4ec-037686caea1f` está compilado y archivado
para su corte: **42 643 195 bytes**, SHA-256
`689b8eaadf695f921e598ff4a138f29668cc4250c0280132dcfb22a743345c5e`.
Sus 79 inputs fueron iguales antes/después y completó 36 joins, con Hermes y
firma Debug/V2 comprobados, sin Metro. Diez procesos propios ausentes y cero
señales en el informe original; archivo fuerte con informe y origen retenidos.
No acredita teléfono, SecureStore, biometría ni operación financiera física.
Incluye el protocolo/SDK corregido para ambos outputs bloqueados durante
una reorganización. El APK anterior `e19ad1eb` conserva su aceptación histórica.
[APK del corte](../../.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/app-release.apk) ·
[informe original](../../.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/report.json) ·
[origen](../../.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/origin.json).

Los builds anteriores son históricos y conservan sus informes originales.
`6adc78c0` tiene preservación limitada: el productor no retuvo la identidad
original de un target de señal; se verificó su PID numérico ausente sin inventar
cierre por identidad. `de2c963f`, `9935515d` y `1d3fdfd9` pertenecen a fuentes
previas. Ninguno acredita el conjunto móvil final; un rechazo original permanece
rechazado. Los archivos están en `.internal/dev/reports/mobile-android-standalone-local/`.

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

Estado privado empieza sin cantidades disponibles y sólo incorpora lecturas
frescas firmadas de fuentes conectadas. Cantidades guardadas y receipts de
financiación se muestran con su alcance; no prueban por sí solos que una nota
siga sin gastar. El Vault retiene la misma raíz, intención y trabajo antes de un
POST; una respuesta perdida se consulta, sin reenviar automáticamente.

Las rutas originales de notas y posiciones tienen backend/SDK/Vault conectados
y aceptaciones locales descritas arriba. El APK actualizado está compilado.
Faltan uso financiero en teléfono, migración y recuperación ante pérdida abrupta,
custodia multinota de
shares propia del dispositivo y completar las siete redes. El executor API/SQL
legado sigue cerrado; su disponibilidad no acredita el estado económico de las
nuevas rutas originales.

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
