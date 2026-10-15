# Trabajar con cambios pequeños

La rutina de desarrollo comienza en las fuentes de `apps/` y `packages/`.
Las pruebas del componente y los laboratorios completos tienen comandos
distintos. La [referencia de comandos](COMMANDS.md), `./dev help` y el
catálogo de comprobaciones se generan o leen desde
[`scripts/development/workflows.json`](../scripts/development/workflows.json).

## Preparar y comprobar el entorno

En Linux/WSL x64, con Python 3.12 o superior y Git:

```sh
./dev prepare host
./dev status
./dev workflows
```

`prepare host` reutiliza el instalador existente: instala o comprueba Node
24.19.0 mediante su archivo oficial y los hashes fijados. `status` tarda unos
segundos: consulta versiones de herramientas y presencia de dependencias.
Devuelve código 1 si faltan las herramientas del host. Los marcadores de
dependencias indican presencia, no integridad de toda una instalación.
El arranque y las pruebas preparan los enlaces npm de los módulos del
workspace según el lock, sin copiar las fuentes al runtime histórico.

Para instalar las dependencias de una aplicación concreta:

```sh
./dev prepare mobile
./dev prepare platform
```

Estas dos variantes ejecutan `npm ci --ignore-scripts` con el lock de la
aplicación seleccionada. La instalación necesita acceso a los registros
públicos. El arranque de aplicaciones, las compilaciones Android y los
laboratorios se solicitan con sus comandos propios.

`./dev doctor` conserva la comprobación completa de integridad de los
materiales restaurados. Se utiliza después de restaurar o cambiar esos
materiales, o al investigar un fallo de integridad; `status` cubre la consulta
diaria de preparación. Ninguno de ambos acredita una operación económica.

## Preparar solo el laboratorio necesario

```sh
./dev lab profiles
./dev lab plan evm
./dev lab prepare-profile evm
./dev lab check evm
```

Los perfiles `host`, `wallet`, `platform`, `evm`, `btc-sol`, `defi` y
`mobile-original` declaran sus dependencias. Plan y check son de lectura;
prepare instala únicamente dependencias ausentes o desactualizadas y prepara
la compatibilidad cuando el perfil la necesita. No arranca redes ni crea
cuentas o pruebas criptográficas. Un original ausente sigue apareciendo como
ausente; no se fabrica para aprobar el inventario. El alcance de cada perfil
está en [LAB-PROFILES.md](LAB-PROFILES.md).

## Actualizar hashes de las fuentes actuales

```sh
./dev pins check
./dev pins update --profile mobile
git diff
```

El comando sustituye la edición manual de las tres tablas actuales declaradas:
`mobile`, `platform` y `callers` (`all` las incluye). Muestra cada cambio y
verifica las dependencias públicas fijadas antes de escribir. Platform actualiza
también su referencia en callers. No cambia originales, publicaciones ni
recibos históricos, ni acepta automáticamente archivos nuevos en la política. El perfil `runtime` gestiona también los pins actuales de los clientes rollup, sus dispatchers y el guard SOURCE, declarados en `source-pins.json`. Los hashes de binarios, fixtures y publicaciones originales conservan su significado histórico.
Los consumidores económicos conservan su paso explícito de aceptación de
generación. [Detalle y límites](SOURCE-GENERATIONS.md).

## Elegir qué comprobar

```sh
# Ver qué comprobaciones propone el cambio actual; no ejecuta pruebas.
./dev test --changed --plan

# Ejecutar esa selección de comprobaciones host/componentes.
./dev test --changed

# Incluir también commits realizados desde una rama o commit base.
./dev test --changed --base main --plan

# Seleccionar expresamente un componente.
./dev test --component wallet
./dev test --component crypto --component components

# Ejecutar la regresión concreta de un defecto.
./dev test packages/backend/tests/execution/account/execution/native-value-terminal-first.test.mjs
```

`--changed` incluye modificaciones preparadas para commit, modificaciones sin
preparar, eliminaciones y archivos nuevos que Git no ignore. `--base` añade los
cambios respecto al ancestro común con la referencia indicada; debe existir
esa referencia localmente. No presupone que la rama principal se llame `main`.

