# Wallet móvil

La interfaz incorpora la identidad original de `Lianum_design`: fondo marfil
`#F3F0E8`, pizarra, champagne, DM Sans e Instrument Serif locales, marca SVG
y controles compactos. La portada sigue la referencia de saldo centrado sobre
el fondo plano, sin tarjeta azul. Los importes proceden de cada cuenta nativa;
no se importan saldos de ejemplo, históricos ni workspaces del prototipo.
El overview reúne BTC, ETH y SOL de las cuentas principales en un patrimonio
valorado en EUR o USD, con elección persistente y columnas de disponible,
reservado y en operaciones. Usa aritmética entera para valorar cantidades
atómicas; una lectura desconocida impide presentar un total completo. Los
fondos de testnet no se suman al patrimonio principal. Las filas de distribución
abren el detalle del activo y su mercado; elegir una red deja de cambiar el
patrimonio de la portada.

Los saldos se consultan al abrir, al volver a primer plano y cada minuto,
con cancelación por sesión y sin ocupar el bloqueo financiero. Se puede
navegar mientras cargan; deslizar hacia abajo permite una actualización
adicional. Preparar y autorizar un envío conserva los controles originales.

Las cotizaciones indicativas provienen del endpoint público de
[tipos de cambio de Coinbase](https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates),
con caché de un minuto. Las gráficas 1D/1S/1M/1A usan sus
[velas de mercado](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles),
con caché de cinco minutos y peticiones acotadas. Estas consultas no envían
direcciones ni identidad y no autorizan operaciones. La evolución del
patrimonio registra observaciones de esta sesión; no usa el mercado como
si fuera la rentabilidad personal ni inventa un histórico anterior.

La navegación conserva sus custodias y acciones originales. La copia completa
del frontend de referencia está en `C:\Users\Rafa Pradillo\Desktop\Lianum`;
la copia `Lianum_design` del workspace es parcial. `HomeScreen`, `AgentScreen`
y el tab bar completos guían estructura, medidas y navegación. El renderer
VoiceOrbs conserva sus fuentes y licencia MIT, con un adaptador SVG nativo;
las gráficas reutilizan el adaptador ECharts del frontend. Procedencia en
`src/design/original-components.json` y licencias en `src/design/licenses`.
La integración Android añade el resolver Metro de tslib del frontend original
y limita ARIA DOM de ECharts a web; el contenedor nativo declara su descripción
accesible. Las gráficas se han revisado visualmente en Android; TalkBack sigue
pendiente de validación.
`Brand.tsx` y el layout del frontend aportan la marca y las familias tipográficas;
`components/finance.tsx` aporta la estructura de las filas de activos, y
`app/settings.tsx` / `app/security.tsx` la organización de ajustes y seguridad.
Las primitivas nativas se integran en `wallet-ui.tsx`; los handlers continúan
perteneciendo a la wallet, sin sustituirlos por los servicios mock del frontend.
Los assets y sus licencias están en `src/design`; las fuentes proceden de
`@expo-google-fonts/dm-sans@0.4.2` y
`@expo-google-fonts/instrument-serif@0.4.1`. Las marcas de redes conservan
sus originales y las referencias de `assets/ecosystem/sources.json`.

Aplicación **React Native/Expo con entrega Android**, custodia local,
conexiones HTTPS explícitas y permisos firmados en los dominios originales.
La pantalla **Cartera** usa Ethereum, Bitcoin y Solana mainnet mediante la API
`https://api.lianum.oryontechnology.com`; genera o restaura las direcciones y
firma en el móvil. No necesita el ordenador para consultar saldos. Direcciones,
QR y consultas están comprobados en Android; el primer envío real sigue pendiente.
MoonPay permanece desactivado hasta configurar la cuenta del proveedor.

Las cuentas privadas PAEG y DeFi conservan **ledgers locales** y conexiones
separadas. Su recorrido financiero completo en Android y su publicación en
redes reales siguen pendientes. Las instrucciones de conexión al ordenador
de esta guía pertenecen a ese recorrido privado.
La [APK vigente y la evidencia de cada generación](../../STATUS.md) se registran
en STATUS; los artefactos anteriores descritos aquí son históricos.

