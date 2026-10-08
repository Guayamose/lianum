# Estado actual

Actualizado el 8 de octubre de 2026. Hay una base versionada y utilizable para
desarrollo; todavía no está completada la wallet omnichain de la visión original.
Los resultados distinguen código comprobado, laboratorio local y producto
pendiente. Las entregas históricas permanecen en `archive/`.

## Trabajo solicitado

| Paso | Estado comprobado | Qué falta para cerrarlo |
| --- | --- | --- |
| 1. Base fiable | Importación separada por componentes, dos mocks corregidos, 244 pruebas habituales correctas, inventario de encoding y CI preparado desde una copia limpia. | No sustituye todas las integraciones ni los originales históricos ausentes. |
| 2. Reconciliación nativa | `reconcile()` consulta el resultado terminal conservado antes de esperar al adaptador. Regresiones de adaptador bloqueado y validación terminal aprobadas. | La recuperación F local ya se aceptó con una entrega real en el paso 3. |
| 3. Recorrido EVM | Recorrido completo desde el DOM real aceptado con quince pruebas: financiación, reserva, entrega, liquidación, tres salidas y redención. Respuesta perdida, reinicio de owners y reemplazo de listener comprobados. Recuperación F real aceptada desde el DOM con siete pruebas, además del perfil SDK/HTTP. | Conexión a móvil y recuperación tras pérdida de keeper/nodo. |
| 4. Redes y operaciones combinadas | Ingreso y solver BTC/SOL aceptados. Recorrido CBTC → entrega SOL aceptado con 16 pruebas nuevas, grafo FULFILLED y retiradas Bitcoin de 80.000/20.000 satoshis descargadas; respuesta perdida y duplicados sin otro pago. Tron produce consenso y un broadcast, pero su aceptación falla. | Resolver autorización caducada del payout Solana del round trip de ocho pruebas; recuperación tras pérdida de nodos/custodia, finalidad/cierre Tron y stacks propios de Base/Arbitrum/BNB. |
| 5. DeFi | Protocolos oficiales Uniswap V3 y MetaMorpho; nota privada, EXIT y redención MetaMorpho aceptados. Entrada pública al protocolo, salida hacia nota privada y retirada pasan con cuatro D27/W39 genuinas, incluido reinicio y respuesta de redención perdida sin duplicación. | Entrada privada a DeFi, integración PAEG/grafo y posiciones; pérdida de keeper/nodo, Aave/Morpho/Jupiter y composición entre redes. |
| 6. Móvil y operación | Expo/React Native, consentimiento y outbox protegido; API/PostgreSQL con migraciones versionadas comprobadas; Docker local; Terraform validado sin cuenta GCP. APK Android debug construido y verificado. Cuenta original vinculada V2 con diagnóstico/reconciliación y 85 checks host aprobados. | Aceptar V2 sobre un laboratorio genuino, TLS/vinculación operativa, workers, saldo privado real, aceptación física al final, recuperación móvil y operación de producción. |

Los pasos 1 y 2 tienen sus cambios implementados y comprobados. Los pasos 3–6
incluyen avances reales, pero no están cerrados como producto. Google Cloud se
prepara **sólo localmente**, según la decisión del usuario: no hay proyecto,
despliegue, `apply` ni recursos creados.

## Qué puedes ejecutar hoy

Desde la raíz:

```sh
./dev start       # Wallet web; arranca desconectada
./dev test        # Selección habitual: 244 PASS, 0 FAIL
./dev check       # Integridad, tipos/ABI, diagnóstico Noir y HTTP
./dev doctor      # Herramientas, originales y bloqueos por separado
./dev artifacts  # Faltantes históricos de la selección de encoding
```

La wallet web no inventa saldo al arrancar. Cada integración tiene preparación propia:

