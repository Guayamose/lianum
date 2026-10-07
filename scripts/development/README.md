# Herramientas de desarrollo

Los comandos cotidianos se ejecutan desde la raíz:

```bash
./dev start
./dev check
./dev test
./dev test apps/wallet/tests/client/ui.test.mjs
./dev node packages/backend/src/ruta.mjs
./dev doctor
./dev evidence
./dev artifacts
```

El archivo de ejemplo `ruta.mjs` debe sustituirse por un módulo existente.
Node 24.19.0 se toma de `.internal/dev/toolchains/`; los comandos no cambian
el Node global. `./dev legacy-node` conserva Node 24.14.0 para locks antiguos.
También están disponibles Noir 1.0.0-beta.25, Barretenberg 5.2.0, Solidity
0.8.37, Foundry 1.8.4, Bitcoin Core 31.1 y Agave 2.3.13.

`workspace.py` prepara archivos físicos en `.internal/runtime/` desde las
reglas de `scripts/layout.json`. Traduce los imports relativos del código
editable a las rutas del recorrido original. El resto de las rutas y datos
de pinning permanece intacto. No utiliza enlaces ni hardlinks. Los comandos
que ejecutan el producto preparan esa copia antes de arrancarlo. Se deben
reiniciar los procesos para cargar cambios.

`check` verifica el archivo original y la sincronización del código, compila
ABI/tipos de los contratos y comprueba Noir y el HTTP de la wallet.
`test` ejecuta doce archivos de pruebas de host, incluidas las regresiones de
reconciliación terminal, o las rutas indicadas. Conserva la selección habitual
en `.internal/dev/reports/host-tests.*` y las selecciones particulares en
`selected-host-tests.*`, para no sustituir un resultado completo por otro de
alcance distinto. Los mocks y expectativas desactualizados están corregidos.
`doctor` distingue herramientas, integridad histórica,
resultados de pruebas y bloqueos de producto. `evidence` lee los originales
CI51, CO42 e I84.

`doctor` verifica las fuentes originales en el archivo inmutable y la
sincronización del código editable por separado. Editar el producto no altera
la entrega archivada. Las comprobaciones de pines de cada release y artefacto
siguen vigentes; un cambio funcional puede requerir una release de desarrollo
revisada. `artifacts` inventaría los dos originales que faltan a las pruebas
históricas de encoding, sin generarlos ni omitir esas pruebas.

## Restaurar otra copia

Para pruebas de host y los nuevos proyectos móvil/API basta el bootstrap
público de [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md). La restauración
completa que sigue requiere Linux/WSL y los respaldos públicos originales.
Un `npm install` en la raíz no sustituye esa restauración.

```bash
./dev build
./dev setup
./dev import '/ruta/al/respaldo-publico.zip'
./dev restore-package '/ruta/al/paquete-publico/payload'
./dev canonical
./dev evidence
./dev doctor
```

`setup` prepara las herramientas oficiales y los paquetes fijados. La
restauración de algunos objetos necesita el respaldo original; consulta sus
informes antes de dar el entorno por completo. Las recetas y el material
recuperado se conservan en `archive/restoration/recipes/`.

`canonical` conserva la ruta física fija que necesita el lector I84:
`/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655`.
Debe existir con propiedad del usuario. Esta ruta pública es independiente
del código que se desarrolla y no reproduce la identidad del laboratorio
privado perdido. Los runtimes Solana personalizado y Tron V3 quedan
inactivos hasta que un flujo autorizado los utilice. El gate canónico de
Tron sigue cerrado. Solana ya tiene una aceptación nueva de ingreso/solver;
el alcance y los pendientes se registran en
[LOCAL-ACCEPTANCE.md](../../packages/backend/docs/LOCAL-ACCEPTANCE.md).

La explicación histórica completa de la restauración está en
`archive/restoration/ENVIRONMENT.md`; sus comandos y rutas anteriores se
interpretan mediante `archive/delivery/original-paths.json` y
`scripts/layout.json`.