La app abre **Cartera**. La cartera de la demo sólo incorpora lecturas autorizadas y separa cantidades
por activo, dominio, raíz y generación. No suma ETH, BTC, SOL, notas o
participaciones como si fueran una sola moneda. UNKNOWN, STALE y una lectura
caducada muestran **Saldo por consultar**. El último importe confirmado conserva
su hora y se identifica como histórico, sin presentarse como disponible actual.
Los trabajos pendientes permanecen en sus custodias originales.

La navegación principal contiene **Inicio**, **Operaciones**, **Agente**,
**Aprobaciones** y **Más**. El historial se abre desde Inicio. Más conserva
seguridad, recuperación y las conexiones avanzadas. Operaciones presenta
los envíos registrados y permite abrir los planes y estrategias guardados.
Las conexiones de pruebas siguen identificándose en sus revisiones originales.
Agente conecta con el servicio persistente y el modelo real mediante la API
firmada del dispositivo. Su cabecera, orbe, bienvenida, compositor y paneles
siguen el código de `features/agent/AgentScreen.tsx` del frontend completo.
El orbe refleja conexión, trabajo y respuesta; las transiciones y pulsaciones
respetan movimiento reducido. El compositor crece con el texto y se adapta al
teclado Android. Los mensajes aparecen de inmediato; la recepción se confirma
por separado y un reintento conserva el mismo identificador. Si se cambia de
pestaña durante un envío no confirmado, queda disponible para reintentar.
Los fragmentos llegan por SSE autenticado mediante XHR incremental nativo. El
indicador de espera tiene un pulso suave y desaparece al primer texto recibido,
incluso si el servidor aún está cerrando el turno. Con movimiento reducido el
indicador permanece estático. Las respuestas progresivas se sustituyen por el
resultado guardado, con texto
formateado, enlaces HTTPS, tarjetas de observaciones y propuestas verificables.
El scroll conserva la posición al leer mensajes anteriores y ofrece volver al
último mensaje. Ajustes incluye tareas, memoria editable y permisos reales.
El chat remoto permanece en el servidor al bloquear o actualizar la app; el
borrador se conserva entre pestañas durante la sesión desbloqueada. Si el
servicio no está disponible, se informa sin fabricar una conversación local.
La voz y las notificaciones siguen pendientes. No se importan datos ni propuestas
ficticias del prototipo. Aprobaciones permite revisar enlaces
de propuestas recibidas mediante el controlador original; no fabrica un inbox
remoto ni un número de solicitudes pendientes sin haberlas consultado.

El botón Atrás de Android cierra primero el teclado o un panel abierto, después
vuelve por los detalles de la cartera y el historial de secciones. En Inicio,
sin paneles ni pasos internos, deja actuar al sistema. Las secciones con
operaciones conservan los bloqueos y el propietario de su transporte. El estado
del recorrido se reinicia al bloquear la sesión. El indicador de espera usa una
onda de brillo por letras y puntos escalonados, con animación nativa y sin
movimiento cuando se activa esa preferencia.

## Conectar el teléfono al ordenador

1. En la entrada, pulsa **Crear mi wallet** o desbloquea la identidad existente.
   Su clave pública aparece en **Ajustes → Herramientas avanzadas y recuperación**;
   cópiala para vincular el servidor con esta misma wallet.
2. Ejecuta `./dev platform paged-native-new` en el ordenador. Pega esa clave y
   elige una dirección accesible desde el teléfono; el asistente prepara TLS y
   los archivos del servidor.
3. Copia al teléfono el contenido público de
   `paired-connection.json` de la ruta que imprime el asistente y pulsa
   **Importar conexión del ordenador** en **Operaciones**. Comprueba el origen
   y la huella del certificado que muestra la app.
4. Mantén el servidor abierto mientras utilizas sus notas. Para DeFi, ejecuta
   `./dev platform defi-new` en otra terminal e importa su conexión propia
   en la pestaña **DeFi**.