- [Laboratorio EVM](docs/EVM-LAB.md): build nuevo y recorrido con pruebas reales.
- [Móvil](apps/mobile/README.md): instalación, contratos, tipos y bundles Android/iOS.
- [API y PostgreSQL](apps/platform/README.md): réplica Docker y pruebas con base real.
- [Google Cloud](infra/google-cloud/README.md): validación y seis tests simulados, sin credenciales.
- [Redes y DeFi](packages/backend/docs/LOCAL-ACCEPTANCE.md): alcance de cada aceptación.

## Evidencia y límites

La selección habitual pasa con 244 resultados. La última CI local desde un archivo
Git público vacío pasó 431 tests del núcleo en 51 archivos, 64 de móvil/HTTP y
22 casos Python en siete suites sobre `31e9aaa`. También pasaron descarga y
verificación oficiales de Node, instalación npm sin caché previa, tipos,
reconstrucción y originales versionados. Fuentes e inputs conservaron sus bytes
y todos los procesos propios cerraron. El primer bootstrap frío de `4740954`
falló porque faltaba el directorio de descarga; se corrigió y conserva su rechazo.
La selección anterior de `141b0ef` pasó 404 tests, con su informe separado.
No se copió restauración privada ni se ejecutaron cadenas nativas en estas CI.
Después se comprobó la suite de autorización V4, el collector privado y los
contadores de actividad: 44/44 resultados correctos, incluidos los 31 casos
anteriores. Los dos rechazos previos del harness quedan conservados. Las métricas
no modifican guards, rounds ni el presupuesto de 30 s; sólo miden intervalos
parciales y CPU del proceso. El harness cargado añade seis regresiones nuevas y
conserva las dos de catch existentes: 8/8 PASS en copia pública. Captura una sola
vez antes del POST Solana y después de idle, detecta huecos en los informes y
preserva el resultado si falla la medición. Todavía no se ha ejecutado ese nuevo
perfil cargado ni se ha explicado su fallo histórico.
El [diagnóstico de auditorías vacías](docs/CLAIM-AUDIT-LAB.md) ya está aceptado:
seis llamadas originales en un laboratorio nuevo, CLAIM 307–338 ms y GRAPH
646–678 ms. Preparación, ejecución y cierre completos duraron 64,308 s;
fuentes y originales intactos, PID conservados y cuatro locks ausentes.
No se generaron pruebas ni payouts durante la medición.

La composición local V5 pasa 64 checks canónicos: 40 de metadatos, 14 del pipe
de arranque, ocho del perfil financiero/HTTP y dos de las rutas originales I84.
El CLI pasa diez casos Python; el preparador del ledger, 15 de límites e
identidad. Los checks host no arrancan cadenas ni generan pruebas financieras.
Su primera compilación real aceptó las siete fuentes,
sus AST y los cuatro artefactos originales del ledger, en 39,666 s de watchdog
y con 439.681.024 bytes de RSS máximo muestreado del hijo. Las fuentes quedaron
intactas, los procesos cerraron y se liberó el lock. El raw nuevo se guarda en
`.local/development-native-value-ledger/v5`; el histórico `f21b2710…` sigue
ausente. La inspección real V5 corrigió dos rutas I84 y después identificó
nueve inputs W39 ausentes. Cuatro se recuperaron con bytes exactos de un ZIP;
los cinco restantes están detallados en [originales pendientes](docs/RECOVERY-INPUTS.md).
Se revisaron 28 ZIP por tamaño/hash y el paquete restaurado. Los dos rechazos
del inspector quedan conservados; el lector histórico y sus pins siguen intactos.
La publicación V5 permanece cerrada y no hay aceptación financiera
móvil en esta compilación. `./dev check` comprueba ahora 1.825 fuentes físicas
y los 2.649 originales; pasan Solidity, Noir/Barretenberg y HTTP.

La API pasa 22 casos host
y 19 resultados con PostgreSQL real: carreras, JSONB, reinicio, respuesta
perdida, crash, caída de SQL y migraciones concurrentes o interrumpidas.
El adaptador de esos tests es un contador SQL; no mueve fondos ni genera pruebas.
La consulta firmada lee la admisión original después de caducar sin consumir ni
disparar efectos. Las conexiones SQL silenciosas o rotas tienen límites y el
permiso se revalida después de esperar SQL, antes del adaptador.
La copia de fuentes públicas comprueba además tipos móviles y los casos host
de la API; las pruebas SQL reales tienen su informe separado.

