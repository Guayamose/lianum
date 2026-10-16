# Estado actual

Actualizado el 16 de octubre de 2026. La cartera pública y el recorrido privado
PAEG tienen despliegues y evidencias distintos. Las secciones posteriores
conservan sus fechas, generaciones y límites históricos.

## Punto 3 en curso: DeFi ya formaba parte de este cierre (16 de octubre)

- Está instalada en el motor la versión
  `e006a5c96fac3b0b3374dde5164baaee27b28fe78a16feefac8506f1cfc082e9`,
  generación de fuentes
  `64044e378fdd124f0c108745bc003cea0c13d85287045a2c914b948dd9bce3a0`.
  La instalación preservó todos los archivos privados y los mismos contratos
  y recursos ZK del paquete anterior. Evidencia en la VM:
  `/var/lib/lianum-maintenance/20261016-defi-publication/installation.json`.
- El permiso financiero vigente es el epoch 2: vence el 16 de octubre a las
  **07:00 UTC**; su captura preventiva es a las **06:30 UTC, 08:30 de Madrid**.
  Mantiene los límites y las comisiones reservadas; no reinicia el presupuesto.
  Esta ventana sustituye a la del registro histórico del 15 de octubre.
- La actualización de Uniswap conserva las dos identidades y sus cuentas
  Native3; añade su conexión a la identidad móvil existente. Su activación
  remota ya ha reabierto el estado capturado. El servicio marca `READY` con
  tres conexiones y dos identidades. La API ya publica su conexión móvil
  de Uniswap manteniendo la identidad y la conexión Native3 anterior.
  Los cinco intentos previos se detuvieron antes de enviar nuevas transacciones;
  el padre quedó capturado y no se hicieron ingresos ni pagos de usuarios.
- Los ocho contratos nuevos y las dos llamadas de registro ya están
  **finalizados en Sepolia**: 68 contratos en total y 13 filas de Source
  finalizadas, incluidas las tres anteriores. La activación se interrumpió
  después por consultas RPC fallidas al capturar el conjunto. El estado de
  activación autenticado de ambos supervisores quedó guardado; se recuperan
  esos mismos contratos y transacciones. No se inicia otro despliegue.
- La corrección `ae33eb03` limita a ocho las consultas del runtime y permite
  recuperar la activación de un proceso muerto desde los mismos registros
  cifrados. La herramienta administrativa `06163850` exige las 13 filas
  finalizadas y ausencia de pagos; exige operaciones idénticas, un único
  checkpoint de Source y el registro de pagos intacto antes de publicar. Pasan 18 comprobaciones
  dirigidas, incluidas interrupción real del proceso, permisos originales y
  concurrencia; el control de dependencias no añade ciclos de módulos ni
  ciclos entre paquetes. La comprobación nativa se repitió tras el ajuste final
  y sus tres casos pasan.
- La recuperación real terminó con ambos supervisores capturados y las mismas
  13 operaciones. El contador de Source aumentó de 88 a 89 porque la captura
  original hace un checkpoint; el contenido de todas las operaciones conserva
  exactamente su hash. Se corrigió la comprobación administrativa para permitir
  sólo ese incremento de uno, manteniendo idénticos todos los demás campos.
  Sus seis casos pasan, incluidos cambios indebidos en firmas, cantidad de
  operaciones, configuración y estado. Commit `5fd0c93e`.
- La versión corregida está instalada desde las 01:02:48 UTC. Su instalación
  comprobó que todos los archivos privados permanecieran idénticos después
  de publicar explícitamente la configuración del servicio; contratos y
  recursos ZK también permanecen idénticos. El arranque normal ya marca `READY`:
  tres conexiones, dos identidades y preparación pública de Uniswap. Una
  lectura por HTTPS comprueba Ethereum Sepolia, Bitcoin testnet y Solana devnet
  en ambas identidades, Uniswap en la móvil y el certificado público fijado.
  Los selectores de conexión ausentes o desconocidos se rechazan. No hubo
  ingresos, pagos, nuevas firmas de envíos ni nuevos contratos en la recuperación.
- Se corrigieron los archivos Solidity y módulos que faltaban en el paquete,
  los reintentos de consultas RPC interrumpidas y la consulta de un registro
  que contiene contratos de Uniswap. Los envíos firmados siguen teniendo un
  único intento. El paquete aislado compila los cinco contratos de los tres
  compiladores públicos DeFi sin red, claves ni pruebas privadas.
- La comprobación con contratos compilados pasa: conserva ambas cuentas,
  consulta la conexión Mixed desde `CAPTURED`, rechaza permisos de lectura
  copiados, reutilizados o empleados como autorización financiera y reabre el
  conjunto sin nuevos envíos. Es una cadena HOST explícita; no constituye una
  nueva aceptación financiera en redes públicas. También pasan 11 casos de
  transporte, 3 del supervisor, 8 del arranque y 2 del cierre de dependencias.
- Se confirmó `ETIMEDOUT` durante la lectura del código del padre. La consulta
  ahora limita su concurrencia a ocho y contrasta una respuesta alternativa
  únicamente contra la misma red, génesis y bloque canónico. Nueve casos
  dirigidos pasan, además de los nueve de estimación de gas y la comprobación
  compilada de tres CREATEs con recuperación de una respuesta perdida.
- **Aave y Morpho mantienen sus validaciones anteriores.** Su ejecución
  financiera y su ciclo completo de recuperación no están montados en este
  servicio público: incluir sus compiladores no equivale a integrarlos.
- La API publicó la conexión móvil a las **01:10:58 UTC**, manteniendo las
  mismas identidades y el perfil anterior. El directorio público tiene hash
  `eb98a9c76b9eeb09b95844e7ddf35c69a7d3cf9979d3e2746d9c4231d82ded69`.
  Evidencia en la VM de la API:
  `/var/lib/lianum-maintenance/20261016-defi-api/promotion.json`.
  La comprobación pública posterior también pasa; evidencia local en
  `.local/maintenance/20261016-defi-public-routing-final.json`. Fueron lecturas
  de instalación y metadatos, sin repetir pagos ni pruebas financieras.
- **El punto 3 permanece abierto.** Faltan los servicios remotos de Aave/Morpho
  con la app y la API y la consulta y recuperación del saldo de tokens cuando
  el servicio pasa a sólo lectura. La conexión remota de Uniswap está publicada
  y su reapertura real se ha comprobado. El APK de conexión remota está
  preparado; esta actualización no se ha instalado ni probado en Android.
  Los puntos 4 y 5, el agente, MoonPay y el diseño final siguen separados.

## Motor en Google Cloud (15 de octubre, despliegue y reapertura comprobados)

- VM `lianum-paeg-demo`, proyecto `lianum`, zona `europe-west1-b`:
  `n2-standard-4`, 4 vCPU y 16 GiB; un trabajo ZK pesado simultáneo.
- Versión instalada:
  `6dfe36a2fd0a6653265b027bee66e913cb2096d0366b66a4d1c8b3cb694063ff`.
  Generación de fuentes:
  `88d38b55778d56e6a7fca432fa0f4cc72a3ac9fce2d1c9f7d5929177a2741c51`.
- Las 57 transacciones de despliegue de Sepolia están incluidas con recibo
  correcto. Se reutilizaron las 56 anteriores. El último pool está en
  `0xee2f31019a4d6bc0027be1dc9aceabeccc3dd8bc`, transacción
  `0x907379cba7dbd3aa139c3c2df1b9f06ec2d2d300eafad3f8b56073b5c9653510`,
  bloque 11922764, 15 de octubre a las 20:21:48 UTC.
- Los 57 contratos base ya están finalizados. La conexión móvil requiere su
  propio pool: sus tres contratos adicionales también están finalizados con
  recibo correcto. Total de este despliegue: 60
  contratos. El pool móvil está en
  `0x176e5bfe1abbfc8e3f8f09a6b688904569855e77`, transacción
  `0x5c63ee6fd98c2c8b62f96cf82d61e23ef84523db0aef074a5e234be590c2eac6`,
  bloque 11922844, 15 de octubre a las 20:38:12 UTC.
- Se corrigió la estimación de gas limitada a 50 millones por el RPC principal.
  La consulta alternativa verifica red, génesis y el mismo bloque canónico;
  espera de forma acotada si ese bloque aún no está disponible. El contrato
  consumió 51.396.288 de gas. Los límites de firma y presupuesto se conservan.
- El permiso de despliegue se renovó explícitamente una vez, manteniendo el
  mismo máximo total de 0,03 ETH de prueba y las comisiones ya reservadas.
  Las actualizaciones conservaron las claves y el estado privado; contratos,
  verificadores, recursos ZK y herramientas compiladas son idénticos.
- Las dos conexiones están abiertas y su epoch financiero está registrado.
  El transporte privado desde la API está comprobado: TLS 1.3, nombre y
  certificado verificados, y rechazo de una consulta sin autorización (403).
- **Punto 2 cerrado:** parada controlada con estado Original `CAPTURED` y
  reapertura real con `reopenedOriginalState: true`, dos conexiones y servicio
  activo. Se comprobaron las mismas claves protegidas, el mismo epoch firmado,
  los mismos descriptores y los mismos envíos. El nonce Ethereum permanece
  en 60. El servicio queda habilitado para iniciar con la VM.
- La comprobación de reapertura detectó bibliotecas omitidas en el paquete.
  El paquete ahora incluye explícitamente los módulos de consulta y recuperación;
  su cierre de dependencias y sus imports se comprobaron antes de instalarlo.
  La reparación conservó todos los módulos de ejecución existentes, contratos,
  recursos ZK y estado privado. El refresco de la caché de estado financiero
  conserva el mismo epoch y sus términos; no reinicia el presupuesto.
- El permiso firmado actual vence el 16 de octubre a las 02:00 UTC. El servicio
  conserva su captura preventiva 30 minutos antes: desde las 01:30 UTC
  (03:30 de Madrid) queda en consulta, sin extender permisos automáticamente.
  No se ha requerido el móvil ni repetido pagos de aceptación.
- Evidencias de administración: `/var/lib/lianum-maintenance/20261015-point2/point2-closure.json`
  en el motor y `engine-private-transport.json` en la VM de la API. Las pruebas
  de este bloque son dirigidas; no se ha repetido la batería completa del repositorio.
- Las rutas privadas ya están publicadas a través de la API. El motor mantiene
  su mismo proceso y despliegue; la API y la app tienen cambios propios, descritos
  a continuación.

## API pública conectada al motor y acceso móvil (15 de octubre)

- La API pública instala la versión
  `bef33422d6e51d5bef2afbdbf3ce763411530d6d8a75efbce8b8bf32825a8756`.
  Caddy envía `/v1/mobile/paged-owner/*` al motor por TLS privado verificado,
  sin reintentar escrituras. Exige el identificador de conexión y conserva
  los plazos de las operaciones ZK. Las rutas nativas y de euros conservan
  su servicio; MoonPay continúa desactivado.
- Comprobación pública con el certificado fijado de las dos conexiones reales:
  cada una devuelve su mismo descriptor y preparación nativa; los identificadores
  desconocidos y las peticiones sin identificador se rechazan. `/health` sigue
  respondiendo `ready: true`. No se han enviado depósitos ni pagos nuevos.
- `POST /v1/wallet/connections`, autenticado con el reto de un solo uso y la
  firma de la identidad, entrega únicamente la conexión asignada a esa identidad.
  La API guarda dos perfiles públicos, sin claves ni autoridad para gastar.
  Una identidad no asignada recibe una lista vacía. La consulta pública con una
  identidad nueva, el rechazo de replay y el rechazo sin firma están comprobados.
- La app incorpora «Conectar con Lianum» en Operaciones. Solicita la conexión
  desde la sesión abierta y utiliza después el SDK y el transporte TLS fijado
  existentes. No requiere copiar el perfil del ordenador ni añade huellas a las
  consultas. Conserva las conexiones anteriores y sus custodias; una identidad
  sin cuenta asignada recibe un mensaje explícito. No crea cuentas privadas nuevas.
- APK autónomo generado y firmado para desarrollo: 48.900.551 bytes, SHA256
  `699929867d6218bf4baef29c0c60bab8a1c3e7fdd0f63924195d04e252ff1903`.
  Incluye el nuevo acceso a la nube y no requiere Metro ni el ordenador para
  conectarse. Está retenido en
  `.local/mobile/artifacts/android-cloud-5d1f84ca-6730-48c3-9bb7-a08b12f339bd/app-release.apk`.
  No está instalado ni comprobado en Android físico en este bloque.
- Las comprobaciones dirigidas de autenticación, aislamiento, cliente móvil,
  selección de conexión y conservación de envíos pendientes pasan: 11 tests.
  TypeScript y la comprobación de límites entre paquetes pasan; no se ha repetido
  la batería financiera ni la prueba física del teléfono.
- **Límite explícito:** el proceso remoto actual abre la composición nativa de
  Ethereum, Bitcoin y Solana. No abre la composición Uniswap ni los servicios de
  Aave/Morpho. Publicar rutas y conectar la app no activa esas composiciones.
  Sus aceptaciones anteriores conservan su alcance; falta su activación remota.
- Evidencias locales: `.local/maintenance/20261015-point3-routing.json` y
  `20261015-point3-discovery.json`. Instalación remota de la API:
  `/var/lib/lianum-maintenance/20261015-point3-final/api-installation.json`.
  La configuración de Caddy añade después el rechazo de conexión ausente;
  su SHA256 es `d539b0653278155326aa7529f4d22462dfe2019d5dd49c8358cafae83d756ab3`.

## Cierre del motor local (15 de octubre)

Los tres bloques pendientes del motor están integrados y comprobados en local.
No incluyen Google Cloud, las tres redes públicas ni el teléfono.

- **Ingresos sucesivos:** una Source interrumpida en CREATING se recupera con
  el mismo hijo tras varios ingresos (Source2→3), sin reenvíos ni nuevas
  claves. Prueba HOST compilada con caída real y caducidad.
- **Cambio de pool:** el sucesor desplegado se retiene en la base de
  activación antes de crear la Source. Tras una caída, el producto recupera el
  mismo hijo en el pool sucesor antes de escuchar, sin firmar ni enviar nada
  nuevo. Prueba HOST compilada nueva; la ocupación del pool padre es un valor
  HOST declarado, no un pool real con 253 depósitos.
- **Salidas de un grafo terminal tras sustituir la Source:** sustituir una
  Source con grafo terminal ya no registra su nota de entrada, gastada, como
  nota independiente. Aceptación en fork local de Sepolia: raíz real
  RECOVERED, Source2 y retirada de `change` y `recovery` con W39 real; cero
  difusiones públicas.
- **Batería mantenida:** 845 etapas. La ejecución completa dio 788 PASS; los
  19 fallos eran pruebas desalineadas con el código actual (mocks sin las
  funciones nuevas y códigos de rechazo renombrados) y pasan tras alinearlas.
  Las 37 etapas que el plazo global dejó sin ejecutar y las 2 repetidas pasan,
  salvo `sepolia-public-historical-withdrawal-broker-fork-genuine-v10`, que es
  intermitente (falló 2 de 3 ejecuciones).
- **Riesgo conocido:** el pool exige que el depósito lleve exactamente el
  epoch actual de 600 s (`STALE_EPOCH`). Si la ventana cambia entre la prueba y
  el envío, la simulación previa lo rechaza antes de enviar, sin pérdida de
  fondos, y hay que repetir el depósito. Es la causa más probable de la
  intermitencia anterior: el rechazo ocurrió en esa simulación del segundo
  depósito, pero no se capturó su motivo exacto.

## Cartera pública y API desplegada

- API `https://api.lianum.oryontechnology.com` desplegada en el proyecto Google
  Cloud `lianum`, VM `lianum-wallet-api`, zona `europe-west1-b`. DNS, HTTPS y los
  servicios `lianum-public-wallet` y Caddy comprobados.
- El servicio publicado contiene `public-wallet`, `native-wallet` y `fiat`.
  Consulta Ethereum, Bitcoin y Solana mainnet, prepara envíos, transmite bytes
  firmados en el móvil y conserva su seguimiento. No guarda semillas privadas.
- APK `android-standalone-4e7fd50f-cbd2-4f97-b7d1-ff5a4584eef9` instalada
  conservando los datos; SHA256 verificado en el dispositivo:
  `0d3930781e6cd685b4d9870db72fbb185c3bbd244ecd7025294071493733fea4`.
  Direcciones, QR y consulta de los tres saldos comprobados en Samsung.
  Esta comprobación no realizó envíos ni leyó las palabras de recuperación.
- Generación de fuentes adoptada:
  `a9020a5990483d5f9597a239acb8485f8c7cdb2bef0088a50d6958b7cfff4fe9`.
  Artefacto del servidor:
  `36c03efaca07a6a2822cdb1bf183882dec952e872f2b3a740ee90b9a021c72f2`.
- MoonPay sigue desactivado: faltan cuenta de partner, aprobación y credenciales.
  No hay compra, venta ni envío mainnet completos verificados desde el móvil.
- El motor privado tiene un despliegue separado en Google Cloud, descrito
  arriba. No forma parte de este servicio público de cartera. Publicar sus
  rutas para la app sigue pendiente.
- La instalación inicial limita identidades residentes y persistidas a 16 y 64.
  Usa proveedores RPC públicos; una consulta de Solana falló antes de las
  siguientes consultas correctas. Esto no acredita disponibilidad de producción.

La evidencia de instalación y consultas se conserva fuera de Git en
`.local/work-blocks/native-public-wallet-20261013/` y
`.local/mobile/public-wallet-device-review-20261013/`. Los artefactos, custodias
y claves locales no se incluyen en el repositorio. Las instrucciones históricas
que limitaban Google Cloud a preparación local no describen este nuevo servicio.

## Histórico del 12 de octubre: Android privado, recorrido completo pendiente

