# Estructura del código

Las carpetas de trabajo contienen archivos físicos editables. Los nombres de
entregas y versiones anteriores quedan dentro de `archive/` y de la copia
interna utilizada durante la ejecución.

| Carpeta | Contenido | Primer archivo útil |
| --- | --- | --- |
| `apps/wallet/` | Aplicación web y servidor HTTP que compone las sesiones | `src/server/run.mjs`, `src/server/server.mjs`, `src/client/app.mjs` |
| `apps/mobile/` | Cliente nativo, custodia de dispositivo y permisos móviles | `App.tsx`, `README.md` |
| `apps/platform/` | API móvil y registro PostgreSQL; adaptador económico pendiente | `src/run.mjs`, `README.md` |
| `packages/mobile-protocol/` | Esquemas y bytes firmados compartidos sin Node | `src/authorization.mjs` |
| `packages/backend/` | API, estado de cuentas, ejecución y adaptadores | `src/api/accounts/flat-account-session.mjs` |
| `packages/custody/` | Custodia local, firmas y procesos del propietario | `src/processes/flat-owner-process.mjs` |
| `packages/proofs/` | Workers, circuitos actuales Noir y bibliotecas de pruebas | `src/catalog.mjs`, `circuits/` |
| `packages/crypto/` | Implementación candidata Poseidon y sus dependencias | `src/` |
| `packages/engine/` | Motor compartido que aún consume la aplicación actual | `src/execution/accounts/generic-account-journal.mjs` |
| `packages/protocol/` | Implementación de protocolo conservada de la generación anterior | `src/execution/` |
| `packages/components/` | Componentes de circuito y sus utilidades | `src/`, `circuits/` |
| `packages/chains/` | Driver Java de Tron | `drivers/owned-tron-native-value/` |
| `contracts/` | Contratos Solidity, separados por consumidor | `wallet/`, `engine/`, `protocol/` |
| `tests/integration/` | Pruebas de integración de la wallet | Archivos `.mjs` existentes |
| `scripts/` | Comandos del proyecto, compiladores y utilidades de laboratorio | `development/dev` |
| `infra/google-cloud/` | Cloud Run, SQL y jobs deshabilitados; validación local | `README.md`, `main.tf` |
| `experiments/` | Circuitos y código experimental heredado; algunos siguen siendo dependencias | `engine/private-core-proof/` |
| `docs/` | Documentación y referencias del producto | Este archivo |
| `archive/` | Entregas originales, propuestas, recibos y respaldo de la restauración | `README.md` |

## Interior de los componentes

```text
apps/wallet/
├── README.md                 Entrada y explicación de la aplicación
├── src/
│   ├── client/
│   │   ├── app.mjs           Entrada de la interfaz
│   │   ├── state/            Modelo de pantalla
│   │   └── features/         Cuentas, cartera, DeFi, claims y retiradas
│   └── server/               HTTP, seguridad y errores
├── tests/                    Servidor, interfaz, integración y helpers
└── docs/                     Diseño y contratos de interacción

packages/backend/
├── README.md                 Mapa de dominios
├── src/
│   ├── api/                  Clientes y sesiones por función
│   ├── accounts/             Autoridad, almacenamiento y cartera
│   ├── chains/               EVM, Bitcoin, Solana, Tron y shared
│   ├── claims/               Autorización, controladores, pagos y storage
│   ├── execution/            Preparación, ejecución y reconciliación
│   ├── defi/                 Vaults, posiciones, entregas y retiradas
│   ├── providers/            Proveedores de ejecución
│   └── operations/           Despliegues, operadores y releases
├── tests/                    Mismos dominios; fixtures separados
└── docs/                     Contratos documentados
```

Custodia, pruebas criptográficas, motor y protocolo también separan `src/`
de `tests/` y agrupan las implementaciones por dominio. Cada componente tiene
un `README.md` breve con responsabilidades y entradas concretas. Los nombres
de versiones se conservan en los archivos cuando identifican contratos
existentes, pero ya no determinan el primer nivel de navegación.

Las carpetas de integración y scripts se agrupan por flujo o función. Los
paquetes aún comparten recursos; no son servicios npm independientes. La
aplicación utiliza JavaScript ESM, HTML y CSS.

Para ejecutar un grupo de pruebas, por ejemplo:

```bash
./dev test packages/backend/tests/execution/encoding
```

El comando selecciona los archivos `*.test.mjs` de esa carpeta y sus
subcarpetas; no amplía la selección al antiguo directorio plano.

## Ejecución durante la transición

```text
Código editable                    Copia interna de ejecución
apps/                         ──┐
packages/                     ──┼── ./dev build ──> .internal/runtime/
contracts/, tests/, scripts/  ──┘
```

El código heredado valida rutas físicas y hashes. El comando de preparación
copia los archivos a sus rutas compatibles y traduce los imports relativos
para ese recorrido. Los imports del código editable apuntan a la estructura
nueva. La traducción inicial reproduce exactamente los 1.684 archivos
originales, sin enlaces simbólicos ni cambios en la lógica del producto.

`start`, `test`, `check` y `node` preparan esa copia automáticamente. Edita las
carpetas normales, guarda el archivo y vuelve a ejecutar el comando. Los
archivos nuevos bajo las carpetas mapeadas también se incorporan; los archivos
eliminados se retiran de la copia de ejecución. La wallet requiere reiniciar
el proceso para cargar cambios. No hay recarga automática configurada.

Usa los comandos de la raíz. Ejecutar directamente un módulo con `node` o un
circuito desde su carpeta nueva todavía puede encontrar rutas de recursos
antiguas. `./dev node packages/backend/src/ruta.mjs` traduce la ruta de entrada.

La compatibilidad es temporal. Quedan por extraer las dependencias compartidas,
hacer explícitas las rutas de recursos y publicar nuevos manifiestos cuando
cambie código ligado a pruebas o releases. Una edición funcional puede
invalidar un hash de origen: esa validación debe revisarse junto con el cambio,
sin desactivar las comprobaciones para conseguir que una operación pase.

La copia interna incluye dependencias y herramientas públicas restauradas. El
bootstrap de [DEVELOPMENT.md](DEVELOPMENT.md) permite ejecutar las pruebas de host
desde un clon limpio. La restauración completa de releases y runtimes necesita
los materiales descritos en `scripts/development/README.md`.

`apps/mobile`, `apps/platform`, `packages/mobile-protocol` e `infra` se ejecutan
directamente con dependencias explícitas; no usan la traducción de rutas heredada.
El cliente móvil no es una conversión automática de la wallet web y la API aún
no conecta sus permisos al motor económico.

Mientras exista la compatibilidad, conserva nombres de archivo específicos.
El build rechaza dos fuentes que correspondan a la misma ruta antigua.
Las guías README nuevas no se incluyen en la copia de ejecución.
