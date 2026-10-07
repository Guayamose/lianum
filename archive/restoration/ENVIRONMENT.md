# Entorno local de desarrollo de Lianum

El entorno público está restaurado y comprobado en Linux x86_64 / WSL2.
Permite abrir la wallet desconectada, compilar los contratos, trabajar con las
herramientas criptográficas y leer las evidencias originales CI51, CO42 e I84.
El antiguo laboratorio privado no se puede recuperar desde respaldos públicos.

Los 1.684 archivos de `project/` recogidos en `CLOSED1684-FREEZE.json` conservan
sus bytes y permisos. Las adiciones son herramientas de desarrollo y
dependencias públicas. `STATUS.md`, los manifiestos de entrega y las evidencias
históricas conservan su contenido original; describen la entrega anterior a
esta preparación. Los informes actuales están en `.dev/reports/`.

## Empezar a trabajar

Desde `lianum-project/`:

```bash
./development/dev doctor
./development/dev smoke
./development/dev verify-restored
./development/dev wallet
```

El último comando imprime la dirección `http://127.0.0.1:<puerto>` que debes
abrir en el navegador. El puerto se asigna al arrancar. La aplicación muestra
`DISCONNECTED` hasta que exista una sesión original válida. Detén el servidor
con Ctrl+C. El arranque no crea una wallet, saldo ni sesión nativa.

El lanzador utiliza Node 24.19.0, la versión exigida por la evidencia original,
sin cambiar el Node predeterminado del equipo. Node 24.14.0 permanece disponible
para los locks históricos mediante `./development/dev legacy-node`. Para
ejecutar otros scripts con la versión del recorrido actual:

```bash
./development/dev node ruta/al/script.mjs
./development/dev npm --version
./development/dev test
```

`test` ejecuta una selección de nueve archivos de pruebas originales de UI,
API y utilidades PAEG. Guarda el resultado y devuelve un código distinto de
cero cuando hay fallos. Para elegir otros archivos, pasa sus rutas relativas a
`project/omnichain-flat-profile/flat-wallet/` después de `test`.

## Herramientas instaladas

| Herramienta | Versión / ubicación |
| --- | --- |
| Node | 24.19.0 para el recorrido actual; 24.14.0 para los locks históricos, ambos en `.dev/toolchains/` |
| npm | Incluido en la distribución verificada de Node |
| Noir WASM | 1.0.0-beta.25, lock y pines originales |
| Barretenberg JS/WASM | 5.2.0, lock y pines originales |
| Solidity JS y binario Linux | 0.8.37, commit `f401782d` |
| Foundry / Anvil | 1.8.4 |
| Bitcoin Core / CLI | 31.1 |
| Solana CLI / genesis / Agave oficial | 2.3.13, hashes originales |
| Solana personalizado | Candidato 2.3.13 del 20261005, pin original `a159dd…` |
| Java 8 / Tron V3 | JDK 8u504-b01, JAR offline y dos clases del driver, originales verificados |
| CRS público BN254 | G1 de 64 MiB y G2 de 128 bytes, hashes originales |

Los binarios nativos están en
`project/omnichain-product/.local/linux-runtimes/`, en las rutas que espera el
código. Las dependencias npm y el CRS se han materializado en sus rutas
originales. Las descargas y objetos recuperados se conservan en `.dev/`.

La instalación npm utiliza los locks originales, configuración y caché
locales, y scripts de instalación deshabilitados. No instala las dependencias
opcionales del lock de pruebas. Verifica los 12 paquetes y siete archivos WASM
del inventario original antes de materializarlos.

## Comprobaciones realizadas

- Integridad de los 1.684 archivos congelados: correcta.
- Compilación de ABI y comprobación de tipos de 42 archivos de contratos
  Solidity: correcta. No genera bytecode ni valida despliegues. El snapshot
  histórico `ops/fixtures/native-value-pretrim-v3.sol` queda fuera porque sus
  imports relativos corresponden a su antigua ubicación.
- Compilación de un circuito aritmético de diagnóstico con Noir y estadísticas
  con Barretenberg WASM: correcta. No reconstruye pruebas o claves históricas.
- HTML y API de la wallet real en loopback, desconectada: correctos; el servidor
  de comprobación se cierra al terminar.
- Los cuatro lectores públicos pasan: preparación CI51, programa CI51,
  programa CO42 y artefactos I84. Comprueban datos y procedencia originales;
  no generan pruebas ni otorgan permisos de ejecución.
- Binarios personalizados: versiones de Solana y Java 8 comprobadas, sin
  iniciar nodos. Los modos y los dos enlaces internos del JDK están verificados.