La selección recorre imports literales para encontrar pruebas afectadas entre
los archivos del catálogo. El archivo original y `packages/protocol` congelado
quedan fuera de ese grafo y de las búsquedas habituales con `rg`; se consultan
explícitamente con `rg --no-ignore`. Sus comprobaciones de integridad permanecen
separadas. Cuando no puede vincular un cambio con una prueba,
propone las comprobaciones básicas de su componente y lo indica como
`component smoke fallback`. Esa selección comprueba comportamiento general:
no acredita automáticamente cada línea modificada. Los imports calculados en
ejecución, contratos Solidity, circuitos y otros archivos sin comprobación
catalogada requieren seleccionar la validación correspondiente.

Una modificación exclusivamente documental no ejecuta pruebas. Los archivos
sin selección automática aparecen explícitamente y la ejecución devuelve
código 2. `--component contracts` también devuelve código 2: hay que elegir la
compilación y prueba del contrato modificado; las pruebas host no validan su
bytecode.

El límite habitual es 24 archivos de prueba. Una selección mayor se muestra y
devuelve código 2 antes de arrancar pruebas. Puede acotarse por componente o
ampliarse expresamente con `--max-files 40`. Además, la selección completa
tiene un presupuesto de 120 segundos, configurable con `--timeout 30` o un
valor explícito mayor. Python y Node comparten ese presupuesto. Al agotarlo
se detiene el grupo de procesos propio y se devuelve 124. La cancelación
devuelve 130/143 y también cierra los hijos. Los comandos de pruebas no deben
desacoplar procesos; los laboratorios tienen su propia gestión explícita.

La salida de las pruebas se muestra y guarda conforme llega. Cada proceso
tiene un límite de 8 MiB de salida; excederlo devuelve 125. Los informes host
incluyen fecha de comienzo/final, duración, selección, commit y SHA256 de las
modificaciones de código. `TIMEOUT`, `CANCELLED`, `OUTPUT_LIMIT`,
`ORPHANED_PROCESS` y `SOURCE_CHANGED` no son aprobaciones. Una ejecución sin
pruebas aprobadas tampoco se etiqueta PASS. Un fallo detiene la selección.

`./dev test` sin opciones mantiene la selección habitual de pruebas host.
`--component` permite pedir varios componentes concretos, mientras que
`--changed` utiliza el cambio en Git. `--plan --json` proporciona la selección
para herramientas del editor sin ejecutar pruebas.

## Análisis estático sin ejecutar el producto

```sh
./dev static
./dev static --changed
```

El parser de TypeScript comprueba sintaxis y nombres importados/exportados
en las declaraciones estáticas del núcleo, sin cargar sus módulos ni crear
custodia. `--changed` limita ese análisis a los archivos modificados y nuevos.
No infiere imports calculados ni demuestra comportamiento económico.

`scripts/development/tsconfig.checkjs.json` aplica checkJs estricto a las
implementaciones de rutas, errores, integridad de archivos, autorizaciones y
consentimientos móviles, revisión y estado privado de cuenta, acciones de
recuperación y ciclo de vida de procesos propios. Las entradas exactas están
enumeradas en esa configuración. Es una adopción incremental: el resto del
núcleo JavaScript no se declara tipado.
La configuración no usa `@ts-ignore` ni desactiva errores para hacerla pasar.
Además se comprueban nombres sin binding léxico en la fábrica de autoridad y
los módulos de operaciones y diario enumerados en `static-bindings.json`. Este control
detecta referencias como un `account` que no se haya pasado ni declarado;
analiza esos archivos sin cargar su grafo de dependencias y no equivale a
tipar todas sus estructuras dinámicas.
Los siete contratos de operaciones enumerados en `static-operation-ports.json`
se contrastan por AST con su composición: cada puerto declara miembros
explícitos y recibe exactamente los que utiliza, sin campos sobrantes, spreads
ni reenvío del puerto completo. El control impide pasar capacidades generales
llamadas `context`, `record`, `password` o `write`; el acceso al registro y al
writer permanece en la fábrica y su diario privado. Este control estructural
no demuestra por sí solo el comportamiento de los callbacks.
Las doce referencias históricas ausentes de `protocol` están enumeradas
exactamente en `static-check-exceptions.json`, visibles en la salida y
prohibidas como dependencias activas por el control de módulos. Un import
roto nuevo falla; una excepción cuyo archivo ya se recuperó también falla
hasta retirarla. No se redirigen esas identidades históricas a otro módulo.

