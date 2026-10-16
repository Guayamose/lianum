# API y SDK del producto

## Entrada de SDK

`@lianum/sdk` reutiliza la implementación remota real de propuesta y lectura del
agente. Las entradas `@lianum/sdk/agent`, `@lianum/sdk/agent/operation`,
`@lianum/sdk/agent/preparation` y `@lianum/sdk/contracts` conservan nombres y
versiones de protocolo. El paquete depende de protocolo/criptografía, nunca de
`apps/mobile`. Los paths móviles anteriores reexportan la misma instancia para
no duplicar brands privados del SDK. Por ahora es un paquete privado del
workspace; no se ha publicado un paquete npm ni un SDK financiero universal.

```js
import {createDevicePagedAgentNativeProposalV4, createDevicePagedAgentApiV4}
  from '@lianum/sdk/agent';
import {createDevicePagedAgentProposalLinkV4} from '@lianum/sdk/agent/operation';

// agentKey es la clave del agente; descriptor fue compartido por la wallet.
const proposal = createDevicePagedAgentNativeProposalV4(agentKey, descriptor, terms, nodes);
const link = createDevicePagedAgentProposalLinkV4(proposal);
// Entregar link a la wallet: recibirlo no inicia ni autoriza pagos.

// Después de la autorización, la wallet comparte un readerGrant finito.
// pinnedFetch es un transporte del host que verifica el certificado original.
const reader = createDevicePagedAgentApiV4({descriptor, agentKey, grant: readerGrant, fetchImpl: pinnedFetch});
try { const progress = await reader.observe(); } finally { reader.close(); }
```

Los DTO de `@lianum/sdk/contracts` documentan rutas de wallet; no dan esos
permisos al agente. No se importa `@lianum/engine/api/sdk` para enviar operaciones
reales: esa clase declara expresamente **SIMULATION_ONLY**.

## Roles y autoridad

| Rol | Puede hacer | La autoridad procede de |
| --- | --- | --- |
| Wallet del usuario | Consultar, preparar, revisar, firmar los términos exactos y recuperar su operación | Custodia original del móvil y permisos firmados, con límites de destino, importe, plazo y presupuesto |
| Agente externo | Firmar una propuesta DATA y consultar el progreso autorizado | Su propia clave más un permiso de lectura firmado por la wallet |
| Motor remoto | Continuar el grafo ya aprobado y comprobar resultados | START_AUTOMATION original y sus límites; una propuesta o un estado JSON no autorizan a gastar |
| MoonPay futuro | Checkout, identidad/eligibilidad y estado del proveedor | Configuración del comerciante y webhooks verificados; su estado no sustituye confirmación onchain |

Las claves personales del usuario permanecen en su móvil. El SDK externo no
importará custodia móvil ni aceptará callbacks genéricos que emitan permisos de
gasto. La clave propia del agente sólo firma propuestas y pruebas de posesión de
su permiso de lectura. `revoke()` del agente revoca **lectura**, no detiene el grafo;
STOP_AUTOMATION pertenece al usuario y al recorrido ya existente.

## Transportes y autenticación existentes

1. API pública de wallet: HTTPS, `POST /v1/auth/challenge`, cuerpo exacto
   `{origin,path,bodySHA256,devicePublicKey}`. La siguiente petición lleva
   `{challenge,signature,body}`; `body` es la cadena JSON exacta cuyo hash se
   firmó. Challenge de 60 s, ligado a origen/ruta/cuerpo/identidad y de un uso.
2. Motor emparejado: descriptor, identidad, génesis, vencimiento, pairing y
   certificado fijados. No sustituir endpoint, certificado o pairing por datos
   recibidos con una propuesta. Graph y agente usan
   `x-lianum-paged-pairing-id`; DeFi usa `x-lianum-defi-pairing-id`.
3. Comandos privados de graph: challenge firmado ligado a acción, graphId,
   jobId, rootId, revisión, hash del comando y destinatario de respuesta. El
   contenido del comando y la respuesta privada usan el transporte cifrado
   existente. Los objetos originales del SDK se conservan como tales; copiar
   JSON no restaura sus capacidades.