- Pruebas originales seleccionadas con Node 24.19.0: 157 resultados correctos
  y dos fallos de un total de 159 resultados reportados. El archivo de pruebas
  del servidor falla al cargar un módulo simulado; otro caso espera una lista de exportaciones anterior a
  `submitWrappedWithdrawalResume`. Los casos del archivo que falla al cargar
  no llegan a ejecutarse. Los originales permanecen intactos.

Informes: `readiness.json`, `smoke.json`, `host-tests.json`, `host-tests.log`,
`dependency-package.json`, `canonical-root.json` y `restored-readers.json`
en `.dev/reports/`. `doctor` comprueba herramientas e integridad y muestra por
separado los resultados de pruebas y los bloqueos. Su código de salida indica
si las herramientas básicas y fuentes están verificadas; un código cero no
certifica el laboratorio completo. `smoke` y `test` devuelven sus propios fallos.

## Restauración del paquete de originales

Las 17 partes del paquete se reconstruyeron con su script original, después
de extraer únicamente el ZIP 00. El instalador verificó los hashes del archivo
combinado y de sus 4.521 archivos. El payload conservado está en
`../paquete de restauracion/lianum-publico/payload/`.

Se conservaron los 4.358 archivos de dependencias en
`rebuild-recipes/dependencies/` y se añadieron 2.575 archivos ausentes al árbol
actual. Las 711 rutas pendientes de las recetas están recuperadas: quedan cero
pendientes y cero conflictos en ese inventario. Las 1.862 referencias internas
de `private-external-v1` coinciden con sus hashes originales.

Las 18 copias históricas que difieren de fuentes actuales se conservan fuera
del árbol de ejecución. Los siete originales históricos irrecuperables
corresponden a versiones sustituidas; la evaluación del paquete confirma que
el código actual no requiere esos hashes. Un archivo `active.lock` dentro de
un recibo histórico de fallo se conservó únicamente en el archivo de respaldo.

Solana se colocó en su ruta de candidato exacta. Tron V3 se preparó bajo
`project/omnichain-product/.local/owned-tron-native-value-v1/`, con JDK, JAR y
clases verificados. Las generaciones Tron V5/V6 y toda la procedencia siguen
separadas en el payload. La constante canónica `OWNED_TRON_RUNTIME_RELEASE`
permanece en `null`; disponer de los archivos no activa ese runtime.

El árbol público de I84 está en su ruta literal
`/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655`, con 8.669
archivos verificados, incluidas las 1.684 fuentes actuales. Su aserción no se
ha modificado. Ese árbol contiene fuentes y dependencias públicas, sin nodos,
claves privadas ni el estado vivo antiguo.

## Para las siguientes pruebas nativas

Debe crearse un laboratorio nuevo con claves de prueba nuevas, directorios
vacíos, nodos locales y activos ficticios, conforme a las entradas del proyecto.
Las autorizaciones y recibos históricos no autorizan esa nueva ejecución.
No existe un arranque global certificado que restituya el laboratorio perdido.
Tron requiere además resolver y revisar su activación canónica. Los dos
fallos de pruebas originales también siguen pendientes de trabajo de código.

La preparación actual no ha iniciado nodos, generado nuevas pruebas ni cambiado
los permisos de ejecución. Esto no impide trabajar en código, UI, compilación,
pruebas de host y lectura de evidencias públicas.

## Incorporar respaldos públicos

Para recuperar archivos ya inventariados desde ZIPs o directorios:

```bash
./development/dev import '/ruta/al/paquete-publico.zip'
./development/dev doctor
```

El importador calcula hashes antes de escribir y conserva únicamente los
archivos que coinciden con el inventario público original. No extrae rutas del
ZIP, ejecuta archivos ni sobrescribe archivos existentes con otros bytes.
Para repetir la integración de este paquete verificado:

```bash
./development/dev restore-package '../paquete de restauracion/lianum-publico/payload'
./development/dev canonical
./development/dev verify-restored
```

`canonical` copia únicamente fuentes y dependencias públicas inventariadas en
la ruta fija de I84. Rechaza enlaces, archivos inesperados y bytes en conflicto.
La carpeta de destino debe existir con permisos de escritura o tener un padre
que permita crearla. Los nodos y estados privados no forman parte de esa copia.

Para repetir la preparación tras importar los respaldos necesarios:

```bash
./development/dev setup
```

También admite pasos: `public`, `node`, `proof-node`, `packages`, `crs`, `native`, `solana`. La
reinstalación necesita red para npm y para las descargas aún no almacenadas.
La base se ha comprobado con Python 3.12 y Bash. No mezcles árboles históricos con las
fuentes actuales para resolver dependencias ausentes.
