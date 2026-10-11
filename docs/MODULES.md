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
`apps/wallet/src/server/server.mjs` y usa `@lianum/backend/wallet/http-service`
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
| Journal SOURCE y composición original de runtime | `packages/backend/src/operations/recovery/native-original-source-lifecycle-v1.mjs` | La cápsula anterior reexporta el mismo propietario |

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

Queda **un componente cíclico interno de 139 archivos y 765 imports**, frente a
los 154 archivos y 845 imports del corte anterior. Están fuera de él la mecánica
EVM, el reloj SOURCE, los tres mecanismos de bridges, el actor móvil y la sesión
nativa: cada familia conserva sus registros privados y recibe contratos fijos.
La composición original conserva las funciones públicas y no acepta sustitutos.

El grupo restante reúne cinco familias principales: recuperación wrapped
(`wrapped-recovery-authority-v1.mjs`), composición SOURCE
(`native-original-source-lifecycle-v1.mjs`), autoridad nativa
(`native-value-account-authority-v2.mjs`), servicio GRAPH del dispositivo
(`device-external-flat-source-graph-service-v1.mjs`) y recuperación del catálogo
DeFi (`external-defi-catalogue-recovery-v1.mjs`). Sus relaciones bidireccionales
siguen visibles; no son cinco componentes independientes ni deuda resuelta.

La selección estricta tiene **84 entradas explícitas**. Se comprueban los cuerpos
completos nuevos de actor, sesión nativa, depósitos y ejecución de cuenta, además
de los mecanismos de journal, recuperación, observación y formatos extraídos.
Siguen fuera los cuerpos superiores de autoridad nativa, keeper duradero,
sesión general, estado económico, composición SOURCE y recuperación GRAPH/DeFi.
Un contrato tipado de un puerto no acredita el tipado de su implementación.

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

Los comandos `./dev bundle build`, `verify` y `run` están en
[COMMANDS.md](COMMANDS.md). Preparar o trasladar un bundle no publica una release
ni acredita una ejecución económica. La compatibilidad de generaciones previas
sigue disponible de forma explícita; consulta [STRUCTURE.md](STRUCTURE.md).