4. Lectura externa: grant V4/V5 firmado por la wallet y PoP de 15 s firmado por
   la clave del agente. Nunca se comparte la clave de la wallet. El consumidor
   necesita un transporte que verifique el certificado recibido originalmente;
   no se recomendará desactivar TLS para usar el SDK.

Fuentes: `packages/crypto/src/native-wallet-auth-v1.mjs:4`,
`packages/backend/src/public-wallet/http-service-v1.mjs:126`,
`apps/mobile/src/api/device-paged-graph-api-v3.mjs:19`,
`packages/backend/src/api/mobile/device-paged-agent-read-v4.mjs:31`.

## Rutas actuales

Todas las rutas siguientes son existentes. Los sufijos de versión de los DTO y
módulos no implican que haya una URL nueva con ese sufijo.

| Grupo | Rutas | Consumidor |
| --- | --- | --- |
| Servicio | GET `/health`, GET `/v1/fiat/capabilities` | Consulta pública limitada |
| Descubrimiento | POST `/v1/wallet/connections` | Wallet autenticada; devuelve sólo perfiles de su misma identidad |
| Wallet nativa | POST `/v1/native/account`, `/prepare`, `/submit`, `/status`, `/cancel` | Wallet autenticada; envío requiere transacción firmada localmente |
| Graph | POST `/v1/mobile/paged-owner/graph/pairing`, `/challenges`, `/operations` | Wallet original emparejada |
| Agente | POST `/v1/mobile/paged-owner/agent/challenges`, `/observations`, `/revocations` | Agente con grant de lectura |
| Salida privada Uniswap | POST `/v1/mobile/external-flat-share/challenges`, `/status`; el listener activo original admite `/operations` sólo con OBSERVE_D27 | Wallet emparejada; las rutas de recuperación capturada son sólo challenges/status |
| DeFi | POST `/v1/mobile/sepolia-defi-shares/challenges`, `/defi-proposals`, `/defi-reviews`, `/defi-read-review`, `/defi-authorizations`, `/reviews`, `/private-operations`, `/operations`, `/status` | Wallet DeFi original; propuestas requieren ACCESS firmado |
| DeFi financiero | Mismo prefijo + `/financial-submit`, `/financial-observe`, `/withdrawal-review`, `/withdrawal-arm`, `/redeem-submit` | Wallet y job ya revisados; continuación original en el servidor |
| MoonPay futuro | POST `/v1/fiat/sessions`, `/v1/fiat/orders/read`, `/v1/fiat/orders/reconcile`, `/v1/fiat/moonpay/webhook` | Wallet autenticada, excepto webhook crudo firmado por proveedor |

`GET /v1/fiat/orders/:id` aparece en el dispatcher interno de MoonPay, pero el
servidor público actual sólo admite POST para órdenes. **No se ofrece ese GET
como contrato publicado**. Para leer se usa `/v1/fiat/orders/read`.

Fuentes: `packages/backend/src/public-wallet/http-service-v1.mjs:130`,
`packages/backend/src/api/mobile/device-paged-agent-transport-v4.mjs:7`,
`packages/backend/src/accounts/authority/device-sepolia-defi-shares-http-v4.mjs:12`,
`packages/backend/src/accounts/authority/device-sepolia-defi-financial-http-v8.mjs:14`,
`packages/backend/src/fiat/moonpay-http-v1.mjs:5`.

## Recorrido nativo individual

1. `/native/account` recibe la cuenta pública validada de la wallet y devuelve
   saldo, disponible, reservado y bloque observado de la red configurada.
2. `/native/prepare` recibe `{operationId?,account,recipient,amountAtomic}` y
   devuelve la cotización exacta con máximo de comisión y vencimiento de 120 s.
   El integrador conserva su `operationId` UUID antes de pedirla.
3. La wallet muestra términos y firma la transacción con su custodia real.
4. `/native/submit` recibe `{quoteId,rawTransaction}`. El servidor persiste la
   transacción y su hash antes de transmitir; una repetición de los mismos bytes
   **observa** el original. Otros bytes para esa cotización se rechazan.