El cliente móvil actualizado pasa 59 pruebas de contratos, custodia simulada, conservación
de operaciones pendientes y procesos de compilación, además de tipos y
exportación Android/iOS. Su outbox conserva una ejecución UNKNOWN aunque se
rechace después el permiso de reconciliación; la admisión de permisos no cierra
su resultado económico. Eso no acredita biometría/custodia en un teléfono ni una IPA/APK
instalada. El bootstrap de API mantiene el adaptador económico desconectado:
liveness es 200, readiness es 503 y `privatePortfolio` es `null`.

El protocolo de [cuenta original vinculada V2](docs/ORIGINAL-ACCOUNT-V2.md)
añade actor ligado a session/approval/owner originales, HTTP privado, cliente y
pestaña nativa. Pasaron 85 casos en el árbol canónico (87,959 s), con firmas y
HTTP reales y fixtures explícitos para runtime, owner y pruebas financieras.
Los métodos exactos de ciclo de vida se comprueban mediante AST; no hubo renderer
React ni teléfono. También pasan tipos y exportación Hermes Android/iOS del
cliente actualizado, con un único worker Metro. La consulta conserva saldo
privado pendiente. La reconciliación
puede actualizar el journal de una petición ya iniciada; no crea nuevas notas ni
autoriza un gasto móvil. Falta su aceptación con pruebas genuinas y routing/TLS.

La API verifica el historial y los checksums del esquema al arrancar, sin crear
tablas. `npm run db:migrate` aplica la migración revisada por separado, con
transacción y lock PostgreSQL. Se comprueban adopción del esquema anterior,
concurrencia, rollback, timeout y respuesta COMMIT perdida. La imagen Docker
actual realiza esa migración antes de la API y conserva el estado desconectado.
Android usa un único pool Ninja para compilación y enlace de app y bibliotecas:
la regresión real, el prebuild Expo y los targets reales del APK verifican el
pool. Los probes internos de configuración LTO no tienen ese pool; no se
afirma su concurrencia. El guard total incluye todos los procesos propios.

El APK Android debug `0.1.0` se construyó sobre `141b0ef` en 6 min 19 s.
`aapt2` y `apksigner` verificaron paquete `org.lianum.wallet`, SDK mínimo 24,
objetivo 36, ARM64/x86_64 y firma debug V2. Los 35 inputs permanecieron iguales,
todos los procesos propios cerraron y el pico fue 3.069.050.880 bytes, por debajo
de 3 GiB. La copia estable y su SHA256 están en [la guía móvil](apps/mobile/README.md).
Necesita Metro; no es release ni se ha instalado. La validación física se deja
para el final por decisión del usuario; los tests no se presentan como biometría
real ni custodia móvil de notas originales.

El recorrido EVM desde navegador pasó en un laboratorio nuevo con quince pruebas
genuinas y sus inputs originales verificados. La respuesta TOP_UP perdida dejó
UNKNOWN y se concilió sin repetir el POST. El grafo se liquidó con ambos owners
ausentes; después reiniciaron las custodias y se reemplazó el listener sobre el
mismo journal. El permiso del listener anterior fue rechazado. Cambio 380,
payout 120 y redención 100 PALT terminan con pools y vault sin respaldo pendiente.
Ambos navegadores y todos los procesos propios cerraron correctamente.

El intento aceptado duró 19 min 29 s; el pico del prover fue 3.033.706.496 bytes,
por debajo del límite de 3 GiB. Es una medición local de ese recorrido, sin
acreditar los objetivos en caliente. Los tres intentos DOM anteriores conservan
su rechazo; el fallo intermitente de guard del tercero no se reprodujo y no se
atribuye una causa ni una corrección. No hubo pérdida del proceso keeper/nodo ni
custodia en dispositivo. [El informe del recorrido](docs/EVM-LAB.md) conserva
identidad, hashes, alcance y comandos.