La APK `52b8c299-976a-414a-a353-0916538a757e`, de la generación
`a2c90a1dfdd650c8c350a69a391f21dfc94c824df33b89189aa87d2b5de0af08`,
está instalada y verificada en el Samsung. El ingreso de 600 y la preparación
de presupuesto 400 llegaron a reabrirse mediante la captura original. La
preparación de Uniswap llegó a su revisión; después de la autorización humana
falló la validación del transcript privado: el adaptador enviaba `ArrayBuffer`
a una función Android que exige `TypedArray`. No se alcanzó el envío D27 ni
se ejecutó el intercambio. **Pagos físicos completados: cero.**

El cierre posterior de esa demo falló en la captura de Solana. El supervisor
quedó `ACTIVE`, generación 1, sin snapshot, y todos los procesos propios están
cerrados. Ese entorno no admite una reapertura oficial; se conserva como
evidencia, sin reconstruir autoridad a partir de sus registros. Se están
corrigiendo el adaptador Android y la captura posterior a una reapertura antes
de preparar otra demo. Las aceptaciones HOST de abajo siguen siendo históricas;
no acreditan este recorrido físico ni estas correcciones pendientes.

## Bloque actual: recuperación mixta y cartera conjunta

Implementado en la generación
`7b7a8a33900f3ada15f980164db7cd9c16d738ee71b25aced27066761a2eadb4`:

- **Recuperación Mixed:** captura y reapertura ordenadas del mismo backend,
  incluidas las cinco cadenas locales, contratos Uniswap, recepción D27,
  custodia privada y proveedor. `paged-mixed-reopen` conserva el entorno original;
  exige una captura completa autenticada. No migra entornos antiguos sin esa retención.
- **Respuesta perdida:** el SDK identifica una respuesta de operación que no
  llegó, consulta el estado original y vuelve a pedir el siguiente paso, con
  un máximo de dos observaciones. El proveedor concilia el mismo envío registrado.
- **Cartera conjunta:** consulta cifrada de la nota fuente, cambio, recuperación,
  resultados y reserva, ligada al mismo bloque y a las aperturas de la custodia
  móvil. La app agrupa las conexiones y custodias registradas por activo y unidad,
  evita duplicados y separa disponible, reservado y pendiente. El token recibido
  en Uniswap conserva su cuenta y unidad propias.
- **Navegación:** cerrar una pantalla conserva la consulta verificada durante
  su vigencia original de quince segundos; una escritura de custodia o su
  caducidad la invalida. La actualización automática vuelve a consultar las
  salidas. Una cobertura parcial se presenta como parcial.

**Aceptación económica conjunta en HOST: completada.** El
[resultado original](.local/device-paged-mixed-v3/attempt-99a02302-7f88-4004-8e7e-d85f6c478143/result.json)
tiene SHA256 `a78543e3cb1cf6357c57d3313dffa7fc10c4489e76982b1370e11a5c10447999`.
Completó veinte pruebas Paged y una D27 únicas, Uniswap y los tres pagos
nativos, FULFILLED, cambio de 200 y cuatro liquidaciones de 100 al proveedor.
Hubo cuatro reaperturas completas: antes del ingreso, después de Uniswap,
después de Ethereum y después de las liquidaciones. Los cinco PIDs backend
fueron distintos, sin repetir pruebas ni envíos durante las reaperturas.
Una respuesta perdida tras el envío de Ethereum se recuperó mediante el SDK
original y observación del mismo envío.

La consulta cifrada y el actor de cartera verificaron **600 → 400 → 0 → 0**
unidades demo, con el último cero después de reabrir el backend. El token
Uniswap conservó **100 unidades atómicas** separadas. Las dos rutas registradas
quedaron completas; el actor conservó DATA verificada tras cerrar SDK, Vault y
transportes dentro de los quince segundos originales, sin conservar permisos.
El ledger final tiene saldo retenido y respaldado cero, beneficiario 400 y
los cuatro nullifiers de liquidación gastados. Backend y HOST cerraron sin
errores, señales ni recursos pendientes.

Las pruebas Paged tardaron entre 27.357 y 70.879 ms, con 1.053.070 ms acumulados.
El rendimiento de la visión sigue pendiente. Esta aceptación usa contratos,
ledgers, pruebas y custodias software originales en cadenas locales con
operador común; no acredita teléfono ni redes públicas.

**APK nuevo: compilado, conservado y verificado.** El
[APK actual](.local/mobile/artifacts/android-standalone-b01b3ca8-31c3-45be-91bf-a568f84806fc/app-release.apk)
y su
[verificación](.local/mobile/artifacts/android-standalone-b01b3ca8-31c3-45be-91bf-a568f84806fc/verification.json)
corresponden a este corte. Tiene 44.049.439 bytes y SHA256
`1166963411b8107c1f0c3e9f87c25688f42d508f6fdabe99ea32b74a2f6c2d18`.
La comprobación independiente verificó los 1.553 archivos de la captura fija
intactos, 203 inputs públicos iguales antes/después y 61 módulos contra su mapa
de fuentes. Sesenta módulos pertenecen al contrato financiero fijo; el transporte
Android se verifica como input del APK, sin atribuirle aceptación financiera HOST.
Incluye Hermes 98, ARM64/x86_64 y firma Android Debug original; no necesita Metro.
Los procesos de compilación cerraron y los artefactos se conservan en modo 0400.
Se instaló posteriormente conservando datos e identidad, y su hash instalado
coincide con el artefacto retenido.

Las comprobaciones focales de custodia, protocolo, proveedor, recuperación, CLI
y runner pasan, al igual que TypeScript, análisis estático y límites de módulos.
**Android: comprobación corta completada.** El
[resultado físico](.local/mobile/artifacts/android-standalone-b01b3ca8-31c3-45be-91bf-a568f84806fc/physical-short-check.json)
acredita sesión abierta, importación, TLS con pin, consulta de propietario
firmada y aceptada por el SDK, navegación entre Cartera/Operaciones/DeFi/Ajustes
y reconexión al volver a Operaciones dentro de la misma sesión. La comprobación
duró aproximadamente once minutos. No movió fondos ni ejecutó una operación
financiera completa; cartera con fondos y los cuatro pagos físicos siguen pendientes.
No acredita aislamiento de hardware.

La conexión antigua 9444 estaba caducada y su servidor apagado; ese entorno
nació sin captura de supervisor y no admite reapertura actual. Sus datos se
conservan intactos. El entorno Mixed nuevo de producto en 9445/9446 usa la misma
identidad del Samsung, sin financiación automática. El servidor y sus túneles
USB quedan disponibles; la página temporal de copia y su túnel fueron retirados.

El intento inicial `attempt-e5449e08-6f12-4efa-9c72-e06a95ccb0cf` se conserva
rechazado: detectó un hash de descriptor sin normalizar y una captura de fixture
que exigía los siete contratos de otro perfil. Su resultado no acredita cierre
correcto. La corrección usa el codec original del descriptor y una captura
exclusiva de los cinco contratos Uniswap; el resultado aceptado anterior supera
ambos fallos. Los guardas del fixture histórico de siete contratos permanecen vigentes.

| Objetivo original | Lo que añade este bloque | Pendiente de la visión |
| --- | --- | --- |
| 1. Wallet para siete redes | Cartera de notas Paged, token recibido y posiciones registradas; conexión y navegación del APK comprobadas en Samsung | Cuatro redes aplazadas y recorrido financiero completo del nuevo APK en Android |
| 2. Privacidad por defecto | Consulta de salidas cifrada y ligada a la custodia original | Metadatos, correlación y privacidad frente al operador común |
| 3. PAEG genérico | Continuación del mismo recorrido mixto mediante el SDK | Generalidad fuera de los perfiles acotados, rendimiento y ejecución distribuida |
| 4. Liquidación y recuperación | Reapertura Mixed y conciliación automática de respuesta perdida | Caída abrupta, ventanas ambiguas y compensación de entregas parciales |
| 5. DeFi privado | Conservación de Uniswap, D27 y token privado al reabrir | Aave/Morpho en Paged y reutilizar el token privado en otro nodo |
| 6. Estado privado global | Vista conjunta de fondos, reservas y posiciones registradas, con cobertura explícita | Custodias sin registrar y conservación coordinada de backend y móvil |
| 7. Modelos heterogéneos | Conservación conjunta de los modelos EVM, UTXO y SVM locales | Redes públicas, operadores independientes y las redes aplazadas |

La reapertura es un cierre controlado, no una recuperación de cualquier caída.
La cartera Paged enumera notas del ledger EVM; Bitcoin y Solana son destinos de
pagos en este recorrido, y el token de Uniswap conserva su custodia independiente.
La cartera no calcula equivalencias entre monedas ni un total fiat. La
liquidación al proveedor sigue autorizada por el propietario; precios,
beneficio neto y solvers independientes siguen pendientes. El agente externo
lo implementa Rafa mediante las interfaces autorizadas del SDK.

## Corte anterior aceptado: ejecución, economía y recuperación del 12 de octubre

Esta sección conserva las aceptaciones y los pendientes de ese corte. El
estado vigente de la implementación está en el bloque anterior.

Implementado, con aceptación económica conjunta:

- **Motor y tres redes:** cierre y reapertura del backend en otro proceso,
  conservación de las cuatro cadenas originales y continuación del mismo grafo.
  Solana conserva sus snapshots internos y espera su bloque finalizado original.
- **DeFi en PAEG:** una operación de cuatro pasos combina Uniswap con Ethereum,
  Bitcoin y Solana. `./dev platform paged-mixed-new` prepara un entorno separado,
  TLS y conexión pública para la app. El ERC20 recibido mantiene su custodia
  privada ExternalFlat; aún no alimenta otro paso privado del grafo. El resultado
  abre esa misma custodia y concilia su recepción pendiente mediante el SDK
  original, sin repetir el intercambio.
- **Economía visible y liquidación:** consulta cifrada de resultados y comisiones
  originales después de FULFILLED, revisión en la app y una aprobación acotada
  para los cuatro pagos al proveedor. Conserva importes, aperturas, destinatario,
  pruebas y nullifiers originales. Las comisiones ETH/BTC/SOL se presentan por
  activo; las unidades demo del presupuesto conservan su unidad propia.
- **Cartera y recuperación móvil:** lectura de las conexiones registradas,
  selección conservada y separación entre saldo fresco e historial. La copia
  conjunta cifrada restaura identidad y custodias registradas incluso desde
  una entrada bloqueada, con contraseña, biometría y revisión exacta del estado.
  Los journals del backend requieren su propia conservación.

El SDK ejecuta este recorrido con la custodia y consentimiento originales.
Rafa puede integrar su consumidor externo mediante esas interfaces; el agente
queda fuera de nuestro alcance según la visión acordada.

**Tres redes con reinicio completo: aceptado.** El
[resultado original](.local/device-paged-cold-v3/attempt-7dd13e1b-074c-48d6-ba1e-3a27f8143fa6/result.json)
tiene SHA256 `fe0b652ca613827f6bf0d127c3d801036a4ea477404e78d85f47bcf713de174e`.
Se verificaron trece pruebas únicas, los tres pagos nativos, FULFILLED y la
retirada W39 de 300 unidades de cambio. Hubo tres reaperturas: antes del ingreso,
después de Ethereum y después de retirar el cambio. Los cuatro procesos backend
fueron distintos; cada reapertura conservó descriptor, configuración y ledgers,
sin repetir pruebas ni envíos. El estado final conservó el nullifier gastado y
el saldo del destinatario. Backend y HOST cerraron sin errores ni señales.

**Uniswap y tres redes con liquidación: aceptado.** El
[resultado original](.local/device-paged-mixed-v3/attempt-5c1133f9-bedb-4c74-8a8d-8a3d88bf396f/result.json)
tiene SHA256 `c02e5d4d50a9f8fe22c1a89f0608ceb435a2ff0954a8f386a7d65576b542ac70`.
Se verificaron veinte pruebas Paged y una D27, todas únicas. Los cuatro pasos
terminaron en FULFILLED y el token recibido en Uniswap se confirmó usando el
mismo observador del SDK que utiliza la app. Del depósito de 600 unidades demo
se devolvieron 200 y se pagaron cuatro salidas de 100 al proveedor, con una sola
aprobación acotada a esa liquidación. El saldo respaldado del depósito pasó de
400 a cero; el destinatario recibió 400 y los cuatro nullifiers quedaron gastados.
Las comisiones se observaron en las cuatro acciones, agrupadas por cadena,
activo y unidad. No se aplicaron precios entre activos ni se calculó beneficio
neto. Operador y HOST cerraron sin errores, señales ni sockets pendientes.

Las veinte pruebas Paged de esta aceptación tardaron entre 27 y 67 segundos
por relación, con 999.556 ms de generación acumulada. El objetivo de rendimiento
de la visión sigue pendiente; esta aceptación acredita ejecución y conservación,
no baja latencia.

Ambas aceptaciones usan custodias software originales, pruebas y contratos
reales en cadenas locales, con operador común. No incluyen teléfono, redes
públicas ni operadores independientes.

La aceptación de tres redes corresponde a la generación
`e9181cf2a5e0c1841fb77fc5f397713ca8e04d393d5d77f60f734d886eba75d9`.
El recorrido mixto aceptado y el APK compilado tienen la generación
`8eab00d36eaa9602a20dfd572d0d95228817df1061a0fad4145a346f9c48bfc2`:
añade únicamente la selección del tiempo autorizado en el despacho Uniswap y
conserva el recorrido nativo y la recuperación aceptados anteriormente.
Análisis estático y límites de módulos pasan, con cero ciclos nuevos.

**APK de este bloque: compilado y conservado.** El
[APK actual](.local/mobile/artifacts/android-standalone-c757fac4-91c7-4125-97be-a2668f1284f5/app-release.apk)
y su [verificación](.local/mobile/artifacts/android-standalone-c757fac4-91c7-4125-97be-a2668f1284f5/verification.json)
corresponden a la generación mixta aceptada. Tiene 44.014.327 bytes y SHA256
`a7b22a4b221854dd0c2f395d0c471081a2d805f375b3eec3c6a2a384d0e2085b`.
Se verificaron 58 módulos empaquetados contra sus fuentes actuales, los 197
archivos públicos de entrada antes/después de compilar y las 1.541 entradas de
la captura fija usada por la aceptación mixta. Incluye Hermes, ARM64/x86_64 y
firma Android Debug; no necesita Metro. Los procesos de compilación cerraron.
Se conserva el informe completo y el mapa de fuentes. No se ha instalado ni
comprobado esta versión en el teléfono; biometría, TLS y recuperación físicos
requieren esa comprobación, y el APK no es una distribución de producción.

La ejecución `attempt-55a26bc5-d8c6-4bbb-bb8a-802bb0425e93` alcanzó las trece
pruebas, los tres pagos, FULFILLED y la devolución de 300 unidades de cambio.
Pasaron las dos reaperturas ejercidas en esa revisión. Su cierre final fue
rechazado por el guard de formato/tamaño de la exportación EVM del hub:
`originalResourcesClosed:false`. Se conserva ese resultado parcial; no se
presenta como aceptación completa. Ese fallo queda superado por el resultado
aceptado anterior: el codec exclusivo del hub Paged valida formato, tamaño,
genesis, bloque y cuentas tanto al capturar como al cargar el estado. Los
límites históricos de los otros perfiles permanecen vigentes.

| Objetivo original | Avance de este bloque | Pendiente de la visión |
| --- | --- | --- |
| 1. Wallet para siete redes | Conexiones y custodias de las tres redes elegidas; copia conjunta y cartera por conexión | Cuatro redes aplazadas, saldo global completo y comprobación física del nuevo APK |
| 2. Privacidad por defecto | Datos económicos cifrados y autorizaciones ligadas a la custodia original | Metadatos, correlaciones de entregas y privacidad frente al operador común |
| 3. PAEG genérico | Uniswap y tres modelos nativos en el mismo recorrido y runner del SDK | Más composiciones, generalidad más allá de las cotas del perfil y ejecución distribuida |
| 4. Liquidación y recuperación | Pagos al proveedor tras cumplimiento global, cambio previo y reinicio controlado de tres redes | Caída abrupta, continuación ambigua, compensación de entregas parciales, precios y solvers independientes |
| 5. DeFi privado | Nodo Uniswap, custodia propia del token recibido y arranque Mixed | Aave/Morpho dentro de Paged, encadenar el token privado recibido y reapertura Mixed |
| 6. Estado privado global | Revisión económica del mismo bloque, nullifiers y respaldo; copia de custodias registradas | Vista global fresca de activos/posiciones y recuperación conjunta con el estado del backend |
| 7. Modelos heterogéneos | Firmas, costes y finalidad originales de EVM, UTXO y SVM en entorno local | Redes públicas, operadores independientes, reorgs/ambigüedad y Tron con las redes aplazadas |

La recuperación aquí es una captura ordenada. El perfil Mixed rechaza su
captura; no tiene reapertura económica completa. El ledger condicional tampoco
revierte un pago ya finalizado en otra cadena. La remuneración del proveedor
es una liquidación autorizada por el OWNER; cotización, beneficio neto y cobro
autónomo de solvers independientes quedan pendientes.

## Corte anterior aceptado: continuidad, cartera y UX

Esta sección conserva la evidencia del corte anterior. Las aceptaciones y
pendientes vigentes están en el bloque del 12 de octubre al comienzo del archivo.

Los cuatro frentes están integrados y el recorrido conjunto de tres redes con
reapertura está aceptado en el ordenador: nota de 600 unidades demo, presupuesto
300, tres pagos, trece pruebas originales verificadas por sus contratos, cierre
FULFILLED y retirada W39 de 300 unidades de cambio. Después de completar Ethereum
se recargó la credencial original y se reemplazó el OWNER conservando progreso,
autoridad y runtimes; no se repitieron pruebas ni envíos durante la reapertura.