5. `/native/status` recibe `{id}`; acepta el identificador de operación o hash
   retenido. `/native/cancel` sólo cancela una cotización todavía sin firmar.

Estados del API: PREPARED, EXPIRED, SUBMITTED, UNKNOWN, CONFIRMED, FINALIZED,
FAILED; `terminal` distingue observación definitiva. CANCELLED interno se muestra
FAILED con su código de cancelación. La UI tiene una proyección más pequeña;
no debe sustituir los estados del API al publicar el contrato.

Fuente: `packages/backend/src/native-wallet/index.mjs:16-47`.

## Operación privada y futuro agente

Flujo actual: propuesta DATA firmada → preparación local y cotización real →
revisión económica original → autorización del usuario → SIGN_GRAPH →
START_AUTOMATION → ejecución/remuneración/observación en servidor → resultado o
recuperación original. BEGIN/PREPARE/APPEND/SEAL no son una autorización de pago.

La propuesta V4 admite sólo `ethereum-sepolia`, `bitcoin-testnet` y
`solana-devnet`, hasta 256 nodos ordenados con dependencias a nodos anteriores.
Cada nodo fija destino, importe del activo y remuneración acordada al proveedor.
El servidor obtiene la cotización y el usuario revisa los términos completos.
El grafo paga al proveedor según su liquidación original; no se promete deshacer
una entrega ya confirmada en otra red. Presupuesto y activo entregado no se suman.

La revisión tiene que conservar presupuesto, plazos, destinos, importes,
dependencias y cotizaciones. El grant de lectura queda ligado a descriptor,
graphId, rootId, revisión y términos de automatización. Cambiar esos términos
exige otra revisión/autorización. El agente no puede introducir más pagos durante
la ejecución de una operación ya aprobada.

Graph admite comandos existentes: BEGIN_GRAPH, PREPARE_NATIVE_PAGE, APPEND_PAGE,
SEAL_GRAPH, SIGN_GRAPH, OBSERVE_GRAPH, START_AUTOMATION, STOP_AUTOMATION y los
comandos originales de prueba/reserva/recuperación/consulta económica. El SDK
externo mínimo no publica un `submit(action, arbitraryBody)` que se haga pasar
por la wallet.

Progreso de lectura externo: PREPARED, RESERVED, FULFILLED, RECOVERED, `pending`,
automatización y número de pasos completados/total. No devuelve todos los
recibos ni permite ejecutar recuperación. `snapshot()` es una copia histórica
con `current` calculado y `financialPermission:false`; guardarlo no renueva su
vigencia. Un error o una lectura vencida no equivalen a operación fallida.

La wallet guarda la asociación firmada con su fuente **antes de BEGIN**. Al
reabrir, compara propuesta, root/revisión y páginas originales; consulta el
servidor y continúa su cursor. Una respuesta perdida de BEGIN/APPEND/SEAL no
crea otra operación. No firma START automáticamente. La consulta previa y la
revisión original siguen siendo obligatorias; un registro público no restaura
claves ni permisos. La prueba de orquestación usa límites HOST declarados; no
se presenta como una nueva ejecución en las redes públicas.

Fuentes: `packages/mobile-protocol/src/device-paged-agent-v4.mjs:21-45`,
`apps/mobile/src/api/device-paged-agent-owner-v4.ts:21-39`,
`apps/mobile/src/api/device-paged-agent-ui-controller-v4.ts:25-27`.

## Uniswap existente

No se propone un endpoint `/swap`. La wallet recibe de su pairing original
`nativePreparation.uniswap`, prepara la recepción D27 con su custodia y produce
el intent existente `UNISWAP_V3_EXACT_OUTPUT_SINGLE`. Ese intent fija el job,
root y compromiso de salida, máximo de entrada, importe de salida, ventana y,
en la versión pública, destinatario. Su aprobación y ejecución siguen el graph
original; la página no obtiene permiso de gasto de la nota ERC20 recibida por
el mero hecho de que una dependencia haya terminado.

