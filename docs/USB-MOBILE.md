# Conectar la app por USB

Esta alternativa mantiene el descriptor y su TLS en `127.0.0.1`; sólo conecta
los puertos del teléfono con los del ordenador. No habilita HTTP ni cambia la
confianza del certificado. Requiere depuración USB autorizada. Desde WSL puedes
usar ADB de Windows: el teléfono permanece conectado a Windows y esta vía no
requiere USBIP ni una terminal de administrador.

## ADB de Windows desde WSL

Desde la raíz del repositorio, usa la copia local de las herramientas oficiales
de Google y su servidor dedicado en el puerto `5038`. Estos comandos no cambian
el servidor ADB habitual ni detienen otros servidores:

```sh
adb_windows_binary="$PWD/.local/tools/google-platform-tools-windows-h0dp97ha/platform-tools/adb.exe"
adb_windows() {
  env -u ADB_SERVER_SOCKET -u ADB_SERVER_PORT \
    -u ANDROID_ADB_SERVER_ADDRESS -u ANDROID_ADB_SERVER_PORT -u ANDROID_SERIAL \
    "$adb_windows_binary" -P 5038 "$@"
}
adb_windows start-server
adb_windows devices -l
```

Continúa sólo si aparece un único teléfono USB con estado `device`, ya
autorizado. Una lista vacía, `unauthorized`, `offline` o varios dispositivos
requieren resolver la conexión antes de preparar el operador. El selector
`-s` fija exactamente el teléfono elegido; sustituye el ejemplo por su serial:

```sh
usb_serial='SERIAL_DEL_TELEFONO'
adb_windows -s "$usb_serial" reverse --list
```

Activa **Depuración USB** en las opciones de desarrollador y acepta en el
teléfono la autorización de este ordenador. En Samsung, comprueba también que
**Bloqueador automático** no esté bloqueando la depuración USB.

Para Paged, crea únicamente la regla del puerto 9443:

```sh
adb_windows -s "$usb_serial" reverse --no-rebind tcp:9443 tcp:9443
```

Para DeFi, crea aparte únicamente la regla del puerto 9444:

```sh
adb_windows -s "$usb_serial" reverse --no-rebind tcp:9444 tcp:9444
```

`--no-rebind` rechaza reemplazar una regla existente. Anota sólo las reglas
que acabas de crear; no elimines reglas previas para forzar la conexión.
Si la regla ya existe, comprueba su destino con `reverse --list` antes de usarla.
ADB de Windows conecta con el `localhost` de Windows: el operador en WSL debe
ser accesible desde allí. En este entorno se comprobó la conexión TCP desde
Windows al puerto `9443` del operador que escuchaba en `127.0.0.1` de WSL.
Después, ejecuta el asistente correspondiente y elige `127.0.0.1`; el perfil
público conserva ese origen y el certificado válido para él.
[Comandos originales ADB](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/docs/user/adb.1.md).

Al terminar el uso USB, consulta `reverse --list` y retira únicamente las
reglas de esta sesión que todavía apunten al mismo puerto local:

```sh
adb_windows -s "$usb_serial" reverse --remove tcp:9443
adb_windows -s "$usb_serial" reverse --remove tcp:9444
```

Ejecuta cada retirada sólo si tú creaste esa regla. El operador sigue necesitando
conservar su proceso y estado económico; quitar el túnel USB no implementa una
reapertura del backend. El proyecto no crea ni retira estas reglas automáticamente.

## Alternativa con ADB de Linux

