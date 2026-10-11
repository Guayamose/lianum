# Estructura del código

El código del producto se edita en las carpetas visibles de la raíz. Las
herramientas, los recursos restaurados y el estado de esta máquina se describen
por separado en [LOCAL-ENVIRONMENT.md](LOCAL-ENVIRONMENT.md).

| Carpeta | Contenido | Primer archivo útil |
| --- | --- | --- |
| `apps/wallet/` | Interfaz web y composición de sus recursos con el servicio HTTP backend | `src/server/run.mjs`, `src/server/server.mjs`, `src/client/app.mjs` |
| `apps/mobile/` | Cliente nativo, custodia de dispositivo y permisos móviles | `App.tsx`, `README.md` |
| `apps/platform/` | API móvil, registro PostgreSQL y gateway económico local | `src/entry.mjs`, `README.md` |
| `packages/mobile-protocol/` | Esquemas, bytes firmados y cliente compartido sin DOM | `src/authorization.mjs` |
| `packages/backend/` | API, estado de cuentas, ejecución y adaptadores | `src/api/accounts/flat-account-session.mjs` |
| `packages/custody/` | Custodia del propietario, firmas y bindings | `src/signing/flat-owner-custody.mjs` |
| `packages/proofs/` | Workers, circuitos actuales Noir y bibliotecas de pruebas | `src/catalog.mjs`, `circuits/` |
| `packages/crypto/` | Implementación candidata Poseidon y sus dependencias | `src/` |
| `packages/engine/` | Estado, coordinación y mecanismos compartidos de ejecución | `src/execution/accounts/generic-account-journal.mjs` |
| `packages/protocol/` | Implementación de protocolo conservada de la generación anterior | `src/execution/` |
| `packages/components/` | Componentes de circuito y sus utilidades | `src/`, `circuits/` |
| `packages/environment/` | Rutas explícitas del código y de los datos conservados | `src/paths.mjs` |
| `packages/chains/` | Driver Java de Tron | `drivers/owned-tron-native-value/` |
| `contracts/` | Contratos Solidity, separados por consumidor | `wallet/`, `engine/`, `protocol/` |
| `tests/integration/` | Pruebas de integración de la wallet | Archivos `.mjs` existentes |
| `scripts/` | Comandos del proyecto, compiladores y utilidades de laboratorio | `development/dev` |
| `infra/google-cloud/` | Cloud Run, SQL y jobs deshabilitados; validación local | `README.md`, `main.tf` |
| `experiments/` | Fuentes experimentales e históricas; entradas compatibles hacia propietarios actuales | `engine/private-core-proof/` |
| `docs/` | Documentación y referencias del producto | Este archivo |
| `archive/` | Entregas originales, propuestas, recibos y respaldo de la restauración | `README.md` |

`packages/` agrupa módulos compartidos por las aplicaciones. No representa
una colección de servicios desplegados independientemente. `apps/mobile/`
es un cliente propio: comparte protocolos con la web y el backend, pero no
se obtiene convirtiendo automáticamente la interfaz web.

El backend se arranca con `./dev platform` desde `apps/platform/src/entry.mjs`.
El perfil predeterminado `admission` mantiene las operaciones económicas
indisponibles. Los perfiles explícitos `original-native-new` y
`original-native-reopen` componen el operador y gateway originales en el mismo
proceso, con su custodia, workers y persistencia. Consulta
[la composición local](../apps/platform/docs/LOCAL-COMPOSITION.md) para su
configuración y alcance. Google Cloud conserva su preparación local.

Los contratos que comparten wallet y backend se editan en
`packages/mobile-protocol/src/wallet/contracts/`; la proyección y cliente sin
DOM están en `wallet/client/`. El servicio HTTP común se edita en
`packages/backend/src/api/wallet/http-service.mjs`; la app añade sus recursos
visuales desde `src/server/server.mjs`. Las rutas anteriores de la wallet reexportan esas
implementaciones. El motor activo es `packages/engine`; `packages/protocol`
conserva la generación histórica inventariada. [Dependencias](MODULES.md).