`./dev check` incluye estos controles. La CI verifica además que la referencia
de comandos coincide con el catálogo: `python3 -B scripts/development/workflow.py docs-check`.

## Qué demuestra cada nivel

| Nivel | Comprueba | Ejemplo explícito |
| --- | --- | --- |
| Host | Lógica, formatos y errores con fixtures locales | `./dev test` |
| Componente | Comprobaciones acotadas de una parte de la aplicación | `./dev test --component wallet` |
| Integración | Relación entre componentes o servicios reales de prueba | `./dev test tests/integration/mobile/paired-original-account-http-v2.test.mjs` |
| Económico | Operación y recuperación en un laboratorio con redes, custodia y pruebas originales | `./dev lab run` o `./dev lab recovery` |

Las dos últimas filas necesitan preparación específica. PostgreSQL real,
por ejemplo, se comprueba con `./dev npm --prefix services/api-server run
test:postgres` y necesita Docker. Los recorridos económicos se documentan en
[EVM-LAB.md](EVM-LAB.md) y las guías del dominio correspondiente.
`./dev test --changed` nunca añade un comando `lab` a su selección.

Con Google Chrome instalado, el navegador real comprueba los imports del
cliente, HTTP, estado desconectado y retirada de tokens del DOM:

```sh
./dev npm run test:browser
```

Esta comprobación utiliza un perfil temporal de Chrome con sandbox y cierra
su servidor al terminar. Su aceptación corresponde a la wallet desconectada;
los recorridos con fondos tienen sus laboratorios específicos.

## Entradas actuales y compatibilidad

`./dev workflows` muestra la ruta de entrada, el comando y el alcance de cada
recorrido registrado. Se mantiene en el mismo catálogo que la selección de
pruebas; sus rutas se comprueban con una regresión corta. El catálogo apunta a
las entradas actuales, no copia números de releases ni declara aceptadas
generaciones nuevas por el hecho de que existan sus archivos.

Los nombres históricos siguen apareciendo en los recorridos que requieren
compatibilidad con artefactos originales. Su identificación y preparación
se consultan con `./dev sources status` y se documentan en
[SOURCE-GENERATIONS.md](SOURCE-GENERATIONS.md). `./dev sources prepare` prepara
una instantánea de fuentes; no equivale a compilar, publicar o aprobar una
operación económica. `./dev sources adopt --generation <huella>` registra su
adopción por los consumidores migrados tras verificar las fuentes y los
artefactos originales. Esa gestión se solicita independientemente de las
pruebas rápidas.

Para trasladar una entrada fuera de este checkout se utiliza `./dev bundle`:
reúne su cierre de fuentes y los recursos declarados, verifica sus hashes y
genera un lanzador que resuelve las rutas desde la ubicación del paquete.
No requiere copiar el árbol acumulado de `.internal/runtime`. El formato del
manifiesto y los ejemplos están en [la guía de environment](../packages/environment/README.md).
El paquete es
un candidato de ejecución: la aceptación económica de su consumidor sigue
siendo un paso separado.

El estado de implementación sigue en [STATUS.md](../STATUS.md); aprobar una
selección host no incrementa por sí solo un porcentaje de producto.

## Mantener el catálogo

Cuando se añade un componente, se declara su prefijo en `watch` y una pequeña
selección de regresiones host en `tests`. Para nuevos recorridos se añade una
entrada con nivel y alcance explícitos. Las campañas con redes o pruebas
originales pertenecen a `entrypoints`, no a la selección automática de
`components`. Una revisión del catálogo debe confirmar ese alcance antes de
añadir pruebas a la rutina automática.

Validación del selector:

```sh
python3 -B scripts/development/test_workflow.py
```
