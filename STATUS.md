# Estado actual

## 19 de octubre, 02:01 Madrid — actualización V32 instalada; motor arrancando

La actualización autorizada está instalada con release
`6ba11ca4cac25c620ae8504e2e3cd092ad081eaa072278e699e153a7cbf12db4`.
El nuevo proceso arrancó a las **02:00:43 Madrid** (PID 223968, invocación
`68c138ab07d14bd28d26b49004e712fd`). La primera observación confirma el servicio
activo y los recursos de arranque verificados; **todavía no hay READY ni
validación pública de disponibilidad**. A las 02:02 la misma invocación conserva
2 de 21 etapas completadas y ningún fallo registrado; el primer informe de
consultas cuenta 47 RPC y 397 lecturas reutilizadas de 434 solicitudes de caché.
Estos contadores parciales no permiten estimar la duración total.

El cierre anterior terminó correctamente. La primera inspección del paquete
rechazó el journal de Uniswap de 74.037 bytes porque usaba el lector de
configuración limitado a 64 KiB. Se corrigió para usar el lector protegido y
el límite de 2 MiB que ya tiene Vault, conservando permisos, propietario,
prohibición de enlaces y comprobaciones del estado autenticado. La regresión
reproduce el fallo y pasa siete comprobaciones; `./dev check` también pasa sus
491 comprobaciones. La inspección real corregida
pasó y la instalación comprobó que todos los datos privados permanecían
idénticos. No hizo falta otro cierre del motor.

El paquete mantiene los recursos, contratos y la generación de código
`8cfdc73c4a9d703a0f795689fa5bdeb3161d34c1d4402130ac5c34be3f5efa68`;
respecto al paquete inicialmente preparado solo cambia ese inspector de
infraestructura. Se conservan el epoch financiero 13 y el vencimiento del
23 de noviembre. No se instaló la APK ni se enviaron nuevas operaciones
financieras de prueba durante este despliegue.

La unidad `lianum-engine-v32b-monitor` está activa en la VM: comprueba esta
invocación cada 30 segundos durante un máximo de seis horas y, al observar
READY, verifica las rutas públicas con TLS fijado y consultas sin firma.
Registra los fallos; no reinicia ni envía transacciones automáticamente.
Queda pendiente completar el arranque y la aceptación real desde el móvil.
Evidencia: `.local/maintenance/20261019-engine-v32-update/deployment-result.json`,
`capture-inspector-fix.json` y registros de instalación y seguimiento.

## 19 de octubre, 01:35 Madrid — actualización del motor V32 autorizada y lanzada

El usuario ha autorizado desplegar la actualización del motor. Se ha verificado
el paquete `c7ca33962d76e612c12b1e8c7286f12359336a8b7a5dec16d76a166b5c3e1f3e`
contra V27: 37 cambios del paquete y recursos criptográficos/contratos intactos.
La preparación remota y el preflight original pasan, sin RPC ni escrituras
financieras. Se han liberado 3,48 GiB de cuatro copias públicas de preparación
verificadas, sin referencias de servicios o procesos; se conservan las versiones
instaladas y los datos privados.

Se ha lanzado la unidad administrativa `lianum-engine-v32-update`: cierre
controlado, verificación de captura, instalación revisada y arranque normal.
La disponibilidad de la versión nueva todavía no está confirmada. El permiso
financiero conserva el epoch 13 y su vencimiento de noviembre; no se ha instalado
la APK V32 ni se han autorizado nuevas operaciones financieras por este despliegue.
Evidencia: `.local/maintenance/20261019-engine-v32-update/`.


## 19 de octubre, 01:14 Madrid — revisión local V32 completada; sin despliegue

Se han recorrido los flujos existentes, reproducido bloqueos y preparado sus
correcciones locales. La instrucción vigente es terminar la revisión y dejar
que el usuario decida si se despliega. En esta campaña no se han reiniciado
servicios, instalado otra APK ni emitido nuevas transacciones públicas. La
última consulta conserva el motor activo con PID 215679 e invocación
`4fa913a428f94dab8b111bb31c01cb2d`, iniciado a las 17:39:09 UTC.

**Resultado completo en redes locales:** Uniswap → ETH → BTC → SOL, con
las dependencias entre los cuatro movimientos, preparación y autorización del
plan, cierre, retirada del sobrante y cuatro cobros del ejecutor. Pasan las
21 pruebas criptográficas (20 Paged y una D27). El depósito de 600 unidades
sintéticas cuadra con 200 de sobrante y 400 de cobros; el saldo retenido y
respaldado de la cuenta del plan queda en cero. El token recibido por Uniswap
conserva 100 unidades privadas; su retirada no forma parte de esta integración.
Duración de la ejecución final: 680 segundos, incluido el cierre de recursos.
Esto no mide el arranque del motor público ni acredita ejecución desde Android.

| Recorrido | Evidencia alcanzada | Lo que sigue pendiente |
| --- | --- | --- |
| Recibir y enviar ETH, SOL y BTC | Los tres saldos y envíos propios ya estaban confirmados en el móvil y en las redes; pasan 48 regresiones nativas | Historial entrante y recuperación autónoma de ETH |
| Conectar y consultar una operación guardada | Corregidos la reconexión y el refresco que fallaban con el plan detenido y una retirada pendiente; cuatro regresiones pasan | Comprobar la nueva APK contra el servidor actualizado |
| Ingresar desde la cartera personal | La revisión confirma que la ruta actual paga desde el servidor | Implementar el ingreso personal; no equivale al patrocinio de prueba |
| Preparar y autorizar planes | 43 regresiones móviles, cuatro del recorrido público simulado y plan local completo | Nueva autorización pública después de resolver la retirada pendiente |
| Pagos PAEG, varios pagos, redes y dependencias | Integración local completa con EVM, Bitcoin y Solana | Confirmación pública desde el móvil |
| Uniswap | Intercambio local completo; preparación D27/W39 con criptografía real y recibos HOST | Intercambio y retirada públicos; retirada del token en la integración local |
| Invertir y retirar en Aave/Morpho | Pasan los recorridos de autoridad y SDK con pruebas criptográficas reales y cadena HOST; la consulta 403 está corregida localmente | Inversiones y retiradas confirmadas en Sepolia |
| Retirar del motor | Recuperación de retirada caducada cubierta por 14 regresiones; cinco retiradas confirmadas en la integración local | Recuperar la retirada pública UNKNOWN con la custodia original |
| Liquidar y pagar al ejecutor | Cuatro cobros locales confirmados y contabilidad final cuadrada | Plan público completado y liquidado |
| Detener, recuperar y observar | Detención pública anterior confirmada; regresiones de recuperación, respuestas perdidas y reapertura de estado | Validación pública de las nuevas correcciones |
| Inicio y operaciones pendientes | Muestra operaciones privadas conocidas sin añadir RPC y aclara el alcance del subtotal | Valoración completa de PAEG/DeFi e historial de ingresos |

**Correcciones preparadas:** recuperación de la retirada Source W39 caducada
solo tras comprobar ausencia de gasto y caducidad finalizada, conservando
importe, destinatario y transacción anterior; normalización de bloques en la
consulta de participaciones V31; conexión/refresco con retirada pendiente;
rechazo temprano de nuevas pruebas públicas si quedan menos de tres minutos
de ventana; visibilidad de operaciones privadas pendientes; conservación del
beneficiario revisado de Uniswap en preparación, oferta, ejecución y liquidación;
y formato explícito del recibo público de Uniswap. Este último conserva la
validación de oferta, importe, destinatario, límite de entrada y activo de la
comisión, sin inventar un balance de respaldo local. Requiere actualizar APK y
backend conjuntamente. La retirada pública existente sigue sin modificarse.

También se corrigieron siete entradas de pruebas locales para declarar su
mínimo de depósito y fixtures HOST desactualizados. No se relajaron las cuotas,
la política financiera ni la planificación RPC de producción. La ventana mínima
reduce fallos tardíos, pero no garantiza que cualquier prueba termine a tiempo.

**Validación:** 491 comprobaciones generales, TypeScript y 27 regresiones finales
de liquidación pasan. Los tres recorridos genuinos de Uniswap/Aave/Morpho pasan
con criptografía real, pero RPC y recibos HOST; no son operaciones públicas. El
índice conserva los demás grupos y los intentos fallidos o cancelados, sin sumar
pruebas solapadas como si fueran casos distintos. APK V32 compilada correctamente, sin instalar ni subir. SHA-256:
`07fbc929920acc39d03d4bb5f9a208c4378e1265510fdfa75dff514f2b00420a`.

**No está todo terminado:** siguen sin implementarse el ingreso personal al
motor, el historial entrante completo, la valoración conjunta de PAEG/DeFi y la
retransmisión automática nativa de ETH. El envío ETH previo se confirmó tras una
retransmisión manual de los mismos bytes. La aceptación de todas las familias
financieras sigue siendo falsa. El siguiente despliegue requiere decisión del
usuario y no sustituye las pruebas posteriores en el móvil y las redes públicas.

Evidencia: `.local/maintenance/20261018-mobile-core-acceptance/v32-campaign/`:
`operation-matrix.json`, `test-index.json`, `mixed-financial-report.json`,
`mixed-financial-summary.json`, `settlement-regressions-report.json`,
`genuine-final-report.json`, `recovery-final-report.json`, `changes.patch`,
`changes.json` y `deployment-review.json`. Generación local:
`8cfdc73c4a9d703a0f795689fa5bdeb3161d34c1d4402130ac5c34be3f5efa68`.


## 18 de octubre, 23:17 Madrid — consulta de inversiones corregida localmente; motor sin reiniciar

La APK V30 reproduce HTTP 403 al consultar las participaciones. Se ha confirmado
que el código instalado de la autoridad compartida de Aave/Morpho entrega
`blockNumber` y `blockHash` a una función que espera `number` y `hash`. La prueba
con la autoridad real, firma ECDSA y diario cifrado reproduce
`DEVICE_EXTERNAL_FLAT_DATA`; RPC y ledger son fixtures HOST explícitos.
La corrección local normaliza ese bloque con los campos esperados. Pasan ocho
regresiones y las 491 comprobaciones generales. Se mantienen la firma, la lectura
de un solo uso, los plazos y la comprobación del estado. No se ha desplegado la
corrección ni acreditado una lectura pública corregida o una inversión.

El motor conserva PID 215679 e invocación `4fa913a428f94dab8b111bb31c01cb2d`,
activo desde las 17:39:09 UTC. No se han reiniciado servicios, emitido nuevos
pagos ni modificado diarios financieros. El móvil queda en Inicio con la APK V30
y los datos conservados. ETH, BTC y SOL mantienen la confirmación documentada.

Continúan pendientes: recuperar la retirada PAEG UNKNOWN cuya prueba caducó;
financiar y probar pagos, intercambios, inversiones, retiradas y liquidación;
implementar el ingreso desde la cartera personal (la ruta actual patrocina desde
el servidor); completar el historial de ingresos y la integración del saldo y
operaciones PAEG en Inicio. Se ha vuelto a comprobar que Inicio dice «No hay
operaciones en progreso» aunque sigue existiendo la retirada PAEG pendiente.
La aceptación de todas las familias financieras sigue siendo falsa.

Evidencia en `.local/maintenance/20261018-mobile-core-acceptance/`:
`v31-share-status-fix.json`, `v31-share-status-correction.diff`,
`v31-share-status-before.log`, `v31-share-status-after.log`,
`v31-general-check-report.json`, `v31-installed-bug-and-engine.txt`,
`physical-v27-v31-return-home.xml` y `v27-mobile-acceptance.json`.

## 18 de octubre, 23:03 Madrid — los tres envíos nativos confirmados

La APK muestra Confirmado para ETH, BTC y SOL. Dos proveedores independientes
confirman la finalidad y el bloque canónico del envío ETH recuperado, con recibo
exitoso. Se conserva el hash original, sin nueva firma. La aplicación actualizó
su estado mediante la consulta normal. Evidencia: `v29-native-eth-finality-sixth.json`
y `physical-v27-v29-final-native-send-check.xml` en el directorio de aceptación.

El motor no se ha reiniciado. Las seis conexiones públicas y `/health` vuelven a
pasar a las 20:58 UTC. Los pagos PAEG, Uniswap e inversiones siguen sin aceptación
financiera completa. La renovación del ingreso de Aave autorizada con huella
terminó FAILED/EPOCH_REPROOF_REQUIRED, sin envío; Morpho comparte ese presupuesto
y mantiene deshabilitada la propuesta. Las lecturas de participaciones de ambos
dan MOBILE_EXTERNAL_FLAT_RESPONSE_REJECTED, todavía en diagnóstico. «Nuevo plan»
encuentra la retirada anterior pendiente; tampoco se acredita un plan nuevo.

La APK V29 se instaló conservando datos: diferencia el fallo de preparación
caducada de un ingreso pendiente y registra únicamente el código seguro del error
de consulta. Pasaron seis regresiones, TypeScript y las 491 comprobaciones generales.
Eso no corrige la retirada UNKNOWN del servidor ni acredita una inversión.

## 18 de octubre, 22:49 Madrid — ETH ejecutado; retirada PAEG aún bloqueada

El usuario ha pedido completar las pruebas con el móvil y ha prohibido reiniciar
el motor. Se conserva el proceso PID 215679 y la misma invocación V27.
El envío ETH original se retransmitió una sola vez con sus mismos bytes firmados,
tras comprobar red, firma, destinatario propio, importe, nonce, saldo y comisiones.
No hubo nueva firma ni edición del diario nativo. Tres proveedores muestran el
mismo recibo exitoso; dos confirman su bloque canónico. Falta que alcance la
finalidad exigida por la app y comprobar su presentación allí. La recuperación
manual no corrige todavía los reintentos automáticos del producto.

La retirada PAEG sigue UNKNOWN. Una simulación actual devuelve STALE_EPOCH:
su prueba ya caducó; no se ha retransmitido. El código instalado puede retirar
intentos de ingreso caducados, pero no este intento de retirada. Los envíos
posteriores de la cuenta patrocinadora quedan pendientes de resolver ese estado.
El ingreso antiguo de Aave sí pasó a FAILED/EPOCH_REPROOF_REQUIRED sin envío;
el usuario acaba de autorizar con su huella preparar de nuevo ese mismo ingreso.
Esto aún no acredita financiación confirmada ni inversión.

Evidencia en `.local/maintenance/20261018-mobile-core-acceptance/`:
`v29-native-eth-recovery-send.json`, `v29-native-eth-independent.json`,
`v29-native-eth-finality-first.json`, `v29-original-withdrawal-current-call.json`,
`v29-source7-observed.json` y `v27-mobile-acceptance.json`.

## 18 de octubre, 22:38 Madrid — comprobación actual de la retirada

El mismo proceso V27 continúa activo. La retirada conserva UNKNOWN y no se ha
retransmitido. La consulta actual no encuentra transacción ni recibo. La prueba
corresponde al epoch 2987258 y la red está en 2987259: la recuperación puntual
preparada ya rechaza el envío por caducidad de la prueba. La simulación favorable
de las 22:27 no autoriza a enviarla ahora. El consentimiento solicitado para
retransmitir no se ha recibido y tampoco bastaría por sí solo para superar esta
comprobación. Sigue pendiente resolver el intento original sin borrar historial,
reutilizar el nonce a ciegas ni reiniciar el motor.
Evidencia: `v28-withdrawal-epoch-current.json`, `v28-owner-user-review.jsonl`,
`v28-engine-status-user-review.txt` en el directorio de aceptación móvil.

## 18 de octubre, 22:28 Madrid — retirada bloqueada en transmisión; motor activo

Google Cloud vuelve a estar autenticado. La comprobación pública de las seis
conexiones pasa contra la misma invocación V27, sin reiniciar el motor.
La APK V27 se instaló conservando datos. El móvil emitió un envío de 1.000 sat
BTC Testnet3 a su propia dirección; dos proveedores ven el mismo hash y la
comisión de 141 sat. Está incluido en el bloque 5.195.472 y tiene siete confirmaciones según ambos proveedores;
la pantalla de Operaciones del móvil ya muestra «Confirmado · Bitcoin».
SOL conserva el envío anterior FINALIZED. El envío original de ETH continúa
UNKNOWN: el proveedor no encuentra transacción ni recibo, nonce latest/pending
0; no se ha reemplazado ni reenviado.

STOP_AUTOMATION se completó desde el móvil. OWNER y Authority conservan el
mismo grafo PREPARED y registran revoked:true, sin crear otra operación.
La lectura posterior muestra 1.000.000.000.000 wei disponibles en la nota
original. La retirada se autorizó en el móvil, terminó su prueba W39 y quedó
firmada con nonce 89. El POST original devolvió HTTP 429; Source y Authority
conservan UNKNOWN. Tres proveedores no encuentran la transacción
`0x5a1d989927a1c5d5a5733778d0295e56e5d0928a1d111c0ee82ba41da46a0357`.
La simulación de esos mismos bytes pasa; hay una recuperación puntual preparada
con comprobación de firma, nonce, importe, destinatario, epoch y simulación nueva.
Se ha pedido autorización explícita para una única retransmisión idéntica porque
el recorrido actual admite un solo POST; no se ha ejecutado ni se ha reiniciado el motor.
La apertura del plan tuvo fallos intermitentes STATUS_EXPIRED; una reconexión
pasó y el procesamiento local de la respuesta midió 661 ms. Otra lectura
caducó tras 963 ms durante su guardado local. No se considera corregido.