El helper original exige conservar/verificar la copia de recuperación de esa
recepción antes de completar su nodo. El listener activo y el de recuperación
capturada tienen superficies distintas: no anunciar indiscriminadamente las
rutas de preparación de un helper local como si todas estuvieran montadas en
el servicio público actual. La publicación de cada perfil es la que determina
su recorrido real permitido.

Uniswap conserva su Source4 original, independiente del Source7 de
Aave/Morpho. Compartir identidad del usuario no unifica pools, roots, activos
ni saldos. Tampoco la propuesta externa nativa V4 del agente describe swaps;
esa capacidad futura necesita su propio esquema revisado.

Fuentes: `apps/mobile/src/api/device-paged-uniswap-preparation-v3.ts:26-90`,
`packages/mobile-protocol/src/device-paged-uniswap-public-v4.d.mts`,
`packages/backend/src/operations/local/funded-graph-paged-device-graph-operator-v3.mjs:210-211`,
`packages/backend/src/api/mobile/device-paged-uniswap-flat-read-http-v8.mjs:5`.

## Aave/Morpho existentes

1. Wallet prepara su página Source7 y conserva localmente `receiptSecret`.
2. `defi-proposals` recibe ACCESS más protocolo, acción, rootId/revisión de la
   nota de participaciones, sharesAtomic, máximo/mínimo, destinatarios y
   `receiptCommitment`. INVEST exige compromiso no cero; REDEEM exige null.
3. El servidor consulta el protocolo real, fija ventana y cotización y devuelve
   `{review}`. No se acepta una cotización inventada por móvil/agente.
4. La wallet vincula revisión, prueba D27 y recepción privada. Esa preparación
   de INVEST no autoriza un gasto por sí sola.
5. `financial-submit` registra `{access,signature,reference,jobId,capitalNodeId}`
   sobre el mismo job. Source7 vincula la reserva y el presupuesto ETH con la
   recepción de participaciones; el usuario autoriza los términos económicos
   finales mediante el recorrido normal del graph.
6. El servidor ejecuta la inversión aprobada, comprueba recibo canónico y
   liquida según los términos autorizados. `financial-observe` consulta el
   mismo job; PROVED/PREPARED no significan inversión confirmada.
7. REDEEM conserva revisión explícita: prueba W39 → `withdrawal-review` devuelve
   `{consent}` → firma → ACCESS nuevo → `withdrawal-arm` → `redeem-submit`.
   Puede devolver WITHDRAW pendiente mientras espera; el worker continúa la
   misma revisión hasta sus límites. La consulta no solicita huella adicional.

Respuesta financiera V7: exactamente `jobId`, `reference`, `phase`,
`transactionHash`, `canonical`, `protocol`, `kind`. `phase` es PREPARED,
SUBMITTED, UNKNOWN o CONFIRMED; `kind` es INVEST, WITHDRAW o REDEEM. La retirada
de shares confirmada no equivale todavía a USDC recibido: hace falta REDEEM
confirmado. Nunca añadir campos a este DTO exacto sin versionarlo.

El presupuesto Source7 ETH y la nota de participaciones tienen **roots y
revisiones distintos**. Se unen por la entrega comprometida y los permisos
originales. USDC de Aave y de Morpho en Sepolia se distingue por dirección e
identidad del activo. La remuneración ETH demo es precio acordado, no FX.

Límites de propuesta demo: máximo 10 USDC de entrada, máximo 10 shares Aave
(6 decimales) o 10 shares Morpho (18), margen máximo configurado 1%, ventana
máxima 900 s además de los caps y vencimientos originales. No son límites
prometidos para mainnet. La cuenta D27 actual no debe anunciarse como una
cuenta ilimitada/reutilizable para cualquier número de inversiones.

No hay propuesta de agente V4 para estas acciones: su esquema sólo admite pagos
nativos. Una futura extensión necesitará DTO firmado versionado y revisión
original, no pasar DeFi por `networkId` ni por un envío nativo arbitrario.