El [resultado conservado](.local/device-paged-continuity-v3/attempt-b25135fc-ee45-4b22-821d-1131de941964/result.json)
tiene SHA256 `2d3abd4586b6968dbcb314bc4eecf4aedb4c3b11368bd315404c34ce8b82a732`.
Corresponde a la generación de fuentes
`f9e5a75cbbc78a271a4518dfebbd039418d47dcfc421265db3e8767e38f6d3bc`;
el supervisor, los cuatro runtimes y el HOST cerraron sin errores. Es un perfil
local sintético de operador común y custodia software, sin teléfono ni redes
públicas. Las campañas históricas de las secciones siguientes conservan su corte.

| Cambio respecto al corte anterior | Objetivos originales | Alcance implementado |
| --- | --- | --- |
| Progreso privado del motor guardado con cifrado y revisión exacta | 3, 4, 6 | Reemplaza el OWNER bajo el mismo supervisor, autoridad y runtimes vivos; exige OBSERVE fresco antes de continuar. Conserva una prueba PROVED reconocida. |
| Credencial original del proveedor guardada y recargable | 1, 2, 7 | Misma identidad, registro, claves y preparaciones de Ethereum, Bitcoin y Solana. La recarga no firma ni envía otra transacción. |
| Historial incremental y actividad explícita en Operaciones | 1, 2, 3 | Reutiliza la proyección privada sólo mientras POINTER/RECORD coincidan; distingue trabajo, espera y pausa. |
| Autorización explícita del grafo durante treinta minutos | 1, 2 | Conserva permisos de quince segundos. Segundo plano, cancelación o vencimiento revocan las claves; una autenticación sensible satisfactoria renueva la entrada. |
| Conexiones públicas durables y navegación a la custodia elegida | 1, 5, 6 | Cartera abre la cuenta y ruta exactas. Las notas del dispositivo y las posiciones retenidas por el servicio conservan su custodia y unidades. |
| Posiciones DeFi con transporte TLS fijado | 2, 5, 6 | Tres rutas originales de consulta, drenaje de apertura/cierre y datos inciertos UNKNOWN. Las estimaciones de subyacente no se convierten en saldo gastable. |

Las comprobaciones focales, TypeScript, límites de módulos y análisis estático
pasan. La compilación Android conserva las fuentes antes/después y verifica
49 uniones del bundle, Hermes sin Metro, ARM64/x86_64 y firma Android Debug.
El [APK de ese corte](.local/mobile/artifacts/android-standalone-7afdf728-1ad0-49ee-b5c3-8cca264dd703/app-release.apk)
y su [verificación](.local/mobile/artifacts/android-standalone-7afdf728-1ad0-49ee-b5c3-8cca264dd703/verification.json)
corresponden a esa misma generación: 43.828.407 bytes y SHA256
`f9e2c6354752fee6b936e19918bf14ba79557b3e02e02967624387ba514b49a2`.
No se ha instalado ni comprobado en el teléfono.

La primera ejecución de este bloque fue rechazada antes del primer envío nativo,
tras tres pruebas y FOLD aceptado. El guard de tiempo podía rechazar un permiso
ya registrado durante un retroceso del reloj de WSL. Clock/Owner/Graph conservan
ahora el deadline monotónico original de ese mismo permiso; una clave nueva
futura, otra expiración y un permiso ya vencido siguen rechazándose. Doce focales
de reloj y firmas pasan. Las pruebas financieras tardan aproximadamente entre
30 y 80 segundos por relación en este entorno; este bloque no cierra el objetivo
de rendimiento de la visión.

La continuidad requiere el supervisor y los cuatro runtimes originales vivos.
Una caída entre guardar un checkpoint y reconocer su respuesta, un lock antiguo
o una revisión diferente se rechazan; no se adopta automáticamente la última
copia. No se ha cerrado el reinicio total de la plataforma. DeFi sigue en su
recorrido ExternalFlat y no se ha añadido como nodo al mismo grafo Paged.

## Sesión y experiencia móvil

La app ahora se abre con una lectura biométrica de la identidad. Durante la
sesión, consultar saldos, navegar y preparar pagos reutiliza las claves en
memoria sin repetir esa lectura. Inactividad de quince minutos, treinta minutos
de sesión total, bloqueo explícito o segundo plano revocan la sesión. Una huella
sensible adicional autoriza el ingreso concreto, el grafo revisado completo o
la retirada concreta; los permisos originales de quince segundos siguen iguales.

Las raíces originales permanecen en su SecureStore autenticado. La primera
apertura de una raíz existente requiere una huella de migración adicional para
crear un sobre AES-GCM ligado a la misma identidad y namespace. Después se abre
ese sobre con la identidad de sesión. No se guardan claves en claro sin biometría.

La interfaz principal usa tarjetas, navegación inferior y revisiones con importe,
red y destinatario antes de autorizar. Conexiones y detalles técnicos se pliegan.
La conexión pública de Operaciones se conserva; sus consultas automáticas no
mueven fondos. DeFi conserva la selección al cambiar de sección y cierra su
transporte antes de abrir otra conexión.

La prueba focal de sesión usa Vault/SDK reales con puertos de almacenamiento y
biometría de HOST: comprueba una lectura de identidad por entrada, reutilización
de raíces, aprobaciones acotadas y rechazo después del bloqueo. No acredita aún
la nueva UX física ni los tres pagos en el Samsung. El teléfono conserva el
ingreso confirmado de 600 unidades y la preparación original de tres pagos;
no se han ejecutado esos pagos durante el cambio de interfaz.

## APK de sesión e interfaz instalado

El [APK de sesión e interfaz](.local/mobile/artifacts/android-standalone-5b61f259-ef9a-4ea0-8c27-3d79e65b1c12/app-release.apk) está instalado en el
Samsung conservando datos: 43.779.779 bytes, SHA256
`9970a7af0fe0666c55b95b2b855e352b1d1fd98d4f7bce995b10aeb63a1385e9`.
Su generación es `bb71fdb0a09c7768c98b60706f38bacbef9c8a32b87f677fc7105a92f399db40`.
El [build](.local/mobile/artifacts/android-standalone-5b61f259-ef9a-4ea0-8c27-3d79e65b1c12/build-report.json) y la
[verificación](.local/mobile/artifacts/android-standalone-5b61f259-ef9a-4ea0-8c27-3d79e65b1c12/native-transport-verification.json) comprueban fuentes
iguales antes/después, quince archivos principales unidos al bundle real,
Hermes sin Metro, ARM64/x86_64 y el mismo certificado Android Debug.
TypeScript y quince comprobaciones focales de custodia/sesión pasan.

La interfaz principal se ha observado en el teléfono; al salir a Chrome se
bloquea la sesión. Se ha recuperado el mismo perfil público y la apertura
inicial pide la huella de migración prevista. La sesión anterior ya realizó la consulta firmada; la corrección final muestra
el ingreso confirmado como histórico ligado a la operación y reduce el polling
a READ breve, sin reconstruir ni ampliar el historial cada doce segundos.
La [lectura física de la sesión](.local/mobile/artifacts/android-standalone-5b61f259-ef9a-4ea0-8c27-3d79e65b1c12/physical-session-readback-v1.json) confirma entrada, reconexión de la misma wallet y navegación Cartera/Operaciones/Ajustes sin otra huella de custodia. Operaciones muestra el ingreso confirmado de 600 como histórico ligado a la preparación. Las operaciones financieras se acreditarán por separado. No se ha ejecutado ningún
pago ni retirada durante esta actualización.

## Motor, tres redes y app

- La navegación principal ofrece Cartera, Operaciones, DeFi y Ajustes. La preparación usa
  presupuesto, plazos, destinatarios e importes; el motor determina los comandos,
  dependencias, pruebas, recibos y retiradas. La app y la integración financiera
  comparten el mismo ejecutor.
- El recorrido conjunto terminó correctamente: nota financiada con 600 unidades,
  presupuesto de 300, Ethereum → Bitcoin → Solana, resultado `FULFILLED` y
  retirada confirmada de las 300 unidades de cambio. Hubo tres identificadores
  nativos distintos, sin reenvíos ciegos, y trece pruebas originales: D26, R,
  seis Fold, tres Admission, T y W39. Los contratos desplegados verificaron
  las pruebas y sus efectos.
- El intento aceptado es `6d53d7a1-42e9-47aa-99d0-9b2fe0e703a9`.
  Su [resultado conservado](.local/device-paged-three-network-v3/attempt-6d53d7a1-42e9-47aa-99d0-9b2fe0e703a9/result.json)
  corresponde a las fuentes `a1c25561fdc747144aeeb1be54362c923ec51c6a9a4f82014470ed65e7ed9ce1`.
  SHA256 del resultado: `761b6a9feef3bbf229afd337e0f976887a3f24fc6fbed7961ed3f05f40a412fd`.
  Se conservaron 252 avances públicos, sin aperturas ni claves. El operador,
  los tres runtimes y el HOST cerraron sin errores ni sockets propios abiertos.
- Ethereum, Bitcoin y Solana usan sus runtimes locales originales. Bitcoin
  exige seis confirmaciones y Solana finalidad. El importe nativo de cada paso
  se mantiene separado del presupuesto de la nota; no hay conversión ficticia
  entre ETH, BTC, SOL y las unidades de la nota.
- Los permisos mantienen quince segundos de vigencia. El reloj Paged conserva
  el tiempo transcurrido ante retrocesos reales del reloj del entorno WSL, sin
  cambiar Date global. La recuperación obtiene observaciones y comandos nuevos;
  un envío incierto conserva su identificador y se consulta antes de avanzar.
- Una sesión móvil autoriza sólo su grafo durante un máximo de treinta minutos
  en primer plano. Cancelar, caducar o pasar a segundo plano borra sus claves
  de memoria. Financiar, retirar y DeFi mantienen autorizaciones propias.
- La app importa `paired-connection.json` con descriptor original y certificado
  TLS fijado por su SHA256 DER. El transporte Android usa TLS 1.3, comprueba
  el hostname y limita las rutas y la cancelación a esa conexión.
- `./dev platform paged-native-new` configura identidad pública, interfaz,
  certificado y archivos de arranque; inicia las tres redes y publica la conexión
  de la app. `./dev platform defi-new` prepara una relación DeFi original y su
  conexión propia. [Uso con Android y WSL](services/api-server/README.md).
- DeFi guía financiación, reserva, ejecución y recuperación sobre ExternalFlat:
  Uniswap, Aave y Morpho conservan sus protocolos originales. La pestaña DeFi
  y su conexión están incorporadas; convertir estas acciones en nodos Paged
  sigue pendiente.

La ejecución aceptada utiliza software de custodia en Node y tres ledgers locales
con operadores en el mismo host. Para completar el alcance de producto faltan la
operación en teléfono físico, redes públicas, operadores independientes, DeFi
mixto dentro del grafo y la reapertura económica del backend Paged retenido.
Conserva el proceso durante la vida de sus notas; el arranque nuevo no reemplaza
el estado guardado ni financia notas automáticamente.

El [APK que confirmó el primer D26 físico](.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/app-release.apk)
está compilado, verificado e instalado en el Samsung: 43.650.119 bytes,
SHA256 `7243b9c175dd1a467f937123a9764a8ca2af5be66017f3d3cf263260eac9ec76`.
Corresponde a la generación de fuentes
`0e41709b86803f3a6369a47d54da471edaa7bac0b9f56bf4b3727067cd446dbd`.
El [informe de compilación](.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/build-report.json)
registra fuentes iguales antes y después y un build de unos 53 segundos.
Incluye ARM64, x86_64 y
JavaScript/Hermes sin Metro, con el mismo firmante Android Debug.
Se conserva la [verificación del empaquetado](.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/native-transport-verification.json), el
bundle generado y su mapa. Este APK mantiene la corrección AES y la lectura
acotada de la raíz a 60 segundos, y separa el epoch real de los mensajes de su
caducidad monotónica local. Los permisos de 15 segundos y el límite de adelanto
de 3 segundos permanecen intactos; la sesión de lectura no guarda la clave del
propietario.

Añade **Continuar ingreso preparado**, conservando nota, trabajo, importe y
apertura tras una lectura original que confirme ausencia de prueba. Si venció
la época D26, sólo renueva época, firma de la nota y sus hashes asociados. El
registro pendiente se guarda antes del challenge; tras la firma, un token
privado de un uso comprueba el SDK y el registro cifrado sin volver a abrir ROOT.
Los selectores del formulario tampoco fuerzan lecturas biométricas. El cambio
de recuperación pasó cuatro comprobaciones focales/HOST en 19,44 segundos;
TypeScript y límites pasan. El APK actual añade diagnóstico por fase y código
acotados, sin datos privados.