La APK de diagnóstico V28 añade tiempos sin secretos; se instaló a las 20:20 UTC una
corrección de interfaz para que una lectura automática fallida no retire el
campo de destinatario. El controlador conserva una lectura nueva antes de la
revisión y otra antes de la autorización. TypeScript, cinco pruebas del controlador
y las 491 comprobaciones generales pasan. El formulario ya conserva la dirección
y permitió revisar y autorizar la retirada en el móvil. Sigue pendiente la aceptación de las
demás familias financieras; estas pruebas no cierran el proyecto.
Evidencia en `.local/maintenance/20261018-mobile-core-acceptance/`:
`v27-routing-after-ready.json`, `v27-btc-independent.json`,
`v28-original-eth-configured.json`, `v28-owner-after-stop.jsonl`,
`v27-mobile-acceptance.json`.

## 18 de octubre, 21:40 Madrid — V27 completa el arranque

La invocación `4fa913a428f94dab8b111bb31c01cb2d` alcanzó READY con los
21 hitos completos, reapertura del estado original y sin fallo registrado.
El monitor lo observó a las 19:40:05 UTC y terminó tras guardar el resultado.
Tiempo de arranque: 7.246 s (2 h 00 min 46 s), frente a 8.024 s de V18;
mejora de 778 s (12 min 58 s). Registró 19.373 llamadas RPC lógicas y
18.550 unidades de lectura enviadas a red, frente a 34.097 y 21.859 anteriores.
Hubo 9.175 aciertos de caché. Estas cifras no acreditan todas las operaciones
financieras ni un arranque incremental de minutos.
El acceso raíz antiguo sigue READ_ONLY; esto no describe por sí solo los
perfiles activos renovados Uniswap/Aave/Morpho. Sus recorridos financieros y
la nueva APK continúan pendientes de validación pública.
Evidencia: `.local/maintenance/20261018-mobile-core-acceptance/v27-ready-observed.json`.
La sesión administrativa de gcloud requiere reautenticación; el registro
continuo que ya estaba conectado permitió confirmar la finalización.
Comprobación pública a las 20:01:44 UTC: `/health` 200 ready, descubrimiento
de acceso flat 200 y selector paged desconocido rechazado con 403. No hubo
firmas ni operaciones financieras. La comprobación completa de todas las
rutas y sus descriptores sigue pendiente de recuperar el acceso administrativo.

## 18 de octubre, 19:39 Madrid — V27 instalada y motor relanzado

El usuario autorizó expresamente instalar y relanzar. El motor arrancó a las
17:39:09 UTC con la versión V27
`29a6595555df8c5ee78f80c23206deeb743e29c128a7ddbb8513ccb010890d26`,
PID215679, invocación `4fa913a428f94dab8b111bb31c01cb2d`.
La actualización revisada comprobó la misma captura antes y después de instalar;
el inventario privado quedó idéntico. Mantiene epoch13, las cuotas y el permiso
hasta el 23 de noviembre a las 23:30 UTC. Arranque en curso: todavía no se acredita
READY ni la validación pública de las operaciones pendientes. Las indicaciones
históricas de no relanzar quedan sustituidas por esta autorización explícita.
Evidencia: `.local/maintenance/20261018-mobile-core-acceptance/v27-started.json`.

API V27 instalada a las 17:39:29 UTC, release
`ca6b70ee9303aaa6c0af738fa1187d5aa03a34fb2c7e301e10732d81e2cb53d6`,
con `/health` 200 y `ready:true`. El proceso del agente no cambió. El primer
intento de su envoltorio de instalación rechazó un nombre de archivo del tar
antes de cambiar el servicio; corregido el nombre, la instalación pasó.
El móvil sigue sin aparecer conectado por ADB; APK V27 preparada.

Seguimiento independiente iniciado en la VM:
`lianum-v27-startup-monitor.service`, lectura cada 30 segundos de esta invocación.
Conserva observaciones, registra READY o fallo y no reinicia ni reenvía operaciones.
Su ventana de seis horas limita sólo el seguimiento; no apaga el motor.
Última comprobación 17:44:24 UTC: motor y monitor activos, cinco hitos de 21
completados, parte Uniswap en curso, sin fallo registrado. Último contador de
arranque: 792 llamadas RPC, 1.706 aciertos de caché; no representa el total
pendiente. La autoridad raíz acabó a los 168 s frente a 204 s de V18; no es
una medición del tiempo total. Disponibles 8,46 GiB tras instalar.

## 18 de octubre — V27: retirada del plan vencido y reapertura local verificadas

El motor de producción sigue sin relanzarse. La inspección Original del estado
CAPTURED en la VM ha pasado: checkpoint
`530e62b25eb36b35470a8eceb9000c24bae7304ef2b1de46d9187e6f7ec6a9cf`.
No se han emitido firmas, enviado transacciones ni cambiado diarios privados.
La lectura actual confirma epoch13, límite de cuatro fuentes y permiso hasta
el 23 de noviembre a las 23:30 UTC. Los perfiles activos Uniswap/Aave/Morpho
vencen ese día a las 23:00 UTC; las referencias anteriores a octubre eran
incorrectas. Hay 33 registros Source: 32 FINALIZED y uno EXPIRED_DEPOSIT_V18,
sin UNKNOWN en ese diario. Esto no demuestra que todas las autoridades hayan
reconciliado todavía sus estados derivados.

V27 permite retirar la nota original de un plan PREPARED, con automatización
revocada y plazo de reserva vencido, únicamente tras comprobar ausencia de
reserva, progreso o intento de reserva en cadena/diario. Requiere una nueva
autorización W39 del móvil. Conserva la intención antigua y sus contadores.
El controlador móvil observa el mismo intento ante pérdida de respuesta;
la prueba con SDK, custodia, Authority, OWNER, Source y supervisor originales
ha pasado también cerrando y reabriendo la autoridad desde su captura. RPC,
prover y biometría de esta prueba son puertos HOST: no es una retirada pública.
La retirada no crea todavía una fuente sucesora ni convierte el plan PREPARED
en un plan ejecutado o recuperado.

Las lecturas agrupadas reutilizan la cabecera validada dentro de su bloque,
con comprobación canónica fresca al salir. La caché sigue sin reutilizar saldos
o nonces actuales. Se ha corregido además la conservación de una prueba
preparada para un nuevo epoch cuando llega el estado FAILED del epoch anterior.
El móvil detecta el mínimo BTC y la capacidad del historial antes de firmar;
el gateway detecta su capacidad antes de consultar RPC. La capacidad no se
ha ampliado y el archivo del historial sigue pendiente.

Regresiones V27: 29 de caché/coalescencia; 12 de recuperación/controlador/pantalla;
una del controlador real con reapertura de OWNER; una adicional con captura y
reapertura de Authority (50,2 s); una de renovación de prueba D26/W39 (15,8 s);
12 de gateway/controlador nativo, incluido historial lleno. Tipos móviles y
análisis estático pasan. Los primeros intentos de la nueva prueba fría fallaron
por configuración incompleta del fixture; la prueba final pasa con todos los
componentes enlazados, sin relajar ninguna comprobación de producción.

Sigue pendiente antes de afirmar cierre funcional: financiación PAEG desde la
cartera personal (FUND_D26 sigue patrocinado por el operador), fuente sucesora
tras retirar el plan vencido, causa física del fallo BTC y resolución consentida
del ETH UNKNOWN, totales/historial unificados, archivo del historial y reconstrucción
realmente incremental del arranque. También faltan las 16 familias de aceptación
pública y las mediciones completas, que requieren el relanzado previamente
acordado. No se garantiza una reapertura de cinco minutos. Paquete V27 verificado y preparado en la VM, sin instalar:
`29a6595555df8c5ee78f80c23206deeb743e29c128a7ddbb8513ccb010890d26`.
Los inspectores antiguo y nuevo autentican la misma captura. Preflight del
candidato pasa con cero RPC: RAM, 10,2 GiB libres, certificados y seis perfiles
públicos verificados. 491 comprobaciones generales pasan (23,3 s).
APK V27 compilada sin Metro, mismo certificado, SHA256
`130265cecce1a46b90823b0dddda71281d152b395588bef771ef1f495410e6ca`;
sigue sin instalar porque ADB no muestra dispositivo. La API V27 está empaquetada,
sin desplegar. Generación adoptada:
`3a338fdb54ce28b2588c21f4e4c707bcca96f164fc3bf34ee2cb32f87a3d19e8`.
Detalle en `.local/maintenance/20261018-mobile-core-acceptance/implementation-v27.json`.
El lote de recuperación está preparado; el alcance completo solicitado continúa
incompleto por los pendientes enumerados arriba.


## 18 de octubre, 18:13 Madrid — mejoras V25/V26 comprobadas; motor sin relanzar

El motor público está `inactive/dead`, PID0, `Result=success`, confirmado de
nuevo por systemd. El apagado anterior terminó a las 14:57:21 UTC después de
846 segundos. Conserva la versión `c2f07fb8d6a20de01f035f2744b96f212435e2ab37e8458530e0b6693d729b73`.
Este trabajo no lo ha arrancado ni ha modificado sus diarios privados. Su log
anterior informó captura controlada; no se ha autenticado independientemente
el checkpoint en esta revisión. Sigue siendo necesario hablar con el usuario
antes de cualquier relanzado. El conjunto completo todavía no está terminado.

La API independiente V25 está instalada:
`54d63128261173140d4239938c475c313c2df7912acdff1f7f5acbe288a8e743`.
HTTPS `/health` devuelve 200 y `ready:true`; el proceso del agente no cambió.
Separa las colas de cuentas y redes independientes, conserva la exclusión de
la misma cuenta ETH aunque cambie el uso de mayúsculas y evita reescribir
observaciones que no han cambiado. Incluye el diagnóstico acotado de fallos
de preparación. No se han enviado operaciones financieras en esta ronda.

Cambios del motor comprobados en local: grupos de lecturas históricas ligados
a un bloque canónico; reutilización persistente del código inmutable permitido
entre bloques finalizados; derivación de claves de Vault asíncrona sin reducir
los parámetros; métricas separadas de espera, RPC y etapas del cierre. Una
comprobación pública real en dos procesos reutilizó el código de un contrato
sin otra llamada `eth_getCode`, conservando la comprobación de red y bloque.
No mide el arranque completo ni acredita un tiempo de reapertura de minutos.
La reconstrucción incremental completa y la interrupción segura de pruebas
largas siguen pendientes.

V26 permite revocar mediante autorización nueva del dispositivo la continuación
del plan con intención de reserva retenida. Conserva intención y contador,
no calcula otra prueba ni envía una transacción. La revocación persiste al
reabrir el OWNER original. El botón móvil deja de exigir la observación previa
que bloqueaba la acción y exige confirmación antes de mostrar éxito. Esto
detiene la automatización; **no libera el origen reclamado ni completa su retirada**.

APK V26 compilada, sin Metro, mismo certificado de desarrollo:
`5c71f1ee231803f9db21d42cc7b2f97ab748896b6c10ba1453d8d576298dc241`.
Todavía no está instalada: ADB no muestra ningún dispositivo. Incluye saldos
parciales con fecha y aviso de antigüedad, estado incluido distinto de confirmado,
seguimiento de confirmaciones, reconexión explícita al perfil activo y eliminación
del interruptor Uniswap que no construía ninguna operación.

491 comprobaciones generales, tipos móviles y regresiones específicas de
caché, colas, Vault, recuperación, revocación y pantalla pasan. Los fixtures
Aave/Morpho no equivalen a inversiones reales. Generación adoptada:
`32c8dd7ddcd009d4ea1e1696485dffc86ee73f4f58e7f173115d46d312809f1a`.
Detalle y límites en `.local/maintenance/20261018-mobile-core-acceptance/implementation-v26.json`.

Pendiente: liberar/retirar el origen del plan vencido, ingreso desde la cartera
personal al pool, diagnóstico físico BTC y resolución explícita del envío ETH
UNKNOWN, totales nativos/PAEG/DeFi e historial de ingresos sin duplicación,
archivo del historial limitado y mediciones completas. La configuración real
BTC usa `MEMPOOL` correctamente; no se ha encontrado ahí la causa del fallo.
Dos proveedores siguen sin devolver el intento ETH y mantienen nonce0; no se
ha borrado ni reenviado. Las 16 familias de operaciones no están validadas.

## 18 de octubre, 16:44 Madrid — relanzado detenido por el usuario

El usuario ordenó no reiniciar el motor. Se detuvo primero y después se terminó
sólo el instalador V22 (PID213375), antes de cambiar la versión o solicitar
el nuevo arranque. La orden previa de apagado ya estaba en curso: última lectura
`deactivating/stop-sigterm`, PID197267, invocación V18 original. Sigue instalada
`c2f07fb8d6a20de01f035f2744b96f212435e2ab37e8458530e0b6693d729b73`.
No reanudar el despliegue ni arrancar el motor sin una nueva indicación del usuario.
No se acredita todavía un checkpoint CAPTURED final de este apagado.

Antes de detenerlo: se verificaron y retiraron cinco paquetes temporales públicos,
sin referencias de procesos/servicios ni archivos privados fuera de manifiesto.
Disco pasó de 6,77 a 11,12 GiB libres; preflight V22 pasó (sin RPC ni envío).
API independiente V23 `7318e549d83c503229ff491a5b10773b91a50bbac569025c05a07c0273b550c1`
activa, agente sin cambios, conserva el diagnóstico acotado de envíos UNKNOWN.
API V24 con diagnóstico de fallos de preparación está empaquetada, NO instalada.
491 controles generales y cinco pruebas HTTP pasan; Bitcoin recibido y confirmado
114.393 sat, pero revisión de envío desde el móvil falla y sigue pendiente de diagnóstico.
ETH continúa UNKNOWN. No se ha completado la validación de las 16 operaciones.

## 18 de octubre — V22: APK/API instaladas; envío SOL confirmado

APK `a04adffebb0d0bb457544c2d8eb51b2cf972da2d9d30b441e7c9d5466c48429e`
instalada con `-r`, conservando datos. Compilación completa sin Metro, fuentes
incorporadas verificadas y mismo certificado de desarrollo. Consulta automáticamente
los envíos pendientes por su identificador, sin firmar ni reenviar; al confirmar
vuelve a leer saldos. Diez regresiones móviles, tipos y análisis estático pasan.
Pendiente comprobar esta confirmación automática en un nuevo envío físico.

API V22 `babcaf379ab00d2b4e3ed8edbdcb0d0059d4ccefcdd238df8e4dce6930aac8d6`
activa, PID42566, `/health` 200; agente sin cambios. Frente a V21 cambia sólo el
adaptador ETH: el RPC devolvía una estimación positiva de 12.000 y se rechazaba
la revisión. Se aplica un mínimo de 21.000 antes del margen existente del 20%,
conservando límites de coste/saldo y comprobaciones previas al envío. Ocho pruebas
backend pasan. Revisión física ETH correcta; se firmó el intento descrito a continuación.

Envío físico SOL de 0,001 SOL a la propia dirección confirmado y corroborado como
finalizado mediante RPC independiente: firma
`36iGX4DZYmpvSDHwpgu6jSzTMJcL7w7x5JnZmBKegdjWYCZogYUdbVPPNkw9vUiHLY3wWbZgiSXUFB7vLhSD8KaM`.
Comisión 5.000 lamports. El móvil muestra 0,05 ETH y 4,999995 SOL; recibe también
0,00114393 BTC todavía sin confirmar, por lo que no se acredita disponibilidad
para enviar BTC ni un envío BTC realizado.

Intento ETH físico `0xdd3c90b08fcb11cf6c33889b484e8e870876ababd78dae591c527642c1284a68`
para 0,000001 ETH a su propia dirección: UNKNOWN tanto en móvil como gateway.
Tenderly y Publicnode no devuelven transacción ni recibo. No se acredita envío
confirmado ni se repite. El observador anterior borró el código de error inicial
al no encontrar recibo; su causa concreta no puede recuperarse ni suponerse.
Se corrigió localmente la conservación del diagnóstico acotado durante UNKNOWN,
y clasificación de rechazos conocidos; nueve pruebas backend pasan. Esta última
corrección todavía NO está desplegada y no convierte UNKNOWN en fallo terminal.

Motor V18 conserva PID197267; no reiniciado. Nuevo candidato V22 preparado:
`5831ecc5addd500b4aa7a257ae733ed238f8e7965f107ebf2f48de4001a265da`, generación
`fed3e45ffe2720d1a7d33ba75db5b2a670a76c22ba51ccc2d94fffba2862c88e`.
Contratos y recursos compilados idénticos a V18. Sustituye al candidato V21 pendiente,
NO al proceso activo. Ya copiado y verificado en la VM sin cambiar diarios ni
proceso; espacio disponible 6,78 GiB. Continúan abiertas las limitaciones PAEG descritas debajo:
Source4 reclamado por plan vencido, recuperación/cancelación incompleta, financiación
personal al pool y presentación unificada. No se han validado las 16 operaciones.

## 18 de octubre — V21: validación física en curso; correcciones agrupadas

APK instalada conservando datos: `85924956aa2a2c8d9209ee820d4418eab98335c4a1e400cfc21fdeb3a082e142`.
Publica cada saldo al responder su red, permite mostrar la dirección de recepción
mientras otra operación consulta y abre las inversiones públicas desde DeFi.
Las consultas automáticas de inversión no bloquean todos los botones; un ingreso
pendiente se consulta por su mismo identificador, sin repetir la financiación.
La lectura de participaciones puede fallar sin ocultar el estado del presupuesto.
Pendiente la comprobación física de esta APK tras desbloquear la sesión.

API independiente actualizada a `c58f6b0979722d131b4dbb9de972f0f5a51ff45654313c73a2a46b585b150d2e`;
`/health` responde 200. El agente conserva su proceso. Corrige el diagnóstico de
saldo insuficiente antes de estimar gas y reúne los cambios comprobados de lectura.
491 controles generales, tipos móviles y 32 regresiones de API/RPC pasan; ocho
regresiones de publicación parcial y recuperación DeFi pasan. No acreditan pagos
públicos. La compilación Android actual verifica fuentes incluidas y firma de
desarrollo; la opción de auditoría histórica `--verify-standalone-local` referencia
un intento antiguo eliminado y no es una verificación de la compilación actual.

