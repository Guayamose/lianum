# Módulos y dependencias

Cada paquete JavaScript declara sus entradas públicas en `package.json` mediante
`exports`. Los consumidores usan esas entradas y las dependencias declaradas:

```js
import { createFlatAccountSession } from '@lianum/backend/accounts/session';
import { createRoleProofClient } from '@lianum/proofs/client';
```

Las entradas apuntan a una única implementación. Las fachadas públicas que siguen teniendo consumidores reexportan las mismas
funciones; las fachadas privadas sustituidas se retiran. No crean otra custodia,
estado ni registro de identidad. Los paquetes son módulos del producto, no servicios que deban
desplegarse por separado.

## Responsabilidades y dirección de las dependencias

| Paquete | Propietario de | Entradas públicas orientativas |
| --- | --- | --- |
| `@lianum/backend` | Composición de cuentas, custodia y redes; API, ejecución, recuperación y despliegues | `accounts/session`, `accounts/durable-keeper`, `wallet/http-service`, `claims/session`, `defi/withdrawal` |
| `@lianum/proofs` | Jobs, workers, herramientas y verificación criptográfica | `client`, `catalog`, `execution/proof-process`, `toolchain/wallet-prover`, `verification` |
| `@lianum/custody` | Custodia del propietario, autorización de firmas y bindings | `owner`, `signing/authorized-envelope`, `preparation/flat-owner-manual-binding` |
| `@lianum/engine` | Estado, coordinación genérica, almacenamiento, codecs y mecanismos compartidos | `accounts/keeper`, `accounts/journal`, `crypto/vault`, `execution/inputs/funding-witness`, `storage/records` |
| `@lianum/mobile-protocol` | Contratos entre clientes y backend; cliente wallet sin DOM | entrada principal, `original-account-v2`, `wallet/client` |
| `@lianum/components` | Formatos públicos, integridad, política de recursos y CRS | `encoding/commitments`, `encoding/statements`, `verification/wrapped-installation`, `file-integrity` |
| `@lianum/crypto` | Circuitos candidatos y Poseidon portátil | `framing`, `portable-poseidon2` |
| `@lianum/environment` | Ubicaciones de fuentes y recursos declarados | `sourcePath`, `sourceURL`, `resourceRoot`, `resourcePath`, `legacyDataRoot` |
| `@lianum/protocol` | Generación histórica congelada | Referencias para reproducción histórica, fuera de consumidores activos |

La dirección principal es `backend → proofs → custody → engine`. Cada capa
puede consumir también las capas inferiores que necesite. Engine consume
contratos de `mobile-protocol`, `components`, `crypto` y `environment`;
no importa backend, proofs ni custody. Los formatos públicos compartidos están
en esos paquetes inferiores y no necesitan levantar cuentas o procesos para
poder importarse. El detalle completo está en los manifiestos y en
[`scripts/module-boundaries.json`](../scripts/module-boundaries.json).

Los procesos del propietario, los observadores que necesitan redes y las
preparaciones que componen cuentas pertenecen a `backend/src/custody/`. La
custodia de claves y sus bindings permanecen en `packages/custody`. Asimismo,
backend compone la ejecución económica que necesita un prover; engine conserva
sus mecanismos compartidos y proofs el proceso de prueba. El driver Java de
`packages/chains/` mantiene su compilación propia.

La aplicación web monta los recursos visuales en
`packages/backend/tests/fixtures/api/wallet/application.mjs` y usa `@lianum/backend/wallet/http-service`
para HTTP, sesiones y autorización. El backend puede utilizar ese servicio sin
importar la aplicación. Los contratos y el cliente sin DOM pertenecen a
`mobile-protocol`; el DOM, las pantallas y los recursos estáticos siguen en apps.

## Implementaciones compartidas y autoridad