La autoridad nativa conserva su entrada en
`packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs`.
Sus operaciones están separadas por dominio en
[`accounts/authority/native-value/`](../packages/backend/src/accounts/authority/native-value/README.md).

## Interior de los componentes

```text
apps/wallet/
├── README.md                 Entrada y explicación de la aplicación
├── src/
│   ├── client/
│   │   ├── app.mjs           Entrada de la interfaz
│   │   ├── state/            Modelo de pantalla
│   │   └── features/         Cuentas, cartera, DeFi, claims y retiradas
│   └── server/               Composición web y fachadas de compatibilidad
├── tests/                    Servidor, interfaz, integración y helpers
└── docs/                     Diseño y contratos de interacción

packages/backend/
├── README.md                 Mapa de dominios
├── src/
│   ├── api/                  Clientes y sesiones por función
│   ├── accounts/             Autoridad, almacenamiento, cartera y runtimes
│   ├── chains/               EVM, Bitcoin, Solana, Tron y shared
│   ├── claims/               Autorización, controladores, pagos y storage
│   ├── execution/            Preparación, ejecución y reconciliación
│   ├── custody/              Procesos, observación y composición del propietario
│   ├── proving/              Integración de pruebas con claims y cuentas
│   ├── defi/                 Vaults, posiciones, entregas y retiradas
│   ├── providers/            Proveedores de ejecución
│   ├── coordination/         Composición de cohortes
│   ├── payments/             Orquestación de pagos
│   ├── storage/              Persistencia privada de apoyo
│   └── operations/           Despliegues, operadores y releases
├── tests/                    Mismos dominios; fixtures separados
└── docs/                     Contratos documentados
```

Custodia, pruebas criptográficas, motor y protocolo también separan `src/`
de `tests/` y agrupan las implementaciones por dominio. Cada componente tiene
un `README.md` breve con responsabilidades y entradas concretas. Los nombres
de versiones se conservan en los archivos cuando identifican contratos
existentes, pero ya no determinan el primer nivel de navegación.

Las carpetas de integración y scripts se agrupan por flujo o función.
Los paquetes tienen nombres `@lianum/*`, exports y dependencias explícitas en
sus `package.json`. Son módulos locales del mismo producto; comparten recursos.
[MODULES.md](MODULES.md) describe sus interfaces y las dependencias internas
heredadas que todavía quedan. El grafo de imports declarados entre paquetes es acíclico; siguen
pendientes ciclos entre archivos dentro de la composición backend. Las pruebas
consumen código del producto. Los procesos activos se componen en proofs y los
recursos compartidos en components; las cargas calculadas requieren declaración
explícita para su empaquetado, como se explica en esa guía.
La wallet web utiliza JavaScript ESM, HTML y CSS.

Para ejecutar un grupo de pruebas, por ejemplo:

```bash
./dev test packages/backend/tests/execution/encoding
```

El comando selecciona los archivos `*.test.mjs` de esa carpeta y sus
subcarpetas; no amplía la selección al antiguo directorio plano.

## Fuentes y compatibilidad

```text
Trabajo habitual: apps/ y packages/ → ./dev start, node, test, check
Candidato de fuentes y recursos trasladable: ./dev bundle build / verify / run
Generación para verificadores históricos: ./dev sources prepare
Compatibilidad manual: ./dev build --legacy → .internal/runtime/
```

`./dev build` prepara enlaces npm entre los paquetes; no copia el código.
`start`, `test`, `check` y `node` ejecutan los archivos editables. Guarda y
reinicia el proceso de wallet para cargar cambios; no hay recarga automática.
Las rutas de recursos de uso habitual están separadas de las rutas de código.