Motor V18 continúa en PID197267; sin reiniciar. La prueba desde el móvil de
financiación Source7 quedó UNKNOWN, sin hash ni envío firmado nuevo. El ingreso
Source4 ya confirmado sigue UNKNOWN en el diario Native Source y bloquea el envío
siguiente. V21 comprueba sus recibos mediante el observador Original antes de
rechazar el nuevo envío; once regresiones de Source/firma/epoch/DeFi pasan.
La recuperación del plan antiguo conserva su intención Original y la bloquea
al vencer el permiso o su plazo original de reserva: no calcula ni envía, no
borra la intención, no cancela ni permite retirar su origen reclamado. Las
regresiones HOST con SDK/Vault/OWNER prueban ambos vencimientos y conservación.
Esta limitación de cancelación/retirada sigue abierta.

Candidato de motor preparado, NO desplegado:
`27408a31d77de1dfdfdd12e08fd19546dceb502d808a2aabf24acdecb864e747`, generación
`6ff780c11feedca772af9b74abe296b1157a9e91332b3d65bb14ad1b5b221b42`.
Incluye las optimizaciones V20; contratos y recursos compilados idénticos a V18.
No se ha medido el tiempo de arranque de esta versión. Se avisará antes de relanzar.

Se observaron 5 SOL devnet recibidos en la dirección del móvil mediante RPC público
independiente. Falta comprobarlos y probar el envío desde la APK. La cuenta ETH
personal y BTC necesitan comprobar su financiación. El ingreso Source4 previo
es presupuesto aportado por el operador al pool, no ingreso a la dirección ETH
personal. Inicio aún omite saldos/planes PAEG y no puede considerarse cartera
financiera completa. No se han validado todas las operaciones; matriz y hechos en
`.local/maintenance/20261018-mobile-core-acceptance/operation-validation-v21.json`.

## 18 de octubre — V20 reduce consultas repetidas; paquete preparado, motor V18 conservado

El arranque V18 registró 34.097 RPC lógicas, 21.859 unidades de red y 2.674
expulsiones de caché. V20 conserva por runtime y bloque exacto los conjuntos de
código ya verificados, con comprobación canónica fresca antes/después; comparte
la verificación del bootstrap finalizado y de código/getters del target Uniswap
sólo mientras coincide ese mismo bloque. No reutiliza saldo, nonce, política ni
permisos actuales. La caché SQLite comprime respuestas grandes, compacta las filas
antiguas tras corroborar su anclaje y evita una escritura LRU por cada acierto.
No cambia circuitos, contratos ni artefactos compilados.

Medición de lectura contra Sepolia real, con otro proceso y sin tocar el motor:
20 comprobaciones de 24 contratos necesitaron 24 RPC de código frente a 480 sin
reutilizar el conjunto; 72 RPC totales incluyendo identidad y canonicalidad,
7,18 s. No mide el arranque completo ni acredita operaciones financieras.
Auditoría sólo de lectura de la caché real: 64,25 MB de respuestas sin comprimir,
21,20 MB de payload deflate, antes de codificación base64/metadatos SQLite.
22 regresiones de caché/RPC pasan; el recorrido HOST con kernel, compilación y
firmante originales pasa sus dos pruebas (86 s), además de 491 controles generales
(16,8 s). RPC/recibos de ese recorrido son fixtures HOST, sin aceptación pública.

Paquete público `c9dd26e1c16e22cb039606af1c135fffedc9bf0b30c1a43ddfec2c1709aa46df`,
generación `4d9302322feaaf6d050ebc9f1d3d004df41974d14aaca1a91bb9ee71e0d849d1`.
15 diferencias respecto a V18, ocho fuentes runtime; incluye la recuperación V19
anterior. Recursos/circuitos/contratos idénticos. NO desplegado: persiste la tarea
de resolver el plan firmado que venció para reservar a las 14:58 antes de actualizar.
Motor activo en PID197267 y la misma invocación; cero reinicios. Evidencia
`v20-local-review.json`, `v20-real-public-query-measure.log` y `v20-*-tests.log`
en `.local/maintenance/20261018-mobile-core-acceptance/`.

## 18 de octubre — V18 arrancada y rutas verificadas; aceptación financiera pendiente

Implementada la recuperación de depósitos UNKNOWN cuya prueba caducó: el diario
Original conserva la firma y reserva anteriores, corrobora ausencia, nonce libre,
compromiso no insertado, bloque finalizado, código del pool y rechazo STALE_EPOCH.
Sólo permite un intento nuevo con prueba/consentimiento originales nuevos y los
mismos términos; admite también la ausencia de intento que el propio firmante
Original acredita en su diario. No reenvía la transacción caducada ni fabrica un
recibo. Pruebas dirigidas pasan en Source4/Uniswap y Source7/DeFi, con Vault,
firmas y diario reales; RPC, pruebas ZK y productores de permisos de esas pruebas
son puertos HOST explícitos, sin aceptación financiera pública.

La lectura de un ingreso pendiente busca su transacción exacta en el diario
Original y refresca su recibo; deja de recorrer todos los recibos históricos.
Los controles de código de tres contratos se consultan en paralelo en el mismo
bloque, conservando la comprobación canónica. Añadidos diagnósticos de envío
acotados sin datos privados y sin reintentos automáticos.

El arranque omite repetir una renovación ya completada sólo tras corroborar el
recibo, epoch y vencimientos con el producto Original actual. El código anterior
habría vuelto a exigir exactamente 31 filas pese a existir ya un ingreso nuevo.
491 controles generales aprobados (19,3 s). El proveedor real confirma el rechazo
STALE_EPOCH con el decoder exacto del candidato, cuatro RPC de lectura.

Candidato `c2f07fb8d6a20de01f035f2744b96f212435e2ab37e8458530e0b6693d729b73`,
generación `0a460a3ec89f90b4b4598a6e94be0dc28438956b1333a71be4d3e4d76bcfa2c0`.
Contratos y artefactos compilados idénticos al despliegue V17; sin estado privado
incluido. Motor V18 instalado mediante captura Original y revisión exacta de los 25 cambios.
La captura terminó correctamente; incrementó su contador de registro 215→216 y
conservó las 32 operaciones byte por byte. Una comprobación local demasiado estricta
interrumpió el primer instalador antes de copiar; se corrigió sólo esa condición y
se continuó desde el mismo checkpoint CAPTURED autenticado, sin repetir captura.
Inventario privado idéntico antes/después de instalar; límites y permiso hasta
noviembre intactos. Nueva invocación `9a481be0465444229b2b7523b59b8d45`, PID197267,
arrancada a las 04:42:04 UTC. Completó READY, 21/21 hitos, hacia las 08:55 de
Madrid: 2 h 13 min 44 s, 21.859 unidades RPC efectivas y cero intentos de envío.
Comprobada activa la misma invocación a las 13:27 de Madrid. Verificadas seis
conexiones públicas con certificado fijado, salud y selección de perfil; cero
escrituras financieras. Recibos: `recovery-v18-ready.json`,
`recovery-v18-status-now.log` y `recovery-v18-public-routing.json`, dentro de
`.local/maintenance/20261018-mobile-core-acceptance/`. Sigue pendiente la
aceptación física del ingreso y pago; READY no acredita operaciones financieras.

Validación Android posterior: la recuperación Original retiró el intento anterior
como `EXPIRED_DEPOSIT_V18`, conservando su registro y la nota. La prueba renovada
produjo el ingreso `0x8d89e9a337ef89d601f2fd836086b823181d222b9b4f82daad64d38d1003bf81`,
nonce 88, 1.000.000.000.000 wei de Sepolia, recibo exitoso. Tras volver a consultar,
la APK muestra ese importe como presupuesto disponible. La primera respuesta de
confirmación falló en `EFFECT_SUBMIT` con `MOBILE_PAGED_SERVICE_UNAVAILABLE`; se
observó el ingreso existente y no se repitió el envío. Queda por resolver esa
presentación de confirmación incierta. Preparándose desde el móvil un plan PAEG
de un pago de 1.000.000.000 wei a la dirección propia del teléfono, con reserva de
100 wei; su ejecución y aceptación siguen pendientes.

El pago quedó PREPARED antes de cualquier reserva/envío: la prueba Original de
reserva falló y una consulta OBSERVE_GRAPH sobrescribió y borró el marcador de
trabajo pendiente. La intención privada autenticada permanece en OWNER, contador
1/14, sin reserva ni pago. Una reproducción aislada con el mismo testigo y cliente
Original genera y verifica la prueba en 21,6 s; no se adopta ese resultado aislado
como prueba del servicio ni se alteran sus diarios. Causa inicial exacta del fallo
criptográfico aún no determinada; no hay evidencia de OOM, disco o límite de procesos.

Corrección V19 local, todavía NO desplegada: impedir que consultas entren en OWNER
mientras hay un cálculo aceptado, permitir una recuperación automática acotada del
mismo cálculo y recuperar la intención de reserva cuya referencia perdió V18,
leyendo su checkpoint auténtico, comprobando autorización y ausencia de envío en
Source, sin inventar un checkpoint previo ni reiniciar contadores. Pruebas HOST con
SDK/Vault/Authority/OWNER y Source reales pasan para recuperación automática y para
el marcador perdido; criptografía/RPC del fixture son puertos HOST, sin aceptación
financiera. 491 controles generales pasan. El plan físico sólo permite reservar
hasta 14:58:48 de Madrid y su autorización vence a las 16:13:48; no se amplían sus
términos firmados. La actualización debe resolver este vencimiento antes de
reiniciar: el motor V18 sigue en la misma invocación y el pago NO está aceptado. Evidencias `physical-v18-*`
en el mismo directorio de mantenimiento. No se reinició el motor para estas pruebas.

## 18 de octubre — APK conectada; aceptación financiera bloqueada por un ingreso pendiente

Corregidos dos fallos físicos Android: una sesión TLS intentaba durar hasta el
vencimiento financiero de noviembre pese al máximo nativo de nueve horas; después
la pantalla interpretaba la preparación pública de Uniswap con el lector local y
cerraba la app con `MOBILE_PAGED_OWNER_BINDING`. El transporte ahora conserva el
permiso financiero y acota sólo la sesión; visualización y preparación de pasos
seleccionan el lector público o local original correspondiente. Tres regresiones
sobre las funciones reales de la pantalla y una comprobación TLS fijada contra la
respuesta pública real acreditan la corrección. TypeScript, pruebas dirigidas y
491 controles generales aprobados. APK instalada conservando los datos, sin Metro:
`9cfde4efd6fd18e07ceebc57a6b9c02a051b1c29a9627281ec7774277c733107`.
Comprobados en el teléfono la conexión Paged y el cambio Principal/Pruebas con sus
etiquetas y funciones correspondientes; la separación con movimientos financieros
todavía no está aceptada.

El ingreso mínimo patrocinado conserva su nota e importe, 1.000.000.000.000 wei
(0,000001 ETH de Sepolia). Su primer cálculo falló porque el usuario del servicio
no podía crear `evidence/m23-wallet-proof-attempts`. Reproducido `EACCES` bajo el
usuario real y creados sólo los dos directorios de recibos necesarios, modo 0700;
comprobada escritura con ese usuario, sin cambiar fuentes/artefactos ni reiniciar.
Corregidos los instaladores y la lista de estado público para futuros despliegues.
La app ahora permite observar la preparación PROVING conservada. La renovación
explícita de esa misma prueba terminó aceptada y verificada en 50,3 segundos.

**La financiación aún no está aceptada.** El envío quedó UNKNOWN, nonce 88,
`0x334a87c02a116b7f7143a5b2845c4f787b614eb565035c8465c7ae20c7ed5cb0`.
El proveedor no devuelve transacción ni recibo; su saldo cubre valor y comisión.
El código actual retiene el envío y sólo observa, sin reenviar. Su prueba ya ha
caducado: la revisión de recuperación de la misma transacción fue rechazada por
la simulación con `STALE_EPOCH`; **no se ejecutó ningún reenvío manual**. No se debe
suponer que otra consulta o un reinicio recuperarán por sí solos ese estado.
Falta implementar/revisar la recuperación Original de este ingreso pendiente antes
de continuar su financiación y el pago. No se borraron ni alteraron sus registros.

Motor V17 y epoch13 conservados, mismo PID 177136: las 31 operaciones FINALIZED
anteriores permanecen y existe ahora una fila financiera adicional UNKNOWN.
Los recibos antiguos que exigían exactamente 31 filas correspondían al arranque
sin operaciones nuevas y no deben reutilizarse como condición actual de cierre.
No se reinició el motor ni se hicieron llamadas de pago a OpenAI. Voz, notificaciones
y aprobación financiera del agente siguen pendientes de aceptación física.
Evidencias y siguiente trabajo: `.local/maintenance/20261018-mobile-core-acceptance/`.

## 18 de octubre, 01:09 Madrid — Ventana hasta el 23 de noviembre aplicada; arranque y rutas verificados

El usuario ha autorizado mantener el motor disponible durante todo el 23 de
noviembre de 2026. La versión instalada es
`ff2978515327173f1d3e85b25da1b363df2429c2810586f4e074d86a4b4607d8`, con
la ventana finita V17 incluida en los límites que firma el epoch Original.
Permiso firmado hasta `2026-11-23T23:30:00Z`, cierre de operaciones a
`2026-11-23T23:00:00Z` (24 de noviembre, 00:00 Madrid). Se conservan los cuatro
topes monetarios y todas las reservas acumuladas; cuota interna tres a cuatro
para una última renovación vacía de Source4/7, sin despliegues ni envíos.
**Autorización firmada por el Original, epoch13; READY real con 21/21 hitos.**
El motor completó el arranque a las 01:08:40 del 18 de octubre, en la misma
invocación iniciada a las 22:10 del día 17: PID 177136,
`b14c9cae1da94ee09538deb0eb29fc3a`. Duración: 2 h 57 min 58 s; 29.287
unidades RPC de red y 20.634 lecturas históricas reutilizadas. Source4/7
renovadas dentro del producto Original vivo; Uniswap, Aave y Morpho publican
el plazo `1795474800000`, la medianoche que termina el 23 de noviembre en Madrid.
Conservadas las 31 operaciones FINALIZED y las reservas, cero envíos nuevos.
No hacen falta renovaciones cada nueve horas durante este periodo.

API publicada y comprobada a las 01:09:01: cinco perfiles, dos dispositivos,
seis comprobaciones de conexión y cuatro retos sin firma, cero escrituras
financieras. Conservadas las seis redes nativas principales/de pruebas, los
secretos y el proceso del agente, la configuración de Caddy y las identidades.
Temporizador de cierre persistente instalado para la medianoche de Madrid
del 24 de noviembre; los temporizadores anteriores están retirados y la
vigencia no se prolonga al reiniciar. El único temporizador persistente de
Lianum es el de noviembre.

Este resultado acredita la ampliación, el arranque y las rutas públicas.
**Siguen pendientes la aceptación financiera y la validación física Android**;
el acceso raíz anterior sigue READ_ONLY y READY mantiene
`defiFinancialReady:false`. Recibos:
`.local/maintenance/20261017-continuity-v17-engine-ready.json` y
`.local/maintenance/20261017-continuity-v17-publication.json`.

Al detener V16, el cierre encontró un lector que exigía servicio activo después
de haber bloqueado el acceso HTTP. Corregido con un lector de retención que
sigue autenticando la misma autoridad y el mismo sistema Original; la lectura
operativa sigue bloqueada. Recuperado el almacenamiento por el sellado Original
existente e inspeccionado como CAPTURED, sin transacciones. La versión con la
corrección pasó 491 controles generales, 13 pruebas de ventana/firma/temporizador
y regresiones de captura con el operador y TLS reales sobre puertos HOST.

Renovado el certificado **interno** del motor hasta el 15 de enero de 2027,
con la misma clave; actualizado el almacén de confianza de Caddy y comprobada
su validez en la fecha de noviembre. Certificado público reconocido por la APK,
cuentas, datos y procesos de API/agente conservados. El certificado público ya
vence el 11 de enero de 2027. Se archivaron copias públicas redundantes sin
ampliar discos ni tocar los historiales privados.

Coste de los recursos inventariados, a tarifas actuales en EUR y 730 h/mes:
**165,93 €/mes** antes de IVA, créditos promocionales y tráfico; **138,47 €/mes**
con el máximo descuento mensual N2 por uso continuado. Tráfico NAT observado:
aproximadamente 0,72 €/mes si conserva el ritmo de los últimos siete días.
API y agente comparten `e2-small`; el motor usa `n2-standard-4`. Discos: 100 GiB
balanced y 20 GiB standard; dos IPv4 y un NAT. FCM no tiene cuota fija; OpenAI
se añade según uso y conserva el presupuesto acordado de 50 € hasta la demo.
Esto es una **estimación de funcionamiento**, no una factura: no se ha confirmado
una exportación de facturación accesible para este proyecto y el saldo de créditos
no está verificado. El cierre del permiso no apaga las máquinas: seguirán
facturando mientras permanezcan encendidas.
Detalle y pruebas en `.local/maintenance/20261017-cost-monthly-estimate.json`
y `.local/maintenance/20261017-continuity-v17-*`.

## 17 de octubre, 21:20 Madrid — Arranque completado y rutas públicas verificadas

El motor V16 completó **21/21 hitos y READY** a las 21:15, en la misma
invocación iniciada a las 18:17 (PID 158714). Duración: 2 h 57 min 20 s;
29.787 unidades RPC de red y 20.836 lecturas históricas reutilizadas.
Source4/7 renovadas dentro del producto Original vivo y del epoch12 autorizado,
cuota tres. Conservadas las 31 operaciones FINALIZED, identidades, límites y
reservas; cero envíos financieros nuevos. La caché de arranque se cerró antes
de servir operaciones y queda conservada en disco para próximos arranques.