| Código | Lugar donde se edita | Compatibilidad |
| --- | --- | --- |
| Contratos y cliente compartido de wallet | `packages/mobile-protocol/src/wallet/` | Wallet importa los exports compartidos; se retiraron sus fachadas duplicadas |
| Servicio HTTP de wallet y controles de petición | `packages/backend/src/api/wallet/` | La app añade su lista cerrada de recursos web |
| Poseidon2 portátil | `packages/crypto/src/portable/poseidon2-bn254-v1.mjs` | Reexport desde custodia móvil |
| Registro segmentado cifrado | `packages/engine/src/storage/segmented-record-store.mjs` | Reexport desde backend claims/storage |
| Coordinador genérico y checkpoints | `packages/engine/src/execution/accounts/generic-account-keeper-core.mjs` | Backend compone la persistencia duradera |
| Keeper duradero y validación SOURCE | `packages/backend/src/accounts/storage/durable-generic-account-keeper.mjs` | Su registro de identidad vive junto a su fábrica |
| Toolchain wallet/assembly y validadores de claves | `packages/proofs/src/toolchain/` y `src/verification/` | Entradas experimentales anteriores reexportan estos propietarios |
| Despliegues DeFi y composición local wrapped | `packages/backend/src/operations/` | Los fixtures anteriores remiten a la implementación operativa |
| Identidad de procesos y observación RSS | `packages/proofs/src/host/` | Helpers de tests reexportan la implementación |
| Mecánica de runtime EVM y custodia por instancia | `packages/backend/src/chains/evm/runtime/owned-evm-runtime-backend-v1.mjs` | La fachada `owned-evm-v2-runtime.mjs` conserva las funciones del propietario original |
| Journal SOURCE y composición original de runtime | `packages/backend/src/operations/recovery/native-original-source-lifecycle-v1.mjs` | La fachada de cápsula anterior está retirada como evidencia `.source`; los consumidores usan este propietario |

Las pruebas importan implementaciones operativas. Los imports literales activos
ya no apuntan a conductores de pruebas ni módulos ejecutables de `experiments/`.
Las aserciones, los fallos de transporte simulados y las campañas permanecen en
pruebas. Las fuentes y artefactos retenidos que valida una generación siguen
siendo recursos explícitos: separar el código no elimina esos requisitos.

Los tokens de custodia, recuperación y envío dependen de identidad en memoria.
Mover un consumidor exige conservar conjuntamente el emisor, su registro privado
y su validador. Por ejemplo, el kernel de operadores posee la procedencia de las
observaciones health EVM/TRON; los lectores RPC separados no pueden emitir una
observación acreditada por sí solos. La custodia económica local de EVM tiene
una instancia fija creada por el kernel de runtime. Otra instancia del mecanismo
no comparte sus handles ni permisos de firma.

El backend mecánico de EVM recibe seis contratos concretos: journal,
recuperación, SOURCE de dispositivo, reorg, dispatch y observación. No importa
sus consumidores de cuentas, sesiones o controladores. La composición fija
enlaza esos contratos con los propietarios originales; no ofrece configuración
para sustituirlos en la instancia real. El journal conserva AEAD, CAS, tokens
de un uso y sus registros privados. Las pruebas comprueban que otra instancia,
incluso con un proceso local real, no obtiene autoridad del singleton original.

## Interfaces Paged compartidas

Estas entradas de `@lianum/mobile-protocol` conservan implementación y tipos
compartidos para móvil y SDK:

| Entrada | Interfaz | Responsabilidad |
| --- | --- | --- |
| `device/paged-operation-runner-v3` | `runDevicePagedOperationV3({command, isUnconfirmedReply, onProgress, onActivity, signal, maxCommands})` | Pide `NEXT_COMMAND` y consume el siguiente comando original; informa finalización, espera o resultado adverso. El puerto acepta la respuesta SDK en custodia antes de devolver su copia privada; el clasificador sólo identifica errores de esa misma instancia SDK. |
| `device/paged-economic-view-v3` | `normalizeDevicePagedEconomicRequestV3`, `normalizeDevicePagedEconomicViewV3` | Valida DATA de costes, beneficiario, salidas y ledger. Sus tipos incluyen `DevicePagedEconomicViewV3` y `DevicePagedEconomicLedgerV3`; no emite una marca SDK ni un permiso. |
| `device/paged-payout-settlement-v3` | `runDevicePagedPayoutSettlementV3({plan, command, readState, readOutputs, prepareWithdrawal, approve, onProgress, signal})` | Tras la retirada del cambio, compone W39 originales y comprueba por salida NF, destinatario, importe y conservación del ledger. Los costes nativos quedan separados de los pagos en unidades de la nota. |
| `device/paged-wallet-portfolio-v3` | `normalizeDevicePagedPortfolioRequestV3`, `normalizeDevicePagedWalletPortfolioV3` | Valida DATA de salidas, emisión, gasto y reserva del mismo bloque; no emite permisos ni autoridad SDK. |

Estos codecs y helpers no importan backend ni poseen RPC, claves, custodia o
capacidad de envío. Los puertos suministrados por la composición autorizada
mantienen las firmas, permisos frescos y aceptación originales; un callback o
un plan normalizado no sustituye esas fronteras.

El runner recupera una respuesta de estado caducada, adelantada o identificada
como perdida por esa misma instancia del SDK mediante un máximo de dos
`OBSERVE_GRAPH` y una nueva planificación con `NEXT_COMMAND`.
No repite a ciegas la prueba, el efecto ni el envío nativo que perdió respuesta;
las demás guardas de consentimiento y caducidad conservan sus errores originales.

`READ_PORTFOLIO` compone un canal cifrado de sólo lectura con la autoridad de
notas original. Une el mismo bloque, grafo, ROOT y revisión con los CM/NF/valores
de SOURCE, CHANGE, RECOVERY y PAYOUT abiertos por el Vault del dispositivo. Una
salida PAYOUT emitida exige tanto la entrega MINED original del proveedor como
la inclusión en la raíz de salidas aceptada. No genera pruebas, firmas nativas
ni retiradas, y conserva el permiso original de quince segundos.

El actor móvil agrupa DATA verificada por activo, dominio, contrato, política,
unidad y precisión. Excluye duplicados, salidas no emitidas y valoraciones de
subyacente; informa de cobertura sólo de las conexiones y custodias registradas.
Su ventana de observación conserva el corte original al cerrar un transporte,
pero caduca a los quince segundos y se revoca al escribir la custodia. Esa DATA
no conserva autorizaciones ni constituye permiso de gasto.

Mixed añade una composición de retención autenticada de cinco runtimes y
cuatro componentes. Uniswap captura su fixture original de cinco contratos,
router, autoridad privada D27 y configuración, con formato y tokens propios.
La composición Native de siete tokens y el fixture histórico de siete
contratos conservan sus formatos. La captura requiere ambos listeners drenados,
proveedor quieto y lecturas canónicas; la reapertura sólo admite tokens originales
del mismo supervisor y mantiene los mismos ledgers y journals. Es cierre ordenado.

`READ_ECONOMIC_SETTLEMENT` sólo se admite con grafo FULFILLED, sin trabajo ni
pendiente. El backend lo entrega cifrado por
[`createDevicePagedNativeEconomicChannelV3`](../packages/backend/src/operations/local/device-paged-native-economic-channel-v3.mjs),
con un lector privado enlazado al proveedor y a la autoridad originales. Ese
callback consulta hechos y ledger en la misma cabeza del status; no prueba,
firma ni ejecuta una retirada.