Los workers criptográficos y las campañas económicas conservan validadores de
bytes, rutas e identidades originales. Su ejecución utiliza la copia compatible.
Las herramientas activas de wallet/assembly y los validadores de claves viven
en `packages/proofs/src/toolchain/` y `src/verification/`. Algunas entradas
experimentales anteriores son fachadas; los artefactos, bibliotecas y fuentes
originales siguen sujetos a los hashes de su generación. `packages/crypto/src/component-tooling.mjs` también conserva requisitos de recursos históricos.
`./dev legacy node …`, `./dev legacy test …` y los comandos `./dev lab …`
preparan la compatibilidad antes de ejecutarse. Nunca se edita la copia interna.

`./dev sources status` identifica qué fuentes publicadas han cambiado.
`./dev sources prepare` captura la nueva generación y verifica la reutilización
exacta de artefactos; no ejecuta operaciones económicas ni publica una release.
`./dev sources check` detecta diferencias frente a la publicación anterior,
también después de preparar un candidato nuevo.
Una generación preparada no acredita por sí sola el recorrido económico.

El bundle de fuentes es otro resultado explícito: reúne el cierre de imports y
las fuentes adicionales indicadas, incorpora los recursos públicos declarados
y los verifica antes de ejecutarlos. Su descriptor `runtime-resources.json`
hace que las rutas se resuelvan dentro del candidato trasladado. No incorpora
por defecto claves ni estado de una cuenta. Consulta [COMMANDS.md](COMMANDS.md)
para `./dev bundle`; sus opciones están en `./dev bundle build --help`. Las
comprobaciones de identidad y aceptación de cada consumidor permanecen activas.

La copia interna incluye dependencias y artefactos públicos restaurados.
Las herramientas se guardan en `.internal/dev/toolchains/`. El bootstrap de
[DEVELOPMENT.md](DEVELOPMENT.md) permite ejecutar las pruebas de host desde un
clon limpio. La restauración completa de releases y runtimes necesita los
materiales descritos en [la guía de restauración](../scripts/development/README.md).

`apps/mobile`, `apps/platform`, `packages/mobile-protocol` e `infra` se ejecutan
directamente con dependencias explícitas; no usan la traducción de rutas heredada.

Mientras exista la compatibilidad, conserva nombres de archivo específicos.
El build rechaza dos fuentes que correspondan a la misma ruta antigua.
Las guías README nuevas no se incluyen en la copia de ejecución.

## Archivos locales e historial

| Ubicación | Qué contiene |
| --- | --- |
| `.internal/runtime/` | Copia compatible, recursos originales y laboratorios que la usan |
| `.internal/dev/toolchains/` | Herramientas de desarrollo instaladas localmente |
| `.internal/dev/drafts/` | Trabajo pendiente todavía no integrado; se conserva físico |
| `.internal/dev/reports/` | Resúmenes actuales y evidencia enlazada por las guías |
| `.local/` | Configuración privada, claves, bases de datos, estado y cachés |
| `.local/cache/npm/` | Caché npm compartida y regenerable, separada del estado privado |
| `.local/history/cleanup-*/` | Historial compactado con manifiesto y archivos `drafts.tar.gz`, `reports.tar.gz` y `snapshots.tar.gz`, según la selección |

`./dev clean` muestra la selección sin modificar archivos. `./dev clean --apply`
retira copias temporales y cachés regenerables, y compacta el historial
seleccionado antes de retirar sus carpetas. No elimina los recursos originales
ni el estado económico. [LOCAL-ENVIRONMENT.md](LOCAL-ENVIRONMENT.md) detalla
qué se conserva y cómo recuperar cada clase de respaldo.

`./dev resources` muestra el espacio por función y señala recursos sin
clasificar. `./dev clean --scope caches` limita la selección a cachés;
`--scope history` selecciona historial para respaldo. Los perfiles de
`./dev lab profiles` permiten preparar solo las dependencias de cada recorrido.