API publicada con cinco perfiles y seis redes nativas: Ethereum/Bitcoin/Solana
principales y Sepolia/Bitcoin testnet/Solana devnet. Comprobadas seis conexiones
públicas con TLS fijado, descriptores coincidentes y selección de cuenta válida;
identificadores desconocidos rechazados. Paged/DeFi rechazan el identificador
ausente; el único Flat permite descubrir su reto público, según su contrato
existente. La comprobación final emitió cuatro retos sin firma (tres con
identificador y uno de descubrimiento), sin escrituras financieras.
Motor, API, agente y Caddy activos; configuración principal y secretos del agente
conservados. **491 controles generales aprobados en 18 segundos** tras ajustar
el comprobador. Corregidos el registro del resultado de publicación y la
expectativa de descubrimiento Flat; el motor no se reinició por esos ajustes.

Este cierre acredita arranque, despliegue y rutas públicas. **Pendientes la
aceptación financiera real y la validación física Android**; el acceso raíz
anterior sigue READ_ONLY y READY mantiene `defiFinancialReady:false`.
Permiso hasta **18 de octubre, 02:17:53 Madrid**, con captura preventiva a las
**01:47:53**. No hay ampliación futura automática. Seguimiento hasta completar
el servidor satisfecho; recibo:
`.local/maintenance/20261017-reopen-v16-publication.json`.

## 17 de octubre, 18:17 Madrid — V16 instalada, arranque normal solicitado

La corrección de recuperación V15 y la caché persistente V16 están instaladas:
`c82563ee320617190383e6711e62a2260bdc284bcbc2599c0bc8036af57f9f52`.
15 regresiones nuevas de persistencia/recuperación, 20 de transporte y 491
controles generales aprobados. La prueba real con 20 lecturas pasó de 22
peticiones a cinco en frío y cuatro tras otro proceso; no acredita todavía
la duración del arranque completo. Prueba SIGKILL con escritura sin commit:
conservadas 20 lecturas ya comprometidas. Sólo lecturas públicas de historia
finalizada; controles actuales y permisos se siguen verificando. Se desactiva
la reutilización de arranque antes de servir operaciones financieras.

El preflight real de la instalación valida dos fuentes, el nacimiento pendiente,
la cuota tres y su propietario existente; no hizo RPC. Conservados todos los
archivos privados, contratos y recursos compilados. El controlador de instalación
se detuvo tras completarla por un nombre de informe duplicado; la continuación
verificó el estado y completó los recibos sin reinstalar ni arrancar el motor.

Permiso epoch12 firmado hasta **18 de octubre, 02:17:53 Madrid**; sólo cuota
por cartera de dos a tres, autorizada explícitamente. Límites económicos y
reservas intactos, 31 operaciones FINALIZED, cero envíos financieros nuevos.
Arranque solicitado a las 18:17 con monitor de la misma invocación y publicación
API condicionada al READY financiero real. READY, rutas públicas y aceptación
móvil siguen pendientes. Seguimiento: `.local/maintenance/20261017-reopen-v16-monitor.log`.
No se considera cerrado por tener pruebas host o copiar una versión.

Seguimiento a las 20:52 Madrid: misma invocación activa, dieciocho hitos completados,
incluyendo COMPOSITION_LISTENING. Trabajando en RENEWING_EMPTY_SOURCE4_7;
25.865 unidades RPC de red y 17.334 lecturas reutilizadas. Renovación viva,
READY y publicación API todavía pendientes. Sin errores nuevos ni envíos
financieros; conservadas las 31 operaciones y el permiso epoch12.
El seguimiento continúa por petición expresa del usuario hasta completar el
arranque y verificar las rutas, con revisión de causa antes de cualquier reintento.

## 17 de octubre — Prioridad: conservar trabajo y detectar bloqueos antes de relanzar

El usuario autoriza cuota interna de dos a tres manteniendo las 02:17:53 y los
límites económicos. Su revisión Original está en curso; todavía no hay nuevo
arranque normal. V15 preparada y verificada, instalada sólo como candidato
aislado. 13 regresiones de recuperación, seis de revisión y 491 controles
generales aprobados. El usuario pide corregir primero la repetición del trabajo
al reiniciar: se pospone el arranque normal hasta comprobar esa mejora. El
móvil queda a cargo del usuario.

## 2026-10-17 — Permiso ampliado nueve horas y verificado

Vencimiento **firmado y verificado: 18 de octubre a las 02:17:53 Madrid**
(00:17:53 UTC), nueve horas desde la petición y sustituyendo la propuesta
anterior de las 04:00. Epoch 11 aplicado por la revisión Original, terminado
con éxito a las 17:28:44 Madrid. Conservados límites económicos, reservas, cuota
de dos fuentes, las 31 operaciones y los seis perfiles de conexión. Cero
transacciones. Almacenamiento CAPTURED; el motor permanece parado y no se
relanza con esta ampliación. No hay renovación futura programada ni timer
preventivo armado; el anterior monitor había terminado al detectar el fallo.
Recibo: `.local/maintenance/20261017-period-max-nine-hours-applied.json`.

La corrección de recuperación del propietario vacío supera 13 pruebas dirigidas
y 491 comprobaciones generales. El preflight autenticado sobre los datos reales
conserva los archivos y la identidad, sin escrituras ni RPC; la corrección aún
no está instalada. La preparación del paquete detecta los pins móviles
pendientes de actualizar tras el cambio de dependencias de voz; además debe
refrescarse el preflight de lectura para el nuevo epoch 11. La siguiente
renovación requiere cuota tres: no está autorizada
ni aplicada por una ampliación únicamente temporal.

Actualizado el 17 de octubre de 2026. La API pública, el motor de ejecución remoto y la app móvil
tienen instalaciones y evidencias distintas. Las secciones posteriores
conservan sus fechas, generaciones y límites históricos.

## Agente del 17 de octubre, 16:56 Madrid — backend y APK instalados; aceptación física pendiente

API y agente usan la release
`57faabb2cdf85813957e1921a0acdc018b6d19ac2b1165ffa7bf7589d92cbb46`.
La actualización preservó los 39 mensajes, dos identidades, conversaciones y
sesiones remotas existentes. Configuradas lectura optativa del backend,
observación de grants finitos, cola FCM y voz GPT-Live 1 conectada al mismo
agente Luna. Las capacidades de ejecución de fondos siguen deshabilitadas.
Firebase se activó en el proyecto existente. El servidor usa una identidad
FCM dedicada y credenciales temporales de metadata, sin claves descargadas.

44 pruebas del agente y 491 comprobaciones generales aprobadas; TypeScript y
10 regresiones móviles aprobadas. La cuenta reconoce GPT-Live 1, sin haber
iniciado llamadas de voz de pago en esta actualización. Voz reservada hasta
USD 5 acumulados y 10 minutos por llamada; no equivale a imponer el presupuesto
completo de EUR 50 del proyecto. APK `67157bdad7578989949539553a2ba5569ed2fc73c07aee2d91e349166a0ab711`
instalada conservando los datos; abre sin errores detectados. Corregido el límite
de metaspace de Gradle (384 a 512 MiB, mismo heap de 768 MiB y control total de
3 GiB); la compilación incremental terminó en 83 segundos. **Pendientes voz
audible, notificación física y recorrido de aprobación real en Android**.
No hay aceptación financiera nueva. Recibo:
`.local/maintenance/20261017-agent-always-on-deployed.json`.

## Actualización del 17 de octubre, 16:36 Madrid — V14 detenida, recuperación pendiente

La invocación V14 terminó con `EMPTY_REPLACEMENT_UNISSUED_FILE_PRESENT`
al intentar retirar un nacimiento vacío de un epoch anterior. Completó cinco
hitos, hasta ROOT_AUTHORITY, y falló durante UNISWAP_MIXED después de **11.540
consultas lógicas / 8.374 unidades RPC HTTP**. Cero envíos financieros; las 31
operaciones FINALIZED y el alcance del epoch10 están conservados. No hay READY
ni renovación viva de Source4/7. El monitor terminó al detectar el fallo y no
relanzó el motor. El permiso sigue venciendo a las 19:00 Madrid.

El guard exige ausencia del owner/locks antes de retirar un intento no emitido.
El archivo concreto es `authority-uniswap-phone-v6/renewals/1/private-owner.vault`;
no hay locks. Ese nacimiento ya tiene owner retenido y no puede tratarse como
no emitido. Falta autenticar y recuperar ese owner por el recorrido Original;
no se borra ni se relaja el control para superar el arranque. Evidencia:
`.local/maintenance/20261017-reopen-v14-failure-receipt.json`.
Las secciones siguientes conservan el historial del arranque, no su estado actual.

## Relanzamiento del 17 de octubre, 16:03 Madrid — V14 activa hasta las 19:00

El usuario revocó la espera anterior y autorizó ampliar la vigencia financiera
hasta las **19:00 Madrid / 17:00 UTC**, manteniendo límites, cuotas y reservas,
y relanzar V14. La revisión Original completó epoch10 a las 16:02:53 Madrid,
con las 31 operaciones FINALIZED y todas las conexiones conservadas, cero
transacciones nuevas y almacenamiento CAPTURED antes del arranque.

La entrada normal arrancó a las **16:03:16 Madrid**, PID **150975**, invocación
`227fb973ef514e85890ecf4c19481873`, release
`564c8b7921576cb0892c1b8a787727bf196cc1a2659c3b5796131ba111388845`.
El preflight real de la versión instalada verificó recursos, certificados hasta
el nuevo vencimiento, seis pins publicados, estado y ventana antes de arrancar.
El cierre preventivo pasa a las **18:30 Madrid**. No hay reinicios automáticos.
ROOT_RETENTION y NATIVE_RUNTIMES observados; READY y la renovación viva de Source4/7
siguen pendientes. El monitor conserva las comprobaciones de invocación y alcance
financiero antes de publicar perfiles/testnets; PID local 4150418, registro
`.local/maintenance/20261017-reopen-v14-monitor-1900.log`.

Recibos: `20261017-period-until-1900-applied.json` y
`20261017-reopen-v14-started-1900.json`. La espera antes del relanzamiento descrita
en la revisión de las 15:44 queda sustituida por esta autorización y ejecución.
La caché continúa limitada al proceso; no se ha añadido reanudación del arranque.

## Agente del 17 de octubre, 16:05 Madrid — lectura del backend preparada en fuentes

Conectada la lectura optativa de cuentas públicas por propietario y entorno,
mediante listener loopback y token independiente. La app permite conectar
Principal o Pruebas por separado y desconectar todas las cuentas. El agente
consulta cuando una herramienta lo necesita o en un seguimiento ya solicitado;
no hay un barrido continuo ni llamadas extra al modelo para vincular cuentas.
La recuperación de un resultado de herramienta conserva su lectura guardada.
La desconexión o un cambio de entorno descartan resultados que lleguen tarde;
fallos RPC/precios mantienen importes desconocidos y origen/antigüedad explícitos.

33 pruebas del agente, 13 móviles dirigidas, TypeScript móvil y 491 comprobaciones
generales aprobadas. Se corrigió la declaración compartida de saldo para conservar
el carácter opcional de hasPendingTransfer. Cero llamadas de pago a OpenAI.
**Sólo fuentes y verificaciones locales:** la API y el agente cloud conservan sus
releases anteriores; no se ha compilado/instalado una APK nueva ni validado en móvil.
Evidencia `.local/maintenance/20261017-agent-backend-wallet-evidence.json`.
El worker de seguimiento de operaciones y Android push siguen pendientes; Firebase
no ha sido activado. No se amplían capacidades de ejecución financiera.

## Revisión final del 17 de octubre, 15:44 Madrid — V14 instalada y motor detenido por petición del usuario

La release `564c8b7921576cb0892c1b8a787727bf196cc1a2659c3b5796131ba111388845`
está instalada en ambos enlaces current. El inspector Original autenticó CAPTURED
antes y después de la instalación, con el mismo checkpoint. El inventario privado
se conservó exactamente. **No se ha relanzado el motor ni el monitor. El usuario
ha pedido expresamente parar antes del relanzamiento; esperar su siguiente instrucción.**
El estado `failed` de systemd pertenece todavía a la antigua invocación V13;
no existe una invocación V14 ni un READY nuevo.

La recuperación completa con V14 pasó: Root, Mixed y DeFi quedaron CAPTURED en
105 segundos, con 778 lecturas RPC de red y cero transacciones. La revisión previa
con límite de 512 lecturas se detuvo por ese límite; otra prueba con red bloqueada
confirmó que el sellado también corrobora recibos y contratos en blockchain.
Por tanto, el preflight de 20 archivos sin RPC descrito más abajo no debe
confundirse con el sellado completo. En total, los dos intentos con red de esta
revisión emitieron 1.290 unidades RPC de lectura. El intento final no agotó su
límite de 4.096 lecturas/ocho minutos. Se verificaron sin cambios los nueve archivos
protegidos de operaciones, permisos y conexiones durante la recuperación.

Se retiraron tres copias públicas redundantes, verificadas contra sus originales
conservados, recuperando 2,8 GB. Tras instalar quedan 9,08 GB libres frente al
mínimo de arranque de 7,52 GB; RAM disponible 15,86 GB frente a 2,68 GB requeridos.
La comprobación sobre la versión instalada valida TLS, claves de transporte,
los seis pins publicados, certificados vigentes hasta el vencimiento, las 31
operaciones FINALIZED, ausencia de envíos y el mismo epoch9. El permiso vence
a las 18:00 Madrid; el cierre preventivo se selecciona a las 17:30. No se amplió.

Cinco regresiones adicionales del tramo final pasaron (renovación viva,
publicación y recursos), además de las 10 + 5 dirigidas y 491 comprobaciones
generales de esta misma versión ya aprobadas. Las fuentes corregidas coinciden
con los hashes del paquete. API y agente siguen activos en sus releases anteriores;
los hashes de configuración de API coinciden con los esperados por el publicador.
Los scripts V14 de seguimiento/publicación están preparados, sin ejecutarse.

Evidencias actuales: `.local/maintenance/20261017-reopen-v14-final-review.json`,
`20261017-reopen-v14-startup-readonly-installed.json`,
`20261017-reopen-v14-stopped-after-review.json`,
`20261017-reopen-v14-final-path-tests.log` y `20261017-reopen-v14-install-only.log`.
Faltan la ejecución completa hasta READY, la publicación de sus nuevas conexiones
y la validación física. No hay aceptación financiera nueva ni un total/ETA de RPC
demostrado para la siguiente ejecución; su caché sigue siendo local al proceso.

## Incidencia del 17 de octubre, 15:08 Madrid — diagnóstico y preparación de V14

La invocación V13 `2f2e1818a8134361a339ed9a0777eb0f`, release
`22057989bd1cfc3843221ae920fa6cc140c3e9e86917fc593e6af2293d6d279c`,
terminó con `PAGED_PLATFORM_APPLICATION_CLOSED` tras 12.771 llamadas RPC lógicas,
sin intentos de envío. No llegó a READY. Las 31 operaciones FINALIZED, el journal
de envíos vacío y el alcance epoch9 hasta las 18:00 Madrid se conservaron.
El monitor V13 se detuvo; no existe un nuevo arranque en curso.

La regresión local reproduce el mismo error al reconstruir la interfaz durante
la sustitución vacía: su comprobación de vida observa el bloqueo de sustitución.
El ajuste completa los enlaces, comprueba que no hubo cierre y libera ese bloqueo
sólo durante el relevo síncrono; el padre conserva su bloqueo hasta cambiar la ruta.
Pasan Source4/Source7, revisión de rutas y cierre concurrente. Sin traza del fallo
V13 no se atribuye con certeza su ubicación; el siguiente paquete incorpora el
diagnóstico ya acotado de causas y ubicaciones, sin texto privado de excepciones.

El sellado de recuperación V13 encontró `MIXED_DEAD_STORAGE_PROVIDER_ADVANCED`:
el proveedor conserva una única adición administrativa, revisión 1 a 2, que el
checkpoint previo aún no contiene. La corrección V14 valida la reconstrucción
exacta del checkpoint anterior, ausencia de trabajo económico y el mismo
predecesor/OWNER validado. Conserva el checkpoint anterior; no habilita firmas,
no acepta avances arbitrarios y la reapertura Original sigue verificando al hijo.
Su preflight sobre 20 archivos reales cifrados de cloud pasó sin mutaciones,
consultas RPC ni transacciones. Esto no acredita el sellado completo ni READY.

10 pruebas dirigidas de recuperación, 5 posteriores de composición/diagnóstico
y 491 comprobaciones generales aprobadas. Evidencias:
`.local/maintenance/20261017-reopen-v14-{recovery-directed,downstream,global-final,actual-preflight}.log`.
Paquete local V14 `564c8b7921576cb0892c1b8a787727bf196cc1a2659c3b5796131ba111388845`,
generación `f7710de8656efb3385b2cc035ff51de81a94943d0287067aa00d20b0d2f06206`.
Contratos y recursos compilados idénticos; incluye inventario de fuentes del
trabajo pendiente del agente, sin desplegar la API ni su servicio. Revisión:
`.local/maintenance/20261017-reopen-v14-release-review.json`.

En el corte de las 15:24, V14 aún no estaba instalada ni el motor relanzado.
La revisión de las 15:44 anterior sustituye ese estado. El trabajo de agente 1–4 queda preparado
parcialmente en el checkout y no se ha desplegado; Firebase aún no está activado.

## Agente del 17 de octubre, 14:44 Madrid — contexto persistente desplegado