El móvil obtiene `graphEconomicRequest()` y `graphEconomicReview(reply)` desde
su [Vault original](../apps/mobile/src/custody/device-paged-note-vault-v3.ts).
La revisión exige respuesta Original SDK y une descriptor, ROOT, revisión,
grafo, raíz de autorización, CM, valor, NF y beneficiario con su propia custodia.
El historial confirmado comprueba el destinatario de las salidas retiradas.
[`wallet-session-v1.ts`](../apps/mobile/src/custody/wallet-session-v1.ts) emite
`approveWalletSessionPagedSettlementV3(review, signal)` tras aprobación fuerte;
`walletSessionPagedSettlementLeafV3(parent, id)` limita cada hoja a su salida,
y `closeWalletSessionPagedSettlementV3(parent)` la revoca. El alcance máximo es
30 minutos en primer plano; cada comando conserva su permiso de 15 segundos.

La salida Uniswap conserva su D27 y su custodia ExternalFlat independiente.
[`observeDeviceExternalFlatReceptionV1`](../apps/mobile/src/api/device-external-flat-reception-observer-v1.mjs)
compone el SDK y el Vault originales para una sola `OBSERVE_D27` de la misma
recepción en `DELIVERY_UNKNOWN`, seguida de STATUS fresco. Comprueba descriptor,
trabajo, ROOT, statement y hashes de prueba; no modifica una preparación PROVED,
genera pruebas ni envía fondos. El resultado Paged abre el perfil de destino
exacto después de drenar su transporte y exige la custodia ya existente. La
cartera publica la lectura original de ese token; la terminación del grafo y el
registro público de conexiones no acreditan saldo disponible ni permiso de gasto.

Los agentes externos sólo pueden consumir un puerto autorizado de ese mismo
recorrido. DTOs, perfiles públicos, semillas, plantillas y ciphertexts no se
convierten en grants ni permiten reconstruir tokens. El `executor:null` de
[`services/api-server/src/admission/run.mjs`](../services/api-server/src/admission/run.mjs) pertenece al perfil
de admisión V1 TOP_UP/EXIT, distinto del executor Paged ligado a su cuenta
original. Esta sección describe interfaces, no acredita aceptación financiera.

## Comprobación y deuda pendiente

```sh
./dev boundaries
python3 -B scripts/development/module_boundaries.py --json
```

El comprobador inspecciona imports literales, reexports e imports dinámicos con
ruta literal en `apps/*/src` y `packages/*/src`. Rechaza entradas no exportadas,
dependencias no declaradas, direcciones no permitidas y nuevos accesos privados
entre paquetes. También controla ciclos entre paquetes y entre archivos. No
carga el producto ni arranca redes; los imports calculados requieren revisión.

El grafo de imports literales deja **cero ciclos entre paquetes, cero imports
privados activos entre paquetes y cero enlaces activos hacia tests/experiments**.
Los **13 enlaces de soporte históricos** pertenecen a `packages/protocol`,
congelado y excluido del producto activo. Esos resultados describen el grafo
inspeccionado, no el porcentaje de funcionalidad terminada.

Los launchers activos de assembly y pagos pertenecen a proofs, con entrypoints
fijos y URLs literales. La política, recursos y CRS se implementan en
`components/src/resources/`; los cargadores conservan su API y comprueban su
ubicación. Los inventarios de ejecución leen y calculan hashes sobre listas
fijas de fuentes reales, sin aceptar los hashes devueltos por esas mismas
implementaciones. Las cargas calculadas que no son literales siguen requiriendo
revisión y una declaración de recursos para su empaquetado.

El gateway paginado usa tres imports canónicos declarados en
`scripts/layout.json`, para conservar una sola autoridad también desde
compatibilidad. Las fuentes experimentales fijadas por esa generación
permanecen intactas como evidencia y no se ejecutan desde ese gateway.

Queda **un componente cíclico interno de 133 archivos y 756 imports**, frente a
los 154 archivos y 845 imports del corte anterior. Están fuera de él la mecánica
EVM, el reloj SOURCE, los tres mecanismos de bridges, el actor móvil y la sesión
nativa: cada familia conserva sus registros privados y recibe contratos fijos.
La composición original conserva las funciones públicas y no acepta sustitutos.
La implementación SOURCE (`native-original-source-lifecycle-backend-v1.mjs`)
también está fuera del SCC; su composición canónica sigue dentro. Sus mapas son
privados por instancia. La composición fija dieciséis loaders diferidos y diez
dependencias originales; los 185 miembros públicos conservan sus firmas y guardas.