Fuentes: `apps/mobile/src/api/device-sepolia-defi-paeg-investment-v8.ts:36-38`,
`apps/mobile/src/api/device-sepolia-defi-financial-api-v7.mjs:38-94`,
`packages/backend/src/accounts/authority/device-sepolia-defi-proposals-v8.mjs:12`,
`packages/mobile-protocol/src/device-sepolia-defi-financial-status-v7.mjs`.

## Idempotencia, pérdida de respuesta y límites

| Acción | Identificador retenido | Tras perder respuesta |
| --- | --- | --- |
| Cotización nativa | operationId/quoteId y términos exactos | Consultar o recuperar esa cotización; cambiar términos no reutiliza el ID |
| Envío nativo | quoteId, bytes firmados y hash | Consultar `/native/status`; no producir otra firma/transacción |
| Preparación graph | descriptor, graphId, rootId/revisión, jobs/cursor local | Observar graph original; no BEGIN nuevo; continuación agente pendiente indicada arriba |
| START | automatización original y grant guardado antes del envío | Reentrada de lectura verifica START; no firmarlo automáticamente otra vez |
| Inversión DeFi | reference, jobId, capitalNodeId y compromiso de recepción | Consultar trabajo; continuación explícita sólo con observación original nueva |
| W39/redeem | reference, jobId, prueba, consentimiento y hash retenidos | Observar esa retirada; no cambiar receptor ni repetir con otro job |
| MoonPay futuro | propietario + requestId + términos normalizados | Recuperar misma sesión; otro cuerpo con igual ID da conflicto |
| Lectura agente | grantId, contador de lecturas y challenge de un uso | Puede pedir otro challenge de lectura dentro de cuota/plazo; nunca repetir efectos |

No existe hoy un encabezado universal `Idempotency-Key`, ni un endpoint genérico
`/operations/:id` para todos los productos. El contrato conserva los IDs de
cada recorrido en vez de inventar esos servicios.

Timeouts actuales del cliente: API pública 20 s; challenge/Graph preparación,
firma y START 15 s; pruebas ZK 900 s; EXECUTE_NATIVE/consultas económicas 60 s;
DeFi financiero 30 s. El trabajo costoso debe prepararse antes de emitir el PoP
corto y antes de devolver PROVED cuando corresponda. No ampliar permisos ni
convertir un timeout en autorización/reenvío. No hay reintento automático
general de escrituras. Para lectura, petición nueva y autorización de lectura
nueva; observar las cuotas y aplicar espera, sin conservar la firma expirada.

Límites externos agente: hasta 4096 lecturas por grant y plazo V4/V5 firmado;
hasta 16 grants retenidos por canal, 32 challenges pendientes, cuerpo 8192 B y
respuesta cliente de observación 256 KiB (el plan V5 puede incluir 256 cobros); challenges y revocaciones 32 KiB. La petición de challenge V5 conserva el grant completo y exige un límite de transporte compatible; no se omiten sus términos para encajar en el límite antiguo de 8192 B. Datos de propuesta hasta 256 nodos, página 64.
API pública actual: 16 solicitudes concurrentes globales, 8 por cliente,
120 peticiones/60 s y 60 challenges/60 s por cliente. Son límites de la demo,
no un SLA ni una capacidad multitenant ilimitada.

Los errores Graph HTTP quedan hoy reducidos en el SDK a SERVICE_UNAVAILABLE;
DeFi sólo preserva seis códigos públicos de propuesta/capital. Por ello aún no
se promete una taxonomía externa completa de BUSY/retryAfter/failed. Una revisión
de contrato deberá mantener compatibilidad o versionar esa mejora; el cliente
actual conserva el trabajo y muestra respuesta sin confirmar.

## Cobro del ejecutor: nuevo consentimiento V5