Actualización exclusiva del servicio del agente:
`c7ab179ac3b98e9d06684df7f7ab4d95d204fe691c26a16ebf71452e4544e4a6`.
La API conserva `7ea8d94555c971f53add3bffa7e265a1efc601a308e185847affcd037bd16476`
y su mismo proceso. El agente tiene un pin independiente mediante el drop-in
`lianum-agent.service.d/agent-context-v2.conf`; futuras actualizaciones del agente
requieren revisar ese pin, además del courier público. Se conservaron identidades,
sesiones y los 39 mensajes existentes; copia privada de SQLite antes del cambio.
Claves, configuración, modelo `gpt-6-luna` y capacidades financieras preservados.

El contexto por mensaje incorpora preferencias recientes, claves olvidadas,
fragmentos del historial recuperados por palabras clave y seguimientos pendientes.
Tiene límites de tamaño y se congela antes de enviar para mantener los reintentos
idénticos. Las instrucciones largas de estilo dejan de repetirse en cada turno.
Los seguimientos nuevos conservan la última zona horaria guardada tras reiniciar,
y cartera/operaciones identifican el entorno y la antigüedad de su observación.
Los entornos heredados desconocidos no se suponen Principal ni Pruebas; las
propuestas testnet requieren un contexto testnet conocido. No se añade una sesión
nueva ni herramientas nuevas que obliguen a recrear las conversaciones actuales.

26 pruebas dirigidas y 491 comprobaciones generales aprobadas. API pública y
capacidades del agente HTTP 200 tras instalar. Cero llamadas de pago de prueba;
la calidad de las respuestas reales del modelo sigue necesitando validación de
uso. La recuperación por palabras clave no es búsqueda semántica ni memoria
perfecta. Los saldos en segundo plano siguen pendientes de conectarse al backend.
Voz, push y ejecución financiera continúan deshabilitados.

Motor financiero observado a las 14:45:00: misma invocación y PID 143353,
cinco hitos, última muestra de 6.484 RPC lógicas, cero intentos de envío.
Permiso epoch9 y las 31 operaciones anteriores conservados. Sigue pendiente READY;
el monitor V13 mantiene su publicación posterior de perfiles y testnets.
Evidencia: `.local/maintenance/20261017-agent-context-evidence.json`.

## Incidencia del 17 de octubre, 14:19 Madrid — renovación incompleta de un permiso anterior

El intento V12 se detuvo tras **11.412 invocaciones RPC lógicas** (8.352 unidades
RPC de lectura en red), con `EMPTY_REPLACEMENT_INTENT_BINDING`. Source4 conservaba
una intención y un journal inicial de epoch8 (hasta las 14:00), sin OWNER. El
permiso vigente es epoch9 hasta las 18:00; Source7 no tenía renovación pendiente.
Las 31 operaciones FINALIZED, el journal de envíos vacío y el alcance financiero
se conservaron. El sellado Original de la invocación fallida terminó CAPTURED,
sin revisión financiera ni transacciones nuevas.

La corrección V13 sólo permite retirar una creación vacía que nunca obtuvo OWNER,
cuando ambos periodos pertenecen al historial firmado y únicamente aumenta su
vigencia. Rechaza OWNER/locks, journal avanzado o ajeno, fondos, cambios de cuotas
o gasto y antecedentes no autenticados. Conserva cifrados el intent y el journal
retirados, verifica otra vez el predecessor y el saldo actual, y actualiza el
intent por CAS. Una interrupción después del archivado se puede recuperar. No
renueva cuentas ya activadas ni incrementa la cuota o los límites financieros.

Pruebas dirigidas: siete casos aprobados, con variantes negativas y recuperación
tras interrupción. Comprobación global final: 491 aprobadas en 15 segundos. El
preflight en gcloud verificó el historial firmado real y la recuperación sobre
copias cifradas temporales, sin modificar los originales de producción.
Paquete revisado `22057989bd1cfc3843221ae920fa6cc140c3e9e86917fc593e6af2293d6d279c`,
generación `f13edc4eb649e674272d78a2a2f56ddc8758fce2b678689762e28b35b002d203`;
contratos y recursos compilados idénticos. Instalación terminada a las 14:30:19 Madrid, con estado privado preservado.
Arranque normal a las **14:30:20 Madrid**, PID **143353**, invocación
`2f2e1818a8134361a339ed9a0777eb0f`, observado activo a las 14:30:38.
El guard real aprobó 9.129.062.400 bytes libres frente a 7.516.192.768
requeridos y RAM suficiente. A las 14:31:23: dos hitos completados, 183
invocaciones RPC lógicas y cero intentos de envío. READY y la renovación viva
siguen pendientes.
Monitor V13: PID local 3983351, `20261017-reopen-v13-monitor-wait.log`.
El permiso sigue hasta las 18:00 y el cierre preventivo a las 17:30 Madrid.

## Arranque del 17 de octubre, 13:47:48 Madrid — ejecución nueva iniciada

Instalado el paquete `3647bdd23a341ceb554a24e71ddf0e58bb012c6b2a3ecd241001cfe0274c6435`
con preservación comprobada del estado privado durante la actualización.
Motor normal PID **139306**, invocación `938dfcc59f36482ebd97553562629146`,
observado activo a las 13:48:44 Madrid con ROOT_RETENTION y NATIVE_RUNTIMES
completados. Epoch9 hasta las 18:00, 31 operaciones anteriores conservadas y
journal de envíos vacío. No se declara READY ni renovación viva completada.
La caché y el guard de recursos ya forman parte de esta invocación instalada.
Guard real aprobado: 11.976.069.120 bytes libres frente a 7.516.192.768
exigidos, y RAM suficiente. Primer minuto: 178 invocaciones RPC lógicas,
177 unidades RPC en red, 11 entradas en caché y diez aciertos de código;
cero intentos de envío. Estos contadores no acreditan aún una mejora global
medida de duración ni permiten prometer un total o una hora de finalización.
El monitor actual es `20261017-reopen-v12-monitor.py`, PID local 3962156;
el log es `20261017-reopen-v12-monitor-wait.log`. Sólo publica perfiles y testnets
si esta misma invocación completa READY y el recibo Original vivo. Una avería
conserva su causa y detiene la publicación para diagnóstico, sin reinicio ciego.

## Reintento del 17 de octubre, 13:48 Madrid — permiso aplicado; instalación en curso

El usuario autoriza otro intento y amplía únicamente la vigencia financiera
hasta las **18:00 Madrid / 16:00 UTC**. La revisión Original terminó a las 13:46:13 Madrid: recibo epoch9 verificado,
conservando límites, cuotas, reservas, bytes de las 31 operaciones FINALIZED,
journal de envíos vacío y conexiones del usuario. Al finalizar seguía CAPTURED,
sin arranque normal ni transacciones financieras.
El cierre preventivo del nuevo periodo corresponde a las 17:30 Madrid.

Paquete nuevo `3647bdd23a341ceb554a24e71ddf0e58bb012c6b2a3ecd241001cfe0274c6435`,
generación `20b693a24e3e41448f9db0ffe03eee9471c46a844a1e4a1164562745d57d75e1`.
Los recursos compilados y contratos permanecen byte a byte idénticos. El guard
inicial comprueba RAM y el disco real del worker antes de adquirir Original o
consultar la cadena; exige 2 GiB adicionales sobre el mínimo del worker, después
de instalar. Se retiraron nueve couriers públicos de recuperación duplicados,
sin referencias y con copia instalada íntegra: 14.822.842.368 bytes libres antes
de preparar el nuevo paquete. No se borraron instalaciones ni estado privado.

La caché compartida en RAM sólo admite code/call/storage a una altura explícita.
Cada reutilización observa otra vez su hash canónico; los fallos RPC no se guardan
y una altura con otro hash usa otra entrada. Las lecturas nuevas usan EIP-1898
`blockHash/requireCanonical:true`, también en lotes de hasta cuatro. Latest,
pending, saldos, nonces, recibos, controles de permisos y envíos conservan sus
lecturas originales. Memoria limitada a 32 MiB/4096 entradas. Los contadores
muestran solicitudes únicas/repetidas, aciertos, fallos y unidades RPC en red;
no publican direcciones ni parámetros. No hay aún caché persistente ni
reanudación completa del arranque tras terminar el proceso.

Pasan 19 casos dirigidos de transporte/caché/recursos, 18 del lector Original
y sus rechazos, y 491 controles generales. Dos fixtures HTTP se adaptaron para
exigir el selector canónico nuevo; los escenarios de código incompatibles usan
contratos distintos para no simular dos códigos en el mismo bloque/dirección.
Sondeo real de sólo lectura: cuatro consultas repetidas se resolvieron con una
unidad RPC nueva para observar el bloque y cuatro aciertos. Esto no acredita
una reducción global medida del arranque. Cero inferencias y envíos financieros.

`lianum-reopen-cache-v12.service` espera el recibo financiero completo antes de
instalar la revisión y arrancar una sola vez el motor normal. El monitor
`20261017-reopen-v12-monitor.py` verifica epoch9, la invocación exacta y su READY;
sólo entonces publica los cinco perfiles y habilita las seis redes sobre la
API compatible ya instalada. No se afirma aún que las consultas estén iniciadas.
Evidencias y continuación en `.local/maintenance/20261017-core-closure-handoff.json`.

## Cierre del 17 de octubre, 13:25 Madrid — fallo de recursos diagnosticado; API compatible desplegada

El acceso a Google Cloud está recuperado. Se comprobó la invocación normal
`bde0f6bfa51742eca6b04933ab8cbe70`: falló a las 09:23:39 Madrid, tras 34.819
consultas RPC y 18 de 21 hitos, durante `RENEWING_EMPTY_SOURCE4_7`, con
`PAGED_GRAPH_RESOURCE_FLOOR`. El error posterior de captura era genérico y no
sustituye esa causa inicial. El motor normal está detenido; no se alcanzó READY
ni se publicó el recibo vivo. Las 31 operaciones FINALIZED, el journal de envíos
vacío y el alcance del epoch8 se conservan. Cero intentos HTTP de envío.

La comprobación de recursos exige 5.368.709.120 bytes libres. Al recuperar el
acceso sólo había 4.556.742.656; la RAM disponible era suficiente. Se verificaron
y retiraron dos couriers públicos temporales sin referencias, conservando sus
copias instaladas: quedan aproximadamente 6.424 MB libres. No se modificó el
estado privado ni se retiraron releases instaladas. El sellado Original del
intento fallido está en curso con la versión instalada `0fccb78c…`, sin revisión
financiera ni reapertura automática. Evidencias `20261017-reopen-v11-resource-*`
y `20261017-reopen-v11-post-resource-recovery.json` en `.local/maintenance`.

Se instaló la API compatible `7ea8d94555c971f53add3bffa7e265a1efc601a308e185847affcd037bd16476`
a las 13:23 Madrid, conservando configuración, secretos, identidad y conversación.
La salud pública y las capacidades del agente responden HTTP 200. No hubo
inferencia ni operaciones financieras. La configuración mantiene las tres redes
mainnet; publicar los cinco perfiles y habilitar testnets sigue pendiente.
El código se puede instalar independientemente del fallo del motor: no se
anuncian por ello conexiones financieras disponibles ni aceptación económica.

La APK Principal/Pruebas ya compilada conserva su SHA256 `e835112e…`, no se ha
instalado ni validado físicamente. Su protocolo ya es compatible con la API
instalada; todavía requiere habilitar las redes de prueba. La ventana financiera
sigue acabando a las 14:00 Madrid, sin ampliación. El arranque observado tardó
unas 3 h 25 min hasta el fallo: no se ha iniciado otro intento que no pueda
completar dentro de esa ventana. Los puntos 5 y 6 siguen aplazados.

## Cierre del 17 de octubre, 06:30 Madrid — APK preparada; acceso cloud caducado

APK preparada, sin instalar: `.local/mobile/artifacts/android-lianum-environments-20261017/app-release.apk`,
SHA256 `e835112ee04fd30ab141fff49c3fe552ffadea6c5e3ec76ff281966bc5277656`.
Selector global Principal/Pruebas; cuentas originales preservadas, recuperación
V4 compatible, saldos/historial separados y contexto del agente con red explícita.
La firma coincide con la APK instalada. Pasan TypeScript, 22 casos dirigidos,
20 del agente, 491 controles generales y revisión visual a 320/390 px.
Compilación independiente de Metro con 395 inputs idénticos antes/después.
No se ha usado el móvil ni se ha efectuado inferencia o transacción financiera.

El servidor compatible está empaquetado como
`7ea8d94555c971f53add3bffa7e265a1efc601a308e185847affcd037bd16476`, todavía
sin desplegar. La separación conserva byte a byte el journal mainnet existente;
testnet usa un journal distinto. Las pruebas HTTP con firmas reales comprueban
reapertura, separación de reservas y rechazo de una red distinta incluso dentro
del mismo entorno; el reintento de un envío incierto no retransmite.
Debe instalarse este código ANTES de ampliar la configuración de tres a seis redes.

Google Cloud exige reautenticación desde las 06:08 Madrid. Se comprobó tanto la
sesión Linux como la sesión Windows; ambas devuelven `Reauthentication failed`.
Se solicitó al usuario ejecutar `gcloud auth login` en WSL. Última observación
remota anterior al bloqueo: motor `0fccb78c…`, PID 134025, cinco hitos y 3.374 RPC.
No se afirma su estado actual ni READY después de perder el acceso.

El monitor local `20261017-reopen-v11-monitor.py` espera recuperar las credenciales,
con límite de las 14:00 Madrid. Al recuperarlas verifica la misma invocación y
el epoch8; sólo con READY y recibo Original instala la API compatible, publica
los cinco perfiles/habilita las seis redes y comprueba el routing público.
No amplía el permiso ni reinicia un motor fallido sin diagnóstico. Si aparece
un fallo nuevo requiere revisión del agente antes de reintentar. La captura
preventiva del motor sigue siendo a las 13:30 Madrid. El cierre financiero real
y la aceptación física siguen pendientes; los puntos 5 y 6 permanecen aplazados.

Resumen de continuación y límites de las comprobaciones:
`.local/maintenance/20261017-core-closure-handoff.json`.

## Cierre autorizado del 17 de octubre — motor y selector de entornos en curso

El usuario autorizó corregir y relanzar el motor hasta completar el arranque y
la publicación para la APK, dentro del permiso vigente hasta las 14:00 Madrid.
Después se prepara Principal/Pruebas; la validación física queda para su vuelta.
La integración financiera final del agente y los entregables se posponen.

Se reprodujo sin RPC el rechazo del perfil DeFi guardado: el productor actual
anuncia `executorPayoutsV5: true` y cambia el orden de propiedades de preparación.
La corrección autentica los perfiles guardados por su huella exacta y compara
sus valores con el productor vivo. Sólo admite ese anuncio booleano adicional;
cuentas, TLS, límites, redes, contratos y preparación restante siguen iguales.
La publicación de nuevas huellas sigue requiriendo la renovación Original viva.
Pasan cinco pruebas dirigidas y 491 controles generales; contratos y recursos
compilados idénticos. Evidencias `20261017-reopen-v11-*` en `.local/maintenance`.

El primer intento de instalar el paquete se detuvo por disco lleno antes de
arrancar. Se verificaron y retiraron siete copias públicas temporales duplicadas
conservando las instalaciones originales; se recuperaron 6,5 GB. La copia parcial
del intento fallido se conservó para auditoría. No se modificó el estado privado.
El siguiente intento instaló `0fccb78c40bcba1ec0f6377607835f9cce2a6f4fadd5b7c1182d043331727fd0`.
Motor observado en ejecución con PID 134025 y los primeros hitos completados.
No se declara aún READY, renovación completada ni publicación en la API.

El monitor local `20261017-reopen-v11-monitor.py` consulta el intento actual,
compara con el epoch8 autorizado y, al verificar READY y su recibo Original,
exporta los cinco perfiles y publica las conexiones sobre la API vigente,
conservando agente, secretos y Caddy. También prepara las tres redes de prueba
junto a las tres mainnet. Un fallo detiene esa publicación para diagnóstico;
no reintenta a ciegas ni concede otro periodo financiero. Su ventana acaba a
las 14:00 Madrid; el motor conserva su captura preventiva a las 13:30.

El selector de entornos está en desarrollo, aún sin APK nueva compilada o instalada.
La ampliación deriva cuentas públicas del otro entorno desde la raíz existente,
sin cambiar las cuentas ni el formato de copia V4. Las mismas palabras permiten
regenerar ambas; al recuperar sólo habrá que volver a activar el otro entorno.
Se comprueban aislamiento de saldos/historial y rechazo de revisiones de envío
preparadas antes de un cambio. El contexto del agente añade el entorno como dato
opcional; su servidor debe actualizarse antes de usar la nueva APK. No se han
hecho llamadas de inferencia ni se ha iniciado el punto 5 financiero del agente.

## Permiso del 17 de octubre, 05:24 Madrid — ampliado hasta las 14:00

El productor Original completó la captura controlada del intento fallido y la
revisión firmada del nuevo periodo. Epoch **8**, vencimiento **17 de octubre a
las 14:00 Madrid / 12:00 UTC**. Se comprobaron idénticos topes monetarios,
cuotas, reservas, bytes de las 31 operaciones finalizadas, journal de envíos
vacío y los seis perfiles de conexión. Hubo cero transacciones financieras.
El almacenamiento termina `CAPTURED`. No se han abierto nuevos contratos,
reiniciado el motor normal, cambiado la API ni trabajado en el agente.

El motor sigue detenido por `PAEG_DEFI_ORIGINAL_PUBLIC_PROFILE` tras 31.219 RPC
y 18/21 hitos. La ampliación no acredita `READY` ni soluciona ese fallo. La captura
preventiva correspondiente al nuevo vencimiento sería a las **13:30 Madrid**;
el temporizador del motor no está armado mientras esté parado. El arranque
normal deriva ese plazo del periodo firmado al volver a abrirse. Las referencias
históricas a epoch7 y 10:30 quedan conservadas como evidencia anterior.