Las implementaciones `wrapped-recovery-backend-v1.mjs`,
`external-defi-catalogue-recovery-backend-v1.mjs` y
`device-external-flat-source-graph-backend-v1.mjs` también están fuera del SCC.
Sus composiciones conservan los propietarios originales y los registros privados
por instancia. Las partes/checkpoints GRAPH, términos de preparación y nacimiento
retenido Aave/Uniswap tienen contratos inferiores completos bajo tipado estricto.
Las guardas usan snapshots separados de los objetos del llamador durante sus
lecturas asíncronas. La implementación grande de GRAPH sigue recibiendo muchos
contratos; esta separación no acredita que toda su cohesión o tipado estén cerrados.

La implementación `native-value-account-backend-v2.mjs` también está fuera
del SCC. La entrada canónica conserva los 103 miembros públicos y los siete
loaders originales; el comprobador estático sigue la binding congelada concreta
hasta su import literal. La regresión usa almacenamiento cifrado real y rechaza
handles copiados y de otras familias, sin recursos ni pruebas financieras.

El lector acotado de archivos, la cola física GRAPH y la lectura de portfolio
tienen cuerpos completos bajo tipado estricto. No poseen claves ni autoridad de
cuenta: el almacén conserva AEAD/CAS, el bootstrap selecciona las entradas físicas
originales y la autoridad de portfolio conserva su bloqueo y sus hijos registrados.
Las pruebas importan estos propietarios completos, sin extraer sus funciones.

La retención de certificados (`original-facts-retention-v2.mjs`) conserva las
comparaciones antes y después de cobertura, pero su emisión y WeakMap siguen en
el operador. La preparación de vaults (`vault-preparation.mjs`) conserva nonce,
referencia, quote history y bloqueo de envío; la custodia y el serial lock siguen
en el adaptador. Sus pruebas importan los cuerpos completos.

Los lectores `inputUint`/`inputPath` están junto a los snapshots en
`components/plain-input`. Los clientes de datos no necesitan cargar preparación
de witnesses ni validación de jobs. Las reexports de preparación conservan su
API. Los consumidores migrados conservan sus algoritmos y la prueba con permisos
Node permite leer únicamente el componente común.

El grupo restante reúne cinco familias principales: recuperación wrapped
(`wrapped-recovery-authority-v1.mjs`), composición SOURCE
(`native-original-source-lifecycle-v1.mjs`), autoridad nativa
(`native-value-account-authority-v2.mjs`), servicio GRAPH del dispositivo
(`device-external-flat-source-graph-service-v1.mjs`) y recuperación del catálogo
DeFi (`external-defi-catalogue-recovery-v1.mjs`). Sus relaciones bidireccionales
siguen visibles; no son cinco componentes independientes ni deuda resuelta.

La selección estricta tiene **100 entradas explícitas**. Se comprueban los cuerpos
completos nuevos de actor, sesión nativa, depósitos y ejecución de cuenta, además
de los mecanismos de journal, recuperación, observación y formatos extraídos.
El lector I84 y el validador de autorizaciones retenidas tienen cuerpos completos
tipados. También están tipados el cierre BTC y los recibos SOURCE de datos,
que no emiten autoridad de cuenta. Los números canónicos y hashes de claims pertenecen a `value-codecs`;
sus consumidores no necesitan importar el protocolo/quorum para decodificar bytes.
Siguen fuera los cuerpos superiores de autoridad nativa, keeper duradero,
sesión general, estado económico, composición SOURCE y recuperación GRAPH/DeFi.
Un contrato tipado de un puerto no acredita el tipado de su implementación.

