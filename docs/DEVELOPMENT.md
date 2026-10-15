# Desarrollo y comprobaciones

El código se edita en `apps`, `packages` y `contracts`. La wallet y las pruebas
host ejecutan directamente esas fuentes. `./dev build` comprueba los manifiestos
y el lock e instala las dependencias cuando cambian; no materializa otra copia
del código. Consulta [STRUCTURE.md](STRUCTURE.md) para encontrar cada dominio y
[WORKFLOW.md](WORKFLOW.md) para elegir comprobaciones por cambio o componente.

## Copia limpia sin materiales de restauración

Desde Linux/WSL x64, con Git y Python 3.12 o superior, en la raíz de una copia
del repositorio:

```sh
./dev prepare host
./dev build
./dev check
./dev start
```

El primer comando descarga Node 24.19.0 desde su distribución oficial, verifica
el SHA256 fijado del archivo y el binario instalado. No modifica Node global.
La selección habitual comprueba transporte HTTP, consentimiento y
reconciliación. No requiere los binarios nativos ni el CRS. Los resultados de
host utilizan fixtures y no acreditan por sí solos una operación económica.

Cuando cambies fuentes usadas por lectores económicos, prepara y adopta su
nuevo cierre con `./dev sources prepare --adopt`. El comando verifica los
originales y la misma generación antes de seleccionar; no hay que escribir su
hash a mano ni regenerar pruebas. Su alcance está en
[SOURCE-GENERATIONS.md](SOURCE-GENERATIONS.md).

Para verificar expresamente la conservación histórica:

```sh
./dev build --legacy
python3 -B scripts/development/verify_layout.py --tracked-delivery
python3 -B scripts/development/test_workspace.py
```

La verificación `--tracked-delivery` comprueba los 1.716 originales versionados
y declara 933 archivos locales de referencias, paquetes revisados y borradores
fuera de su alcance. Verifica bytes, SHA256 y el permiso de ejecución que Git
conserva; Git no conserva diferencias como `0600` frente a `0644`. Rechaza
fuentes originales obligatorias sin versionar.
`./dev legacy check` añade la comprobación completa de los archivos restaurados
y necesita además las dependencias de Solidity/Noir para sus diagnósticos.
`./dev check` verifica los contratos entre módulos, sintaxis/imports, las APIs
de checkJs declaradas, documentación de comandos, ejecución desde fuentes y
la selección habitual host. Las pruebas muestran salida en directo y tienen
120 segundos por selección (`--timeout N`), con cierre de hijos y resultado
explícito al agotar el plazo. Los informes incluyen revisión y huella de cambios.
Consulta [WORKFLOW.md](WORKFLOW.md) para el alcance y [COMMANDS.md](COMMANDS.md)
para la referencia generada desde el mismo catálogo que `./dev help`.

Para cerrar un bloque con toda la batería mantenida, utiliza:

```sh
./dev block-check --plan
./dev block-check --timeout 7200 --stage-timeout 600
```

El plan enumera todos los archivos `*.test.mjs`, `*.test.cjs`, `*.test.js`,
`*.test.ts`, `*.test.mts` y `*.test.cts` de `packages/*/tests`,
`apps/*/tests`, `tests` y `scripts/development`, junto con sus pruebas
`unittest` `test_*.py`. No utiliza la selección habitual de 35 archivos ni
los componentes curados. Registra las exclusiones de dependencias instaladas,
archivos generados, enlaces, estado privado y evidencia histórica. Un formato
de prueba no soportado se declara como bloqueo en lugar de desaparecer del plan.

La ejecución es secuencial: auditoría de imports runtime —incluido Mobile—,
fronteras, análisis estático existente, TypeScript móvil y cada archivo Node o
Python. El auditor lee AST y exports de paquetes sin evaluar los módulos del
producto; distingue los nombres disponibles en runtime de las declaraciones
de tipos. Las dependencias calculadas y la interoperabilidad de paquetes
externos/CommonJS que no puede demostrar quedan explícitas en el informe.

Cada ejecución conserva un informe propio en
`.internal/dev/reports/block-check-<id>/report.json`, con inventario, huella de
contenido, revisión antes/después y resultados por archivo. Pruebas saltadas,
`todo`, fallos esperados o cero pruebas no cuentan como cierre completo. Un
fallo normal permite comprobar las familias siguientes; cancelación, procesos
huérfanos, plazo agotado o cambios de fuentes impiden un resultado completo.
El comando no instala dependencias ni prepara o adopta una generación: fija
primero las fuentes y el entorno con los responsables del bloque. Los drivers
económicos, el navegador y el teléfono sin nombre `*.test.*` conservan sus
recorridos de aceptación separados; un PASS de host no los acredita.