Evidencia: `.local/maintenance/20261017-period-until-1400-applied.json`,
`20261017-period-until-1400-status.json` y su historial JSONL. En cloud:
`/var/lib/lianum-maintenance/20261017-period-until-1400/result.json`.
Las unidades administrativas finalizaron sin reintentos automáticos.

Cerrar la reapertura y sus comprobaciones públicas/Android cerraría este bloque
de infraestructura financiera, no el producto completo. La consulta de las
capacidades públicas confirma MoonPay sin configurar por falta de claves del
comercio, y agente persistente por texto activo con voz, push y ejecución
desde el chat deshabilitados. Siguen pendientes las integraciones y sus pruebas
completas para la demo; no se declara aceptación financiera de la generación
actual por ampliar sólo el periodo.

## Android del 17 de octubre, 05:07 Madrid — Atrás y animación instalados

APK vigente: `.local/mobile/artifacts/android-lianum-native-back-20261017/app-release.apk`,
SHA256 `a5cf3b7ca07f647f0785e0d7490aed364d00cd3ba636210062140a6923de423b`. Actualización instalada conservando identidad y datos.
Atrás usa el historial de las secciones, vuelve por los detalles internos de la
cartera y da prioridad al teclado y a los paneles. Los subpaneles del agente
vuelven al panel anterior. En Inicio, sin pasos internos, se mantiene la acción
predeterminada de Android. Los cambios pasan por el controlador existente, con
sus restricciones durante operaciones; no sustituyen ni cancelan autoridades.
El historial se limpia al bloquear la sesión. El texto de espera lleva una onda
de brillo por letras y puntos escalonados con animación nativa, estáticos con
movimiento reducido; sigue desapareciendo al primer texto del modelo.

Pasan TypeScript, tres pruebas de navegación y 491 controles generales.
Navegador: brillo, reducción de movimiento y retorno de subpaneles. Android
físico: Atrás entre Agente/Operaciones/Inicio, selector y detalle de recepción,
subpaneles del agente y teclado antes de navegar. Cero errores JS/fatales
detectados; inputs de compilación estables. No se añadieron llamadas al modelo,
no se desplegó el servidor y no se reinició el motor. Evidencias en
`.local/maintenance/20261017-native-back-*`. La aceptación visual queda pendiente.
La API/agente conserva la release `93b2c1f994d87a9c65281be0abd68397f25bc18c07f29b64cad80306c13b102e`.

## Reapertura del 17 de octubre — fallo confirmado a las 04:43 Madrid

La invocación `d3652f73da6e4facb6ae029effc1d8d1`, release `2634cd91…`,
falló a las 04:43:53 al entrar en `RENEWING_EMPTY_SOURCE4_7`, después de abrir
la composición. Último total terminal: **31.219 RPC, 18 de 21 hitos**, cero
intentos de envío. El motivo es `PAEG_DEFI_ORIGINAL_PUBLIC_PROFILE`, una
comparación de huella del perfil DeFi. No hay `READY` y el servicio está
`failed`, PID 0. No se ha reiniciado durante este trabajo.

La observación de las 04:58 Madrid conserva las 31 operaciones de origen
finalizadas y el alcance financiero anterior. Epoch7 vence a las 10:30 Madrid.
La inspección posterior de archivos confirma que los perfiles públicos guardados
de Aave y Morpho coinciden con las huellas del marcador de activación. La
comprobación que rechaza el perfil reconstruido debe diagnosticarse antes de
reintentar; no se han relajado sus validaciones ni sustituido perfiles. La
inspección utilizó diarios y archivos, sin RPC ni escrituras financieras.
Evidencias: `20261017-native-back-engine-status.json` y
`20261017-native-back-engine-diagnosis.json`. El monitor histórico terminó a
las 03:00 Madrid; no se declara un seguimiento continuo activo.

## Agente del 17 de octubre, 04:55 Madrid — streaming continuo e indicador corregido

API/agente vigente: `93b2c1f994d87a9c65281be0abd68397f25bc18c07f29b64cad80306c13b102e`.
APK instalada conservando los datos: `.local/mobile/artifacts/android-lianum-agent-live-stream-20261017/app-release.apk`,
SHA256 `da500b17ddd17b2bc8095eb81f6fd1f10dbb71ac8d734e57536d3960f32dde25`.
La configuración, secretos, identidades e historial existentes se conservan;
el motor financiero no se ha reiniciado ni modificado.

El texto ya llega por una conexión SSE autenticada mediante la firma habitual
del dispositivo, atravesando API y gateway. XHR incremental entrega fragmentos
al móvil sin esperar a cerrar la respuesta. El canal rota cada 15 segundos,
respeta los límites existentes, contrapresión y cancelación; se recupera desde
el historial y no reenvía mensajes ni añade llamadas al modelo. Desconectar el
canal deja en marcha el trabajo aceptado. Las consultas de estado en reposo se
mantienen separadas.

«Preparando la respuesta» desaparece con el primer texto del modelo y continúa
oculto aunque el backend aún cierre el turno. El indicador tiene un pulso lento
y sutil de opacidad, estático al reducir movimiento. La respuesta parcial se
sustituye por su versión guardada sin duplicados. El texto visible se conserva
si la publicación del resultado guardado llega después del cierre del turno.

Pasan TypeScript, 20 casos del agente y 491 controles generales. La prueba HTTP
real verifica firma de un uso, fragmentos antes del EOF y cancelación del canal.
El navegador comprueba fragmentos, desaparición inmediata, final visible con
turno aún activo, sustitución única y ambos ajustes de movimiento. Una prueba
acotada real de Luna recibió 372 deltas y ocho longitudes parciales distintas;
su sesión se eliminó al terminar. Android físico muestra texto parcial creciendo,
indicador ausente durante y después de la respuesta, historial entre pestañas
y cero errores JS/fatales detectados. El build conserva sus inputs. Evidencias:
`.local/maintenance/20261017-agent-live-stream-*` y resumen actualizado en
`20261017-agent-service-handoff.json`. Aceptación visual del usuario pendiente.
Se mantienen Luna y el presupuesto acumulado de 50 EUR, sin declarar un corte
automático exacto; voz, push y búsqueda web permanecen desactivados.

## Agente del 17 de octubre, 04:41 Madrid — interfaz pulida instalada

Servidor vigente: `4c4fc76a6d46945977be1fe9c165b971cae7d2de877347f0f775ed06b4da09c5`.
APK instalada: `.local/mobile/artifacts/android-lianum-agent-polish-20261017/app-release.apk`,
SHA256 `a047f4274a2d5651829c6da814ecef817a26d29db4a1ff4ce2e6830049e501d2`.
Se conservan identidad, datos e historial del móvil, conversaciones y claves del
agente, configuración privada y acceso restringido a dispositivos emparejados.
El motor financiero no se ha modificado ni reiniciado en este trabajo.

La pantalla adapta el código del frontend completo: cabecera, orbe con estados,
animaciones de entrada y pulsación, paneles, compositor creciente y teclado.
Envía mensajes de inmediato, confirma recepción por separado, presenta texto
progresivo, tarjetas generadas con observaciones reales, enlaces HTTPS y revisión
de propuestas. Conserva lectura y borrador entre pestañas; reintenta un envío
no confirmado con el mismo ID. Ajustes muestra tareas, preferencias que se
pueden olvidar y permisos efectivos. Los importes desconocidos siguen siendo
«Por confirmar», sin fabricar saldos ni estados de operaciones.

La voz conversacional se centra en Lianum, usa historial, preferencias e idioma
y zona validados, evita nombres supuestos y detalles internos y aclara los datos
faltantes. La prueba física detectó una espera al abrir la transmisión de un
chat en reposo: la apertura ya no bloquea el envío más de 250 ms. La respuesta
sigue dependiendo de la latencia del modelo. Se protegen también la transición
entre turnos y la recuperación de respuestas guardadas que se publican tarde.

Pasan TypeScript, 19 pruebas del agente y 491 controles generales; el build
conserva sus inputs. Navegador: componentes reales con HTTP de prueba explícito
en 320/390 px, reintentos, cambio de pestaña, texto progresivo y memoria. Modelo
real: 11 turnos sintéticos acotados, sesiones eliminadas al terminar. Android
físico: tarjeta de cartera real, teclado visible, continuación y persistencia
entre pestañas; cero errores JS o fatales detectados. La primera prueba agotó
su espera y queda registrada; la comprobación final posterior consta en
`20261017-agent-polish-phone-continuation.json`. La aceptación visual del usuario
sigue pendiente.

Se mantiene Luna Standard con razonamiento bajo y presupuesto acumulado de
50 EUR hasta la presentación, sin fallback caro ni herramientas alojadas de
pago. No se afirma un corte automático exacto del presupuesto. Voz, push,
búsqueda web y ejecución financiera no están habilitados. Evidencias en
`.local/maintenance/20261017-agent-polish-*`; resumen de entrega en
`20261017-agent-service-handoff.json`. Las publicaciones financieras posteriores
deben conservar esta release y los servicios y secretos del agente.

## Agente del 17 de octubre, 03:56 Madrid — desplegado y comprobado en el móvil

`lianum-agent.service` está activo en la VM existente `lianum-wallet-api`, junto
a la API pública. La release API/agente es
`50fce795bd377bd484be351e705f5ca49c642b21b9bd17f09bb48717df77fde1`.
El servicio escucha sólo en `127.0.0.1:8790`, exige token interno y restringe
las identidades a los dos dispositivos emparejados. Una identidad nueva firmada
recibe 403 antes de guardar estado o generar inferencia. La credencial de
OpenAI permanece en el servidor, separada del token del gateway, con permisos
0600. Caddy, la configuración privada y el directorio de conexiones existentes
conservan sus hashes. No se ha reiniciado ni modificado el motor financiero.

La prueba HTTPS autenticada llegó al modelo real y recibió su respuesta. La
sesión e identidad temporales del despliegue se retiraron. Después se comprobó
el chat real en Android: envío desde la APK, respuesta de Luna, historial
recuperado tras actualizar la app y conservación entre pestañas. La conversación
del usuario se mantiene. Se corrigió un fallo físico de Android que dejaba el
compositor detrás del teclado: ahora adapta su altura y descuenta la barra de
estado. Las capturas finales muestran completos el campo, el botón y el aviso
sobre el teclado; no constan errores JS ni fatales en PID 7107.

APK vigente: `.local/mobile/artifacts/android-lianum-agent-final-20261017/app-release.apk`,
SHA256 `f5a380f9c3d4517828a1d10bf1df448c203ec2485d767e5c95bd25b5da5399c8`,
51.257.018 bytes, autónoma sin Metro. Instalada como actualización preservando
appId, fecha de instalación original y datos. Pasan TypeScript móvil, 15 casos
del componente agente y los 491 controles generales. El build conserva inputs
idénticos antes/después. Los dos APK intermedios del despliegue son históricos.

Modelo `gpt-6-luna`, tarifa Standard y razonamiento bajo, sin fallback a modelos
caros. Continúa el máximo acordado de 50 EUR acumulados hasta la demo final y
presentación; los límites de cuenta son externos y no se declara un corte
automático exacto del proyecto en euros. No se han habilitado búsqueda web,
voz, push ni operaciones financieras del agente. La base persistente está
desplegada; entrega push, llamadas y observación de operaciones siguen pendientes.

Evidencias: `20261017-agent-cloud-audit.json`, `20261017-agent-public-smoke.json`,
`20261017-agent-final-apk-evidence.json`, `20261017-agent-final-phone-verification.json`
y `20261017-agent-service-handoff.json`, en `.local/maintenance/`.
Para una publicación posterior de perfiles tras la reapertura, la API vigente
es esta release, no la histórica `613cb795...`; conservar servicio y drop-in
del gateway al aplicar cualquier publicación con comparación de versión.

## Agente del 17 de octubre, 03:42 Madrid — sesión real y continuidad verificadas

El propietario autorizó usar los límites existentes de la cuenta OpenAI y fijó
un máximo **acumulado de 50 EUR desde ahora hasta la demo final y presentación**,
incluyendo desarrollo, pruebas y uso en la demo. No es una asignación mensual ni
por sesión. Se registra en `.local/maintenance/20261017-agent-budget.json`.
El modo explícito `LIANUM_AGENT_BUDGET_MODE=account` omite `spend_control`;
el modo predeterminado `session` conserva el rechazo seguro y no hay cambio
automático entre modos. El servicio no configura ni acredita un límite
acumulado de proyecto en euros en la cuenta.

La aceptación real con `gpt-6-luna` ha pasado: respuesta inicial, llamada a
`remember_preference`, cierre y reapertura de SQLite/runtime, continuación con
el mismo ID de sesión/conversación y recuperación mediante `read_memory`.
Sólo se creó una sesión para los dos mensajes de continuidad y se ejecutaron
dos herramientas internas. Ambos turnos constan completados. La API informó
35.995 tokens de entrada (26.898 en caché) y 69 de salida para esa sesión;
no constituye una factura ni el total de todo el proyecto. Las dos sesiones
reales de prueba se eliminaron al terminar; no queda un agente desatendido.
No hubo búsqueda web, voz ni operaciones financieras.

Pasan 14 casos del componente agente y 491 comprobaciones generales (13,8 s).
Evidencias: `20261017-agent-openai-account-preflight.json`,
`20261017-agent-live-continuity.json`, `20261017-agent-account-directed.log`
y `20261017-agent-account-global.log` en `.local/maintenance/`.
Esta aceptación sustituye el bloqueo remoto del apartado anterior. Siguen
pendientes el despliegue del servicio/gateway y su conexión en la APK instalada,
la entrega push, la voz y la contabilidad acumulada necesaria antes de dejar
cargas autónomas. La reapertura financiera conserva su ejecución.

## Agente persistente del 17 de octubre, 03:37 Madrid — implementación local y bloqueo de presupuesto remoto

Se han añadido `packages/agent` y `services/agent`: conversación por identidad
de dispositivo en SQLite, cola persistente independiente de la petición móvil,
recuperación de sesión, resultados de herramientas idempotentes, preferencias,
seguimientos solicitados, cancelación y outbox de notificaciones. El gateway
interno exige autenticación; la API pública verifica la firma del dispositivo.
La app consulta el mismo historial y puede abrir propuestas nativas de testnet
firmadas para su revisión mediante el SDK existente. El agente no recibe claves
de la wallet ni puede preparar, firmar o enviar operaciones.

La clave privada de OpenAI queda en `.env` ignorado por Git y modo 0600.
El modelo predeterminado es `gpt-6-luna`, Standard, razonamiento bajo;
otros modelos necesitan configuración explícita y no hay fallback automático.
Búsqueda web y voz están desactivadas. Una única prueba real de conectividad
con Responses, sin herramientas, razonamiento `none` y máximo 32 tokens,
respondió correctamente: 15 tokens de entrada y 9 de salida. Esto verifica
clave/modelo, **no acredita el agente persistente**.

El preflight de Agents API rechaza `spend_control` con HTTP 400
`unknown_parameter`, aunque figura en el SDK oficial fijado. No se ha creado
una sesión remota de agente. Se solicita un límite de modelo de 25 céntimos USD
por sesión, pero no se declara efectivo mientras la API lo rechace. El servicio
se detiene con `CREATE_REJECTED` y `NATIVE_AGENT_COST_LIMIT_UNSUPPORTED`, sin
quitar el límite ni reintentar con otra sesión/modelo. Los rechazos conocidos
se distinguen de respuestas de creación perdidas (`CREATE_UNKNOWN`).

Pasan 13 casos del componente agente, un caso de privacidad del contexto y los
491 controles generales (14,3 s); TypeScript móvil también pasa. Incluyen SQLite/HTTP reales locales, aislamiento
de usuarios, firmas de dispositivo, propuesta firmada mediante SDK y regresión
del rechazo de presupuesto. Las comprobaciones de conversación en navegador
320/390 px usan HTTP simulado; el smoke de reinicio usa el proceso real sin
inferencia. Evidencias en `.local/maintenance/20261017-agent-*`.

Pendientes: aceptación de sesiones reales con presupuesto, despliegue conjunto
del servicio y gateway, nueva APK, entrega push, voz y observación de operaciones
con grants finitos. No se ha desplegado esta implementación en GCloud ni se ha
actualizado la APK instalada. La reapertura financiera conserva su ejecución.

## Agente móvil del 17 de octubre, 02:26 Madrid — nueva APK instalada

La pantalla Agente sigue ahora la cabecera, bienvenida centrada, orbe,
compositor y paneles del `features/agent/AgentScreen.tsx` del frontend completo.
El botón + abre sugerencias y los ajustes abren controles/permisos. Las
respuestas locales presentan datos observados y comprobaciones desplegables,
con accesos a las pantallas originales. Conversación y borrador se conservan
entre pestañas dentro de la sesión; al bloquearse se desmonta la pantalla.
No se ha conectado un modelo de IA ni se han importado saldos, presupuestos
u objetivos ficticios. La voz explica que todavía está indisponible.

APK vigente: `.local/mobile/artifacts/android-lianum-agent-design-20261017/app-release.apk`,
SHA-256 `181ea59607f406b4754b6ca802ef8786148a4b8b9013db0b464c5f50498bbca9`.
Arranque físico confirmado con PID `6318`, cero errores JS/fatales; se conservan
appId, fecha de instalación original y directorio de datos. Android muestra el
bloqueo biométrico: la revisión física del agente sigue pendiente de desbloqueo
por el usuario. No consta aceptación visual del usuario ni aceptación financiera.