La recuperación F desde el DOM también pasó en un intento separado con siete
pruebas genuinas. Tras una única entrega y ejecución interrumpida, la wallet
reabrió el mismo journal y confirmó la devolución original sin otro pago ni
crédito. Origen 500 incluye los 120 devueltos; destino conserva 100 shares y el
solver pierde sus 100 de entrega. Ambos Chrome y todos los procesos propios
cerraron; la cerca sigue activa. El intento frío duró 9 min 56 s. No comprueba
pérdida del keeper/nodo ni recupera automáticamente una ejecución incierta.

El primer round trip privado BTC/Solana emitió ambas notas con cuatro pruebas
D27/CI51, pero falló antes de EXIT/payout por lecturas paralelas incompatibles
con el controlador original. El harness ahora las serializa, con regresiones.
El segundo intento conservó siete pruebas genuinas, reabrió los owners y el
controlador originales, y completó EXIT y payout Bitcoin de 100.000 satoshis.
La respuesta de admisión perdida se resolvió con resume; repetir redeem,
resume y reconcile no repitió el pago.

El conjunto sigue **rechazado**: la redención Solana devolvió
`CLAIM_OPERATOR_AUDIT_TOO_OLD` después de `BEGIN_PAYOUT`, antes de conservar
una firma o envío nativo de payout. La etiqueta final de finalidad procedía del
texto de una aserción del harness y no describía la causa original. Ese inicio
de pago impide asumir que el fence está libre o renovar/reintentar la firma.
La revisión independiente unió las siete pruebas y confirmó fuentes intactas, cierre propio y ausencia de los 133 PID originales. El presupuesto de auditoría
de 30 s se conserva; falta resolver su causa y aceptar ocho pruebas nuevas.

El primer recorrido combinado `./dev lab btc-sol` también queda rechazado.
Sus 15 pruebas genuinas acreditan una entrega SOL de 1.000.000 lamports y el
payout Bitcoin de 80.000 satoshis del cambio del owner, incluido resume tras
respuesta perdida y duplicados sin otro pago. El EXIT EVM del solver por 20.000
CBTC sí se minó; después falló su solicitud de redención por un identificador de
37 caracteres donde se exigen 64. No se inició ese segundo payout Bitcoin ni se
generó su CO42. La corrección omite el ID opcional y conserva el hash determinista
del controlador original; pasan dos regresiones antes de estado/RPC. Se han
verificado las 15 pruebas, fuentes intactas, 141 identidades ausentes y cuatro
locks liberados. Ese rechazo permanece conservado.

El segundo intento combinado, `67ca1114-cb94-4f87-9041-1cd7b7e62e82`, queda
**aceptado y cerrado** sobre `759d732`: 16 pruebas genuinas nuevas, entrega SOL
de 1.000.000 lamports, grafo FULFILLED y redenciones Bitcoin de 80.000/20.000
satoshis DISCHARGED, sin pagos duplicados. Termina con supply y obligaciones
a cero. La auditoría independiente comprobó los recibos, 399 fuentes, 20 archivos
API y 11 de vendor; 219 procesos originales y cuatro locks quedaron ausentes.
Se retiraron scratch, wallets, claves y ledgers sintéticos sin cierre forzado.
Solana conserva `nativeOrderlyExit=false` y `nativeStopFailure=null`.
Duró 44 min 09,978 s; es una aceptación local, sin operadores independientes,
red pública, descubrimiento de precio ni pérdida de keeper/nodos. Ambos pagos
Bitcoin usan el destinatario fijo del runtime de custodia. Este grafo no resuelve
el payout de custodia Solana rechazado en el ensayo anterior de ocho pruebas.