El transporte local incluido en el APK exige Android 10 o posterior y biometría
fuerte configurada. En WSL, una IP privada del proceso puede no ser accesible por
Wi-Fi: la [guía del servidor](../platform/README.md) incluye la alternativa USB
con ADB para los puertos de los perfiles seleccionados. Sólo el perfil público
se lleva al teléfono; `operator.json` contiene la configuración privada del servidor.

## Operaciones PAEG desde la app

1. Conecta el paquete original de la wallet y consulta su estado.
2. Ingresa fondos en la nota. La app prepara D26 y solicita su financiación
   original sin pedir comandos técnicos.
3. Define presupuesto y plazos. Añade pagos con red, dirección, importe y pasos
   anteriores que deben completarse. Guarda los pagos y revisa la operación.
4. Pulsa **Autorizar y ejecutar la operación**. La app firma las páginas y utiliza
   el mismo runner del SDK para reservar, comprobar dependencias, enviar,
   admitir recibos, guardar resultados y liquidar.
5. Consulta el avance y retira las salidas disponibles mediante su autorización
   propia. Si una red tiene una confirmación pendiente, **Continuar ejecución**
   consulta el mismo envío; una respuesta perdida exige observar su trabajo.

El formulario convierte texto decimal a unidades mínimas con aritmética exacta:
ETH a wei, BTC a satoshis y SOL a lamports. El importe nativo de cada pago se
mantiene separado de la **reserva del paso en unidades de la nota**. No se
inventa un precio de conversión entre ambos. La conexión ofrece destinos rápidos
y permite una dirección libre validada por el runtime correspondiente.

Las tres conexiones actuales son **Ethereum local**, **Bitcoin regtest** y
**Solana local**. Bitcoin admite destinos regtest P2WPKH `bcrt1…`; Ethereum
comprueba un destinatario EOA y Solana valida su dirección y las condiciones
del destino. Sus importes, límites, comisiones y finalidades se comprueban en
cada runtime. El formulario no presenta una estimación de comisión que el
proveedor no haya entregado.

El runner compartido está en
[`mobile-protocol/device-paged-operation-runner-v3.mjs`](../../packages/mobile-protocol/src/device-paged-operation-runner-v3.mjs);
la entrada de `src/api/` reexporta esa misma implementación.
Pide `NEXT_COMMAND` por el canal privado y ejecuta el siguiente comando original.
El motor genera los índices, dependencias, testigos, recibos y salud del quórum;
la app no exige pegarlos como JSON. El runner recibe un puerto autenticado y delega firmas, pruebas y llamadas RPC
en sus implementaciones originales. La confirmación
pendiente o un resultado adverso detienen el avance automático.

## Artefacto histórico de sesión e interfaz

Este apartado describe únicamente el corte anterior; no acredita las funciones
nuevas ni su instalación. Consulta [STATUS](../../STATUS.md) para la APK vigente.

[APK histórico 5b61f259](../../.local/mobile/artifacts/android-standalone-5b61f259-ef9a-4ea0-8c27-3d79e65b1c12/app-release.apk), instalado por actualización sin
borrar datos. SHA256 `9970a7af0fe0666c55b95b2b855e352b1d1fd98d4f7bce995b10aeb63a1385e9`;
43.779.779 bytes; generación
`bb71fdb0a09c7768c98b60706f38bacbef9c8a32b87f677fc7105a92f399db40`.
[Verificación de empaquetado](../../.local/mobile/artifacts/android-standalone-5b61f259-ef9a-4ea0-8c27-3d79e65b1c12/native-transport-verification.json):
los quince archivos principales de sesión/UI coinciden con el bundle instalado,
Hermes sin Metro, ARM64/x86_64 y certificado Debug original.
En ese corte pasaron TypeScript y quince comprobaciones focales de sesión/custodia.
Su UI se observó en el Samsung. La migración de la custodia existente exige
una huella inicial adicional; no se enviaron pagos durante aquella actualización.

## Entrada y navegación