Pasan TypeScript, 14 pruebas dirigidas, 491 controles generales y la revisión
web de los componentes reales en 320/390 px (con fixtures públicos explícitos).
Un primer build falló al componer sourcemaps con 384 MiB; el límite de Node de
la construcción local se elevó a 768 MiB y la compilación completa pasó con
inputs idénticos antes/después, firma de desarrollo existente y sin Metro.
Esto no cambia el heap de la app ni la ejecución de GCloud.
Evidencias `20261017-agent-design-apk-evidence.json`,
`20261017-agent-design-web-verification.json` y `20261017-agent-design-build-report.json`
en `.local/maintenance/`. La reapertura remota continúa con su instalación previa.

## Recuperación del 17 de octubre, 01:47 Madrid — corrección instalada y nueva reapertura activa

Se confirmó en el snapshot autenticado de GCloud que Sup8 guardaba
`expiredWithdrawalsV10: []` en la autoridad Source7. `reopenDefiMixed` no
admitía ese campo conocido y fallaba con `PAGED_DEPLOY_FIELDS`. La corrección
admite y valida la lista acotada, conserva el rechazo de campos ajenos y exige
los tokens Original separados para restaurar cada broker. La regresión dirigida
reproduce el rechazo anterior; después del cambio pasan 13 pruebas dirigidas y
491 controles generales. No se han repetido los laboratorios económicos completos.

El estado del intento fallido se capturó mediante el productor Original de
almacenamiento, sin revisión financiera ni envíos, conservando las 31 operaciones
y seis conexiones. La versión corregida `2634cd91…` está preparada y verificada
en GCloud: contratos y recursos compilados conservan sus hashes. El periodo
hasta las 10:30 Madrid ya se firmó como epoch7, tras completar la revisión
en curso de epoch6. Se conservaron exactamente topes, cuotas, reservas, bytes
de Source31 y conexiones. La captura preventiva queda a las 10:00 Madrid;
las 03:00 sólo limitan el seguimiento local. El máximo vigente es de nueve horas
por firma. La instalación revisada terminó, conservando el inventario privado
y el checkpoint CAPTURED. El motor normal arrancó a las 01:45:40 Madrid:
PID `125766`, invocación `d3652f73da6e4facb6ae029effc1d8d1`. A las 01:46:48
llevaba 173 consultas, cero envíos y los hitos ROOT_RETENTION/NATIVE_RUNTIMES
completados (2/21). Source31, dispatch vacío y alcance firmado de epoch7 se
corroboraron intactos. Todavía no hay READY, renovación LIVE ni publicación
de cinco perfiles. Las consultas en RAM del proceso fallido no se recuperan.

Evidencias locales: `20261017-reopen-schema-correction.json`,
`20261017-schema-local-acceptance.json`, `20261017-schema-release-review.json`,
`20261017-max-period-applied.json`, `20261017-schema-installation-observed.json`
y los logs `20261017-reopen-schema-directed-final.log`,
`20261017-reopen-schema-global.log` en `.local/maintenance/`.

## Incidencia remota del 17 de octubre, 01:18 Madrid — reapertura detenida

El motor `b354042c…`, invocación `1ec6a87f785d4dcba394e8e62dd7d71a`,
terminó con código 1 por `PAGED_DEPLOY_FIELDS` después de 25.689 consultas
lógicas y 14/21 hitos, tras `DEFI_SOURCE7` y antes de
`DEFI_SOURCE7_PROVIDER`. No alcanzó READY ni completó la renovación LIVE.
Las 31 operaciones originales, el alcance financiero y el journal de envíos
vacío permanecen intactos; hubo cero envíos financieros. No consta captura
controlada de este intento y no se reinició automáticamente.

En ese momento el seguimiento observaba el estado fallido, sin reintentos ni
publicación. El periodo entonces vigente vencía a las 02:39. Todavía no se había
localizado el punto de llamada de la validación estricta de campos. La sección
de recuperación anterior recoge el diagnóstico, corrección y periodo posteriores.
Evidencia:
`.local/maintenance/20261017-fast-clock-deploy-fields-failure.json`.
Esta incidencia del motor privado no cambia el arranque y navegación de la
APK comprobados a continuación, ni la instalación de la API de saldos nativos.

## Revisión del 17 de octubre, 01:18 Madrid — wallet unificada instalada y revisada en Android

La APK vigente sustituye las dos adaptaciones visuales anteriores. Sigue la
estructura del Home, AgentScreen y tab bar del frontend completo: Inicio,
Operaciones, Agente, Aprobaciones y Más. El overview valora conjuntamente
BTC, ETH y SOL principales en EUR/USD, muestra disponible/reservado/en
operaciones, envíos pendientes, progreso del plan observado, distribución e
historial de envíos. Los activos abren su detalle y gráfica de mercado.
Las conexiones avanzadas y la recuperación están en Más.

Las lecturas de saldo se ejecutan al abrir, al volver a primer plano y cada
minuto, con cancelación y sin activar el bloqueo financiero. Los controles
de preparación, revisión, firma y envío originales permanecen. La valoración
usa cantidades atómicas y aritmética entera; no completa un total con saldos
desconocidos ni incorpora fondos de pruebas al patrimonio principal.

Cotizaciones e histórico de Coinbase son lecturas públicas acotadas y con
caché; la prueba en vivo recibió 30 velas de ETH/EUR, ordenadas entre el
17 de septiembre y el 16 de octubre. El histórico personal usa observaciones
de esta sesión. Se reutilizan el adaptador ECharts y el renderer VoiceOrbs
del frontend, con procedencia y licencias conservadas. Agente ofrece resúmenes
locales reales y revisión de propuestas; el modelo conversacional y la voz
siguen pendientes. Aprobaciones no acredita un inbox remoto completo.

APK autónoma vigente:
`.local/mobile/artifacts/android-lianum-unified-native-chart-20261017/app-release.apk`,
51.225.034 bytes, SHA256
`a177fc4bb3704242dddc6e961077fdf2e307efdf1dbc7e147d7c201029c1135e`.
Generación de fuentes host/SDK
`f39e2c3c23685e17c811175f71e4b440ccc94f697c577d144ef103d239ca7bcd`;
los inputs propios de la APK se registran por separado en su informe.
Compilación en 1m09s, inputs idénticos antes/después y sin Metro.
Instalada a las 01:16 como actualización, preservando appId, fecha original
y datos. MainActivity inició en frío en 233 ms y el proceso PID 20033
permaneció vivo durante el recorrido físico.

Los dos APK anteriores de este bloque fallaron en Android: primero por el
wrapper de tslib 2.3, corregido con tslib 2.8.1 y el resolver Metro del frontend;
después por ARIA DOM de ECharts al montar una gráfica. ECharts usa ahora
ARIA sólo en web; el contenedor nativo declara su propia descripción.
Las dos regresiones pasan. Los fallos y binarios previos se conservan como
históricos y no se consideran versiones vigentes.

Comprobados en el móvil: Inicio con valoración conjunta, las tres filas de
activos, la línea personal después de actualizar, gráfica real de ETH/EUR,
orbe y compositor del agente, Aprobaciones y Operaciones. Cero errores fatales,
TypeError, ReferenceError o SyntaxError en el proceso tras ese recorrido.
Las gráficas se verificaron visualmente en las capturas; sus etiquetas no
quedaron verificadas mediante UIAutomator y no se declara aceptación TalkBack.
No se realizaron operaciones financieras ni se acredita aceptación visual
por parte del usuario.

Pasan TypeScript, 491 comprobaciones generales en 17,6 s, 12 casos focales
en 0,31 s y dos regresiones de integración nativa en 0,42 s. También pasan
pantallas reales a 320/390 px con puertos y sesión de prueba
explícitos: consulta automática, navegación durante lectura lenta, cambio
de moneda, gráfica, agente, aprobaciones, saldo cero y saldo incompleto.
La gráfica también se comprobó en navegador con mercado real. La suite
móvil completa anterior conserva siete fallos de recuperación/epoch; no
se repitió ni se declaran resueltos. La aceptación financiera pública y el
recorrido Android completo permanecen pendientes.

Evidencia en `.local/maintenance/20261017-unified-wallet-native-chart-apk-evidence.json`,
`20261017-unified-wallet-native-chart-phone-startup.json`,
`20261017-unified-wallet-native-chart-phone-walkthrough.json`,
`20261017-unified-wallet-visual-verification.json` y
`20261017-unified-wallet-live-market.json`. El motor remoto no se reinició:
a las 01:03 Madrid seguía con PID 109242 y 14/21 hitos, sin READY.

## Revisión del 17 de octubre — seguimiento hasta las 03:00 y diseño original abierto

Por petición del usuario, el seguimiento local se amplió hasta las 03:00 de
Madrid (`2026-10-17T01:00:00Z`). Se sustituyó sólo el watcher local; se verifican
el mismo PID remoto 109242, la misma invocación y las operaciones y el alcance
financiero conservados. El vencimiento financiero sigue a las 02:39 de Madrid.
Evidencia: `.local/maintenance/20261017-fast-clock-monitor-extend-three-am.json`.

La vista previa original sirve en `http://localhost:8097`, desde el proyecto
completo `C:\Users\Rafa Pradillo\Desktop\Lianum`. Se encontraron 83 archivos
fuente y el bundle existente es posterior a todos ellos. El HTML y el bundle
responden HTTP 200. Esta copia completa permite consultar las pantallas que
faltaban en la copia parcial `Lianum_design` del workspace.

## Revisión del 17 de octubre, 00:40 Madrid — cartera corregida y revisada en el móvil

La APK vigente sustituye la primera adaptación visual de las 00:22. La cartera
presenta saldo centrado, disponible/reservado/envíos por confirmar, acciones
compactas, acceso a propuestas, activos por red y actividad real del journal.
Los detalles técnicos y la recuperación quedan plegados. Conserva los
controladores y las autorizaciones existentes.

Instalada como actualización a las 00:37 en el Samsung SM-S948B, preservando
appId, fecha original de instalación y directorio de datos. Tras el desbloqueo
del usuario se observó la cartera real: la consulta terminó, las acciones se
habilitaron y el desplazamiento mostró Ethereum, Bitcoin, Solana y actividad
reciente sin solaparse con la navegación. Se restauró la posición inicial.
Cero errores fatales o errores JavaScript de tipo, referencia o sintaxis en
la lectura del proceso. No se ejecutaron operaciones financieras; la aceptación
visual del usuario y el recorrido financiero completo siguen pendientes.

APK autónoma: `.local/mobile/artifacts/android-lianum-wallet-revision-20261017/app-release.apk`,
49.415.914 bytes, SHA256
`05e5df80a49b862041db1592e622c973db3e8d2d3638e5016bde583a66675cd6`.
Generación de compilación
`ce8c7b9c3431be2c7c6530f5d1336daaa0d5de5a318ffd7ac178811717c1ac33`;
inputs idénticos antes/después. Pasan TypeScript, 491 comprobaciones generales
en 15,6 segundos, siete casos focales y seis capturas de componentes a
320/390 px. No se repitió la suite móvil completa; sus siete fallos anteriores
de recuperación/epoch permanecen registrados y sin resolver.

Evidencia: `.local/maintenance/20261017-wallet-revision-apk-evidence.json`,
`20261017-wallet-revision-phone-verification.json` y
`20261017-wallet-revision-phone-scroll-verification.json`, en el mismo directorio.
El motor remoto mantiene PID 109242: a las 00:39 Madrid seguía en reapertura,
13/21 hitos y 19.223 consultas, sin READY ni renovación LIVE. La revisión
visual no reinició ese proceso.

## Revisión histórica del 17 de octubre, 00:22 Madrid — primera adaptación, sustituida

Se adaptó el frontend disponible en `Lianum_design` a la aplicación existente:
marca SVG y logos originales, fuentes locales DM Sans e Instrument Serif,
paleta marfil/pizarra/champagne, controles compactos, filas de activos,
portada con saldo por red y organización de Ajustes/Seguridad. Las acciones
conservan sus controladores, custodias, permisos y datos originales. No se
importaron los workspaces, saldos ni controles simulados del frontend.

APK autónoma de desarrollo: 49.409.042 bytes, SHA256
`f826ef4b1bf659e86b3fc1d6e1edd883847d2da06beb558be5ab7127ca6d84c0`,
en `.local/mobile/artifacts/android-lianum-frontend-20261017/app-release.apk`.
Las cinco fuentes se comprobaron dentro del APK por sus hashes. No requiere
Metro. Los inputs antes y después de compilar son idénticos.

Pasan TypeScript, 491 comprobaciones generales en 14,6 segundos, siete casos
focales de formulario/controlador/navegación/contraste y la revisión de
componentes a 320/390 px mediante React Native Web. Esta última usa datos
de prueba y no equivale a una instalación física. La suite móvil completa
terminó con 267/274 casos: siete fallos en recuperación y epoch, registrados
en `.local/maintenance/20261017-design-mobile-tests.log`; no se corrigió el
backend como parte del cambio visual.

La APK se instaló como actualización en el Samsung SM-S948B a las 00:25 de
Madrid: Android conservó appId, fecha original de instalación y directorio de
datos. MainActivity arrancó en frío y quedó en primer plano, con cero errores
fatales, TypeError, ReferenceError o SyntaxError en la lectura de su proceso.
Faltan el desbloqueo biométrico y el recorrido funcional con el usuario;
no acredita operación financiera pública. Evidencia de instalación y arranque:
`.local/maintenance/20261017-design-phone-after.json` y
`.local/maintenance/20261017-design-phone-startup.json`. Evidencia de APK:
`.local/maintenance/20261017-design-apk-evidence.json`. La generación local
es `fb4a8156b71eaf5d72cda964fe60b5058be63246d82b978b511c48c555011f3c`.
El motor remoto conserva `b354042c…`, PID 109242 y la misma reapertura; no
se reinició para aplicar este frontend.

## Revisión del 16 de octubre, 20:51 UTC — instalada la espera acotada del reloj

La versión actual es
`b354042c517e49c089f2d518b858c9b1cd95266a60631c6506ac44e846108ec4`,
generación `9ad71e815639489ecb4b487ede4c83070e630acc91efdbdc40e6fa3465023148`.
El instalador comprobó idénticos inventario privado, contratos y recursos
compilados. El servicio normal inició la reapertura el 16 de octubre a las
20:51:56 UTC, PID 109242, invocación `1ec6a87f785d4dcba394e8e62dd7d71a`.
Todavía no hay `READY` ni publicación de cinco perfiles.

El intento de las 20:38 terminó antes de completar la cuenta principal con
`PAGED_PUBLIC_RECEIVER_REAL_CLOCK_REQUIRED`: 2.173 consultas lógicas, 2.174
peticiones HTTP y cero envíos financieros, después de aproximadamente seis
minutos. No se registró la antigüedad del bloque concreto que provocó el fallo.
Una lectura posterior comprobó NTP sincronizado y un bloque de hace 3,5 segundos.
El cierre mediante los propietarios Original terminó correctamente: Root,
Uniswap y DeFi quedaron `CAPTURED`, revisiones 96, 69 y 49; las operaciones,
conexiones y el alcance financiero se conservaron.

Sólo el enlace de un proveedor retenido puede observar un bloque nuevo hasta
tres veces, esperando 12 segundos entre lecturas cuando falla ese control.
Cada lectura aceptada sigue exigiendo la tolerancia de 30 segundos y
canonicalidad. Tres lecturas desfasadas siguen rechazando el enlace. Los
controles inmediatos de ejecución financiera no usan esa espera.
Pasan cinco regresiones dirigidas en 6,6 segundos y las 491 comprobaciones
generales en 22 segundos. Se conserva explícitamente la generación de las
cuatro pruebas de targets compilados anteriores: sus kernels y el transporte
siguen byte a byte idénticos, sin repetir ese recorrido de seis minutos.
No constituye aceptación financiera de la generación nueva.

La arquitectura de reapertura única, lotes, reutilización de validaciones e
hitos descrita en el registro anterior sigue incluida. El seguimiento actual
está en `.local/maintenance/20261016-fast-clock-live-status.json`; la publicación
sigue esperando los gates reales de la misma invocación y el recibo vivo de
Source4/7. Conserva epoch 5, límites, reservas y vencimiento financiero a las
02:39 de Madrid. El 16 de octubre a las 23:21 de Madrid el usuario amplió el
seguimiento hasta la 01:00 del 17 de octubre (23:00 UTC del 16). Se sustituyó
sólo el monitor local: el motor conserva PID 109242 y la misma invocación.
Evidencias: `20261016-fast-start-clock-failure.json`,
`20261016-fast-clock-local-acceptance.json` y
`20261016-fast-clock-installation.json`, en `.local/maintenance/`.

## Registro anterior del 16 de octubre, 20:38 UTC — instalada la reapertura única

Instalada la versión
`761a0fd298f71bf7b973d4be96d037aabc417c0581a814d7a2e85c4d8bd25b60`,
generación `2f474370c5326add4b7038fca9b94aa2c5207823c6860ca22acf0dd57fe3e14d`.
El instalador terminó correctamente y comprobó idéntico inventario privado,
contratos y recursos compilados. El servicio normal inició una única reapertura
el 16 de octubre a las 20:38:02 UTC, PID 107619, invocación
`a893f91fd5b249188c811bcbaaa5ca48`. Todavía no acredita `READY`; la API conserva
los dos perfiles anteriores hasta completar los gates de publicación.

La nueva entrada completa la renovación pendiente de Source4/7 sobre el mismo
producto vivo y el epoch 5 existente. Evita la apertura administrativa, captura
y segunda apertura normal. Reutiliza validaciones correctas del mismo bloque
finalizado y recibos dentro de la ejecución, manteniendo canonicalidad, estado
actual y guards financieros. Las lecturas independientes de un bloque concreto
pueden viajar en lotes de hasta cuatro, con correlación por ID, cancelación
individual, plazo original y presupuesto de ritmo ponderado. La publicación de
activación conserva además las colas de ambos workers DeFi durante el snapshot.