Solana usa el Agave personalizado original con génesis, claves y ledger nuevos.
Verifica nonces duraderos, comisiones y balances de ingreso/solver; no fabrica la
autoridad del controlador de payout. Tron conserva
`OWNED_TRON_RUNTIME_RELEASE=null`: su clausura pública y el parche offline nuevo
se verifican. El candidato produce bloques y admite el único broadcast, pero
no establece finalidad en el plazo y termina SIGABRT. El diagnóstico nuevo
observa mempool vacío y ausencia de tx/receipt, con head/solid avanzando; el
fallo de cierre se localiza en el detach de LevelDB/HawtJNI durante VM_Exit. No se acepta como red completa.

Los informes están en `.internal/dev/reports/` y los directorios privados de
cada intento. No se versionan claves, testigos ni sesiones. Los comandos CI se
comprueban localmente; no hay remoto ni ejecución registrada de GitHub Actions.

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
  claims. Un build nuevo ya prepara CI51 V3 y CO42 con las VK originales, sin
  fabricar esos recibos históricos ni acreditar payout. El inventario de encoding
  tiene ese alcance; no certifica todas las
  integraciones posteriores. [El inventario de claims](packages/backend/docs/NATIVE-CLAIMS-ARTIFACTS.md)
  identifica familias, consumidores, hashes conocidos y la identidad del build nuevo.
- Para aceptar la cuenta móvil original en EVM falta un raw histórico adicional:
  `.local/native-value-genuine-compilation/graph-only-source-v1/ledger/compiled.json`,
  SHA256 `f21b27105321ff027954ac5d0660b420c3028bf974a8f9a9e0c93db66c0a11a3`.
  Los otros 202 ficheros comprobados del release V4 coinciden. El desarrollo
  V5 prepara un linaje separado; no sustituye ese original ni activa los gates históricos.
- El laboratorio privado perdido no se recuperó. Las aceptaciones nuevas usan
  identidades, claves y estado nuevos.
- Los módulos heredados requieren `.internal/runtime/`, recursos compartidos y
  algunos experimentos. Los nuevos móvil/API/infra tienen dependencias explícitas
  fuera de esa compatibilidad.

## Distancia respecto a los puntos originales

La entrega histórica estimaba un 58% global sin una medición de aceptación.
No lo convertimos en porcentaje actualizado a partir de commits o tests. Los
rangos anteriores eran cobertura técnica orientativa:

| Punto original | Referencia anterior | Condición para aceptarlo como producto |
| --- | --- | --- |
| Wallet unificada | 50–60% | Recorrido desde interfaz/móvil, estado y recuperación entre siete redes. |
| Privacidad por defecto | 40–50% | Modelo de observadores/colusión y garantías de sistema comprobadas. |
| PAEG genérico | 60–70% | Composición reproducible dentro de límites explícitos; el perfil actual tiene cuatro slots. |
| Liquidación y recuperación económica | 55–65% | Entregas parciales, pérdidas asignadas y ningún efecto o saldo duplicado. |
| DeFi privado real | 35–45% | Ciclos privados completos por protocolo, salida, conservación y recuperación. |
| Estado privado global | 55–65% | Coherencia de disponibles/reservados/pendientes entre redes y propietarios. |
| Redes heterogéneas en profundidad | 45–55% | Aceptación de cada red, finalidad, reorganizaciones y operaciones combinadas. |
| Agente autónomo personal | Fuera del alcance | Rafa lo implementa sobre las APIs y permisos del producto. |

Son referencias de la evaluación anterior, no una medición de los avances
actuales ni del tiempo pendiente. Ningún punto completo de la visión original
queda aceptado por pruebas aisladas.

La revisión criptográfica independiente está pendiente. Los objetivos en
caliente de sobrecoste propio <30 s, pruebas <20 s y coordinación <5 s aún no
están demostrados; la finalidad nativa se mide aparte. Los permisos móviles
actuales exponen identidad pública estable e importes a la API.

[Criterios de privacidad y operación](docs/PRIVACY-AND-OPERATIONS.md) ·
[Orden de trabajo](ROADMAP.md) · [Visión original](archive/delivery/PROJECT-VISION.md)