Cartera, Operaciones, DeFi y Ajustes forman la navegación principal. La entrada
abre una sesión mediante una lectura biométrica de la identidad. Consultas y
preparaciones usan esa sesión; no generan autorizaciones financieras por sí
mismas. La sesión se bloquea al pasar a segundo plano, tras quince minutos sin
interacción o a los treinta minutos de su apertura.

Los ROOT existentes conservan su entrada autenticada. Una primera lectura de
migración crea un sobre AES-GCM ligado a la identidad y al namespace exacto;
puede pedir una huella adicional una sola vez por custodia existente. Después,
el sobre se abre con la clave de sesión. Al bloquear, los buffers mutables se
borran y las continuaciones de los Vaults quedan revocadas.

Los importes, destinos y redes se revisan antes de autorizar el movimiento.
La conexión pública de Operaciones se conserva y se consulta automáticamente
mientras está activa. Las consultas automáticas se pausan al editar pagos en
BUILDING; cambiar manualmente de conexión tiene prioridad sobre el polling.
Cambiar entre Cartera y Operaciones mantiene esa conexión;
cambiar a DeFi espera al cierre del transporte anterior. Los datos técnicos y
las copias de recuperación quedan en tarjetas plegadas.

## Autorización de una operación

La revisión económica muestra pagos, destinatarios, reservas y plazos antes de
abrir una autorización de **hasta 30 minutos con la app en primer plano**. Una
huella sensible confirma esa operación y renueva la entrada porque es una
autenticación nueva. Los comandos de ese grafo cuentan como actividad para el
límite de quince minutos de inactividad; no amplían el máximo de treinta minutos.
La autorización queda ligada al descriptor, raíz de custodia, ID del grafo, raíz de autorización
y nullifier de reserva originales; no concede acceso a otro grafo o proveedor.

Durante la sesión, cada comando obtiene y firma un **permiso original nuevo de
15 segundos**. Se vuelven a comprobar su alcance y la vigencia antes de firmar;
la sesión no conserva permisos reutilizables ni sustituye las firmas de las
notas, las pruebas o la aceptación en cadena. **Depósitos, retiros y DeFi quedan
fuera de esta autorización de ejecución** y mantienen sus permisos específicos.

La autorización de ejecución y su copia de clave viven sólo en memoria. **Pausar ejecución**,
la cancelación, el cierre, pasar a segundo plano o el vencimiento borran los
buffers mutables y revocan la sesión. Los pagos ya enviados conservan sus IDs y
su estado para consultar; pausar la app no deshace una transferencia en otra red.

La copia cifrada conserva identidad, páginas y aperturas ya creadas. Se necesita
una copia nueva tras preparar nuevas páginas; una copia antigua no contiene las
claves posteriores. Restaurar requiere la misma identidad y lecturas originales
antes de nuevos efectos. Una preparación local o una firma todavía no representan
fondos disponibles.

## Costes y pago al proveedor

Cuando el grafo está FULFILLED, **Consultar costes y pagos** muestra los hechos
originales de cada red y el reparto de la nota. Las comisiones se muestran por
activo y unidad; un coste desconocido permanece sin dato confirmado. No se
calcula un precio de mercado ni se convierte gas, ETH, BTC, SOL o tokens en
unidades demo.

Retira primero el **Saldo restante** mediante su autorización propia. Después,
**Autorizar pagos al proveedor** revisa el beneficiario original y las salidas
exactas. Una aprobación biométrica específica permite completar esos pagos,
hasta treinta minutos en primer plano: en el recorrido mixto son cuatro salidas.
Cada W39 mantiene su firma de nota y un permiso nuevo de quince segundos. La
app usa el mismo helper del SDK y comprueba cada cobro y la conservación de las
unidades demo; las notas siguen bajo custodia del propietario hasta retirarlas.
Esto no demuestra cobro autónomo de un solver ni beneficio de mercado.

Una salida retirada a otra dirección no cuenta como cobro del proveedor. Si
falta su confirmación original, el pago permanece bloqueado. Cancelar, cerrar
la custodia, bloquear, salir al fondo o vencer la autorización revoca las hojas
pendientes; los envíos confirmados conservan su historial.