Los grafos nuevos usan V5 sólo cuando el pairing autenticado anuncia
`nativePreparation.executorPayoutsV5:true`. El seed conserva esta elección;
abrir un grafo histórico no lo convierte en V5. Se preparan por el canal cifrado
existente `PREPARE_EXECUTOR_PAYOUTS_V5` y después `PREPARE_NATIVE_PAGE`.
El proveedor custodia una clave independiente por resultado y devuelve un
certificado firmado por su identidad y por la clave de esa nota. El móvil
verifica las dos firmas, origen, compromiso, nullifier, grafo, importe y plazos;
no recibe la clave privada del cobro.

Tras firmar el OWNER original, `SIGN_EXECUTOR_PAYOUT_INVOICES_V5` devuelve las
facturas firmadas para su página original. El móvil verifica cada firma contra
el frame derivado de sus propias páginas antes de enviarla con `SIGN_GRAPH`.
Estas acciones usan la sesión de aprobación ya abierta, sin otra huella por
factura. Una respuesta perdida se consulta antes de continuar con la misma
preparación/página y las mismas notas; nunca genera otro cobro.

`START_AUTOMATION` V5 firma también `executorPayouts`: beneficiario, compromiso,
nullifier e importe de cada nota, certificados, quoteRoot, `collectBy` y techo
de gas por nota y total. El plazo de cobro no amplía el plazo de entrega. La
cuota de comandos suma cuatro por cobro (prueba, envío y dos comandos de
reserva para reproof tras cambio de epoch) a la cuota real del grafo y conserva el
máximo de 4096. La revisión muestra estos términos antes de la huella. Las
notas del proveedor se excluyen de las opciones de retirada de la wallet.

El gasto de gas de cobro corresponde al proveedor; su límite no es un precio
estimado ni un cargo adicional. V4 conserva su liquidación manual. Los lectores
Any V5 preservan todos los términos firmados; los normalizadores V4 originales
siguen rechazando V5. Un grafo FULFILLED no prueba por sí solo que los cobros
hayan confirmado: cada retirada necesita su recibo y nullifier canónicos.

## MoonPay: integración futura, separada del cierre del motor

Solicitud de sesión existente: `{requestId,flow,asset,network,fiatCurrency,
amount,walletAddress}`; BUY/SELL, BTC/ETH/SOL, EUR. El importe de BUY está en EUR;
SELL en unidades decimales del activo. Las redes y configuración SANDBOX o
PRODUCTION deben concordar con la cuenta original de la wallet.

El checkout usa URL fija del proveedor firmada en servidor. El retorno del
navegador no autoriza envíos ni acredita fondos. El webhook crudo se verifica
con HMAC y ventana temporal; después se consulta el proveedor por el ID original.
La venta requiere revisión y firma independiente del depósito nativo concreto.

Estados actuales: CHECKOUT_READY, PROVIDER_PENDING, PROVIDER_FAILED,
PROVIDER_COMPLETED, UNKNOWN. El DTO declara `chainConfirmation:'UNVERIFIED'` y
`privateBalanceCredited:false`. Es correcto: una notificación del proveedor no
demuestra recepción onchain ni crea una nota privada.

El móvil conserva y reutiliza `fiatRequests` cuando se pierde una respuesta;
`resumeFiatSession` recupera esa misma orden. El store usa el fence Original
existente (exclusión flock, boot ID y start ticks) para reabrir después de una
muerte del proceso y rechazar otro writer vivo. Un `writer.lock` antiguo que
sólo contenga PID se rechaza y exige recuperación administrativa: no se borra
a ciegas. La prueba de SIGKILL conserva la misma orden y no accede a la red.

Trabajo posterior de MoonPay: alta/credenciales, compatibilidad real de sandbox
y verificación de recepción en cadena si se presenta como recibida. El estado
del proveedor sigue sin acreditar saldo privado. Estas tareas pertenecen a
MoonPay y no se cuentan como fallos pendientes del motor.

Fuentes: `packages/backend/src/fiat/moonpay-gateway-v1.mjs:39-49,144-184`,
`packages/backend/src/fiat/moonpay-order-store-v1.mjs:19,41`,
`apps/mobile/src/native-wallet/native-wallet-controller.ts:34-39`,
`apps/mobile/src/screens/NativeWalletScreen.tsx:61`.