La actualización conservó identidad, namespace y operador; el hash instalado
coincide. En este APK se confirmó el ingreso desde el Samsung: [prueba D26
original aceptada](.internal/runtime/omnichain-product/evidence/paeg-proof-attempts/8a623959-4419-455c-bc51-dd622002fa7c.json),
financiación con su autorización nueva y lectura posterior con **600 unidades
disponibles**. El [checkpoint físico](.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/funded-physical-paged-f267-v1.json)
conserva ese alcance. El grafo físico de tres redes, las retiradas y DeFi siguen
pendientes; el READ confirmado previamente en `9af3816e` conserva su propia
[evidencia](.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/paired-signed-read-wall-clock.json).
Los [experimentos del reloj de WSL](docs/USB-MOBILE.md#comprobación-física-realizada)
y el APK anterior `ccda916f` conservan su alcance histórico; la aceptación
financiera descrita arriba corresponde a sus fuentes originales y no acredita
esta nueva generación.
TypeScript, límites de dependencias y análisis estático pasan: 937 módulos,
108 entradas checkJs y ningún ciclo nuevo. La comprobación focal del móvil
verifica SDK, firmas, cifrado y continuidad de custodia; los trece comprobantes
financieros corresponden al recorrido conjunto descrito arriba.

Los cuatro intentos previos permanecen separados. Se corrigieron el compromiso
original de riesgo Paged y los rechazos causados por retrocesos del reloj.
La limpieza de un permiso rechazado antes de ejecutarse conserva el trabajo
original; una vez entrado el envío, conserva UNKNOWN y su reconciliación.

## Limpieza del entorno

El desarrollo funcional se ha retomado después de esta reorganización.
La limpieza del 10 de octubre redujo el proyecto de **29,8 a 19,8 GiB**:
**10 GiB liberados**. Se retiraron cachés y copias temporales; el historial
seleccionado quedó respaldado y verificado en `.local/history/`.
Se conservaron originales, custodia, bases de datos, APK y los dos candidatos
móviles pendientes. [Entorno y restauración](docs/LOCAL-ENVIRONMENT.md).
Los objetivos y su evaluación funcional conservan el alcance original.

El 11 de octubre se clasificaron los recursos locales por función y se separó
la caché npm común en `.local/cache/npm/`. La limpieza por clase retiró otros
68 MiB de cachés regenerables y compactó tres carpetas de informes antiguos con
respaldo verificado. `./dev resources` muestra el inventario; no quedan raíces
sin clasificar en los directorios gestionados. El proyecto sigue ocupando unos
19,9 GiB: herramientas, originales, dependencias y estado retenido siguen siendo
necesarios. No se ha presentado ese volumen como código eliminable.

## Guardado de pasos desde la app

El emparejamiento devuelve las familias, destinos sugeridos y contextos públicos
de las tres redes del proveedor original. `PREPARE_NATIVE_PAGE` utiliza el permiso original de la
identidad del dispositivo, con vigencia de quince segundos y respuesta cifrada.
El backend limita la petición a compromisos públicos de la página conservada;
rechaza campos privados extra y ordinales ajenos a la página actual antes de
llamar al proveedor. El proveedor queda fijado al crear el servicio y no puede
seleccionarse ni sustituirse mediante HTTP. Preparar acciones no ejecuta una
transferencia ni avanza el grafo financiero.

El Vault conserva el mismo identificador y las claves antes de pedir acciones.
El proveedor guarda los términos de la preparación y devuelve las mismas
acciones ante una petición idéntica. La app también reconstruye un envío de
página conservada pendiente de confirmar. Las dependencias y aperturas siguen
en la custodia y en el canal privado del grafo; no forman parte de la petición
al proveedor.

Pasan TypeScript y tres comprobaciones HOST seleccionadas de nota, preparación
del grafo y autorización de envío. Incluyen respuesta perdida, campos ajenos,
ordinales incorrectos y continuidad de la misma custodia. Sus puertos de red y
prueba financiera son inertes: estos resultados no acreditan una operación en
un teléfono ni cinco transferencias reales. No se ha iniciado otra ejecución
financiera larga para entregar esta conexión.

## Integración móvil del 11 de octubre

Las pantallas Nota Paged y Grafo Paged publican ahora sus lecturas en Estado
privado. La vista distingue la nota y el progreso del grafo, conserva su red,
pool y raíz propios y permite volver a la pantalla correspondiente para leer.
Las cantidades proceden de la lectura original y de su vinculación comprobada
con la custodia local; un presupuesto o una fase del grafo no se convierte en
saldo disponible. Al preparar el grafo, la nota fuente deja de estar disponible.

Las proyecciones son inmutables y propias del Vault: copias, proxies y resúmenes
sin esa identidad se rechazan. Una escritura o reapertura invalida las vistas
anteriores. Cambiar de pestaña conserva la lectura sólo hasta su caducidad
original; un pendiente, una recuperación sin lectura o el paso a segundo plano
no conserva un saldo utilizable. Las claves, aperturas y respuestas privadas
del grafo no llegan a esta vista.

TypeScript y los 16 HOST seleccionados de SDK/Vault/estado pasan; la selección
tardó 23,667 s. La prueba local usa un reloj monotónico y mantiene las ventanas
originales de 15 s. El check general posterior pasó 498/498 en 44,168 s. Los
HOST usan puertos de cadena, prueba y Expo inertes; no acreditan ejecución
económica. Las correcciones posteriores del ledger pasaron sus cuatro casos
causales y el cargador Expo pasó su caso original, junto con ambos HOST móviles.

El APK anterior a la integración de ejecución está compilado sin Metro para
ARM64 y x86_64: 43.470.439 bytes,
SHA256 `0ae7a29edf4df63802e8fd72b49c3b366043f74493dab307af07b98b93ba0b2f`.
El build tardó 4 min 23 s; conserva 159 inputs iguales antes/después y 43 uniones
de fuentes originales con el bundle. Los 159 inputs se comprobaron de nuevo al
terminar y siguen intactos. El APK y su informe están conservados en
`.local/mobile/artifacts/android-standalone-3f88f751-8b92-4ca9-9f8e-7163eb45f87c/`.
La conservación del APK inmediatamente anterior falló antes del clean del build:
su binario no quedó retenido. Su informe se conserva desde el stdout original;
las versiones anteriores ya archivadas conservan sus bytes. El primer intento
nuevo se interrumpió y su informe fallido permanece separado del build completado.
ADB no detecta un dispositivo: instalación,
biometría, TLS y operación financiera en el teléfono siguen sin comprobar.

El nacimiento económico paginado ya supera los locators y las bibliotecas del
pool trasladado. La carga usa las fuentes retenidas autenticadas y los programas,
claves y recibos originales; no recompila ni sustituye verificadores. El
reconciliador lee los receipts RPC originales dentro de sus filas de runtime.
El ledger privado se reconstruye desde sus eventos NoteInserted canónicos y se
compara con currentRoot, sin depender de un getter de nodos que el pool no tiene.

Los descriptores nuevos conservan el vencimiento de emparejamiento de nueve
horas en reloj real y añaden su límite de nueve horas en el reloj de cadena. El
grafo comprueba cada cutoff contra su propio reloj; los descriptores anteriores
mantienen su comparación original. El HOST causal usa un genesis de laboratorio
posterior al reloj real y comprueba también el rechazo en el límite exacto.
TypeScript y ambos HOST móviles pasan; los permisos y lecturas siguen en 15 s.

La lectura de la nota incluye ahora el timestamp de su mismo bloque canónico.
La pantalla convierte presupuesto y minutos en los términos originales sin
usar el reloj del teléfono. El conversor exige el status original vigente del
SDK, rechaza copias, importes superiores al disponible y plazos fuera de la
conexión. Los descriptores y status anteriores conservan su formato aceptado;
el nuevo formulario exige una lectura que incluya la hora de cadena. TypeScript,
los diez casos focales y el análisis estático pasan. Los casos focales tardaron
30,226 s; no se repitió el recorrido financiero.

El intento local `9934a2b1-851c-4c0e-aa08-ca922b5dd3b7` confirma D26/FUND,
fuente LIVE, dos páginas y restauración cifrada antes de R con nuevos READ y
OBSERVE, sin nueva prueba ni envío durante la restauración. Termina rechazado
en R por la salida de consola del wrapper oficial de generación, con todos
los recursos originales cerrados. El productor corregido llama a la misma API
oficial con la clave preparada autenticada, conserva la verificación real y
el rechazo de salida por consola. El intento posterior `8bb70b66-848c-48a6-b4a4-f80f147b85c8`
confirma R en el pool y la primera prueba Fold, ambas verificadas por sus
verificadores desplegados. Termina antes de enviar el primer nodo: el runner
intentaba llamar a advanceTo, que el runtime nativo no expone. La sincronización
se conecta ahora dentro del despacho Paged, sólo contra el timestamp del bloque
canónico capturado por su grant READY original. No añade un setter de reloj ni
modifica SOURCE. El HOST focal confirma sincronización antes de la guardia final,
rechazo antes de clave si cambia READY y un único wire durable ante respuesta
perdida. Falta completar las cinco entregas, T y las dos W39; estos intentos
rechazados no se han presentado como aceptación. Todo este perfil
es EVM LOCAL_SYNTHETIC con operador común y custodia Expo software; no demuestra
un grafo mixto Ethereum/Bitcoin/Solana, independencia de operadores ni teléfono.

El intento posterior `5a5d6755-19dc-466c-aabb-7e0c07496b41` se detuvo tras la
preparación y restauración, antes del primer envío nativo, al detectar que la
admisión usaba la hora de observación como inicio de READY. Conserva su rechazo,
SIGTERM y cierre de recursos originales. La corrección toma la hora de firma
del despacho original, vinculada al head preparado, y conserva por separado
la hora de evidencia confirmada. La preparación HOST rechaza ahora una firma
fuera de READY antes de abrir el productor, como exige el circuito original.
Esta corrección aún no tiene una nueva ejecución financiera completa.

## Ingeniería del 11 de octubre

El código diario se ejecuta desde `apps/` y `packages/`. `./dev build` prepara
los nueve paquetes npm; `./dev build --legacy` conserva las reproducciones que
necesitan la disposición histórica. El histórico está excluido de búsquedas y
análisis cotidianos. Los objetivos funcionales y la visión no han cambiado.

La reorganización actual deja estos resultados comprobados:

- **Paquetes y consumidores:** cero ciclos entre paquetes, cero imports privados
  activos entre paquetes y cero enlaces activos hacia pruebas/experimentos.
  La comprobación inspecciona 983 fuentes y 1.835 imports públicos. Los trece
  enlaces de soporte de `protocol` son históricos y permanecen separados.
- **Familias privadas:** mecánica EVM, reloj SOURCE, tres bridges, actor móvil y
  sesión nativa tienen propietarios por instancia y contratos concretos. La
  composición original conserva las funciones públicas y los validadores no
  aceptan marcas de otro builder. Se mantienen AEAD, CAS y tokens de un uso.
- **Tipado:** la comprobación estricta tiene 108 entradas explícitas, frente a
  las 27 anteriores. Comprueba los cuerpos completos del actor y sesión nativa,
  depósitos y ejecución de cuenta, además de los mecanismos extraídos de
  journal, recuperación, observación, DeFi y formatos móviles. Incluye también
  el lector I84 completo y el validador de autorizaciones retenidas; sus codecs
  de números y hashes tienen un único propietario inferior tipado. El núcleo
  superior completo sigue pendiente; un contrato de puerto no equivale al
  tipado de su implementación.
- **Simplificación:** se retiraron las catorce fachadas duplicadas de wallet,
  fachadas privadas sustituidas y tres recolectores manuales de fuentes. Los
  consumidores usan sus propietarios actuales; los exports públicos útiles
  conservan su identidad. Veinticinco copias de fuentes del runtime histórico
  dejaron de regenerarse: las dieciséis iniciales (277.111 bytes) y nueve fachadas
  adicionales. Las herramientas y originales no se
  eliminaron para reducir artificialmente el tamaño del proyecto.
  Los consumidores activos de nueve fachadas backend ya llaman a sus propietarios
  definitivos. Las nueve fachadas se retiraron de `src` y sus bytes exactos
  (2.820 bytes) quedan como `.source` en `archive/source-evidence/retired-facades`;
  las publicaciones previas las resuelven como evidencia, sin ejecutarlas.
  SOURCE reconcilia el checkpoint de cuenta mediante
  el reconciliador de datos, sin pasar por la autoridad de cuenta ni relajar CAS.
- **Pins actuales:** `./dev pins check|update --profile all` gestiona móvil,
  plataforma, consumidores y runtime. Incluye los pins de procesos/redes, los
  registros de callers y diez registros antes manuales: cuatro launchers,
  cinco fuentes móviles TRON y un parser de diagnóstico. La actualización
  respeta el orden fuente → launcher → host y conserva los validadores.
  Los 200 controles de dependencias inmutables siguen separados.
- **Contratos estáticos:** las siete factories económicas usan miembros
  explícitos, incluida la delegación a recuperación y saldo. El comprobador
  reconoce destructuración fija y guardas auténticas; rechaza callbacks
  generales, módulos variables, campos sobrantes y acceso general a escritura.

La adopción actual es
`90739a2ad005ffa0e56ea5897c29dfc916810d90e3bfb2e6f5de744c253b325f`, con
**1.488 filas de fuentes y cero aliases de ejecución** en su contrato. Preparación y
adopción autentican los doce roles nativos y los cinco paginados, los originales
W39/N32, programas, claves, compiler inputs y recibos. Los catálogos anteriores
quedan archivados por sus bytes exactos; no se ejecutan ni se reescriben.

El recorrido real de lectura económica comprueba las cinco relaciones paginadas,
las doce nativas, la procedencia I84 y los 502 registros originales wrapped;
conserva el rechazo de copias del bundle con marca privada. Esto cierra la lectura
de los artefactos desde el código reorganizado, no una nueva aceptación de
transferencia ni una prueba criptográfica.

Se comprobó también el paquete paginado/wrapped/I84 trasladado desde `cwd=/`, con
Node autorizado a leer únicamente dentro del paquete. Sus lectores reales
aceptan las fuentes adoptadas y rechazan una clave paginada original alterada.
Para I84 rechazan alteraciones de clave, programa, recibo de verificación y
cápsula. Lleva 2.235 recursos públicos (276.564.901 bytes); el paquete completo
ocupó 320.727.390 bytes, unos 305 MiB, y fue eliminado después. La última
comprobación portable terminó en 14,9 segundos sobre la generación
`93a1e00961f6794d23711c875c86b569a03537cb87d4593393927cb1ef8bc778`,
con 1.482 fuentes empaquetadas. La adopción posterior conserva los contratos de
recursos y pasa de nuevo la lectura económica; no se repitió el paquete completo.
La prueba trasladada no usa el
checkout, laboratorio ni `.internal/runtime` de la máquina original.

I84 autentica una publicación inmutable del resultado del lector original y
los 244 recursos públicos que comprobó, incluyendo los hashes por streaming de
CRS y Wasm. El resultado nuevo es idéntico al original, con los mismos bytes de
programa, clave, Solidity, pruebas y recibos; no ejecuta los módulos históricos.
Su exportación añadió aproximadamente 6,34 MiB de cápsula y evidencia de fuentes;
reutiliza herramientas, parámetros y artefactos restaurados. Los directorios
absolutos del resultado son etiquetas de procedencia, no rutas de lectura.

El recorrido SPL SOURCE tiene ahora un propietario canónico fuera del transporte
HTTP. La regresión importa su módulo completo con puertos inferiores explícitos;
conserva Vault/AEAD/CAS, nacimiento antes de FUND, finalidad y wire originales,
UNKNOWN tras respuesta perdida, observación sin otra prueba/envío y cierre de
recursos. Dos instancias mantienen sus referencias originales por separado y
rechazan un proveedor copiado. El cuerpo sustituido se retiró del archivo HTTP.

El cifrado de estados nativos SOURCE tiene un propietario completo bajo tipado
estricto. Conserva el formato V1 y la derivación/AAD originales; comprueba un
frame sintético anterior a la extracción y rechaza alteraciones de identidad,
clave, familia, generación, genesis, head y ciphertext. Borra el texto provisional
emitido por AES-GCM incluso cuando falla su tag. Los cinco casos pasan con AES
real. Los 102 cuerpos de funciones restantes de SOURCE conservan su AST tras
hacer legible el archivo; esto no declara tipada toda su composición. La regresión
con salida física de un proceso, publicación nativa, OPENING y CAS de cuenta pasa
en 14,8 segundos. La última fachada SOURCE, 1.929 bytes, queda conservada como
evidencia `.source` y su consumidor abrupt-backend importa directamente al dueño.

La carga del compilador Solidity ahora tiene un único propietario de engine,
completo bajo tipado estricto. El compilador genérico, Morpho Blue y Aave
reutilizan su verificación de lock, origen, integridad, módulo, versión y API C
sin callbacks. El objeto original `GENERIC_COMPILER_PIN` mantiene la identidad en
ambas entradas públicas; los contratos Blue/Aave compilan con el build original.
Sus fuentes host anteriores se conservan con bytes/hashes exactos como evidencia
paginada, sin cambiar manifests de artefactos ni ejecutar el histórico.

El paquete trasladado carga además el SDK ABI oficial y ese compilador desde sus
recursos declarados. El SDK codifica el calldata esperado; el compilador solo se
carga en ese paquete. Se rechazan cambios en manifest/entrada ABI y lock/módulo
Solc, además de las cuatro alteraciones I84 y la clave paginada anteriores. Los
módulos ejecutables de recursos se limitan al árbol original del SDK autenticado
por su manifest. El paquete temporal se elimina después de la comprobación; no
se duplican herramientas o parámetros permanentemente ni se copia el laboratorio.
Esto acepta la carga trasladada de herramientas, no un nuevo recorrido financiero.

Los siete archivos del driver RootNote usan ahora quince imports canónicos;
la selección de sus cuatro perfiles se prueba mediante su interfaz real, sin
extraer JavaScript. El paquete trasladado carga ese worker desde sus fuentes
canónicas, sin invocar un constructor financiero. La finalización BTC tiene un
propietario estricto que vuelve a comprobar familia, nativeId, wire y número de
intentos antes de descargar el ticket; sus regresiones rechazan divergencias sin
otro envío. Las pruebas nuevas sin ruta histórica dejan de generar copias; una
fuente ejecutable sin mapping sigue siendo rechazada.

Los recibos de pruebas SOURCE tienen un propietario estricto de datos; conservan
los cuatro formatos, hashes y límites originales, sin emitir autoridad de cuenta.
La autoridad nativa es legible y sus otros 84 cuerpos conservan su AST. Esto no
acredita el tipado completo de ese archivo.

La implementación SOURCE y sus mapas privados están fuera del SCC. Su composición
canónica conserva los 185 miembros públicos, dieciséis cargas diferidas fijas y
diez dependencias originales. No exporta un selector para sustituirlas. Dos
familias aisladas y una copia del handle rechazan la autoridad canónica sin cargar
recursos. La recuperación tras salida física, publicación, OPENING y CAS pasa en
14,7 segundos; también pasan el fallo CAS del journal y el fence de continuación.
La composición canónica permanece en el SCC de 133 archivos: este corte separa
la implementación, no elimina ese ciclo.

La recuperación wrapped y la del catálogo DeFi tienen ahora implementaciones
privadas fuera del SCC, con composiciones canónicas que conservan 148 y doce
miembros públicos respectivamente. Wrapped mantiene 36 cargas diferidas originales;
el catálogo conserva once. Pasan el rechazo de familias y copias, almacenamiento
cifrado, tokens de un uso y recuperación D26 en otro proceso. El catálogo conserva
el EXIT original tras respuesta perdida con un envío y sin nueva admisión.

GRAPH separa su composición de la implementación de sus 35 miembros. Sus partes
de recuperación, términos de preparación y guardas de nacimiento Aave/Uniswap
son propietarios completos bajo tipado estricto. Mantienen checkpoint original,
rechazo de CAS pendiente, tokens de un uso, quota exacta y ledgers vacíos antes de
financiar. Las guardas conservan el snapshot separado de campos durante lecturas
asíncronas; una regresión comprueba la mutación del objeto del llamador. Las pruebas
migradas usan Vault/CAS y el propietario de journal completo, sin extraer sus
cuerpos por texto. Los recorridos de preparación con dos/cuatro targets y rechazo
de quota, provider copiado y slot duplicado también pasan.

La autoridad nativa tiene su implementación fuera del SCC y una composición
fija de setenta y nueve dependencias y siete loaders originales. Conserva los 103 miembros
públicos y las 86 sentencias originales de implementación. La prueba crea una
cuenta con almacenamiento cifrado real y puertos financieros inferiores inertes:
rechaza una familia ajena, una copia y otro propietario antes de cargar recursos;
abort y close son idempotentes. Sus cuerpos superiores todavía no están tipados
por completo.

El lector de archivos acotado, la cola física GRAPH y la lectura de portfolio
son mecanismos completos bajo tipado estricto. Sus pruebas importan los módulos
reales; se retiraron las tres extracciones por texto correspondientes. El almacén
conserva AEAD/CAS y pasa sus 52 casos restantes. La cola pasa cinco casos de FIFO,
drenaje, generación y leases entre familias; el cliente y las guardas de portfolio
pasan diecisiete. El portfolio conserva el bloqueo en su autoridad y snapshots
inmutables con estados LIVE/PARTIAL/STALE/UNAVAILABLE, sin sumar activos distintos.

La selección diaria incluye los nuevos contratos cortos: 310 casos pasan en
11,6 segundos. No incluye campañas económicas largas. Las nuevas implementaciones
compartidas tienen 40 bindings canónicos en total y no generan copias adicionales;
las veinticinco copias retiradas siguen fuera del generador.

La auditoría de currentness wrapped, la retención exacta de certificados y la
preparación durable de vaults tienen propietarios completos bajo tipado estricto.
Se retiraron sus fragmentos evaluados. Se conservan la verificación después de
los awaits, firma original, procedencia privada, idempotencia tras respuesta
perdida, nonce y referencia, y el bloqueo de acciones ya intentadas o inciertas.
Las seis regresiones de preparación y las cuatro de retención pasan.

Los lectores de cantidades y paths Merkle pertenecen a `components/plain-input`.
Cincuenta y dos consumidores adicionales dejaron de importar la preparación de
witnesses para esas utilidades; sus cuerpos conservan el AST. Los tres casos de
inputs incluyen Node con acceso de lectura limitado al componente. El tipado
no arrastra jobs/provers a estos lectores de datos.

`./dev sources prepare --adopt` prepara y autentica la selección de fuentes en
una sola invocación, sin copiar manualmente su huella. Rechaza candidatos
incompletos o cambios entre captura y adopción. Sus 24 regresiones pasan y no
modifican publicaciones, aceptación financiera ni los pins históricos.


### Limpieza focal para continuar iterando (11 de octubre de 2026)

La sesión genérica y el keeper duradero tienen implementaciones separadas,
con tipado estricto y registros privados por familia. Las composiciones
canónicas conservan las funciones públicas y sus guardas de identidad; los
consumidores genéricos usan directamente el propietario de sesión. La lectura
económica de claims pertenece al módulo de portfolio. Los preparadores usan
el contrato inferior de validación, sin cargar la composición HTTP.

La validación de registros SOURCE es un módulo puro tipado; el backend sigue
siendo propietario de almacenamiento y autoridad. El transporte HTTPS SOURCE
es un módulo completo probado por el SDK real, sin extracción de JavaScript.
La prueba móvil puede ejecutarse desde fuentes editables. Dos fixtures HOST
usan ahora la autoridad canónica vigente y puertos ajustados al contrato real.

Se añaden regresiones rápidas de aislamiento de familias de sesión y de
registros SOURCE a la selección diaria. No se amplía la política de ciclos,
ni se alteran publicaciones financieras o pins históricos. Sigue pendiente
la separación completa del gran ciclo interno y la deuda descrita arriba;
este bloque no pretende cerrar todas las campañas económicas.

**Deuda que permanece:** el SCC interno pasó de 154 archivos/845 imports a
**130 archivos/744 imports**, pero sigue reuniendo SOURCE, autoridad nativa,
recuperación wrapped, servicio GRAPH y recuperación del catálogo DeFi. Sus
composiciones superiores no están tipadas por completo. Persisten pruebas que
extraen código por texto fuera de las familias migradas. El lector I84 ya es
trasladable; no se ha trasladado ni ejecutado el sistema financiero completo con
sus workers y todas las rutas DeFi desde ese paquete. No se declara terminada
toda la deuda ni los once puntos de limpieza.

Estado concreto de los seis puntos de deuda y cinco de simplificación:

| Punto | Comprobado | Pendiente |
| --- | --- | --- |
| Deuda 1: ciclos backend | Implementaciones SOURCE/wrapped/catálogo/GRAPH/autoridad nativa separadas de sus composiciones y checkpoints de datos; cero ciclos de paquetes. | Resolver las relaciones entre las cinco composiciones canónicas; el SCC sigue en 130 archivos. |
| Deuda 2: adopción económica | Generación actual adoptada; lectura real paginada/nativa/wrapped y rechazo de copia del bundle. | No se cuenta esta lectura como una nueva operación financiera. |
| Deuda 3: pins actuales | Inventario gestionado de móvil, plataforma, callers y runtime; 200 verificaciones inmutables separadas. | Las ampliaciones futuras deben declarar sus fuentes; no se actualizan hashes históricos. |
| Deuda 4: disposición y recursos | Fuentes canónicas, bundle wallet, lectores paginado/wrapped/I84, SDK ABI y Solc trasladados; recursos declarados sin fallback. | Portar y aceptar todos los workers y recorridos económicos/DeFi con sus recursos reales. |
| Deuda 5: tipado del núcleo | 108 entradas estrictas y cuerpos completos de las familias indicadas arriba. | Autoridad nativa superior, implementación SOURCE restante y recuperación GRAPH/DeFi. |
| Deuda 6: pruebas por interfaces | Actor, sesión, journal, recuperación y fixtures wrapped usan interfaces completas; autorización, I84, lector acotado, cola GRAPH y lector de portfolio, currentness, retención de certificados y preparación de vaults ya no extraen JavaScript. | Migrar las extracciones restantes y aceptar las matrices wrapped completas. |
| Limpieza 1: histórico separado | Búsquedas, dependencias cotidianas y clones de desarrollo excluyen el histórico; originales conservados. | Nada adicional identificado en este bloque. |
| Limpieza 2: fachadas | Catorce fachadas wallet y nueve backend retiradas; consumidores directos y bytes históricos autenticados fuera de `src`. | Nada adicional identificado entre las fachadas retiradas de este bloque; se conservan las entradas públicas útiles. |
| Limpieza 3: caminos de ejecución | Veinticinco copias retiradas; los nuevos propietarios compartidos no generan otra copia. | Retirar la compatibilidad que todavía usa el sistema económico completo. |
| Limpieza 4: herramientas y pruebas | Catálogo de comandos comprobado; campañas largas explícitas y selección diaria acotada. | Pruebas frágiles restantes y validación de las matrices migradas. |
| Limpieza 5: legibilidad y propietarios | Helpers sustituidos retirados, puertos económicos explícitos y composición nativa separada de su implementación. | Dividir responsabilidades restantes de las implementaciones grandes y completar su tipado. |

Las matrices wrapped de 69 casos de ciclo de vida y 22 de runtime siguen
siendo campañas explícitas y su ejecución completa permanece pendiente. La
fixture de comportamiento autentica la instalación una vez y proporciona ese
resultado como puerto inferior inerte; no cambia las guardas del producto.
Así, la autorización wrapped focal pasa en unos dos segundos. La procedencia
privada del source, su verificador y el router de history comparten un módulo
completo, sin extraer funciones. Pasan la reapertura de historial tipado, UNKNOWN
sin uso de claves, historial adverso retenido y snapshot físico final compartido.
Los dos últimos casos focales terminaron juntos en 27,4 segundos. Las
comprobaciones de integridad reales permanecen separadas. La selección de 45
segundos previa a esas correcciones no terminó y no se cuenta como aprobada.

El inventario textual restante encuentra 24 archivos de pruebas/fixtures y 52
patrones de evaluación de JavaScript. Es un diagnóstico para migrar: no implica
que cada coincidencia extraiga código ni que esas familias estén ya aceptadas.

Las comprobaciones de esta integración incluyen 24 casos de generaciones, once
regresiones de contratos estáticos, diez de disposición/source-runtime, cinco
casos de perfiles Base/Arbitrum/BSC, ocho de workers/procesos y siete del lector
compartido/manifiesto wrapped. Actor y sesión nativa pasan sus regresiones de
identidad, SOURCE/CAS y recuperación; las selecciones se solapan y no constituyen
una campaña económica nueva. Los 52 archivos protegidos de visión, exclusiones,
APK y trabajo retenido conservan sus hashes.

`./dev check` completo pasa: límites entre paquetes, análisis estático, tipado,
catálogo de comandos, diez casos de source-runtime y 310 comprobaciones HOST.
La prueba de capacidades exactas usa ahora la URL pública del módulo compartido,
sin restaurar una fachada retirada. El guard EVM reexporta el bloqueo de su
propietario sin evaluarlo prematuramente durante la carga circular; conserva
la misma identidad y las verificaciones de leases.

En este bloque también pasan la regresión focal SOURCE de interrupción/checkpoint
(30,52 s), la unión wallet wrapped por HTTP/SDK (15,37 s), 18 casos de autorización,
entradas de claims y SOURCE SPL, seis de conformidad de bytes Noir y cuatro de
interfaces de autorización/I84. No se añaden a la selección rápida campañas
financieras ni esperas de horas.

Los originales restaurados y las ausencias históricas siguen inventariados.
Conservar ese material no implica que toda la generación histórica sea
operativa. [Mapa del código](docs/STRUCTURE.md), [módulos](docs/MODULES.md),
[fuentes y artefactos](docs/SOURCE-GENERATIONS.md) y [comandos](docs/COMMANDS.md).

## Aceptaciones funcionales conservadas del 10 de octubre

- **Uniswap móvil aceptado:** `45a420b8-9dd9-4e83-b513-91c2c4c885a6`
  completó las 14 relaciones originales, swap exact-output, retirada del
  resultado y del cambio, respuesta perdida, restauración cifrada de la
  custodia SOURCE/SHARE/PoP y observación de los mismos trabajos en otro PID.
  Reabrió cuatro secciones originales sin otra prueba ni envío; fuentes
  intactas, cleanup sin errores y lock liberado. Es el perfil local sobre TLS
  y custodia software del dispositivo; teléfono y caída abrupta quedan pendientes.
- **Recuperación nativa con SQL aceptada:** `1e12d9d4-d156-41b6-af74-a5338855abed`
  completó nueve pruebas y 21 etapas: entrega nativa única, F, captura de diez
  secciones, reinicio del backend, READ fresco y ambas W39 con respuesta perdida
  y conciliación del mismo trabajo. El usuario recupera 500 unidades del activo
  fuente (400 de cambio y 100 de reserva); el proveedor conserva una pérdida de
  1.000.000 wei de principal más 23.800.000.000.000 wei de gas en la red nativa,
  bajo el consentimiento original de riesgo. No se suman esas unidades.
  Pool y backing quedan a cero, sin reservas ni efectos duplicados; fuentes
  intactas, cleanup sin errores y lock liberado. PostgreSQL propio queda cerrado.
  Los intentos `7085c0fa…` y `4c50417a…` conservan sus rechazos; las correcciones
  `98575a2` y `89a22ac` permiten este nuevo recorrido.
- **Composición:** `e0ecd93` publica la generación actual de 901 fuentes
  físicas y doce roles después de las correcciones SOURCE, paginada y BSC.
  `3a81438` fija las 722 fuentes del grafo paginado y `2effdd8` las 716 del
  consumidor nativo. Las tres preparaciones terminaron correctamente y el
  preflight SOURCE de Uniswap comprueba sus fuentes actuales. Las dos anclas
  tienen una relación de hashes sin ciclos y conservan
  las hojas de producción y los artefactos originales. Se comprueban
  antes de CREATE/FUND. Las 45 fuentes W39 y las 100 del compilador paginado
  permanecen intactas; los cuatro indicadores de aceptación siguen desactivados.
- **RootNote y salida nativa móvil:** `ff8aaa0`/`4b14a3d`/`0822617` conectan
  D27 y CI51 privados desde la custodia protegida del dispositivo. Las guardas
  conservan términos originales y ACCESS antes y después de las esperas.
  `e0b163d`/`8fbc9a2`/`5fc7349` añaden W39, redención y payout con journal
  anterior al efecto y conciliación del mismo trabajo ante respuesta perdida.
  El HOST focal original pasa (207 ms) y TypeScript móvil pasa. La nota es
  DEVICE_ROOT_NOTE; el activo nativo sigue en BACKEND_LOCAL_QUORUM local.
  Faltan el recorrido económico integrado y su continuidad tras caída.
  `d28c2d0`/`474e3f1` permiten observar la misma operación después de sustituir
  el keeper original en el mismo runtime, con token privado y sin reenviar.
  `4473729` completa el payout BTC local: confirma el wire original con las
  seis confirmaciones vigentes y después realiza CO42, rechazando otro wire
  o segundo broadcast. Sus HOST originales pasan; la ejecución económica
  D27→CI51→W39→CO42 sigue pendiente.
  BTC `b756f9bf…` conserva su rechazo antes de probar. `8072164` selecciona
  el ingreso original recent-blockhash antes del nacimiento; `b82addb3…`
  reveló después dos metadatos históricos ausentes. `b0e0949` usa la generación
  auténtica nueva de CI51 V1/CO42: el lector real pasa, sin reconstruir esos
  metadatos ni afirmar igualdad con la clave histórica. `844f3193…` falló
  con cero pruebas por `PW_JOB_IMPORT_CLOSURE`; el supervisor lo interrumpió
  al encontrar el lock retenido del rol fallido. `1905b28` conserva la lista
  original y pasa el mismo helper D27 por el módulo permitido: el guard
  original falla antes y pasa después. Tras confirmar ambos PID y su grupo
  ausentes se conservó el lock exacto en el intento fallido con un journal
  administrativo, liberando sólo el slot operativo. Los informes rechazados
  permanecen intactos. `61cb2dd8…` completó D27 y falló esperando la respuesta
  de FUND: el SDK imponía 15 segundos también al resultado de un efecto ya
  autorizado. `97f1675` usa para FUND/ISSUE el presupuesto de respuesta que
  ya utilizaba la salida, conservando el permiso consumido, su caducidad y
  todas las verificaciones. La regresión causal del SDK pasa en 69 ms;
  no renueva permisos ni reenvía efectos. Falta repetir económicamente BTC
  D27→CI51→W39→CO42 propio del dispositivo.
  `3a8b458` comparte el validador económico existente entre web y móvil,
  conservando sus bytes y reglas; su HOST original pasa sin crear disponible.
- **SOURCE confirmado y GRAPH:** el intento V2 `f1f4e353…` terminó
  rechazado tras una prueba D26, antes del latch de FUND y de su broadcast.
  Los rechazos anteriores y sus cuerpos originales se conservan; no se
  adoptan sus realms. `86c8bc9` evita que las lecturas consuman el permiso de
  15 segundos al capturar el runtime completo. `9310d5f` añade el segundo
  checkpoint de observación con AEAD/CAS. `03a602a` reserva un namespace V3
  propio antes de CREATE/FUND, y `c58bc18` conecta las dos caídas y aperturas
  al mismo recorrido de catorce relaciones, sin prueba ni envío nuevos al
  observar. Las comprobaciones focales originales pasan; el recorrido
  financiero V3 `bdfaa0ff…` terminó rechazado tras D26 y antes de financiar:
  el helper omitía el tercer argumento exigido por el SDK. `0dbe141` pasa
  explícitamente `null` y su regresión sobre el mismo helper, SDK y Vault
  reproduce el rechazo antes del cambio y pasa después en 447 ms. El intento
  financiero rechazado se conserva sin adopción; fuentes intactas, cleanup
  sin errores y lock liberado. `1aff353` liga nacimiento y aperturas a la
  misma pareja del dispositivo, sin reutilizar namespaces fallidos.
  `f2609f53…` llegó a D26 y falló antes de financiar: el audit agregado de
  wires originales superaba el encoder de 1 MiB. `23dfea0` conserva el hash
  canónico completo de cada wire/receipt y su orden en otro hash acotado.
  La regresión sobre el backend real reproduce el fallo y pasa después en
  279 ms, comprobando mutación y orden. El nuevo intento `e711389e…` llegó
  a cuatro pruebas originales y terminó rechazado antes del envío GRAPH:
  fuentes intactas, cleanup sin errores y lock liberado. El contrato original
  exige aprobar exactamente el máximo de ejecución; el productor aprobaba
  500 del depósito para una ruta de 200. `8bce35e` separa ambas cantidades
  antes de CREATE/FUND y rechaza una ruta distinta antes de consumir D27.
  Su regresión original pasa en 119 ms; no cambia Solidity ni amplía permisos.
  El nuevo intento `d17d6c32…` alcanzó trece de las catorce pruebas originales,
  incluida la ejecución GRAPH, y terminó rechazado en WITHDRAW_W39:
  el HTTP/SDK aún agotaba la respuesta a los 15 segundos. Conservó las fuentes,
  cerró sin errores de cleanup y liberó el lock. Se corrige la espera del
  resultado ya admitido: `d56cd88` conserva el presupuesto de respuesta
  existente de 900.000 ms para FUND_D26/WITHDRAW_W39. El permiso de 15 segundos,
  el consumo único y las lecturas de 15 segundos permanecen. La regresión
  causal pasa en 358 ms con reloj controlado. El intento posterior
  `2675bbd9-adae-4cdb-92be-97c775121e6a` conserva trece pruebas capturadas y
  termina rechazado en PROVE_W39: el checkpoint original detectó que los
  metadatos de la prueba se añadían después de persistir PROVED. `811f3b4`
  guarda ambos en la misma actualización durable, conservando witness/PC23,
  época, verificador desplegado, hashes, CAS y rechazo ante incertidumbre.
  La regresión ejecuta ambas rutas originales con Vault AES/CAS real y pasa
  en 4,980 s, incluyendo rechazo de metadatos retenidos alterados. La nueva
  repetición económica `21e7c807…` fue detenida a petición del usuario:
  conservó dos pruebas, fuentes intactas y lock liberado; registró
  `NATIVE_SUPERVISOR_SIGTERM` y un error de cleanup. No acredita las dos caídas.
  `fdaecdb` conserva también la causa RPC original en el diagnóstico privado,
  sin devolver parámetros ni datos financieros. El intento anterior no acredita
  las dos caídas; siguen pendientes
  broadcast→checkpoint y pérdida del padre/dispositivo.
- **PAEG paginado privado V3:** `ca5291e` incorpora árboles sparse Poseidon2
  BN254 propios con el mismo encuadre en JS/Noir/Solidity. Los cinco HOST pasan;
  Las cinco relaciones R119/Fold66/T46/Admission85/W39 y sus claves propias
  están compiladas dentro de 3 GiB y del CRS original. El consumer y los
  cinco verificadores Solidity también compilan. `4f0dd2e` corrige un cast
  Solidity: recompila los cinco programas completos, comprueba identidad
  byte a byte y conserva las claves en una generación separada, sin tocar
  los artefactos originales. `59263a4` conecta el depósito PC23 D26 original
  y las bibliotecas reales de los cinco verificadores; el HOST original pasa.
  Falta el recorrido económico paginado; la composición móvil se detalla abajo.
  No se sustituyen las 45 fuentes originales ni se acredita privacidad
  sistémica. `ba3dbbc`/`081622b` conectan D26/W39 desde la custodia protegida
  móvil, con SDK, AEAD y journal propios. El HOST causal original pasa en
  2,735 s y TypeScript pasa; la cadena, las pruebas ZK y los puertos Expo
  inferiores son explícitamente inertes en ese HOST. Conserva la respuesta
  original del SDK al actualizar el saldo y compara almacenamiento
  estructuralmente, sin retirar los checks de readback/CAS. `5f1c269` conecta
  también reserva, READY, admisión, acumulación, liquidación y W39 al mismo
  OWNER desde móvil. Las páginas preparan sus commitments una vez antes de
  enlazar acciones; la salud nativa se renueva sólo para el efecto, sin rehacer
  pruebas ni ampliar ventanas. El HOST SDK/Vault/Graph pasa en 5,640 s y
  TypeScript pasa; cadena, pruebas y Expo son puertos inertes en ese HOST.
  `117fc85` conecta cinco entregas nativas sobre dos páginas y cinco nodos,
  usando READY, firma, wire y journal originales, con 21 pruebas previstas;
  ante respuesta perdida observa el mismo wire y bloquea otro envío.
  El guard causal de READY/clave/envío pasa en 134 ms con puertos inferiores
  inertes. `af0d40a` añade copia y restauración cifradas de la misma raíz,
  páginas, aperturas, preparación y pendientes; conserva un bloqueo durable
  hasta nuevos READ/OBSERVE y rechaza raíces o revisiones ajenas. El HOST de
  SDK/Vault/cifrado pasa en 7,723 s y TypeScript pasa. Los seals actuales
  comprueban 722/716 fuentes y los mismos artefactos originales.
  `c9d6a3e` incorpora al recorrido financiero la copia cifrada, cierre,
  borrado de la misma custodia y restauración antes de R, con READ/OBSERVE
  frescos sobre la misma operación. `83bd4b9` limita la revelación al ejecutor
  nativo a su nodo y cinco campos de vinculación; su HOST causal pasa en 460 ms.
  La publicación actual y ambos sellos incluyen estas fuentes.
  El primer nacimiento financiero `a196edfa…` se rechazó antes de financiar
  con ENOENT en el locator del runtime EVM desde la ruta canónica. Los recursos
  quedaron cerrados. `b44f5b3` usa host/operador/flow preparados en el mismo
  namespace y resuelve los SDK móviles originales desde ambas ubicaciones,
  sin modificar el harness vinculado a los artefactos 45/100. El nuevo
  nacimiento `c49d711f…` superó ese locator y se rechazó todavía antes de FUND,
  al resolver una biblioteca de linkReferences del despliegue paginado.
  `481ea6e` resuelve las bibliotecas desde la tabla plana del loader original,
  con comprobación de fuente y contrato; su HOST causal pasa en 302 ms.
  El intento `b4a71495-48fa-456e-9274-c4df918713b6` supera ese paso y falla
  todavía antes de FUND por `NATIVE_LIBRARY_GUARD_TEMPLATE`: dos bibliotecas
  pure/view no llevan la guardia de dirección que sí llevan las del verificador.
  `6c61234` selecciona el derivador según la plantilla original del compilador,
  antes del envío, conservando igualdad completa de runtime, keccak, nonce,
  receipt, bloque canónico y plan prospectivo. El HOST sobre cuatro artefactos
  públicos originales pasa en 356 ms. Falta repetir económicamente NativePaged21;
  los intentos rechazados no cambian de resultado.
  Falta aceptar la ejecución económica paginada/nativa y su recuperación;
  el HOST no acredita pruebas ZK, hardware ni caída abrupta del backend.
- **MetaMorpho underlying:** `55c443f`/`e8cda88` conectan backend, SDK y
  custodia móvil; `d06f2e0` añade recorridos de uno y cuatro destinos. Tras
  W39 de shares, cada salida exige autorización propia para aprobación y
  redención, journal anterior al envío y conciliación del mismo trabajo
  ante respuesta perdida y reapertura ordenada. Mantiene las 14/20 relaciones
  y ventanas originales. Guards, imports y TypeScript pasan; faltan ambas
  ejecuciones financieras. El underlying al holder es público: no crea saldo
  privado disponible.
- **Aave móvil:** `d2b593db…` terminó rechazado después de la redención real:
  catorce pruebas y saldo de shares 100→0, pero falló la observación W39 tras
  reabrir. `9883f3b` corrige esa lectura: devuelve una observación canónica
  fresca separada del receipt confirmado, conservando los mismos checks,
  job, prueba, nullifier y journal histórico. La regresión SDK/backend pasa;
  falta repetir el recorrido financiero con esta corrección. `b8196b4` conecta
  además SOURCE V3 antes de financiar y conserva dos aperturas de la misma
  pareja/operación después de caídas. Su regresión SDK pasa en 238 ms;
  no crea otros trabajos ni autoriza envíos al observar. `c5004783…`
  conserva su rechazo anterior; el plazo original permanece sin cambios.
- **SPL desde SOURCE original:** `2bc13a3` fija el nuevo receptor antes de
  financiar; `c1d786e` ejecuta SOURCE original antes de capturar, envolver y
  cotizar el ingreso SPL para la nota raíz del dispositivo. La entrega se
  registra antes del efecto y la observación concilia la misma operación.
  Sus dos HOST pasan en 752 ms; no acreditan entrega o crédito económicos.
  `87bbf99` conecta el recorrido financiero de 16 pruebas originales:
  doce para SOURCE y cuatro para D27/CI51/W39/CO42 en el destino SPL,
  sin mezclar sus recibos ni repetir efectos al observar. El guard focal pasa
  en 72 ms y el preflight de los artefactos originales pasa; falta su ejecución
  financiera. Los gates históricos SOL/SPL siguen cerrados.
- **Cloud local:** `0e10885` conecta captura ordenada y reapertura del mismo
  gateway privado V3, ya ligado al actor, executor y bridges antes de financiar.
  Drena el trabajo HTTP antes de capturar las diez secciones originales;
  la reapertura exige el mismo SQL, schema, clave y checkpoint y permite
  observación sin otro envío. Pasan los HOST de captura/reapertura y adaptador
  fijo. El executor genérico V1 sigue sin ligar; no sustituye este gateway V3.
  No hay proyecto GCP, despliegue ni aceptación de caída abrupta.
- **APK:** la última compilación terminada es `118fc7c7…`, 43.429.187 bytes,
  128 inputs iguales antes/después, 36 uniones originales y otras 12 del
  corte Paged/RootNote comprobadas en el bundle,
  sin Metro. Incluye la copia y restauración Paged de `af0d40a`.
  Incluye el holder DeFi original de `cbd7b0b` y la espera del resultado
  autorizado de `d56cd88`. La prueba física continúa prevista para el final.

El criterio **4.5 sube de 50 a 75**, y el punto 4 de 70 a 75. Las otras 34
notas no cambian: **65 / 45 / 70 / 75 / 70 / 80 / 65**.
Uniswap amplía el ámbito móvil acreditado de criterios que ya tenían 75;
no completa por sí solo las siete redes, la privacidad sistémica o la
recuperación abrupta. Los apartados históricos siguientes conservan la
evidencia de sus respectivos cortes, no sustituyen este estado actual.

## Objetivos originales del producto

Los objetivos son los de [PROJECT-VISION.md](PROJECT-VISION.md). Las seis tareas
pedidas para avanzar eran un orden de ejecución; no sustituyen estos puntos.
Las cifras se recalcularon el 9 de octubre sobre el código de `22a0069` y sus
resultados conservados. Se conservan los 35 criterios y su cálculo. La revisión anterior elevó 2.4
de 0 a 25 por la protección parcial del observador SQL. Este corte eleva 4.5
de 50 a 75 por la pérdida irreversible del proveedor y el reembolso completo
acreditados en NativeSQL; las otras 34 notas conservan su valoración anterior. Cada objetivo tiene cinco requisitos de igual peso;
la media de sus notas 0/25/50/75/100 produce la estimación de cobertura funcional.
El [desglose por requisito](docs/PROGRESS-ASSESSMENT.md) explica la implementación,
evidencia, límites y cálculo de cada cifra. El código conectado pendiente de
integración cuenta como implementación; no se convierte en aceptación financiera.
Las notas son estimaciones técnicas, no porcentajes de esfuerzo o tiempo restante.
Los rangos anteriores carecían de este desglose y no sirven para medir el avance
de una sesión. No se puntúa por cantidad de commits ni de pruebas. La privacidad
sistémica sigue sin acreditarse; las aceptaciones locales conservan su alcance.

| Punto original | Estimación recalculada | Avance comprobado y pendiente principal |
| --- | --- | --- |
| 1. Wallet unificada para siete redes | 65% | Web EVM y SDK con owners originales Linux aceptados. Custodia raíz móvil, backup y firmas implementados; D26 de clave propia aceptado en Node/TLS. U/S, ejecución nativa, F y W39 tienen reinicio ordenado EVM9 aceptado en Node/TLS; teléfono y pérdida abrupta pendientes. La nota ERC20 propia aceptó D26/W39, dos envíos y reapertura ordenada en otro PID, sin efectos nuevos al observar. Último APK128/36 compilado sin Metro, incluida la copia Paged; uso físico al final. Teléfono, pérdida abrupta y siete redes pendientes. |
| 2. Privacidad por defecto | 45% | READ autenticado, copia RootNote cifrada y SQL con HMAC por propietario/request que cambia el seudónimo entre solicitudes; redacción legacy integrada sin renovar permisos. El criterio 2.4 sube a 25 sólo por protección parcial de nuevas copias SQL sin clave API. Cadena/RPC/red, tiempos, rutas, colusión con API, copias antiguas y authKey histórico siguen pendientes. |
| 3. PAEG genérico | 70% | BTC/SOL, Uniswap, Aave y Meta desde reserva privada aceptados con el mismo núcleo. Paged V3 ya elimina la cota global de cuatro slots con páginas de hasta 64 nodos y cinco relaciones reutilizables; falta aceptar su ejecución económica y ampliar la cobertura de tamaños, redes y privacidad entre operadores. |
| 4. Liquidación y recuperación económica | 75% | Reconciliación/F desde DOM y T/EXIT/pago al solver de Uniswap aceptados. Meta15, Uniswap F y el reinicio ordenado EVM9 están aceptados; MetaMorpho F1 acepta mint irreversible, F y tres W39 en el perfil local controlado, sin duplicados ni pérdida neta del solver acreditada. Meta y Aave reabren sus backends originales después de EXIT/redención; LIVE_ARMED aceptó conservar la misma reserva/ARM en otro PID antes del cutoff. La reorganización F quedó aceptada con nueve pruebas y ambas retiradas. El timeout del keeper se comprobó con reloj controlado y el cutoff original, sin esperar ocho horas. NativeSQL9 acepta entrega irreversible, F, ambas W39, mismo backend/SQL en otro PID y pérdida del proveedor más gas bajo consentimiento explícito. Quedan generalidad, insolvencia, liquidez adversa, pérdida abrupta de keeper/nodos/custodia y fallos combinados. |
| 5. DeFi privado real | 70% | Uniswap desde reserva privada aceptado: PAEG, swap, T, EXIT y replay sin efecto duplicado. Aave y Meta15 privados también aceptados; Meta y Aave aceptan backend retenido en otro PID y dos READ cada uno; Uniswap F y MetaMorpho F1 aceptados en sus perfiles controlados; faltan más acciones Morpho, crédito privado Jupiter y mayor cobertura de posiciones. |
| 6. Estado privado global | 80% | Journals y reconciliación originales; SDK vinculado aceptado con saldo privado 500→0. READ de cambio/recuperación y reapertura D26 implementadas; EVM9 aceptado con cinco lecturas firmadas, disponible final cero y reapertura ordenada. Dos READ por protocolo y reapertura Meta/Aave aceptadas. La unión privada por activo y dominio está conectada al backend/wallet y a las vistas móviles originales; persiste checkpoints cifrados y reabre STALE hasta nueva observación, sin crédito por valoración. HOST/CAS/TSC pasaron; native/wrapped ya se conectan a sus sesiones originales y capturan el mismo checkpoint cifrado. La actividad original BTC/SOL ya se muestra y Conciliar usa su ruta original; el journal compara estructura sin falsos cambios por orden JSON. El ancla nace antes de financiar y conserva credenciales y checkpoints confirmado/pendiente; su reapertura rechaza revisiones ajenas y permanece STALE/UNKNOWN. La restauración SOURCE y GRAPH ya está conectada y tiene pruebas focales de almacenamiento/custodia; falta aceptar su recuperación económica completa ante caída abrupta y pérdida de custodia. |
| 7. Redes heterogéneas en profundidad | 65% | BTC/SOL combinado aceptado localmente. Claims9 aceptó el perfil local de ocho pruebas y su cierre original; Claims8 conserva su rechazo histórico. Factory Tron aceptado; una entrega V5 observada, con inventario y crédito/GRAPH pendientes. Jupiter tiene un swap público aceptado y SBF compilado oficialmente, sin aceptación del crédito privado completo; faltan Base, Arbitrum y BNB propios. |
| 8. Agente autónomo personal | Fuera del alcance | Lo implementa Rafa sobre las interfaces generales del producto. |

Ningún objetivo original está al 100%. La base de desarrollo y el defecto de
`reconcile()` sí están implementados y comprobados; son tareas cerradas dentro
del producto, no los puntos 1 y 2 de la visión. Los requisitos transversales
siguen vigentes: mantenibilidad, generalidad, confianza minimizada, privacidad,
revisión criptográfica independiente y rendimiento.

Google Cloud se prepara **sólo localmente**, según la decisión del usuario:
no hay proyecto, despliegue, `apply` ni recursos creados. La prueba del teléfono
queda para el final. Estas decisiones no eliminan la arquitectura objetivo.
La réplica API/SQL está preparada; V1 conserva ejecutor desconectado y readiness
503. Falta vincular cada solicitud con la cuenta y el consentimiento económicos
originales emitidos antes del job. La admisión SQL no crea esa autoridad. La
consulta móvil de posiciones Linux tampoco concede gasto: las acciones ERC20 y
shares requieren sus productores originales antes de financiar. La nota fuente
ERC20 del dispositivo ya tiene ese productor y un recorrido local aceptado;
la autoridad de shares/posiciones DeFi propias sigue pendiente.

## Corte histórico: continuación previa del 10 de octubre

El alcance de PROJECT-VISION.md y EXCLUSIONS.md permanece intacto. Este corte
distingue las funciones conectadas de la aceptación de sus recorridos reales;
las cifras de la tabla anterior no se han vuelto a calcular en este corte.

- **Privacidad del dispositivo:** D27 y U ya viajan cifrados desde el SDK al
  receptor original de un solo uso. U devuelve los paquetes de rol cifrados al
  mismo cliente. Las pruebas cortas de ambos SDK/receptores pasan. El fallo de
  importaciones que bloqueó el nuevo D27 quedó corregido y su cierre físico
  pasa; sus RAW anteriores conservan el rechazo. D26 y W39 también tienen
  intake cifrado integrado (`1fa6645`) y sus cinco variantes SDK pasan en
  488 ms. El segundo salto hacia PC23 usa un worker fijo nuevo (`5afdaf0`):
  dos IPC reales, corrupción y desconexión pasan en 389 ms. La composición
  financiera espera corregir tres rutas físicas del worker; no se ha aceptado
  todavía una prueba financiera de este corte.
- **PAEG desde el dispositivo:** el servicio de dos a cuatro destinos SHARE
  está conectado (`492d2b4`). Crea targets y credenciales de proveedor antes de
  financiar y activa cada slot sólo tras su D27 original. DAG, facturas,
  cuotas y riesgos usan el mismo U/S y keeper. El caso HOST de dos y cuatro
  slots pasa en 1,88 s; el recorrido financiero de cuatro entregas está en
  preparación. No incorpora todavía captura multigrafo ni combinación Blue.
- **Morpho Blue:** entrada en posición original, contabilidad en shares, salida
  manual con consentimiento nuevo, journaling anterior al envío y reapertura
  observable están conectados a backend y móvil. Pasan 11 pruebas cortas y el
  typecheck móvil. El driver financiero propio está integrado; sus 14 pruebas,
  redención y recuperación reales siguen pendientes. El intento propio falló
  durante preparación con cero pruebas: faltaban sus rutas fijas en el registro
  y el emisor de recuperación. `bf5e9fd` corrige ambas y su regresión pasa en
  251 ms, conservando la marca original del receiver.
- **SQL y recuperación:** el operador duradero tiene captura F de diez
  secciones y reapertura con verificación previa de schema y clave SQL. La
  clave incorrecta no consume el checkpoint económico. Las comprobaciones SQL
  y de instalación originales pasan; falta la ejecución financiera nativa con
  SQL. La captura planificada no demuestra recuperación ante caída abrupta.
- **Base y Arbitrum:** observadores y bootstrap reciben los clientes originales
  de nuevos perfiles económicos, fijados antes de genesis. Base arrancó ocho
  servicios saludables sobre Reth/Lighthouse propios, pero rechazó la finalidad
  al agotar su plazo; sus nueve contenedores quedaron cerrados. Nitro tiene
  imágenes originales preparadas para el perfil económico. Custodia y envío
  único de Nitro están integrados (`ec1971b`); el caso HOST de AES/CAS/firma
  pasa en 2,12 s. Base incorpora su comprobación propia de comisiones L1/L2 y
  operador antes de KEY/SEND (`6db27b0`); el caso HOST pasa en 3,95 s.
  El primer nacimiento económico de Nitro quedó atascado por génesis de
  ejecución distintos entre Prysm y Geth y se cerró con su proceso original.
  `1459848` comparte la salida del generador oficial; nueve casos de receta
  pasan. El nuevo intento cerró con `ARBITRUM_ORIGINAL_INITIALIZATION_FAILED`,
  cuya causa está en revisión; no hay contenedores Nitro ejecutándose ni
  crédito privado establecido.
- **Composición:** la última publicación validada (`bbbf8c1`) tiene 844
  fuentes y 12 roles. Tras los nuevos cortes, `8463bb5` revisa 143 filas
  literales de las tres cápsulas móviles. Falta publicar la composición
  completa después de corregir las rutas del worker PC23. La compilación W39
  conserva sus 45 fuentes originales; las publicaciones no declaran aceptación
  financiera.

El APK anterior sigue descrito abajo como evidencia de su corte; deberá
recompilarse tras incorporar las nuevas rutas móviles. La prueba física queda
para el final. Google Cloud continúa limitado a preparación local.

## Avance funcional de este turno

Los siete objetivos continúan activos. Estos cambios están implementados y
comprobados en los ámbitos indicados; se conservan las notas por requisito.

| Función entregada | Código y evidencia | Límite vigente |
| --- | --- | --- |
| Copia recuperable de RootNote sin mostrar la raíz | `d880d18`: contraseña, ciphertext, binding rootId y cancelación; 8/8 focales de custodia y saldos en 4,436 s, copia de identidad y tipos aprobados. | Los puertos HOST no acreditan hardware; la prueba física queda para el final. |
| Estado común después de ejecución y W39 | `0dbdeed`: publica la lectura original del vault; conserva invalidación previa, UNKNOWN y revocación. Incluido en el APK actual. | No crea disponibilidad sin READ original ni acepta el GRAPH pendiente. |
| Privacidad de intake SQL nuevo y legacy | HMAC por operación y clave estable separada; `afbd9c3` convierte un grupo legacy explícito y `3ed9157` rechaza una marca privada con datos visibles. Los dos casos PostgreSQL focales pasan en 7,25 s, incluido COMMIT perdido. | API, backups/WAL y otros grupos conservan sus exposiciones; no implica anonimato del sistema. |
| Costes observados de salida DeFi | `b8ab225`: la wallet presenta gas histórico en NATIVE_WEI sin identificadores de operación; conserva importes y mínimos originales. | No convierte gas en shares ni acredita solvencia o pérdida neta completa. |
| Recuperación del journal retenido | `3a0aaeb`: reabre el candidato original tras perder readback, conserva la misma operación y reconcilia sin otro envío; 6/6 HOST focales de EXIT/privacidad/reapertura en 9,95 s. | No sustituye la aceptación financiera SOURCE/GRAPH ni demuestra caída abrupta del producto completo. |
| APK Android de ese corte anterior | SHA256 `bdc836079db34161a793fcc0f383351890e3b79ddfee421c74f5148b4be2dbaf`, 42.841.007 bytes, 85 inputs iguales antes/después, 36 uniones con bundle y sin Metro. | Instalación, biometría y operación física pendientes al final. |
| Transacción conservada tras respuesta perdida | `a7b5434`: guarda la identidad del envío original en el journal; 23/23 HOST pasan en 0,915 s. | No acredita por sí solo el reinicio financiero completo ni autoriza otro envío. |
| Observación original de GRAPH fresca | `c2a9e06`: al conciliar T observa el original S; un HOST SDK/Vault pasa en 2,68 s. | GRAPH completo nuevo aún pendiente de cierre. |
| Primer permiso SOURCE por TLS | `6951b88`: framing UTF-8 explícito; primer challenge del SDK original sobre HTTPS pasa en 2,73 s. SOURCE nuevo recorrió D26 y la primera caída17. | Falló la reapertura avanzada; no acredita las dos caídas ni el recorrido completo. |
| Retirada admitida con respuesta original | `f8961f4`: espera el resultado del job admitido sin reutilizar el permiso; un HOST pasa en 2,765 s. GRAPH1159 recorrió la respuesta perdida de W39 y su conciliación. | Lease original de15 s y guards intactos; el recorrido completo sigue rechazado. |
| Causa privada de apertura y cleanup | `b13eb68`: conserva tipos/códigos/frames anidados con límites y sin payloads; 8/8 HOST, 0,289 s. | La causa primaria del SOURCE rechazado anterior ya se descartó; no se reconstruye ni se acredita reapertura. |
| Preparación BSC propia | `67424cf`: materiales, herramientas oficiales y 17 contratos preparados/compilados. | La comprobación RPC nativa terminó rechazada: sin finalidad, crédito privado ni wallet BSC aceptados. |
| Claims privados en el estado común | `26beac3`: carteras originales y la misma sesión/keeper, unidades BTC/SPL separadas, HTTP de propietario y wallet; journal AES/CAS reabre STALE. Un HOST pasó en 5,961 s, incluyendo custodia desconocida y operaciones pendientes. | Consenso y custodia inferiores son puertos HOST explícitos; no acepta el ingreso SPL ni nuevas redes. |
| Captura del backend GRAPH | `7d4164c`: exige el token activo de la misma autoridad sin relajar el guard de reposo general; un HOST pasó en 0,242 s. | Corrige el fallo observado en GRAPH `0b377a85…`; falta aceptar captura/reapertura integradas. |
| Sesión original al reabrir SOURCE | `e50079e`: devuelve la sesión del contenedor original para recuperar la autorización y cerrar el recurso correcto; un HOST pasó en 0,074 s. | No modifica las fuentes fijadas de un realm anterior ni acredita recuperación económica completa. |
| Testigo rechazado y capacidades de recibos | `97ddc90` limpia la copia normalizada rechazada; `d9e2aac` separa secretos en preparación, envelope y worker. HOST de aislamiento y ambos consumidores pasan en 0,108/0,164/0,181 s. | Se mantienen byte a byte las 45 fuentes originales W39; no implica anonimato ni aislamiento entre operadores. |
| Sello actual de fuentes | `bfba59b`: productor original y verificación física de 833 fuentes y doce roles; cierre `9d9f2034…`. | Conserva los indicadores de aceptación financiera/custodia/GRAPH desactivados. |

La privacidad HOST pasó 5/5 y Cloud 6/6 pruebas con proveedor simulado. Cloud
continúa sólo local y la API V1 conserva readiness 503 sin puente económico.
La suite SQL completa anterior dio 20/22: falló el caso previo de lock de
migración y su prueba padre. El último corte ejecutó exclusivamente los dos
casos legacy; no repitió esa suite ni amplió ningún timeout.

GRAPH14 `edea8e13-4154-471e-8a1f-a7d062002478` terminó **rechazado al conciliar**
tras 12/14 pruebas, con cleanup/lock confirmados. El
backend tenía T cumplido, pero devolvía la cabeza antigua de S y el SDK rechazaba
la respuesta por falta de frescura; no fue un rechazo esperado de replay.
`c2a9e06` corrige esa observación conservando el guard del SDK. El siguiente GRAPH
`f7acea63…` terminó **rechazado** con 14 pruebas: superó RECONCILE_GRAPH,
la W39 de shares y la prueba W39 de cambio, pero falló después en la aserción
de respuesta perdida del envío de cambio. No alcanzó restauración ni reapertura
del backend. Sus fuentes permanecen intactas, cleanup sin errores y lock
liberado; no acepta el recorrido completo. `f8961f4` corrige la espera del
resultado original de retirada admitida; el permiso de15 s y sus guards quedan
intactos. GRAPH `1159c12e…` terminó **rechazado** con 14 pruebas: recorrió
respuesta perdida de W39, restauración software de SOURCE/SHARE/PoP y READ
original de ambas notas gastadas confirmadas, sin otra prueba ni envío financiero.
Falló después al comparar un contador anterior al replay HTTP403 esperado,
antes de capturar las cuatro secciones originales; no alcanzó reapertura del
backend. `56f8212` corrige sólo ese contador y pasa un HOST en 2,621 s. No se
repite la financiación por ese defecto de prueba ni se reclasifica el RAW.
Todos los grupos financieros y locks están cerrados/liberados; no quedó una
autoridad capturada para reabrir ese realm cerrado.

GRAPH `0b377a85-3a0b-49c8-998f-d9a680fe8cde` recorrió las 14 pruebas,
retiradas, respuesta perdida, replay HTTP403, restauración software de custodia
y READ de ambas notas gastadas. Llegó al guardado de las cuatro secciones del
backend y rechazó el primer guard de cuenta: pedía reposo mientras su token de
captura original estaba activo. `7d4164c` comprueba ese token y su autoridad sin
abrir la autoridad general durante captura. El RAW sigue rechazado, con fuentes
intactas y grupo/lock cerrados; no alcanzó un checkpoint completo ni reapertura.

SOURCE `9aced…` terminó **rechazado** con cero pruebas tras el nacimiento del
backend de diez secciones. Su transporte manual omitía Content-Length y enviaba
chunked, incompatible con el framing estricto del servidor original. `6951b88`
lo corrige y pasa el primer challenge TLS/SDK. SOURCE nuevo
`fcb65559-2a28-4aca-b02a-6305fe686d31` terminó **rechazado** con una prueba D26: financiación y
primera salida abrupta 17 recorridas, pero falló la reapertura avanzada del mismo
SOURCE. Su causa primaria se había descartado al sanear AggregateError, y no
es recuperable de esos errores guardados. El journal autenticado tiene diez
secciones, sin candidatos CAS ni mutaciones pendientes; no se atribuye el fallo
a framing ni a una espera de ocho horas. El cierre dirigido por identidad al
launcher original utilizó SIGTERM tras el worker fallido; el supervisor confirmó
cleanup del grupo, lock liberado y fuentes intactas. La interrupción conserva
el rechazo, sin alterar el RAW. El realm financiado y su locator se mantienen
para diagnóstico, sin nueva CREATE. `e1595e7` reconstruye sólo fuentes públicas
desde Git y verifica los 865 pins del nacimiento `df901c6`/cierre `a5033d37…`.
El OPEN diagnóstico usó esos bytes en un namespace aislado conservando UID1000;
superó la versión y alcanzó el actor. Rechazó el enlace porque la sección de
sesión devolvía su contenedor en vez de la sesión original, impidiendo encontrar
la autorización retenida y cerrar ese recurso. `e50079e` corrige el consumidor
para nacimientos nuevos; no fuerza la versión del realm antiguo. La limpieza
normal del diagnóstico falló y sus dos procesos restantes se terminaron por PID
y nacimiento verificados; no se atribuye cierre normal al resultado. El locator
y los pins se conservan. La clave y la raíz del antiguo padre no fueron
persistidas y no permiten continuar su campaña original. La causa del nuevo
OPEN no reconstruye la primaria descartada del primer intento. El locator
anterior `9aced…` también permanece byte a byte.

Evidencia actual: [APK e informe](.internal/dev/reports/mobile-android-standalone-local.json),
[backup nativo](.internal/dev/reports/all-objectives-native-backup-causal-fixture-current-d79742ae-cd90-4c93-82ec-16f53e327739/host.log),
[SQL focal](.internal/dev/drafts/all-objectives-legacy-redaction-focal-v1/RESULT.json) y
[EXIT retenido](.internal/dev/reports/all-objectives-defi-exit-privacy-and-source-focal-90cd3e90-bc0a-422d-99b4-f59f24417107/host.log),
[journal original](.internal/dev/reports/all-objectives-flat-execution-regression-37a6a646-4abe-4e79-a42a-4ce2936b0164/host.log),
[GRAPH fresco](.internal/dev/reports/all-objectives-original-graph-fresh-S-fixture-00001dc7-7a76-4d08-8b56-ea8ef22b72d7/host.log) y
[primer acceso SOURCE](.internal/dev/reports/all-objectives-source-first-access-TLS-original-fixture-a6721023-1f0c-4643-89b7-673c3089be99/host.log),
[espera de retirada](.internal/dev/reports/all-objectives-graph-output-withdraw-result-wait-focal-5b0c02fa-77ac-4f8d-8e7d-ab3bbd045978/host.log) y
[causas privadas](.internal/dev/reports/all-objectives-source-private-diagnostics-original-close-fixture-7d1992ab-4854-446e-b09f-9cd9477dd06f/host.log) y
[contador de replay HTTP](.internal/dev/reports/all-objectives-graph-original-explicit-replay-counter-focal-124ca4b5-44e8-438f-ae76-37c4bed115b3/host.log).

- **Conservar y recuperar la misma operación:** EVM9 acepta F y ambas W39 con
  diez secciones originales reabiertas en otro PID. LIVE_ARMED acepta D26/U/S,
  la misma reserva y autorización armada tras reinicio ordenado, con READ nueva
  y sin F antes del cutoff. No renueva permisos ni crea un efecto duplicado.
- **Notas y posiciones con procedencia propia:** la nota ERC20 del dispositivo
  acepta D26/W39 y reapertura de observación sobre los mismos trabajos. Meta/Aave
  reabren sus backends originales después de EXIT/redención; MetaMorpho F1 acepta
  mint irreversible y recuperación controlada, sin atribuir pérdida neta del solver.
- **Estado privado durable y utilizable:** backend y wallet reúnen originales
  por activo y dominio con checkpoint cifrado/CAS; al reabrir necesitan observar
  otra vez. La app muestra sólo respuestas de sus SDK autenticados, separa shares
  de valoración y conserva UNKNOWN/STALE sin ceros inventados. La actividad BTC/SOL
  ya aparece y Conciliar usa su ruta original; no hay permiso ni total global.

La reorganización F quedó aceptada: conserva UNKNOWN y ambos outputs bloqueados,
reabre el Vault, reconcilia la misma transacción y completa ambas W39 sin duplicar
el pago. El APK actualizado incluye el contrato corregido. El ancla privada de
observaciones conserva la escritura confirmada o su candidato original; reabre
STALE/UNKNOWN hasta consultar otra vez las fuentes.

El trabajo activo de los puntos 4 y 6 es aceptar la reapertura de las fuentes
originales tras una caída abrupta y conectar autorización/reserva ERC20 con
recepción y retirada de participaciones custodiadas por el dispositivo. La
regresión de timeout ya pasó con reloj controlado sobre tick, recovery, envío y
reconciliación originales: un efecto y observación del mismo envío tras respuesta
perdida. Conserva el cutoff original de 28.800 s; utiliza puertos de prueba y no
acredita una prueba criptográfica ni ejecución financiera adicionales. El usuario
prohibió las esperas reales de ocho horas; no se usan como requisito de cierre.
La cobertura completa de las siete redes sigue pendiente. El uso físico del
teléfono queda para el final.

## Qué puedes ejecutar hoy

Desde la raíz:

```sh
./dev start       # Wallet web; arranca desconectada
./dev test        # Selección habitual; no inicia los recorridos financieros
./dev check       # Integridad, tipos/ABI, diagnóstico Noir y HTTP
./dev doctor      # Herramientas, originales y bloqueos por separado
./dev artifacts  # Faltantes históricos de la selección de encoding
```

La wallet web no inventa saldo al arrancar. Cada integración tiene preparación propia:

- [Laboratorio EVM](docs/EVM-LAB.md): build nuevo y recorrido con pruebas reales.
- [Móvil](apps/mobile/README.md): instalación, contratos, tipos y bundles Android/iOS.
- [API y PostgreSQL](services/api-server/README.md): réplica Docker y pruebas con base real.
- [Google Cloud](infra/google-cloud/README.md): validación y seis tests simulados, sin credenciales.
- [Redes y DeFi](packages/backend/docs/LOCAL-ACCEPTANCE.md): alcance de cada aceptación.

## Evidencia funcional y límites del corte

Las aceptaciones siguientes corresponden a laboratorios locales y a sus
originales. No acreditan redes públicas, teléfono ni el producto completo.
La evaluación por requisito del 9 de octubre reconoce la implementación y
distingue su alcance comprobado. Un HOST puede acreditar almacenamiento o
custodia; no acredita por sí solo liquidación económica. Commits y bundles
no añaden puntos por cantidad.

**Wallet, recuperación y saldo.** La wallet web EVM conserva su aceptación de
quince pruebas y la recuperación desde DOM pasó por separado con siete. El
SDK vinculado aceptó saldo privado 500→0. EVM9 `f36e603b` aceptó nueve relaciones
originales, una entrega nativa, ambas W39 y cinco READ firmadas con disponible
final cero. Reabrió las diez secciones AEAD originales en otro PID, con el mismo
S/F y sin efecto duplicado: 435,965 s de worker, 437,895 s de supervisor y 33
procesos ausentes, fuentes intactas, cleanup y lock liberados, sin señales.
La captura es ordenada y el Vault móvil permanece en el padre; caída abrupta
y operación financiera del teléfono siguen pendientes. [Alcance EVM](docs/EVM-LAB.md).

El saldo de notas exige permiso READ propio, activo/dominio exactos, PC23,
nullifiers y cabeza fresca. Recovery permanece bloqueada sin F; perder frescura,
reabrir custodia o quedar UNKNOWN deja el disponible desconocido. Un cero tras
W39 exige nullifier gastado fresco y receipt local confirmado. La app conserva
la operación cifrada, consulta el D26 original antes de preparar y reabre los
mismos trabajos sin nueva financiación, prueba o envío. La raíz y las claves
de nota permanecen locales; la apertura consentida se revela al worker.
[Cuenta original](docs/ORIGINAL-ACCOUNT-V2.md).

La unión privada de estado conserva procedencia, activo y dominio completos;
separa notas, reservas y trabajos pendientes de shares y valoración. Backend y
wallet consumen la capacidad original; su checkpoint y credenciales se capturan
en la misma sección del wallet retenido. Al reabrir no publica saldo fresco
hasta observar los originales. El HOST de Vault/CAS, HTTP y consumidor real
pasó (4.414,525564 ms); el estado móvil combina sólo respuestas de tres SDK
autenticados con sus permisos separados y revoca frescura al caducar o cerrar.
No crea un permiso global ni un total entre redes. Native/wrapped ya instalan
la capacidad desde sus sesiones originales antes de listener/efectos y capturan
el mismo checkpoint en su sección privada: pasó un HOST con sesiones originales
(11.870 ms; `c0cea06`, callers `e9562c2` y entrada local `9efd7b2`). La wallet ya muestra la actividad nativa original y Conciliar usa la ruta correcta;
el journal compara la estructura original sin falsos cambios por orden JSON
(`953448f`, HOST AEAD/CAS; `65cee51`, HOST del consumidor). La aceptación
de observaciones ya conserva un ancla cifrada con las credenciales originales
antes de financiar y dos checkpoints fijados. El caso de sesión/Vault real
aceptó respuesta de escritura perdida, candidato no escrito y rechazo de una
tercera revisión (26.313,361 ms; `22a1b9e`). Esta aceptación restaura observaciones
sobre fuentes originales ya restauradas; la restauración abrupta de esas fuentes
sigue en implementación.

**Posiciones DeFi desde móvil.** La pestaña Posiciones DeFi, SDK y servicio TLS
original están implementados. Dos permisos específicos separan la revelación
de posiciones de su lectura fresca; no reutilizan el permiso de saldo nativo.
El backend exige el mismo catálogo, sesión, vault y cabeza originales. UNKNOWN,
STALE o datos caducados muestran No disponible; la estimación del subyacente
no crea saldo gastable y los activos se muestran por separado. La custodia de
estas posiciones permanece en el backend Linux original: no se adopta una
cuenta ERC20 como nota móvil. Pasaron los cuatro HOST de procedencia, permisos,
cabeza, incertidumbre y TLS/SDK, los dos de instalación/cierre de la cartera y
TSC móvil. Meta y Aave aceptaron dos lecturas originales por protocolo tras mint y redención,
con las mismas quince pruebas y sin efectos financieros nuevos por las lecturas.
Cerraron READ antes de capturar cinco secciones originales y reabrir cada backend en
otro PID. La custodia sigue en el backend Linux; no acredita teléfono, caída
abrupta ni recuperación de GRAPH.

**Nota ERC20 propia del dispositivo.** El recorrido original `da603751` está
aceptado: D26 y salida íntegra W39, dos pruebas, dos envíos y dos receipts,
backing 500→0 unidades atómicas y delta exacto del destinatario. Perdió las
respuestas de financiación y salida, reconcilió los mismos trabajos y rechazó
duplicados sin reenviar. Cuenta, Vault local, destinatario y permiso propio nacen
antes de financiar, sin adoptar custodia Linux ni fabricar reserva S.
Capturó cuatro secciones originales y reabrió el backend en otro PID sólo para
observación, conservando raíz/notas/trabajos y sin prueba ni envío adicionales.
Worker 146,207 s; supervisor 148,098 s. Siete procesos ausentes, fuentes intactas,
cleanup y lock liberados, sin señales. No acepta teléfono, caída abrupta,
salida del padre, GRAPH ni operación pública. Los rechazos `c9ca1b34` y anteriores
permanecen conservados.
[Resultado original](.internal/runtime/omnichain-flat-profile/flat-wallet/.local/device-external-flat-ordered-observation-v1/attempt-da603751-cafa-4cfa-913e-87e846fe0050/result.json).

La [entrada local ERC20](services/api-server/docs/DEVICE-ERC20-LOCAL.md) crea un realm
nuevo y la cuenta original antes de aprobar exactamente el importe del operador
y abrir TLS. No genera claves del usuario ni prueba o financia la nota al arrancar.
Su HOST de adquisición, cancelación y cierre pasó (110,679 ms; `1fd5ae0`);
la captura/reapertura usa una entrada separada y los productores originales.

**Android histórico.** El APK `d07f578f` está compilado y archivado para su corte: 42.643.195 bytes, 79 inputs iguales antes/después y 36 joins,
Hermes y firma Android Debug/V2 comprobados, sin Metro. Diez procesos propios
están ausentes; el informe original conserva cero señales y el archivo fuerte
incluye su origen. No acredita instalación, biometría, SecureStore ni operación
financiera física. Incluye el protocolo compartido y el SDK corregidos para
ambos outputs bloqueados durante una reorganización. El APK anterior `e19ad1eb`
conserva su aceptación histórica.
Los APK previos conservan su alcance histórico; `6adc78c0`
permanece como preservación limitada, sin reclasificación.
[APK archivado de ese corte](.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/app-release.apk) ·
[informe original](.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/report.json) ·
[origen](.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/origin.json) ·
[uso móvil](apps/mobile/README.md).

## Redes y DeFi: cobertura funcional actual

| Red | Funcional comprobado | Cierre pendiente o límite |
| --- | --- | --- |
| Ethereum / EVM local | Wallet/SDK, grafo y liquidación originales; EVM9 acepta reinicio ordenado de diez secciones en otro PID. | Teléfono, caída abrupta, infraestructura independiente y operación pública. |
| Bitcoin | Grafo combinado BTC/SOL con dieciséis pruebas y dos redenciones BTC sin duplicados; Claims9 aceptó el perfil local de ocho pruebas y su cierre original. | Operación pública e infraestructura independiente. |
| Solana | Entrega SOL en el grafo combinado; Jupiter completó un swap público con una firma y un envío. | El enlace privado SPL USDC completo no está aceptado; principal USDC6 y comisión SOL9 separados. |
| Tron | Fábrica original aceptada y entregas nativas observadas en recorridos conservados. | Wallet/GRAPH, inventario, I84 y crédito privado pendientes; auditoría conserva su único plazo de 30 s. |
| Base, Arbitrum y BNB | Sin recorrido propio aceptado. | Stacks, finalidad y recorridos originales comprobados para cada red. |

| Protocolo | Funcional comprobado | Cierre pendiente o límite |
| --- | --- | --- |
| Uniswap V3 | Quince pruebas: reserva, swap oficial, T, EXIT, pago al solver y replay sin duplicados. F10 acepta swap irreversible, refund y salida privada con pérdida del solver, sin T. | Ampliar acciones, posiciones y fallos combinados. |
| Aave V3 / Static | Quince pruebas, doce verificadores, rendimiento y redención reales; previewRedeem/maxRedeem y shares del mismo bloque. EXIT/redención, dos READ y backend retenido reabierto en otro PID aceptados sin envío nuevo. | Recuperación del backend retenido ante pérdida abrupta, salida del padre y teléfono no aceptados; ampliar posiciones y fallos. |
| MetaMorpho | Meta15 ordinario y Meta19 retenido aceptados: quince pruebas, EXIT/redención, dos READ y backend en otro PID sin envío nuevo. F1 acepta mint irreversible, recuperación y tres W39 con diez pruebas, sin duplicados. | Recuperación del backend retenido ante pérdida abrupta, salida del padre y teléfono no aceptados; F1 no acredita pérdida neta del solver ni reloj real autónomo. |
| Jupiter / SPL USDC | Swap público original y materiales oficiales compilados. Ingreso fuente y subpasos GRAPH ejecutados en intentos conservados. | Falta aceptar ingreso privado destino y el crédito conjunto; el swap público no acredita ese ingreso. |

Meta/Aave conservan TOP_UP→EXIT sobre la misma cuenta/preparación creada antes
de financiar; GRAPH mantiene su autoridad separada. Meta19 `8c4c6bad` aceptó
quince relaciones originales, EXIT/redención, dos lecturas SDK y captura de
cinco secciones originales cerradas. Reabrió el backend y catálogo en otro PID,
con la misma referencia, receipt e identidad de EXIT y sin envío nuevo: 79→79.
Sus 45 procesos están ausentes; fuentes, cleanup y lock confirmados, sin señales.
La reapertura conserva el cierre de nuevas admisiones y no permite adoptar una
cuenta por ID/snapshot. Aave `4fbd29a9` aceptó el mismo ámbito original: quince
pruebas, dos READ, cinco secciones cerradas y reapertura en otro PID, con
referencia, receipt e identidad de EXIT conservados y envíos 93→93. Sus 45
procesos están ausentes, con fuentes, cleanup y lock confirmados y sin señales.
La recuperación del backend retenido ante pérdida abrupta, la salida del proceso
padre y el teléfono siguen fuera de ambas aceptaciones.

El formato ExternalDeFi V3 se autorizó antes de efectos y pasó tres HOST:
slot codificado de 48 MiB, metadata de 16 MiB, registro de 64 MiB y descompresión
real limitada a 128 MiB. Los formatos anteriores conservan sus límites. Las
aceptaciones retenidas Meta/Aave se añaden a sus recorridos ordinarios y no
reclasifican los rechazos anteriores.

MetaMorpho F1 `bdebe69a` está aceptado en el perfil local fijo: diez pruebas
originales, un mint irreversible, F y tres W39. Conservó receipt, inputs D27 y
cutoff originales, sin I/N/T, payout ni envío duplicado. La recuperación liberó
exactamente cuatro tags y aumentó una vez la secuencia global; las posiciones,
tokens y contabilidad Morpho permanecieron íntegros. Las tres salidas privadas
cerraron ambos pools sin duplicados. Completó en 526,683 s; sus 26 procesos
finales están ausentes, con fuentes, cleanup y lock confirmados, sin señales.
El destinatario original de shares también es el solver: el gasto de underlying
no acredita pérdida neta de riqueza. El recorrido usa el cutoff local controlado;
no acepta reloj real de ocho horas, recuperación abrupta, teléfono ni red pública.
La entrada revisada `a1a9587` conserva sus dos HOST antes/después del gate
(63,931/64,460 ms). [Proyección finita del resultado](.internal/dev/drafts/evm-metamorpho-original-f-terminal-v1/TERMINAL.json).

SPL29 `7b66e42a` cerró rechazado tras trece pruebas por la misma preparación
original caducada antes de `sendOnce`. La autorización pasó antes de clave a
los 22,493 s y auditó en 7,272 s bajo el plazo de 30 s. UNKNOWN y un intento
retenido no acreditan RPC ni finalidad. Sus 109 procesos están ausentes,
con fuentes, cleanup y lock confirmados, sin señales. No se atribuye mejora
financiera al cambio de retenciones ni se repite el envío incierto.

Claims9 `7ec7b903` aceptó el perfil local fijo de ocho pruebas BTC/SOL:
resultado de recursos completado, worker y supervisor con salida cero y
205 identidades de proceso ausentes, con fuentes, cleanup y lock confirmados,
sin señales. Usa el monitor original nuevo; Claims8 conserva su raw rechazado.
La proyección finita del resultado detallado se conserva por separado; esta
aceptación local no acredita redes públicas.

Tron13 `7b78ee47` conserva raw REJECTED tras cinco pruebas y una entrega nativa
observada. La primera incertidumbre posterior a clave conserva como causa la
auditoría completa de 35,152 s frente al único plazo original de 30 s:
current 1,537 s, store 11,462 s y native 21,595 s, con 442 lecturas nativas,
cuatro observaciones, 29 comprobaciones, 18 cargas y seis commits. Sus 18
procesos están ausentes, con fuentes, cleanup y lock confirmados, sin señales.
El stdout acotado retuvo los mismos 1.005.377 bytes observados, sin truncar;
la retención corregida no resuelve el guard temporal ni acepta economía.
UNKNOWN conserva el mismo envío y no autoriza retransmitir. No hay resolución
financiera medida ni reclasificación de rechazos previos; no se repite este
recorrido sin un cambio causal nuevo.

**Entrada del operador local.** NativeEconomicNote y executor nacen antes de
D26, con proveedores originales y tres bridges en un TLS privado. El arranque
prepara el ámbito y entrega el descriptor al operador; no financia ni prueba.
La entrada manual admite captura/reapertura ordenadas desde F ya confirmado,
sin cambiar sus términos de ocho horas ni el límite de autoridad de 90 minutos.
La entrada observada separada activa/desactiva la recuperación con permiso
fresco, guarda el latch antes del efecto y reconcilia el mismo trabajo ante
UNKNOWN. Pasaron seis HOST de control, el caso protegido móvil y TSC; falta
aceptar la recuperación autónoma tras ocho horas con servicio activo. El reloj
conserva los guards de 30 s y una espera exterior única de 120 s monotónicos.
No acredita caída abrupta ni captura post-ocho horas bajo Native10.
<!-- PENDING_LIVE_F: HOST/TSC no acreditan el recorrido autónomo de ocho horas. -->

**Rendimiento medido.** U nativa completó prove más verificación en 13,174 s
(15,939 s total), I84 en 7,750 s (19,246 s total) y D26 en 1,331 s (4,450 s
total), con las mismas ACIR/VK y cierre original antes de la verificación
independiente. Son medidas individuales, sin objetivos globales ni tiempos en
caliente demostrados. El límite agregado Node+BB de 3 GiB permanece. U16
conserva su rechazo por RSS; los objetivos originales <30/<20/<5 s siguen
pendientes en su alcance completo.

**Privacidad y servicio.** El historial flat/native-claims exige permiso READ
del mismo propietario y Origin exacto antes de consultar; las suites afectadas
pasaron. Las posiciones DeFi añaden sus dos dominios de permiso propios. La API
inicia desconectada, con readiness 503 y privatePortfolio desconocido; SQL
conserva permisos/idempotencia y no sustituye el ledger económico. Cloud sigue
preparado sólo localmente. La API ve identidad estable, importes y destinos y
el worker ve aperturas: privacidad sistémica, revisión criptográfica externa
y operadores independientes siguen pendientes. Claves y testigos quedan fuera
de Git. La publicación financiera `a62ec91` y su build cerrado conservan 819 módulos
y doce roles, con las 45 dependencias de compilación intactas. Incluyen formato V3,
servicio/SDK, posiciones, la nota ERC20, su Vault corregido y la entrada local.
El recorrido ERC20 `da603751` y LIVE_ARMED corto están aceptados en sus ámbitos
originales. F reorg `b4329b70` quedó aceptado con nueve pruebas. Meta y Aave
aceptaron su ámbito original; los rechazos
previos se conservan. Una publicación no acepta por sí sola un recorrido financiero
ni el teléfono.

### Recuperación aceptada y límites pendientes

LIVE_ARMED `b923b217` está aceptado en su recorrido corto: tres pruebas
originales D26/U/S y reinicio ordenado en otro PID, conservando la misma S,
autorización armada, Vault móvil, journal y provider. Diez secciones originales
cerraron antes de reabrir; una nueva READ firmada confirmó la misma ARM sin F
antes del cutoff. Completó en 177,822 s; veinte procesos ausentes, fuentes,
cleanup y lock confirmados, sin señales. No acredita F autónomo después de ocho
horas, pérdida abrupta ni teléfono. Los intentos anteriores quedan rechazados;
la causa RAW de `292a` no se reinterpreta a partir de la corrección.
[Resultado original LIVE_ARMED](.internal/runtime/omnichain-flat-profile/flat-wallet/.local/native-value-live-armed-recovery-v1/attempt-b923b217-9011-45ec-89bc-4c57f86da014/result.json).

F reorg `b4329b70-f553-4523-8d67-8e1ac1becded` quedó **aceptado** en
433,088 s con nueve pruebas originales. Después de la pérdida del bloque F,
el primer RECONCILE guardó UNKNOWN y ambos outputs permanecieron bloqueados.
El Vault se cerró y reabrió; la segunda reconciliación confirmó el mismo F
mediante una única reemisión de su wire original, sin nueva firma nativa,
permiso económico ni prueba de recuperación. Ambas W39 completaron la salida
de 400/100 sin doble pago. Cerró sus 25 procesos, con fuentes, cleanup y lock
confirmados y sin señales. El alcance de reorganización es el padre original
exacto de F; no acredita reorganizaciones más profundas ni redes públicas.
[Resultado original F reorg](.internal/runtime/omnichain-flat-profile/flat-wallet/.local/device-owner-original-f-reorg-v1/attempt-b4329b70-f553-4523-8d67-8e1ac1becded/result.json).

Los intentos `2cd62adb` (lectura de outputs), `49227ea0` (resumen incompleto
de alcance), `302d` y `9d6b` conservan sus rechazos originales. Las correcciones
posteriores no los reclasifican. La aceptación nueva no completa por sí sola
la pérdida abrupta de fuentes ni los objetivos originales 4/6.

Los resultados RAW anteriores se conservan sin reclasificar. La ausencia de
procesos o la corrección posterior no cambian un resultado rechazado. Para
cada aceptación siguen separados prueba original, efecto económico, reinicio
ordenado, cierre físico y límites de hardware/red pública.

## Artefactos y entorno

- El archivo original completo conserva 2.649 archivos con sus comprobaciones
  históricas. Git incluye 1.716; otras 933 referencias/paquetes/drafts públicos
  locales quedan excluidos explícitamente de CI.
- La reconstrucción inicial reprodujo 1.684 archivos del recorrido original.
  El código editable puede cambiar; el archivo histórico y sus pines no cambian.
- Faltan dos originales de encoding:
  `candidate-poseidon/.local/component/attempts/prove-2/public-inputs.json` y
  `flat-wallet/.local/contracts/2e02620a-404c-4c27-9ac2-4132713e083b/compiled.json`.
  `./dev artifacts` identifica sus consumidores y el hash conocido. No se
  regeneran como si fueran originales ni se omiten silenciosamente sus tests.
- También faltan programas/VK y evidencias públicas de releases históricas de
  claims. La compilación nueva CI51 V1 tiene recibos propios y conserva los
  componentes del programa original; no afirma igualdad con su VK histórica
  ausente ni acredita payout. El inventario de encoding
  tiene ese alcance; no certifica todas las
  integraciones posteriores. [El inventario de claims](packages/backend/docs/NATIVE-CLAIMS-ARTIFACTS.md)
  identifica familias, consumidores, hashes conocidos y la identidad del build nuevo.
- Para habilitar el release histórico EVM falta un raw original adicional:
  `.local/native-value-genuine-compilation/graph-only-source-v1/ledger/compiled.json`,
  SHA256 `f21b27105321ff027954ac5d0660b420c3028bf974a8f9a9e0c93db66c0a11a3`.
  Los otros 202 ficheros comprobados del release V4 coinciden. El desarrollo
  V5 y el recorrido SDK aceptado tienen un linaje separado; no sustituyen ese
  original ni activan los gates históricos.
- El laboratorio privado perdido no se recuperó. Las aceptaciones nuevas usan
  identidades, claves y estado nuevos.
- Los módulos heredados requieren `.internal/runtime/`, recursos compartidos y
  algunos experimentos. Los nuevos móvil/API/infra tienen dependencias explícitas
  fuera de esa compatibilidad.

La documentación de entrega anterior permanece en [archive](archive/README.md).
Sus porcentajes no constituyen una segunda evaluación actual. Los requisitos
de cierre son los siete objetivos originales de [PROJECT-VISION](PROJECT-VISION.md)
y el trabajo pendiente de [ROADMAP](ROADMAP.md).