## Cartera por conexión

Al completar una operación que incluye Uniswap, **Consultar token recibido en
Uniswap** abre la conexión y custodia ERC20 originales de ese paso. Comprueba
trabajo, raíz y compromiso; conserva la nota existente. Al consultar una
recepción D27 en DELIVERY_UNKNOWN, la app pide una observación original y vuelve
a leer el estado. Esa consulta no repite el intercambio ni su prueba y mantiene
intacta una recepción todavía PROVED. Si falta la confirmación, conserva el
estado pendiente. El grafo completado no convierte por sí solo ese token en
saldo disponible ni autoriza retirarlo; se necesita la lectura de su custodia
propia y una autorización de retirada separada.

Al entrar se consultan secuencialmente las conexiones registradas y sus rutas
originales. **Cartera** agrupa sus fondos por activo y unidad, separa disponible,
reservado y ligado a operaciones, y cuenta una sola vez la misma nota o posición.
La consulta cifrada Paged incluye fuente, cambio, recuperación y resultados con
su estado real de emisión y gasto. La cartera indica cuántas consultas siguen
vigentes; abrir una fila selecciona su conexión y custodia exactas. No convierte
monedas o participaciones a un total común ni cubre custodias sin registrar.

Un saldo LIVE requiere su lectura original vigente. Cambiar de pantalla y
cerrar el transporte conserva la DATA de la consulta durante su vigencia
original de quince segundos. Al caducar, cambiar la custodia o quedar pendiente,
el importe anterior se muestra como histórico y la acción necesita consultar
de nuevo. La actualización automática del grafo vuelve a consultar sus salidas.
Una posición retenida por el servicio
conserva custodia BACKEND; una nota del dispositivo conserva custodia DEVICE.
Las estimaciones de subyacente no son fondos gastables. Con el servidor apagado
se pueden conservar conexiones y copias, pero no obtener disponibilidad actual.

## Copia conjunta y recuperación desde bloqueo

**Ajustes → Copia y recuperación conjunta** conserva la identidad, las conexiones
públicas y las custodias Paged y DeFi registradas. Guarda la copia y su contraseña
por separado, y crea otra copia después de nuevas páginas, notas o trabajos.
Las custodias antiguas sin conexión registrada y los journals del servicio
requieren sus copias específicas.

La entrada mantiene **Restaurar mi copia conjunta** disponible aunque falle el
login o la sesión esté LOCKED. Introduce la copia completa y su contraseña,
revisa la identidad y pulsa **Comprobar y restaurar**. El paquete y cada corte
conservan autenticación AEAD, identidad, namespace, revisión y CAS originales;
una identidad o una custodia distinta no se sobrescriben.

La recuperación desde LOCKED usa una aprobación biométrica específica y un
token privado de un uso, ligado al paquete, identidad y señal de cancelación,
con un máximo de sesenta segundos y revocación al cambiar la época de sesión o
pasar a segundo plano. Después de instalar la misma identidad, la entrada se
abre mediante su lectura protegida normal y se restauran las custodias. Puede
pedir la huella de recuperación, la de entrada y las autenticaciones originales
que necesite cada custodia. No se abre una sesión ni se autoriza dinero mediante
un snapshot de datos.

Restaurar la copia no confirma saldos, reconstruye permisos ni recupera journals
externos. Antes de mover fondos se requieren el servicio original, su estado
conservado y nuevas lecturas originales.

## Acciones DeFi y posiciones

**DeFi** reconoce las conexiones originales de nota ERC20, Uniswap, Aave,
Morpho Blue y MetaMorpho. Su recorrido guiado muestra el siguiente paso para
financiar, reservar, convertir, confirmar y consultar o retirar sus resultados,
con los permisos y salidas de cada protocolo. Desde Operaciones se accede a DeFi
y desde **Ver mis posiciones** se vuelve a sus acciones.

