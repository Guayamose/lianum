# Cuenta original vinculada y notas del dispositivo

La app usa conexiones privadas explícitas y permisos específicos para cada
cuenta, activo, pool y acción. Un descriptor fija la vinculación; no permite
adoptar una cuenta ni concede custodia. El servicio exige las referencias
originales de sesión, actor, cuenta y bridges emitidas antes de financiar.

## Qué permite cada pantalla

**Cuenta vinculada** tiene dos recorridos distintos. Consultar o reconciliar
una petición lee su registro original; CONFIRMED del coordinador no demuestra
por sí solo saldo. **Leer saldo privado** usa dos firmas propias: la primera
revela la cuenta/pool y la segunda autoriza su lectura fresca. Disponible,
reservado, bloqueado y recuperación se muestran por separado. UNKNOWN, STALE
o caducidad dejan las cantidades no disponibles; nunca se presentan como cero.

**Financiar nota** usa el Vault cifrado del dispositivo y los bridges originales
D26, U/S y ejecución/W39. La preparación nace con la raíz, clave, destinatario
y dominio exactos. La app consulta el D26 original antes de preparar una
reserva y conserva sus mismos trabajos al reconectar. Gastar la fuente mediante
S no acredita automáticamente sus outputs: cambio y recuperación requieren
sus propias observaciones de inclusión, nullifier y resultado original.
La salida W39 conserva la reserva y el rol elegidos; recuperar sigue bloqueado
antes del plazo económico y del F original.

Una intención retenida, respuesta perdida o reorg de F queda UNKNOWN. El Vault
revoca el saldo y conserva la misma transacción/trabajo antes de otra consulta.
La reconciliación del mismo original decide el resultado; no renueva permisos,
crea otra prueba ni reenvía automáticamente. La recuperación automática se arma
o desarma con un permiso nuevo de 15 segundos ligado a la misma reserva. El
plazo de ocho horas permanece intacto; el servicio debe mantenerse activo.
El perfil LIVE_ARMED aceptó conservar la misma reserva y autorización armada,
Vault móvil, journal y provider tras cerrar diez secciones y reabrir en otro PID.
El recorrido corto `b923b217` usa tres pruebas D26/U/S y una nueva READ firmada,
sin F antes del cutoff. No acredita F autónomo después de ocho horas, pérdida
abrupta ni teléfono. F reorg `b4329b70` quedó aceptado con nueve pruebas:
el primer RECONCILE guardó UNKNOWN y ambos outputs bloqueados; el Vault se
reabrió y el segundo confirmó el mismo F antes de ambas W39. Se reemitió una
vez el wire original, sin nueva firma nativa, permiso económico ni prueba de
recuperación. El alcance es el padre original exacto de F. UNKNOWN conserva
la misma intención y nunca autoriza repetir el envío por sí solo.

**Nota ERC20** usa una custodia distinta y propia del dispositivo, creada antes
de financiar. Conserva una fuente D26 y su salida íntegra W39, con permisos de
prueba, financiación, retirada y observación separados. No fabrica una reserva S
ni convierte las posiciones Linux en notas propias. El recorrido Node/TLS
`da603751` aceptó dos pruebas, dos envíos/receipts y respuestas perdidas
reconciliadas sobre los mismos trabajos. Capturó cuatro secciones originales y
reabrió el backend en otro PID sólo para observar, sin nuevos efectos.

**Posiciones DeFi** exige dos permisos de lectura separados del saldo nativo.
El catálogo, sesión, generación, vault y cabeza son originales. Su custodia
permanece en Linux; shares y valoración del subyacente no se convierten en
saldo móvil gastable. MetaMorpho y Aave aceptaron estas lecturas tras mint y
redención y reapertura ordenada del backend retenido sin nuevos envíos.

**Estado privado** reúne estas respuestas ya autenticadas por sus SDK y los
outputs originales del Vault móvil. Conserva identidad completa por activo,
dominio, raíz y generación; no crea un permiso global ni un total entre redes.
Reabrir un checkpoint no lo vuelve fresco: hace falta observar de nuevo cada
fuente. Caducidad, cierre, segundo plano o fallo revocan la frescura; los pending
se conservan y las fuentes no instaladas permanecen desconocidas.

## Vinculación y consentimiento

El operador entrega origen HTTPS y pairingId por un canal explícito. La app
usa la clave protegida actual; ni IDs, JSON, callbacks ni claves públicas
reconstruyen referencias originales. Los productores económicos y bridges
nacen antes de los efectos. El listener TLS comparte la misma cuenta y actor;
certificados TLS son infraestructura, nunca claves raíz de nota.

La revisión fija cuenta, activo, dominio, pool, destinatario, importe, trabajo,
head y caducidad. Cancelar, editar, cambiar de pantalla o salir de primer plano
la revoca. Se comprueba otra vez tras la lectura protegida de la clave y el
almacenamiento; el permiso se consume antes del POST. Prueba y espera de su
respuesta tienen un presupuesto propio y no extienden el permiso de financiación.
Una respuesta perdida se consulta sobre la intención original.

Las entradas locales explícitas son [servicio nativo](../services/api-server/docs/ORIGINAL-LOCAL-DEVICE-OPERATOR.md)
y [nota ERC20](../services/api-server/docs/DEVICE-ERC20-LOCAL.md). Preparan los
originales en el mismo realm y publican el descriptor para el operador. No
financian ni prueban una nota al arrancar. La entrada ERC20 prepara una allowance
exacta del laboratorio; el importe introducido en la app debe coincidir.
No hay lookup/adopción remota por IDs. El executor API/SQL legado permanece
cerrado hasta disponer de la autoridad económica original de cada job.

## Alcance y evidencia

EVM9 aceptó D26/U/S, entrega nativa, F, ambas W39 y cinco READ firmadas, con
Vault móvil original y diez secciones reabiertas en otro PID. El padre conservó
su Vault y clave; fue captura ordenada. Meta/Aave aceptaron quince pruebas y
dos READ por protocolo con cinco secciones originales y mismo receipt/reference.
ERC20 `da603751` aceptó la nota propia y su reapertura ordenada de observación.
Los resultados y límites están en [STATUS](../STATUS.md).

Estos recorridos usan SDK, TLS, Vault y procesos originales. El firmante y los
puertos nativos de los HOST están declarados como infraestructura de laboratorio;
no acreditan biometría, SecureStore físico ni operación financiera en teléfono.
Caída abrupta, salida del padre, infraestructura independiente, redes públicas
y wallet completa siguen pendientes. Los rechazos originales se conservan.

El APK `d07f578f` está compilado y archivado para su corte:
79 inputs iguales, 36 joins, Hermes y firma Debug/V2 comprobados, sin Metro.
Diez procesos propios ausentes y cero señales en el informe original. Incluye
el contrato de ambos outputs bloqueados. Instalación y operación física quedan
para el final. Véase [uso y artefacto móvil](../apps/mobile/README.md).

El outbox V1/V2 de la pestaña Cartera conserva admisiones HTTP/SQL históricas.
Leer ACCEPTED confirma admisión, no saldo ni cierre financiero. Esta ruta queda
separada de las nuevas conexiones originales de cuenta, nota nativa, nota ERC20
y posiciones; sus registros se mantienen pendientes sin reenvío automático.