Úsala sólo cuando el ADB Linux ya vea el teléfono como `device`. En WSL,
enchufarlo a Windows no garantiza esa visibilidad; la asociación USB previa
queda fuera del arranque del proyecto. [USB en WSL](https://learn.microsoft.com/en-us/windows/wsl/connect-usb).

El SDK Linux de este entorno está en `/home/rafa_pradillo/Android/Sdk`. Consulta
su lista y utiliza el serial autorizado con ese mismo binario:

```sh
/home/rafa_pradillo/Android/Sdk/platform-tools/adb devices -l
/home/rafa_pradillo/Android/Sdk/platform-tools/adb -s "$usb_serial" reverse --no-rebind tcp:9443 tcp:9443
```

No mezcles las dos vías para crear o retirar la misma regla.

## Arranque e importación

Desde la raíz del repositorio, ejecuta `./dev platform paged-native-new` o
`./dev platform defi-new` en una terminal que puedas mantener abierta. Crea
primero la identidad en **Más → Conexiones** del teléfono, copia su clave
pública y pégala en el asistente; para este túnel selecciona `127.0.0.1`.
El operador imprime la ruta de su `paired-connection.json` público. Copia su
contenido completo al portapapeles del teléfono y pulsa **Importar conexión
del ordenador** en Operaciones o **Importar conexión DeFi del ordenador** en
DeFi, según el perfil. No importes `operator.json`, que contiene secretos.

[Guía del operador](../apps/platform/README.md#usar-el-ordenador-con-la-app-android).

## Comprobación física realizada

En el Samsung se comprobaron la instalación y apertura del APK, la identidad
del dispositivo, la transferencia del perfil público y la conexión Paged por
USB hasta el pairing con TLS. La importación alcanzó la apertura del Vault y
su solicitud de huella; después falló la lectura del almacenamiento AES.
El APK anterior `ccda916f` corrigió el formato de entrada AES de Android
y reduce las lecturas protegidas repetidas durante la conexión. Android
aceptó su instalación conservando los datos de la app; tras recuperar USB,
se verificó el hash instalado y se volvió a abrir la aplicación.
Con este APK, la conexión alcanzó el challenge de `READ_STATE`: el servidor
respondió HTTP 200 y sus bindings originales eran correctos, pero el SDK rechazó
`MOBILE_PAGED_CLOCK_FUTURE`. El reloj del proceso servidor llevaba un adelanto de
59,95 segundos frente al reloj absoluto; no se envió el permiso ni se financiaron
notas. En este entorno, la fuente de reloj `tsc` de Linux/WSL divergía del reloj
monotónico. El primer ajuste a `hyperv_clocksource_tsc_page` dio adelanto cero
en una muestra de 2,1 segundos, pero no bastó: el [guard del servidor original](../.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/clock-stable-original-guard-verification.json)
volvió a rechazar un challenge adelantado 3.227 ms. Ese operador cerró sin notas.

La prueba con `hyperv_clocksource_msr`, referencia directa de Hyper-V descrita
en la [documentación del kernel](https://www.kernel.org/doc/html/v6.3/virt/hyperv/clocks.html),
también dio una [muestra breve estable bajo CPU](../.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/wsl-msr-clocksource-cpu-stability.json):
2.500 ms absolutos y 2.500,36 ms monotónicos, adelanto máximo de 1 ms y final cero.
Sin embargo, el guard original volvió a rechazar un challenge adelantado unos
3,26 segundos. Los rechazos de unos 3,23 segundos con TSC page y 3,26 con MSR
muestran que esas mediciones cortas no bastaron como solución. Los ajustes del
kernel fueron temporales y reversibles, sin cambiar la hora manualmente ni el
arranque; después de reiniciar WSL o el equipo hay que volver a comprobarlos.

La corrección de software separa el epoch real de los mensajes de su caducidad
monotónica local, conservando los permisos de 15 segundos y el límite de adelanto
de 3 segundos. Las doce comprobaciones focales y TypeScript pasaron. El [APK anterior
`9af3816e`](../.local/mobile/artifacts/android-standalone-9af3816e-7672-4113-a695-34f34e8a1ac9/app-release.apk)
terminó su build en un minuto y un segundo con cachés y fuentes intactas durante
la compilación. Pesa 43.635.983 bytes; SHA256
`66bf76ea37e75fa40ead2f81b290df57a11043a8acb0b20d63b8ebb9e4c99284`.
Su [empaquetado](../.local/mobile/artifacts/android-standalone-9af3816e-7672-4113-a695-34f34e8a1ac9/native-transport-verification.json)
verifica Clock, Owner y Graph exactos. Corresponde a la generación
`14d838afb2bffd6cd5c026e90535afc065615442308e2a209ffb0ee52c37e085`.
Se instaló con el mismo firmante, preservando la identidad; el hash instalado
se verificó y la aplicación se abrió en el Samsung.

El nuevo operador superó el [challenge original por TLS con pin fijo](../.local/mobile/clock-wall-vs-elapsed-original-guard-verification.json),
con la hora emitida 4 ms detrás del host al recibirla. Después se confirmaron
en el Samsung la importación con huella y el READ firmado contra el operador
común local: la app firmó, envió, aceptó y mostró la lectura antes de indicar
que estaba conectada. La [evidencia privada de conexión](../.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/paired-signed-read-wall-clock.json)
acredita sólo lectura. En ese checkpoint todavía no se habían financiado notas
ni ejecutado D26 desde el teléfono; no acreditaba una aceptación financiera.
La conexión DeFi por USB todavía no tiene
comprobación física.

El [APK actual `f2678a40`](../.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/app-release.apk)
añade la continuación del ingreso preparado conservando la misma nota,
apertura, importe y trabajo. Tras READ original sin prueba registrada, puede
renovar sólo época y firma D26 y sus hashes. Guarda el pendiente antes del
challenge; un token privado de un uso comprueba SDK y registro después de la
firma, sin repetir accesos ROOT. Los selectores tampoco fuerzan refrescos
biométricos. La recuperación pasó cuatro comprobaciones focales/HOST en 19,44
segundos; TypeScript y límites pasan. El APK actual añade diagnóstico por fase
y código acotados, sin datos privados.

Su build terminó en unos 53 segundos, con fuentes iguales antes y después: 43.650.119
bytes, SHA256 `7243b9c175dd1a467f937123a9764a8ca2af5be66017f3d3cf263260eac9ec76`,
generación `0e41709b86803f3a6369a47d54da471edaa7bac0b9f56bf4b3727067cd446dbd`.
Se conservan informe, bundle, mapa y [verificación del empaquetado](../.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/native-transport-verification.json).
Está instalado en Samsung con su hash verificado y el mismo firmante; mantiene
identidad, namespace, pairing y operador. Se volvió a copiar el mismo perfil
público y se confirmó el ingreso desde el Samsung: [D26 original aceptada](../.internal/runtime/omnichain-product/evidence/paeg-proof-attempts/8a623959-4419-455c-bc51-dd622002fa7c.json),
FUND con una autorización nueva y lectura posterior con **600 unidades
disponibles**. Se conserva el [checkpoint físico](../.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/funded-physical-paged-f267-v1.json).
El READ anterior descrito arriba corresponde a `9af3816e`; el grafo de tres
redes, las retiradas y DeFi desde el teléfono siguen pendientes. Este ingreso
no atribuye al teléfono los trece comprobantes del recorrido histórico en Node.