La consulta de posiciones y las acciones de gasto tienen autorizaciones distintas.
Las participaciones, su valoración y los fondos reservados no se convierten en
saldo disponible. Estas acciones utilizan sus relaciones originales ExternalFlat:
la navegación común **no las convierte en admisiones nativas del grafo Paged**.
La preparación opcional de Uniswap local como nodo Paged utiliza D27 original y
exige verificar su copia ERC20 antes de añadirlo. Su salida conserva custodia
propia; no financia automáticamente otros nodos. La aceptación de cada recorrido
mixto se acredita por separado en [STATUS](../../STATUS.md). Otros protocolos
DeFi y los resultados SPL conservan sus límites de integración específicos.

## Alcance actual

TypeScript y las comprobaciones HOST usan SDK, firmas, AEAD y custodia originales,
con fronteras Expo y de cadena declaradas cuando están simuladas. La comprobación
focalizada de sesión rechaza otro grafo, retiradas y permisos caducados; verifica
una firma fresca sin repetir biometría o lecturas de claves y la revocación tras
segundo plano/cierre. Estas comprobaciones no acreditan aislamiento de hardware,
biometría física ni operación en redes públicas.

La aceptación financiera conjunta, recuperación y artefactos actuales se
registran en [STATUS.md](../../STATUS.md). El bloque nuevo incorpora reapertura
Mixed, conciliación de respuesta perdida y cartera registrada conjunta; su
recorrido económico completó cuatro reinicios, veintiuna pruebas, las cuatro
entregas y liquidaciones, con cartera 600 → 400 → 0 y token Uniswap separado.
El APK de ese corte está compilado, conservado y verificado. La comprobación
corta en Samsung pasó: sesión, importación, TLS, consulta firmada, navegación
y reconexión. La operación financiera completa y cartera con fondos desde
ese teléfono siguen pendientes. Incluye 61 módulos comprobados contra el mapa de fuentes
y 203 inputs sin cambios durante la compilación. El transporte Android tiene
verificación de empaquetado propia, sin atribuirle aceptación financiera HOST.
El recorrido mixto anterior de la generación
`8eab00d36eaa9602a20dfd572d0d95228817df1061a0fad4145a346f9c48bfc2`
completó los cuatro pasos en el ordenador, con veinte pruebas Paged, una D27 y
las liquidaciones originales. Se utilizó el SDK con custodia de software HOST;
esta aceptación no acredita biometría o ejecución física de la nueva APK, iOS
ni reapertura en frío del perfil Mixed. Su APK anterior está conservado;
la verificación de empaquetado de cada corte se registra por separado en STATUS.

Un recorrido financiero **histórico** de
las tres redes terminó con trece pruebas originales, finalidad de las tres
entregas, grafo FULFILLED y retirada de 300 unidades de cambio. Se usaron los
mismos SDK y ejecutor móvil con custodia de software en Node; la operación
completa de este bloque en teléfono físico permanece pendiente.

## Histórico del primer ingreso físico

Este corte anterior conserva su evidencia y no acredita la nueva liquidación,
cartera ni recuperación desde LOCKED.

El [APK histórico conservado](../../.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/app-release.apk)
está compilado, verificado e instalado en Samsung: **43.650.119 bytes**, SHA-256
`7243b9c175dd1a467f937123a9764a8ca2af5be66017f3d3cf263260eac9ec76`.
Generación de fuentes:
`0e41709b86803f3a6369a47d54da471edaa7bac0b9f56bf4b3727067cd446dbd`.
Las entradas de fuentes coinciden antes y después. El build terminó en
**unos 53 segundos**. Incluye JavaScript/Hermes sin Metro, ARM64, x86_64 y el mismo
firmante Android Debug. Se conservan el [informe de compilación](../../.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/build-report.json),
el bundle, su mapa y la [verificación del empaquetado](../../.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/native-transport-verification.json).

Mantiene la corrección de ciphertext base64 a bytes para AES nativo y el préstamo
de raíz sólo para lectura del mismo namespace, con su AbortSignal y un máximo de
60 segundos; se borra al terminar, cancelar, cerrar o vencer. La corrección de ese corte
separa el epoch real de los mensajes de la caducidad monotónica local. Conserva
los permisos de 15 segundos y el adelanto máximo de 3 segundos; la sesión de
lectura no guarda la clave de firma del propietario.