Pasan 44 pruebas dirigidas en 25,9 segundos, cuatro comprobaciones con targets
compilados y firmas protegidas sobre cadena HOST en 384,7 segundos y las 491
comprobaciones rápidas en 23,4 segundos. El paquete ejecutado en GCloud completó
cuatro lecturas en una petición HTTP de 89 ms, sin envíos financieros. Esa sonda
no mide el tiempo total de la reapertura ni constituye aceptación económica.
La última adopción de generación cambió metadatos después de la comprobación
general; las pruebas de targets usan la generación final. No se repite el
laboratorio económico anterior ni se atribuye su aceptación a esta generación.

El seguimiento registra 21 hitos, consultas por método, lotes y ritmo; el total
RPC pendiente y la estimación en minutos siguen desconocidos en este primer
recorrido medido. No se presentan los hitos como porcentaje de tiempo. La
publicación exige `READY` de esta misma invocación, recibo Original vivo de
Source4/7 y conservación de operaciones, dispatch y alcance financiero; después
publica cinco perfiles y comprueba las rutas públicas con TLS fijado.
El límite de seguimiento solicitado sigue siendo las 00:00 del 17 de octubre
(hora de Madrid), sin ampliar el vencimiento financiero de las 02:39.

Evidencia local: `.local/maintenance/20261016-fast-start-installation.json`,
`20261016-fast-start-local-acceptance.json`, `20261016-fast-start-live-status.json`
y `20261016-fast-start-publication-midnight.log`, bajo el mismo directorio.
Evidencia de instalación en la VM:
`/var/lib/lianum-maintenance/20261016-fast-start-deploy-v10/installation.json`.

## Registro anterior del 16 de octubre, 20:02 UTC — reapertura fallida al publicar estado DeFi

La reapertura administrativa terminó con `SEPOLIA_DEFI_BUSY_OR_CLOSED` a las
20:02:27 UTC (22:02 en Madrid), antes del límite ampliado a medianoche. Había
abierto la composición y falló al publicar la actualización del mismo epoch,
antes de renovar Source4/7 y completar la captura. El último contador emitido
registraba 43.242 consultas RPC y cero envíos; no es un contador final exacto.
La captura final tampoco quedó confirmada. El motor normal no ha arrancado y
los cinco perfiles no están publicados. No se ha lanzado otra reapertura.

Verificación posterior: las 31 operaciones siguen finalizadas e idénticas al
baseline, revisión 210; dispatch conserva cero operaciones; el intent y los
campos de epoch, política, límites y reservas no han cambiado. El cierre de
almacenamiento mediante los propietarios Original terminó correctamente,
sin revisión financiera ni transacciones. Verificado a las 20:10 UTC: Root,
Uniswap y DeFi están `CAPTURED`, revisiones 94, 67 y 49 respectivamente.
`lianum-rpc-cooldown-failed-open-seal-v10.service` terminó con código cero;
conserva las 31 operaciones y las seis conexiones privadas. Evidencia local:
`.local/maintenance/20261016-failed-opening-storage-seal.json`.

Corrección local preparada: la publicación de activación espera y mantiene
las colas HTTP y de los workers de ambas cuentas mientras obtiene el snapshot.
Conserva los guards de autoridad, canonicalidad y permisos financieros. Pasan
siete pruebas dirigidas en 0,26 segundos, incluida la intercalación entre worker
y snapshot, y las 491 comprobaciones generales en 21,6 segundos. La corrección
todavía no está instalada en GCloud. No constituye aceptación financiera nueva.

Evidencia local: `.local/maintenance/20261016-midnight-opening-failure.json`
y `.local/maintenance/20261016-defi-activation-concurrency-fix.json`.

## Registro anterior del 16 de octubre, 17:35 UTC — corrección RPC instalada

Está instalada y verificada la versión
`5ff429baf71a038fc8990bda81413a420c252d4f9e02acbaa534c6d934fdf9f0`,
generación `e49ec1cf4bb1aec32c78dbd089a3bab33320c1d92e1a6ed277e21a858e98377c`.
La instalación conserva idénticos estado privado, claves, contratos y recursos ZK.
Evidencia en la VM:
`/var/lib/lianum-maintenance/20261016-rpc-cooldown-deploy-v10/installation.json`.

La reapertura de la versión anterior falló con HTTP 429 en una lectura pública.
El transporte aplica ahora la espera compartida indicada por el RPC y reduce
el ritmo ante saturación; las lecturas de almacenamiento pasan por el mismo
planificador. Conserva los plazos originales, el límite de tres intentos de
lectura y un único intento para envíos firmados. Pasan 24 pruebas de transporte
en 13,6 segundos, cinco regresiones de reapertura en 4,1 segundos y las 491
comprobaciones de `./dev check` en 14,4 segundos.

El proceso `lianum-rpc-cooldown-empty-v10.service` está reabriendo la composición.
Las 31 operaciones siguen finalizadas. El motor normal todavía no está listo y
la API conserva dos conexiones. La continuación ya preparada espera su `READY`
real para publicar cinco perfiles y comprobar las rutas públicas con TLS fijado.
La reapertura administrativa seguida de otra reapertura del servicio sigue
pendiente de optimización; los tiempos anteriores son de pruebas locales.
Se limita la validación de futuros fixes conforme a [WORKFLOW](docs/WORKFLOW.md).

Ampliación solicitada por el usuario y confirmada el 16 de octubre a las
19:59 UTC: la espera administrativa llega hasta las **00:00 del 17 de octubre,
hora de Madrid** (22:00 UTC del día 16). Conserva el PID 77364 y su misma
invocación; no reinicia la composición ni modifica el epoch financiero 5,
su vencimiento, sus límites o sus reservas. La continuación
`lianum-rpc-cooldown-midnight-v10.service` cubre el vencimiento del supervisor
anterior y exige las mismas verificaciones antes de arrancar el motor normal.
Evidencia: `midnight-wait-confirmation.json` en el mismo directorio de auditoría.
El cierre por timeout sigue siendo cooperativo; el plazo no acredita `READY`.

## Registro anterior del 16 de octubre, 17:01 UTC

Está instalada y verificada la versión
`45f86d4828f2c31786cb79d0f86b9facda59077c00a90add9fb58c08ad55abb3`,
generación `04af21ccee932abdff08603ca14dfc3ea87b11ae039f6b9cdd26795212dd6363`.
La actualización conserva idénticos el estado privado, las claves, los contratos
y los recursos ZK. Evidencia de instalación en la VM del motor:
`/var/lib/lianum-maintenance/20261016-cold-bind-deploy-v10/installation.json`.

La reapertura anterior se detuvo con
`AAVE_SEPOLIA_FINANCIAL_CHECKPOINT_EXPIRED`: el enlace del proveedor retenido
esperaba una preparación financiera de 30 segundos durante el arranque.
El enlace frío ahora autentica el estado original sin exigir ni emitir esa
preparación; las comprobaciones financieras explícitas conservan sus límites.
Pasan cinco casos dirigidos, incluida la reapertura AEAD con preparación
financiera fallida, y las 491 comprobaciones de `./dev check`.
Esto no constituye una nueva aceptación financiera pública.

La captura posterior terminó sin transacciones financieras. Las 31 operaciones
siguen finalizadas y su contenido coincide exactamente con el intent original;
se verificó un único incremento de revisión por la captura anterior.
El proceso `lianum-cold-bind-empty-v10.service` está reabriendo la composición
con la versión corregida para completar la renovación Original de fuentes
vacías bajo el mismo epoch **5**, sin ampliar su vencimiento ni sus límites.
El servicio normal todavía no está listo y la API conserva dos conexiones.
La continuación arranca el motor tras la captura; la publicación espera su
`READY` real antes de publicar cinco perfiles y verificar seis rutas de metadatos,
tres ACCESS sin firma y los rechazos de selectores ausentes/desconocidos con TLS fijado.
Android, MoonPay y el agente no forman parte de esta intervención.

## Registro anterior del 16 de octubre, 15:57 UTC — instalación en curso

**El motor remoto sigue sin estar disponible.** La API está activa con la versión
`613cb7956a2a34c356330ee8378fa1d9d48cb600060f9984e41bd938b124fa76` y dos
conexiones publicadas. El motor conserva instalada `5de34ba4…`; su servicio
normal está parado. Un proceso administrativo está reabriendo la misma
composición Native3, Uniswap y Aave/Morpho antes de instalar el paquete revisado.

Paquete final preparado y comprobado:
`46cf75a1eb0c20b0d8a741ad3adf8d901cee590d74f8273445171c9c57068d06`,
generación `43018bb7b1ee01bea7b78d9580ee624f0854e8fcb166b77f904851f53ed86a00`.
Contratos y recursos ZK son idénticos a los instalados. No está instalado todavía.

Implementado y comprobado:

- Cobro automático del ejecutor dentro de los términos autorizados, con
  beneficiario, límite y plazo fijados y conservación del envío ante pérdida de ACK.
- Retirada autorizada de notas de Source4/7 caducadas y recuperación del mismo
  trabajo; separación de permisos de consulta, almacenamiento y retirada.
- Recuperación de Root, Uniswap y DeFi interrumpidos, incluida su captura de
  almacenamiento cuando ha vencido el periodo financiero. Conserva sus propietarios
  originales, claves, historiales, reservas y plazos personales.
- Corrección de los metadatos de cuentas históricas y del enlace de recuperación
  entre supervisores. Los imports de los ayudantes del paquete se comprobaron
  también fuera de los node_modules del workspace.
- Repetición segura de la prueba de un mismo trabajo cuando cambia el epoch,
  sólo ante el rechazo explícito y antes de cualquier intento de envío.
- Custodia móvil por sesión: reutilización de la custodia abierta para evitar otra
  escritura de ROOT que Android volvería a proteger con huella.
- Escalonado de lecturas públicas, límites de espera y agrupación de peticiones
  simultáneas idénticas. No hay caché de resultados terminados ni reenvío financiero
  automático. El arranque en frío sigue siendo demasiado lento.

Comprobaciones aceptadas: `./dev check`, 491 comprobaciones rápidas; diez casos
específicos de captura interrumpida; comprobaciones adicionales de recuperación,
metadatos, imports del paquete y custodia móvil. El caso histórico con pruebas ZK
reales pasó en 558 segundos sobre un fork local controlado: dos ingresos, dos
retiradas, recuperación histórica y respaldo final del pool cero. No emitió
transacciones a la red pública. Se conservan las aceptaciones públicas anteriores
con sus versiones; no se ha repetido la batería completa ni sus pagos.

La captura de almacenamiento original terminó y el periodo financiero **5** quedó
renovado a las 15:45 UTC, hasta el **17 de octubre a las 00:39 UTC**. Conserva
los límites monetarios, las reservas y la cuota de **dos fuentes por wallet**.
Las conexiones personales anteriores mantienen sus propios plazos. El proceso
administrativo conserva las 31 operaciones de despliegue finalizadas y no ha
emitido nuevos pagos. Está pendiente su reapertura completa y la renovación de
las fuentes vacías mediante sus propietarios originales.

Falta terminar esa reapertura, instalar el paquete revisado, arrancar el servicio
normal, publicar cinco conexiones y comprobar seis rutas de metadatos y tres
solicitudes de acceso sin firma, con el certificado público fijado. La publicación
está automatizada y se detiene ante un fallo. No equivale a una nueva aceptación
financiera pública ni a una aceptación de Android.

El APK preparado tiene SHA256
`589eb6aa7f6206ba2459f7ed2b392eeb25d17b7f4753b4051e853228f0ddd8c4`;
aún no está instalado ni comprobado en el teléfono. MoonPay, el agente y el diseño
final de la app siguen fuera de este cierre.

Los apartados siguientes son registros históricos; no describen la situación
operativa de este corte.

## Registro operativo del 16 de octubre, 05:52 UTC

**El punto 3 sigue abierto.** La API tiene instalada la versión
`613cb7956a2a34c356330ee8378fa1d9d48cb600060f9984e41bd938b124fa76` y su
puerta HTTPS incluye las rutas DeFi autenticadas. El directorio todavía contiene
las dos conexiones previas; Aave y Morpho no están publicados allí.

El motor tiene instalada la versión
`5de34ba4eb63dd8e8426a5d05be93ac60c1d164f3c260c0cce0d84485d351169`,
generación `79e309c02530e0c6c903a4354d31b9968a7ab947829aea762d4708a198aaa519`.
La instalación comprobó que claves, archivos privados, contratos existentes y
recursos ZK permanecieran idénticos. Evidencia en la VM:
`/var/lib/lianum-maintenance/20261016-defi-v8-financial/installation.json`.
El proceso administrativo conserva el mismo plan retenido. Los cinco contratos
y los dos registros de Aave ya están finalizados en Sepolia. Los cinco contratos
y los dos registros de Morpho también han finalizado. Los tres contratos del
presupuesto común están finalizados desde las 05:09 UTC: 31 filas en total,
todas finalizadas, incluida la solicitud fija de dos USDC de prueba de Aave.
Se conservan las 13 operaciones anteriores finalizadas.
La activación agotó la espera de esa solicitud antes de verla confirmada;
la captura posterior sí la observó. Se autenticó la captura original
`92582ce54cbdebf97958f36d9a9357a8f4b50fabb8184a4d8b3cf15378e4f606`,
los dos protocolos y sus dos cuentas retenidas. El mismo despliegue se
reanudó a las 04:38 UTC, sin otra solicitud de USDC ni repetir contratos.
Evidencia en la VM:
`/var/lib/lianum-maintenance/20261016-defi-v8-resume-after-faucet/preflight.json`.
La captura completa original quedó autenticada con el hash
`17200c09cca30f0f85f01fe4f8dd9f3a7ac4ae465bc4fa4f79afdcbb11297429`.
La actualización terminó a las 05:19:54 UTC. El arranque normal falló después
con `PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE`: el inspector de finalidad trataba una
copia DATA como sistema Original. El proceso está parado, no ha emitido `READY`.
La corrección está en el commit `ca121848`; la regresión nueva reproduce el
rechazo anterior y pasa junto a otras siete comprobaciones en 13 segundos.
La generación corregida está preparada; todavía no está instalada.
La recuperación con esa corrección encontró otro rechazo: el contador de
reaperturas del supervisor no permitía pasar de 15 a 16. El commit `538b71a0`
corrige los contadores Root, Uniswap y DeFi, validando incrementos antes de
escribir y sin modificar permisos, presupuestos ni plazos. Las regresiones
cruzan 15→16→17 y 1023→1024, y comprueban que overflow no altera los archivos.
La generación preparada ahora es
`3742854cf5aa68b078a97f35e31b617b1942a5dff770a6d5df8f1b38030ca830`.
La lectura autenticada posterior conserva Native, Uniswap y DeFi en `OPENING`,
las dos cuentas y el presupuesto común retenidos. Las siete cuentas inspeccionadas
no tienen trabajos financieros pendientes ni automatizaciones que se despierten.
Hay que reanudar ese mismo estado con ambas correcciones, capturarlo e instalar
la versión nueva. La disponibilidad de `/health` sólo acredita la API.

Se corrigieron el orden de activación previo a abrir HTTP, la reapertura con
el localizador DeFi retenido y el vencimiento de la preparación de despliegue:
la validación completa se hace antes de observar comisiones y empezar sus
30 segundos. No se han repetido ingresos ni pagos de usuarios.

El presupuesto PAEG, el enlace autorizado a inversión, la recuperación persistente
y la consulta con permisos vencidos están implementados. Las correcciones de
las ventanas de autorización financiera están terminadas y comprobadas: la
validación completa se prepara previamente; inmediatamente antes de firmar y
enviar se vuelven a comprobar comisiones, permisos, epoch y capital originales.
No se amplían sus plazos ni se omite su consumo único. La versión corregida
ya está instalada. El APK está
compilado; esta composición final no está instalada ni aceptada en Android.
Se conservan las aceptaciones anteriores de las tres redes y DeFi, con sus
versiones y límites; no equivalen a aceptar esta composición remota nueva.

Falta recuperar esa reapertura, instalar la corrección, arrancar el motor y publicar las cinco
conexiones y comprobar las rutas públicas. Los saldos de USDC de Circle y Aave
eran cero en la lectura de las 03:47 UTC; Circle continúa en cero a las 05:09 UTC
y la acuñación de dos USDC de prueba de Aave ya está confirmada.
La instalación tras la captura, el arranque, la publicación del directorio y la
comprobación pública de rutas están automatizados; se detienen ante un fallo y
no repiten transacciones financieras. El epoch financiero vigente es el **3**, con
los mismos límites de gasto y cupos 1/1/2; vence a las **07:00 UTC** y las
operaciones Mixed/DeFi tienen límite **06:30 UTC**. Los permisos personales
Native3 anteriores vencieron a la 01:30 UTC y siguen en modo de lectura.

El control de dependencias conserva 134 avisos nuevos de ciclos entre módulos;
no se ha cambiado su referencia para ocultarlos. Los puntos 4 y 5, MoonPay y el
agente siguen separados. La revisión del punto 4 confirma que el cobro del
ejecutor sigue siendo manual y exige otra autorización: la automatización actual
termina antes de retirar sus payouts. Para cerrar el cobro remoto hará falta
una capacidad específica aprobada al inicio; los contratos actuales ya admiten
esa retirada y no requieren otro despliegue por este motivo. La causa del fallo
histórico no está capturada: D26 y W39 conservan el riesgo de cambio de epoch,
pero todavía no hay evidencia de que provocara aquel fallo.
Los apartados siguientes son registros históricos de
instalaciones previas y no describen el estado operativo de esta actualización.

## Registro anterior del punto 3: instalación de Uniswap (16 de octubre)

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
