# Perfiles de preparación del laboratorio

Los perfiles declaran qué necesita cada recorrido y preparan sus dependencias de forma separada de la ejecución. El catálogo editable es [`scripts/development/lab-profiles.json`](../scripts/development/lab-profiles.json).

```bash
./dev lab profiles
./dev lab plan wallet
./dev lab check wallet
./dev lab prepare-profile wallet
```

`profiles`, `plan` y `check` son de lectura. Inspeccionan rutas, manifiestos públicos, locks y fuentes; no ejecutan herramientas nativas, servicios ni pruebas. `--json` produce un resultado estructurado en cualquiera de los cuatro comandos.

| Perfil | Inventario mínimo | Ejecución existente, por separado |
| --- | --- | --- |
| `host` | Linux/WSL x64, Python 3.12+, Node fijado y dependencias/enlaces de workspaces | `./dev check` |
| `wallet` | Entorno host y entrada de la wallet web | `./dev start` |
| `platform` | Entorno host y dependencias de la API | `./dev platform admission` |
| `evm` | Host, distribución compatible, Anvil y manifiestos públicos EVM/backed-assets | `./dev lab run`, `./dev lab recovery` |
| `btc-sol` | Requisitos EVM, Bitcoin Core, candidato Solana original seleccionado y manifiesto público CI51/CO42 | `./dev lab btc-sol` |
| `defi` | Requisitos EVM y entradas originales Uniswap/MetaMorpho | `./dev lab defi`, `./dev lab metamorpho` |
| `mobile-original` | Requisitos EVM, dependencias móviles y entrada del cliente Node pareado original V2 | `./dev lab mobile-original` |

El catálogo cubre esos recorridos concretos. Las demás variantes de cadenas, dispositivos y DeFi mantienen sus comandos y requisitos específicos. `mobile-original` comprueba infraestructura para el recorrido Node: SecureStore, biometría, Hermes y teléfono físico necesitan sus propias comprobaciones. `platform` no inspecciona credenciales ni conecta a PostgreSQL.

## Interpretar el resultado

- `available`: todos los elementos del inventario declarado están presentes y las comprobaciones indicadas coinciden.
- `missing`: falta una herramienta, enlace, dependencia, entrada o manifiesto requerido.
- `stale-dependencies`: los manifiestos/locks o las versiones instaladas de dependencias directas no coinciden.
- `stale-generation`: la distribución compatible registrada difiere de las fuentes editables, de los imports traducidos o de sus archivos generados.

Cada requisito conserva su propio estado, aunque el estado global muestre primero una carencia. `plan` termina con código 0 cuando puede elaborar el inventario; `check` y `prepare-profile` devuelven 1 si queda algún requisito pendiente. Un error de configuración o preparación devuelve 2.

La comprobación de Node y herramientas nativas es de presencia y permisos de ejecución en sus rutas fijadas. La comprobación npm compara manifiestos/locks, enlaces y versiones directas; no autentica los bytes de todos los paquetes. Los artefactos se comprueban por presencia de sus manifiestos públicos, sin leer estado privado. Los loaders originales siguen comprobando hashes, perfiles y vinculaciones antes de utilizarlos.

`available` no acredita ejecución económica ni aceptación de una publicación de fuentes. El informe lo expresa mediante `artifactIntegrityChecked: false`, `financialSourceGeneration: "NOT_CHECKED"` y `financialAcceptance: false`. La generación compatible comprueba los archivos públicos registrados en el último build; las generaciones económicas conservan su flujo de preparación y validación propio.

Los originales conservados fuera de las carpetas de código solo se admiten si su ruta y destino coinciden con el mapa original de `scripts/layout.json` y con el inventario público permitido. Hay una única excepción histórica: `archive/source-evidence/wrapped-key-preparation-bound-20261006/execution-receipts/ci-prepare-key-20261006/failure-preservation-e84fb980-fbaf-428d-b7b3-ab5080623921/active.lock`. El inspector excluye ese registro sin leerlo ni autenticar su hash y enumera su ruta exacta en el resultado. La excepción no permite otros archivos `.lock` ni otras rutas privadas del archivo histórico.

## Qué prepara `prepare-profile`

El comando reevalúa el inventario bajo un bloqueo exclusivo y ejecuta únicamente los pasos pendientes permitidos:

1. Instalar el Node oficial fijado si falta, mediante el bootstrap existente.
2. Preparar enlaces y dependencias raíz con `source_runtime.py` si hacen falta. Esta herramienta valida el lock y conserva su bloqueo propio.
3. Ejecutar `npm ci --ignore-scripts --no-audit --no-fund` para `apps/platform` o `apps/mobile` cuando el perfil necesita esas dependencias y el inventario está desfasado.
4. Materializar la distribución compatible con `workspace.py` únicamente para los perfiles económicos que la necesitan.

npm utiliza `.local/cache/npm`. Cada paso tiene un límite de 120 segundos y su grupo de procesos se cancela conjuntamente. Repetir la preparación con requisitos ya disponibles no reinstala esas dependencias.

**Si faltan artefactos, el informe continúa indicando `missing`.** Este comando no descarga respaldos públicos, compila circuitos, prepara claves de prueba, recrea custodia ni sustituye runtimes personalizados. El material público original debe restaurarse mediante su procedimiento documentado. Un lock incoherente necesita una actualización explícita y revisada.

Las preparaciones no arrancan nodos, financian cuentas, ejecutan recorridos, reabren laboratorios ni tocan estados privados. Los comandos de ejecución de la tabla son pasos posteriores explícitos; el catálogo nunca los convierte en acciones de preparación. El comando histórico `./dev lab prepare` conserva su preparación criptográfica EVM: tiene un alcance distinto de `prepare-profile` y no se invoca desde estos perfiles.

## Mantener un perfil

Declara requisitos concretos y la entrada pública del recorrido. Conserva separadas presencia, correspondencia de fuentes y aceptación económica. Los pasos de preparación se eligen de una lista cerrada; una cadena de comandos del catálogo nunca se ejecuta.

Las fixtures de [`test_lab_profiles.py`](../scripts/development/test_lab_profiles.py) comprueban lectura sin efectos, aislamiento de datos privados, deriva de locks y generación, preparación selectiva, idempotencia y propagación de fallos. Se ejecutan sin instalar aplicaciones ni iniciar laboratorios:

```bash
python3 -B scripts/development/test_lab_profiles.py
```