**Continuar ingreso preparado** recupera la misma nota, apertura, importe y
trabajo después de una lectura original que confirme ausencia de prueba. Una
época vencida sólo renueva época y firma D26, junto con sus hashes. Depósito,
financiación y comandos del grafo guardan el pendiente antes del challenge y
validan un token privado de un uso después de firmar, sin abrir ROOT otra vez.
Seleccionar red, destino o dependencias no provoca refrescos protegidos.
La recuperación pasó cuatro comprobaciones focales/HOST en 19,44 segundos;
En ese corte pasaron TypeScript y límites. Ese APK añadió diagnóstico por fase y código
acotados, sin datos privados.

Android aceptó la actualización conservando identidad, namespace y operador;
el hash instalado está verificado. En el Samsung se confirmaron la [prueba D26
original](../../.internal/runtime/omnichain-product/evidence/paeg-proof-attempts/8a623959-4419-455c-bc51-dd622002fa7c.json),
la financiación con una autorización nueva y la lectura posterior de **600
unidades disponibles**. El [checkpoint físico](../../.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/funded-physical-paged-f267-v1.json)
acredita ese ingreso en el operador común local. El grafo de tres redes, las
retiradas y DeFi desde el teléfono siguen pendientes. La importación y el READ
anteriores, realizados con `9af3816e`, conservan su [evidencia propia](../../.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/paired-signed-read-wall-clock.json).
El [diagnóstico del reloj de WSL](../../docs/USB-MOBILE.md#comprobación-física-realizada),
el APK anterior `ccda916f` y los resultados financieros de sus fuentes siguen
siendo históricos; no acreditan la generación vigente.

## Estructura

- `src/screens/`: pantallas y consentimiento.
- `src/custody/`: clave local, firma y operación pendiente cifrada.
- `src/api/`: transporte del protocolo móvil y estado público del servicio.
- `plugins/`: configuración nativa generada, incluido el límite de compilación Android.
- `tests/`: compatibilidad criptográfica, límites y pruebas de host con fronteras
  nativas simuladas explícitamente.
- `../../packages/mobile-protocol/`: contrato público compartido con el servidor.

## Outbox de admisión legado

La pantalla avanzada **Conexión avanzada** y el outbox V1/V2 pertenecen a la
ruta de admisión histórica, separada del recorrido Paged actual.
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

Las aceptaciones económicas citadas aquí son históricas y corresponden a sus
propios cortes de fuentes; no acreditan la nueva APK ni el bloque actual.

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

Abre **DeFi → Ver mis posiciones**. Elige una conexión registrada o pulsa
**Importar conexión de posiciones** para importar el perfil público original.
Su descriptor y permisos son propios: no reutilizan los permisos de notas
Paged ni los de conversión ExternalFlat.

La sesión abierta firma las dos consultas originales de acceso y lectura, con
permisos frescos de quince segundos; consultar no autoriza gastar. **Actualizar
la cuenta seleccionada** obtiene otra lectura al caducar. Cancelar o salir al
fondo cierra el transporte y revoca la revisión.

La pantalla separa participaciones disponibles, reservadas, bloqueadas y en
recuperación. UNKNOWN y datos caducados quedan por consultar.
La estimación del subyacente no es saldo gastable ni garantía de liquidez.
Esta vista no prepara ni transmite TOP_UP, GRAPH, EXIT o redenciones. Las
acciones de estas posiciones y shares requieren sus propias cuentas y notas
del dispositivo creadas antes de financiar; las posiciones Linux no se convierten
en autoridad de gasto móvil. La nota ERC20 fuente se gestiona en **DeFi**. La salida de notas nativas usa su bridge original
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

En **DeFi**, importa el perfil público de conexión entregado por el operador del
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
reales de Gradle. El corte histórico `b52d49a6-9cd4-4230-9591-8d9afa7346e6`
comprobó 85 inputs iguales antes/después y 36 joins del bundle: **42.841.007 bytes**,
SHA-256 `bdc836079db34161a793fcc0f383351890e3b79ddfee421c74f5148b4be2dbaf`,
con JavaScript/Hermes incluidos y sin Metro. Incluye copia RootNote cifrada,
publicación de saldo original tras ejecución/W39 y espera del resultado
en los dos SDK de retirada admitida, conservando permisos y guards originales.
[APK de ese corte](../../.internal/dev/reports/mobile-android-standalone-local/attempt-b52d49a6-9cd4-4230-9591-8d9afa7346e6/app-release.apk) ·
[informe original](../../.internal/dev/reports/mobile-android-standalone-local/attempt-b52d49a6-9cd4-4230-9591-8d9afa7346e6/report.json).
La copia local está en `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
GRAPH `1159c12e…` recorrió 14 pruebas, respuesta perdida de W39, restores
software SOURCE/SHARE/PoP y READ de notas gastadas confirmadas sin nuevos
efectos financieros. Su RAW terminó rechazado por un contador del replay HTTP403;
`56f8212` lo corrige con una regresión focal, sin repetir financiación. No se
alcanzó la captura original de cuatro secciones ni la reapertura del backend.
Ese corte no cambia el alcance Node/TLS de sus recorridos ni acredita hardware.
El informe de compilación del bloque actual está en STATUS; su comprobación en
el teléfono permanece pendiente.

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
y aceptaciones locales descritas arriba. El bloque Paged automatiza la ejecución
y conecta tres ledgers locales. Faltan uso financiero en teléfono, operación en
redes públicas, migración y recuperación ante pérdida abrupta, custodia multinota
de shares propia del dispositivo y el recorrido privado DeFi completo en PAEG.
Las otras cuatro redes quedan fuera de este bloque de entrega de tres redes. El executor API/SQL
legado sigue cerrado; su disponibilidad no acredita el estado económico de las
nuevas rutas originales.

## Custodia y comprobaciones

La clave se genera mediante `expo-crypto.getRandomBytesAsync`, se conserva en
SecureStore con `requireAuthentication: true` y, en iOS, accesibilidad
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. La clave pública se almacena por separado.
Cambiar la biometría puede invalidar la clave protegida; el cliente falla y no
la reemplaza silenciosamente. Las copias exportadas están cifradas; las claves privadas no se envían sin
cifrar al servidor.

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

## Principal y Pruebas — preparación del 17 de octubre

El selector superior cambia el entorno de toda la cartera. Principal conserva
las cuentas existentes; Pruebas utiliza Ethereum Sepolia, Bitcoin testnet3 y
Solana devnet. Los saldos y el historial se filtran por red. Las valoraciones
con cotizaciones de mercado en Pruebas son sólo referencias, sin valor monetario.
Las operaciones privadas y DeFi de esta entrega se abren desde Pruebas.

La primera activación del otro entorno requiere autorización biométrica para
derivar sus cuentas públicas desde la misma raíz protegida. No reemplaza las
cuentas ni genera otras palabras. El formato de recuperación cifrada V4 se
conserva: al restaurar la raíz original, activar de nuevo el otro entorno
regenera las mismas direcciones. Ethereum y Solana pueden compartir dirección
entre redes; la dirección por sí sola no identifica el entorno.

El servidor debe instalar primero el código que separa los journals por entorno
y después habilitar las seis redes. El journal principal mantiene su ruta y
huella de configuración originales; el de pruebas reside en `testnet-v2` dentro
del directorio del mismo propietario. En envío, cancelación y consulta, la nueva
APK incluye el `networkId` firmado. Las peticiones antiguas de mainnet siguen
funcionando. Una revisión preparada antes de cambiar de entorno deja de ser
utilizable; un envío ya firmado con resultado incierto sólo se observa al reintentar.

La APK preparada está en
`.local/mobile/artifacts/android-lianum-environments-20261017/app-release.apk`.
Sus evidencias de compilación y pruebas son `20261017-environments-*` en
`.local/maintenance`. La instalación y aceptación en Android físico quedan
pendientes de la disponibilidad del dispositivo y del despliegue compatible.