SOURCE conserva la emisión y consumo de sus tokens privados de checkpoint y
llama directamente al reconciliador de datos del journal. Ya no delega esa
lectura a la autoridad de cuenta. Las entradas wrapped de cuenta, ejecutor,
terminal, claims y sesión tienen consumidores directos a sus propietarios.
Las nueve fachadas privadas retiradas se conservan como `.source` con hash
en `packages/proofs/evidence/retired-facades`, fuera de `src` y sin copias de
ejecución. Los nombres antiguos de sus publicaciones se resuelven como evidencia;
sus imports históricos no se siguen ni se ejecutan.

Las excepciones identifican consumidor y destino exactos. Las reubicaciones
conservan su procedencia; no conceden permiso para añadir nuevas dependencias.
`python3 -B scripts/development/module_boundaries.py --prune` retira únicamente
excepciones que ya no se usan. No aprueba los nuevos ciclos detectados.

## Fuentes activas, recursos e histórico

[`historical-module-inventory.json`](../scripts/historical-module-inventory.json)
identifica las 42 parejas conservadas de engine/protocol y los 63 archivos de
`packages/protocol/src`. `active` indica dónde desarrollar; `historical`
conserva el original con su SHA-256. La comprobación detecta modificaciones,
ausencias y nuevas fuentes dentro del histórico.

Las aplicaciones no consumen protocol. Las pruebas históricas pueden hacerlo,
pero siguen faltando algunos destinos del material original, enumerados en
[`static-check-exceptions.json`](../scripts/development/static-check-exceptions.json).
Conservar ese inventario no implica que toda la generación histórica sea ejecutable.

`environment` distingue fuentes editables y recursos. `ROOT`, `FLAT` y `GOLDEN`
del catálogo describen ubicaciones retenidas; no son rutas donde editar código.
Un bundle candidato lleva su descriptor `runtime-resources.json`, cierre de
fuentes y recursos declarados con hashes. Cuando existe ese descriptor, no usa
como respaldo el runtime histórico de la máquina. Los verificadores originales
siguen decidiendo si las herramientas, claves, fuentes y pruebas son aceptables.

El lector I84 actual usa una cápsula pública sellada por SHA-256 y vuelve a
autenticar los 244 archivos originales desde los recursos declarados. El código
del lector histórico se conserva como `.source`, sin ejecutarlo. El bundle
paginado/wrapped/I84 pasa con Node autorizado a leer solo dentro del candidato;
su traslado no valida por sí solo el arranque de todos los workers económicos.

Los comandos `./dev bundle build`, `verify` y `run` están en
[COMMANDS.md](COMMANDS.md). Preparar o trasladar un bundle no publica una release
ni acredita una ejecución económica. La compatibilidad de generaciones previas
sigue disponible de forma explícita; consulta [STRUCTURE.md](STRUCTURE.md).

El recorrido fijo BTC→SOL para SPL SOURCE pertenece a
`operations/recovery/device-root-spl-source-execution-v4.mjs`; HTTP compone los
recursos originales y delega el ciclo completo. Su prueba importa el propietario
real, con puertos financieros inferiores explícitamente inertes. El cifrado de
estados de SOURCE pertenece a `source-journal/native-state-cipher-v1.mjs`, bajo
tipado estricto; no tiene autoridad, registro ni acceso al sistema de archivos.
La orquestación SOURCE conserva sus guardas y funciones, ahora formateadas; su
composición superior sigue pendiente de separación y tipado completo.

La carga de Solc pertenece a
`packages/engine/src/execution/local/solidity-compiler-v1.mjs`. El compilador
genérico y los perfiles Blue/Aave delegan sus comprobaciones y API C en este dueño,
con los mismos pins originales y sin callbacks/imports remotos. El lector ABI
oficial conserva la autenticación del árbol completo del SDK mediante el manifest
original; ambos cargadores funcionan desde recursos trasladados, bajo Node sin
permiso para leer fuera del paquete. Esto no acredita ejecución económica.