El workflow [host-tests.yml](../.github/workflows/host-tests.yml) ejecuta esos
controles desde un checkout vacío, sin credenciales del producto. No hay remoto
Git configurado actualmente: su ejecución en GitHub queda pendiente de subir
el repositorio.

El workflow [applications.yml](../.github/workflows/applications.yml) instala los
locks públicos de móvil y API, verifica contratos/tipos y exporta los bundles.
También comprueba PostgreSQL real en Docker y Terraform con proveedor simulado.
No requiere claves, cuenta GCP ni estado privado del laboratorio.

Las comprobaciones de la restauración anterior conservan sus informes en
`.internal/dev/reports/clean-*-ci*.json`; corresponden a aquella revisión.
GitHub Actions aún no se ha ejecutado en remoto. Los cambios de herramientas
añaden regresiones pequeñas de rutas, instalación, selección y generaciones.
No se publica ni configura un remoto como parte de preparar el entorno local.

Con Google Chrome instalado, se comprueba también el DOM real de la wallet
desconectada:

```sh
./dev npm ci --ignore-scripts
./dev npm run test:browser
```

El lock fija Playwright Core sin descargar otro navegador. Chrome conserva su
sandbox y utiliza un perfil temporal. Se verifican módulos, consultas locales,
botones deshabilitados, ausencia de saldo ficticio, retirada de tokens del DOM
y actualización explícita. Informe y captura quedan en `.internal/dev/reports/`.
Este smoke no demuestra financiación ni aceptación del recorrido conectado.

## Arranques Paged

Los arranques Paged disponibles desde la raíz son:

```sh
./dev platform paged-native-new     # Tres redes locales; entorno nuevo
./dev platform paged-native-reopen  # Mismo estado privado tras captura completa
./dev platform paged-mixed-new      # Tres redes + Uniswap; entorno nuevo separado
./dev platform paged-mixed-reopen   # Mismo entorno Mixed tras captura completa
```

**Aceptados LOCAL con custodia software:** Cold13 completó trece pruebas, los
tres pagos nativos, cambio de 300 unidades demo y tres reaperturas en cuatro
procesos backend. Mixed21 completó Uniswap y los tres pagos nativos, veintiuna
pruebas, cambio de 200 y cuatro pagos de 100 al proveedor. Sus cierres originales
están comprobados; las evidencias y límites figuran en [STATUS.md](../STATUS.md).

Mixed conserva ahora la composición original mediante captura ordenada y
`paged-mixed-reopen`; exige el mismo entorno y una captura autenticada completa.
No migra entornos antiguos sin retención ni resuelve cualquier caída abrupta.
La aceptación conjunta con reinicios y cartera se registra separadamente en
STATUS. Los resultados financieros ejercitan las funciones originales; no
acreditan por sí solos toda la interacción de los asistentes CLI ni el teléfono
físico. El arranque no financia notas automáticamente. Conserva los directorios retenidos y consulta
[la guía de plataforma](../services/api-server/README.md) antes de operar.

## Laboratorios y pruebas adicionales

```sh
./dev test packages/backend/tests/defi/withdrawals/private-vault-exit.test.mjs
./dev test --changed --plan
./dev test --component backend
./dev artifacts
./dev doctor
./dev sources status
./dev sources prepare
./dev lab prepare
./dev lab
```

Las selecciones explícitas escriben `selected-host-tests.json`; la selección
habitual escribe `host-tests.json`. No se sobrescribe el resultado habitual
al ejecutar pruebas de otro dominio. Los informes se guardan en
`.internal/dev/reports`, sin incorporarse a Git.

Los laboratorios con pruebas reales necesitan las dependencias públicas y los
materiales de restauración descritos en [EVM-LAB.md](EVM-LAB.md). Crean génesis,
identidades y claves sintéticas nuevos. El arranque desconectado de la wallet
no acredita fondos ni habilita automáticamente esas operaciones.

Los consumidores con rutas y hashes históricos usan `./dev legacy node …`
o `./dev legacy test …`. Los comandos `lab` preparan su compatibilidad de forma
explícita. [SOURCE-GENERATIONS.md](SOURCE-GENERATIONS.md) explica la captura de
fuentes, la reutilización de artefactos y la diferencia entre preparar y publicar.

## Commits

Un cambio funcional, su regresión y su documentación relevante forman una
unidad. Usa títulos que identifiquen el componente y el comportamiento, con
un cuerpo que explique el problema, la solución, la validación y su alcance.
El historial de importación separa los componentes originales; las correcciones
y las nuevas aplicaciones se añaden en commits propios.
